"""Orquestación de la conversión: original → normalizados/{archivoId}/ (contratos.md §2, §4, §5)."""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, Libro, NodoToc
from .desde_docx import convertir_doc, convertir_docx
from .desde_epub import convertir_epub
from .desde_pdf import convertir_pdf
from .desde_txt import convertir_txt
from .epub_salida import escribir_epub, href_capitulo, href_toc, toc_efectivo
from .frases import contar_palabras, envolver_capitulo
from .portada import a_jpeg

log = logging.getLogger(__name__)

VERSION_FORMATO = 1
VERSION_TEXTO = 1
PALABRAS_POR_MINUTO = 150


@dataclass
class ResultadoConversion:
    metadatos: dict
    n_capitulos: int
    n_palabras: int
    minutos_estimados: int
    tiene_portada: bool
    total_frases: int


def detectar_formato(ruta: Path) -> str:
    """EPUB | PDF | DOCX | DOC | TXT, por firma y luego por extensión."""
    with open(ruta, "rb") as f:
        cabecera = f.read(64)
    ext = ruta.suffix.lower().lstrip(".")
    if cabecera.startswith(b"%PDF") or b"%PDF-" in cabecera[:1024]:
        return "PDF"
    if cabecera.startswith(b"PK"):
        if b"mimetypeapplication/epub+zip" in cabecera or ext == "epub":
            return "EPUB"
        return "DOCX" if ext != "epub" else "EPUB"
    if cabecera.startswith(b"\xd0\xcf\x11\xe0"):
        return "DOC"
    if cabecera.startswith(b"{\\rtf"):
        raise ErrorDefinitivo(Msj.RTF_PENDIENTE)
    if ext in ("txt", "text", "md", ""):
        return "TXT"
    if ext in ("epub", "pdf", "docx", "doc"):
        return ext.upper()
    raise ErrorDefinitivo(Msj.FORMATO_NO_SOPORTADO, extension=ext)


def extraer(ruta: Path) -> Libro:
    formato = detectar_formato(ruta)
    log.info("Convirtiendo %s como %s", ruta.name, formato)
    return {
        "EPUB": convertir_epub,
        "PDF": convertir_pdf,
        "DOCX": convertir_docx,
        "DOC": convertir_doc,
        "TXT": convertir_txt,
    }[formato](ruta)


def buscar_original(dir_original: Path) -> Path:
    if not dir_original.is_dir():
        raise ErrorDefinitivo(Msj.ORIGINAL_NO_ENCONTRADO)
    archivos = sorted(p for p in dir_original.iterdir() if p.is_file() and not p.name.startswith("."))
    if not archivos:
        raise ErrorDefinitivo(Msj.ORIGINAL_NO_ENCONTRADO)
    return archivos[0]


def _toc_json(nodos: list[NodoToc]) -> list[dict]:
    return [{"titulo": n.titulo, "href": href_toc(n), "hijos": _toc_json(n.hijos)} for n in nodos]


def convertir(origen: Path, destino: Path, archivo_id: str) -> ResultadoConversion:
    """Convierte `origen` y deja el resultado en `destino` (se reemplaza completo, de forma atómica)."""
    libro = extraer(origen)
    md = libro.metadatos
    md.setdefault("autores", [])
    md["idioma"] = md.get("idioma") or "es"

    temporal = destino.with_name(destino.name + ".tmp")
    if temporal.exists():
        shutil.rmtree(temporal)
    (temporal / "frases").mkdir(parents=True)

    capitulos_json = []
    total_frases = 0
    total_palabras = 0
    for i, cap in enumerate(libro.capitulos):
        frases = envolver_capitulo(cap.cuerpo, i)
        palabras = sum(contar_palabras(f.texto) for f in frases)
        total_frases += len(frases)
        total_palabras += palabras
        capitulos_json.append(
            {
                "indice": i,
                "titulo": cap.titulo,
                "href": href_capitulo(i),
                "nivel": cap.nivel,
                "frases": len(frases),
                "palabras": palabras,
                "primeraFrase": frases[0].id if frases else None,
                "ultimaFrase": frases[-1].id if frases else None,
            }
        )
        with open(temporal / "frases" / f"cap-{i:03d}.json", "w", encoding="utf-8") as f:
            json.dump({"capitulo": i, "frases": [fr.a_json() for fr in frases]}, f, ensure_ascii=False)

    if total_frases == 0:
        shutil.rmtree(temporal, ignore_errors=True)
        raise ErrorDefinitivo(Msj.SIN_TEXTO)

    portada = a_jpeg(libro.portada)
    if portada:
        (temporal / "portada.jpg").write_bytes(portada)
    escribir_epub(libro, temporal / "libro.epub", archivo_id, portada)

    minutos = math.ceil(total_palabras / PALABRAS_POR_MINUTO) if total_palabras else 0
    metadatos = {k: md.get(k) for k in ("titulo", "autores", "idioma", "isbn", "editorial", "anio", "sinopsis")}
    estructura = {
        "versionFormato": VERSION_FORMATO,
        "versionTexto": VERSION_TEXTO,
        **metadatos,
        "tienePortada": portada is not None,
        "capitulos": capitulos_json,
        "toc": _toc_json(toc_efectivo(libro)),
        "totalFrases": total_frases,
        "totalPalabras": total_palabras,
        "minutosEstimados": minutos,
    }
    with open(temporal / "estructura.json", "w", encoding="utf-8") as f:
        json.dump(estructura, f, ensure_ascii=False, indent=1)

    # reemplazo atómico del directorio
    if destino.exists():
        viejo = destino.with_name(destino.name + ".viejo")
        if viejo.exists():
            shutil.rmtree(viejo)
        os.replace(destino, viejo)
        os.replace(temporal, destino)
        shutil.rmtree(viejo, ignore_errors=True)
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temporal, destino)

    return ResultadoConversion(
        metadatos, len(libro.capitulos), total_palabras, minutos, portada is not None, total_frases
    )

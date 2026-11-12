"""Orquestación de la conversión: original → normalizados/{archivoId}/ (contratos.md §2, §4, §5)."""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, Libro, NodoToc, TrabajoCancelado
from .desde_codigo import convertir_codigo
from .desde_docx import convertir_doc, convertir_docx
from .desde_epub import convertir_epub
from .desde_html import convertir_html, convertir_markdown
from .desde_pdf import convertir_pdf
from .desde_pptx import convertir_pptx
from .desde_txt import convertir_txt
from .epub_salida import escribir_epub, href_capitulo, href_toc, toc_efectivo
from .formatos import EXTENSIONES_TEXTO, HOJAS, tipo_ole, tipo_zip
from .frases import contar_palabras, envolver_capitulo
from .hojas import leer_hoja_de_calculo
from .idioma import detectar_idioma, muestra
from .normalizador import normalizar_visual
from .partir import partir_capitulos_largos
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


_BINARIOS_POR_EXTENSION = {"epub", "pdf", "docx", "doc", "rtf", "odt", "pptx", "xlsx", "xls", "ods"}


def detectar_formato(ruta: Path) -> str:
    """EPUB | PDF | DOCX | DOC | TXT y (v1.6) MD | HTML | RTF | ODT | PPTX | XLSX | XLS | ODS | CSV | JSON | YAML | LOG.

    Por contenido primero (firma; los ZIP por sus partes; los OLE por sus flujos) y, para el texto, por la extensión.
    Un ZIP u OLE que no se reconoce por dentro conserva lo de siempre: la extensión decide (y el conversor dirá si
    está dañado).
    """
    with open(ruta, "rb") as f:
        cabecera = f.read(64)
    ext = ruta.suffix.lower().lstrip(".")
    if cabecera.startswith(b"%PDF") or b"%PDF-" in cabecera[:1024]:
        return "PDF"
    if cabecera.startswith(b"PK"):
        por_dentro = tipo_zip(ruta)
        if por_dentro:
            return por_dentro
        if b"mimetypeapplication/epub+zip" in cabecera or ext == "epub":
            return "EPUB"
        return ext.upper() if ext in ("xlsx", "ods", "odt", "pptx") else "DOCX"
    if cabecera.startswith(b"\xd0\xcf\x11\xe0"):
        return tipo_ole(ruta) or ("XLS" if ext == "xls" else "DOC")
    if cabecera.startswith(b"{\\rtf"):
        return "RTF"
    if ext in EXTENSIONES_TEXTO:
        return EXTENSIONES_TEXTO[ext]
    if ext in _BINARIOS_POR_EXTENSION:
        return ext.upper()
    raise ErrorDefinitivo(Msj.FORMATO_NO_SOPORTADO, extension=ext)


def extraer(ruta: Path, formato: str | None = None) -> Libro:
    formato = formato or detectar_formato(ruta)
    log.info("Convirtiendo %s como %s", ruta.name, formato)
    if formato in ("RTF", "ODT"):
        return convertir_doc(ruta, formato.lower())
    if formato in ("JSON", "YAML", "LOG"):
        return convertir_codigo(ruta, formato)
    convertidores: dict[str, Callable[[Path], Libro]] = {
        "EPUB": convertir_epub,
        "PDF": convertir_pdf,
        "DOCX": convertir_docx,
        "DOC": convertir_doc,
        "TXT": convertir_txt,
        "MD": convertir_markdown,
        "HTML": convertir_html,
        "PPTX": convertir_pptx,
    }
    if formato not in convertidores:
        raise ErrorDefinitivo(Msj.FORMATO_NO_SOPORTADO, extension=ruta.suffix.lower().lstrip("."))
    return convertidores[formato](ruta)


def buscar_original(dir_original: Path) -> Path:
    if not dir_original.is_dir():
        raise ErrorDefinitivo(Msj.ORIGINAL_NO_ENCONTRADO)
    archivos = sorted(p for p in dir_original.iterdir() if p.is_file() and not p.name.startswith("."))
    if not archivos:
        raise ErrorDefinitivo(Msj.ORIGINAL_NO_ENCONTRADO)
    return archivos[0]


def _toc_json(nodos: list[NodoToc]) -> list[dict]:
    return [{"titulo": n.titulo, "href": href_toc(n), "hijos": _toc_json(n.hijos)} for n in nodos]


def _limpiar_textos(libro: Libro) -> None:
    """Metadatos, títulos de capítulo e índice sin caracteres de control (no caben en XML ni en la BD, QA DA-03)."""
    md = libro.metadatos
    for k in ("titulo", "editorial", "sinopsis", "isbn", "idioma"):
        if isinstance(md.get(k), str):
            md[k] = normalizar_visual(md[k]).strip() or None
    md["autores"] = [a for a in (normalizar_visual(str(x)).strip() for x in md.get("autores") or []) if a]
    md["materias"] = [m for m in (normalizar_visual(str(x)).strip() for x in md.get("materias") or []) if m]
    for cap in libro.capitulos:
        cap.titulo = normalizar_visual(cap.titulo)

    def nodos(lista: list[NodoToc]) -> None:
        for n in lista:
            n.titulo = normalizar_visual(n.titulo)
            nodos(n.hijos)

    nodos(libro.toc)


def convertir(
    origen: Path, destino: Path, archivo_id: str, seguir: Callable[[], bool] | None = None
) -> ResultadoConversion:
    """Convierte `origen` y deja el resultado en `destino` (se reemplaza completo, de forma atómica).

    `seguir()` se consulta antes de publicar el resultado: si devuelve False (por defecto, si el original ya no
    existe porque el libro se retiró, QA DA-14) se borra lo escrito y se lanza `TrabajoCancelado`.
    """
    seguir = seguir or origen.exists
    formato = detectar_formato(origen)
    if formato in HOJAS:
        return _convertir_hoja(origen, destino, formato, seguir)
    libro = extraer(origen)
    _limpiar_textos(libro)
    partir_capitulos_largos(libro)
    md = libro.metadatos
    # QA NU-02: el idioma de los metadatos manda si existe; si no, se detecta sobre una muestra del texto, y si
    # no hay certeza se deja vacío (biblioteca traduce entonces con origen "auto"). Antes se inventaba "es".
    if not md.get("idioma"):
        textos = (" ".join(str(t) for t in c.cuerpo.itertext()) for c in libro.capitulos)
        md["idioma"] = detectar_idioma(muestra(textos))

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
    claves = ("titulo", "autores", "idioma", "isbn", "editorial", "anio", "sinopsis", "materias")
    metadatos = {k: md.get(k) for k in claves}
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

    _publicar(temporal, destino, seguir)
    return ResultadoConversion(
        metadatos, len(libro.capitulos), total_palabras, minutos, portada is not None, total_frases
    )


def _publicar(temporal: Path, destino: Path, seguir: Callable[[], bool]) -> None:
    """Reemplazo atómico de `destino` por `temporal`, comprobando `seguir()` antes y después (QA DA-14)."""
    if not seguir():
        shutil.rmtree(temporal, ignore_errors=True)
        raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
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
    if not seguir():  # retirado justo mientras se publicaba: no se deja nada huérfano
        shutil.rmtree(destino, ignore_errors=True)
        raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)


def _convertir_hoja(origen: Path, destino: Path, formato: str, seguir: Callable[[], bool]) -> ResultadoConversion:
    """(v1.6) Hoja de cálculo → hoja.json + estructura.json (una entrada por hoja), sin EPUB ni frases."""
    log.info("Convirtiendo %s como hoja de cálculo %s", origen.name, formato)
    hoja, leidos = leer_hoja_de_calculo(origen, formato)
    metadatos: dict = {
        "titulo": leidos.get("titulo"),
        "autores": leidos.get("autores") or [],
        "idioma": None,
        "isbn": None,
        "editorial": None,
        "anio": None,
        "sinopsis": None,
        "materias": [],
    }
    if isinstance(metadatos["titulo"], str):
        metadatos["titulo"] = normalizar_visual(metadatos["titulo"]).strip() or None
    metadatos["autores"] = [a for a in (normalizar_visual(str(x)).strip() for x in metadatos["autores"]) if a]
    temporal = destino.with_name(destino.name + ".tmp")
    if temporal.exists():
        shutil.rmtree(temporal)
    temporal.mkdir(parents=True)
    with open(temporal / "hoja.json", "w", encoding="utf-8") as f:
        json.dump(hoja, f, ensure_ascii=False, separators=(",", ":"))
    capitulos = [
        {
            "indice": i,
            "titulo": h["nombre"],
            "href": None,
            "nivel": 1,
            "frases": 0,
            "palabras": 0,
            "primeraFrase": None,
            "ultimaFrase": None,
        }
        for i, h in enumerate(hoja["hojas"])
    ]
    estructura = {
        "versionFormato": VERSION_FORMATO,
        "versionTexto": VERSION_TEXTO,
        **metadatos,
        "tienePortada": False,
        "capitulos": capitulos,
        "toc": [],
        "totalFrases": 0,
        "totalPalabras": 0,
        "minutosEstimados": 0,
    }
    with open(temporal / "estructura.json", "w", encoding="utf-8") as f:
        json.dump(estructura, f, ensure_ascii=False, indent=1)
    _publicar(temporal, destino, seguir)
    return ResultadoConversion(metadatos, len(capitulos), 0, 0, False, 0)

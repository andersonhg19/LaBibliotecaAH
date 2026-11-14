"""Trabajo RECLASIFICAR_ESTRUCTURA (contratos 0.4.0, C2): añade a un libro YA convertido la clasificación de sus
capítulos (tipo, región, número, enVoz, palabrasVoz, origenTipo) sin reconvertirlo.

Regla de oro: NUNCA cambia cuántos capítulos hay, ni sus índices, títulos, href o palabras (el progreso, las notas y
el audio ya generado dependen de ellos). Solo añade campos y `"version": 2`.

- Las pistas de tipo (epub:type, landmarks, guide, linear) salen del ORIGINAL si es un EPUB: se reparte en capítulos
  con el algoritmo de 0.3.3 (`pistas_epub`) y, si sale el mismo número de capítulos con los mismos títulos, cada
  capítulo hereda las pistas del suyo. Si no casan (un libro convertido con un taller más viejo), se clasifica solo
  por título y posición.
- `palabrasVoz` sale de `frases/cap-NNN.json` (lo que de verdad lee la voz).
- Idempotente: un `estructura.json` que ya tiene `"version": 2` no se toca.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

from ..dominio.modelo import Capitulo, ErrorDeTaller
from .estructura import VERSION_ESTRUCTURA, Clasificacion, Entrada, clasificar
from .frases import contar_palabras
from .normalizador import normalizar_visual

log = logging.getLogger(__name__)

_HREF = re.compile(r"^cap-(\d{3})\.xhtml")


def _clave_titulo(t: str) -> str:
    return re.sub(r"\s+", " ", normalizar_visual(t or "")).strip().casefold()


def _palabras_voz(dir_normalizado: Path, indice: int) -> int:
    try:
        datos = json.loads((dir_normalizado / "frases" / f"cap-{indice:03d}.json").read_text(encoding="utf-8"))
        return sum(contar_palabras(f.get("voz") or "") for f in datos.get("frases", []))
    except (OSError, ValueError, AttributeError):
        return 0


def _padres(toc: list[dict[str, Any]]) -> set[int]:
    salida: set[int] = set()

    def indice(nodo: dict[str, Any]) -> int | None:
        m = _HREF.match(str(nodo.get("href") or ""))
        return int(m.group(1)) if m else None

    def recorrer(nodos: list[dict[str, Any]]) -> None:
        for n in nodos:
            yo = indice(n)
            hijos = n.get("hijos") or []
            if yo is not None and any(indice(h) not in (None, yo) for h in hijos):
                salida.add(yo)
            recorrer(hijos)

    recorrer(toc if isinstance(toc, list) else [])
    return salida


def _pistas(original: Path | None, titulos: list[str]) -> list[Capitulo] | None:
    """Capítulos del original con sus pistas de tipo, solo si casan uno a uno con los del libro convertido."""
    if original is None:
        return None
    from .convertir import detectar_formato
    from .desde_epub import pistas_epub
    from .partir import partir_capitulos_largos

    try:
        if detectar_formato(original) != "EPUB":
            return None
        libro = pistas_epub(original)
        partir_capitulos_largos(libro)
    except ErrorDeTaller as e:
        log.warning("Reclasificación sin pistas del original: %s", e)
        return None
    if len(libro.capitulos) != len(titulos) or any(
        _clave_titulo(c.titulo) != _clave_titulo(t) for c, t in zip(libro.capitulos, titulos, strict=True)
    ):
        log.warning(
            "Los capítulos del original (%d) no casan con los convertidos (%d): se clasifica por título y posición",
            len(libro.capitulos),
            len(titulos),
        )
        return None
    return libro.capitulos


def reclasificar(dir_normalizado: Path, original: Path | None) -> str:
    """Reescribe `estructura.json` con la clasificación. Devuelve "hecho", "ya" (tenía versión 2), "sin-estructura"
    o "cambiado" (alguien lo reescribió mientras tanto: se deja como esté)."""
    ruta = dir_normalizado / "estructura.json"
    try:
        crudo = ruta.read_bytes()
    except OSError:
        return "sin-estructura"
    datos = json.loads(crudo)
    if datos.get("version") == VERSION_ESTRUCTURA:
        return "ya"
    capitulos: list[dict[str, Any]] = datos.get("capitulos") or []
    es_hoja = (dir_normalizado / "hoja.json").exists() and all(c.get("href") is None for c in capitulos)
    if es_hoja:
        clasificacion = [Clasificacion("otro", "cuerpo", None, False, 0, "posicion") for _ in capitulos]
    else:
        titulos = [str(c.get("titulo") or "") for c in capitulos]
        pistas = _pistas(original, titulos)
        padres = _padres(datos.get("toc") or [])
        entradas = []
        for k, c in enumerate(capitulos):
            p = pistas[k] if pistas else None
            entradas.append(
                Entrada(
                    titulo=titulos[k],
                    palabras=int(c.get("palabras") or 0),
                    palabras_voz=_palabras_voz(dir_normalizado, int(c.get("indice", k))),
                    tipo=p.tipo if p else None,
                    origen=p.origen_tipo if p else None,
                    lineal=p.lineal if p else True,
                    region=p.region if p else None,
                    con_hijos=k in padres,
                )
            )
        clasificacion = clasificar(entradas)
    for c, cl in zip(capitulos, clasificacion, strict=True):
        for clave, valor in cl.a_json().items():
            c.setdefault(clave, valor)  # nunca pisa lo que ya hay (índice, título, href, palabras…)
    datos["version"] = VERSION_ESTRUCTURA
    try:
        if ruta.read_bytes() != crudo:
            log.warning("estructura.json cambió mientras se reclasificaba (¿reconversión?): no se toca")
            return "cambiado"
    except OSError:
        return "sin-estructura"
    tmp = ruta.with_name(f"estructura.json.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, ruta)
    log.info(
        "Estructura reclasificada: %d capítulos (%s)",
        len(capitulos),
        ", ".join(f"{cl.tipo}{'#' + str(cl.numero) if cl.numero is not None else ''}" for cl in clasificacion[:40]),
    )
    return "hecho"

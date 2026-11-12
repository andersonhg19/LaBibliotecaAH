"""(v1.4) Releer SOLO las materias de un original ya convertido (relleno de géneros de libros viejos).

No convierte nada ni toca el EPUB normalizado: abre el original, lee sus metadatos y devuelve las materias limpias
(EPUB `dc:subject`; PDF y DOCX, sus palabras clave). DOC y TXT no tienen materias legibles: lista vacía.
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..dominio.modelo import ErrorDeTaller
from .convertir import detectar_formato
from .desde_docx import materias_docx
from .desde_epub import materias_epub
from .desde_pdf import materias_pdf

log = logging.getLogger(__name__)


def leer_materias(ruta: Path) -> list[str]:
    """Materias del original. Un archivo que ya no se puede leer da lista vacía (queda en el log), nunca un error:
    el relleno es un extra y no debe dejar trabajos en ERROR ni reintentar sin fin."""
    try:
        formato = detectar_formato(ruta)
        if formato == "EPUB":
            return materias_epub(ruta)
        if formato == "PDF":
            return materias_pdf(ruta)
        if formato == "DOCX":
            return materias_docx(ruta)
    except ErrorDeTaller as e:
        log.warning("No se pudieron releer las materias de %s: %s", ruta.name, e)
    except Exception:
        log.warning("No se pudieron releer las materias de %s", ruta.name, exc_info=True)
    return []

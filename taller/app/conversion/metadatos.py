"""Limpieza de metadatos extraídos (título y autores) comunes a PDF y Word."""

from __future__ import annotations

import re

# Títulos que ponen los programas y no el autor (QA BI-17: los .doc de LibreOffice quedaban "Word Document")
_TITULO_GENERICO = re.compile(
    r"^(?:microsoft word\b.*|word document|documento de (?:microsoft )?word|(?:documento|document|doc)\s*\d*"
    r"|untitled.*|sin t[ií]tulo.*|documento sin t[ií]tulo|t[ií]tulo|title|new document|nuevo documento"
    r"|.*\.(?:pdf|docx?|odt|rtf|txt))$",
    re.IGNORECASE,
)


def titulo_util(titulo: str | None) -> str | None:
    """El título si parece real; None si está vacío o es uno genérico de un programa."""
    t = re.sub(r"\s+", " ", titulo or "").strip()
    if not t or _TITULO_GENERICO.match(t):
        return None
    return t[:300]


def titulo_desde_nombre(nombre: str) -> str | None:
    """Título a partir del nombre de archivo (sin extensión): "el_coronel-no" → "el coronel no"."""
    t = re.sub(r"[_\s]+", " ", nombre).strip(" -.")
    return t[:300] or None


def _invertir(autor: str) -> str:
    """Invierte «García Márquez, Gabriel» → «Gabriel García Márquez» (una sola coma entre apellidos y nombre)."""
    partes = [p.strip() for p in autor.split(",")]
    if len(partes) == 2 and all(partes) and all(1 <= len(p.split()) <= 4 for p in partes):
        return f"{partes[1]} {partes[0]}"
    return autor.strip()


def normalizar_autores(texto: str | None) -> list[str]:
    """Separa autores por ";", " y " o " & "; una coma sola es "Apellido, Nombre" de UNA persona (QA DA-16).

    Varias comas sin punto y coma ("Ana Pérez, Luis Gómez, Marta Ruiz") se toman como lista.
    """
    t = re.sub(r"\s+", " ", texto or "").strip()
    if not t:
        return []
    autores: list[str] = []
    for bloque in re.split(r"\s*;\s*|\s+y\s+|\s+&\s+", t):
        if not bloque:
            continue
        if bloque.count(",") == 1:
            autores.append(_invertir(bloque))
        else:
            autores.extend(a.strip() for a in bloque.split(",") if a.strip())
    return autores[:10]

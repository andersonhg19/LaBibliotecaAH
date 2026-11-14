"""Limpieza de metadatos extraídos (título, autores y materias) comunes a EPUB, PDF y Word."""

from __future__ import annotations

import re
from collections.abc import Iterable

# Títulos que ponen los programas y no el autor (QA BI-17: los .doc de LibreOffice quedaban "Word Document")
_TITULO_GENERICO = re.compile(
    r"^(?:microsoft word\b.*|word document|documento de (?:microsoft )?word|(?:documento|document|doc)\s*\d*"
    r"|untitled.*|sin t[ií]tulo.*|documento sin t[ií]tulo|t[ií]tulo|title|new document|nuevo documento"
    r"|unknown|desconocido|t[ií]tulo desconocido"
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


# (0.4.0, CF-12) autores que pone el programa y no el libro (Calibre: «Unknown»)
_AUTOR_GENERICO = re.compile(r"^(?:unknown|desconocido|autor desconocido|unknown author|n/?a|-+)$", re.IGNORECASE)


def autor_util(autor: str | None) -> str | None:
    """El autor normalizado («Pérez, Ana» → «Ana Pérez») o None si está vacío o es genérico («Unknown»)."""
    a = re.sub(r"\s+", " ", autor or "").strip()
    if not a or _AUTOR_GENERICO.match(a):
        return None
    return _invertir(a) if a.count(",") == 1 else a


# (0.4.0, CF-12) idioma a ISO 639-1: códigos de 3 letras, nombres y variantes regionales («spa», «Castellano», «es-ES»)
_IDIOMAS = {
    "es": ("es", "spa", "esp", "castellano", "español", "espanol", "spanish"),
    "en": ("en", "eng", "inglés", "ingles", "english"),
    "pt": ("pt", "por", "portugués", "portugues", "português", "portuguese"),
    "fr": ("fr", "fra", "fre", "francés", "frances", "français", "french"),
    "it": ("it", "ita", "italiano", "italian"),
    "de": ("de", "deu", "ger", "alemán", "aleman", "deutsch", "german"),
    "ca": ("ca", "cat", "catalán", "catalan", "català"),
    "gl": ("gl", "glg", "gallego", "galego", "galician"),
    "eu": ("eu", "eus", "baq", "euskera", "basque"),
    "la": ("la", "lat", "latín", "latin"),
}
_IDIOMA_DE = {nombre: codigo for codigo, nombres in _IDIOMAS.items() for nombre in nombres}


def normalizar_idioma(idioma: str | None) -> str | None:
    """«spa»/«Castellano»/«es-ES» → «es». Un código que no se conoce se deja en minúscula y sin región."""
    t = re.sub(r"\s+", " ", idioma or "").strip().lower()
    if not t:
        return None
    if t in _IDIOMA_DE:
        return _IDIOMA_DE[t]
    base = re.split(r"[-_ ]", t)[0]
    if base in _IDIOMA_DE:
        return _IDIOMA_DE[base]
    return base[:10] if re.fullmatch(r"[a-z]{2,3}", base) else None


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


# (v1.4) materias: dc:subject del EPUB, palabras clave de PDF/DOCX
MAX_MATERIAS = 30
MAX_LARGO_MATERIA = 100
_SEPARADORES_MATERIA = re.compile(r"\s*[;,/|]\s*")
_BORDES = re.compile(r"^[\s.;:,_\-–—·•\"'«»“”‘’¿¡!?*]+|[\s.;:,_\-–—·•\"'«»“”‘’¿¡!?*]+$")


def reparar_mojibake(texto: str) -> str:
    """«RomÃ¡ntico» (UTF-8 leído como Latin-1/cp1252) → «Romántico». Si no encaja, se deja como estaba."""
    if "Ã" not in texto and "Â" not in texto:
        return texto
    for codificacion in ("cp1252", "latin-1"):
        try:
            return texto.encode(codificacion).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return texto


def limpiar_materias(textos: Iterable[str | None]) -> list[str]:
    """Materias del archivo separadas por «;», «,», «/» o «|», sin espacios de más, sin repetir y acotadas.

    No se normalizan aquí: la tabla de géneros vive en biblioteca-service (una sola, también para lo editado a mano).
    """
    salida: list[str] = []
    vistas: set[str] = set()
    for texto in textos:
        if not texto:
            continue
        for parte in _SEPARADORES_MATERIA.split(reparar_mojibake(str(texto))):
            limpia = _BORDES.sub("", re.sub(r"\s+", " ", parte))
            clave = limpia.casefold()
            if not limpia or len(limpia) > MAX_LARGO_MATERIA or clave in vistas:
                continue
            vistas.add(clave)
            salida.append(limpia)
            if len(salida) >= MAX_MATERIAS:
                return salida
    return salida

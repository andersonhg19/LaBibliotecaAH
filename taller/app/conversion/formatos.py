"""Qué formato es un original: por su contenido (firma, partes del ZIP, flujos OLE) y, para el texto, por la extensión.

Los nombres son los de `formato_original` en biblioteca-service (contratos v1.6). Los ZIP se distinguen por dentro
(EPUB, DOCX, XLSX, PPTX, ODT, ODS) y los OLE (Word 97-2003 / Excel 97-2003) por los nombres de sus flujos, leídos con
un mini lector del directorio CFB (no se descomprime ni se interpreta nada más).
"""

from __future__ import annotations

import struct
import zipfile
from pathlib import Path

HOJAS = frozenset({"XLSX", "XLS", "ODS", "CSV"})
"""Formatos que no se convierten a EPUB: se ven en el visor de hojas (hoja.json)."""

EXTENSIONES_TEXTO = {
    "txt": "TXT",
    "text": "TXT",
    "": "TXT",
    "md": "MD",
    "markdown": "MD",
    "html": "HTML",
    "htm": "HTML",
    "xhtml": "HTML",
    "csv": "CSV",
    "tsv": "CSV",
    "json": "JSON",
    "yaml": "YAML",
    "yml": "YAML",
    "log": "LOG",
}

_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_MIME_ODF = {
    b"application/vnd.oasis.opendocument.text": "ODT",
    b"application/vnd.oasis.opendocument.spreadsheet": "ODS",
}
_FIN_DE_CADENA = 0xFFFFFFFE
_MAX_SECTORES_DIRECTORIO = 256


def tipo_zip(ruta: Path) -> str | None:
    """EPUB | DOCX | XLSX | PPTX | ODT | ODS según las partes del ZIP; None si no se reconoce o no es legible."""
    try:
        with zipfile.ZipFile(ruta) as z:
            nombres = set(z.namelist())
            if "mimetype" in nombres:
                info = z.getinfo("mimetype")
                mime = z.read("mimetype").strip() if info.file_size <= 200 else b""
                if mime == b"application/epub+zip":
                    return "EPUB"
                if mime in _MIME_ODF:
                    return _MIME_ODF[mime]
            if "[Content_Types].xml" in nombres:
                if "word/document.xml" in nombres:
                    return "DOCX"
                if "xl/workbook.xml" in nombres:
                    return "XLSX"
                if "ppt/presentation.xml" in nombres:
                    return "PPTX"
            if "META-INF/container.xml" in nombres:
                return "EPUB"
    except (zipfile.BadZipFile, OSError, KeyError):
        return None
    return None


def flujos_ole(ruta: Path) -> set[str]:
    """Nombres de las entradas del directorio de un archivo OLE/CFB (vacío si no se puede leer)."""
    try:
        with open(ruta, "rb") as f:
            cab = f.read(512)
            if len(cab) < 512 or not cab.startswith(_OLE):
                return set()
            tam_sector = 1 << struct.unpack_from("<H", cab, 0x1E)[0]
            if tam_sector not in (512, 4096):
                return set()
            primer_dir = struct.unpack_from("<I", cab, 0x30)[0]
            difat = [s for s in struct.unpack_from("<109I", cab, 0x4C) if s < _FIN_DE_CADENA]
            por_sector = tam_sector // 4

            def sector(n: int) -> bytes:
                f.seek((n + 1) * tam_sector)
                return f.read(tam_sector)

            fat_cache: dict[int, tuple[int, ...]] = {}

            def siguiente(n: int) -> int:
                idx, pos = divmod(n, por_sector)
                if idx >= len(difat):
                    return _FIN_DE_CADENA
                if idx not in fat_cache:
                    datos = sector(difat[idx])
                    fat_cache[idx] = struct.unpack(f"<{len(datos) // 4}I", datos[: len(datos) // 4 * 4])
                tabla = fat_cache[idx]
                return tabla[pos] if pos < len(tabla) else _FIN_DE_CADENA

            nombres: set[str] = set()
            actual = primer_dir
            for _ in range(_MAX_SECTORES_DIRECTORIO):
                if actual >= _FIN_DE_CADENA:
                    break
                datos = sector(actual)
                for i in range(0, len(datos) - 127, 128):
                    largo = struct.unpack_from("<H", datos, i + 0x40)[0]
                    if 2 <= largo <= 64:
                        nombres.add(datos[i : i + largo - 2].decode("utf-16-le", "replace"))
                actual = siguiente(actual)
            return nombres
    except (OSError, struct.error):
        return set()


def tipo_ole(ruta: Path) -> str | None:
    """DOC (flujo WordDocument) | XLS (Workbook o Book) | None."""
    flujos = flujos_ole(ruta)
    if "WordDocument" in flujos:
        return "DOC"
    if "Workbook" in flujos or "Book" in flujos:
        return "XLS"
    return None

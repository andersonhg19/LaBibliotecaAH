"""Límites de seguridad de la conversión (QA SE-01: zip-bomb y archivos desmesurados).

Se comprueban ANTES de leer nada grande, con los tamaños que declara el propio ZIP (zipfile no entrega más bytes
de los declarados: si el contenido real es mayor falla el CRC). Al superarse un límite la conversión termina con
`ErrorDefinitivo` y un mensaje humano; reintentar no lo arregla.

Además, cada conversión corre en un subproceso con memoria y tiempo acotados (`conversion/aislado.py`).
"""

from __future__ import annotations

import zipfile
from pathlib import Path

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo

MB = 1024 * 1024

# ZIP (EPUB, DOCX)
MAX_ENTRADAS_ZIP = 10_000
MAX_TOTAL_ZIP = 400 * MB  # suma de todo lo descomprimido (imágenes incluidas)
MAX_ENTRADA_ZIP = 64 * MB  # una imagen o recurso
MAX_ENTRADA_TEXTO = 16 * MB  # un XHTML/HTML/XML (un capítulo real ocupa < 5 MB)
MAX_TOTAL_TEXTO = 48 * MB  # todo el texto marcado del libro
MAX_RATIO = 100  # descomprimido / comprimido de una entrada grande (texto normal: 3-10)
MIN_PARA_RATIO = 1 * MB  # entradas pequeñas pueden comprimir mucho sin peligro

# Otros formatos (tamaño del archivo en disco)
MAX_TXT = 32 * MB
MAX_DOC = 64 * MB
MAX_PAGINAS_PDF = 3000

_EXT_TEXTO = (".xhtml", ".html", ".htm", ".xml", ".opf", ".ncx", ".svg", ".css")


def _mb(n: int) -> str:
    return f"{n // MB} MB"


def revisar_zip(z: zipfile.ZipFile) -> None:
    """Rechaza ZIP con demasiadas entradas, tamaños desmesurados o una compresión anómala (zip-bomb)."""
    infos = z.infolist()
    if len(infos) > MAX_ENTRADAS_ZIP:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"tiene más de {MAX_ENTRADAS_ZIP} archivos internos")
    total = 0
    total_texto = 0
    for i in infos:
        tam = i.file_size
        total += tam
        es_texto = i.filename.lower().endswith(_EXT_TEXTO)
        if es_texto:
            total_texto += tam
        if tam >= MIN_PARA_RATIO and tam > MAX_RATIO * max(i.compress_size, 1):
            raise ErrorDefinitivo(Msj.ARCHIVO_SOSPECHOSO)
        if tam > (MAX_ENTRADA_TEXTO if es_texto else MAX_ENTRADA_ZIP):
            maximo = MAX_ENTRADA_TEXTO if es_texto else MAX_ENTRADA_ZIP
            raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"una de sus partes ocupa más de {_mb(maximo)}")
    if total > MAX_TOTAL_ZIP:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"descomprimido ocupa más de {_mb(MAX_TOTAL_ZIP)}")
    if total_texto > MAX_TOTAL_TEXTO:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"su texto ocupa más de {_mb(MAX_TOTAL_TEXTO)}")


def revisar_zip_en_disco(ruta: Path) -> None:
    """`revisar_zip` sobre un archivo (DOCX/ODT). Si no es un ZIP legible no dice nada: lo decide el conversor."""
    try:
        with zipfile.ZipFile(ruta) as z:
            revisar_zip(z)
    except zipfile.BadZipFile:
        return


def revisar_tamano(ruta: Path, maximo: int, que: str) -> None:
    if ruta.stat().st_size > maximo:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"el {que} ocupa más de {_mb(maximo)}")


def revisar_paginas(n: int) -> None:
    if n > MAX_PAGINAS_PDF:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"tiene más de {MAX_PAGINAS_PDF} páginas")


def liberar_limite_memoria() -> None:  # pragma: no cover - corre en el hijo de subprocess (preexec_fn)
    """Programas externos (pandoc, LibreOffice) reservan mucho espacio virtual: se les quita el tope de memoria
    virtual del subproceso de conversión (siguen acotados por su tiempo máximo y por la memoria del contenedor)."""
    try:
        import resource

        _blando, duro = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (duro, duro))
    except (ImportError, ValueError, OSError):
        return

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

# (v1.6) Hojas de cálculo → hoja.json: por encima se recorta con aviso (`recortada` / `recortado`), no es un error
MAX_HOJAS = 50
MAX_FILAS_HOJA = 5_000
MAX_COLUMNAS_HOJA = 200
MAX_CELDAS_HOJAS = 250_000  # celdas con valor en todo el libro
MAX_TEXTO_CELDA = 5_000
MAX_XLS = 64 * MB
MAX_CAMPO_CSV = 1 * MB

_EXT_TEXTO = (".xhtml", ".html", ".htm", ".xml", ".opf", ".ncx", ".svg", ".css")


def _mb(n: int) -> str:
    return f"{n // MB} MB"


_EXT_IMAGEN = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff")


def revisar_zip(z: zipfile.ZipFile, omitir_imagenes: bool = False) -> frozenset[str]:
    """Rechaza ZIP con demasiadas entradas, tamaños desmesurados o una compresión anómala (zip-bomb).

    (0.4.0, CF-15) Con `omitir_imagenes`, una IMAGEN desmesurada o anómala (una portada lisa de 9000×13000 comprime
    ×1000) no rechaza el libro: se devuelve su nombre para no leerla nunca, y no cuenta en el total."""
    infos = z.infolist()
    if len(infos) > MAX_ENTRADAS_ZIP:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"tiene más de {MAX_ENTRADAS_ZIP} archivos internos")
    total = 0
    total_texto = 0
    omitidas: set[str] = set()
    for i in infos:
        tam = i.file_size
        es_texto = i.filename.lower().endswith(_EXT_TEXTO)
        anomala = tam >= MIN_PARA_RATIO and tam > MAX_RATIO * max(i.compress_size, 1)
        grande = tam > (MAX_ENTRADA_TEXTO if es_texto else MAX_ENTRADA_ZIP)
        if omitir_imagenes and (anomala or grande) and i.filename.lower().endswith(_EXT_IMAGEN):
            omitidas.add(i.filename)
            continue
        total += tam
        if es_texto:
            total_texto += tam
        if anomala:
            raise ErrorDefinitivo(Msj.ARCHIVO_SOSPECHOSO)
        if grande:
            maximo = MAX_ENTRADA_TEXTO if es_texto else MAX_ENTRADA_ZIP
            raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"una de sus partes ocupa más de {_mb(maximo)}")
    if total > MAX_TOTAL_ZIP:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"descomprimido ocupa más de {_mb(MAX_TOTAL_ZIP)}")
    if total_texto > MAX_TOTAL_TEXTO:
        raise ErrorDefinitivo(Msj.LIBRO_DEMASIADO_GRANDE, motivo=f"su texto ocupa más de {_mb(MAX_TOTAL_TEXTO)}")
    return frozenset(omitidas)


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

"""Hojas de cálculo (XLSX, XLS, ODS, CSV) → `hoja.json` para el visor de la web (contratos v1.6).

No se convierten a EPUB: cada lector entrega las celdas ya formateadas (es-CO) y `modelo.construir` aplica los
límites y arma el JSON.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

from ...dominio.mensajes import Msj
from ...dominio.modelo import ErrorDefinitivo
from .modelo import HojaLeida, construir


def leer_hoja_de_calculo(ruta: Path, formato: str) -> tuple[dict, dict[str, Any]]:
    """(hoja.json, metadatos {titulo, autores}) del archivo. Sin ninguna celda con valor → ErrorDefinitivo."""
    hojas: Iterator[HojaLeida]
    metadatos: dict[str, Any]
    if formato == "XLSX":
        from . import desde_xlsx

        wb = desde_xlsx.abrir(ruta)
        metadatos = desde_xlsx.metadatos(wb)
        hojas = desde_xlsx.hojas(wb)
    elif formato == "XLS":
        from . import desde_xls

        libro = desde_xls.abrir(ruta)
        metadatos = desde_xls.metadatos(libro)
        hojas = desde_xls.hojas(libro)
    elif formato == "ODS":
        from .desde_ods import LibroOds

        ods = LibroOds(ruta)
        metadatos = ods.metadatos()
        hojas = ods.hojas()
    elif formato == "CSV":
        from . import desde_csv

        metadatos = {"titulo": None, "autores": []}
        hojas = iter([desde_csv.leer(ruta)])
    else:
        raise ValueError(f"no es una hoja de cálculo: {formato}")
    resultado = construir(hojas)
    if not resultado["hojas"]:
        raise ErrorDefinitivo(Msj.HOJA_VACIA)
    return resultado, metadatos

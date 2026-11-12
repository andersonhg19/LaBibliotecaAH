"""Excel moderno (.xlsx) → hojas leídas, con openpyxl en modo de solo valores (`data_only`).

Las fórmulas NO se evalúan: se muestra el último valor calculado que guardó Excel (si el archivo no lo trae, la celda
queda vacía). No se cargan macros, enlaces externos ni imágenes. El ZIP pasa antes por `revisar_zip`.
"""

from __future__ import annotations

import logging
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from ...dominio.mensajes import Msj
from ...dominio.modelo import ErrorDefinitivo
from .. import limites
from ..limites import revisar_zip
from ..metadatos import normalizar_autores, titulo_util
from .formato_excel import formatear
from .modelo import Estilo, HojaLeida, color

log = logging.getLogger(__name__)

_ALINEAR = {"left": "izquierda", "center": "centro", "centerContinuous": "centro", "right": "derecha"}
_VERTICAL = {"top": "arriba", "center": "centro", "bottom": "abajo"}


def abrir(ruta: Path) -> Any:
    try:
        with zipfile.ZipFile(ruta) as z:
            revisar_zip(z)
    except zipfile.BadZipFile as e:
        raise ErrorDefinitivo(Msj.HOJA_DANADA) from e
    import openpyxl

    try:
        return openpyxl.load_workbook(ruta, data_only=True, keep_links=False, keep_vba=False, rich_text=False)
    except ErrorDefinitivo:
        raise
    except Exception as e:
        log.warning("openpyxl no pudo abrir el libro: %s", e)
        raise ErrorDefinitivo(Msj.HOJA_DANADA, detalle=str(e)[:300]) from e


def metadatos(wb: Any) -> dict[str, Any]:
    props = wb.properties
    return {
        "titulo": titulo_util(getattr(props, "title", None)),
        "autores": normalizar_autores(getattr(props, "creator", None)),
    }


def _color(c: Any) -> str | None:
    if c is None:
        return None
    tipo = getattr(c, "type", None)
    if tipo == "rgb":
        return color(getattr(c, "rgb", None))
    if tipo == "indexed":
        from openpyxl.styles.colors import COLOR_INDEX

        i = getattr(c, "indexed", None)
        if isinstance(i, int) and 0 <= i < len(COLOR_INDEX) and i < 64:
            return color(COLOR_INDEX[i])
    return None  # colores de tema: se omiten


def _estilo(celda: Any) -> Estilo:
    e: Estilo = {}
    f = celda.font
    if f is not None:
        e["negrita"] = bool(f.b)
        e["cursiva"] = bool(f.i)
        e["subrayado"] = bool(f.u) and f.u != "none"
        e["color"] = _color(f.color)
    relleno = celda.fill
    if relleno is not None and getattr(relleno, "fill_type", None) == "solid":
        e["fondo"] = _color(relleno.fgColor)
    al = celda.alignment
    if al is not None:
        e["alinear"] = _ALINEAR.get(al.horizontal or "")
        e["vertical"] = _VERTICAL.get(al.vertical or "")
        e["ajustar"] = bool(al.wrap_text)
    return e


def hojas(wb: Any) -> Iterator[HojaLeida]:
    from openpyxl.utils import column_index_from_string, coordinate_to_tuple
    from openpyxl.worksheet.worksheet import Worksheet

    for ws in wb.worksheets:
        if not isinstance(ws, Worksheet) or ws.sheet_state != "visible":
            continue
        hoja = HojaLeida(nombre=ws.title)
        celdas_dict: dict[tuple[int, int], Any] = getattr(ws, "_cells", {})
        for (fila, col), celda in celdas_dict.items():
            valor = celda.value
            if valor is None or (isinstance(valor, str) and valor == ""):
                continue
            f, c = fila - 1, col - 1
            hoja.filas_original = max(hoja.filas_original, fila)
            hoja.columnas_original = max(hoja.columnas_original, col)
            if f >= limites.MAX_FILAS_HOJA or c >= limites.MAX_COLUMNAS_HOJA:
                continue
            texto, tipo = formatear(valor, celda.number_format)
            if getattr(celda, "data_type", None) == "e":
                tipo = "e"
            if texto == "":
                continue
            hoja.celdas.append((f, c, texto, tipo, _estilo(celda)))
        for rango in ws.merged_cells.ranges:
            hoja.combinadas.append((rango.min_row - 1, rango.min_col - 1, rango.max_row - 1, rango.max_col - 1))
        for clave, dim in ws.column_dimensions.items():
            if not dim.width:
                continue
            try:
                inicio = dim.min or column_index_from_string(clave)
                fin = dim.max or inicio
            except ValueError:
                continue
            px = 40 if dim.hidden else dim.width * 7 + 5
            for c in range(inicio - 1, min(fin, limites.MAX_COLUMNAS_HOJA)):
                hoja.anchos[c] = px
        for fila, dim in ws.row_dimensions.items():
            if dim.ht and dim.customHeight and fila - 1 < limites.MAX_FILAS_HOJA:
                hoja.altos[fila - 1] = dim.ht * 4 / 3
        if ws.freeze_panes:
            try:
                f, c = coordinate_to_tuple(ws.freeze_panes)
                hoja.fijas = (f - 1, c - 1)
            except ValueError:
                log.debug("Inmovilización ilegible: %s", ws.freeze_panes)
        yield hoja

"""Excel 97-2003 (.xls) → hojas leídas, con xlrd (solo lee: no evalúa fórmulas ni ejecuta macros).

Con `formatting_info=True` xlrd da el formato de número, la fuente, el relleno, la alineación, las celdas combinadas,
los anchos y la inmovilización; si el archivo no lo admite se lee sin formato. Las fechas se pasan a número de serie
del sistema 1900 (los libros con fechas 1904 se corrigen) y se formatean con el mismo formateador que XLSX.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from ...dominio.mensajes import Msj
from ...dominio.modelo import ErrorDefinitivo
from .. import limites
from ..limites import revisar_tamano
from ..metadatos import normalizar_autores
from .formato_excel import codigo_regional, formatear, formatear_numero
from .modelo import Estilo, HojaLeida

log = logging.getLogger(__name__)

# tipos de celda de xlrd
VACIA, TEXTO, NUMERO, FECHA, BOOLEANO, ERROR, BLANCA = range(7)
_ALINEAR = {1: "izquierda", 2: "centro", 3: "derecha", 6: "centro"}
_VERTICAL = {0: "arriba", 1: "centro", 2: "abajo"}
_ERRORES = {
    0x00: "#NULL!",
    0x07: "#DIV/0!",
    0x0F: "#VALUE!",
    0x17: "#REF!",
    0x1D: "#NAME?",
    0x24: "#NUM!",
    0x2A: "#N/A",
}
_DIAS_1904 = 1462


def abrir(ruta: Path) -> Any:
    revisar_tamano(ruta, limites.MAX_XLS, "archivo .xls")
    import xlrd

    try:
        return xlrd.open_workbook(str(ruta), formatting_info=True, on_demand=True)
    except NotImplementedError:
        pass
    except xlrd.biffh.XLRDError as e:
        if "encrypt" in str(e).lower():
            raise ErrorDefinitivo(Msj.HOJA_PROTEGIDA) from e
        log.info("xlrd con formato falló (%s); se reintenta sin formato", e)
    except Exception as e:
        log.info("xlrd con formato falló (%s); se reintenta sin formato", e)
    try:
        return xlrd.open_workbook(str(ruta), formatting_info=False, on_demand=True)
    except Exception as e:
        if "encrypt" in str(e).lower():
            raise ErrorDefinitivo(Msj.HOJA_PROTEGIDA) from e
        raise ErrorDefinitivo(Msj.HOJA_DANADA, detalle=str(e)[:300]) from e


def metadatos(libro: Any) -> dict[str, Any]:
    return {"titulo": None, "autores": normalizar_autores(getattr(libro, "user_name", None))}


def _rgb(libro: Any, indice: int | None) -> str | None:
    if indice is None:
        return None
    rgb = getattr(libro, "colour_map", {}).get(indice)
    if not rgb:
        return None
    return "#{:02X}{:02X}{:02X}".format(*rgb[:3])


def _estilo_y_formato(libro: Any, hoja: Any, f: int, c: int) -> tuple[Estilo | None, str]:
    xf_list = getattr(libro, "xf_list", None)
    if not xf_list:
        return None, "General"
    try:
        xf = xf_list[hoja.cell_xf_index(f, c)]
    except (IndexError, AttributeError):
        return None, "General"
    fmt = libro.format_map.get(xf.format_key)
    codigo = codigo_regional(getattr(fmt, "format_str", None), xf.format_key)
    e: Estilo = {}
    try:
        fuente = libro.font_list[xf.font_index]
        e["negrita"] = bool(fuente.bold)
        e["cursiva"] = bool(fuente.italic)
        e["subrayado"] = bool(fuente.underline_type)
        e["color"] = _rgb(libro, fuente.colour_index)
    except (IndexError, AttributeError):
        pass
    fondo = getattr(xf, "background", None)
    if fondo is not None and getattr(fondo, "fill_pattern", 0) == 1:
        e["fondo"] = _rgb(libro, fondo.pattern_colour_index)
    al = getattr(xf, "alignment", None)
    if al is not None:
        e["alinear"] = _ALINEAR.get(al.hor_align)
        e["vertical"] = _VERTICAL.get(al.vert_align)
        e["ajustar"] = bool(al.text_wrapped)
    return e, codigo


def _texto(libro: Any, tipo: int, valor: Any, codigo: str) -> tuple[str, str]:
    if tipo == TEXTO:
        return formatear(str(valor), codigo)
    if tipo == BOOLEANO:
        return formatear(bool(valor), codigo)
    if tipo == ERROR:
        return _ERRORES.get(int(valor), "#ERROR"), "e"
    serial = float(valor) + (_DIAS_1904 if getattr(libro, "datemode", 0) == 1 and tipo == FECHA else 0)
    if tipo == FECHA:
        cod = codigo if codigo.lower() != "general" else "dd/mm/yyyy"
        return formatear_numero(serial, cod), "f"
    return formatear(serial, codigo)


def hojas(libro: Any) -> Iterator[HojaLeida]:
    for indice in range(libro.nsheets):
        hoja_x = libro.sheet_by_index(indice)
        if getattr(hoja_x, "visibility", 0) != 0:
            continue
        hoja = HojaLeida(nombre=hoja_x.name)
        for f in range(hoja_x.nrows):
            for c in range(hoja_x.ncols):
                tipo = hoja_x.cell_type(f, c)
                if tipo in (VACIA, BLANCA):
                    continue
                valor = hoja_x.cell_value(f, c)
                if tipo == TEXTO and valor == "":
                    continue
                hoja.filas_original = max(hoja.filas_original, f + 1)
                hoja.columnas_original = max(hoja.columnas_original, c + 1)
                if f >= limites.MAX_FILAS_HOJA or c >= limites.MAX_COLUMNAS_HOJA:
                    continue
                estilo, codigo = _estilo_y_formato(libro, hoja_x, f, c)
                texto, tipo_salida = _texto(libro, tipo, valor, codigo)
                if texto:
                    hoja.celdas.append((f, c, texto, tipo_salida, estilo))
        for rlo, rhi, clo, chi in getattr(hoja_x, "merged_cells", []) or []:
            hoja.combinadas.append((rlo, clo, rhi - 1, chi - 1))
        for c, info in (getattr(hoja_x, "colinfo_map", {}) or {}).items():
            if c < limites.MAX_COLUMNAS_HOJA:
                hoja.anchos[c] = 40 if getattr(info, "hidden", 0) else info.width / 256 * 7 + 5
        for f, info in (getattr(hoja_x, "rowinfo_map", {}) or {}).items():
            if f < limites.MAX_FILAS_HOJA and getattr(info, "has_default_height", 1) == 0:
                hoja.altos[f] = info.height / 20 * 4 / 3
        if getattr(hoja_x, "panes_are_frozen", 0):
            hoja.fijas = (int(hoja_x.horz_split_pos or 0), int(hoja_x.vert_split_pos or 0))
        if hasattr(libro, "unload_sheet"):
            libro.unload_sheet(indice)
        yield hoja

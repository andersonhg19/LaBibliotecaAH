"""Hoja de cálculo OpenDocument (.ods) → hojas leídas, con lxml sobre content.xml / styles.xml / settings.xml.

ODS guarda en cada celda el texto tal como se mostraba (`<text:p>`), ya formateado por quien lo guardó: se usa ese.
Las filas y columnas repetidas (`number-rows-repeated`, `number-columns-repeated`, a veces de un millón) no se
materializan si están vacías; las que tienen contenido se repiten solo hasta los límites.
"""

from __future__ import annotations

import logging
import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from lxml import etree

from ...dominio.mensajes import Msj
from ...dominio.modelo import ErrorDefinitivo
from .. import limites
from ..limites import revisar_zip
from ..metadatos import normalizar_autores, titulo_util
from .modelo import Estilo, HojaLeida, color

log = logging.getLogger(__name__)

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "config": "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
    "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def _q(prefijo: str, nombre: str) -> str:
    return f"{{{NS[prefijo]}}}{nombre}"


_TABLE = _q("table", "table")
_ROW = _q("table", "table-row")
_COLUMN = _q("table", "table-column")
_CELL = _q("table", "table-cell")
_COVERED = _q("table", "covered-table-cell")
_TEXT_P = _q("text", "p")
_TEXT_S = _q("text", "s")
_TEXT_TAB = _q("text", "tab")
_TEXT_BR = _q("text", "line-break")
_GRUPOS = {
    _q("table", "table-header-rows"),
    _q("table", "table-rows"),
    _q("table", "table-row-group"),
    _q("table", "table-header-columns"),
    _q("table", "table-columns"),
    _q("table", "table-column-group"),
}
_ALINEAR = {"start": "izquierda", "left": "izquierda", "center": "centro", "end": "derecha", "right": "derecha"}
_VERTICAL = {"top": "arriba", "middle": "centro", "bottom": "abajo"}
_TIPO = {
    "float": "n",
    "percentage": "n",
    "currency": "n",
    "date": "f",
    "time": "f",
    "boolean": "b",
    "string": "t",
}
_MEDIDA = re.compile(r"^\s*([\d.]+)\s*(cm|mm|in|pt|pc|px)?\s*$")
_PX_POR = {"cm": 37.8, "mm": 3.78, "in": 96.0, "pt": 4 / 3, "pc": 16.0, "px": 1.0, None: 1.0}


def a_px(medida: str | None) -> float | None:
    if not medida:
        return None
    m = _MEDIDA.match(medida)
    if not m:
        return None
    return float(m.group(1)) * _PX_POR[m.group(2)]


def _parsear(z: zipfile.ZipFile, nombre: str) -> Any:
    try:
        datos = z.read(nombre)
    except KeyError:
        return None
    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
    try:
        return etree.fromstring(datos, parser)
    except etree.XMLSyntaxError as e:
        if nombre == "content.xml":
            raise ErrorDefinitivo(Msj.HOJA_DANADA, detalle=str(e)[:300]) from e
        return None


class LibroOds:
    def __init__(self, ruta: Path):
        try:
            with zipfile.ZipFile(ruta) as z:
                revisar_zip(z)
                manifiesto = z.read("META-INF/manifest.xml") if "META-INF/manifest.xml" in z.namelist() else b""
                if b"encryption-data" in manifiesto:
                    raise ErrorDefinitivo(Msj.HOJA_PROTEGIDA)
                self.contenido = _parsear(z, "content.xml")
                self.estilos_xml = _parsear(z, "styles.xml")
                self.ajustes = _parsear(z, "settings.xml")
                self.meta = _parsear(z, "meta.xml")
        except zipfile.BadZipFile as e:
            raise ErrorDefinitivo(Msj.HOJA_DANADA) from e
        if self.contenido is None:
            raise ErrorDefinitivo(Msj.HOJA_DANADA)
        self.estilos: dict[str, Any] = {}
        for raiz in (self.estilos_xml, self.contenido):
            if raiz is None:
                continue
            for st in raiz.iter(_q("style", "style")):
                nombre = st.get(_q("style", "name"))
                if nombre:
                    self.estilos[nombre] = st
        self._cache: dict[str, Estilo] = {}

    def metadatos(self) -> dict[str, Any]:
        titulo = autor = None
        if self.meta is not None:
            t = self.meta.find(".//dc:title", NS)
            titulo = t.text if t is not None else None
            a = self.meta.find(".//meta:initial-creator", NS)
            if a is None:
                a = self.meta.find(".//dc:creator", NS)
            autor = a.text if a is not None else None
        return {"titulo": titulo_util(titulo), "autores": normalizar_autores(autor)}

    def _propiedad(self, nombre: str | None, etiqueta: str, atributo: str, profundidad: int = 0) -> str | None:
        st = self.estilos.get(nombre or "")
        if st is None or profundidad > 5:
            return None
        props = st.find(f"style:{etiqueta}", NS)
        if props is not None:
            prefijo, local = atributo.split(":")
            v = props.get(_q(prefijo, local))
            if v is not None:
                return v
        return self._propiedad(st.get(_q("style", "parent-style-name")), etiqueta, atributo, profundidad + 1)

    def estilo_celda(self, nombre: str | None) -> Estilo:
        if not nombre:
            return {}
        if nombre in self._cache:
            return self._cache[nombre]
        p = self._propiedad
        e: Estilo = {
            "negrita": p(nombre, "text-properties", "fo:font-weight") in ("bold", "700", "800", "900"),
            "cursiva": p(nombre, "text-properties", "fo:font-style") == "italic",
            "subrayado": p(nombre, "text-properties", "style:text-underline-style") not in (None, "none"),
            "color": color(p(nombre, "text-properties", "fo:color")),
            "fondo": color(p(nombre, "table-cell-properties", "fo:background-color")),
            "alinear": _ALINEAR.get(p(nombre, "paragraph-properties", "fo:text-align") or ""),
            "vertical": _VERTICAL.get(p(nombre, "table-cell-properties", "style:vertical-align") or ""),
            "ajustar": p(nombre, "table-cell-properties", "fo:wrap-option") == "wrap",
        }
        self._cache[nombre] = e
        return e

    def _congeladas(self) -> dict[str, tuple[int, int]]:
        """Paneles inmovilizados por hoja (settings.xml: HorizontalSplitMode/VerticalSplitMode = 2)."""
        salida: dict[str, tuple[int, int]] = {}
        if self.ajustes is None:
            return salida
        for mapa in self.ajustes.iter(_q("config", "config-item-map-named")):
            if mapa.get(_q("config", "name")) != "Tables":
                continue
            for entrada in mapa.findall("config:config-item-map-entry", NS):
                items = {i.get(_q("config", "name")): (i.text or "") for i in entrada.findall("config:config-item", NS)}
                try:
                    columnas = (
                        int(items.get("HorizontalSplitPosition") or 0) if items.get("HorizontalSplitMode") == "2" else 0
                    )
                    filas = int(items.get("VerticalSplitPosition") or 0) if items.get("VerticalSplitMode") == "2" else 0
                except ValueError:
                    continue
                if filas or columnas:
                    salida[entrada.get(_q("config", "name")) or ""] = (filas, columnas)
        return salida

    def hojas(self) -> Iterator[HojaLeida]:
        congeladas = self._congeladas()
        cuerpo = self.contenido.find("office:body/office:spreadsheet", NS)
        if cuerpo is None:
            return
        for tabla in cuerpo.iter(_TABLE):
            estilo_tabla = tabla.get(_q("table", "style-name"))
            if self._propiedad(estilo_tabla, "table-properties", "table:display") == "false":
                continue
            nombre = tabla.get(_q("table", "name")) or ""
            hoja = HojaLeida(nombre=nombre, fijas=congeladas.get(nombre))
            self._columnas(tabla, hoja)
            self._filas(tabla, hoja)
            yield hoja

    def _columnas(self, tabla: Any, hoja: HojaLeida) -> None:
        c = 0
        for col in _hijos(tabla, _COLUMN):
            rep = _entero(col.get(_q("table", "number-columns-repeated")), 1)
            ancho = a_px(
                self._propiedad(col.get(_q("table", "style-name")), "table-column-properties", "style:column-width")
            )
            oculta = col.get(_q("table", "visibility")) in ("collapse", "filter")
            if ancho is not None or oculta:
                for k in range(c, min(c + rep, limites.MAX_COLUMNAS_HOJA)):
                    hoja.anchos[k] = 40 if oculta else ancho or 96
            c += rep
            if c >= limites.MAX_COLUMNAS_HOJA:
                break

    def _filas(self, tabla: Any, hoja: HojaLeida) -> None:
        f = 0
        for fila in _hijos(tabla, _ROW):
            rep = _entero(fila.get(_q("table", "number-rows-repeated")), 1)
            celdas = _celdas_de(self, fila)
            if not celdas:
                f += rep
                continue
            alto = None
            estilo_fila = fila.get(_q("table", "style-name"))
            if self._propiedad(estilo_fila, "table-row-properties", "style:use-optimal-row-height") != "true":
                alto = a_px(self._propiedad(estilo_fila, "table-row-properties", "style:row-height"))
            for k in range(rep):
                ff = f + k
                hoja.filas_original = max(hoja.filas_original, ff + 1)
                if ff >= limites.MAX_FILAS_HOJA:
                    break
                if alto is not None:
                    hoja.altos[ff] = alto
                for c, texto, tipo, estilo, abarca in celdas:
                    hoja.columnas_original = max(hoja.columnas_original, c + 1)
                    if c >= limites.MAX_COLUMNAS_HOJA:
                        continue
                    if texto:
                        hoja.celdas.append((ff, c, texto, tipo, estilo))
                    if abarca is not None:
                        hoja.combinadas.append((ff, c, ff + abarca[0] - 1, c + abarca[1] - 1))
            if rep > 1 and f + rep > limites.MAX_FILAS_HOJA:
                hoja.filas_original = max(hoja.filas_original, f + rep)
            f += rep


def _celdas_de(libro: LibroOds, fila: Any) -> list[tuple[int, str, str, Estilo, tuple[int, int] | None]]:
    """(columna, texto, tipo, estilo, (filas, columnas) si combina) de las celdas con contenido de una fila."""
    salida: list[tuple[int, str, str, Estilo, tuple[int, int] | None]] = []
    c = 0
    for celda in fila:
        if celda.tag not in (_CELL, _COVERED):
            continue
        rep = _entero(celda.get(_q("table", "number-columns-repeated")), 1)
        if celda.tag == _COVERED:
            c += rep
            continue
        texto = _texto(celda)
        filas_abarca = _entero(celda.get(_q("table", "number-rows-spanned")), 1)
        cols_abarca = _entero(celda.get(_q("table", "number-columns-spanned")), 1)
        abarca = (filas_abarca, cols_abarca) if filas_abarca > 1 or cols_abarca > 1 else None
        if texto or abarca:
            tipo_valor = celda.get(_q("office", "value-type"))
            tipo = _TIPO.get(tipo_valor or "", "t")
            if celda.get(_q("table", "formula")) and (texto.startswith("#") or texto.startswith("Err:")):
                tipo = "e"
            estilo = libro.estilo_celda(celda.get(_q("table", "style-name")))
            for k in range(min(rep, max(0, limites.MAX_COLUMNAS_HOJA - c))):
                salida.append((c + k, texto, tipo, estilo, abarca))
            if rep > limites.MAX_COLUMNAS_HOJA - c:  # contenido repetido más allá del límite: cuenta en el original
                salida.append((c + rep - 1, "", tipo, estilo, None))
        c += rep
    return salida


def _texto(celda: Any) -> str:
    parrafos = []
    for p in celda.findall("text:p", NS):
        partes: list[str] = []
        _texto_rec(p, partes)
        parrafos.append("".join(partes))
    return "\n".join(parrafos).strip()


def _texto_rec(el: Any, partes: list[str]) -> None:
    if el.text:
        partes.append(el.text)
    for hijo in el:
        if hijo.tag == _TEXT_S:
            partes.append(" " * _entero(hijo.get(_q("text", "c")), 1))
        elif hijo.tag == _TEXT_TAB:
            partes.append("\t")
        elif hijo.tag == _TEXT_BR:
            partes.append("\n")
        else:
            _texto_rec(hijo, partes)
        if hijo.tail:
            partes.append(hijo.tail)


def _hijos(tabla: Any, etiqueta: str) -> Iterator[Any]:
    """Filas o columnas de la tabla en orden, entrando en los grupos (cabecera, grupos plegables)."""
    for hijo in tabla:
        if hijo.tag == etiqueta:
            yield hijo
        elif hijo.tag in _GRUPOS:
            yield from _hijos(hijo, etiqueta)


def _entero(valor: str | None, defecto: int) -> int:
    try:
        return max(1, int(valor)) if valor is not None else defecto
    except ValueError:
        return defecto

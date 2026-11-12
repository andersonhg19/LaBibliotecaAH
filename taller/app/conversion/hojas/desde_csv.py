"""CSV / TSV → una hoja. Codificación con `decodificar` (UTF-8, UTF-16, Windows-1252…) y separador detectado
(`,` `;` tabulador `|`). El texto se muestra tal cual; una celda que parece un número se marca como número (se alinea
a la derecha) pero no se reformatea.
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path

from ...dominio.mensajes import Msj
from ...dominio.modelo import ErrorDefinitivo
from .. import limites
from ..desde_txt import decodificar
from ..limites import revisar_tamano
from .modelo import HojaLeida

_NUMERO = re.compile(
    r"^[-+]?\s?[$€£]?\s?\(?\d{1,3}(?:([.,\s'])\d{3})*(?:[.,]\d+)?\)?\s?%?$|^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?%?$"
)
_SEPARADORES = ",;\t|"
_MUESTRA = 64 * 1024


def separador(texto: str, extension: str) -> str:
    if extension == ".tsv":
        return "\t"
    muestra = texto[:_MUESTRA]
    try:
        return csv.Sniffer().sniff(muestra, delimiters=_SEPARADORES).delimiter
    except csv.Error:
        # sin consenso: el que más aparece en la primera línea
        primera = muestra.split("\n", 1)[0]
        cuentas = {s: primera.count(s) for s in _SEPARADORES}
        mejor = max(cuentas, key=lambda s: cuentas[s])
        return mejor if cuentas[mejor] else ","


def parece_numero(texto: str) -> bool:
    return bool(_NUMERO.match(texto.strip())) and any(c.isdigit() for c in texto)


def leer(ruta: Path) -> HojaLeida:
    revisar_tamano(ruta, limites.MAX_TXT, "archivo CSV")
    texto = decodificar(ruta.read_bytes())
    if texto.startswith("﻿"):
        texto = texto[1:]
    if not texto.strip():
        raise ErrorDefinitivo(Msj.HOJA_VACIA)
    csv.field_size_limit(limites.MAX_CAMPO_CSV)
    lector = csv.reader(io.StringIO(texto, newline=""), delimiter=separador(texto, ruta.suffix.lower()))
    hoja = HojaLeida(nombre=ruta.stem[:100] or "Hoja 1")
    largos: dict[int, int] = {}
    try:
        for f, fila in enumerate(lector):
            for c, valor in enumerate(fila):
                v = valor.strip("\r")
                if not v.strip():
                    continue
                hoja.filas_original = max(hoja.filas_original, f + 1)
                hoja.columnas_original = max(hoja.columnas_original, c + 1)
                if f >= limites.MAX_FILAS_HOJA or c >= limites.MAX_COLUMNAS_HOJA:
                    continue
                hoja.celdas.append((f, c, v, "n" if parece_numero(v) else "t", None))
                if f < 200:
                    largos[c] = max(largos.get(c, 0), min(len(v), 60))
    except csv.Error as e:
        raise ErrorDefinitivo(Msj.HOJA_DANADA, detalle=str(e)[:300]) from e
    for c, n in largos.items():
        hoja.anchos[c] = n * 7.5 + 20
    # encabezado: si la primera fila es todo texto y hay más filas, va en negrita
    primera = [x for x in hoja.celdas if x[0] == 0]
    if primera and hoja.filas_original > 1 and all(x[3] == "t" for x in primera):
        hoja.celdas = [(f, c, t, ti, {"negrita": True} if f == 0 else e) for f, c, t, ti, e in hoja.celdas]
    return hoja

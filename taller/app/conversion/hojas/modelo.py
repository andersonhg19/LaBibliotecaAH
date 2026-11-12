"""Construcción de `hoja.json` (contratos v1.6) a partir de lo que leen los lectores de XLSX, XLS, ODS y CSV.

Cada lector entrega, por hoja, las celdas con texto ya formateado (fila, columna, texto, tipo, estilo como dict) y
sus extras (combinadas, anchos, altos, paneles inmovilizados). Aquí se aplican los límites (hojas, filas, columnas,
celdas totales, texto por celda), se deduplican los estilos y se calcula el tamaño de la rejilla.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field

from .. import limites

ANCHO_DEFECTO = 96
ANCHO_MIN, ANCHO_MAX = 40, 480
ALTO_MIN, ALTO_MAX = 18, 200
MAX_FIJAS_FILAS, MAX_FIJAS_COLUMNAS = 5, 3
TIPOS = {"t", "n", "f", "b", "e"}

Estilo = dict[str, object]
Celda = tuple[int, int, str, str, Estilo | None]


@dataclass
class HojaLeida:
    """Lo que entrega un lector por hoja. Filas y columnas desde 0."""

    nombre: str
    celdas: list[Celda] = field(default_factory=list)
    combinadas: list[tuple[int, int, int, int]] = field(default_factory=list)
    anchos: dict[int, float] = field(default_factory=dict)  # px
    altos: dict[int, float] = field(default_factory=dict)  # px
    fijas: tuple[int, int] | None = None  # (filas, columnas) inmovilizadas en el archivo
    filas_original: int = 0  # extensión real con valor (puede superar lo leído)
    columnas_original: int = 0


@dataclass
class _Libro:
    hojas: list[dict] = field(default_factory=list)
    recortado: bool = False
    celdas_restantes: int = field(default_factory=lambda: limites.MAX_CELDAS_HOJAS)


def recortar(valor: float, minimo: int, maximo: int) -> int:
    return int(max(minimo, min(maximo, round(valor))))


def color(argb: object) -> str | None:
    """ "FF112233" / "112233" / "#112233" → "#112233"; None si no es un RGB explícito."""
    if not isinstance(argb, str):
        return None
    c = argb.strip().lstrip("#")
    if len(c) == 8:
        c = c[2:]
    if len(c) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in c):
        return None
    return "#" + c.upper()


def limpiar_estilo(estilo: Estilo | None) -> Estilo:
    """Quita lo que es el valor por defecto (fondo blanco, texto negro, claves falsas o vacías)."""
    if not estilo:
        return {}
    salida: Estilo = {}
    for k, v in estilo.items():
        if v is None or v is False or v == "":
            continue
        if (k == "fondo" and v == "#FFFFFF") or (k == "color" and v == "#000000"):
            continue
        salida[k] = v
    return salida


def recortar_texto(texto: str) -> str:
    if len(texto) > limites.MAX_TEXTO_CELDA:
        return texto[: limites.MAX_TEXTO_CELDA - 1] + "…"
    return texto


def _agregar_hoja(libro: _Libro, hoja: HojaLeida) -> None:
    celdas = sorted(
        ((f, c, t, ti, e) for f, c, t, ti, e in hoja.celdas if t != "" and f >= 0 and c >= 0),
        key=lambda x: (x[0], x[1]),
    )
    max_f, max_c = limites.MAX_FILAS_HOJA, limites.MAX_COLUMNAS_HOJA
    dentro = [x for x in celdas if x[0] < max_f and x[1] < max_c]
    sin_presupuesto = len(dentro) > libro.celdas_restantes
    if sin_presupuesto:
        dentro = dentro[: max(0, libro.celdas_restantes)]
        libro.recortado = True
    libro.celdas_restantes -= len(dentro)

    combinadas_dentro = [m for m in hoja.combinadas if m[0] < max_f and m[1] < max_c]
    filas_original = max([hoja.filas_original] + [x[0] + 1 for x in celdas] + [m[2] + 1 for m in hoja.combinadas])
    columnas_original = max([hoja.columnas_original] + [x[1] + 1 for x in celdas] + [m[3] + 1 for m in hoja.combinadas])
    filas = max([1] + [x[0] + 1 for x in dentro] + [min(m[2], max_f - 1) + 1 for m in combinadas_dentro])
    columnas = max([1] + [x[1] + 1 for x in dentro] + [min(m[3], max_c - 1) + 1 for m in combinadas_dentro])
    if sin_presupuesto:
        filas = min(filas, dentro[-1][0] + 1) if dentro else 1
    recortada = sin_presupuesto or filas_original > filas or columnas_original > columnas

    estilos: list[Estilo] = [{}]
    indices: dict[str, int] = {"{}": 0}

    def indice(estilo: Estilo | None) -> int:
        limpio = limpiar_estilo(estilo)
        clave = json.dumps(limpio, sort_keys=True)
        if clave not in indices:
            indices[clave] = len(estilos)
            estilos.append(limpio)
        return indices[clave]

    salida_celdas = [
        [f, c, recortar_texto(t), ti if ti in TIPOS else "t", indice(e)]
        for f, c, t, ti, e in dentro
        if f < filas and c < columnas
    ]
    combinadas = []
    for f1, c1, f2, c2 in combinadas_dentro:
        if f1 >= filas or c1 >= columnas:
            continue
        f2, c2 = min(f2, filas - 1), min(c2, columnas - 1)
        if (f2, c2) != (f1, c1):
            combinadas.append([f1, c1, f2, c2])
    fijas_f, fijas_c = hoja.fijas if hoja.fijas is not None else (1, 1)
    libro.hojas.append(
        {
            "nombre": (hoja.nombre or f"Hoja {len(libro.hojas) + 1}")[:100],
            "filas": filas,
            "columnas": columnas,
            "filasOriginal": max(filas_original, filas),
            "columnasOriginal": max(columnas_original, columnas),
            "recortada": recortada,
            "fijas": {
                "filas": max(0, min(fijas_f, MAX_FIJAS_FILAS, filas - 1)),
                "columnas": max(0, min(fijas_c, MAX_FIJAS_COLUMNAS, columnas - 1)),
            },
            "anchos": [recortar(hoja.anchos.get(c, ANCHO_DEFECTO), ANCHO_MIN, ANCHO_MAX) for c in range(columnas)],
            "altos": [[f, recortar(px, ALTO_MIN, ALTO_MAX)] for f, px in sorted(hoja.altos.items()) if 0 <= f < filas],
            "celdas": salida_celdas,
            "combinadas": combinadas,
            "estilos": estilos,
        }
    )


def construir(hojas: Iterable[HojaLeida]) -> dict:
    """hoja.json completo. Las hojas sin ninguna celda con texto se omiten; si no queda ninguna, `hojas` vacía."""
    libro = _Libro()
    for hoja in hojas:
        if not any(t != "" for _f, _c, t, _ti, _e in hoja.celdas):
            continue
        if len(libro.hojas) >= limites.MAX_HOJAS or libro.celdas_restantes <= 0:
            libro.recortado = True
            break
        _agregar_hoja(libro, hoja)
    return {"versionFormato": 1, "recortado": libro.recortado, "hojas": libro.hojas}

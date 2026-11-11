"""Números romanos y números en palabras (español), para la capa de voz."""

from __future__ import annotations

import re

_ROMANO_VALIDO = re.compile(r"^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
_VALORES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}

_UNIDADES = [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
    "veintiuno",
    "veintidós",
    "veintitrés",
    "veinticuatro",
    "veinticinco",
    "veintiséis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
]
_DECENAS = {30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta", 70: "setenta", 80: "ochenta", 90: "noventa"}
_CENTENAS = {
    100: "ciento",
    200: "doscientos",
    300: "trescientos",
    400: "cuatrocientos",
    500: "quinientos",
    600: "seiscientos",
    700: "setecientos",
    800: "ochocientos",
    900: "novecientos",
}
_ORDINALES = ["", "primero", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno", "décimo"]

MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def romano_a_entero(texto: str) -> int | None:
    """Devuelve el valor de un número romano canónico (I..MMMCMXCIX) o None."""
    t = texto.strip().upper()
    if not t or not _ROMANO_VALIDO.match(t):
        return None
    total = 0
    for i, c in enumerate(t):
        v = _VALORES[c]
        if i + 1 < len(t) and _VALORES[t[i + 1]] > v:
            total -= v
        else:
            total += v
    return total


def numero_a_palabras(n: int) -> str:
    """Cardinal en español para 0..999999."""
    if n < 0:
        return "menos " + numero_a_palabras(-n)
    if n < 30:
        return _UNIDADES[n]
    if n < 100:
        d, u = divmod(n, 10)
        return _DECENAS[d * 10] + ("" if u == 0 else " y " + _UNIDADES[u])
    if n == 100:
        return "cien"
    if n < 1000:
        c, r = divmod(n, 100)
        return _CENTENAS[c * 100] + ("" if r == 0 else " " + numero_a_palabras(r))
    if n < 1_000_000:
        m, r = divmod(n, 1000)
        if m == 1:
            pre = "mil"
        else:
            pal = numero_a_palabras(m)
            if pal.endswith("veintiuno"):
                pal = pal[: -len("veintiuno")] + "veintiún"
            elif pal.endswith("uno"):
                pal = pal[:-1]
            pre = pal + " mil"
        return pre + ("" if r == 0 else " " + numero_a_palabras(r))
    return str(n)


def ordinal_o_cardinal(n: int) -> str:
    """Para reyes/papas: 'segundo' hasta décimo; después cardinal ('Alfonso doce')."""
    if 1 <= n <= 10:
        return _ORDINALES[n]
    return numero_a_palabras(n)

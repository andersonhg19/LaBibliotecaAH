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
    """Cardinal en español (hasta 999 999 999 999; más allá, las cifras)."""
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
        pre = "mil" if m == 1 else apocopar(numero_a_palabras(m)) + " mil"
        return pre + ("" if r == 0 else " " + numero_a_palabras(r))
    if n < 1_000_000_000_000:
        m, r = divmod(n, 1_000_000)
        pre = "un millón" if m == 1 else apocopar(numero_a_palabras(m)) + " millones"
        return pre + ("" if r == 0 else " " + numero_a_palabras(r))
    return str(n)


def apocopar(palabras: str) -> str:
    """Delante de un sustantivo masculino: «uno» → «un», «veintiuno» → «veintiún» («veintiún mil», «un dólar»)."""
    if palabras.endswith("veintiuno"):
        return palabras[: -len("veintiuno")] + "veintiún"
    if palabras.endswith("uno"):
        return palabras[:-1]
    return palabras


def femenino(palabras: str) -> str:
    """Cardinal delante de un sustantivo femenino: «una», «veintiuna», «doscientas» («la una», «mil doscientas
    casas»). «mil» y «millones» no cambian."""
    salida = []
    for p in palabras.split(" "):
        if p == "uno":
            p = "una"
        elif p == "veintiuno":
            p = "veintiuna"
        elif p.endswith("ientos"):
            p = p[: -len("os")] + "as"
        salida.append(p)
    # «veintiún mil» / «un millón» se quedan como están (concuerdan con «mil»/«millón»)
    return " ".join(salida)


_ORD_UNIDADES = ["", "primero", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno"]
_ORD_DECENAS = [
    "",
    "décimo",
    "vigésimo",
    "trigésimo",
    "cuadragésimo",
    "quincuagésimo",
    "sexagésimo",
    "septuagésimo",
    "octogésimo",
    "nonagésimo",
]


def ordinal(n: int, genero: str = "m", apocope: bool = False) -> str:
    """Ordinal en español (1..100): «primero», «segunda», «primer» (apócope), «vigésimo primero». Fuera de rango,
    el cardinal."""
    if n == 100:
        base = "centésimo"
    elif n == 11:
        base = "undécimo"
    elif n == 12:
        base = "duodécimo"
    elif 1 <= n < 100:
        d, u = divmod(n, 10)
        base = " ".join(p for p in (_ORD_DECENAS[d], _ORD_UNIDADES[u]) if p)
    else:
        return numero_a_palabras(n)
    if genero == "f":
        return " ".join(p[:-1] + "a" for p in base.split(" "))
    if apocope and base.endswith(("primero", "tercero")):
        return base[:-1]
    return base


def ordinal_o_cardinal(n: int) -> str:
    """Para reyes/papas: 'segundo' hasta décimo; después cardinal ('Alfonso doce')."""
    if 1 <= n <= 10:
        return _ORDINALES[n]
    return numero_a_palabras(n)

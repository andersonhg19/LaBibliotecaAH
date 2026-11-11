"""Segmentador de frases para español (regex + lista de abreviaturas), con offsets exactos.

Reglas:
- Se corta tras `.`, `!`, `?`, `…` (y comillas/paréntesis de cierre) seguidos de espacio y de un inicio de frase
  (mayúscula, dígito, `¿`, `¡`, comillas o paréntesis de apertura, o raya de diálogo seguida de mayúscula).
- No se corta tras abreviaturas conocidas (Sr., Dra., pág., núm., EE. UU., …) ni tras iniciales ("J. R. R.").
- `etc.` y similares sí cortan si sigue mayúscula.
- Frases más largas de `MAX_FRASE` caracteres se parten en `;`, `:`, `,` o espacio (para la voz y el resaltado).
"""

from __future__ import annotations

import re

from .normalizador import ABREVIATURAS_DEBILES, ABREVIATURAS_FUERTES

MAX_FRASE = 450

_TERMINADOR = re.compile(r"(?:[.!?…]+|\.\.\.)[»”\"’'\)\]]*(?=\s)")
_APERTURAS = set("¿¡«“\"'(‘[")
_RAYAS = set("—–-")


def _palabra_previa(texto: str, fin_punto: int) -> str:
    """Token (con puntos internos) que termina en la posición `fin_punto` (incluido el punto)."""
    i = fin_punto
    while i > 0 and not texto[i - 1].isspace():
        i -= 1
    token = texto[i:fin_punto]
    return token.lstrip("¿¡«“\"'(‘[")


def _es_inicio_de_frase(texto: str, pos: int) -> bool:
    if pos >= len(texto):
        return False
    c = texto[pos]
    if c.isupper() or c.isdigit() or c in "¿¡":
        return True
    if c in _APERTURAS:
        siguiente = texto[pos + 1 : pos + 2]
        return bool(siguiente) and (siguiente.isupper() or siguiente.isdigit() or siguiente in "¿¡")
    if c in _RAYAS:
        siguiente = texto[pos + 1 : pos + 3].lstrip()
        return bool(siguiente) and (siguiente[0].isupper() or siguiente[0] in "¿¡")
    return False


def _bloquea_abreviatura(texto: str, ini_term: int, fin_term: int) -> bool:
    """True si el punto en `ini_term` pertenece a una abreviatura o inicial que no cierra frase."""
    term = texto[ini_term:fin_term].rstrip("»”\"’')]")
    if term != ".":
        return False  # "...", "!", "?" no son abreviaturas
    token = _palabra_previa(texto, ini_term + 1)
    t = token.lower()
    if not t or t == ".":
        return False
    letras = t.rstrip(".")
    # Inicial: una sola letra mayúscula ("J.") o secuencia de iniciales ("J.R.R.")
    if re.fullmatch(r"(?:[A-ZÁÉÍÓÚÑ]\.)+", token):
        return True
    if t in ABREVIATURAS_FUERTES:
        return True
    if t in ABREVIATURAS_DEBILES:
        return False
    # Dos tokens: "EE. UU." / "a. C." → mirar el token anterior también
    previo_fin = ini_term + 1 - len(token)
    j = previo_fin - 1
    while j > 0 and texto[j - 1].isspace():
        j -= 1
    if j > 0:
        token2 = _palabra_previa(texto, j)
        combinado = (token2 + " " + token).lower()
        if combinado in ABREVIATURAS_FUERTES:
            return True
    # Abreviaturas cortas en minúscula y con punto interno ("p.ej.", "i.e.")
    if re.fullmatch(r"(?:[a-záéíóúñ]{1,3}\.){2,}", t):
        return True
    # Una sola letra ("a." de "a. C.", "s." de "s. XIX") no cierra frase
    return len(letras) == 1 and letras.isalpha()


def segmentar(texto: str) -> list[tuple[int, int]]:
    """Devuelve rangos [inicio, fin) de cada frase (sin espacios en los bordes)."""
    rangos: list[tuple[int, int]] = []
    n = len(texto)
    inicio = 0
    for m in _TERMINADOR.finditer(texto):
        ini_t, fin_t = m.span()
        k = fin_t
        while k < n and texto[k].isspace():
            k += 1
        if k >= n:
            break
        if not _es_inicio_de_frase(texto, k):
            continue
        if _bloquea_abreviatura(texto, ini_t, fin_t):
            continue
        _agregar(texto, inicio, fin_t, rangos)
        inicio = k
    _agregar(texto, inicio, n, rangos)
    return rangos


def _agregar(texto: str, a: int, b: int, rangos: list[tuple[int, int]]) -> None:
    while a < b and texto[a].isspace():
        a += 1
    while b > a and texto[b - 1].isspace():
        b -= 1
    if a >= b:
        return
    for sub in _partir_larga(texto, a, b):
        rangos.append(sub)


def _partir_larga(texto: str, a: int, b: int) -> list[tuple[int, int]]:
    # iterativo: una "frase" de megabytes sin puntuación no debe agotar la pila (antes era recursivo)
    salida: list[tuple[int, int]] = []
    while b - a > MAX_FRASE:
        limite = a + MAX_FRASE
        corte = -1
        for separadores in ("; ", ": ", ", ", " "):
            p = texto.rfind(separadores, a + MAX_FRASE // 3, limite)
            if p != -1:
                corte = p + len(separadores.rstrip())
                break
        if corte == -1:
            corte = limite
        fin_izq = corte
        while fin_izq > a and texto[fin_izq - 1].isspace():
            fin_izq -= 1
        salida.append((a, fin_izq))
        a = corte
        while a < b and texto[a].isspace():
            a += 1
    if a < b:
        salida.append((a, b))
    return salida

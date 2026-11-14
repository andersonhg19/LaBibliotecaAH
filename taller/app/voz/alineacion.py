"""Alineación de las palabras habladas (texto de voz) con el texto VISUAL de la frase.

1. Cada palabra que reporta el motor (WordBoundary) se ubica secuencialmente en el texto de voz.
2. El texto de voz se alinea carácter a carácter con el visual (difflib sobre versiones sin tildes y en minúscula).
   Las expansiones ("IV" → "cuatro", "Sr." → "señor") caen en huecos no coincidentes y se asignan al tramo visual
   correspondiente.
3. El rango visual se ajusta a límites de palabra; palabras habladas consecutivas que caen en el mismo tramo
   visual ("Estados Unidos" ← "EE. UU.") se fusionan.
Si menos del 70 % de las palabras se pueden ubicar, se devuelve lista vacía (el contrato lo permite).
"""

from __future__ import annotations

import difflib
import re
import unicodedata

_PALABRA = re.compile(r"\w+", re.UNICODE)


def _plano(s: str) -> str:
    """Minúsculas y sin diacríticos, conservando la longitud (1 carácter → 1 carácter)."""
    salida = []
    for c in s:
        d = unicodedata.normalize("NFD", c)
        base = d[0] if d else c
        salida.append(base.lower() if len(base.lower()) == 1 else c)
    return "".join(salida)


def _mapa_voz_a_visual(visual: str, voz: str) -> list[tuple[int, int]]:
    """Para cada carácter del texto de voz, el rango [a, b) del texto visual al que corresponde."""
    a_plano, b_plano = _plano(visual), _plano(voz)
    sm = difflib.SequenceMatcher(None, a_plano, b_plano, autojunk=False)
    mapa: list[tuple[int, int] | None] = [None] * len(voz)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(j2 - j1):
                mapa[j1 + k] = (i1 + k, i1 + k + 1)
        elif tag in ("replace", "insert"):
            for k in range(j1, j2):
                mapa[k] = (i1, max(i2, i1))  # tramo visual reemplazado (puede ser vacío)
    return [m if m is not None else (0, 0) for m in mapa]


def _ajustar_a_palabras(visual: str, a: int, b: int) -> tuple[int, int] | None:
    """Expande [a, b) a palabras completas del texto visual; None si no toca ninguna palabra."""
    tokens = [(m.start(), m.end()) for m in _PALABRA.finditer(visual)]
    tocados = [(s, e) for s, e in tokens if s < max(b, a + 1) and e > a]
    if not tocados and a == b:
        # inserción pura: se asigna a la palabra visual que empieza en `a` o justo antes
        siguientes = [(s, e) for s, e in tokens if s >= a]
        tocados = siguientes[:1]
    if not tocados:
        return None
    return tocados[0][0], tocados[-1][1]


def alinear_palabras(
    visual: str,
    voz: str,
    habladas: list[tuple[str, float, float]],
    desplazamiento: float = 0.0,
    umbral: float = 0.7,
    texto_motor: str | None = None,
    mapa_motor: list[tuple[int, int]] | None = None,
) -> list[list]:
    """Devuelve `[[inicioChar, finChar, t0, t1], …]` relativos al texto visual; tiempos absolutos (+desplazamiento).

    (0.4.0) Si al motor se le mandó otro texto (`texto_motor`, la capa de lectura: «1.250» → «mil doscientos
    cincuenta»), `mapa_motor` dice de qué tramo de `voz` sale cada carácter suyo: las palabras se buscan en
    `texto_motor` y se llevan a `voz` y de ahí al visual, así el resaltado sigue al texto original.
    """
    if not habladas or not visual or not voz:
        return []
    mapa = _mapa_voz_a_visual(visual, voz)
    if texto_motor is None or mapa_motor is None or len(mapa_motor) != len(texto_motor):
        texto_motor, mapa_motor = voz, None
    motor_plano = _plano(texto_motor)
    cursor = 0
    ubicadas = 0
    salida: list[list] = []
    for texto, t0, t1 in habladas:
        objetivo = _plano(texto.strip())
        if not objetivo:
            continue
        pos = motor_plano.find(objetivo, cursor)
        if pos == -1 or pos - cursor > 80:
            continue
        cursor = pos + len(objetivo)
        if mapa_motor is None:
            tramos = mapa[pos : pos + len(objetivo)]
        else:
            origen = mapa_motor[pos : pos + len(objetivo)]
            va, vb = min(o[0] for o in origen), max(o[1] for o in origen)
            tramos = mapa[va:vb] or [mapa[min(va, len(mapa) - 1)]]
        a = min(t[0] for t in tramos)
        b = max(t[1] for t in tramos)
        rango = _ajustar_a_palabras(visual, a, b)
        if rango is None:
            continue
        ubicadas += 1
        entrada = [rango[0], rango[1], round(t0 + desplazamiento, 3), round(t1 + desplazamiento, 3)]
        if salida and salida[-1][0] == entrada[0] and salida[-1][1] == entrada[1]:
            salida[-1][3] = entrada[3]  # misma palabra visual: se extiende el tiempo
        elif salida and entrada[0] < salida[-1][1]:
            # solape (expansión que abarca varias palabras visuales): se fusiona
            salida[-1][1] = max(salida[-1][1], entrada[1])
            salida[-1][3] = entrada[3]
        else:
            salida.append(entrada)
    # los tokens sin letras ni cifras («#», «=», un emoji) no cuentan: no tienen palabra visual (V-10)
    if ubicadas < umbral * len([h for h in habladas if _PALABRA.search(h[0])]):
        return []
    return salida

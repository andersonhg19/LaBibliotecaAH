"""Nombres de idioma y detección ligera (sin modelos) entre los idiomas cargados.

El traductor solo conoce los idiomas de sus modelos (en y es), así que no hace falta un detector
general: basta contar palabras muy frecuentes y exclusivas de cada idioma y algunas marcas
ortográficas (ñ, ¿, ¡, tildes; contracciones inglesas). Es instantáneo y no ocupa memoria.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

NOMBRES = {"en": "English", "es": "Spanish"}

_FRECUENTES_CRUDO = {
    "en": """the and of to in is was that it he she you i his her with for on had not be as at but they have
        this from by we my are were said would there been what all so if one their which when an or will them
        him do could into out up about than then its who our your did don't it's i'm can't didn't won't just
        like know over after before back down where how why some any very only well because those these
        hello hi thanks thank please good morning night yes okay""",
    "es": """el la de que y en los las un una se del no por con para es su al lo como más pero sus le ya o
        fue este ha sí porque esta entre cuando muy sin sobre también hasta hay donde quien desde todo nos
        durante todos uno les ni contra otros ese eso ante ellos esto mí antes algunos qué unos yo otro otras
        otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algo nosotros mis tú
        te ti tu tus ellas había dijo era estaba pues aunque entonces después así usted
        hola gracias adiós buenos buenas días noches señor señora""",
}


def _sin_comunes(crudo: dict[str, str]) -> dict[str, frozenset[str]]:
    conjuntos = {idioma: set(texto.split()) for idioma, texto in crudo.items()}
    comunes: set[str] = set()
    for a in conjuntos:
        for b in conjuntos:
            if a < b:
                comunes |= conjuntos[a] & conjuntos[b]
    return {idioma: frozenset(palabras - comunes) for idioma, palabras in conjuntos.items()}


FRECUENTES = _sin_comunes(_FRECUENTES_CRUDO)
_PALABRA = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)?", re.UNICODE)
_MARCAS_ES = re.compile(r"[ñÑ¿¡áéíóúÁÉÍÓÚü]")
_MARCAS_EN = re.compile(r"\b\w+['’](?:s|t|re|ve|ll|d|m)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Deteccion:
    idioma: str
    confianza: float  # 0-100, como LibreTranslate


def detectar(texto: str, candidatos: tuple[str, ...]) -> Deteccion:
    """Idioma más probable de ``texto`` entre ``candidatos``. Sin pistas: el primero, con confianza 0."""
    puntos = dict.fromkeys(candidatos, 0.0)
    for palabra in _PALABRA.findall(texto.lower().replace("’", "'")):
        for idioma in candidatos:
            if palabra in FRECUENTES.get(idioma, frozenset()):
                puntos[idioma] += 1
    if "es" in puntos:
        puntos["es"] += 0.5 * len(_MARCAS_ES.findall(texto))
    if "en" in puntos:
        puntos["en"] += 0.5 * len(_MARCAS_EN.findall(texto))
    total = sum(puntos.values())
    if total == 0:
        return Deteccion(candidatos[0], 0.0)
    ganador = max(candidatos, key=lambda i: puntos[i])
    return Deteccion(ganador, round(100.0 * puntos[ganador] / total, 1))

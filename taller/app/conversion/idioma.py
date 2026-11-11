"""Detección del idioma del texto de un libro (QA NU-02).

Los TXT y la mayoría de los PDF no dicen en qué idioma están, y antes el taller los marcaba como "es": un libro
en inglés quedaba como español y no se podía traducir. Aquí se cuenta, sobre una muestra del texto, cuántas
palabras muy frecuentes y **exclusivas** de cada idioma aparecen (artículos, preposiciones, pronombres).

Por qué sin librería: ``langdetect`` no es determinista (sale distinto entre ejecuciones si no se fija la
semilla) y lleva años sin mantenimiento; ``lingua`` es precisa pero sus modelos pesan cientos de MB en una
imagen que vive con ``mem_limit``. Para seis idiomas europeos y muestras de miles de palabras, contar palabras
vacías acierta igual (es la misma técnica que el traductor, ``traductor/app/idiomas.py``), es instantáneo y no
añade dependencias. Si no hay certeza (texto corto, mezcla, idioma no contemplado) devuelve ``None``: mejor
"desconocido" que inventar un idioma, porque biblioteca-service traduce entonces con ``auto``.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

IDIOMAS = ("es", "en", "pt", "fr", "it", "de")

_FRECUENTES_CRUDO = {
    "es": """el la de que y en los las un una se del no por con para es su al lo como más pero sus le ya o fue
        este ha sí porque esta entre cuando muy sin sobre también hasta hay donde quien desde todo nos durante
        todos uno les ni contra otros ese eso ante ellos esto mí antes algunos qué unos yo otro otras otra él
        tanto esa estos mucho quienes nada muchos cual poco ella estar estas algo nosotros mis tú te ti tu tus
        ellas había dijo era estaba pues aunque entonces después así usted""",
    "en": """the and of to in is was that it he she you his her with for on had not be as at but they have this
        from by we my are were said would there been what all so if their which when or will them him could
        into out up about than then its who our your did just like know over after before back down where how
        why some any very only well because those these""",
    "pt": """o a os as de do da dos das em no na nos nas um uma que e é não com para por se mas mais como ao à
        foi ele ela eles elas seu sua seus suas isso este esta isto também já muito quando ou pelo pela tem ser
        está estava era você eu meu minha nós lhe depois então até sem sobre entre""",
    "fr": """le la les de des du un une et est que qui dans pour pas ne sur au aux avec il elle ils elles nous
        vous je son sa ses ce cette ces mais ou plus par était avait été fait comme tout bien leur être avoir
        aussi très sans même donc alors quand""",
    "it": """il lo la i gli le di del della dei delle un una e è che non per con su al alla nel nella da come
        ma più anche questo questa sono era aveva stato molto quando lui lei loro noi voi io mi ti si ci già
        poi così perché tutto""",
    "de": """der die das und ist ich nicht sie es ein eine zu den mit sich des auf für im dem von auch an als
        nach wie war aber hat er wir ihr noch nur oder wenn so bei aus um sind kann dass hatte wurde mir mich
        dir haben sein werden""",
}


def _exclusivas(crudo: dict[str, str]) -> dict[str, frozenset[str]]:
    """Quita las palabras que comparten dos idiomas cualesquiera ("de", "la", "que"…): no distinguen nada."""
    conjuntos = {idioma: set(texto.split()) for idioma, texto in crudo.items()}
    comunes: set[str] = set()
    for a in conjuntos:
        for b in conjuntos:
            if a < b:
                comunes |= conjuntos[a] & conjuntos[b]
    return {idioma: frozenset(palabras - comunes) for idioma, palabras in conjuntos.items()}


FRECUENTES = _exclusivas(_FRECUENTES_CRUDO)
_PALABRA = re.compile(r"[^\W\d_]+", re.UNICODE)

# Muestra: hasta 3 trozos de este tamaño (inicio, centro y final) para no decidir solo por la portadilla.
TROZO_MUESTRA = 20_000
# Certeza mínima: aciertos del ganador, y ventaja sobre el segundo.
MIN_ACIERTOS = 20
MIN_VENTAJA = 2.0


def muestra(textos: Iterable[str]) -> str:
    """Inicio, centro y final del texto completo (como mucho ``3 × TROZO_MUESTRA`` caracteres)."""
    completo = "\n".join(textos)
    if len(completo) <= 3 * TROZO_MUESTRA:
        return completo
    centro = len(completo) // 2 - TROZO_MUESTRA // 2
    trozos = (completo[:TROZO_MUESTRA], completo[centro : centro + TROZO_MUESTRA], completo[-TROZO_MUESTRA:])
    return "\n".join(trozos)


def detectar_idioma(texto: str) -> str | None:
    """Código ISO 639-1 del idioma de ``texto`` (es, en, pt, fr, it, de) o ``None`` si no hay certeza."""
    puntos = dict.fromkeys(IDIOMAS, 0)
    for palabra in _PALABRA.findall(texto.lower()):
        for idioma in IDIOMAS:
            if palabra in FRECUENTES[idioma]:
                puntos[idioma] += 1
    ganador, segundo = sorted(IDIOMAS, key=lambda i: puntos[i], reverse=True)[:2]
    if puntos[ganador] < MIN_ACIERTOS or puntos[ganador] < MIN_VENTAJA * puntos[segundo]:
        return None
    return ganador

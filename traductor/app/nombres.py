"""Protección de nombres propios («Saltmarsh Point», «Thomas») para que el modelo no los traduzca.

Heurística sin modelos: una racha de palabras con mayúscula inicial que NO está al comienzo de la
frase (o de una cita) es un nombre propio, salvo meses, días, idiomas/gentilicios y tratamientos.
Al comienzo de frase solo cuenta una racha de dos o más palabras que no empiece por una palabra común
(«Saltmarsh Point was…» sí; «The house…» no).

El traductor usa esto en una segunda pasada: si la primera traducción no conserva el nombre tal cual,
traduce de nuevo con un marcador en su lugar y lo repone; si el marcador no sobrevive, se queda la
primera (nunca empeora la frase).
"""

from __future__ import annotations

import re

from .segmentador import ABREVIATURAS

NO_SON_NOMBRES = frozenset(
    """i i'm i'd i'll i've january february march april may june july august september october november
    december monday tuesday wednesday thursday friday saturday sunday english french spanish german italian
    american british european african asian chinese japanese russian irish scottish welsh christmas easter
    god lord sir madam mr mrs ms miss dr st mx prof captain uncle aunt mother father mom dad grandma grandpa
    ok okay oh ah no yes hey mister mistress lady sr sra srta don doña dios señor señora""".split()
)

# Palabras que suelen empezar una frase con mayúscula sin ser nombres.
COMUNES_AL_INICIO = frozenset(
    """the a an and but or so if when while after before because although though as at in on of for from
    to with without by into over under then there here this that these those it its he she they we you his
    her their our your my what who why how where which whose every each all some no not nobody nothing
    everyone everything someone something one two three once outside inside behind beyond above below
    perhaps maybe still yet even just only now never always sometimes yes well oh what's it's he's she's
    they're we're you're there's that's let let's do don't did didn't is was are were have had has can
    could would should will shall may might must
    el la los las lo un una unos unas y o pero cuando entonces si no ni que en de con por para sin sobre tras
    este esta estos estas ese esa aquel aquella mi su sus tu yo él ella ellos ellas nosotros usted ustedes
    quién quien qué cómo dónde cuándo cuál ya aún así luego después antes nadie nada todo todos""".split()
)

_RACHA = re.compile(r"[A-ZÁÉÍÓÚÑÜ][\w'’\-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\w'’\-]*)*", re.UNICODE)
_INICIO = re.compile(r"(^|[.!?…]\s+|[\"“«(\[—–:¿¡]\s*)$")
# Topónimos con abreviatura delante («St. James's Park», «Mt. Rainier»): la abreviatura va con el nombre.
_ABREVIATURA_DE_LUGAR = re.compile(r"\b(St|Mt|Ft)\.\s+$")
_TRAS_ABREVIATURA = re.compile(r"([\w.]+)\.\s+$")
MARCADORES = ("Xantor", "Zorvek", "Kalvorn", "Drevmal", "Quintar", "Bralvek")


def _al_inicio(frase: str, posicion: int) -> bool:
    previo = frase[:posicion]
    if _INICIO.search(previo) is None:
        return False
    tratamiento = _TRAS_ABREVIATURA.search(previo)
    return not (tratamiento and tratamiento.group(1).lower() in ABREVIATURAS)


def _es_nombre(palabra: str) -> bool:
    limpia = palabra.lower().replace("’", "'")
    return limpia not in NO_SON_NOMBRES and not (len(palabra) > 1 and palabra.isupper())


_PALABRA = re.compile(r"[^\W\d_]+", re.UNICODE)
_ACENTOS = {"a": "aá", "e": "eé", "i": "ií", "o": "oó", "u": "uú"}


def es_titulo(frase: str) -> bool:
    """«Chapter Three: The Keeper of Saltmarsh Light»: todas las palabras largas con mayúscula."""
    largas = [p for p in _PALABRA.findall(frase) if len(p) > 3]
    return len(largas) >= 2 and all(p[0].isupper() for p in largas)


def nombres_propios(frase: str, conocidos: frozenset[str] = frozenset()) -> list[str]:
    """Nombres propios de la frase, en orden y sin repetir.

    ``conocidos``: palabras que ya salieron como nombre en otra frase del mismo lote; así «Tobias» también
    se protege al comienzo de una frase («Tobias and the others followed»).
    """
    if es_titulo(frase):
        return []
    vistos: list[str] = []
    for m in _RACHA.finditer(frase):
        palabras = m.group(0).split()
        inicio = _al_inicio(frase, m.start())
        if inicio:
            comunes = 0
            while palabras and palabras[0].lower().replace("’", "'") in COMUNES_AL_INICIO:
                palabras = palabras[1:]
                comunes += 1
            # Una sola palabra con mayúscula al comienzo puede ser cualquier cosa: no se protege.
            if comunes == 0 and len(palabras) < 2 and not (palabras and palabras[0] in conocidos):
                continue
        while palabras and not _es_nombre(palabras[0]):
            palabras = palabras[1:]
        if not palabras:
            continue
        nombre = " ".join(palabras).rstrip("'’-")
        lugar = _ABREVIATURA_DE_LUGAR.search(frase[: m.start()])
        if lugar and palabras == m.group(0).split():
            nombre = f"{lugar.group(1)}. {nombre}"
        if nombre and nombre not in vistos:
            vistos.append(nombre)
    return vistos[: len(MARCADORES)]


def proteger(frase: str, nombres: list[str]) -> str:
    """Sustituye cada nombre por un marcador (el más largo primero, para no partir nombres compuestos)."""
    for i in sorted(range(len(nombres)), key=lambda k: -len(nombres[k])):
        frase = re.sub(rf"(?<!\w){re.escape(nombres[i])}(?!\w)", MARCADORES[i], frase)
    return frase


def _patron_marcador(marcador: str) -> re.Pattern[str]:
    """El marcador tal cual o con alguna tilde que el modelo le haya puesto («Xántor»)."""
    cuerpo = "".join(f"[{_ACENTOS[c]}]" if c in _ACENTOS else re.escape(c) for c in marcador.lower())
    return re.compile(rf"(?<!\w){cuerpo}(?!\w)", re.IGNORECASE)


def reponer(traduccion: str, nombres: list[str]) -> str | None:
    """Devuelve la traducción con los nombres repuestos, o None si algún marcador no sobrevivió."""
    for i, nombre in enumerate(nombres):
        patron = _patron_marcador(MARCADORES[i])
        if not patron.search(traduccion):
            return None
        traduccion = patron.sub(nombre.replace("\\", "\\\\"), traduccion)
    return traduccion


def palabras_de(nombres: list[str]) -> set[str]:
    return {p for n in nombres for p in n.split() if not p.endswith(".") and _es_nombre(p)}


def conservados(traduccion: str, nombres: list[str]) -> bool:
    return all(re.search(rf"(?<!\w){re.escape(n)}(?!\w)", traduccion) for n in nombres)

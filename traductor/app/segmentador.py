"""Parte un texto en frases sin perder nada de lo que hay entre ellas.

``partir(texto)`` devuelve piezas: las de tipo frase van al modelo; las de tipo separador (espacios,
saltos de línea, sangrías) se copian tal cual. Unir todas las piezas da exactamente el texto original.

No corta tras abreviaturas (Mr., Dr., St., Sra., etc.), iniciales (J. R. R.), números (3.5) ni puntos
suspensivos seguidos de minúscula. Las frases demasiado largas se parten por ; : o , cerca del centro
y, si no hay signos, por espacios (o a lo bruto): ninguna pieza supera el máximo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

ABREVIATURAS = frozenset(
    """mr mrs ms mx dr st jr sr prof rev revd hon gen col capt cpt lt sgt cmdr adm gov pres sen rep mt ft
    fr br sra srta dra dres sres lic ing arq av avda pág pp vol cap fig ed eds no nos núm vs etc approx
    est dept univ inc ltd co corp bros jan feb mar apr jun jul aug sep sept oct nov dec ene abr ago dic
    e.g i.e a.m p.m u.s u.k ud uds vd vds""".split()
)

# Fin de frase: signos finales, cierres opcionales, espacio, y algo que puede empezar una frase. Una raya
# tras el espacio también corta aunque siga minúscula: es el inciso del narrador en un diálogo en español
# («—¿Quién anda ahí? —preguntó.»); traducido aparte, el modelo no lo mezcla con la pregunta.
_FIN = re.compile(r"[.!?…]+[\"'”’»)\]]*(?=\s+(?:[—–]|[\"'“‘«¿¡(\[\-]*[A-ZÁÉÍÓÚÑÜ0-9]))")
_LINEAS = re.compile(r"(\s*\n\s*)")
_PALABRA_ANTES = re.compile(r"([\w.]+)\.$")


@dataclass(frozen=True)
class Pieza:
    texto: str
    es_frase: bool


def _es_abreviatura(previo: str) -> bool:
    """``previo`` es el texto hasta el punto incluido. True si ese punto no cierra una frase."""
    m = _PALABRA_ANTES.search(previo)
    if not m:
        return False
    palabra = m.group(1).lower()
    if palabra in ABREVIATURAS:
        return True
    # Iniciales: "J." "R." (una sola letra mayúscula antes del punto).
    return len(m.group(1)) == 1 and m.group(1).isupper()


def _dentro_de_cita(trozo: str) -> bool:
    """True si ``trozo`` deja una cita abierta: partirla dejaría comillas sueltas en cada mitad."""
    return trozo.count('"') % 2 == 1 or trozo.count("“") > trozo.count("”") or trozo.count("«") > trozo.count("»")


def _frases_de_linea(linea: str) -> list[str]:
    frases: list[str] = []
    inicio = 0
    for m in _FIN.finditer(linea):
        fin = m.end()
        signos = m.group(0)
        if signos.startswith(".") and not signos.startswith("..") and _es_abreviatura(linea[inicio : m.start() + 1]):
            continue
        if _dentro_de_cita(linea[inicio:fin]):
            continue
        frases.append(linea[inicio:fin])
        inicio = fin
    frases.append(linea[inicio:])
    return frases


def _partir_larga(frase: str, maximo: int) -> list[str]:
    """Parte una frase larga por el ; : o , más cercano al centro (recursivo). Conserva los espacios.

    Si no hay signos (NU-01: un texto válido sin puntuación), corta por el espacio más cercano al centro;
    si tampoco hay espacios (una "palabra" enorme), corta a ``maximo`` caracteres. Nunca devuelve un trozo
    más largo que ``maximo``: el modelo no admite más de 512 tokens y antes respondía 503.
    """
    if len(frase) <= maximo:
        return [frase]
    centro = len(frase) // 2
    for signos in ("; ", ": ", ", "):
        cortes = [m.end() for m in re.finditer(re.escape(signos), frase)]
        cortes = [c for c in cortes if 20 < c < len(frase) - 20]
        if cortes:
            corte = min(cortes, key=lambda c: abs(c - centro))
            return _partir_larga(frase[:corte], maximo) + _partir_larga(frase[corte:], maximo)
    cortes = [m.end() for m in re.finditer(r"\s+", frase) if m.start() > 0 and m.end() < len(frase)]
    corte = min(cortes, key=lambda c: abs(c - centro)) if cortes else maximo
    return _partir_larga(frase[:corte], maximo) + _partir_larga(frase[corte:], maximo)


def _agregar_frase(piezas: list[Pieza], trozo: str, maximo: int) -> None:
    """Añade ``trozo`` separando sus espacios de los bordes para que la frase vaya limpia al modelo."""
    limpio = trozo.strip()
    if not limpio:
        if trozo:
            piezas.append(Pieza(trozo, False))
        return
    izquierda = trozo[: len(trozo) - len(trozo.lstrip())]
    derecha = trozo[len(trozo.rstrip()) :]
    if izquierda:
        piezas.append(Pieza(izquierda, False))
    for parte in _partir_larga(limpio, maximo):
        parte_limpia = parte.rstrip()
        piezas.append(Pieza(parte_limpia, True))
        if len(parte) > len(parte_limpia):
            piezas.append(Pieza(parte[len(parte_limpia) :], False))
    if derecha:
        piezas.append(Pieza(derecha, False))


def partir(texto: str, max_caracteres_frase: int = 400) -> list[Pieza]:
    piezas: list[Pieza] = []
    for i, linea in enumerate(_LINEAS.split(texto)):
        if i % 2 == 1:  # separador de líneas (con sus espacios)
            piezas.append(Pieza(linea, False))
            continue
        for frase in _frases_de_linea(linea):
            _agregar_frase(piezas, frase, max_caracteres_frase)
    return [p for p in piezas if p.texto]

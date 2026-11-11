"""Lo que rodea a la frase y el modelo no debe tocar: rayas de diálogo, cursivas y estilo de comillas.

``preparar`` quita a la frase lo que el modelo estropearía (raya inicial, cursiva que envuelve la frase
entera, cursivas interiores, comillas tipográficas) y ``restaurar`` lo devuelve a la traducción.

Medido con Opus-MT (bitácora 2026-11-11): borra las comillas “” (las rectas las conserva), borra los
asteriscos de *cursiva* y conserva «» y las rayas pegadas (—así—). Las cursivas interiores se reponen en
el traductor con una segunda pasada (``marcar_enfasis`` / ``reponer_enfasis``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_RAYA_INICIAL = re.compile(r"^([—–]\s?|-\s)")
_CURSIVA_ENTERA = re.compile(r"^([*_])(?=\S)(.+?)(?<=\S)\1([.!?…]*)$")
_CURSIVA_INTERIOR = re.compile(r"(?<![\w*_])([*_])(?=[^\s*_])([^*_\n]+?)(?<=[^\s*_])\1(?![\w*_])")
_ENTRE_ANGULARES = re.compile(r"«\s*([^«»]+?)\s*»")
_ENTRE_RECTAS = re.compile(r'"\s*([^"]+?)\s*"')
_DOBLES_CURVAS = str.maketrans({"“": '"', "”": '"', "„": '"'})
_SIMPLES_CURVAS = str.maketrans({"‘": "'", "’": "'"})
_ANGULARES = str.maketrans({"«": '"', "»": '"'})
_LETRA = re.compile(r"[^\W\d_]", re.UNICODE)
# Inicio de cita: comillas al principio o tras espacio, raya, paréntesis o corchete.
_APERTURA_DOBLE = re.compile(r'(^|[\s(\[—–])"')
_APERTURA_SIMPLE = re.compile(r"(^|[\s(\[—–])'")
_APOSTROFO = re.compile(r"(?<=[^\W\d_])'(?=[^\W\d_])", re.UNICODE)
# Español (RAE): la coma va fuera de las comillas: «aquí,» dijo → «aquí», dijo.
_COMA_DENTRO = re.compile(r',(["”»’])(?=\s+[a-záéíóúñü])')


@dataclass(frozen=True)
class Preparada:
    nucleo: str  # la frase normalizada, con sus marcas de cursiva interiores (clave de la caché del lote)
    prefijo: str = ""
    sufijo: str = ""
    comillas: str = ""  # "" rectas · "curvas" “” · "angulares" «»
    simples_curvas: bool = False
    limpio: str = ""  # lo que va al modelo: el núcleo sin marcas de cursiva interiores
    enfasis: tuple[str, ...] = ()  # marca de cada cursiva interior, en orden ("*" o "_")

    @property
    def para_modelo(self) -> str:
        return self.limpio or self.nucleo


def tiene_letras(texto: str) -> bool:
    return _LETRA.search(texto) is not None


def preparar(frase: str) -> Preparada:
    prefijo = sufijo = ""
    nucleo = frase
    m = _RAYA_INICIAL.match(nucleo)
    if m and tiene_letras(nucleo[m.end() :]):
        prefijo = m.group(0)
        nucleo = nucleo[m.end() :]
    m2 = _CURSIVA_ENTERA.match(nucleo)
    if m2 and tiene_letras(m2.group(2)):
        prefijo += m2.group(1)
        sufijo = m2.group(1) + m2.group(3)
        nucleo = m2.group(2)
    comillas = ""
    if any(c in nucleo for c in "“”„"):
        comillas = "curvas"
    elif any(c in nucleo for c in "«»"):
        comillas = "angulares"
    simples = any(c in nucleo for c in "‘’")
    nucleo = nucleo.translate(_DOBLES_CURVAS).translate(_ANGULARES).translate(_SIMPLES_CURVAS)
    enfasis = tuple(m.group(1) for m in _CURSIVA_INTERIOR.finditer(nucleo) if tiene_letras(m.group(2)))
    limpio = _CURSIVA_INTERIOR.sub(lambda m: m.group(2), nucleo) if enfasis else ""
    return Preparada(nucleo, prefijo, sufijo, comillas, simples, limpio, enfasis)


def marcar_enfasis(prep: Preparada) -> str:
    """El núcleo con cada cursiva interior entre «» (el modelo las conserva y las mueve con la palabra)."""
    return _CURSIVA_INTERIOR.sub(lambda m: f"«{m.group(2)}»", prep.nucleo)


def reponer_enfasis(prep: Preparada, fluida: str, marcada: str) -> str | None:
    """Pone las cursivas en la traducción ``fluida`` usando lo que quedó entre «» en la ``marcada``.

    Si cada trozo marcado aparece una sola vez en la fluida, se envuelve allí (se conserva la fluidez).
    Si no, se usa la marcada con sus «» convertidas en la marca original. Si la marcada perdió alguna
    marca, None: el que llama se queda con la fluida sin cursivas.
    """
    if "«" not in marcada and '"' not in prep.nucleo:
        # A veces el modelo cambia «» por comillas rectas; si la frase no tenía comillas, valen igual.
        marcada = _ENTRE_RECTAS.sub(r"«\1»", marcada)
    trozos = _ENTRE_ANGULARES.findall(marcada)
    if len(trozos) != len(prep.enfasis):
        return None
    resultado = fluida
    for trozo, marca in zip(trozos, prep.enfasis, strict=True):
        patron = re.compile(rf"(?<!\w){re.escape(trozo)}(?!\w)", re.IGNORECASE)
        if len(patron.findall(resultado)) != 1:
            break
        resultado = patron.sub(f"{marca}\\g<0>{marca}", resultado)  # marca es "*" o "_": sin escapes
    else:
        return resultado
    marcas = iter(prep.enfasis)

    def con_marca(m: re.Match[str]) -> str:
        marca = next(marcas)
        return f"{marca}{m.group(1)}{marca}"

    return _ENTRE_ANGULARES.sub(con_marca, marcada)


def _alternar(texto: str, recta: str, apertura: re.Pattern[str], abre: str, cierra: str) -> str:
    texto = apertura.sub(lambda m: m.group(1) + abre, texto)
    return texto.replace(recta, cierra)


def restaurar(prep: Preparada, traduccion: str, destino: str) -> str:
    texto = f"{prep.prefijo}{traduccion.strip()}{prep.sufijo}"
    if destino == "es":
        texto = _COMA_DENTRO.sub(r"\1,", texto)
    if prep.comillas == "curvas":
        texto = _alternar(texto, '"', _APERTURA_DOBLE, "“", "”")
    elif prep.comillas == "angulares":
        texto = _alternar(texto, '"', _APERTURA_DOBLE, "«", "»")
    if prep.simples_curvas:
        texto = _APOSTROFO.sub("’", texto)
        texto = _alternar(texto, "'", _APERTURA_SIMPLE, "‘", "’")
    return texto

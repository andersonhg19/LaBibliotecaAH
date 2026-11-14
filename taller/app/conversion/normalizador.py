"""Normalizador de texto (plan-maestro §5.4).

Dos capas:
- **visual**: lo que se ve en el lector. Solo se corrigen defectos de extracción (ligaduras, guiones de corte de
  línea, espacios duros, caracteres invisibles, Unicode NFC). Nunca se "reescribe" el texto.
- **voz**: lo que se le entrega al motor TTS. Parte del texto visual de la frase y expande abreviaturas, números
  romanos de títulos/siglos/reyes, fechas numéricas, y quita marcadores de nota al pie.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable

from .numeros import MESES, numero_a_palabras, ordinal_o_cardinal, romano_a_entero

# ---------------------------------------------------------------- capa visual

LIGADURAS = {
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "ﬅ": "st",
    "ﬆ": "st",
    "Ĳ": "IJ",
    "ĳ": "ij",
}
_INVISIBLES = dict.fromkeys(map(ord, "­​‌‍⁠﻿"), None)
_ESPACIOS_DUROS = dict.fromkeys(map(ord, "             　"), " ")
# Caracteres de control (QA DA-03): XML no los admite y no son texto. Salto de página y tabulador vertical pasan a
# espacio; el resto de C0 (salvo \t \n \r), DEL, C1 y los no-caracteres U+FFFE/U+FFFF se quitan.
_CONTROLES: dict[int, str | None] = {c: None for c in range(0x20) if chr(c) not in "\t\n\r"}
_CONTROLES.update(dict.fromkeys(range(0x7F, 0xA0)))
_CONTROLES.update({0x0B: " ", 0x0C: " ", 0xFFFE: None, 0xFFFF: None})
_TABLA_VISUAL = {**{ord(k): v for k, v in LIGADURAS.items()}, **_INVISIBLES, **_ESPACIOS_DUROS, **_CONTROLES}

_GUIONES_CORTE = "-‐­"


# letras de alfabetos que separan palabras con espacios (no CJK: ahí el ZWSP solo marca dónde se puede cortar)
_LETRA_CON_ESPACIOS = r"[^\W\d_\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff]"
_ZWSP_ENTRE_LETRAS = re.compile(rf"(?<={_LETRA_CON_ESPACIOS})\u200b+(?={_LETRA_CON_ESPACIOS})")


def zwsp_separa(texto: str) -> bool:
    """¿Este texto usa el espacio de ancho cero COMO SEPARADOR de palabras? Sí cuando hay al menos dos entre letras y
    no menos que espacios normales («Texto<ZWSP>con<ZWSP>espacios», V-16). Uno suelto en una frase con espacios es un
    punto de corte permitido DENTRO de una palabra («Pala<ZWSP>bras»): no se parte la palabra (V-NUEVO-8)."""
    entre = len(_ZWSP_ENTRE_LETRAS.findall(texto))
    return entre >= 2 and entre >= len(re.findall(r"\s+", texto.strip()))


def normalizar_visual(texto: str) -> str:
    """Corrige defectos de extracción sin cambiar el contenido."""
    if not texto:
        return texto
    if "\u200b" in texto and zwsp_separa(texto):
        # (0.4.0, V-16) algunos EPUB separan palabras con espacios de ancho cero: entre letras pasan a espacio (si no,
        # «Texto<ZWSP>con» quedaba «Textocon» en el lector y en la voz); en otro caso se quitan como antes
        texto = _ZWSP_ENTRE_LETRAS.sub(" ", texto)
    return unicodedata.normalize("NFC", texto.translate(_TABLA_VISUAL))


def unir_lineas(lineas: list[str]) -> str:
    """Une líneas de un párrafo deshaciendo los guiones de corte de línea ("con-" + "tinuar" → "continuar")."""
    resultado = ""
    for linea in lineas:
        linea = linea.strip()
        if not linea:
            continue
        if not resultado:
            resultado = linea
            continue
        resultado = unir_dos(resultado, linea)
    return resultado


def unir_dos(previo: str, siguiente: str) -> str:
    """Une dos fragmentos de línea; quita el guion de corte si la palabra continúa en minúscula."""
    previo = previo.rstrip()
    siguiente = siguiente.lstrip()
    if not previo:
        return siguiente
    if not siguiente:
        return previo
    if previo[-1] == "­":
        return previo[:-1] + siguiente
    if (
        previo[-1] in _GUIONES_CORTE
        and len(previo) >= 2
        and previo[-2].isalpha()
        and siguiente[0].isalpha()
        and siguiente[0].islower()
    ):
        return previo[:-1] + siguiente
    return previo + " " + siguiente


# ---------------------------------------------------------------- abreviaturas

# Abreviaturas que NUNCA terminan una frase (tratamientos y las que van seguidas de número o nombre).
ABREVIATURAS_FUERTES = {
    "sr.",
    "sres.",
    "sra.",
    "sras.",
    "srta.",
    "srtas.",
    "dr.",
    "dres.",
    "dra.",
    "dras.",
    "ud.",
    "uds.",
    "vd.",
    "vds.",
    "dña.",
    "d.",
    "lic.",
    "lcdo.",
    "lcda.",
    "ing.",
    "prof.",
    "profa.",
    "sto.",
    "sta.",
    "pág.",
    "págs.",
    "p.",
    "pp.",
    "núm.",
    "nº.",
    "n.º",
    "cap.",
    "caps.",
    "vol.",
    "vols.",
    "art.",
    "arts.",
    "fig.",
    "figs.",
    "av.",
    "avda.",
    "excmo.",
    "excma.",
    "ilmo.",
    "ilma.",
    "mons.",
    "fr.",
    "gral.",
    "cía.",
    "tel.",
    "ee.",
    "uu.",
    "ej.",
    "cf.",
    "vid.",
    "op.",
    "cit.",
    "ed.",
    "trad.",
    "coord.",
    "dir.",
    "aprox.",
    "ca.",
    "st.",
    "mr.",
    "mrs.",
    "ms.",
    "jr.",
    "núms.",
    "dpto.",
    "depto.",
    "vs.",
}
# Abreviaturas que pueden cerrar una frase (si sigue mayúscula, se corta).
ABREVIATURAS_DEBILES = {"etc.", "a. c.", "d. c.", "izq.", "dcha.", "admón.", "aprox."}

_EXPANSIONES = [
    # (patrón, reemplazo) — el patrón se busca con límites de palabra a la izquierda
    (r"EE\.\s?UU\.", "Estados Unidos"),
    (r"p\.\s?ej\.", "por ejemplo"),
    (r"a\.\s?C\.", "antes de Cristo"),
    (r"d\.\s?C\.", "después de Cristo"),
    (r"[Nn]\.\s?º|[Nn]º", "número"),
    (r"Sres\.", "señores"),
    (r"Sras\.", "señoras"),
    (r"Srta\.", "señorita"),
    (r"Sr\.", "señor"),
    (r"Sra\.", "señora"),
    (r"Dres\.", "doctores"),
    (r"Dras\.", "doctoras"),
    (r"Dr\.", "doctor"),
    (r"Dra\.", "doctora"),
    (r"Uds\.", "ustedes"),
    (r"Ud\.", "usted"),
    (r"Vds\.", "ustedes"),
    (r"Vd\.", "usted"),
    (r"Dña\.", "doña"),
    (r"Lic\.", "licenciado"),
    (r"Lcdo\.", "licenciado"),
    (r"Lcda\.", "licenciada"),
    (r"Ing\.", "ingeniero"),
    (r"Profa\.", "profesora"),
    (r"Prof\.", "profesor"),
    (r"Sto\.", "santo"),
    (r"Sta\.", "santa"),
    (r"Excmo\.", "excelentísimo"),
    (r"Excma\.", "excelentísima"),
    (r"Ilmo\.", "ilustrísimo"),
    (r"Ilma\.", "ilustrísima"),
    (r"Mons\.", "monseñor"),
    (r"Gral\.", "general"),
    (r"Cía\.", "compañía"),
    (r"Avda\.", "avenida"),
    (r"Av\.", "avenida"),
    (r"págs\.", "páginas"),
    (r"pág\.", "página"),
    (r"núms\.", "números"),
    (r"núm\.", "número"),
    (r"caps\.", "capítulos"),
    (r"cap\.", "capítulo"),
    (r"vols\.", "volúmenes"),
    (r"vol\.", "volumen"),
    (r"etc\.", "etcétera"),
    (r"aprox\.", "aproximadamente"),
    (r"tel\.", "teléfono"),
    (r"izq\.", "izquierda"),
    (r"dcha\.", "derecha"),
    (r"admón\.", "administración"),
    (r"§", "sección"),
    (r"&(?!\w+=)", " y "),  # "AT&T" → "AT y T" (DA-25); no dentro de una URL ("?x=1&y=2", 0.4.0)
]

_PALABRAS_TITULO = (
    r"(?:Cap[ií]tulo|CAP[IÍ]TULO|Parte|PARTE|Libro|LIBRO|Tomo|TOMO|Secci[oó]n|SECCI[OÓ]N|Canto|CANTO|Acto|ACTO"
    r"|Escena|ESCENA|Lecci[oó]n|LECCI[OÓ]N|Volumen|VOLUMEN|Cuaderno|Jornada)"
)
_ROMANO = r"[IVXLCDM]+"
# Ordinales de reyes/papas. "X" y "V" solas son ambiguas ("Malcolm X", "Generación X", "Grupo V", DA-24):
# solo se leen como ordinal detrás de un nombre de rey o papa conocido.
_REYES = r"(?:XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II)"
_NOMBRES_REGIOS = (
    r"(?:Alfonso|Alejandro|Amadeo|Benedicto|Bonifacio|Carlos|Catalina|Clemente|Constantino|Eduardo|Enrique|"
    r"Federico|Felipe|Fernando|Francisco|Gregorio|Guillermo|Gustavo|Inocencio|Isabel|Iván|Jaime|Jorge|Juan|"
    r"Juana|León|Leopoldo|Luis|Manuel|María|Martín|Napoleón|Nicolás|Pablo|Pedro|Pío|Ramiro|Ricardo|Sancho|"
    r"Sixto|Urbano|Víctor|Victoria)"
)
_UNIDADES = {"km": "kilómetros", "hm": "hectómetros", "dm": "decímetros", "cm": "centímetros", "mm": "milímetros"}
_UNIDADES["m"] = "metros"
_POTENCIA = {"²": "cuadrados", "³": "cúbicos"}
_SUPERINDICES = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


class _Regla:
    __slots__ = ("funcion", "grupo", "patron")

    def __init__(self, patron: str, funcion: Callable[[re.Match[str]], str | None], grupo: int = 0, flags: int = 0):
        self.patron = re.compile(patron, flags)
        self.funcion = funcion
        self.grupo = grupo


def _rom_cardinal(m: re.Match, g: int) -> str | None:
    n = romano_a_entero(m.group(g))
    return None if n is None else numero_a_palabras(n)


def _fecha(m: re.Match) -> str | None:
    d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= d <= 31 and 1 <= mes <= 12):
        return None
    return f"{d} de {MESES[mes - 1]} de {a}"


def _construir_reglas() -> list[_Regla]:
    reglas: list[_Regla] = []
    # 1) Marcadores de nota al pie: [12], [*], superíndices numéricos
    reglas.append(_Regla(r"\[\d{1,3}\]|\[\*\]", lambda m: ""))
    # superíndices (DA-25): unidad² / unidad³ → "metros cuadrados"; 10³ → "10 elevado a 3"; tras una palabra es
    # una llamada de nota y se quita
    reglas.append(
        _Regla(
            r"(?<=\d)\s?(km|hm|dm|cm|mm|m)([²³])(?!\w)",
            lambda m: f" {_UNIDADES[m.group(1)]} {_POTENCIA[m.group(2)]}",
        )
    )
    reglas.append(_Regla(r"(?<=\d)[¹²³⁰⁴-⁹]+", lambda m: f" elevado a {m.group(0).translate(_SUPERINDICES)}"))
    # tras una letra suelta es una potencia, no una nota: «x²» → «x al cuadrado» (V-NUEVO-6)
    reglas.append(
        _Regla(
            r"(?<![^\W\d_])([A-Za-z])([²³])(?!\w)",
            lambda m: f"{m.group(1)} al {'cuadrado' if m.group(2) == '²' else 'cubo'}",
        )
    )
    reglas.append(_Regla(r"[¹²³⁰⁴-⁹]+", lambda m: ""))
    # 2) "Capítulo IV", "Parte II" (en títulos y en el texto)
    reglas.append(_Regla(rf"(?<!\w){_PALABRAS_TITULO}\s+({_ROMANO})\b", lambda m: _rom_cardinal(m, 1), grupo=1))
    # 3) "siglo XIX", "siglos XV y XVI" (solo el primero)
    reglas.append(_Regla(rf"(?<!\w)(?:[Ss]iglos?|SIGLOS?)\s+({_ROMANO})\b", lambda m: _rom_cardinal(m, 1), grupo=1))
    # 4) Reyes / papas: "Felipe II" → "Felipe segundo" (sin "I" sola por ambigüedad)
    reglas.append(
        _Regla(
            rf"(?<!\w)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,}}\s+({_REYES})\b(?!\.\w)",
            lambda m: ordinal_o_cardinal(romano_a_entero(m.group(1)) or 0),
            grupo=1,
        )
    )
    reglas.append(
        _Regla(
            rf"(?<!\w){_NOMBRES_REGIOS}\s+(X|V)\b(?!\.\w)",
            lambda m: ordinal_o_cardinal(romano_a_entero(m.group(1)) or 0),
            grupo=1,
        )
    )
    # 5) Fechas dd/mm/aaaa
    reglas.append(_Regla(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", _fecha))
    # 6) Abreviaturas
    for patron, reemplazo in _EXPANSIONES:
        izq = r"(?<![\wÁÉÍÓÚáéíóúñÑ])" if patron[0].isalpha() else ""
        reglas.append(_Regla(izq + "(?:" + patron + ")", (lambda r: lambda m: r)(reemplazo)))
    return reglas


_REGLAS = _construir_reglas()
_REGLA_TITULO_SOLO_ROMANO = re.compile(rf"^\s*({_ROMANO})\s*(?:[.:\-–—]\s*|$)")
_PUNTUACION_CIERRE = set(".,;:!?)]}»”’…")


def preparar_voz(texto: str, excluidos: set[int] | None = None, es_titulo: bool = False) -> str:
    """Texto para el motor de voz a partir del texto visual de UNA frase.

    `excluidos`: posiciones de caracteres que no se leen (p. ej. dentro de <sup> de nota al pie).
    """
    excluidos = excluidos or set()
    spans: list[tuple[int, int, int, str]] = []
    for prioridad, regla in enumerate(_REGLAS):
        for m in regla.patron.finditer(texto):
            reemplazo = regla.funcion(m)
            if reemplazo is None:
                continue
            ini, fin = m.span(regla.grupo)
            spans.append((ini, fin, prioridad, reemplazo))
    if es_titulo:
        mt = _REGLA_TITULO_SOLO_ROMANO.match(texto)
        if mt:
            n = romano_a_entero(mt.group(1))
            if n is not None:
                spans.append((mt.start(1), mt.end(1), -1, numero_a_palabras(n)))
    # selección voraz sin solapes: por inicio, luego prioridad
    spans.sort(key=lambda s: (s[0], s[2]))
    elegidos: list[tuple[int, int, str]] = []
    fin_ultimo = 0
    for ini, fin, _p, rep in spans:
        if ini < fin_ultimo or fin <= ini:
            continue
        elegidos.append((ini, fin, rep))
        fin_ultimo = fin

    piezas: list[str] = []
    pos = 0
    for ini, fin, rep in elegidos:
        piezas.append(_sin_excluidos(texto, pos, ini, excluidos))
        if rep and texto[fin - 1 : fin] == "." and _cierra_frase(texto, fin):
            rep += "."
        piezas.append(rep)
        pos = fin
    piezas.append(_sin_excluidos(texto, pos, len(texto), excluidos))
    return _limpiar_espacios("".join(piezas))


def _sin_excluidos(texto: str, a: int, b: int, excluidos: set[int]) -> str:
    if not excluidos:
        return texto[a:b]
    return "".join(c for i, c in enumerate(texto[a:b], start=a) if i not in excluidos)


def _cierra_frase(texto: str, fin: int) -> bool:
    resto = texto[fin:].strip()
    return resto == "" or all(c in _PUNTUACION_CIERRE for c in resto)


def _limpiar_espacios(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r" ([.,;:!?)\]}»”…])", r"\1", s)
    return s


def tiene_contenido_hablable(texto: str) -> bool:
    return any(c.isalnum() for c in texto)

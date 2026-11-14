"""Texto que de verdad se manda al motor de voz (contratos 0.4.0, C8) y su mapa de vuelta al texto de voz.

`frases/cap-NNN.json` guarda, por frase, el texto visual (`texto`) y el de voz (`voz`, que hace la conversión:
abreviaturas, romanos de títulos, notas fuera…). Esta capa se aplica al SINTETIZAR, sobre `voz`, y sirve igual para
los libros ya convertidos (no hace falta reconvertir nada):

- números con formato español para TODAS las voces (las de México y EE. UU. leían «1.250» como «uno punto dos cinco
  cero»): miles, decimales, ordinales, monedas, porcentajes, horas, fracciones, «2x1»;
- abreviaturas que faltaban (art., S.A., C/, s. XIX…), URL / correo / ruta breves, emojis fuera, invisibles fuera;
- alfabetos no latinos y frases enteras en otro idioma: se marcan para leerlas con una voz multilingüe de edge;
- diccionario de pronunciación (opcional, por libro).

Cada carácter del resultado sabe de qué tramo del texto de voz sale (`mapa`), así la alineación de palabras lleva
el resaltado al texto visual original («1.250» resalta «1.250» aunque se diga «mil doscientos cincuenta»).
Cambiar estas reglas cambia el texto de las frases afectadas y, con él, su clave de caché: solo esas se vuelven a
pedir a edge; el resto de la caché sigue valiendo.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from ..conversion.metadatos import normalizar_idioma
from ..conversion.normalizador import zwsp_separa
from ..conversion.numeros import apocopar, femenino, numero_a_palabras, ordinal, romano_a_entero

# ---------------------------------------------------------------- resultado


@dataclass
class Lectura:
    texto: str
    # por carácter de `texto`: tramo [a, b) del texto de voz del que sale
    mapa: list[tuple[int, int]] = field(default_factory=list)
    # None = español (voz elegida); "en"/"fr"/"it"/"pt"/"de"/"la"… = frase (o libro entero) en otro idioma → voz
    # multilingüe; "otro" = alfabeto no latino
    idioma: str | None = None

    @property
    def hablable(self) -> bool:
        if self.idioma == "otro":
            return any(c.isalpha() for c in self.texto)
        return any(es_latina(c) or c in "0123456789" for c in self.texto)


def es_latina(c: str) -> bool:
    """Letra del alfabeto latino (con tildes y diéresis). «ª»/«º» sueltas no cuentan: edge no las lee."""
    if not c.isalpha() or c in "ªº":
        return False
    if c.isascii():
        return True
    try:
        return "LATIN" in unicodedata.name(c)
    except ValueError:
        return False


# ---------------------------------------------------------------- números


_NUM = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+"
_ANTES_NUM = r"(?<![\w.,])"
_DESPUES_NUM = r"(?![.,]?\d)"
# palabras masculinas acabadas en -as (para no decir «doscientas días»)
_MASCULINAS_AS = {
    "días",
    "mapas",
    "problemas",
    "temas",
    "sistemas",
    "programas",
    "idiomas",
    "planetas",
    "poemas",
    "dramas",
    "climas",
    "esquemas",
    "telegramas",
    "gramas",
    "kilogramas",
    "pijamas",
    "fantasmas",
    "dilemas",
    "lemas",
    "cometas",
}


def _es_femenino(siguiente: str) -> bool:
    p = siguiente.lower()
    return p.endswith("as") and len(p) > 3 and p not in _MASCULINAS_AS


def _decimales(d: str) -> str:
    """«5» → «cinco»; «50» → «cincuenta»; «05» → «cero cinco»; más de 3 cifras, de una en una."""
    if len(d) <= 3 and not d.startswith("0"):
        return numero_a_palabras(int(d))
    return " ".join(numero_a_palabras(int(c)) for c in d)


def numero_en_palabras(literal: str, genero: str = "m") -> str:
    """«1.250» → «mil doscientos cincuenta»; «3,5» → «tres coma cinco»; «12.345.678» → «doce millones…»."""
    entero, _, dec = literal.partition(",")
    palabras = numero_a_palabras(int(entero.replace(".", "")))
    if genero == "f":
        palabras = femenino(palabras)
    if dec:
        palabras += " coma " + _decimales(dec)
    return palabras


def _siguiente_palabra(texto: str, fin: int) -> str:
    m = re.match(r"\s*([^\W\d_]+)", texto[fin:])
    return m.group(1) if m else ""


# monedas: símbolo o código → (singular, plural, femenina, céntimos)
_MONEDAS: dict[str, tuple[str, str, bool, str]] = {
    "$": ("dólar", "dólares", False, "centavos"),
    "US$": ("dólar", "dólares", False, "centavos"),
    "USD": ("dólar", "dólares", False, "centavos"),
    "€": ("euro", "euros", False, "céntimos"),
    "EUR": ("euro", "euros", False, "céntimos"),
    "£": ("libra", "libras", True, "peniques"),
    "GBP": ("libra", "libras", True, "peniques"),
    "MXN": ("peso mexicano", "pesos mexicanos", False, "centavos"),
    "COP": ("peso colombiano", "pesos colombianos", False, "centavos"),
    "ARS": ("peso argentino", "pesos argentinos", False, "centavos"),
    "CLP": ("peso chileno", "pesos chilenos", False, "centavos"),
    "PEN": ("sol", "soles", False, "céntimos"),
}
_SIMBOLOS = r"US\$|\$|€|£"
_CODIGOS = r"USD|EUR|GBP|MXN|COP|ARS|CLP|PEN"


def _dinero(literal: str, moneda: str) -> str:
    singular, plural, fem, centimos = _MONEDAS[moneda]
    entero, _, dec = literal.partition(",")
    n = int(entero.replace(".", ""))
    palabras = numero_a_palabras(n)
    palabras = femenino(palabras) if fem else apocopar(palabras)
    nombre = singular if n == 1 else plural
    if n >= 1_000_000 and n % 1_000_000 == 0:
        nombre = "de " + nombre  # «un millón de dólares»
    salida = f"{palabras} {nombre}"
    if dec:
        if len(dec) == 2 and int(dec) > 0:
            salida += f" con {numero_a_palabras(int(dec))} {centimos}"
        elif int(dec) > 0:
            salida = f"{palabras} coma {_decimales(dec)} {plural}"
    return salida


def _franja(h: int, sufijo: str) -> tuple[int, str]:
    """(V-NUEVO-2) «7:30 a. m.» / «3 p. m.»: hora de 12 y la franja del día que se dice en español."""
    h12 = h % 12 or 12
    if sufijo == "a":
        return h12, "de la noche" if h12 == 12 else "de la madrugada" if h12 < 6 else "de la mañana"
    if h12 == 12:
        return h12, "del mediodía"
    return h12, "de la tarde" if h12 < 8 else "de la noche"


def _hora_am_pm(m: re.Match[str]) -> str | None:
    h, minutos = int(m.group(1)), int(m.group(2) or 0)
    if not 1 <= h <= 12:
        return None
    h12, franja = _franja(h, m.group(3).lower())
    if minutos == 0:
        return f"{femenino(numero_a_palabras(h12))} {franja}"
    return f"{_hora(h12, minutos)} {franja}"


def _hora(h: int, m: int) -> str:
    horas = femenino(numero_a_palabras(h))  # «la una», «las veintiuna»
    if m == 0:
        return f"{horas} en punto" if 1 <= h <= 12 else f"{horas} horas"
    if m == 15:
        return f"{horas} y cuarto"
    if m == 30:
        return f"{horas} y media"
    return f"{horas} y {numero_a_palabras(m)}"


_FRACCIONES = {
    2: ("medio", "medios"),
    3: ("tercio", "tercios"),
    4: ("cuarto", "cuartos"),
    5: ("quinto", "quintos"),
    6: ("sexto", "sextos"),
    7: ("séptimo", "séptimos"),
    8: ("octavo", "octavos"),
    9: ("noveno", "novenos"),
    10: ("décimo", "décimos"),
}


def _fraccion(a: int, b: int) -> str:
    singular, plural = _FRACCIONES[b]
    return f"{apocopar(numero_a_palabras(a))} {singular if a == 1 else plural}"


_SUFIJO_ORDINAL = {
    "º": "m",
    "ª": "f",
    "o": "m",
    "a": "f",
    "er": "apo",
    "ro": "m",
    "ra": "f",
    "do": "m",
    "da": "f",
    "to": "m",
    "ta": "f",
    "mo": "m",
    "ma": "f",
    "vo": "m",
    "va": "f",
    "no": "m",
    "na": "f",
}


_SIN_APOCOPE = {"de", "del", "y", "o", "u", "e", "en", "a", "al", "que"}


def _ordinal(m: re.Match[str]) -> str | None:
    n = int(m.group(1))
    genero = _SUFIJO_ORDINAL.get(m.group(2).lower())
    if genero is None or not 1 <= n <= 100:
        return None
    siguiente = _siguiente_palabra(m.string, m.end()).lower()
    # «1.º día» → «primer día», pero «1.º de mayo» → «primero de mayo»
    apocope = genero == "apo" or (genero == "m" and bool(siguiente) and siguiente not in _SIN_APOCOPE)
    return ordinal(n, "f" if genero == "f" else "m", apocope=apocope)


def _grupo_telefono(g: str) -> str:
    """«300» → «trescientos»; «4567» → «cuarenta y cinco sesenta y siete»; «05» → «cero cinco»."""
    if g.startswith("0") or len(g) > 4:
        return " ".join(numero_a_palabras(int(c)) for c in g)
    if len(g) == 4:
        return f"{_grupo_telefono(g[:2])} {_grupo_telefono(g[2:])}"
    return numero_a_palabras(int(g))


def _telefono(m: re.Match[str]) -> str | None:
    """(V-NUEVO-7) «+57 300 123 4567» → «más cincuenta y siete, trescientos, ciento veintitrés, cuarenta y cinco
    sesenta y siete»: por grupos, como se dicta un teléfono, y no cifra a cifra."""
    texto = m.group(0)
    grupos = re.findall(r"\d+", texto)
    if sum(len(g) for g in grupos) < 7:
        return None
    return ("más " if texto.startswith("+") else "") + ", ".join(_grupo_telefono(g) for g in grupos)


# ---------------------------------------------------------------- URL, correo, ruta


def _dominio(url: str) -> str:
    u = url if "://" in url else "//" + url
    host = (urlsplit(u).hostname or "").removeprefix("www.")
    return " punto ".join(p for p in host.split(".") if p)


def _url(m: re.Match[str]) -> str | None:
    dominio = _dominio(m.group(0))
    return f"enlace a {dominio}" if dominio else None


def _correo(m: re.Match[str]) -> str:
    usuario, _, dominio = m.group(0).partition("@")
    return " ".join(
        (
            " punto ".join(re.split(r"[._+-]+", usuario)),
            "arroba",
            " punto ".join(dominio.split(".")),
        )
    )


# ---------------------------------------------------------------- reglas


class _Regla:
    __slots__ = ("formato_es", "funcion", "grupo", "patron")

    def __init__(
        self,
        patron: str,
        funcion: Callable[[re.Match[str]], str | None],
        grupo: int = 0,
        flags: int = 0,
        formato_es: bool = False,
    ):
        self.patron = re.compile(patron, flags)
        self.funcion = funcion
        self.grupo = grupo
        # solo con números en formato español (punto de miles, coma decimal): no en libros en inglés
        self.formato_es = formato_es


def _fijo(texto: str) -> Callable[[re.Match[str]], str]:
    return lambda _m: texto


_EMOJIS = (
    "[\U0001f000-\U0001faff\u2600-\u27bf\u2b00-\u2bff\u2190-\u21ff\u2300-\u23ff\u25a0-\u25ff"
    "\ufe00-\ufe0f\u200d\u20e3\U000e0020-\U000e007f]+"
)
_INVISIBLES = "[\u200c\u200e\u200f\u2060\ufeff\u00ad]"

# (patrón, reemplazo): abreviaturas que la conversión no expandía (V-09). Distinguen mayúsculas.
_ABREVIATURAS = [
    (r"Por\s[Ee]j\.", "Por ejemplo"),
    (r"por\s[Ee]j\.", "por ejemplo"),
    (r"[Pp]\.\s?[Ee]j\.", "por ejemplo"),
    (r"[Ee]j\.(?=\s?[,:\d])", "ejemplo"),
    (r"[Vv]s\.", "contra"),
    (r"[Aa]rts\.", "artículos"),
    (r"[Aa]rt\.", "artículo"),
    (r"S\.\s?A\.(?!\w)", "sociedad anónima"),
    (r"S\.\s?L\.(?!\w)", "sociedad limitada"),
    (r"Fdo\.", "firmado"),
    (r"Hnos\.", "hermanos"),
    (r"Pza\.", "plaza"),
    (r"D(?:e)?pto\.", "departamento"),
    (r"C/(?=\s?[A-ZÁÉÍÓÚÑ])", "calle "),
    (r"[Kk]m\.(?=\s?\d)", "kilómetro"),
    (r"ss\.", "siguientes"),
    (r"vv\.", "versos"),
    (r"s\.\s?(?=[IVX]+\b)", "siglo "),
]


_UNIDADES = {"km": "kilómetros", "cm": "centímetros", "mm": "milímetros", "m": "metros"}


def _unidad_al_cuadrado(m: re.Match[str]) -> str:
    return f" {_UNIDADES[m.group(1)]} {'cuadrados' if m.group(2) == '²' else 'cúbicos'}"


def _zwsp(m: re.Match[str]) -> str:
    """Espacio de ancho cero: separa palabras solo en un tramo que lo usa como separador (V-16, R2-1); dentro de una
    palabra («Pala<ZWSP>bras», un punto de corte permitido) se quita sin partirla (V-NUEVO-8). Mismo criterio que el
    lector."""
    return " " if zwsp_separa(m.string, m.start()) else ""


def _construir_neutras() -> list[_Regla]:
    """Reglas que valen en cualquier idioma (las únicas que se aplican a un libro que no está en español)."""
    r: list[_Regla] = []
    r.append(_Regla(_EMOJIS, _fijo(" ")))
    r.append(_Regla(_INVISIBLES, _fijo("")))
    r.append(_Regla("\u200b", _zwsp))
    # π suelta («π es infinito»): la voz española la borraba con las demás letras griegas (V-NUEVO-6)
    r.append(_Regla(r"(?<![^\W\d_])π(?![^\W\d_])", _fijo(" pi ")))
    return r


def _construir_reglas() -> list[_Regla]:
    r = _construir_neutras()
    # superíndice tras una variable o un número: «x²» → «x al cuadrado» («m²» lo lee bien edge) (V-NUEVO-6)
    r.append(
        _Regla(
            r"(?<![^\W\d_])([a-ln-zA-Z]|\d+|\))([²³])(?!\w)",
            lambda m: f"{m.group(1)} al {'cuadrado' if m.group(2) == '²' else 'cubo'}",
        )
    )
    # «5 m²», «3 km²», «2 m³»: la unidad entera («m dos» si no)
    r.append(_Regla(r"(?<=\d)\s?(km|cm|mm|m)([²³])(?!\w)", _unidad_al_cuadrado))
    # teléfonos: con prefijo de país, con el prefijo entre paréntesis o 300-123-4567 (V-NUEVO-7)
    r.append(
        _Regla(
            r"(?<![\w+])(?:\+\d{1,3}(?:[ .-]?\d{1,4}){2,5}|\(\d{1,4}\)\s?\d{2,4}(?:[ -]\d{2,4}){1,3}"
            r"|\d{3}-\d{3}-\d{4})(?![\d,.]?\d)",
            _telefono,
        )
    )
    # URL, correo, ruta (antes que nada que mire números o puntos)
    r.append(_Regla(r"(?:https?://|www\.)[^\s<>\"«»“”]*[^\s<>\"«»“”.,;:!?)\]]", _url, flags=re.IGNORECASE))
    r.append(_Regla(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", _correo))
    r.append(_Regla(r"(?<![\w])[A-Za-z]:\\[^\s]+", _fijo("una ruta de archivo")))
    r.append(_Regla(r"(?<![\w.:/])/(?:[\w.-]+/)+[\w.-]*", _fijo("una ruta de archivo")))
    # dinero
    r.append(
        _Regla(
            rf"(?<![\w$€£])({_SIMBOLOS}|(?:{_CODIGOS})\s)\s?({_NUM}){_DESPUES_NUM}",
            lambda m: _dinero(m.group(2), m.group(1).strip()),
        )
    )
    r.append(
        _Regla(
            rf"{_ANTES_NUM}({_NUM})\s?({_SIMBOLOS}|(?:{_CODIGOS})(?!\w))",
            lambda m: _dinero(m.group(1), m.group(2)),
        )
    )
    # porcentaje
    r.append(_Regla(rf"{_ANTES_NUM}({_NUM})\s?%", lambda m: numero_en_palabras(m.group(1)) + " por ciento"))
    # horas: 7:30 a. m., 3 p. m. (antes que las de 24 h: «a. m.» sonaba «AM»), 22:00, 7:30, 10.30 h, 10 h
    r.append(
        _Regla(
            r"(?<![\d:.,])(\d{1,2})(?::([0-5]\d))?\s?([AaPp])\.?\s?[Mm]\.?(?!\w)",
            _hora_am_pm,
        )
    )
    r.append(
        _Regla(
            r"(?<![\d:.,])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?:\s?(?:h|hrs?)\b\.?)?",
            lambda m: _hora(int(m.group(1)), int(m.group(2))),
        )
    )
    r.append(
        _Regla(
            r"(?<![\d.,])([01]?\d|2[0-3])\.([0-5]\d)\s?(?:h|hrs?)\b\.?",
            lambda m: _hora(int(m.group(1)), int(m.group(2))),
        )
    )
    # ordinales: 1.º, 2.ª, 3.er, 1er, 2do, 4ta
    r.append(_Regla(r"(?<![\w.,])(\d{1,3})\s?\.?\s?([ºª])", _ordinal))
    r.append(_Regla(r"(?<![\w.,])(\d{1,3})\.?(er|ro|ra|do|da|to|ta|mo|ma|vo|va|no|na)\b", _ordinal))
    # fracciones simples: 1/2, 3/4
    r.append(_Regla(r"(?<![\d/.,])([1-9])/([2-9]|10)(?![\d/])", lambda m: _fraccion(int(m.group(1)), int(m.group(2)))))
    # 2x1, 4x4, x2
    r.append(
        _Regla(
            r"(?<![\w.,])(\d+)\s?[x×]\s?(\d+)(?![\w.,]*\d)",
            lambda m: f"{numero_en_palabras(m.group(1))} por {numero_en_palabras(m.group(2))}",
        )
    )
    r.append(_Regla(r"(?<![\w])[x×](\d+)(?!\w)", lambda m: "por " + numero_en_palabras(m.group(1))))
    # miles y decimales con formato español (la regla que más falla con las voces de MX/US)
    r.append(
        _Regla(
            rf"{_ANTES_NUM}(\d{{1,3}}(?:\.\d{{3}})+(?:,\d+)?|\d+,\d+){_DESPUES_NUM}",
            _numero_con_genero,
            formato_es=True,
        )
    )
    for patron, reemplazo in _ABREVIATURAS:
        r.append(_Regla(r"(?<![\w])(?:" + patron + ")", _fijo(reemplazo)))
    return r


def _numero_con_genero(m: re.Match[str]) -> str:
    siguiente = _siguiente_palabra(m.string, m.end())
    return numero_en_palabras(m.group(1), "f" if _es_femenino(siguiente) else "m")


_REGLAS = _construir_reglas()
_REGLAS_NEUTRAS = _construir_neutras()
_PUNTUACION_CIERRE = set(".,;:!?)]}»”’…")


def _cierra_frase(texto: str, fin: int) -> bool:
    resto = texto[fin:].strip()
    return resto == "" or all(c in _PUNTUACION_CIERRE for c in resto)


def _romano(m: re.Match[str]) -> str | None:
    n = romano_a_entero(m.group(1))
    return None if n is None else numero_a_palabras(n)


_REGLA_SIGLO = _Regla(r"(?<=siglo )([IVXL]+)\b", _romano)


# ---------------------------------------------------------------- idioma de la frase


def _lista(texto: str) -> set[str]:
    return set(texto.split())


_FRECUENTES_FRASE = {
    "es": _lista(
        "el la los las de del que y e o u a en un una por con para no es su sus al lo como más pero se le ya muy"
        " sí me te nos mi mis tu ni este esta eso hay fue era yo tú él ella nosotros da das den des dé"
    ),
    "en": _lista(
        "the and of to is was that it she you with for on not be at but they have this from by we my are"
        " were what all so if their which when or will him her his over under into out up about than then"
    ),
    "fr": _lista(
        "le les est et du une dans pour pas ne sur au aux avec il elle ils nous vous je ses ce cette ces"
        " mais ou plus était avait été fait comme tout leur être avoir très sans même donc alors quand petit"
    ),
    "de": _lista(
        "der die und ist ich nicht sie ein eine zu mit sich auf für im dem den das des von auch als nach wie"
        " war aber hat er wir ihr noch nur oder wenn bei aus um sind kann dass über unter einen einem einer ihn ihm"
        " uns euch mein dein sein unser heute gestern morgen sehr gut ja nein schon immer hier dort jetzt dann doch"
        " nichts etwas viel alle diese dieser dieses wird werden wurde haben habe bin bist seid zum zur vom ins"
    ),
    "it": _lista(
        "il gli di della dei delle è che non per nel nella ma più anche questo questa sono"
        " aveva molto quando lui lei loro noi voi io ci già poi così perché tutto"
    ),
    "pt": _lista(
        "o os do dos da em no na nos nas um uma não com mais ao à às foi ele ela eles elas seu sua isso"
        " este isto também já muito quando pelo pela tem ser está estava você eu meu minha ontem hoje noite"
        " agora sempre nunca então bem nós vocês obrigado obrigada mas porque até sobre depois"
    ),
    "la": _lista(
        "est et in ad non sum quod qui quae sunt cum per hoc sed ut nec vel atque enim ergo esse etiam iacta"
        " alea carpe diem veni vidi vici vox populi dei deus homo lupus memento mori tempus fugit"
    ),
}
_PALABRA_LATINA = re.compile(r"[^\W\d_]+")
_GRAFIA_DE = re.compile(r"[äöß]|(?<!g)ü")
_GRAFIA_PT = re.compile(r"[ãõç]|nh|lh|eu$|ou$")


def idioma_de_frase(texto: str) -> str | None:
    """Idioma de una frase entera escrita en otro idioma (≥ 3 palabras, sin palabras españolas que la delaten)."""
    palabras = [p.lower() for p in _PALABRA_LATINA.findall(texto) if all(es_latina(c) for c in p)]
    if len(palabras) < 3:
        return None
    puntos = {i: sum(1 for p in palabras if p in lista) for i, lista in _FRECUENTES_FRASE.items()}
    # grafías que el español no tiene (V-NUEVO-4): ä ö ß (y ü fuera de «gü») en alemán; ã õ ç nh lh y los pretéritos
    # en -eu/-ou («comeu», «falou») en portugués
    puntos["de"] += sum(1 for p in palabras if p not in _FRECUENTES_FRASE["de"] and _GRAFIA_DE.search(p))
    puntos["pt"] += sum(1 for p in palabras if p not in _FRECUENTES_FRASE["pt"] and _GRAFIA_PT.search(p))
    es = puntos.pop("es")
    mejor = max(puntos, key=lambda i: puntos[i])
    if puntos[mejor] >= 2 and puntos[mejor] >= 2 * es and puntos[mejor] >= 0.25 * len(palabras):
        return mejor
    return None


# ---------------------------------------------------------------- API


# Idiomas de libro que se leen enteros con la voz multilingüe de edge (V-NUEVO-2). Cualquier otro código (o ninguno)
# se lee como español con la voz elegida.
IDIOMAS_MULTILINGUE = frozenset(
    _lista("en fr de it pt la ca gl eu nl pl ru uk el ja zh ko ar he hi sv da no nb fi tr cs ro hu")
)


def idioma_de_libro(idioma: str | None) -> str | None:
    """Idioma del libro si NO es español y la voz multilingüe lo lee («en-US» → «en», «English» → «en»); si no,
    None (español: «spa», «es-CO», «Castellano», desconocido…)."""
    codigo = normalizar_idioma(idioma)
    return codigo if codigo in IDIOMAS_MULTILINGUE else None


def _numero_unicode(c: str) -> str | None:
    """«Ⅳ» → «cuatro», «①» → «uno», «٣» → «tres» (números que no son cifras ASCII)."""
    if c in "0123456789" or unicodedata.category(c)[0] != "N":
        return None
    try:
        valor = unicodedata.numeric(c)
    except (TypeError, ValueError):
        return None
    return numero_a_palabras(int(valor)) if valor == int(valor) else None


def preparar_lectura(
    voz: str,
    idioma_libro: str | None = None,
    pronunciacion: Iterable[tuple[str, str]] = (),
) -> Lectura:
    """Texto para el motor a partir del texto de voz de una frase, con el mapa de vuelta y el idioma de la frase."""
    spans: list[tuple[int, int, int, str]] = []
    prioridad = 0
    for de, a in pronunciacion:
        if de.strip():
            patron = re.compile(r"(?<!\w)" + re.escape(de.strip()) + r"(?!\w)", re.IGNORECASE)
            spans.extend((m.start(), m.end(), prioridad, a) for m in patron.finditer(voz))
    idioma_libro = idioma_de_libro(idioma_libro)
    extranjero = idioma_libro is not None
    for regla in _REGLAS_NEUTRAS if extranjero else _REGLAS:
        prioridad += 1
        if regla.formato_es and idioma_libro == "en":
            continue
        for m in regla.patron.finditer(voz):
            reemplazo = regla.funcion(m)
            if reemplazo is None:
                continue
            ini, fin = m.span(regla.grupo)
            if fin > ini:
                spans.append((ini, fin, prioridad, reemplazo))
    spans.sort(key=lambda s: (s[0], s[2]))
    elegidos: list[tuple[int, int, str]] = []
    ultimo = 0
    for ini, fin, _p, rep in spans:
        if ini < ultimo:
            continue
        elegidos.append((ini, fin, rep))
        ultimo = fin

    chars: list[str] = []
    mapa: list[tuple[int, int]] = []
    pos = 0
    for ini, fin, rep in elegidos:
        _copiar(voz, pos, ini, chars, mapa)
        if rep and voz[fin - 1 : fin] == "." and not rep.endswith(".") and _cierra_frase(voz, fin):
            rep += "."  # «…en EE. UU.» al final de la frase conserva el punto (entonación)
        chars.extend(rep)
        mapa.extend([(ini, fin)] * len(rep))
        pos = fin
    _copiar(voz, pos, len(voz), chars, mapa)
    texto, mapa = ("".join(chars), mapa) if extranjero else _siglo("".join(chars), mapa)
    lectura = _alfabetos(texto, mapa, idioma_libro if extranjero else None)
    lectura = _limpiar_espacios(lectura)
    if lectura.idioma is None and not extranjero:
        lectura.idioma = idioma_de_frase(lectura.texto)
    return lectura


def _copiar(voz: str, a: int, b: int, chars: list[str], mapa: list[tuple[int, int]]) -> None:
    for i in range(a, b):
        chars.append(voz[i])
        mapa.append((i, i + 1))


def _siglo(texto: str, mapa: list[tuple[int, int]]) -> tuple[str, list[tuple[int, int]]]:
    """«s. XIX» ya es «siglo XIX»: el romano pasa a número (la conversión solo lo hacía tras «siglo»)."""
    chars: list[str] = []
    nuevo: list[tuple[int, int]] = []
    pos = 0
    for m in _REGLA_SIGLO.patron.finditer(texto):
        rep = _REGLA_SIGLO.funcion(m)
        if rep is None:
            continue
        chars.extend(texto[pos : m.start()])
        nuevo.extend(mapa[pos : m.start()])
        origen = (mapa[m.start()][0], mapa[m.end() - 1][1])
        chars.extend(rep)
        nuevo.extend([origen] * len(rep))
        pos = m.end()
    chars.extend(texto[pos:])
    nuevo.extend(mapa[pos:])
    return "".join(chars), nuevo


def _alfabetos(texto: str, mapa: list[tuple[int, int]], idioma_libro: str | None = None) -> Lectura:
    """Números unicode a palabras; «ª»/«º» sueltas fuera; letras no latinas → voz multilingüe o fuera.
    `idioma_libro` (libro que no está en español): todo va a la voz multilingüe, con su idioma."""
    no_latinas = sum(1 for c in texto if c.isalpha() and not es_latina(c) and c not in "ªº")
    latinas = sum(1 for c in texto if es_latina(c))
    multilingue = no_latinas > 0 and (latinas == 0 or no_latinas >= 3 or idioma_libro is not None)
    chars: list[str] = []
    nuevo: list[tuple[int, int]] = []
    for c, origen in zip(texto, mapa, strict=True):
        numero = _numero_unicode(c)
        if numero is not None:
            rep = f" {numero} "
            chars.extend(rep)
            nuevo.extend([origen] * len(rep))
            continue
        if c in "ªº" or (c.isalpha() and not es_latina(c) and not multilingue):
            chars.append(" ")
            nuevo.append(origen)
            continue
        chars.append(c)
        nuevo.append(origen)
    return Lectura("".join(chars), nuevo, "otro" if multilingue else idioma_libro)


def _limpiar_espacios(lectura: Lectura) -> Lectura:
    """Colapsa espacios y quita el que queda delante de un signo de cierre, conservando el mapa."""
    chars: list[str] = []
    mapa: list[tuple[int, int]] = []
    for c, origen in zip(lectura.texto, lectura.mapa, strict=True):
        if c.isspace():
            if not chars or chars[-1] == " ":
                continue
            chars.append(" ")
            mapa.append(origen)
            continue
        if c in ".,;:!?)]}»”…" and chars and chars[-1] == " ":
            chars.pop()
            mapa.pop()
        chars.append(c)
        mapa.append(origen)
    while chars and chars[-1] == " ":
        chars.pop()
        mapa.pop()
    return Lectura("".join(chars), mapa, lectura.idioma)


# ---------------------------------------------------------------- voz multilingüe

# Voces multilingües de edge (leen el idioma que reciben con la misma voz). Por género de la voz elegida.
_MULTILINGUES = {
    "en": ("en-US-AndrewMultilingualNeural", "en-US-AvaMultilingualNeural"),
    "fr": ("fr-FR-RemyMultilingualNeural", "fr-FR-VivienneMultilingualNeural"),
    "it": ("it-IT-GiuseppeMultilingualNeural", "en-US-AvaMultilingualNeural"),
    "pt": ("en-US-AndrewMultilingualNeural", "pt-BR-ThalitaMultilingualNeural"),
}
_MULTILINGUE_GENERAL = ("en-US-AndrewMultilingualNeural", "en-US-AvaMultilingualNeural")


def voz_multilingue(idioma: str, genero: str) -> str:
    """Nombre de la voz de edge para una frase en `idioma` ("otro" = alfabeto no latino), según el género."""
    masculina, femenina = _MULTILINGUES.get(idioma, _MULTILINGUE_GENERAL)
    return femenina if genero == "F" else masculina


def sin_letras_no_latinas(lectura: Lectura) -> Lectura:
    """La misma lectura sin las letras que una voz española no sabe leer (respaldo si la multilingüe no responde)."""
    chars: list[str] = []
    mapa: list[tuple[int, int]] = []
    for c, origen in zip(lectura.texto, lectura.mapa, strict=True):
        chars.append(" " if c.isalpha() and not es_latina(c) else c)
        mapa.append(origen)
    return _limpiar_espacios(Lectura("".join(chars), mapa, None))


MAX_REGLAS_PRONUNCIACION = 500
MAX_LARGO_REGLA = 100


def reglas_de_pronunciacion(datos: object) -> list[tuple[str, str]]:
    """(B17) Diccionario de pronunciación del trabajo de voz: `[{"de": "Hermione", "a": "Jermáyoni"}, …]`.

    Lo que no tenga esa forma se ignora (nunca tumba el trabajo). Como mucho MAX_REGLAS_PRONUNCIACION reglas de
    MAX_LARGO_REGLA caracteres; las más largas primero (así «Harry Potter» gana a «Harry»)."""
    reglas: list[tuple[str, str]] = []
    if not isinstance(datos, list):
        return reglas
    for r in datos[:MAX_REGLAS_PRONUNCIACION]:
        if not isinstance(r, dict):
            continue
        de, a = r.get("de"), r.get("a")
        if isinstance(de, str) and isinstance(a, str) and de.strip() and len(de) <= MAX_LARGO_REGLA:
            reglas.append((de.strip(), a.strip()[:MAX_LARGO_REGLA]))
    return sorted(reglas, key=lambda x: -len(x[0]))

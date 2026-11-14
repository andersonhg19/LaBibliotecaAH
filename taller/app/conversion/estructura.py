"""Qué es cada capítulo del libro (contratos 0.4.0, C1): tipo, región, número visible y si entra en el audiolibro.

Hasta 0.3.3 lo adivinaba la web solo por el título (`numerarCapitulos`) y la voz leía todo: créditos con el ISBN, la
página del índice, notas, «Sobre la autora», publicidad… (auditoría CF-01, CF-02, CF-04 a CF-07, CF-13). Ahora lo
decide el taller, por este orden de prioridad:

1. `epub:type` / `role="doc-*"` del documento (vocabulario EPUB SSV / DPUB-ARIA) → origen "epub-type";
2. landmarks del nav (EPUB3) o `<guide>` (EPUB2) → "landmarks" / "guide";
3. `linear="no"` en el spine → "linear" (fuera de la voz);
4. el título (diccionario español/inglés) → "titulo";
5. la posición (antes del primer capítulo, entre capítulos, tras el final del libro) → "posicion".

El número visible («01») solo lo llevan los capítulos: respeta el del propio título («Capítulo 7», «Capítulo primero»,
«CAPÍTULO 01», «Chapter One», «IV»); las partes no consumen número y los trozos «(parte k de n)» heredan el del
primero. `enVoz` (por defecto) es verdadero solo para el cuerpo (capítulo, parte, prólogo, introducción, epílogo) con
algo que leer; `palabrasVoz` cuenta lo que de verdad lee la voz (sin notas ni tablas).
"""

from __future__ import annotations

import itertools
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field

from .numeros import romano_a_entero

VERSION_ESTRUCTURA = 2
# versión de las REGLAS de clasificación (campo raíz «clasificador» de estructura.json; sin él = 1). Sube cuando
# cambia el resultado de `clasificar` para libros ya clasificados, para que RECLASIFICAR_ESTRUCTURA los rehaga:
# 1 = 0.4.0; 2 = capítulos con nombre y cortos antes de uno largo ya no son «preliminar», número del encabezado y
# libro sin nada en voz → todo lo que tenga texto en voz (V-NUEVO-1, A-1).
VERSION_CLASIFICADOR = 2

TIPOS = (
    "capitulo",
    "parte",
    "prologo",
    "epilogo",
    "introduccion",
    "preliminar",
    "dedicatoria",
    "epigrafe",
    "creditos",
    "indice",
    "notas",
    "apendice",
    "agradecimientos",
    "autor",
    "publicidad",
    "colofon",
    "otro",
)
CUERPO = frozenset({"capitulo", "parte", "prologo", "introduccion", "epilogo"})
# lo que, si aparece tras el texto del libro, marca que ya empezó «lo del final»
FINALES = frozenset({"notas", "apendice", "agradecimientos", "autor", "publicidad", "colofon"})
# fracción máxima de palabras que puede quedar detrás de esa marca (un capítulo que se llame «Notas de viaje» en
# mitad de la novela no corta el libro)
MAX_FRACCION_FINAL = 0.35
PALABRAS_PRELIMINAR = 400  # una sección sin tipo antes del primer capítulo con menos de esto es preliminar
PALABRAS_PORTADA = 150  # una «Portada» con más texto que esto no es una portada
_PORTADA = re.compile(r"^(?:portada|portadilla|cubierta|cover|title page|anteportada)[.:]?$")
PALABRAS_PARTE = 500  # una entrada con hijos en el índice y menos de esto es una parte (cabecera)
# una sección sin tipo con título propio («La lluvia», «Canción de otoño») y al menos esto es cuerpo aunque sea corta
# (cuentos, poemas, libros infantiles): por debajo es una portadilla, una dedicatoria sin título…
PALABRAS_CON_NOMBRE = 20
# títulos que no dicen nada (los pone el conversor o el programa que hizo el EPUB): no cuentan como «nombre propio»
_GENERICO = re.compile(
    r"^(?:(?:seccion|section|sec|texto?|split|page|pagina|item|doc|documento|file|archivo|html?|xhtml|content"
    r"|contenido|part)[\s_.\-]*[0-9]*(?:[\s_.\-]+[0-9]+)*(?:\.x?html?)?|comienzo|inicio|start|begin|title|titulo"
    r"|untitled|sin titulo)$"
)

# vocabulario EPUB SSV / DPUB-ARIA → tipo
TIPO_EPUB = {
    "cover": "preliminar",
    "titlepage": "preliminar",
    "halftitlepage": "preliminar",
    "frontmatter": "preliminar",
    "seriespage": "publicidad",
    "copyright-page": "creditos",
    "imprint": "creditos",
    "imprimatur": "creditos",
    "credits": "creditos",
    "other-credits": "creditos",
    "errata": "otro",
    "dedication": "dedicatoria",
    "epigraph": "epigrafe",
    "toc": "indice",
    "toc-brief": "indice",
    "loi": "indice",
    "lot": "indice",
    "lov": "indice",
    "index": "indice",
    "foreword": "prologo",
    "preface": "prologo",
    "prologue": "prologo",
    "preamble": "prologo",
    "introduction": "introduccion",
    "chapter": "capitulo",
    "subchapter": "capitulo",
    "part": "parte",
    "volume": "parte",
    "epilogue": "epilogo",
    "afterword": "epilogo",
    "conclusion": "epilogo",
    "appendix": "apendice",
    "glossary": "apendice",
    "bibliography": "apendice",
    "endnotes": "notas",
    "rearnotes": "notas",
    "footnotes": "notas",
    "acknowledgments": "agradecimientos",
    "acknowledgements": "agradecimientos",
    "contributors": "autor",
    "colophon": "colofon",
    "backmatter": "otro",
}
# tipos del EPUB2 <guide> → tipo («text» marca el comienzo del cuerpo)
TIPO_GUIDE = {
    "cover": "preliminar",
    "title-page": "preliminar",
    "toc": "indice",
    "index": "indice",
    "glossary": "apendice",
    "acknowledgements": "agradecimientos",
    "bibliography": "apendice",
    "colophon": "colofon",
    "copyright-page": "creditos",
    "dedication": "dedicatoria",
    "epigraph": "epigrafe",
    "foreword": "prologo",
    "preface": "prologo",
    "notes": "notas",
    "loi": "indice",
    "lot": "indice",
}
INICIO_CUERPO = frozenset({"bodymatter", "text", "start"})


# valores genéricos: dicen la región, no el tipo («backmatter» en «Sobre la autora»: manda el título)
REGION_EPUB = {"frontmatter": "antes", "bodymatter": None, "backmatter": "despues"}


def _valores(valores: str | None) -> list[str]:
    return [v.lower().removeprefix("doc-").split(":")[-1] for v in (valores or "").split()]


def tipo_de_epub(valores: str | None) -> str | None:
    """Primer valor de `epub:type`/`role` («chapter», «doc-chapter», «bodymatter chapter») que tiene tipo."""
    for v in _valores(valores):
        if v in TIPO_EPUB and v not in REGION_EPUB:
            return TIPO_EPUB[v]
    return None


def region_de_epub(valores: str | None) -> str | None:
    """«antes» / «despues» si `epub:type` es solo genérico (frontmatter / backmatter)."""
    return next((REGION_EPUB[v] for v in _valores(valores) if REGION_EPUB.get(v)), None)


# ---------------------------------------------------------------- títulos


def _plano(texto: str) -> str:
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sin_tildes).strip().lower()


_ORDINALES_ES = [
    "primero",
    "segundo",
    "tercero",
    "cuarto",
    "quinto",
    "sexto",
    "septimo",
    "octavo",
    "noveno",
    "decimo",
    "undecimo",
    "duodecimo",
    "decimotercero",
    "decimocuarto",
    "decimoquinto",
    "decimosexto",
    "decimoseptimo",
    "decimoctavo",
    "decimonoveno",
    "vigesimo",
]
_CARDINALES_ES = [
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
    "dieciseis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
    "veintiuno",
    "veintidos",
    "veintitres",
    "veinticuatro",
    "veinticinco",
    "veintiseis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
    "treinta",
]
_CARDINALES_EN = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
]
_ORDINALES_EN = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
    "eleventh",
    "twelfth",
    "thirteenth",
    "fourteenth",
    "fifteenth",
    "sixteenth",
    "seventeenth",
    "eighteenth",
    "nineteenth",
    "twentieth",
]


def _palabra_a_numero(p: str) -> int | None:
    p = p.lower()
    for lista in (_ORDINALES_ES, _CARDINALES_ES, _CARDINALES_EN, _ORDINALES_EN):
        if p in lista:
            return lista.index(p) + 1
    if p in ("primer", "primera", "una", "un"):
        return 1
    if p in ("tercer", "tercera"):
        return 3
    if p.endswith("a") and p[:-1] + "o" in _ORDINALES_ES:
        return _ORDINALES_ES.index(p[:-1] + "o") + 1
    if p == "cero" or p == "zero":
        return 0
    return None


def valor_numero(token: str) -> int | None:
    """«07» → 7; «IV» → 4; «primero»/«one»/«first» → 1."""
    t = token.strip(".:)–—-").strip()
    if t.isdigit():
        return int(t)
    if re.fullmatch(r"[ivxlcdm]+", t, re.IGNORECASE):
        return romano_a_entero(t)
    return _palabra_a_numero(t)


_NUMERO = r"(\d{1,3}|[ivxlc]{1,7}|[a-z]+)"
_CAPITULO = re.compile(rf"^(?:cap[ií]tulo|chapter|cap\.?)\s+{_NUMERO}\b", re.IGNORECASE)
_SOLO_NUMERO = re.compile(r"^(\d{1,3})(?:\s*[.:)\-–—]|\s*$|\s+(?=[A-ZÁÉÍÓÚÑ¿¡«\"“]))")
_SOLO_ROMANO = re.compile(r"^([IVXLC]{1,7})(?:\s*[.:)\-–—]|\s*$)")
_SOLO_PALABRA = re.compile(r"^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*[.:]?\s*$")
# «Parte II», «Libro primero», «Part One: …»; no «Parte de mí» (el ordinal va solo o seguido de puntuación)
_ORDEN = r"(?:\d+|[ivxlc]+|[a-z]+)(?=\s*(?:[.:\-–—]|$))"
_PARTE = re.compile(
    r"^(?:(?:primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima|ultima)\s+parte\b"
    rf"|(?:parte|libro|part|book|tomo|volumen)\s+{_ORDEN}|(?:primer|segundo|tercer)\s+libro\b)",
    re.IGNORECASE,
)
_TROZO = re.compile(r"^(.*) \(parte (\d+) de (\d+)\)$")

# títulos (planos: sin tildes, en minúscula) → tipo. Se comparan con el título entero o con su comienzo.
_TITULOS: list[tuple[str, str]] = [
    (r"(?:portada|portadilla|cubierta|cover|title page|half title|pagina de titulo|anteportada)", "preliminar"),
    (r"(?:sinopsis|resumen|mapas?|personajes|dramatis personae|cronologia|arbol genealogico)", "preliminar"),
    (r"(?:nota (?:del|de la) (?:autora?|traductora?|editora?|edicion)|nota preliminar|advertencia)", "preliminar"),
    (r"(?:creditos|copyright|derechos|pagina de derechos|aviso legal|informacion legal|titulo original)", "creditos"),
    (r"(?:dedicatoria|dedication)", "dedicatoria"),
    (r"(?:epigrafe|epigraph|cita)", "epigrafe"),
    (r"(?:indice analitico|indice onomastico|indice tematico|indice alfabetico|index)", "indice"),
    (r"(?:indice(?: general)?|contenidos?|sumario|tabla de contenidos?|contents|table of contents|toc)", "indice"),
    (r"(?:a modo de )?(?:prologo|prefacio|preambulo|proemio|prologue|preface|foreword)(?: .*)?", "prologo"),
    (r"(?:introduccion|introduction)(?: .*)?", "introduccion"),
    (r"(?:epilogo|epilogue|afterword|posfacio|postfacio|coda)(?: .*)?", "epilogo"),
    (r"(?:notas?(?: finales| al final| del traductor| de la traductora| de la edicion)?|notes|endnotes)", "notas"),
    (r"(?:apendices?|anexos?|appendix|appendices)(?: .*)?", "apendice"),
    (r"(?:glosario|glossary|bibliografia|bibliography|referencias|fuentes|obras citadas)", "apendice"),
    (r"(?:agradecimientos?|acknowledge?ments?)", "agradecimientos"),
    (
        r"(?:sobre|acerca de) (?:el autor|la autora|los autores|las autoras|el ilustrador|la ilustradora)"
        r"|(?:el autor|la autora|about the authors?|biografia|nota biografica)",
        "autor",
    ),
    (
        r"(?:otros (?:titulos|libros)(?: .*)?|del mismo autor|de la misma autora|tambien de .*|tambien por .*"
        r"|also by .*|more (?:from|by) .*|proximamente|adelanto.*|avance.*|extracto.*|excerpt.*|sneak peek.*"
        r"|lee (?:un|el) (?:adelanto|primer capitulo).*|sigue leyendo.*|descubre .*)",
        "publicidad",
    ),
    (r"(?:colofon|colophon)", "colofon"),
]
_TITULOS_RE = [(re.compile(rf"^(?:{p})[.:]?$"), t) for p, t in _TITULOS]


def numero_en_titulo(titulo: str) -> int | None:
    """Número de capítulo escrito en el propio título, o None."""
    t = titulo.strip()
    for patron in (_CAPITULO, _SOLO_NUMERO, _SOLO_ROMANO):
        m = patron.match(t)
        if m:
            n = valor_numero(m.group(1))
            if n is not None:
                return n
    m = _SOLO_PALABRA.match(t)
    if m:
        return _palabra_a_numero(_plano(m.group(1)))
    return None


def tipo_por_titulo(titulo: str) -> str | None:
    """Tipo que sugiere el título (último recurso de la clasificación)."""
    plano = _plano(titulo)
    if not plano:
        return None
    for patron, tipo in _TITULOS_RE:
        if patron.match(plano):
            return tipo
    if _PARTE.match(plano):
        return "parte"
    if numero_en_titulo(titulo) is not None:
        return "capitulo"
    return None


# ---------------------------------------------------------------- clasificación


@dataclass
class Entrada:
    """Lo que se sabe de un capítulo para clasificarlo."""

    titulo: str
    palabras: int = 0
    palabras_voz: int = 0
    tipo: str | None = None  # pista del formato de origen (epub:type, landmarks, guide)
    origen: str | None = None
    lineal: bool = True
    region: str | None = None  # pista: "antes" (antes del comienzo del cuerpo) / "despues" (tras el índice)
    con_hijos: bool = False  # tiene hijos en el índice (candidata a parte)
    encabezado: str | None = None  # primer encabezado del texto («Capítulo 1. Números»), si el índice dice otra cosa


@dataclass
class Clasificacion:
    tipo: str
    region: str
    numero: int | None
    en_voz: bool
    palabras_voz: int
    origen: str
    extra: dict = field(default_factory=dict)

    def a_json(self) -> dict:
        return {
            "tipo": self.tipo,
            "region": self.region,
            "numero": self.numero,
            "enVoz": self.en_voz,
            "palabrasVoz": self.palabras_voz,
            "origenTipo": self.origen,
        }


def _base_de_trozo(titulo: str) -> str | None:
    m = _TROZO.match(titulo)
    return m.group(1) if m else None


def _con_nombre(e: Entrada, plano_libro: str) -> bool:
    """Sección con título propio y algo de texto: un cuento, un poema, un capítulo con nombre (no una portadilla)."""
    plano = _plano(e.titulo)
    if not plano or _GENERICO.match(plano) or e.palabras < PALABRAS_CON_NOMBRE:
        return False
    # la página con el título del libro (y quizá el subtítulo) es la portadilla; un cuento que da título al libro
    # tiene más texto
    return not (plano_libro and plano.startswith(plano_libro) and e.palabras < 100)


def _numeros_de_encabezado(entradas: Sequence[Entrada], tipos: list[str | None]) -> dict[int, int]:
    """Números de capítulo escritos en el primer encabezado del texto cuando el título del índice no trae («Números»
    en el índice, «Capítulo 1. Números» en el texto). Solo se usan si van en orden creciente: si no, mandan las
    posiciones."""
    salida: dict[int, int] = {}
    for i, e in enumerate(entradas):
        if tipos[i] != "capitulo" or _base_de_trozo(e.titulo) is not None or numero_en_titulo(e.titulo) is not None:
            continue
        n = numero_en_titulo(e.encabezado) if e.encabezado and _CAPITULO.match(e.encabezado.strip()) else None
        if n is not None:
            salida[i] = n
    valores = list(salida.values())
    return salida if all(a < b for a, b in itertools.pairwise(valores)) else {}


def clasificar(entradas: Sequence[Entrada], titulo_libro: str | None = None) -> list[Clasificacion]:
    """Clasifica los capítulos de un libro (en orden). Nunca cambia cuántos hay ni su orden."""
    n = len(entradas)
    plano_libro = _plano(titulo_libro or "")
    tipos: list[str | None] = [None] * n
    origenes: list[str] = ["posicion"] * n
    # 1) pistas del formato, linear="no", título; los trozos «(parte k de n)» copian al primero
    for i, e in enumerate(entradas):
        base = _base_de_trozo(e.titulo)
        if base is not None and i > 0 and (entradas[i - 1].titulo == base or _base_de_trozo(entradas[i - 1].titulo)):
            tipos[i], origenes[i] = tipos[i - 1], origenes[i - 1]
            continue
        if e.tipo:
            tipos[i], origenes[i] = e.tipo, e.origen or "epub-type"
        elif not e.lineal:
            tipos[i], origenes[i] = tipo_por_titulo(e.titulo) or "otro", "linear"
        else:
            por_titulo = tipo_por_titulo(e.titulo)
            if por_titulo == "preliminar" and _PORTADA.match(_plano(e.titulo)) and e.palabras >= PALABRAS_PORTADA:
                # una «Portada» con páginas de texto es un capítulo mal titulado (PDF con varios marcadores en la
                # primera página, convertido antes de CF-10): decide la posición
                por_titulo = None
            if por_titulo:
                tipos[i], origenes[i] = por_titulo, "titulo"
            elif e.con_hijos and e.palabras < PALABRAS_PARTE:
                tipos[i], origenes[i] = "parte", "titulo"
            elif e.encabezado and _CAPITULO.match(e.encabezado.strip()):
                # el índice dice «Números» y el texto «Capítulo 1. Números»: es un capítulo (V-NUEVO-1)
                tipos[i], origenes[i] = "capitulo", "titulo"
    total = sum(e.palabras for e in entradas) or 1

    def sustancial(i: int, minimo: int) -> bool:
        e = entradas[i]
        if not e.lineal or e.region == "antes":
            return False
        return tipos[i] in CUERPO or (tipos[i] is None and (e.palabras >= minimo or _con_nombre(e, plano_libro)))

    # 2) dónde empieza el libro de verdad: el primer capítulo reconocido o la primera sección sin tipo con texto o
    # con nombre propio (un libro de cuentos cortos: «La lluvia», «El gato»… son el libro, no preliminares; V-NUEVO-1)
    primero = next((i for i in range(n) if sustancial(i, PALABRAS_PRELIMINAR)), None)
    final = next((i for i in range(n) if tipos[i] in FINALES and entradas[i].lineal), None)
    if final is not None and (primero is None or final < primero):
        # lo del final («Agradecimientos») sale antes que cualquier capítulo reconocible: el libro son las secciones
        # sin tipo de antes (capítulos con nombre y cortos) y lo de detrás, un adelanto (CF-04)
        primero = next(
            (
                i
                for i in range(final)
                if tipos[i] is None and entradas[i].region is None and entradas[i].palabras >= 100
            ),
            primero,
        )
    if primero is None:
        primero = next((i for i in range(n) if sustancial(i, 100)), None)
    if primero is None:
        primero = next((i for i in range(n) if tipos[i] is None and entradas[i].region != "despues"), None)
    # 3) dónde empieza «lo del final»: el primer tipo final tras el comienzo, si detrás queda poco libro
    barrera: int | None = None
    for i in range(primero if primero is not None else 0, n):
        if (tipos[i] in FINALES and entradas[i].lineal) or entradas[i].region == "despues":
            if sum(e.palabras for e in entradas[i:]) <= MAX_FRACCION_FINAL * total:
                barrera = i
            break
    # 4) lo que queda sin tipo, por la posición
    for i in range(n):
        e = entradas[i]
        if barrera is not None and i >= barrera:
            if tipos[i] is None:
                tipos[i] = "otro"
            elif tipos[i] == "capitulo" and origenes[i] in ("titulo", "posicion"):
                tipos[i] = "publicidad"  # «Capítulo 1» de otra novela tras los agradecimientos: un adelanto (CF-04)
            continue
        if tipos[i] is None:
            if e.region == "despues":
                tipos[i] = "otro"
            elif primero is None or i < primero:
                tipos[i] = "preliminar"
            else:
                tipos[i] = "capitulo"
        elif (
            origenes[i] == "titulo"
            and tipos[i] not in CUERPO
            and primero is not None
            and i > primero
            and e.palabras >= PALABRAS_PRELIMINAR
        ):
            # «Resumen», «Notas de viaje»… en mitad del libro y con texto: es un capítulo con ese nombre
            tipos[i], origenes[i] = "capitulo", "posicion"
    # 5) región, número y voz
    del_encabezado = _numeros_de_encabezado(entradas, tipos)
    cuerpo_idx = [i for i in range(n) if tipos[i] in CUERPO and (barrera is None or i < barrera)]
    ini_cuerpo = cuerpo_idx[0] if cuerpo_idx else n
    fin_cuerpo = cuerpo_idx[-1] if cuerpo_idx else -1
    salida: list[Clasificacion] = []
    siguiente = 1
    for i, e in enumerate(entradas):
        tipo = tipos[i] or "otro"
        if not e.lineal:
            region = "antes" if i < ini_cuerpo else "despues"
        elif tipo in CUERPO and (barrera is None or i < barrera):
            region = "cuerpo"
        elif i < ini_cuerpo:
            region = "antes"
        elif i > fin_cuerpo or (barrera is not None and i >= barrera):
            region = "despues"
        else:
            region = "cuerpo"
        numero: int | None = None
        if tipo == "capitulo" and region == "cuerpo":
            base = _base_de_trozo(e.titulo)
            if base is not None and salida and salida[-1].tipo == "capitulo" and i > 0:
                numero = salida[-1].numero
            else:
                propio = numero_en_titulo(base or e.titulo)
                if propio is None:
                    propio = del_encabezado.get(i)
                numero = propio if propio is not None else siguiente
                siguiente = numero + 1
        en_voz = tipo in CUERPO and region == "cuerpo" and e.lineal and e.palabras_voz > 0
        salida.append(Clasificacion(tipo, region, numero, en_voz, e.palabras_voz, origenes[i]))
    if not any(c.en_voz for c in salida):
        # nada en voz (un libro de un solo «Epígrafe», unas «Notas» sueltas…): el libro no tendría audio de corrido;
        # se lee todo lo que tenga texto, como en un libro v1 (A-1)
        for c in salida:
            c.en_voz = c.palabras_voz > 0
    return salida

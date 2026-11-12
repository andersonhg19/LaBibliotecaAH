"""Segmentación de un capítulo en frases y envoltura de cada frase en `<span class="bah-f" id="cNNN-sNNNNN">`.

Estrategia para no romper el marcado en línea:
1. Cada bloque hoja (p, h1..h6, li, td…) se convierte a un modelo de nodos (texto / elemento) y se colapsan
   los espacios (lo mismo que hace el navegador), de modo que el `textContent` del span == `texto` de la frase.
2. Se segmenta el texto plano del bloque.
3. Se reconstruye el bloque cortando el modelo por rangos de caracteres: un elemento en línea que cruza el borde
   de dos frases (p. ej. un <em> que abarca el final de una frase y el inicio de otra) se clona en ambas mitades;
   el `id` original solo queda en el primer trozo. Así se conservan <em>/<strong>/<a> sin anidar mal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from lxml import etree

from .html_util import BLOQUES_HOJA_O_CONTENEDOR, Elemento, es_bloque, texto_plano
from .normalizador import preparar_voz, tiene_contenido_hablable
from .segmentador import segmentar

CLASE_FRASE = "bah-f"
_TITULOS = {"h1", "h2", "h3", "h4", "h5", "h6"}
_PALABRA = re.compile(r"\w+", re.UNICODE)


@dataclass
class Frase:
    id: str
    texto: str
    voz: str
    fin_parrafo: bool = False
    es_titulo: bool = False

    def a_json(self) -> dict:
        return {
            "id": self.id,
            "texto": self.texto,
            "voz": self.voz,
            "finParrafo": self.fin_parrafo,
            "esTitulo": self.es_titulo,
        }


def id_frase(capitulo: int, n: int) -> str:
    return f"c{capitulo:03d}-s{n:05d}"


def contar_palabras(texto: str) -> int:
    return len(_PALABRA.findall(texto))


# ------------------------------------------------------------------ modelo de nodos


@dataclass
class _Texto:
    texto: str
    excluido: bool = False
    ini: int = 0


@dataclass
class _Elem:
    tag: str
    attrib: dict[str, str]
    hijos: list[_Nodo] = field(default_factory=list)
    excluido: bool = False
    ini: int = 0
    fin: int = 0


type _Nodo = _Texto | _Elem


def _es_excluido(el: Elemento) -> bool:
    if el.tag == "sup":
        return True
    clase = el.get("class") or ""
    return "bah-nota" in clase.split()


def _a_modelo(el: Elemento, excluido: bool = False) -> list[_Nodo]:
    nodos: list[_Nodo] = []
    if el.text:
        nodos.append(_Texto(el.text, excluido))
    for hijo in el:
        if isinstance(hijo.tag, str):
            ex = excluido or _es_excluido(hijo)
            e = _Elem(hijo.tag, {str(k): str(v) for k, v in hijo.attrib.items()}, _a_modelo(hijo, ex), ex)
            nodos.append(e)
        if hijo.tail:
            nodos.append(_Texto(hijo.tail, excluido))
    return nodos


def _colapsar(nodos: list[_Nodo]) -> None:
    """Colapsa espacios como el navegador. <br> fuerza un espacio visible antes del salto."""
    previo_espacio = True
    ultimo_texto: _Texto | None = None

    def recorrer(lista: list[_Nodo]) -> None:
        nonlocal previo_espacio, ultimo_texto
        for n in lista:
            if isinstance(n, _Texto):
                t = re.sub(r"\s+", " ", n.texto)
                if previo_espacio and t.startswith(" "):
                    t = t[1:]
                n.texto = t
                if t:
                    previo_espacio = t.endswith(" ")
                    ultimo_texto = n
            else:
                if n.tag == "br":
                    if ultimo_texto is not None and not previo_espacio:
                        ultimo_texto.texto += " "
                    previo_espacio = True
                recorrer(n.hijos)

    recorrer(nodos)
    # recortar espacios finales
    textos: list[_Texto] = []

    def juntar(lista: list[_Nodo]) -> None:
        for n in lista:
            if isinstance(n, _Texto):
                textos.append(n)
            else:
                juntar(n.hijos)

    juntar(nodos)
    for t in reversed(textos):
        if not t.texto:
            continue
        t.texto = t.texto.rstrip(" ")
        if t.texto:
            break


def _numerar(nodos: list[_Nodo], pos: int, partes: list[str], excluidos: set[int]) -> int:
    for n in nodos:
        if isinstance(n, _Texto):
            n.ini = pos
            partes.append(n.texto)
            if n.excluido:
                excluidos.update(range(pos, pos + len(n.texto)))
            pos += len(n.texto)
        else:
            n.ini = pos
            pos = _numerar(n.hijos, pos, partes, excluidos)
            n.fin = pos
    return pos


def _cortar(nodos: list[_Nodo], a: int, b: int, total: int, es_ultimo: bool, hueco: bool = False) -> list[_Nodo]:
    """Copia de los nodos limitada al rango [a, b) de caracteres."""
    salida: list[_Nodo] = []
    for n in nodos:
        if isinstance(n, _Texto):
            fin = n.ini + len(n.texto)
            x, y = max(a, n.ini), min(b, fin)
            if x < y:
                salida.append(_Texto(n.texto[x - n.ini : y - n.ini]))
        else:
            if n.ini == n.fin:  # elemento sin texto (img, br, ancla): va al rango que contiene su posición
                if a <= n.ini < b or (es_ultimo and n.ini == b):
                    salida.append(_Elem(n.tag, dict(n.attrib), _cortar(n.hijos, a, b, total, es_ultimo)))
                continue
            if n.fin <= a or n.ini >= b:
                continue
            if hueco:  # entre frases solo hay espacios: no se clona el elemento en línea
                salida.extend(_cortar(n.hijos, a, b, total, es_ultimo, hueco))
                continue
            attrib = dict(n.attrib)
            if n.ini < a and "id" in attrib:
                del attrib["id"]  # el id solo en el primer trozo
            salida.append(_Elem(n.tag, attrib, _cortar(n.hijos, a, b, total, es_ultimo)))
    return salida


def _materializar(padre: Elemento, nodos: list[_Nodo]) -> None:
    for n in nodos:
        if isinstance(n, _Texto):
            if not n.texto:
                continue
            if len(padre):
                padre[-1].tail = (padre[-1].tail or "") + n.texto
            else:
                padre.text = (padre.text or "") + n.texto
        else:
            el = etree.SubElement(padre, n.tag, n.attrib)
            _materializar(el, n.hijos)


# ------------------------------------------------------------------ API


def _es_codigo(el: Elemento) -> bool:
    return el.tag == "pre" and "bah-codigo" in (el.get("class") or "").split()


def bloques_hoja(body: Elemento) -> list[Elemento]:
    """Bloques con texto y sin hijos de bloque, en orden de documento."""
    hojas: list[Elemento] = []
    elegidas: set[Elemento] = set()
    for el in body.iter():
        if el is body or not isinstance(el.tag, str):
            continue
        if el.tag not in BLOQUES_HOJA_O_CONTENEDOR or el.tag in {
            "hr",
            "ul",
            "ol",
            "dl",
            "table",
            "thead",
            "tbody",
            "tfoot",
            "tr",
        }:
            continue
        if any(es_bloque(h) for h in el):
            continue
        # (v1.6) bloques de código (Markdown/HTML): se ven tal cual, sin segmentar ni colapsar espacios, y no se leen
        if _es_codigo(el) or any(_es_codigo(a) for a in el.iterancestors()):
            continue
        # no segmentar dentro de un bloque hoja ya elegido (p.ej. <p> dentro de <li> sin otros bloques)
        if any(a in elegidas for a in el.iterancestors()):
            continue
        if texto_plano(el).strip():
            hojas.append(el)
            elegidas.add(el)
    return hojas


def envolver_capitulo(body: Elemento, capitulo: int) -> list[Frase]:
    """Envuelve todas las frases del capítulo en spans con id; devuelve la lista de frases en orden."""
    frases: list[Frase] = []
    for bloque in bloques_hoja(body):
        frases.extend(_envolver_bloque(bloque, capitulo, len(frases)))
    return frases


def _envolver_bloque(bloque: Elemento, capitulo: int, desde: int) -> list[Frase]:
    modelo = _a_modelo(bloque)
    _colapsar(modelo)
    partes: list[str] = []
    excluidos: set[int] = set()
    total = _numerar(modelo, 0, partes, excluidos)
    texto = "".join(partes)
    rangos = segmentar(texto)
    # el bloque se reescribe aunque no haya frases (queda con espacios colapsados)
    tail = bloque.tail
    for hijo in list(bloque):
        bloque.remove(hijo)
    bloque.text = None
    bloque.tail = tail
    if not rangos:
        _materializar(bloque, modelo)
        return []
    es_titulo = bloque.tag in _TITULOS
    # notas al pie (epub:type footnote/endnote): se ven, pero no se leen en voz (plan §5.4)
    es_nota_pie = any("bah-nota-pie" in (a.get("class") or "").split() for a in [bloque, *bloque.iterancestors()])
    frases: list[Frase] = []
    # línea de tiempo contigua: hueco, frase, hueco, frase, ..., hueco
    limites: list[tuple[int, int, int | None]] = []
    pos = 0
    for n_rango, (a, b) in enumerate(rangos):
        if a > pos:
            limites.append((pos, a, None))
        limites.append((a, b, n_rango))
        pos = b
    if pos < total or not limites:
        limites.append((pos, total, None))
    for k, (a, b, i) in enumerate(limites):
        es_ultimo = k == len(limites) - 1
        nodos = _cortar(modelo, a, b, total, es_ultimo, hueco=(i is None and not texto[a:b].strip()))
        if i is None:
            _materializar(bloque, nodos)
            continue
        fid = id_frase(capitulo, desde + i)
        span = etree.SubElement(bloque, "span", {"class": CLASE_FRASE, "id": fid})
        _materializar(span, nodos)
        texto_frase = texto[a:b]
        exc_rel = {p - a for p in excluidos if a <= p < b}
        hablable = tiene_contenido_hablable(texto_frase) and not es_nota_pie
        voz = preparar_voz(texto_frase, exc_rel, es_titulo) if hablable else ""
        if voz and not tiene_contenido_hablable(voz):
            voz = ""
        frases.append(Frase(fid, texto_frase, voz, fin_parrafo=(i == len(rangos) - 1), es_titulo=es_titulo))
    return frases

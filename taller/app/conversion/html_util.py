"""Limpieza de HTML/XHTML de entrada a un subconjunto XHTML seguro y estable (sin espacio de nombres).

El resultado es un `<body>` de lxml.etree con:
- solo etiquetas de una lista blanca (las desconocidas se "desenvuelven" conservando su texto);
- sin scripts, estilos, formularios, SVG ni MathML;
- atributos reducidos (id, class, href, src, alt, title, colspan, rowspan);
- texto en línea suelto dentro de contenedores envuelto en <p> (para que todo bloque de texto sea "hoja").
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from lxml import etree

from .normalizador import normalizar_visual

Elemento = etree._Element

BLOQUES_HOJA_O_CONTENEDOR = {
    "p",
    "div",
    "section",
    "article",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "figure",
    "figcaption",
    "pre",
    "hr",
    "aside",
}
EN_LINEA = {
    "em",
    "i",
    "strong",
    "b",
    "u",
    "s",
    "sub",
    "sup",
    "small",
    "span",
    "a",
    "br",
    "img",
    "code",
    "cite",
    "q",
    "abbr",
    "mark",
    "var",
    "dfn",
    "kbd",
    "del",
    "ins",
    "time",
}
RENOMBRAR = {
    "header": "div",
    "footer": "div",
    "main": "div",
    "nav": "div",
    "center": "div",
    "font": "span",
    "big": "span",
    "tt": "code",
    "strike": "s",
    "address": "p",
}
DESCARTAR = {
    "script",
    "style",
    "head",
    "title",
    "meta",
    "link",
    "svg",
    "math",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "iframe",
    "object",
    "embed",
    "video",
    "audio",
    "canvas",
    "noscript",
    "template",
    "map",
    "area",
}
ATRIBUTOS = {"id", "class", "href", "src", "alt", "title", "colspan", "rowspan"}
CONTENEDORES = {
    "div",
    "section",
    "article",
    "blockquote",
    "li",
    "dd",
    "td",
    "th",
    "figure",
    "aside",
    "body",
    "caption",
    "dt",
    "figcaption",
}
_ID_VALIDO = re.compile(r"^[A-Za-z_][\w.\-]*$")

ResolverImagen = Callable[[str], str | None]
ResolverEnlace = Callable[[str], str | None]


def nombre_local(el: Any) -> str:
    if not isinstance(el.tag, str):
        return ""
    return etree.QName(el).localname.lower()


def limpiar_cuerpo(
    origen: Elemento, resolver_imagen: ResolverImagen | None = None, resolver_enlace: ResolverEnlace | None = None
) -> etree._Element:
    """Copia limpia del contenido de `origen` (un <body> o cualquier elemento) en un nuevo <body>."""
    body = etree.Element("body")
    _copiar_hijos(origen, body, resolver_imagen, resolver_enlace)
    envolver_en_linea_sueltos(body)
    _quitar_vacios(body)
    return body


def _texto_visual(t: str | None) -> str | None:
    return normalizar_visual(t) if t else t


def _copiar_hijos(
    origen: Elemento, destino: Elemento, r_img: ResolverImagen | None, r_enl: ResolverEnlace | None
) -> None:
    _anexar_texto(destino, _texto_visual(origen.text))
    for hijo in origen:
        tail = _texto_visual(hijo.tail)
        if not isinstance(hijo.tag, str):  # comentarios / PIs
            _anexar_texto(destino, tail)
            continue
        nombre = nombre_local(hijo)
        nombre = RENOMBRAR.get(nombre, nombre)
        if nombre in DESCARTAR:
            pass
        elif nombre == "img" or nombre == "image":
            src = hijo.get("src") or hijo.get("{http://www.w3.org/1999/xlink}href") or hijo.get("href")
            nuevo_src = r_img(src) if (r_img and src) else None
            if nuevo_src:
                img = etree.SubElement(destino, "img")
                img.set("src", nuevo_src)
                img.set("alt", hijo.get("alt") or "")
        elif _es_enlace_de_vuelta(hijo):
            pass  # "↩︎" de vuelta desde una nota (pandoc/mammoth): ni se ve ni se lee
        elif nombre in BLOQUES_HOJA_O_CONTENEDOR or nombre in EN_LINEA:
            estructural = _tipo_estructural(hijo) if nombre in _CON_TIPO else None
            if estructural:
                # (0.4.0, contratos C1) epub:type de secciones (chapter, epigraph, dedication…) se conserva
                nuevo = etree.SubElement(destino, nombre, nsmap={"epub": NS_EPUB})
                nuevo.set(f"{{{NS_EPUB}}}type", estructural)
            else:
                nuevo = etree.SubElement(destino, nombre)
            marca = _marca_de_nota(hijo)
            if marca:
                nuevo.set("class", marca)
            for k_crudo, v_crudo in hijo.attrib.items():
                k, v = str(k_crudo), str(v_crudo)
                k_local = etree.QName(k).localname if k.startswith("{") else k
                if _es_epub_type(k):
                    continue
                if k_local not in ATRIBUTOS:
                    continue
                if k_local == "id" and not _ID_VALIDO.match(v):
                    continue
                if k_local == "href":
                    destino_href = (
                        r_enl(v) if r_enl else (v if v.startswith(("http://", "https://", "mailto:")) else None)
                    )
                    if destino_href:
                        nuevo.set("href", destino_href)
                    continue
                if k_local == "src":
                    continue
                clase_previa = nuevo.get("class")
                if k_local == "class" and clase_previa:
                    v = v + " " + clase_previa
                nuevo.set(k_local, v)
            if nombre == "hr":
                pass
            else:
                _copiar_hijos(hijo, nuevo, r_img, r_enl)
        else:
            # desconocida: se desenvuelve
            _copiar_hijos(hijo, destino, r_img, r_enl)
        _anexar_texto(destino, tail)


NS_EPUB = "http://www.idpf.org/2007/ops"
_CON_TIPO = {"section", "div", "article", "blockquote", "figure"}
# valores de epub:type que describen la estructura (no las notas: esas se marcan con clases propias)
_ESTRUCTURALES = {
    "part",
    "chapter",
    "division",
    "volume",
    "subchapter",
    "prologue",
    "epilogue",
    "introduction",
    "preface",
    "foreword",
    "afterword",
    "conclusion",
    "preamble",
    "dedication",
    "epigraph",
    "titlepage",
    "halftitlepage",
    "copyright-page",
    "colophon",
    "acknowledgments",
    "appendix",
    "bibliography",
    "glossary",
    "frontmatter",
    "bodymatter",
    "backmatter",
    "pullquote",
}


def _tipo_estructural(el: Elemento) -> str | None:
    valores: list[str] = []
    for k, v in el.attrib.items():
        if _es_epub_type(str(k)):
            valores += [x for x in str(v).split() if x in _ESTRUCTURALES]
    return " ".join(valores) or None


_TIPOS_NOTA_PIE = {"footnote", "endnote", "rearnote", "note", "footnotes", "endnotes", "rearnotes"}
_ROLES_NOTA_PIE = {"doc-footnote", "doc-endnote", "doc-endnotes", "doc-footnotes"}
_FLECHAS_VUELTA = {"↩", "↩︎", "↑", "^"}


def _es_epub_type(k: str) -> bool:
    """`epub:type` con espacio de nombres (parser XML) o literal (parser HTML, QA DA-10)."""
    return k == "epub:type" or (k.startswith("{") and "idpf.org/2007/ops" in k and k.endswith("}type"))


def _marca_de_nota(el: Elemento) -> str | None:
    """Clase interna para notas: `bah-nota` (llamada) o `bah-nota-pie` (texto de la nota). Ninguna se lee en voz.

    Reconoce EPUB (`epub:type`), pandoc (`role="doc-endnotes"`, `class="footnotes"`, `footnote-ref`) y DPUB-ARIA.
    """
    tipos: set[str] = set()
    for k, v in el.attrib.items():
        if _es_epub_type(str(k)):
            tipos |= set(str(v).split())
    rol = set((el.get("role") or "").split())
    clases = set((el.get("class") or "").split())
    if "noteref" in tipos or "doc-noteref" in rol or "footnote-ref" in clases:
        return "bah-nota"
    if tipos & _TIPOS_NOTA_PIE or rol & _ROLES_NOTA_PIE or "footnotes" in clases:
        return "bah-nota-pie"
    return None


def _es_enlace_de_vuelta(el: Elemento) -> bool:
    if nombre_local(el) != "a":
        return False
    rol = set((el.get("role") or "").split())
    clases = set((el.get("class") or "").split())
    href = el.get("href") or ""
    if "doc-backlink" in rol or "footnote-back" in clases:
        return True
    # mammoth: <a href="#footnote-ref-1">↑</a>
    return href.startswith("#footnote-ref-") and texto_de(el) in _FLECHAS_VUELTA


def _anexar_texto(destino: Elemento, texto: str | None) -> None:
    if not texto:
        return
    if len(destino):
        ultimo = destino[-1]
        ultimo.tail = (ultimo.tail or "") + texto
    else:
        destino.text = (destino.text or "") + texto


def es_bloque(el: Elemento) -> bool:
    return isinstance(el.tag, str) and el.tag in BLOQUES_HOJA_O_CONTENEDOR


def tiene_hijos_bloque(el: Elemento) -> bool:
    return any(es_bloque(h) for h in el)


def envolver_en_linea_sueltos(el: Elemento) -> None:
    """En contenedores con hijos de bloque, envuelve las tiradas de texto/elementos en línea en <p>."""
    for hijo in list(el):
        if isinstance(hijo.tag, str) and hijo.tag in BLOQUES_HOJA_O_CONTENEDOR:
            envolver_en_linea_sueltos(hijo)
    if el.tag not in CONTENEDORES or not tiene_hijos_bloque(el):
        return
    nuevos: list[Elemento] = []
    tirada: list[Elemento] = []  # elementos en línea pendientes
    texto_tirada = el.text or ""
    el.text = None

    def cerrar() -> None:
        nonlocal tirada, texto_tirada
        if (texto_tirada and texto_tirada.strip()) or any(
            (isinstance(x.tag, str) and x.tag != "br") or (x.tail and x.tail.strip()) for x in tirada
        ):
            p = etree.Element("p")
            p.text = texto_tirada
            for x in tirada:
                p.append(x)
            nuevos.append(p)
        tirada = []
        texto_tirada = ""

    for hijo in list(el):
        el.remove(hijo)
        if es_bloque(hijo):
            cerrar()
            cola = hijo.tail
            hijo.tail = None
            nuevos.append(hijo)
            texto_tirada = cola or ""
        else:
            tirada.append(hijo)
    cerrar()
    for n in nuevos:
        el.append(n)


def _quitar_vacios(el: Elemento) -> None:
    for hijo in list(el):
        if not isinstance(hijo.tag, str):
            continue
        _quitar_vacios(hijo)
        if hijo.tag in {
            "p",
            "div",
            "span",
            "section",
            "blockquote",
            "li",
            "ul",
            "ol",
            "em",
            "i",
            "strong",
            "b",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "a",
        }:
            sin_texto = not texto_plano(hijo).strip()
            sin_medios = hijo.find(".//img") is None and hijo.find(".//hr") is None
            if sin_texto and sin_medios and not hijo.get("id"):
                _eliminar_conservando_cola(hijo)


def _eliminar_conservando_cola(el: Elemento) -> None:
    padre = el.getparent()
    if padre is None:
        return
    if el.tail:
        previo = el.getprevious()
        if previo is not None:
            previo.tail = (previo.tail or "") + el.tail
        else:
            padre.text = (padre.text or "") + el.tail
    padre.remove(el)


def texto_plano(el: Elemento) -> str:
    """Texto de un elemento y sus descendientes (equivale a `textContent`)."""
    return "".join(str(t) for t in el.itertext())


def texto_de(el: Elemento) -> str:
    return re.sub(r"\s+", " ", texto_plano(el)).strip()


def parsear_xhtml(datos: bytes) -> Elemento:
    """Parsea XHTML; si no es XML bien formado, cae a lxml.html. Devuelve el elemento raíz."""
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=False)  # sin huge_tree (SE-01)
        return etree.fromstring(datos, parser)
    except etree.XMLSyntaxError:
        import lxml.html

        return lxml.html.document_fromstring(datos)


def buscar_body(raiz: Elemento) -> Elemento:
    for el in raiz.iter():
        if nombre_local(el) == "body":
            return el
    return raiz

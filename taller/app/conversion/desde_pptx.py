"""PowerPoint (.pptx) → Libro: un capítulo por diapositiva, con su texto, tablas, imágenes y notas del orador.

Se lee el ZIP con lxml (sin red ni entidades) tras `revisar_zip`. Orden: el de `presentation.xml` (sldIdLst →
relaciones). Las diapositivas ocultas (`show="0"`) se omiten. Título del capítulo: "Diapositiva N · título" (el
marcador de título o de título centrado). Las viñetas con nivel se vuelven listas anidadas. Las notas del orador van
en un `<aside class="bah-nota-pie">` (se ven, no se leen en voz).
"""

from __future__ import annotations

import logging
import posixpath
import zipfile
from pathlib import Path

from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import AlmacenImagenes, Capitulo, ErrorDefinitivo, Libro, NodoToc
from .html_util import Elemento, envolver_en_linea_sueltos, texto_de
from .limites import revisar_zip
from .metadatos import normalizar_autores, titulo_desde_nombre, titulo_util
from .normalizador import normalizar_visual

log = logging.getLogger(__name__)

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
}
_R_ID = f"{{{NS['r']}}}id"
_R_EMBED = f"{{{NS['r']}}}embed"
_TIPOS_TITULO = {"title", "ctrTitle"}
_MAX_NIVEL = 5


def _xml(z: zipfile.ZipFile, nombre: str) -> Elemento | None:
    try:
        datos = z.read(nombre)
    except KeyError:
        return None
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    try:
        return etree.fromstring(datos, parser)
    except etree.XMLSyntaxError:
        return None


def _relaciones(z: zipfile.ZipFile, parte: str) -> dict[str, tuple[str, str]]:
    """id → (tipo, ruta absoluta en el ZIP) de las relaciones de `parte`."""
    carpeta, nombre = posixpath.split(parte)
    raiz = _xml(z, posixpath.join(carpeta, "_rels", nombre + ".rels"))
    rels: dict[str, tuple[str, str]] = {}
    if raiz is None:
        return rels
    for r in raiz.iterfind("rel:Relationship", NS):
        if r.get("TargetMode") == "External":
            continue
        destino = posixpath.normpath(posixpath.join(carpeta, r.get("Target") or ""))
        rels[r.get("Id") or ""] = ((r.get("Type") or "").rsplit("/", 1)[-1], destino.lstrip("/"))
    return rels


def convertir_pptx(ruta: Path) -> Libro:
    try:
        z = zipfile.ZipFile(ruta)
    except (zipfile.BadZipFile, OSError) as e:
        raise ErrorDefinitivo(Msj.PRESENTACION_DANADA) from e
    with z:
        revisar_zip(z)
        pres = _xml(z, "ppt/presentation.xml")
        if pres is None:
            raise ErrorDefinitivo(Msj.PRESENTACION_DANADA)
        libro = Libro()
        _metadatos(z, libro, ruta.stem)
        rels = _relaciones(z, "ppt/presentation.xml")
        almacen = AlmacenImagenes(libro)
        numero = 0
        for sld in pres.iterfind("p:sldIdLst/p:sldId", NS):
            rel = rels.get(sld.get(_R_ID) or "")
            if rel is None:
                continue
            numero += 1
            parte = rel[1]
            diapo = _xml(z, parte)
            if diapo is None or diapo.get("show") == "0":
                continue
            _diapositiva(z, parte, diapo, numero, libro, almacen)
    if not libro.capitulos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    return libro


def _metadatos(z: zipfile.ZipFile, libro: Libro, nombre: str) -> None:
    core = _xml(z, "docProps/core.xml")
    titulo = None
    if core is not None:
        t = core.find("dc:title", NS)
        titulo = titulo_util(t.text if t is not None else None)
        c = core.find("dc:creator", NS)
        libro.metadatos["autores"] = normalizar_autores(c.text if c is not None else None)
        idioma = core.find("dc:language", NS)
        if idioma is not None and idioma.text:
            libro.metadatos["idioma"] = idioma.text.strip()[:10]
    libro.metadatos["titulo"] = titulo or titulo_desde_nombre(nombre)


def _texto_parrafo(p: Elemento) -> str:
    partes: list[str] = []
    for el in p.iter(f"{{{NS['a']}}}t", f"{{{NS['a']}}}br"):
        partes.append("\n" if el.tag.endswith("}br") else (el.text or ""))
    return normalizar_visual("".join(partes)).strip()


def _diapositiva(
    z: zipfile.ZipFile, parte: str, diapo: Elemento, numero: int, libro: Libro, almacen: AlmacenImagenes
) -> None:
    rels = _relaciones(z, parte)
    body = etree.Element("body")
    titulo_diapo = ""
    arbol = diapo.find("p:cSld/p:spTree", NS)
    formas = (
        list(arbol.iter(f"{{{NS['p']}}}sp", f"{{{NS['p']}}}graphicFrame", f"{{{NS['p']}}}pic"))
        if arbol is not None
        else []
    )
    for forma in formas:
        local = etree.QName(forma).localname
        if local == "sp":
            ph = forma.find("p:nvSpPr/p:nvPr/p:ph", NS)
            es_titulo = ph is not None and ph.get("type") in _TIPOS_TITULO
            parrafos = forma.findall("p:txBody/a:p", NS)
            if es_titulo:
                texto = " ".join(t for t in (_texto_parrafo(p) for p in parrafos) if t)
                if texto and not titulo_diapo:
                    titulo_diapo = texto
                continue
            _parrafos_a_html(body, parrafos)
        elif local == "graphicFrame":
            tabla = forma.find(".//a:tbl", NS)
            if tabla is not None:
                _tabla(body, tabla)
        elif local == "pic":
            blip = forma.find(".//a:blip", NS)
            rel = rels.get(blip.get(_R_EMBED) or "") if blip is not None else None
            if rel is not None and rel[0] == "image":
                try:
                    datos = z.read(rel[1])
                except KeyError:
                    continue
                src = almacen.agregar(rel[1], datos, posixpath.splitext(rel[1])[1])
                if src:
                    desc = forma.find("p:nvPicPr/p:cNvPr", NS)
                    etree.SubElement(
                        etree.SubElement(body, "p"),
                        "img",
                        {"src": src, "alt": (desc.get("descr") or "") if desc is not None else ""},
                    )
    _notas(z, rels, body)
    titulo = f"Diapositiva {numero}" + (f" · {titulo_diapo}" if titulo_diapo else "")
    h = etree.Element("h2")
    h.text = titulo_diapo or f"Diapositiva {numero}"
    body.insert(0, h)
    envolver_en_linea_sueltos(body)  # el texto de un <li> con sublista va en <p> (si no, no se lee)
    if not texto_de(body) and body.find(".//img") is None:
        return
    indice = len(libro.capitulos)
    libro.capitulos.append(Capitulo(titulo=titulo[:300], cuerpo=body))
    libro.toc.append(NodoToc(titulo[:300], indice))


def _parrafos_a_html(body: Elemento, parrafos: list[Elemento]) -> None:
    """Párrafos con viñeta o nivel > 0 → listas anidadas; el resto, <p>."""
    pila: list[tuple[int, Elemento]] = []  # (nivel, <ul>)
    for p in parrafos:
        texto = _texto_parrafo(p)
        if not texto:
            continue
        ppr = p.find("a:pPr", NS)
        nivel = min(_MAX_NIVEL, int(ppr.get("lvl") or 0)) if ppr is not None else 0
        sin_vineta = ppr is not None and ppr.find("a:buNone", NS) is not None
        con_vineta = ppr is not None and (
            ppr.find("a:buChar", NS) is not None or ppr.find("a:buAutoNum", NS) is not None
        )
        if (nivel == 0 and not con_vineta) or sin_vineta:
            pila.clear()
            etree.SubElement(body, "p").text = texto
            continue
        while pila and pila[-1][0] > nivel:
            pila.pop()
        if not pila or pila[-1][0] < nivel:
            padre = body if not pila else (pila[-1][1][-1] if len(pila[-1][1]) else pila[-1][1])
            lista = etree.SubElement(
                padre, "ol" if ppr is not None and ppr.find("a:buAutoNum", NS) is not None else "ul"
            )
            pila.append((nivel, lista))
        etree.SubElement(pila[-1][1], "li").text = texto


def _tabla(body: Elemento, tbl: Elemento) -> None:
    div = etree.SubElement(body, "div", {"class": "bah-tabla"})
    tabla = etree.SubElement(div, "table")
    for i, tr in enumerate(tbl.iterfind("a:tr", NS)):
        fila = etree.SubElement(tabla, "tr")
        for tc in tr.iterfind("a:tc", NS):
            if tc.get("hMerge") == "1" or tc.get("vMerge") == "1":
                continue
            celda = etree.SubElement(fila, "th" if i == 0 else "td")
            for atributo, destino in (("gridSpan", "colspan"), ("rowSpan", "rowspan")):
                if (tc.get(atributo) or "1") != "1":
                    celda.set(destino, tc.get(atributo) or "1")
            textos = [t for t in (_texto_parrafo(p) for p in tc.iterfind("a:txBody/a:p", NS)) if t]
            if textos:
                etree.SubElement(celda, "p").text = "\n".join(textos)


def _notas(z: zipfile.ZipFile, rels: dict[str, tuple[str, str]], body: Elemento) -> None:
    parte = next((destino for tipo, destino in rels.values() if tipo == "notesSlide"), None)
    if parte is None:
        return
    notas = _xml(z, parte)
    if notas is None:
        return
    textos: list[str] = []
    for sp in notas.iter(f"{{{NS['p']}}}sp"):
        ph = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
        if ph is not None and ph.get("type") not in (None, "body"):
            continue  # número de diapositiva, imagen de la diapositiva, encabezados…
        textos.extend(t for t in (_texto_parrafo(p) for p in sp.iterfind("p:txBody/a:p", NS)) if t)
    if not textos:
        return
    aside = etree.SubElement(body, "aside", {"class": "bah-nota-pie bah-notas-orador"})
    etree.SubElement(aside, "h3").text = "Notas del orador"
    for t in textos:
        etree.SubElement(aside, "p").text = t

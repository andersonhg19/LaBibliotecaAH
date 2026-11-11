"""EPUB (2 o 3) → Libro. Se lee con zipfile + lxml: OPF (metadatos, manifiesto, spine), nav/NCX, portada."""

from __future__ import annotations

import logging
import posixpath
import re
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urldefrag

from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import AlmacenImagenes, Capitulo, ErrorDefinitivo, Libro, NodoToc
from .html_util import Elemento, buscar_body, limpiar_cuerpo, nombre_local, parsear_xhtml, texto_de, texto_plano

log = logging.getLogger(__name__)

NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "c": "urn:oasis:names:tc:opendocument:xmlns:container",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
}
# (titulo, ruta del documento, fragmento, hijos)
type _EntradaToc = tuple[str, str | None, str | None, list[_EntradaToc]]


@dataclass
class _Item:
    id: str
    ruta: str
    tipo: str
    props: list[str]


_XML = etree.XMLParser(resolve_entities=False, no_network=True, recover=True, huge_tree=True)


def _leer(z: zipfile.ZipFile, ruta: str) -> bytes | None:
    try:
        return z.read(ruta)
    except KeyError:
        # algunos EPUB tienen rutas con mayúsculas/minúsculas inconsistentes o %20
        objetivo = unquote(ruta).lower()
        for n in z.namelist():
            if n.lower() == objetivo:
                return z.read(n)
        return None


def _resolver(base_doc: str, href: str) -> str:
    href = unquote(href)
    return posixpath.normpath(posixpath.join(posixpath.dirname(base_doc), href)).lstrip("/")


def _texto(nodo: Elemento | None) -> str | None:
    if nodo is None:
        return None
    t = re.sub(r"\s+", " ", texto_plano(nodo)).strip()
    return t or None


def _isbn(identificadores: list[str]) -> str | None:
    for ident in identificadores:
        digitos = re.sub(r"[^0-9Xx]", "", ident.replace("urn:isbn:", ""))
        if len(digitos) in (10, 13) and (
            "isbn" in ident.lower() or digitos.startswith(("978", "979")) or len(digitos) == 10
        ):
            return digitos.upper()
    return None


def convertir_epub(ruta: Path) -> Libro:
    try:
        z = zipfile.ZipFile(ruta)
    except zipfile.BadZipFile as e:
        raise ErrorDefinitivo(Msj.EPUB_DANADO) from e
    with z:
        return _convertir(z)


def _convertir(z: zipfile.ZipFile) -> Libro:
    container = _leer(z, "META-INF/container.xml")
    if container is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_CONTAINER)
    raiz_c = etree.fromstring(container, _XML)
    rootfile = raiz_c.find(".//c:rootfile", NS)
    if rootfile is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_OPF)
    ruta_opf = rootfile.get("full-path") or ""
    datos_opf = _leer(z, ruta_opf) if ruta_opf else None
    if datos_opf is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_OPF)
    opf = etree.fromstring(datos_opf, _XML)

    libro = Libro()
    _metadatos(opf, libro)

    manifiesto: dict[str, _Item] = {}
    for item in opf.iterfind(".//opf:manifest/opf:item", NS):
        href = item.get("href")
        if not href:
            continue
        info = _Item(
            id=item.get("id") or href,
            ruta=_resolver(ruta_opf, href),
            tipo=item.get("media-type") or "",
            props=(item.get("properties") or "").split(),
        )
        manifiesto[info.id] = info

    # ---- portada
    ruta_portada = _ruta_portada(opf, manifiesto)
    if ruta_portada:
        libro.portada = _leer(z, ruta_portada)

    # ---- spine
    spine = opf.find(".//opf:spine", NS)
    docs: list[str] = []
    nav_ruta = next((i.ruta for i in manifiesto.values() if "nav" in i.props), None)
    if spine is not None:
        for ref in spine.iterfind("opf:itemref", NS):
            ref_item = manifiesto.get(ref.get("idref") or "")
            if not ref_item or (
                "html" not in ref_item.tipo and not ref_item.ruta.endswith((".xhtml", ".html", ".htm"))
            ):
                continue
            if ref_item.ruta == nav_ruta:
                continue
            docs.append(ref_item.ruta)
    if not docs:
        raise ErrorDefinitivo(Msj.EPUB_SIN_CONTENIDO)

    # ---- índice (nav EPUB3 o NCX EPUB2)
    toc_crudo = _toc_nav(z, nav_ruta) if nav_ruta else []
    id_ncx = spine.get("toc") if spine is not None else None
    if not toc_crudo and id_ncx and id_ncx in manifiesto:
        toc_crudo = _toc_ncx(z, manifiesto[id_ncx].ruta)

    # ---- decidir qué documentos son capítulos
    parseados: list[tuple[str, Elemento]] = []
    for ruta_doc in docs:
        datos = _leer(z, ruta_doc)
        if datos is None:
            log.warning("Documento del spine ausente: %s", ruta_doc)
            continue
        try:
            raiz = parsear_xhtml(datos)
        except Exception as e:
            log.warning("No se pudo leer %s: %s", ruta_doc, e)
            continue
        parseados.append((ruta_doc, raiz))

    elegidos: list[tuple[str, Elemento]] = []
    pendientes_img: list[tuple[str, Elemento]] = []  # láminas sin texto: se anteponen al siguiente capítulo
    for ruta_doc, raiz in parseados:
        body = buscar_body(raiz)
        texto = texto_de(body)
        imgs = [e for e in body.iter() if nombre_local(e) in ("img", "image")]
        if texto:
            elegidos.append((ruta_doc, raiz))
        elif imgs and not _solo_portada(imgs, ruta_doc, ruta_portada):
            pendientes_img.append((ruta_doc, raiz))
    if not elegidos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    indice_doc = {ruta: i for i, (ruta, _r) in enumerate(elegidos)}

    almacen = AlmacenImagenes(libro)

    def resolver_enlace_desde(ruta_doc: str) -> Callable[[str], str | None]:
        def resolver(href: str) -> str | None:
            if href.startswith(("http://", "https://", "mailto:")):
                return href
            sin_frag, frag = urldefrag(href)
            destino = _resolver(ruta_doc, sin_frag) if sin_frag else ruta_doc
            if destino not in indice_doc:
                return None
            return f"cap-{indice_doc[destino]:03d}.xhtml" + (f"#{frag}" if frag else "")

        return resolver

    def resolver_imagen_desde(ruta_doc: str) -> Callable[[str], str | None]:
        def resolver(src: str) -> str | None:
            if src.startswith("data:"):
                return None
            ruta_img = _resolver(ruta_doc, src)
            datos = _leer(z, ruta_img)
            if datos is None:
                return None
            return almacen.agregar(ruta_img, datos, posixpath.splitext(ruta_img)[1])

        return resolver

    # títulos y niveles desde el índice
    titulos: dict[str, tuple[str, int]] = {}

    def recorrer(nodos: list[_EntradaToc], nivel: int) -> None:
        for titulo, ruta, frag, hijos in nodos:
            nuevo = ruta not in titulos and titulo
            if ruta and (nuevo or (ruta in titulos and not frag and titulos[ruta][1] > nivel)):
                titulos[ruta] = (titulo, nivel)
            recorrer(hijos, nivel + 1)

    recorrer(toc_crudo, 1)

    # documentos de imagen pendientes → se anexan al capítulo siguiente
    previos_por_doc: dict[str, list[tuple[str, Elemento]]] = {}
    orden = [r for r, _ in parseados]
    for ruta_img_doc, raiz in pendientes_img:
        pos = orden.index(ruta_img_doc)
        siguiente = next((r for r in orden[pos + 1 :] if r in indice_doc), None)
        if siguiente:
            previos_por_doc.setdefault(siguiente, []).append((ruta_img_doc, raiz))

    for i, (ruta_doc, raiz) in enumerate(elegidos):
        cuerpo = limpiar_cuerpo(buscar_body(raiz), resolver_imagen_desde(ruta_doc), resolver_enlace_desde(ruta_doc))
        for ruta_img_doc, raiz_img in previos_por_doc.get(ruta_doc, []):
            extra = limpiar_cuerpo(buscar_body(raiz_img), resolver_imagen_desde(ruta_img_doc), None)
            for k, hijo in enumerate(list(extra)):
                cuerpo.insert(k, hijo)
        titulo, nivel = titulos.get(ruta_doc, ("", 1))
        if not titulo:
            cab = next((e for e in cuerpo.iter() if e.tag in ("h1", "h2", "h3")), None)
            titulo = texto_de(cab) if cab is not None else f"Sección {i + 1}"
        libro.capitulos.append(Capitulo(titulo=titulo[:300], cuerpo=cuerpo, nivel=nivel))

    libro.toc = _toc_final(toc_crudo, indice_doc)
    return libro


def _solo_portada(imgs: list[Elemento], ruta_doc: str, ruta_portada: str | None) -> bool:
    if not ruta_portada:
        return "cover" in ruta_doc.lower() or "portada" in ruta_doc.lower()
    for img in imgs:
        src = img.get("src") or img.get("{http://www.w3.org/1999/xlink}href") or ""
        if _resolver(ruta_doc, src) != ruta_portada:
            return False
    return True


def _metadatos(opf: Elemento, libro: Libro) -> None:
    md = libro.metadatos
    meta = opf.find(".//opf:metadata", NS)
    if meta is None:
        return
    md["titulo"] = _texto(meta.find("dc:title", NS))
    md["autores"] = [t for t in (_texto(c) for c in meta.iterfind("dc:creator", NS)) if t]
    md["idioma"] = (_texto(meta.find("dc:language", NS)) or "es")[:10]
    md["editorial"] = _texto(meta.find("dc:publisher", NS))
    fecha = _texto(meta.find("dc:date", NS))
    if fecha:
        m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", fecha)
        md["anio"] = int(m.group(1)) if m else None
    desc = _texto(meta.find("dc:description", NS))
    if desc:
        # la sinopsis puede venir con HTML escapado
        try:
            import lxml.html

            plano = str(lxml.html.fromstring(desc).text_content())  # type: ignore[attr-defined]
            desc = re.sub(r"\s+", " ", plano).strip() or desc
        except Exception:
            log.debug("La sinopsis no es HTML; se usa tal cual", exc_info=True)
        md["sinopsis"] = desc[:5000]
    ids = [t for t in (_texto(i) for i in meta.iterfind("dc:identifier", NS)) if t]
    md["isbn"] = _isbn(ids)


def _ruta_portada(opf: Elemento, manifiesto: dict[str, _Item]) -> str | None:
    for info in manifiesto.values():
        if "cover-image" in info.props:
            return info.ruta
    meta = opf.find(".//opf:metadata/opf:meta[@name='cover']", NS)
    contenido = meta.get("content") if meta is not None else None
    if contenido and contenido in manifiesto and manifiesto[contenido].tipo.startswith("image/"):
        return manifiesto[contenido].ruta
    for info in manifiesto.values():
        if info.tipo.startswith("image/") and ("cover" in info.id.lower() or "cover" in info.ruta.lower()):
            return info.ruta
    return None


def _toc_nav(z: zipfile.ZipFile, ruta_nav: str) -> list[_EntradaToc]:
    datos = _leer(z, ruta_nav)
    if datos is None:
        return []
    try:
        raiz = parsear_xhtml(datos)
    except Exception:
        log.warning("Índice nav ilegible (%s); se intenta el NCX", ruta_nav, exc_info=True)
        return []
    navs = [e for e in raiz.iter() if nombre_local(e) == "nav"]
    toc_nav = None
    for nav in navs:
        tipo = nav.get("{http://www.idpf.org/2007/ops}type") or nav.get("epub:type") or ""
        if "toc" in tipo.split():
            toc_nav = nav
            break
    if toc_nav is None and navs:
        toc_nav = navs[0]
    if toc_nav is None:
        return []
    ol = next((e for e in toc_nav if nombre_local(e) == "ol"), None)
    return _nav_ol(ol, ruta_nav) if ol is not None else []


def _nav_ol(ol: Elemento, ruta_nav: str) -> list[_EntradaToc]:
    salida: list[_EntradaToc] = []
    for li in ol:
        if nombre_local(li) != "li":
            continue
        a = next((e for e in li if nombre_local(e) in ("a", "span")), None)
        titulo = _texto(a) if a is not None else None
        href = a.get("href") if a is not None else None
        ruta: str | None = None
        frag: str | None = None
        if href:
            sin_frag, frag = urldefrag(href)
            ruta = _resolver(ruta_nav, sin_frag) if sin_frag else None
        sub = next((e for e in li if nombre_local(e) == "ol"), None)
        hijos = _nav_ol(sub, ruta_nav) if sub is not None else []
        salida.append((titulo or "", ruta, frag or None, hijos))
    return salida


def _toc_ncx(z: zipfile.ZipFile, ruta_ncx: str) -> list[_EntradaToc]:
    datos = _leer(z, ruta_ncx)
    if datos is None:
        return []
    raiz = etree.fromstring(datos, _XML)
    nav_map = raiz.find(".//ncx:navMap", NS)
    if nav_map is None:
        return []

    def puntos(padre: Elemento) -> list[_EntradaToc]:
        salida: list[_EntradaToc] = []
        for np in padre.iterfind("ncx:navPoint", NS):
            titulo = _texto(np.find("ncx:navLabel/ncx:text", NS)) or ""
            content = np.find("ncx:content", NS)
            ruta: str | None = None
            frag: str | None = None
            src = content.get("src") if content is not None else None
            if src:
                sin_frag, frag = urldefrag(src)
                ruta = _resolver(ruta_ncx, sin_frag) if sin_frag else None
            salida.append((titulo, ruta, frag or None, puntos(np)))
        return salida

    return puntos(nav_map)


def _toc_final(toc_crudo: list[_EntradaToc], indice_doc: dict[str, int]) -> list[NodoToc]:
    salida: list[NodoToc] = []
    for titulo, ruta, frag, hijos in toc_crudo:
        hijos_final = _toc_final(hijos, indice_doc)
        if ruta is not None and ruta in indice_doc and titulo:
            salida.append(NodoToc(titulo[:300], indice_doc[ruta], frag, hijos_final))
        else:
            salida.extend(hijos_final)  # entrada a un documento descartado: se promueven sus hijos
    return salida

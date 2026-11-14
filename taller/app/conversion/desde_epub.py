"""EPUB (2 o 3) → Libro. Se lee con zipfile + lxml: OPF (metadatos, manifiesto, spine), nav/NCX, portada."""

from __future__ import annotations

import copy
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
from .estructura import INICIO_CUERPO, TIPO_GUIDE, region_de_epub, tipo_de_epub
from .html_util import Elemento, buscar_body, limpiar_cuerpo, nombre_local, parsear_xhtml, texto_de, texto_plano
from .limites import revisar_zip
from .metadatos import autor_util, limpiar_materias, normalizar_idioma, titulo_util

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


# sin huge_tree: libxml2 conserva sus topes de profundidad y tamaño de nodo (SE-01)
_XML = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
_TITULOS_HTML = ("h1", "h2", "h3")
# algoritmos de ofuscación de fuentes (legítimos, no impiden leer el texto)
_OFUSCACION_FUENTES = {"http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"}


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
        omitidas = revisar_zip(z, omitir_imagenes=True)
        _revisar_drm(z)
        return _convertir(z, omitidas=omitidas)


def pistas_epub(ruta: Path) -> Libro:
    """(0.4.0, RECLASIFICAR_ESTRUCTURA) El libro con el reparto en capítulos de 0.3.3 y las pistas de tipo de cada
    capítulo, para casarlas con un libro ya convertido sin cambiar sus índices."""
    try:
        z = zipfile.ZipFile(ruta)
    except zipfile.BadZipFile as e:
        raise ErrorDefinitivo(Msj.EPUB_DANADO) from e
    with z:
        omitidas = revisar_zip(z, omitir_imagenes=True)
        return _convertir(z, compat=True, omitidas=omitidas)


def _xml(datos: bytes) -> Elemento | None:
    """XML tolerante; None si no se puede leer (con recover=True lxml devuelve None o lanza según el caso)."""
    try:
        return etree.fromstring(datos, _XML)
    except (etree.XMLSyntaxError, ValueError):
        return None


def _revisar_drm(z: zipfile.ZipFile) -> None:
    """DRM = META-INF/encryption.xml que cifra algo que no es una fuente ofuscada (QA DA-05)."""
    datos = _leer(z, "META-INF/encryption.xml")
    if datos is None:
        return
    raiz = _xml(datos)
    if raiz is None:
        if _leer(z, "META-INF/rights.xml") is not None:
            raise ErrorDefinitivo(Msj.EPUB_CON_DRM)
        return
    for cifrado in (e for e in raiz.iter() if nombre_local(e) == "encrypteddata"):
        metodo = next((e for e in cifrado.iter() if nombre_local(e) == "encryptionmethod"), None)
        algoritmo = metodo.get("Algorithm", "") if metodo is not None else ""
        if algoritmo not in _OFUSCACION_FUENTES:
            raise ErrorDefinitivo(Msj.EPUB_CON_DRM)


def materias_epub(ruta: Path) -> list[str]:
    """(v1.4) Solo las materias (dc:subject) del OPF, sin convertir nada: para releer libros ya convertidos."""
    try:
        z = zipfile.ZipFile(ruta)
    except zipfile.BadZipFile as e:
        raise ErrorDefinitivo(Msj.EPUB_DANADO) from e
    with z:
        revisar_zip(z)
        _ruta, opf = _abrir_opf(z)
    libro = Libro()
    _metadatos(opf, libro)
    return list(libro.metadatos["materias"])


_DECLARACION = re.compile(rb"^\s*(?:\xef\xbb\xbf)?\s*<\?xml[^>]*?encoding\s*=\s*[\"']([A-Za-z0-9._-]+)[\"']")


def _opf_utf8(datos: bytes) -> bytes:
    """Un OPF que dice ser UTF-8 (o no dice nada) pero viene en Windows-1252/Latin-1 se recodifica a UTF-8.

    Sin esto, lxml (recover=True) cambia cada «á» por U+FFFD y llegan materias como «Rom?ntico» (con U+FFFD).
    """
    if datos.startswith((b"\xff\xfe", b"\xfe\xff")):
        return datos  # UTF-16 con BOM: lxml lo detecta solo
    m = _DECLARACION.match(datos)
    declarada = m.group(1).decode("ascii").lower().replace("_", "-") if m else "utf-8"
    if declarada not in ("utf-8", "utf8"):
        return datos  # otra codificación declarada: lxml la respeta
    try:
        datos.decode("utf-8")
        return datos
    except UnicodeDecodeError:
        log.warning("El OPF dice ser UTF-8 pero no lo es: se lee como Windows-1252")
        return datos.decode("cp1252", errors="replace").encode("utf-8")


def _abrir_opf(z: zipfile.ZipFile) -> tuple[str, Elemento]:
    container = _leer(z, "META-INF/container.xml")
    if container is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_CONTAINER)
    raiz_c = _xml(container)
    if raiz_c is None:
        raise ErrorDefinitivo(Msj.EPUB_CONTAINER_ILEGIBLE)
    rootfile = raiz_c.find(".//c:rootfile", NS)
    if rootfile is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_OPF)
    ruta_opf = rootfile.get("full-path") or ""
    datos_opf = _leer(z, ruta_opf) if ruta_opf else None
    if datos_opf is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_OPF)
    opf = _xml(_opf_utf8(datos_opf))
    if opf is None:
        raise ErrorDefinitivo(Msj.EPUB_SIN_OPF)
    return ruta_opf, opf


def _convertir(z: zipfile.ZipFile, compat: bool = False, omitidas: frozenset[str] = frozenset()) -> Libro:
    """EPUB → Libro.

    `compat=True` reproduce el reparto en capítulos de 0.3.3 (sin partir XHTML con varios capítulos, sin separar lo
    que va tras el índice, primer <nav>): lo usa RECLASIFICAR_ESTRUCTURA para casar las pistas de tipo con los
    capítulos de un libro ya convertido sin cambiar sus índices (contratos C2). `omitidas`: imágenes que no se leen
    (desmesuradas, CF-15).
    """
    ruta_opf, opf = _abrir_opf(z)
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

    def leer_imagen(ruta: str) -> bytes | None:
        if ruta in omitidas:
            log.warning("Imagen desmesurada omitida: %s", ruta)
            return None
        return _leer(z, ruta)

    # ---- portada
    ruta_portada = _ruta_portada(opf, manifiesto)
    if ruta_portada:
        libro.portada = leer_imagen(ruta_portada)

    # ---- spine
    spine = opf.find(".//opf:spine", NS)
    docs: list[str] = []
    lineal: dict[str, bool] = {}
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
            lineal[ref_item.ruta] = (ref.get("linear") or "yes").strip().lower() != "no"
    if not docs:
        raise ErrorDefinitivo(Msj.EPUB_SIN_CONTENIDO)

    # ---- índice (nav EPUB3 o NCX EPUB2) y marcas de estructura (landmarks / guide)
    toc_crudo = _toc_nav(z, nav_ruta, compat) if nav_ruta else []
    id_ncx = spine.get("toc") if spine is not None else None
    if not toc_crudo and id_ncx and id_ncx in manifiesto:
        toc_crudo = _toc_ncx(z, manifiesto[id_ncx].ruta)
    marcas, inicio_cuerpo = _marcas_estructura(z, nav_ruta, opf, ruta_opf)

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

    # títulos y niveles desde el índice
    titulos: dict[str, tuple[str, int]] = {}

    def recorrer(nodos: list[_EntradaToc], nivel: int) -> None:
        for titulo, ruta, frag, hijos in nodos:
            nuevo = ruta not in titulos and titulo
            # misma página en dos niveles ("Parte I" → "Capítulo 1", sin fragmento): gana la más concreta (DA-27)
            mas_concreto = ruta in titulos and not frag and titulo and nivel > titulos[ruta][1]
            if ruta and (nuevo or mas_concreto):
                titulos[ruta] = (titulo, nivel)
            recorrer(hijos, nivel + 1)

    recorrer(toc_crudo, 1)

    textos = {ruta: texto_de(buscar_body(raiz)) for ruta, raiz in parseados}
    orden = [r for r, _ in parseados]
    posicion = {r: k for k, r in enumerate(orden)}
    tipos_doc = {ruta: _tipo_documento(buscar_body(raiz)) for ruta, raiz in parseados}
    # (0.4.0) el índice solo decide continuaciones si cubre al menos la mitad de los documentos con texto (CF-09)
    con_texto = [r for r in orden if textos[r]]
    cubiertos = sum(1 for r in con_texto if r in titulos)
    usar_indice = bool(titulos) and (compat or cubiertos * 2 >= len(con_texto))
    ultimo_del_indice = max((posicion[r] for r in titulos if r in posicion), default=-1)

    elegidos: list[tuple[str, Elemento]] = []
    anexos: dict[str, list[tuple[str, Elemento]]] = {}  # documentos que continúan el capítulo anterior
    principal_de: dict[str, str] = {}
    tras_el_indice: set[str] = set()  # (0.4.0) secciones propias tras el último documento del índice (CF-07)
    pendientes_img: list[tuple[str, Elemento]] = []  # láminas sin texto: se anteponen al siguiente capítulo
    for ruta_doc, raiz in parseados:
        body = buscar_body(raiz)
        texto = textos[ruta_doc]
        imgs = [e for e in body.iter() if nombre_local(e) in ("img", "image")]
        if texto:
            # Un capítulo repartido en varios XHTML (DA-17): si hay índice, el documento no está en él y no trae
            # título propio, es la continuación del capítulo anterior.
            continua = (
                usar_indice
                and bool(elegidos)
                and ruta_doc not in titulos
                and not any(nombre_local(e) in _TITULOS_HTML for e in body.iter())
            )
            if continua and not compat:
                # (0.4.0, CF-07) no son continuación: lo no lineal, lo que tiene tipo propio (notas, autor…) ni lo
                # que va tras el último documento del índice con otro nombre de archivo («notas.xhtml» tras
                # «cap5.xhtml»; «a3.xhtml» tras «a1.xhtml» sí sigue el capítulo)
                tipo_propio = tipos_doc[ruta_doc] not in (None, "capitulo")
                principal = elegidos[-1][0]
                tras = posicion[ruta_doc] > ultimo_del_indice and _raiz_nombre(ruta_doc) != _raiz_nombre(principal)
                if not lineal.get(ruta_doc, True) or tipo_propio or tras:
                    continua = False
                    if tras:
                        tras_el_indice.add(ruta_doc)
            if continua:
                principal = elegidos[-1][0]
                anexos.setdefault(principal, []).append((ruta_doc, raiz))
                principal_de[ruta_doc] = principal
            else:
                elegidos.append((ruta_doc, raiz))
                principal_de[ruta_doc] = ruta_doc
        elif imgs and not _solo_portada(imgs, ruta_doc, ruta_portada):
            pendientes_img.append((ruta_doc, raiz))
    if not elegidos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)

    # ---- (0.4.0, CF-03) un XHTML con varios capítulos del índice (Calibre) se parte en varios capítulos
    unidades: list[_Unidad] = []
    for ruta_doc, raiz in elegidos:
        piezas = [] if compat else _partir_por_anclas(ruta_doc, raiz, toc_crudo)
        if not piezas:
            unidades.append(_Unidad(ruta_doc, raiz, buscar_body(raiz)))
        else:
            unidades.extend(piezas)
    primera_de: dict[str, int] = {}
    ultima_de: dict[str, int] = {}
    unidad_de_id: dict[tuple[str, str], int] = {}
    for k, u in enumerate(unidades):
        primera_de.setdefault(u.ruta, k)
        ultima_de[u.ruta] = k
        for ident in u.ids:
            unidad_de_id[(u.ruta, ident)] = k
    indice_doc = dict(primera_de)
    for ruta, principal in principal_de.items():
        if ruta != principal:
            indice_doc[ruta] = ultima_de[principal]

    def destino_de(ruta: str, frag: str | None) -> int | None:
        if frag and (ruta, frag) in unidad_de_id:
            return unidad_de_id[(ruta, frag)]
        return indice_doc.get(ruta)

    almacen = AlmacenImagenes(libro)

    def resolver_enlace_desde(ruta_doc: str) -> Callable[[str], str | None]:
        def resolver(href: str) -> str | None:
            if href.startswith(("http://", "https://", "mailto:")):
                return href
            sin_frag, frag = urldefrag(href)
            destino = _resolver(ruta_doc, sin_frag) if sin_frag else ruta_doc
            k = destino_de(destino, frag or None)
            if k is None:
                return None
            return f"cap-{k:03d}.xhtml" + (f"#{frag}" if frag else "")

        return resolver

    def resolver_imagen_desde(ruta_doc: str) -> Callable[[str], str | None]:
        def resolver(src: str) -> str | None:
            if src.startswith("data:"):
                return None
            ruta_img = _resolver(ruta_doc, src)
            datos = leer_imagen(ruta_img)
            if datos is None:
                return None
            return almacen.agregar(ruta_img, datos, posixpath.splitext(ruta_img)[1])

        return resolver

    # documentos de imagen pendientes → se anexan al capítulo siguiente
    previos_por_doc: dict[str, list[tuple[str, Elemento]]] = {}
    for ruta_img_doc, raiz in pendientes_img:
        pos = orden.index(ruta_img_doc)
        siguiente = next((r for r in orden[pos + 1 :] if r in indice_doc), None)
        if siguiente:
            previos_por_doc.setdefault(principal_de[siguiente], []).append((ruta_img_doc, raiz))

    inicio_pos = posicion.get(inicio_cuerpo, -1) if inicio_cuerpo else -1
    for i, u in enumerate(unidades):
        cuerpo = limpiar_cuerpo(u.origen, resolver_imagen_desde(u.ruta), resolver_enlace_desde(u.ruta))
        es_ultima = ultima_de[u.ruta] == i
        es_primera = primera_de[u.ruta] == i
        if es_ultima:
            for ruta_anexo, raiz_anexo in anexos.get(u.ruta, []):
                extra = limpiar_cuerpo(
                    buscar_body(raiz_anexo), resolver_imagen_desde(ruta_anexo), resolver_enlace_desde(ruta_anexo)
                )
                _anexar_cuerpo(cuerpo, extra)
        if es_primera:
            for ruta_img_doc, raiz_img in previos_por_doc.get(u.ruta, []):
                extra = limpiar_cuerpo(buscar_body(raiz_img), resolver_imagen_desde(ruta_img_doc), None)
                for k, hijo in enumerate(list(extra)):
                    cuerpo.insert(k, hijo)
        titulo, nivel = (u.titulo, u.nivel) if u.titulo else titulos.get(u.ruta, ("", 1))
        if not titulo:
            cab = next((e for e in cuerpo.iter() if e.tag in ("h1", "h2", "h3")), None)
            titulo = texto_de(cab) if cab is not None else f"Sección {i + 1}"
        cap = Capitulo(titulo=titulo[:300], cuerpo=cuerpo, nivel=nivel)
        # pistas de tipo (contratos C1): epub:type del documento o de la sección; si no, landmarks / guide
        cap.epub_type = u.epub_type if u.epub_type is not None else _epub_type_crudo(buscar_body(u.raiz))
        cap.tipo = u.tipo or (tipos_doc.get(u.ruta) if es_primera else None)
        cap.origen_tipo = "epub-type" if cap.tipo else None
        if not cap.tipo and es_primera and u.ruta in marcas:
            cap.tipo, cap.origen_tipo = marcas[u.ruta]
        cap.lineal = lineal.get(u.ruta, True)
        if u.ruta in tras_el_indice:
            cap.region = "despues"
        elif inicio_pos >= 0 and posicion.get(u.ruta, 0) < inicio_pos:
            cap.region = "antes"
        elif not cap.tipo and es_primera:
            cap.region = region_de_epub(_epub_type_crudo(buscar_body(u.raiz)))
        libro.capitulos.append(cap)

    libro.toc = _toc_final(toc_crudo, destino_de)
    return libro


@dataclass
class _Unidad:
    """Un capítulo de salida: un documento entero o (CF-03) un trozo de un documento con varios capítulos."""

    ruta: str
    raiz: Elemento
    origen: Elemento  # lo que se limpia: el <body> o un <body> nuevo con el trozo
    titulo: str | None = None
    nivel: int = 1
    ids: frozenset[str] = frozenset()
    tipo: str | None = None
    epub_type: str | None = None


_EPUB_TYPE = "{http://www.idpf.org/2007/ops}type"


def _epub_type_crudo(el: Elemento) -> str | None:
    valor = el.get(_EPUB_TYPE) or el.get("epub:type")
    return valor.strip() if valor and valor.strip() else None


def _tipo_de(el: Elemento) -> str | None:
    return tipo_de_epub(_epub_type_crudo(el)) or tipo_de_epub(el.get("role"))


def _tipo_documento(body: Elemento) -> str | None:
    """Tipo del documento: `epub:type`/`role` del <body> o del primer contenedor de primer nivel (section/div)."""
    tipo = _tipo_de(body)
    nodo = body
    profundidad = 0
    while tipo is None and profundidad < 3:
        hijo = next((h for h in nodo if isinstance(h.tag, str)), None)
        if hijo is None or nombre_local(hijo) not in ("section", "div", "article", "header", "main"):
            break
        tipo = _tipo_de(hijo)
        nodo = hijo
        profundidad += 1
    return tipo


def _raiz_nombre(ruta: str) -> str:
    """«OEBPS/index_split_005.html» → «index_split»; «a3.xhtml» → «a»: documentos de una misma serie."""
    nombre = posixpath.splitext(posixpath.basename(ruta))[0].lower()
    return re.sub(r"[\d_\-. ]+$", "", nombre) or nombre


def _anclas_del_toc(toc: list[_EntradaToc], ruta_doc: str) -> list[tuple[str, str, int]]:
    """(fragmento, título, nivel) de las entradas del índice que apuntan a anclas de `ruta_doc`, en orden."""
    salida: list[tuple[str, str, int]] = []

    def recorrer(nodos: list[_EntradaToc], nivel: int) -> None:
        for titulo, ruta, frag, hijos in nodos:
            if ruta == ruta_doc and frag and all(f != frag for f, _t, _n in salida):
                salida.append((frag, titulo, nivel))
            recorrer(hijos, nivel + 1)

    recorrer(toc, 1)
    return salida


def _partir_por_anclas(ruta_doc: str, raiz: Elemento, toc: list[_EntradaToc]) -> list[_Unidad]:
    """(CF-03) Si dos o más entradas del índice apuntan a anclas distintas del mismo documento, lo parte por ellas.

    Se corta entre los hijos del contenedor común de las anclas (el <body> o el <div> que lo envuelve todo). Lo que
    haya antes de la primera ancla con texto queda como su propio capítulo. Devuelve [] si no se puede partir bien.
    """
    anclas = _anclas_del_toc(toc, ruta_doc)
    if len(anclas) < 2:
        return []
    body = buscar_body(raiz)
    por_id = {e.get("id"): e for e in body.iter() if isinstance(e.tag, str) and e.get("id")}
    halladas = [(por_id[f], f, t, n) for f, t, n in anclas if f in por_id]
    if len(halladas) < 2:
        return []
    cadenas = [[e, *e.iterancestors()] for e, *_ in halladas]
    comunes = [a for a in cadenas[0] if all(a in c for c in cadenas[1:])]
    if not comunes:
        return []
    contenedor = comunes[0]
    if contenedor is not body and len(texto_de(contenedor)) < 0.9 * len(texto_de(body)):
        return []
    hijos = [h for h in contenedor if isinstance(h.tag, str)]
    cortes: list[tuple[int, str, str, int, Elemento]] = []
    for e, f, t, n in halladas:
        tope = e if e.getparent() is contenedor else next(a for a in e.iterancestors() if a.getparent() is contenedor)
        k = hijos.index(tope) if tope in hijos else -1
        if k < 0 or any(c[0] == k for c in cortes):
            continue
        cortes.append((k, f, t, n, e))
    cortes.sort(key=lambda c: c[0])
    if len(cortes) < 2:
        return []
    unidades: list[_Unidad] = []
    tramos = [(0, cortes[0][0], None)] + [
        (c[0], cortes[j + 1][0] if j + 1 < len(cortes) else len(hijos), c) for j, c in enumerate(cortes)
    ]
    for desde, hasta, corte in tramos:
        if desde >= hasta:
            continue
        nuevo = etree.Element("body")
        if corte is None and contenedor.text and contenedor.text.strip():
            nuevo.text = contenedor.text
        for h in hijos[desde:hasta]:
            nuevo.append(copy.deepcopy(h))
        if corte is None and not texto_de(nuevo):
            continue  # nada antes de la primera ancla
        ids = frozenset(str(x.get("id")) for x in nuevo.iter() if isinstance(x.tag, str) and x.get("id"))
        if corte is None:
            unidades.append(_Unidad(ruta_doc, raiz, nuevo, ids=ids))
        else:
            _k, _f, titulo, nivel, ancla = corte
            tipo = next((t for t in (_tipo_de(a) for a in [ancla, *ancla.iterancestors()]) if t), None)
            if tipo is not None and tipo == _tipo_documento(body):
                tipo = None  # el tipo de todo el documento no dice nada de cada trozo
            epub = next((v for v in (_epub_type_crudo(a) for a in [ancla, *ancla.iterancestors()]) if v), None)
            unidades.append(_Unidad(ruta_doc, raiz, nuevo, titulo or None, nivel, ids, tipo, epub))
    return unidades if len(unidades) >= 2 else []


def _marcas_estructura(
    z: zipfile.ZipFile, ruta_nav: str | None, opf: Elemento, ruta_opf: str
) -> tuple[dict[str, tuple[str, str]], str | None]:
    """Landmarks del nav (EPUB3) y <guide> (EPUB2): documento → (tipo, origen) y el documento donde empieza el
    cuerpo (bodymatter / text / start)."""
    marcas: dict[str, tuple[str, str]] = {}
    inicio: str | None = None
    if ruta_nav:
        datos = _leer(z, ruta_nav)
        try:
            raiz = parsear_xhtml(datos) if datos else None
        except Exception:
            raiz = None
        for nav in [] if raiz is None else [e for e in raiz.iter() if nombre_local(e) == "nav"]:
            tipo_nav = (nav.get(_EPUB_TYPE) or nav.get("epub:type") or "").split()
            if "landmarks" not in tipo_nav:
                continue
            for a in (e for e in nav.iter() if nombre_local(e) == "a"):
                valores = (a.get(_EPUB_TYPE) or a.get("epub:type") or "").split()
                href = a.get("href")
                if not href or not valores:
                    continue
                ruta = _resolver(ruta_nav, urldefrag(href)[0])
                if any(v.lower() in INICIO_CUERPO for v in valores):
                    inicio = inicio or ruta
                tipo = tipo_de_epub(" ".join(valores))
                if tipo and ruta not in marcas:
                    marcas[ruta] = (tipo, "landmarks")
    guia = opf.find(".//opf:guide", NS)
    if guia is not None:
        for ref in guia.iterfind("opf:reference", NS):
            tipo_ref = (ref.get("type") or "").strip().lower()
            href = ref.get("href")
            if not href:
                continue
            ruta = _resolver(ruta_opf, urldefrag(href)[0])
            if tipo_ref in INICIO_CUERPO:
                inicio = inicio or ruta
            elif tipo_ref in TIPO_GUIDE and ruta not in marcas:
                marcas[ruta] = (TIPO_GUIDE[tipo_ref], "guide")
    return marcas, inicio


def _anexar_cuerpo(cuerpo: Elemento, extra: Elemento) -> None:
    """Añade el contenido de `extra` al final de `cuerpo` sin repetir ids (el XHTML de salida exige ids únicos)."""
    vistos = {e.get("id") for e in cuerpo.iter() if e.get("id")}
    for e in extra.iter():
        ident = e.get("id")
        if ident and ident in vistos:
            del e.attrib["id"]
        elif ident:
            vistos.add(ident)
    if extra.text and extra.text.strip():
        etree.SubElement(cuerpo, "p").text = extra.text
    for hijo in list(extra):
        cuerpo.append(hijo)


def _solo_portada(imgs: list[Elemento], ruta_doc: str, ruta_portada: str | None) -> bool:
    if not ruta_portada:
        return "cover" in ruta_doc.lower() or "portada" in ruta_doc.lower()
    for img in imgs:
        src = img.get("src") or img.get("{http://www.w3.org/1999/xlink}href") or ""
        if _resolver(ruta_doc, src) != ruta_portada:
            return False
    return True


_OPF_ROLE = "{http://www.idpf.org/2007/opf}role"
_ROLES_AUTOR = {"aut", "author", "autor", "cre"}


def _refinamientos(meta: Elemento) -> dict[str, dict[str, str]]:
    """EPUB3: `<meta refines="#id" property="title-type|role">valor</meta>` → {id: {propiedad: valor}}."""
    salida: dict[str, dict[str, str]] = {}
    for m in meta.iterfind("opf:meta", NS):
        destino = (m.get("refines") or "").lstrip("#")
        prop = (m.get("property") or "").split(":")[-1]
        if destino and prop and m.text:
            salida.setdefault(destino, {})[prop] = m.text.strip().lower()
    return salida


def _metadatos(opf: Elemento, libro: Libro) -> None:
    md = libro.metadatos
    meta = opf.find(".//opf:metadata", NS)
    if meta is None:
        return
    refina = _refinamientos(meta)
    # (0.4.0, CF-12) título: el «main» (o el primero que no sea «subtitle»); el subtítulo aparte
    titulos = [(t, refina.get(t.get("id") or "", {}).get("title-type", "")) for t in meta.iterfind("dc:title", NS)]
    principal = next((t for t, tipo in titulos if tipo == "main"), None)
    if principal is None:
        principal = next((t for t, tipo in titulos if tipo != "subtitle"), titulos[0][0] if titulos else None)
    md["titulo"] = titulo_util(_texto(principal))
    subtitulo = next((t for t, tipo in titulos if tipo == "subtitle" and t is not principal), None)
    if subtitulo is not None and _texto(subtitulo):
        md["subtitulo"] = _texto(subtitulo)
    # (0.4.0, CF-12) solo autores de verdad: sin traductor/editor/ilustrador; «Pérez, Ana» → «Ana Pérez»; sin «Unknown»
    creadores: list[tuple[str, str]] = []
    for c in meta.iterfind("dc:creator", NS):
        nombre = _texto(c)
        rol = (c.get(_OPF_ROLE) or refina.get(c.get("id") or "", {}).get("role", "")).strip().lower()
        if nombre:
            creadores.append((nombre, rol))
    autores = [n for n, rol in creadores if not rol or rol in _ROLES_AUTOR]
    if not autores:
        autores = [n for n, rol in creadores if rol != "trl"]
    md["autores"] = [a for a in (autor_util(x) for x in autores) if a]
    # (0.4.0, CF-12) idioma ISO 639-1 («spa», «Castellano» → «es»); todos los declarados, para cotejar con el texto
    idiomas = [i for i in (normalizar_idioma(_texto(x)) for x in meta.iterfind("dc:language", NS)) if i]
    md["idioma"] = idiomas[0] if idiomas else None  # sin dc:language lo detecta convertir (QA NU-02)
    if len(idiomas) > 1:
        md["idiomasDeclarados"] = idiomas
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
    # (v1.4) dc:subject (EPUB 2 y 3), uno o varios y a veces «Novela; Fantástico; Juvenil» en uno solo
    md["materias"] = limpiar_materias(_texto(s) for s in meta.iterfind("dc:subject", NS))


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


def _toc_nav(z: zipfile.ZipFile, ruta_nav: str, compat: bool = False) -> list[_EntradaToc]:
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
        if compat:
            toc_nav = navs[0]
        else:
            # (0.4.0, CF-09) sin epub:type="toc": la <nav> con más enlaces que no sea de landmarks ni de páginas
            candidatas = [
                n
                for n in navs
                if not {"landmarks", "page-list"} & set((n.get(_EPUB_TYPE) or n.get("epub:type") or "").split())
            ] or navs
            toc_nav = max(candidatas, key=lambda n: sum(1 for e in n.iter() if nombre_local(e) == "a"))
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
    raiz = _xml(datos)
    if raiz is None:  # el índice es opcional: un NCX roto no tumba el libro (DA-04)
        log.warning("Índice NCX ilegible (%s); se usan los títulos del texto", ruta_ncx)
        return []
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


def _toc_final(toc_crudo: list[_EntradaToc], destino: Callable[[str, str | None], int | None]) -> list[NodoToc]:
    salida: list[NodoToc] = []
    for titulo, ruta, frag, hijos in toc_crudo:
        hijos_final = _toc_final(hijos, destino)
        k = destino(ruta, frag) if ruta is not None else None
        if k is not None and titulo:
            salida.append(NodoToc(titulo[:300], k, frag, hijos_final))
        else:
            salida.extend(hijos_final)  # entrada a un documento descartado: se promueven sus hijos
    return salida

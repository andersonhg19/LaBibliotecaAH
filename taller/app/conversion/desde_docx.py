"""DOCX → Libro (pandoc → HTML; respaldo mammoth si pandoc no está). DOC → LibreOffice headless → DOCX.

Capítulos por Título 1 (h1); si no hay, por Título 2; si tampoco, un solo capítulo.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import lxml.html
from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import AlmacenImagenes, Capitulo, ErrorDefinitivo, ErrorReintentable, Libro, NodoToc
from . import limites
from .html_util import Elemento, limpiar_cuerpo, texto_de
from .limites import revisar_tamano, revisar_zip_en_disco
from .metadatos import normalizar_autores, titulo_desde_nombre, titulo_util

log = logging.getLogger(__name__)

TIEMPO_MAXIMO = 300
_ID_NOTA = re.compile(r"^(?:fn|footnote-|endnote-)(\d+)$")
_ID_LLAMADA = re.compile(r"^(?:fnref|footnote-ref-|endnote-ref-)(\d+)$")
_ESTILOS_TITULO = {"title", "título", "titulo"}


def _html_con_pandoc(ruta: Path, medios: Path) -> str:
    r = subprocess.run(
        ["pandoc", "-f", "docx", "-t", "html5", "--wrap=none", f"--extract-media={medios}", str(ruta)],
        capture_output=True,
        timeout=TIEMPO_MAXIMO,
        preexec_fn=limites.liberar_limite_memoria,  # pandoc reserva mucho espacio virtual (GHC)
    )
    if r.returncode != 0:
        log.error("pandoc falló: %s", r.stderr.decode("utf-8", "replace")[:500])
        raise ErrorDefinitivo(Msj.WORD_DANADO)
    return r.stdout.decode("utf-8", "replace")


def _html_con_mammoth(ruta: Path) -> str:
    import mammoth

    with open(ruta, "rb") as f:
        return mammoth.convert_to_html(f).value


def _metadatos_docx(ruta: Path, libro: Libro, nombre: str | None) -> None:
    """Título, autores e idioma de las propiedades del documento.

    Si el título es el genérico del programa ("Word Document", "Microsoft Word - x.doc"…, QA BI-17) o falta, se
    usa el párrafo con estilo Título del documento y, si no lo hay, el nombre del archivo.
    """
    titulo: str | None = None
    try:
        import docx

        documento = docx.Document(str(ruta))
        props = documento.core_properties
        titulo = titulo_util(props.title)
        if titulo is None:
            for parrafo in documento.paragraphs[:50]:
                estilo = (parrafo.style.name if parrafo.style is not None else "") or ""
                if estilo.strip().lower() in _ESTILOS_TITULO:
                    titulo = titulo_util(parrafo.text)
                    if titulo:
                        break
        autores = normalizar_autores(props.author)
        if autores:
            libro.metadatos["autores"] = autores
        if props.language:
            libro.metadatos["idioma"] = props.language[:10]
    except Exception as e:
        log.info("Sin metadatos DOCX: %s", e)
    libro.metadatos["titulo"] = titulo or (titulo_desde_nombre(nombre) if nombre else None)


def convertir_docx(ruta: Path, nombre: str | None = None) -> Libro:
    """`nombre`: nombre del archivo original sin extensión (para el título si el documento no trae uno real)."""
    revisar_zip_en_disco(ruta)
    libro = Libro()
    _metadatos_docx(ruta, libro, nombre if nombre is not None else ruta.stem)
    with tempfile.TemporaryDirectory(prefix="bah-docx-") as tmp:
        medios = Path(tmp) / "medios"
        try:
            if shutil.which("pandoc"):
                html = _html_con_pandoc(ruta, medios)
            else:
                log.warning("pandoc no está instalado; se usa mammoth")
                html = _html_con_mammoth(ruta)
        except ErrorDefinitivo:
            raise
        except Exception as e:
            raise ErrorDefinitivo(Msj.WORD_DANADO) from e
        if not html.strip():
            raise ErrorDefinitivo(Msj.WORD_VACIO)
        raiz = lxml.html.document_fromstring(f"<html><body>{html}</body></html>")
        almacen = AlmacenImagenes(libro)

        def resolver_imagen(src: str) -> str | None:
            try:
                if src.startswith("data:"):
                    cabecera, datos = src.split(",", 1)
                    tipo = cabecera[5:].split(";")[0]
                    ext = mimetypes.guess_extension(tipo) or ".png"
                    return almacen.agregar(src[:64] + str(len(src)), base64.b64decode(datos), ext)
                p = Path(src)
                if not p.is_absolute():
                    p = Path(tmp) / src
                p = p.resolve()
                if not str(p).startswith(str(Path(tmp).resolve())) or not p.is_file():
                    return None
                return almacen.agregar(str(p), p.read_bytes(), p.suffix)
            except Exception:
                log.warning("Imagen del documento Word omitida: %s", src[:80], exc_info=True)
                return None

        body = raiz.find("body")
        cuerpo = limpiar_cuerpo(body if body is not None else raiz, resolver_imagen, None)
    notas = _separar_notas(cuerpo)
    _partir_por_titulos(cuerpo, libro)
    if not libro.capitulos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    _repartir_notas(libro, notas)
    return libro


def _separar_notas(cuerpo: Elemento) -> dict[str, Elemento]:
    """Quita del cuerpo la lista final de notas al pie (pandoc: <section class="footnotes">; mammoth: <ol> de
    <li id="footnote-N">) y devuelve número → <li> de la nota."""
    notas: dict[str, Elemento] = {}
    for bloque in list(cuerpo):
        if not isinstance(bloque.tag, str):
            continue
        items = [li for li in bloque.iter("li") if _ID_NOTA.match(li.get("id") or "")]
        es_seccion = "bah-nota-pie" in (bloque.get("class") or "").split()
        es_lista_mammoth = bloque.tag == "ol" and items and len(items) == len(bloque.findall("li"))
        if not (es_seccion or es_lista_mammoth):
            continue
        for li in items:
            m = _ID_NOTA.match(li.get("id") or "")
            if m:
                notas[m.group(1)] = li
        cola = bloque.tail
        previo = bloque.getprevious()
        cuerpo.remove(bloque)
        if cola and cola.strip():
            if previo is not None:
                previo.tail = (previo.tail or "") + cola
            else:
                cuerpo.text = (cuerpo.text or "") + cola
    return notas


def _repartir_notas(libro: Libro, notas: dict[str, Elemento]) -> None:
    """Cada nota va al final del capítulo donde está su llamada, marcada para que no se lea en voz (QA DA-09)."""
    if not notas:
        return
    pendientes = dict(notas)
    for cap in libro.capitulos:
        propias: list[Elemento] = []
        for el in cap.cuerpo.iter():
            m = _ID_LLAMADA.match(el.get("id") or "")
            if m and m.group(1) in pendientes:
                propias.append(pendientes.pop(m.group(1)))
        if propias:
            _anexar_notas(cap.cuerpo, propias)
    if pendientes:  # notas sin llamada localizable: al final del libro, igual sin leerse
        _anexar_notas(libro.capitulos[-1].cuerpo, list(pendientes.values()))


def _anexar_notas(cuerpo: Elemento, items: list[Elemento]) -> None:
    aside = etree.SubElement(cuerpo, "aside", {"class": "bah-nota-pie"})
    ol = etree.SubElement(aside, "ol")
    for li in items:
        li.tail = None
        ol.append(li)


def _partir_por_titulos(cuerpo: Elemento, libro: Libro) -> None:
    hijos = list(cuerpo)
    nivel_corte = None
    for tag in ("h1", "h2"):
        if any(h.tag == tag for h in hijos):
            nivel_corte = tag
            break
    secciones: list[tuple[str | None, list[Elemento]]] = []
    if nivel_corte is None:
        secciones.append((None, hijos))
    else:
        actual: tuple[str | None, list[Elemento]] = (None, [])
        for h in hijos:
            if h.tag == nivel_corte:
                if actual[1]:
                    secciones.append(actual)
                actual = (texto_de(h), [h])
            else:
                actual[1].append(h)
        if actual[1]:
            secciones.append(actual)
    sub = "h2" if nivel_corte == "h1" else "h3"
    for titulo, elementos in secciones:
        body = etree.Element("body")
        for e in elementos:
            body.append(e)
        if not texto_de(body):
            continue
        indice = len(libro.capitulos)
        if titulo is None:
            titulo = "Inicio" if nivel_corte else (libro.metadatos.get("titulo") or "Documento")
        libro.capitulos.append(Capitulo(titulo=titulo[:300] or f"Sección {indice + 1}", cuerpo=body))
        hijos_toc = []
        for e in elementos:
            if e.tag == sub and texto_de(e):
                hijos_toc.append(NodoToc(texto_de(e)[:300], indice, e.get("id")))
        libro.toc.append(NodoToc(libro.capitulos[-1].titulo, indice, None, hijos_toc))


def convertir_doc(ruta: Path) -> Libro:
    """Word 97-2003 (.doc): LibreOffice headless lo pasa a DOCX y se sigue el camino DOCX."""
    revisar_tamano(ruta, limites.MAX_DOC, "documento .doc")
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise ErrorDefinitivo(Msj.DOC_SIN_LIBREOFFICE)
    with tempfile.TemporaryDirectory(prefix="bah-doc-") as tmp:
        perfil = Path(tmp) / f"perfil-{uuid.uuid4().hex}"
        entrada = Path(tmp) / "entrada.doc"
        shutil.copyfile(ruta, entrada)
        try:
            r = subprocess.run(
                [
                    soffice,
                    f"-env:UserInstallation={perfil.as_uri()}",
                    "--headless",
                    "--norestore",
                    "--convert-to",
                    "docx",
                    "--outdir",
                    tmp,
                    str(entrada),
                ],
                capture_output=True,
                timeout=TIEMPO_MAXIMO,
                preexec_fn=limites.liberar_limite_memoria,
            )
        except subprocess.TimeoutExpired as e:
            raise ErrorReintentable(Msj.DOC_NO_CONVERTIBLE) from e
        salida = Path(tmp) / "entrada.docx"
        if r.returncode != 0 or not salida.exists():
            log.error("LibreOffice falló: %s", (r.stderr or r.stdout).decode("utf-8", "replace")[:500])
            raise ErrorDefinitivo(Msj.DOC_NO_CONVERTIBLE)
        return convertir_docx(salida, nombre=ruta.stem)

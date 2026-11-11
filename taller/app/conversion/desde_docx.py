"""DOCX → Libro (pandoc → HTML; respaldo mammoth si pandoc no está). DOC → LibreOffice headless → DOCX.

Capítulos por Título 1 (h1); si no hay, por Título 2; si tampoco, un solo capítulo.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import lxml.html
from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import AlmacenImagenes, Capitulo, ErrorDefinitivo, ErrorReintentable, Libro, NodoToc
from .html_util import Elemento, limpiar_cuerpo, texto_de

log = logging.getLogger(__name__)

TIEMPO_MAXIMO = 300


def _html_con_pandoc(ruta: Path, medios: Path) -> str:
    r = subprocess.run(
        ["pandoc", "-f", "docx", "-t", "html5", "--wrap=none", f"--extract-media={medios}", str(ruta)],
        capture_output=True,
        timeout=TIEMPO_MAXIMO,
    )
    if r.returncode != 0:
        log.error("pandoc falló: %s", r.stderr.decode("utf-8", "replace")[:500])
        raise ErrorDefinitivo(Msj.WORD_DANADO)
    return r.stdout.decode("utf-8", "replace")


def _html_con_mammoth(ruta: Path) -> str:
    import mammoth

    with open(ruta, "rb") as f:
        return mammoth.convert_to_html(f).value


def _metadatos_docx(ruta: Path, libro: Libro) -> None:
    try:
        import docx

        props = docx.Document(str(ruta)).core_properties
        if props.title and props.title.strip():
            libro.metadatos["titulo"] = props.title.strip()[:300]
        if props.author and props.author.strip():
            libro.metadatos["autores"] = [props.author.strip()]
        if props.language:
            libro.metadatos["idioma"] = props.language[:10]
    except Exception as e:
        log.info("Sin metadatos DOCX: %s", e)


def convertir_docx(ruta: Path) -> Libro:
    libro = Libro()
    _metadatos_docx(ruta, libro)
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
    _partir_por_titulos(cuerpo, libro)
    if not libro.capitulos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    return libro


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
            )
        except subprocess.TimeoutExpired as e:
            raise ErrorReintentable(Msj.DOC_NO_CONVERTIBLE) from e
        salida = Path(tmp) / "entrada.docx"
        if r.returncode != 0 or not salida.exists():
            log.error("LibreOffice falló: %s", (r.stderr or r.stdout).decode("utf-8", "replace")[:500])
            raise ErrorDefinitivo(Msj.DOC_NO_CONVERTIBLE)
        return convertir_docx(salida)

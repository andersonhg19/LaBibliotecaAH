"""HTML y Markdown → Libro (la misma tubería que DOCX: lista blanca de html_util → capítulos por títulos → notas).

- **HTML**: lxml.html sin red ni entidades externas; `limpiar_cuerpo` descarta script, style, iframe, object, form,
  svg, meta, base…; solo quedan enlaces http/https/mailto. Imágenes: solo `data:` (las remotas se omiten).
- **Markdown**: pandoc `-f gfm` (tablas, listas de tareas, citas, código cercado) → HTML → lo mismo. El front matter
  YAML (`---` … `---`) se quita y su `title:` se usa como título. Sin pandoc, se convierte como texto plano.

Detalles de presentación (los pinta el CSS del EPUB, contratos v1.6):
- listas de tareas: la casilla se vuelve clase del `<li>` (`bah-tarea`, `bah-tarea-hecha`) y del `<ul>`
  (`bah-tareas`); el símbolo lo pone el CSS, así la voz no lo lee;
- bloques de código: `<pre class="bah-codigo">`, que no se segmentan en frases (se ven tal cual y no se leen);
- tablas: envueltas en `<div class="bah-tabla">` para desplazarse en horizontal en el móvil.
"""

from __future__ import annotations

import base64
import binascii
import logging
import mimetypes
import re
import shutil
import subprocess
from pathlib import Path

import lxml.html
from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import AlmacenImagenes, Capitulo, ErrorDefinitivo, Libro, NodoToc
from . import limites
from .desde_docx import _repartir_notas, _separar_notas
from .desde_txt import convertir_txt, decodificar
from .html_util import Elemento, limpiar_cuerpo, nombre_local, texto_de
from .limites import revisar_tamano
from .metadatos import normalizar_autores, titulo_desde_nombre, titulo_util

log = logging.getLogger(__name__)

TIEMPO_PANDOC = 120
CLASE_CODIGO = "bah-codigo"
_TITULOS = {"h1", "h2", "h3", "h4", "h5", "h6"}
_FRONT_MATTER = re.compile(r"\A(?:﻿)?---[ \t]*\n(.*?)\n(?:---|\.\.\.)[ \t]*(?:\n|\Z)", re.DOTALL)
_TITULO_YAML = re.compile(r"^title\s*:\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
_AUTOR_YAML = re.compile(r"^author\s*:\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
_CLASES_CODIGO = re.compile(r"(?:^|\s)(?:sourceCode|code|highlight|language-\S+|lang-\S+)(?:\s|$)", re.IGNORECASE)


# ------------------------------------------------------------------ entradas


def convertir_html(ruta: Path) -> Libro:
    revisar_tamano(ruta, limites.MAX_TXT, "archivo HTML")
    texto = decodificar(ruta.read_bytes())
    if not texto.strip():
        raise ErrorDefinitivo(Msj.TXT_VACIO)
    raiz = _parsear(texto)
    titulo = None
    t = raiz.find(".//title")
    if t is not None:
        titulo = titulo_util("".join(str(x) for x in t.itertext()))
    autor = raiz.find(".//meta[@name='author']")
    libro = Libro()
    if autor is not None:
        libro.metadatos["autores"] = normalizar_autores(autor.get("content"))
    idioma = raiz.get("lang")
    if idioma:
        libro.metadatos["idioma"] = idioma.strip()[:10] or None
    return _libro_desde_html(raiz, libro, titulo, ruta.stem, codigo_por_clase=True)


def convertir_markdown(ruta: Path) -> Libro:
    revisar_tamano(ruta, limites.MAX_TXT, "archivo Markdown")
    texto = decodificar(ruta.read_bytes()).replace("\r\n", "\n").replace("\r", "\n")
    if not texto.strip():
        raise ErrorDefinitivo(Msj.TXT_VACIO)
    libro = Libro()
    titulo = None
    m = _FRONT_MATTER.match(texto)
    if m:
        bloque = m.group(1)
        tm = _TITULO_YAML.search(bloque)
        if tm:
            titulo = titulo_util(tm.group(1).strip("'\""))
        am = _AUTOR_YAML.search(bloque)
        if am:
            libro.metadatos["autores"] = normalizar_autores(am.group(1).strip("'\""))
        texto = texto[m.end() :]
    if not shutil.which("pandoc"):
        log.warning("pandoc no está instalado: el Markdown se convierte como texto plano")
        return convertir_txt(ruta)
    html = _pandoc_markdown(texto)
    raiz = _parsear(f"<html><body>{html}</body></html>")
    return _libro_desde_html(raiz, libro, titulo, ruta.stem, codigo_por_clase=False)


def _pandoc_markdown(texto: str) -> str:
    r = subprocess.run(
        ["pandoc", "-f", "gfm+footnotes", "-t", "html5", "--wrap=none", "--no-highlight"],
        input=texto.encode("utf-8"),
        capture_output=True,
        timeout=TIEMPO_PANDOC,
        preexec_fn=limites.liberar_limite_memoria,  # pandoc reserva mucho espacio virtual (GHC)
    )
    if r.returncode != 0:
        log.error("pandoc falló con el Markdown: %s", r.stderr.decode("utf-8", "replace")[:500])
        raise ErrorDefinitivo(Msj.MARKDOWN_DANADO)
    return r.stdout.decode("utf-8", "replace")


def _parsear(texto: str) -> Elemento:
    parser = lxml.html.HTMLParser(no_network=True, remove_comments=True, remove_pis=True)
    try:
        raiz = lxml.html.document_fromstring(texto, parser=parser)
    except (etree.ParserError, ValueError) as e:
        raise ErrorDefinitivo(Msj.HTML_DANADO) from e
    return raiz


# ------------------------------------------------------------------ tubería común


def _libro_desde_html(raiz: Elemento, libro: Libro, titulo: str | None, nombre: str, codigo_por_clase: bool) -> Libro:
    body = raiz.find(".//body")
    origen = body if body is not None else raiz
    _marcar_tareas(origen)
    _marcar_codigo(origen, codigo_por_clase)
    almacen = AlmacenImagenes(libro)

    def resolver_imagen(src: str) -> str | None:
        if not src.startswith("data:"):
            return None  # nada remoto ni rutas locales
        try:
            cabecera, datos = src.split(",", 1)
            if ";base64" not in cabecera:
                return None
            tipo = cabecera[5:].split(";")[0]
            ext = mimetypes.guess_extension(tipo) or ""
            return almacen.agregar(src[:64] + str(len(src)), base64.b64decode(datos, validate=False), ext)
        except (ValueError, binascii.Error):
            log.warning("Imagen data: inválida omitida")
            return None

    cuerpo = limpiar_cuerpo(origen, resolver_imagen, None)
    _envolver_tablas(cuerpo)
    _marcar_citas_y_codigo_en_linea(cuerpo)
    if titulo is None:
        h1 = cuerpo.find(".//h1")
        titulo = titulo_util(texto_de(h1)) if h1 is not None else None
    libro.metadatos["titulo"] = titulo or titulo_desde_nombre(nombre)
    notas = _separar_notas(cuerpo)
    partir_por_titulos(cuerpo, libro)
    if not libro.capitulos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    _repartir_notas(libro, notas)
    return libro


def _marcar_tareas(raiz: Elemento) -> None:
    """`<li><input type="checkbox" checked>texto` → `<li class="bah-tarea bah-tarea-hecha">texto` (sin la casilla)."""
    for casilla in list(raiz.iter("input")):
        if (casilla.get("type") or "").lower() != "checkbox":
            continue
        li = next((a for a in casilla.iterancestors() if nombre_local(a) == "li"), None)
        if li is not None:
            clases = ["bah-tarea"] + (["bah-tarea-hecha"] if casilla.get("checked") is not None else [])
            li.set("class", " ".join([*(li.get("class") or "").split(), *clases]))
            lista = li.getparent()
            if lista is not None and nombre_local(lista) in ("ul", "ol"):
                lista.set("class", " ".join([*(lista.get("class") or "").split(), "bah-tareas"]))
        _quitar_conservando_cola(casilla)


def _marcar_codigo(raiz: Elemento, por_clase: bool) -> None:
    """Markdown: todo `<pre>` es código. HTML: solo los que llevan `<code>` o una clase de código (un `<pre>` de
    poesía sigue leyéndose)."""
    for pre in raiz.iter("pre"):
        es_codigo = (
            not por_clase or pre.find(".//code") is not None or bool(_CLASES_CODIGO.search(pre.get("class") or ""))
        )
        if es_codigo:
            pre.set("class", CLASE_CODIGO)
        elif pre.get("class"):
            del pre.attrib["class"]


def _envolver_tablas(cuerpo: Elemento) -> None:
    for tabla in list(cuerpo.iter("table")):
        padre = tabla.getparent()
        if padre is None or (padre.tag == "div" and "bah-tabla" in (padre.get("class") or "")):
            continue
        envoltorio = etree.Element("div", {"class": "bah-tabla"})
        envoltorio.tail = tabla.tail
        tabla.tail = None
        padre.replace(tabla, envoltorio)
        envoltorio.append(tabla)


def _marcar_citas_y_codigo_en_linea(cuerpo: Elemento) -> None:
    for cita in cuerpo.iter("blockquote"):
        cita.set("class", " ".join([*(cita.get("class") or "").split(), "bah-cita"]))
    for code in cuerpo.iter("code"):
        if not any(a.tag == "pre" for a in code.iterancestors()):
            code.set("class", "bah-codigo-linea")


def _quitar_conservando_cola(el: Elemento) -> None:
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


def partir_por_titulos(cuerpo: Elemento, libro: Libro) -> None:
    """Capítulos por el primer nivel de título que se repite (h1, h2 o h3): un README con un solo h1 arriba y varias
    secciones h2 se parte por secciones; el texto previo al primer corte (con su h1) va en el primero."""
    hijos = list(cuerpo)
    nivel_corte = next((t for t in ("h1", "h2", "h3") if sum(1 for h in hijos if h.tag == t) >= 2), None)
    if nivel_corte is None:
        nivel_corte = next((t for t in ("h1", "h2", "h3") if any(h.tag == t for h in hijos)), None)
    secciones: list[tuple[str | None, list[Elemento]]] = []
    actual: tuple[str | None, list[Elemento]] = (None, [])
    for h in hijos:
        if nivel_corte is not None and h.tag == nivel_corte:
            if any(e.tag not in _TITULOS and texto_de(e) for e in actual[1]):
                secciones.append(actual)
                actual = (texto_de(h), [h])
            elif actual[1]:  # antes solo había títulos (el del documento): se quedan con esta sección
                actual[1].append(h)
            else:
                actual = (texto_de(h), [h])
        else:
            actual[1].append(h)
    if actual[1]:
        secciones.append(actual)
    sub = {"h1": "h2", "h2": "h3", "h3": "h4"}.get(nivel_corte or "", "h2")
    for titulo, elementos in secciones:
        body = etree.Element("body")
        for e in elementos:
            body.append(e)
        if not texto_de(body):
            continue
        indice = len(libro.capitulos)
        if not titulo:
            primero = next((e for e in elementos if e.tag in ("h1", "h2", "h3")), None)
            titulo = texto_de(primero) if primero is not None else None
        if not titulo:
            titulo = "Inicio" if len(secciones) > 1 else (libro.metadatos.get("titulo") or "Documento")
        libro.capitulos.append(Capitulo(titulo=titulo[:300], cuerpo=body))
        hijos_toc = [NodoToc(texto_de(e)[:300], indice, e.get("id")) for e in elementos if e.tag == sub and texto_de(e)]
        libro.toc.append(NodoToc(libro.capitulos[-1].titulo, indice, None, hijos_toc))

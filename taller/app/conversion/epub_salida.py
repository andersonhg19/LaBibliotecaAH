"""Escritura del EPUB3 normalizado (libro.epub).

Estructura:
    mimetype                      (primero, sin comprimir)
    META-INF/container.xml
    OEBPS/content.opf             (metadatos, manifiesto, spine)
    OEBPS/nav.xhtml               (índice EPUB3)
    OEBPS/toc.ncx                 (índice EPUB2, por compatibilidad)
    OEBPS/estilo.css
    OEBPS/cap-NNN.xhtml           (un archivo por capítulo; href igual al de estructura.json)
    OEBPS/imagenes/...            (imágenes copiadas + portada.jpg)
"""

from __future__ import annotations

import zipfile
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

from lxml import etree

from ..dominio.modelo import Libro, NodoToc
from .html_util import Elemento

CSS = """/* La Biblioteca AH: estilo mínimo; el lector aplica tema, tipografía y márgenes. */
body { margin: 0 5%; line-height: 1.5; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.6em; }
p { margin: 0 0 0.8em; text-align: justify; }
img { max-width: 100%; height: auto; }
blockquote { margin: 1em 2em; font-style: italic; }
pre { white-space: pre-wrap; }
span.bah-f { }
/* (v1.6) Documentos: tablas, tareas, código y texto técnico (solo afecta a estas clases) */
div.bah-tabla { overflow-x: auto; margin: 1em 0; max-width: 100%; }
div.bah-tabla table { border-collapse: collapse; font-size: 0.92em; }
div.bah-tabla th, div.bah-tabla td { border: 1px solid rgba(128, 128, 128, 0.5); padding: 0.3em 0.6em;
  vertical-align: top; text-align: left; }
div.bah-tabla th { font-weight: bold; background: rgba(128, 128, 128, 0.12); }
div.bah-tabla td p, div.bah-tabla th p { margin: 0; text-align: left; }
ul.bah-tareas { list-style: none; padding-left: 0.4em; }
li.bah-tarea::before { content: "\\2610\\00a0"; }
li.bah-tarea.bah-tarea-hecha::before { content: "\\2611\\00a0"; }
li.bah-tarea-hecha { opacity: 0.75; }
pre.bah-codigo { font-family: "DejaVu Sans Mono", Menlo, Consolas, monospace; font-size: 0.85em; line-height: 1.4;
  white-space: pre; overflow-x: auto; padding: 0.7em 0.9em; border-radius: 4px;
  background: rgba(128, 128, 128, 0.12); border-left: 3px solid rgba(128, 128, 128, 0.45); }
code.bah-codigo-linea { font-family: "DejaVu Sans Mono", Menlo, Consolas, monospace; font-size: 0.9em;
  background: rgba(128, 128, 128, 0.14); padding: 0 0.25em; border-radius: 3px; }
p.bah-linea { font-family: "DejaVu Sans Mono", Menlo, Consolas, monospace; font-size: 0.85em; line-height: 1.45;
  margin: 0; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; min-height: 1.2em; }
blockquote.bah-cita { font-style: normal; margin: 1em 0.4em; padding: 0.1em 0 0.1em 0.9em;
  border-left: 3px solid rgba(128, 128, 128, 0.5); }
aside.bah-notas-orador { margin-top: 1.5em; padding: 0.6em 0.9em; border-top: 1px solid rgba(128, 128, 128, 0.5);
  font-size: 0.92em; }
""" + "".join(f"p.bah-sangria-{n} {{ padding-left: {n * 2}ch; }}\n" for n in range(1, 21))


def href_capitulo(indice: int) -> str:
    return f"cap-{indice:03d}.xhtml"


def href_toc(nodo: NodoToc) -> str:
    h = href_capitulo(nodo.capitulo)
    return h + ("#" + nodo.fragmento if nodo.fragmento else "")


def _xhtml_capitulo(
    titulo: str, cuerpo: Elemento, idioma: str, tipo: str | None = None, epub_type: str | None = None
) -> str:
    partes = [escape(cuerpo.text or "")]
    for hijo in cuerpo:
        partes.append(etree.tostring(hijo, encoding="unicode", method="xml", with_tail=True))
    contenido = "".join(partes)
    lang = quoteattr(idioma)
    # (0.4.0, contratos C1) el tipo de la sección viaja en el EPUB: el epub:type original y el nuestro
    atributos = (f" epub:type={quoteattr(epub_type)}" if epub_type else "") + (
        f" data-bah-tipo={quoteattr(tipo)}" if tipo else ""
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f'xml:lang={lang} lang={lang}>\n<head>\n<meta charset="utf-8"/>\n<title>{escape(titulo)}</title>\n'
        '<link rel="stylesheet" type="text/css" href="estilo.css"/>\n</head>\n'
        f"<body{atributos}>\n{contenido}\n</body>\n</html>\n"
    )


def _nav_ol(nodos: list[NodoToc], sangria: str = "") -> str:
    lineas = [f"{sangria}<ol>"]
    for n in nodos:
        lineas.append(f"{sangria}  <li><a href={quoteattr(href_toc(n))}>{escape(n.titulo)}</a>")
        if n.hijos:
            lineas.append(_nav_ol(n.hijos, sangria + "    "))
        lineas.append(f"{sangria}  </li>")
    lineas.append(f"{sangria}</ol>")
    return "\n".join(lineas)


def _nav(libro: Libro, toc: list[NodoToc], idioma: str) -> str:
    lang = quoteattr(idioma)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
        f'xml:lang={lang} lang={lang}>\n<head>\n<meta charset="utf-8"/>\n<title>Índice</title>\n</head>\n<body>\n'
        '<nav epub:type="toc" id="toc">\n<h1>Índice</h1>\n'
        f"{_nav_ol(toc)}\n</nav>\n</body>\n</html>\n"
    )


def _ncx(toc: list[NodoToc], uid: str, titulo: str) -> str:
    contador = [0]

    def puntos(nodos: list[NodoToc], sangria: str) -> str:
        salida = []
        for n in nodos:
            contador[0] += 1
            k = contador[0]
            salida.append(
                f'{sangria}<navPoint id="np-{k}" playOrder="{k}"><navLabel><text>{escape(n.titulo)}</text>'
                f"</navLabel><content src={quoteattr(href_toc(n))}/>"
            )
            if n.hijos:
                salida.append(puntos(n.hijos, sangria + "  "))
            salida.append(f"{sangria}</navPoint>")
        return "\n".join(salida)

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        f'<head><meta name="dtb:uid" content={quoteattr(uid)}/></head>\n'
        f"<docTitle><text>{escape(titulo)}</text></docTitle>\n<navMap>\n{puntos(toc, '  ')}\n</navMap>\n</ncx>\n"
    )


def _opf(libro: Libro, uid: str, n_caps: int, tiene_portada: bool) -> str:
    md = libro.metadatos
    titulo = md.get("titulo") or "Sin título"
    idioma = md.get("idioma") or "es"
    modificado = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = [
        f'<dc:identifier id="bah-id">{escape(uid)}</dc:identifier>',
        f"<dc:title>{escape(titulo)}</dc:title>",
        f"<dc:language>{escape(idioma)}</dc:language>",
        f'<meta property="dcterms:modified">{modificado}</meta>',
    ]
    for autor in md.get("autores") or []:
        meta.append(f"<dc:creator>{escape(autor)}</dc:creator>")
    if md.get("editorial"):
        meta.append(f"<dc:publisher>{escape(md['editorial'])}</dc:publisher>")
    if md.get("anio"):
        meta.append(f"<dc:date>{int(md['anio']):04d}</dc:date>")
    if md.get("sinopsis"):
        meta.append(f"<dc:description>{escape(md['sinopsis'])}</dc:description>")
    if md.get("isbn"):
        meta.append(f'<dc:identifier id="isbn">urn:isbn:{escape(md["isbn"])}</dc:identifier>')
    if tiene_portada:
        meta.append('<meta name="cover" content="portada"/>')

    items = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="css" href="estilo.css" media-type="text/css"/>',
    ]
    for i in range(n_caps):
        items.append(f'<item id="cap-{i:03d}" href="{href_capitulo(i)}" media-type="application/xhtml+xml"/>')
    for k, (ruta, (_datos, tipo)) in enumerate(sorted(libro.recursos.items())):
        items.append(f'<item id="rec-{k:04d}" href={quoteattr(ruta)} media-type="{tipo}"/>')
    if tiene_portada:
        items.append(
            '<item id="portada" href="imagenes/portada.jpg" media-type="image/jpeg" properties="cover-image"/>'
        )
    spine = "\n    ".join(f'<itemref idref="cap-{i:03d}"/>' for i in range(n_caps))
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bah-id" xml:lang='
        f"{quoteattr(idioma)}>\n"
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    ' + "\n    ".join(meta) + "\n  </metadata>\n"
        "  <manifest>\n    " + "\n    ".join(items) + "\n  </manifest>\n"
        f'  <spine toc="ncx">\n    {spine}\n  </spine>\n</package>\n'
    )


CONTAINER = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
    '  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'
    "  </rootfiles>\n</container>\n"
)


def toc_efectivo(libro: Libro) -> list[NodoToc]:
    if libro.toc:
        return libro.toc
    return [NodoToc(c.titulo, i) for i, c in enumerate(libro.capitulos)]


def escribir_epub(
    libro: Libro, destino: Path, archivo_id: str, portada_jpg: bytes | None, tipos: list[str] | None = None
) -> None:
    uid = f"urn:uuid:{archivo_id}"
    idioma = libro.metadatos.get("idioma") or "es"
    toc = toc_efectivo(libro)
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)

        def poner(nombre: str, datos: str | bytes, comprimir: bool = True) -> None:
            z.writestr(nombre, datos, compress_type=zipfile.ZIP_DEFLATED if comprimir else zipfile.ZIP_STORED)

        poner("META-INF/container.xml", CONTAINER)
        poner("OEBPS/content.opf", _opf(libro, uid, len(libro.capitulos), portada_jpg is not None))
        poner("OEBPS/nav.xhtml", _nav(libro, toc, idioma))
        poner("OEBPS/toc.ncx", _ncx(toc, uid, libro.metadatos.get("titulo") or "Sin título"))
        poner("OEBPS/estilo.css", CSS)
        for i, cap in enumerate(libro.capitulos):
            tipo = tipos[i] if tipos and i < len(tipos) else None
            poner(f"OEBPS/{href_capitulo(i)}", _xhtml_capitulo(cap.titulo, cap.cuerpo, idioma, tipo, cap.epub_type))
        for ruta, (datos, _tipo) in sorted(libro.recursos.items()):
            poner(f"OEBPS/{ruta}", datos, comprimir=False)
        if portada_jpg is not None:
            poner("OEBPS/imagenes/portada.jpg", portada_jpg, comprimir=False)

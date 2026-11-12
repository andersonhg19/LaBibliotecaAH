"""Corpus de prueba generado por programa (nada con derechos de autor)."""

from __future__ import annotations

import io
import shutil
import subprocess
import zipfile
from pathlib import Path

from PIL import Image

FUENTES_CANDIDATAS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]


def fuente_con_ligaduras() -> str | None:
    for f in FUENTES_CANDIDATAS:
        if Path(f).exists():
            return f
    return None


def imagen_png(color=(139, 90, 43), tam=(300, 450)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", tam, color).save(b, "PNG")
    return b.getvalue()


# ------------------------------------------------------------------ EPUB

_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{titulo}</title><link rel="stylesheet" href="../css/estilo.css"/><style>p{{color:red}}</style></head>
<body>{cuerpo}</body></html>"""


def crear_epub(destino: Path) -> Path:
    portada = imagen_png()
    lamina = imagen_png((47, 74, 58), (200, 120))
    docs = {
        "OEBPS/texto/portada.xhtml": _XHTML.format(
            titulo="Portada", cuerpo='<div><img src="../img/portada.png" alt="Portada"/></div>'
        ),
        "OEBPS/texto/parte1.xhtml": _XHTML.format(
            titulo="Parte I", cuerpo='<h1 id="p1">Parte I</h1><p>La casa y sus libros.</p>'
        ),
        "OEBPS/texto/cap1.xhtml": _XHTML.format(
            titulo="Cap 1",
            cuerpo=(
                '<h2 id="c1">Capítulo I</h2>'
                "<p>Era de noche en la biblioteca. <em>La lluvia caía sobre el tejado. Nadie</em> salió de casa.</p>"
                '<p>El Sr. Gómez leyó la pág. 5 del libro<sup><a epub:type="noteref" href="#n1">1</a></sup>. '
                "Después cerró la ventana.</p>"
                '<p><img src="../img/lamina.png" alt="Lámina"/></p>'
                '<p>Vea el <a href="cap2.xhtml#s2">segundo capítulo</a>. ¿Vienes? —preguntó ella.</p>'
                "<script>alert(1)</script>"
                '<aside epub:type="footnote" id="n1"><p>Nota al pie de prueba.</p></aside>'
            ),
        ),
        "OEBPS/texto/cap2.xhtml": _XHTML.format(
            titulo="Cap 2",
            cuerpo=(
                "<h2>Capítulo II</h2><div>Texto suelto en un div. <strong>Con negrita.</strong>"
                "<p>Párrafo interno.</p></div>"
                '<h3 id="s2">Sección dos</h3><p>Fin del libro de prueba en EE. UU. y el siglo XIX.</p>'
            ),
        ),
        "OEBPS/texto/vacio.xhtml": _XHTML.format(titulo="Vacío", cuerpo="<div>   </div>"),
    }
    nav = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="texto/parte1.xhtml">Parte I</a>
    <ol>
      <li><a href="texto/cap1.xhtml">Capítulo 1: La lluvia</a></li>
      <li><a href="texto/cap2.xhtml">Capítulo 2: El final</a>
        <ol><li><a href="texto/cap2.xhtml#s2">Sección dos</a></li></ol>
      </li>
    </ol>
  </li>
</ol></nav></body></html>"""
    opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:isbn:9788420412146</dc:identifier>
    <dc:title>La biblioteca de prueba</dc:title>
    <dc:creator>Ana Autora</dc:creator>
    <dc:creator>Beto Coautor</dc:creator>
    <dc:language>es</dc:language>
    <dc:publisher>Editorial Roble</dc:publisher>
    <dc:date>2019-05-01</dc:date>
    <dc:description>&lt;p&gt;Una &lt;b&gt;sinopsis&lt;/b&gt; breve.&lt;/p&gt;</dc:description>
    <dc:subject>Novela; Fantástico</dc:subject>
    <dc:subject>Juvenil</dc:subject>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="portada-img" href="img/portada.png" media-type="image/png" properties="cover-image"/>
    <item id="lamina" href="img/lamina.png" media-type="image/png"/>
    <item id="portada" href="texto/portada.xhtml" media-type="application/xhtml+xml"/>
    <item id="parte1" href="texto/parte1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cap1" href="texto/cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="vacio" href="texto/vacio.xhtml" media-type="application/xhtml+xml"/>
    <item id="cap2" href="texto/cap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="portada"/><itemref idref="nav"/><itemref idref="parte1"/><itemref idref="cap1"/>
    <itemref idref="vacio"/><itemref idref="cap2"/>
  </spine>
</package>"""
    container = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
        z.writestr("META-INF/container.xml", container)
        z.writestr("OEBPS/content.opf", opf)
        z.writestr("OEBPS/nav.xhtml", nav)
        z.writestr("OEBPS/img/portada.png", portada)
        z.writestr("OEBPS/img/lamina.png", lamina)
        for k, v in docs.items():
            z.writestr(k, v)
    return destino


# ------------------------------------------------------------------ PDF

PDF_CABECERA = "Revista de Pruebas Biblioteca"
PDF_PIE_TEXTO = "Documento de ensayo"


def crear_pdf_dos_columnas(destino: Path) -> Path:
    import pymupdf

    fuente = fuente_con_ligaduras()
    doc = pymupdf.open()
    ancho, alto = 595, 842
    izq_x, der_x = 50, 315
    lh = 15

    columnas = {
        1: (
            [
                "Primera columna de la página uno. Los libros an-",
                "tiguos se guardan con cuidado en la sala.",
                "",
                "Este párrafo es el segundo de la columna izquierda",
                "y termina aquí.",
            ],
            [
                "Columna derecha de la página uno. Aquí la ﬁla",
                "de estantes es ﬁrme y la oﬁcina está cerca.",
                "",
                "Otro párrafo a la derecha que también termina.",
            ],
        ),
        2: (
            [
                "Página dos, columna izquierda. La lectura con-",
                "tinúa sin interrupciones.",
            ],
            ["Página dos, columna derecha con texto distinto."],
        ),
        3: (
            ["Segunda parte del documento. Comienza en la pá-", "gina tres con un párrafo nuevo."],
            ["Columna derecha de la tercera página."],
        ),
        4: (["Cuarta página, última columna izquierda."], ["Cuarta página, última columna derecha. Fin."]),
    }
    for n in range(1, 5):
        page = doc.new_page(width=ancho, height=alto)
        kw = {"fontsize": 10}
        if fuente:
            page.insert_font(fontname="f0", fontfile=fuente)
            kw["fontname"] = "f0"
        # cabecera y pie repetidos + número de página
        page.insert_text((50, 30), PDF_CABECERA, **kw)
        page.insert_text((50, alto - 25), PDF_PIE_TEXTO, **kw)
        page.insert_text((ancho / 2, alto - 40), str(n), **kw)
        if n in (1, 3):
            page.insert_text((50, 90), "Primera parte" if n == 1 else "Segunda parte", **{**kw, "fontsize": 18})
        izq, der = columnas[n]
        for col_x, lineas in ((izq_x, izq), (der_x, der)):
            y = 130
            for linea in lineas:
                if linea:
                    page.insert_text((col_x, y), linea, **kw)
                y += lh if linea else lh * 1.5
    doc.set_toc([[1, "Primera parte", 1], [1, "Segunda parte", 3]])
    doc.set_metadata({"title": "Revista de prueba", "author": "Equipo Taller"})
    doc.save(str(destino))
    doc.close()
    return destino


def crear_pdf_escaneado(destino: Path) -> Path:
    import pymupdf

    doc = pymupdf.open()
    for _ in range(2):
        page = doc.new_page(width=595, height=842)
        page.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=imagen_png((240, 240, 230), (595, 842)))
    doc.save(str(destino))
    doc.close()
    return destino


def crear_pdf_sin_toc(destino: Path, paginas: int = 20) -> Path:
    import pymupdf

    doc = pymupdf.open()
    for n in range(paginas):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 100), f"Contenido de la hoja {n + 1}. Una frase completa aquí.", fontsize=11)
    doc.save(str(destino))
    doc.close()
    return destino


# ------------------------------------------------------------------ DOCX / DOC


def crear_docx(destino: Path) -> Path:
    import docx

    d = docx.Document()
    d.core_properties.title = "Manual de la casa"
    d.core_properties.author = "Samy"
    d.core_properties.keywords = "Ensayo, Hogar"
    d.add_paragraph("Texto antes del primer título.")
    d.add_heading("Introducción", level=1)
    p = d.add_paragraph("La biblioteca abre a las nueve. ")
    p.add_run("Esto va en cursiva.").italic = True
    p.add_run(" Y esto no.")
    d.add_heading("Detalles", level=2)
    d.add_paragraph("Un detalle importante del capítulo uno.")
    d.add_heading("Normas", level=1)
    d.add_paragraph("Se pide silencio. El Dr. Pérez lo recuerda.")
    d.add_paragraph("Primer punto de la lista", style="List Bullet")
    d.add_paragraph("Segundo punto de la lista", style="List Bullet")
    d.save(str(destino))
    return destino


def crear_doc(desde_docx: Path, destino_dir: Path) -> Path | None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    perfil = (destino_dir / "perfil-lo").resolve().as_uri()
    subprocess.run(
        [
            soffice,
            f"-env:UserInstallation={perfil}",
            "--headless",
            "--convert-to",
            "doc",
            "--outdir",
            str(destino_dir),
            str(desde_docx),
        ],
        check=True,
        capture_output=True,
        timeout=300,
    )
    salida = destino_dir / (desde_docx.stem + ".doc")
    return salida if salida.exists() else None


# ------------------------------------------------------------------ TXT

TXT_LATIN1 = """El libro de las pruebas

Prólogo breve antes de todo.

CAPÍTULO I

Érase una vez una biblioteca en España. Tenía más
de mil libros y una lámpara.

La señora Núñez leía cada noche.

CAPÍTULO II

El niño preguntó: ¿dónde está el atlas? Nadie lo sabía.

Fin de la historia con eñes y acentos: año, corazón.
"""


def crear_txt_latin1(destino: Path) -> Path:
    destino.write_bytes(TXT_LATIN1.encode("latin-1"))
    return destino

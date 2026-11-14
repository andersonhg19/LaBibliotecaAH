# ruff: noqa: E501, RUF005, B006
"""Corpus SINTÉTICO de estructura de libros (auditoría 4-conversión, 2026-11-13; casos C1–C10, C15, C16).

Adaptado de `gen.py` de la auditoría: todo el texto lo genera este módulo. `generar(destino)` escribe los archivos;
los pesados (350 capítulos, portada de 400 Mpx, DOCX con pandoc) solo con `completo=True`.
"""

import io
import random
import zipfile
from pathlib import Path

OUT = Path("/tmp/corpus-estructura")
rnd = random.Random(7)

PAL = [
    "el",
    "la",
    "de",
    "que",
    "y",
    "en",
    "los",
    "las",
    "un",
    "una",
    "se",
    "del",
    "por",
    "con",
    "para",
    "su",
    "al",
    "lo",
    "como",
    "pero",
    "sus",
    "ya",
    "fue",
    "este",
    "cuando",
    "muy",
    "sin",
    "sobre",
    "hasta",
    "donde",
    "desde",
    "todo",
    "durante",
    "nos",
    "mar",
    "faro",
    "casa",
    "noche",
    "barca",
    "viento",
    "luz",
    "puerto",
    "madre",
    "abuela",
    "camino",
    "piedra",
    "lluvia",
    "sombra",
    "ventana",
    "mesa",
    "libro",
    "carta",
    "tiempo",
    "silencio",
    "hombre",
    "mujer",
    "ciudad",
    "isla",
]


def frase(n=None):
    n = n or rnd.randint(7, 16)
    w = [rnd.choice(PAL) for _ in range(n)]
    return w[0].capitalize() + " " + " ".join(w[1:]) + "."


def parrafos(k, frases_por=4):
    return "".join(f"<p>{' '.join(frase() for _ in range(frases_por))}</p>\n" for _ in range(k))


def xhtml(body, titulo="x", tipo=None, lang="es"):
    bt = f' epub:type="{tipo}"' if tipo else ""
    return (
        f'<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" '
        f'xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}"><head><title>{titulo}</title></head>'
        f"<body{bt}>{body}</body></html>"
    )


def jpeg(w, h, color=(120, 40, 40)):
    from PIL import Image

    b = io.BytesIO()
    Image.new("RGB", (w, h), color).save(b, "JPEG", quality=70)
    return b.getvalue()


def nav_ol(entradas):
    s = "<ol>"
    for e in entradas:
        etq, href = e[0], e[1]
        hijos = e[2] if len(e) > 2 else []
        a = f'<a href="{href}">{etq}</a>' if href else f"<span>{etq}</span>"
        s += f"<li>{a}{nav_ol(hijos) if hijos else ''}</li>"
    return s + "</ol>"


def ncx(entradas, k=[0]):
    s = ""
    for e in entradas:
        k[0] += 1
        hijos = e[2] if len(e) > 2 else []
        s += (
            f'<navPoint id="n{k[0]}" playOrder="{k[0]}"><navLabel><text>{e[0]}</text></navLabel>'
            f'<content src="{e[1]}"/>{ncx(hijos)}</navPoint>'
        )
    return s


def epub(
    nombre,
    docs,
    toc=None,
    *,
    version="3.0",
    meta=None,
    titulo="Libro sintético",
    lang="es",
    nav=True,
    ncx_toc=None,
    landmarks=None,
    portada=None,
    portada_href="img/portada.jpg",
    extra=None,
    nav_raw=None,
    con_ncx=True,
    guide=None,
    imagenes=None,
):
    """docs: [(id, href, html, attrs_itemref)]; toc: [(etiqueta, href, hijos)]."""
    meta = (
        meta
        if meta is not None
        else (
            f"<dc:title>{titulo}</dc:title><dc:creator>Autora Sintética</dc:creator><dc:language>{lang}</dc:language>"
            '<dc:identifier id="uid">urn:uuid:00000000-aaaa-bbbb-cccc-000000000001</dc:identifier>'
        )
    )
    man, spine = [], []
    for d in docs:
        man.append(f'<item id="{d[0]}" href="{d[1]}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="{d[0]}" {d[3] if len(d) > 3 else ""}/>')
    files = {}
    if nav and version.startswith("3"):
        if nav_raw is None:
            lm = ""
            if landmarks:
                lm = (
                    '<nav epub:type="landmarks" hidden=""><ol>'
                    + "".join(f'<li><a epub:type="{t}" href="{h}">{e}</a></li>' for t, h, e in landmarks)
                    + "</ol></nav>"
                )
            nav_raw = xhtml(f'<nav epub:type="toc" id="toc"><h1>Índice</h1>{nav_ol(toc or [])}</nav>{lm}', "nav")
        files["OEBPS/nav.xhtml"] = nav_raw
        man.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    if con_ncx and (ncx_toc or toc):
        files["OEBPS/toc.ncx"] = (
            '<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" '
            f'version="2005-1"><head/><docTitle><text>t</text></docTitle><navMap>'
            f"{ncx(ncx_toc or toc, [0])}</navMap></ncx>"
        )
        man.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    if portada is not None:
        props = ' properties="cover-image"' if version.startswith("3") else ""
        man.append(f'<item id="cover-img" href="{portada_href}" media-type="image/jpeg"{props}/>')
        if portada is not False:
            files["OEBPS/" + portada_href] = portada
        if not version.startswith("3"):
            meta += '<meta name="cover" content="cover-img"/>'
    for href, datos in (imagenes or {}).items():
        files["OEBPS/" + href] = datos
        tipo = "image/svg+xml" if href.endswith(".svg") else "image/jpeg"
        man.append(f'<item id="im-{abs(hash(href))}" href="{href}" media-type="{tipo}"/>')
    for d in docs:
        files["OEBPS/" + d[1]] = d[2]
    for k, v in (extra or {}).items():
        files[k] = v
    g = f"<guide>{guide}</guide>" if guide else ""
    opf = (
        '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" '
        f'xmlns:opf="http://www.idpf.org/2007/opf" version="{version}" unique-identifier="uid">'
        f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">{meta}</metadata>'
        if meta != "SIN"
        else '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
    )
    opf += (
        f"<manifest>{''.join(man)}</manifest><spine{' toc="ncx"' if con_ncx and (ncx_toc or toc) else ''}>"
        f"{''.join(spine)}</spine>{g}</package>"
    )
    files["OEBPS/content.opf"] = opf
    with zipfile.ZipFile(OUT / nombre, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
        z.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" '
            'xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile '
            'full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
            compress_type=zipfile.ZIP_DEFLATED,
        )
        for k, v in files.items():
            z.writestr(k, v, compress_type=zipfile.ZIP_DEFLATED)


def cap(i, titulo, k=6, tipo="bodymatter chapter", h="h1"):
    return (
        f"c{i}",
        f"c{i}.xhtml",
        xhtml(f'<section epub:type="chapter"><{h}>{titulo}</{h}>{parrafos(k)}</section>', titulo, tipo),
    )


def generar(destino: Path, completo: bool = False) -> Path:
    """Escribe el corpus en `destino` y lo devuelve."""
    global OUT
    OUT = destino
    OUT.mkdir(parents=True, exist_ok=True)
    rnd.seed(7)
    TITULO = "La casa del faro"

    # ---------------------------------------------------------------- E01: EPUB3 completo con epub:type y landmarks
    front = [
        (
            "cubierta",
            "cubierta.xhtml",
            xhtml('<div><img src="img/portada.jpg" alt="Portada"/></div>', "Cubierta", "cover"),
        ),
        (
            "portadilla",
            "portadilla.xhtml",
            xhtml(
                f'<h1 class="titulo">{TITULO}</h1><p>Autora Sintética</p><p>Editorial Inventada</p>',
                "Portadilla",
                "frontmatter titlepage",
            ),
        ),
        (
            "creditos",
            "creditos.xhtml",
            xhtml(
                "<p>© 2024 Autora Sintética. Todos los derechos reservados.</p><p>ISBN 978-0-306-40615-7. Primera edición: marzo de 2024. Impreso en ninguna parte.</p>",
                "Créditos",
                "frontmatter copyright-page",
            ),
        ),
        (
            "dedicatoria",
            "dedicatoria.xhtml",
            xhtml("<p>A mi madre, que encendía el faro.</p>", "Dedicatoria", "frontmatter dedication"),
        ),
        (
            "epigrafe",
            "epigrafe.xhtml",
            xhtml(
                "<blockquote><p>El mar no tiene memoria, pero la orilla sí.</p><p>— Poeta Inventado</p></blockquote>",
                "Epígrafe",
                "frontmatter epigraph",
            ),
        ),
        (
            "indice",
            "indice.xhtml",
            xhtml(
                '<nav epub:type="toc"><h1>Índice</h1><ol>'
                + "".join(f'<li><a href="c{i}.xhtml">Capítulo {i}. Título {i}</a></li>' for i in range(1, 6))
                + "</ol></nav>",
                "Índice",
                "frontmatter toc",
            ),
        ),
        ("prologo", "prologo.xhtml", xhtml(f"<h1>Prólogo</h1>{parrafos(4)}", "Prólogo", "frontmatter preface")),
        (
            "intro",
            "intro.xhtml",
            xhtml(f"<h1>Introducción</h1>{parrafos(3)}", "Introducción", "frontmatter introduction"),
        ),
    ]
    caps = [cap(i, f"Capítulo {i}. Título {i}") for i in range(1, 6)]
    caps[1] = (
        "c2",
        "c2.xhtml",
        xhtml(
            f'<section epub:type="chapter"><h1>Capítulo 2. Título 2</h1>{parrafos(2)}<p>Como dijo el viejo<a epub:type="noteref" href="notas.xhtml#n1">1</a>, la luz vuelve.</p>{parrafos(2)}</section>',
            "c2",
            "bodymatter chapter",
        ),
    )
    back = [
        (
            "notas",
            "notas.xhtml",
            xhtml(
                '<section epub:type="endnotes"><h1>Notas</h1><ol><li id="n1"><p>Referencia inventada al viejo del faro, página 12.</p></li><li id="n2"><p>Otra nota de prueba que no se debería leer.</p></li></ol></section>',
                "Notas",
                "backmatter",
            ),
        ),
        (
            "apendice",
            "apendice.xhtml",
            xhtml(
                "<h1>Apéndice A. Tabla de mareas</h1><table><tr><th>Día</th><th>Pleamar</th></tr><tr><td>Lunes</td><td>06:12</td></tr><tr><td>Martes</td><td>06:58</td></tr></table>",
                "Apéndice",
                "backmatter appendix",
            ),
        ),
        (
            "agradecimientos",
            "agradecimientos.xhtml",
            xhtml(f"<h1>Agradecimientos</h1>{parrafos(2)}", "Agradecimientos", "backmatter acknowledgments"),
        ),
        ("sobre", "sobre.xhtml", xhtml(f"<h1>Sobre la autora</h1>{parrafos(1)}", "Sobre la autora", "backmatter")),
        (
            "otros",
            "otros.xhtml",
            xhtml(
                "<h1>Otros títulos de la autora</h1><ul><li>El puerto dormido</li><li>Lluvia en la isla</li></ul>",
                "Otros títulos",
                "backmatter",
            ),
        ),
        (
            "colofon",
            "colofon.xhtml",
            xhtml("<p>Este libro se terminó de componer un martes de lluvia.</p>", "Colofón", "backmatter colophon"),
        ),
    ]
    docs = front + caps + back
    toc = (
        [
            ("Portada", "cubierta.xhtml"),
            ("Portadilla", "portadilla.xhtml"),
            ("Créditos", "creditos.xhtml"),
            ("Dedicatoria", "dedicatoria.xhtml"),
            ("Epígrafe", "epigrafe.xhtml"),
            ("Índice", "indice.xhtml"),
            ("Prólogo", "prologo.xhtml"),
            ("Introducción", "intro.xhtml"),
        ]
        + [(f"Capítulo {i}. Título {i}", f"c{i}.xhtml") for i in range(1, 6)]
        + [
            ("Notas", "notas.xhtml"),
            ("Apéndice A. Tabla de mareas", "apendice.xhtml"),
            ("Agradecimientos", "agradecimientos.xhtml"),
            ("Sobre la autora", "sobre.xhtml"),
            ("Otros títulos de la autora", "otros.xhtml"),
            ("Colofón", "colofon.xhtml"),
        ]
    )
    lm = [
        ("cover", "cubierta.xhtml", "Portada"),
        ("toc", "indice.xhtml", "Índice"),
        ("bodymatter", "c1.xhtml", "Comienzo"),
    ]
    epub("E01-epub3-completo.epub", docs, toc, landmarks=lm, portada=jpeg(600, 900), titulo=TITULO)

    # ---------------------------------------------------------------- E02: EPUB2, NCX solo con capítulos; preliminares y notas sin título
    f2 = [
        ("tp", "tp.html", xhtml(f'<p class="titulo">{TITULO}</p><p class="autor">Autora Sintética</p>', "tp")),
        (
            "cr",
            "cr.html",
            xhtml("<p>Copyright © 2024. Reservados todos los derechos. ISBN 978-0-306-40615-7.</p>", "cr"),
        ),
        ("de", "de.html", xhtml("<p>Para Samuel, que me prestó el mar.</p>", "de")),
    ]
    c2 = [
        (f"ch{i}", f"ch{i}.html", xhtml(f'<p class="cap">CAPÍTULO {i}</p>{parrafos(5)}', f"ch{i}")) for i in range(1, 6)
    ]
    b2 = [
        (
            "nt",
            "nt.html",
            xhtml(
                '<p class="nt">1. Esta nota del final es de prueba y no debería leerse en voz.</p><p class="nt">2. Segunda nota del final con una cita inventada.</p>',
                "nt",
            ),
        ),
        (
            "ab",
            "ab.html",
            xhtml(
                "<p>La autora nació en un faro y vive en una isla inventada. Ha escrito otros libros sintéticos.</p>",
                "ab",
            ),
        ),
    ]
    epub(
        "E02-epub2-ncx-parcial.epub",
        f2 + c2 + b2,
        [(f"Capítulo {i}", f"ch{i}.html") for i in range(1, 6)],
        version="2.0",
        nav=False,
        portada=jpeg(500, 800),
        titulo=TITULO,
    )

    # ---------------------------------------------------------------- E03: títulos raros
    def libro_titulos(nombre, titulos, previos=(), lang="es"):
        ds, tc = [], []
        for j, t in enumerate(list(previos) + list(titulos)):
            ds.append((f"d{j}", f"d{j}.xhtml", xhtml(f"<h1>{t}</h1>{parrafos(3)}", t)))
            tc.append((t, f"d{j}.xhtml"))
        epub(nombre, ds, tc, titulo="Títulos raros " + nombre[:3], lang=lang)

    libro_titulos("E03a-solo-numeros.epub", [str(i) for i in range(1, 13)], previos=["Prólogo"])
    libro_titulos("E03b-romanos.epub", ["I", "II", "III", "IV", "V", "VI"], previos=["Nota del autor"])
    libro_titulos(
        "E03c-capitulo-primero.epub",
        ["Capítulo primero", "Capítulo segundo", "Capítulo tercero", "Capítulo cuarto"],
        previos=["Prólogo", "Introducción"],
    )
    libro_titulos("E03d-capitulo-01.epub", ["CAPÍTULO 01", "CAPÍTULO 02", "CAPÍTULO 03"], previos=["Prefacio"])
    libro_titulos("E03e-uno-dos.epub", ["Uno", "Dos", "Tres", "Cuatro"], previos=["Sinopsis", "Prólogo"])
    libro_titulos("E03f-cero.epub", ["Capítulo 0", "Capítulo 1", "Capítulo 2", "Capítulo 3"])
    libro_titulos(
        "E03g-numero-y-nombre-sin-ancla.epub",
        ["El regreso", "La tormenta", "El faro", "La carta", "La isla"],
        previos=["Prólogo", "Mapa"],
    )

    # ---------------------------------------------------------------- E04: Parte I + capítulos (la numeración reinicia en cada parte)
    d4, t4 = [], []
    for p, nombre_p in enumerate(["Primera parte. La orilla", "Segunda parte. El mar"], start=1):
        d4.append(
            (f"p{p}", f"p{p}.xhtml", xhtml(f"<h1>{nombre_p}</h1><blockquote><p>{frase()}</p></blockquote>", nombre_p))
        )
        hijos = []
        for i in range(1, 4):
            d4.append((f"p{p}c{i}", f"p{p}c{i}.xhtml", xhtml(f"<h2>Capítulo {i}</h2>{parrafos(4)}", f"c{i}")))
            hijos.append((f"Capítulo {i}", f"p{p}c{i}.xhtml"))
        t4.append((nombre_p, f"p{p}.xhtml", hijos))
    d4.insert(0, ("pr", "pr.xhtml", xhtml(f"<h1>Prólogo</h1>{parrafos(3)}", "Prólogo")))
    t4.insert(0, ("Prólogo", "pr.xhtml"))
    d4.append(("ep", "ep.xhtml", xhtml(f"<h1>Epílogo</h1>{parrafos(2)}", "Epílogo")))
    t4.append(("Epílogo", "ep.xhtml"))
    epub("E04-partes.epub", d4, t4, titulo="Libro con partes")

    # ---------------------------------------------------------------- E05: sin capítulos
    epub(
        "E05a-sin-capitulos.epub",
        [("u", "u.xhtml", xhtml(parrafos(120)))],
        None,
        nav=False,
        con_ncx=False,
        version="2.0",
        titulo="Sin capítulos",
    )
    epub(
        "E05b-un-bloque-enorme.epub",
        [("u", "u.xhtml", xhtml(f"<h1>{'Diario de a bordo'}</h1>" + parrafos(1500)))],
        [("Diario de a bordo", "u.xhtml")],
        titulo="Diario de a bordo",
    )

    # ---------------------------------------------------------------- E06: capítulo partido en varios xhtml (la continuación trae un h2 o un h3)
    d6 = [
        ("a1", "a1.xhtml", xhtml(f"<h1>Capítulo 1. La partida</h1>{parrafos(4)}")),
        (
            "a2",
            "a2.xhtml",
            xhtml(f"<h2>El puerto al amanecer</h2>{parrafos(4)}"),
        ),  # sub-apartado del capítulo 1 en otro archivo
        ("a3", "a3.xhtml", xhtml(parrafos(4))),  # continuación sin título
        ("b1", "b1.xhtml", xhtml(f"<h1>Capítulo 2. El regreso</h1>{parrafos(4)}")),
        ("b2", "b2.xhtml", xhtml(f'<p class="centrado">* * *</p>{parrafos(3)}')),
    ]
    epub(
        "E06-partido.epub",
        d6,
        [("Capítulo 1. La partida", "a1.xhtml"), ("Capítulo 2. El regreso", "b1.xhtml")],
        titulo="Capítulos partidos",
    )

    # ---------------------------------------------------------------- E07: un xhtml con varios capítulos (índice con anclas), al estilo Calibre
    cuerpo7 = "".join(f'<h1 id="cap{i}">Capítulo {i}</h1>{parrafos(5)}' for i in range(1, 6))
    d7 = [
        ("pre", "pre.xhtml", xhtml(f"<h1>Prólogo</h1>{parrafos(2)}")),
        ("todo", "index_split_000.html", xhtml(cuerpo7)),
    ]
    epub(
        "E07-varios-en-uno.epub",
        d7,
        [("Prólogo", "pre.xhtml")] + [(f"Capítulo {i}", f"index_split_000.html#cap{i}") for i in range(1, 6)],
        titulo="Todo en un archivo",
    )

    # ---------------------------------------------------------------- E08: inglés
    en = (
        ["Cover", "Title Page", "Copyright", "Contents", "Foreword", "Prologue"]
        + [f"Chapter {w}" for w in ["One", "Two", "Three", "Four"]]
        + ["Epilogue", "Acknowledgments", "About the Author", "Also by Synthetic Author"]
    )
    d8 = []
    for j, t in enumerate(en):
        cuerpo = (
            f"<h1>{t}</h1><p>The wind was cold and the light of the old lighthouse was on, and she said that it would rain before the night was over.</p>"
            * (1 if j < 4 else 4)
        )
        d8.append((f"e{j}", f"e{j}.xhtml", xhtml(cuerpo, t, lang="en")))
    epub("E08-ingles.epub", d8, [(t, f"e{j}.xhtml") for j, t in enumerate(en)], titulo="The Lighthouse", lang="en")

    # ---------------------------------------------------------------- E09: un "Capítulo 1" que NO es el primero (adelanto de otra novela al final de un libro corto)
    t9 = [
        "Portadilla",
        "El regreso",
        "La tormenta",
        "El faro",
        "La carta",
        "La isla",
        "El puerto",
        "La marea",
        "Agradecimientos",
        "Capítulo 1",
        "Sobre la autora",
    ]
    d9 = [(f"x{j}", f"x{j}.xhtml", xhtml(f"<h1>{t}</h1>{parrafos(3)}", t)) for j, t in enumerate(t9)]
    epub(
        "E09-capitulo1-adelanto.epub", d9, [(t, f"x{j}.xhtml") for j, t in enumerate(t9)], titulo="El regreso a la isla"
    )

    # ---------------------------------------------------------------- E10: 350 capítulos
    d10 = [(f"k{i}", f"k{i:03d}.xhtml", xhtml(f"<h1>Capítulo {i}</h1>{parrafos(1, 3)}")) for i in range(1, 351)]
    if completo:
        epub(
            "E10-350-capitulos.epub",
            d10,
            [(f"Capítulo {i}", f"k{i:03d}.xhtml") for i in range(1, 351)],
            titulo="Trescientos cincuenta",
        )

    # ---------------------------------------------------------------- E11: imágenes sin texto, tablas, notas al final, enlaces rotos
    svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#357"/></svg>'
    d11 = [
        (
            "i1",
            "i1.xhtml",
            xhtml(
                f'<h1>Capítulo 1. Mapas</h1>{parrafos(2)}<p>Ver <a href="i3.xhtml#nota9">la nota</a>, <a href="no-existe.xhtml#x">un enlace roto</a>, <a href="#ancla-inexistente">otro</a> y <a href="https://example.org">uno externo</a>.</p>'
            ),
        ),
        ("lam", "lam.xhtml", xhtml('<div><img src="img/mapa.jpg" alt=""/></div>')),  # lámina sin texto entre capítulos
        (
            "i2",
            "i2.xhtml",
            xhtml(
                "<h1>Capítulo 2. Tablas</h1><table><thead><tr><th>Puerto</th><th>Millas</th></tr></thead><tbody>"
                + "".join(f"<tr><td>Puerto {k}</td><td>{k * 12}</td></tr>" for k in range(1, 8))
                + f'</tbody></table>{parrafos(2)}<p><img src="img/falta.jpg" alt="una imagen que no está"/><img src="img/dibujo.svg" alt="dibujo"/></p>'
            ),
        ),
        (
            "sololam",
            "sololam.xhtml",
            xhtml('<h1>Lámina 3</h1><div><img src="img/mapa.jpg" alt="Mapa de la isla"/></div>'),
        ),
        (
            "i3",
            "i3.xhtml",
            xhtml(
                "<h1>Notas</h1>"
                + "".join(
                    f'<p id="nota{k}"><a href="i1.xhtml">{k}</a>. Nota final número {k}, con una fuente inventada.</p>'
                    for k in range(1, 11)
                )
            ),
        ),
    ]
    epub(
        "E11-imagenes-tablas-notas.epub",
        d11,
        [
            ("Capítulo 1. Mapas", "i1.xhtml"),
            ("Capítulo 2. Tablas", "i2.xhtml"),
            ("Lámina 3", "sololam.xhtml"),
            ("Notas", "i3.xhtml"),
        ],
        titulo="Mapas y tablas",
        imagenes={"img/mapa.jpg": jpeg(800, 600, (30, 90, 30)), "img/dibujo.svg": svg},
    )

    # ---------------------------------------------------------------- E12: OPF raro
    m12 = (
        '<dc:title id="t2">una historia de mareas</dc:title><dc:title id="t1">  La   casa\n del faro  </dc:title>'
        '<meta refines="#t1" property="title-type">main</meta><meta refines="#t2" property="title-type">subtitle</meta>'
        '<dc:creator id="a1">Pérez, Ana</dc:creator><meta refines="#a1" property="role" scheme="marc:relators">aut</meta>'
        '<dc:creator id="a2" opf:role="trl">Luis Traductor</dc:creator><dc:creator id="a3">Marta Editora</dc:creator>'
        '<meta refines="#a3" property="role" scheme="marc:relators">edt</meta>'
        '<dc:language>spa</dc:language><dc:date>MMXX</dc:date><dc:identifier id="uid">urn:uuid:12</dc:identifier>'
        "<dc:identifier>9780306406157</dc:identifier><dc:identifier>0-306-40615-2</dc:identifier>"
        "<dc:description>&lt;p&gt;Una &lt;b&gt;sinopsis&lt;/b&gt; con HTML.&lt;/p&gt;"
        + ("Muy larga. " * 800)
        + "</dc:description>"
        "<dc:subject>FIC000000</dc:subject><dc:subject>Ficción; Novela; ficción</dc:subject><dc:publisher>   </dc:publisher>"
        '<meta name="calibre:series" content="Saga del faro"/><meta name="calibre:series_index" content="2"/>'
    )
    epub(
        "E12a-opf-raro.epub",
        [cap(1, "Capítulo 1"), cap(2, "Capítulo 2")],
        [("Capítulo 1", "c1.xhtml"), ("Capítulo 2", "c2.xhtml")],
        meta=m12,
    )
    epub("E12b-sin-metadata.epub", [cap(1, "Capítulo 1")], [("Capítulo 1", "c1.xhtml")], meta="SIN")
    m12c = (
        "<dc:title>Unknown</dc:title><dc:creator>Unknown</dc:creator><dc:language>Castellano</dc:language>"
        '<dc:identifier id="uid">x</dc:identifier><dc:date>0101-01-01T00:00:00+00:00</dc:date>'
    )
    epub("E12c-calibre-unknown.epub", [cap(1, "Capítulo 1")], [("Capítulo 1", "c1.xhtml")], meta=m12c)
    m12d = (
        "<dc:title>Libro en español con idioma inglés</dc:title><dc:language>en</dc:language><dc:language>es</dc:language>"
        '<dc:identifier id="uid">y</dc:identifier><dc:date>2023-13-45</dc:date>'
    )
    epub("E12d-idioma-mal.epub", [cap(1, "Capítulo 1", 12)], [("Capítulo 1", "c1.xhtml")], meta=m12d)

    # ---------------------------------------------------------------- E13: portadas
    epub("E13a-sin-portada.epub", [cap(1, "Capítulo 1")], [("Capítulo 1", "c1.xhtml")], titulo="Sin portada")
    epub(
        "E13b-portada-gigante.epub",
        [cap(1, "Capítulo 1")],
        [("Capítulo 1", "c1.xhtml")],
        titulo="Portada gigante",
        portada=jpeg(9000, 13000),
    )
    epub(
        "E13c-portada-ausente.epub",
        [cap(1, "Capítulo 1")],
        [("Capítulo 1", "c1.xhtml")],
        titulo="Portada declarada que no está",
        portada=False,
    )
    if completo:
        from PIL import Image

        b = io.BytesIO()
        Image.new("1", (20000, 20000), 1).save(b, "PNG")
        epub(
            "E13d-portada-bomba.epub",
            [cap(1, "Capítulo 1")],
            [("Capítulo 1", "c1.xhtml")],
            titulo="Portada de 400 Mpx",
            portada=b.getvalue(),
            portada_href="img/p.png",
        )

    # ---------------------------------------------------------------- E14: spine con elementos no lineales
    d14 = [
        cap(1, "Capítulo 1"),
        (
            "nl",
            "nl.xhtml",
            xhtml(
                "<h1>Nota emergente</h1><p>Texto auxiliar de una ventana emergente que no forma parte de la lectura lineal.</p>"
            ),
            'linear="no"',
        ),
        cap(2, "Capítulo 2"),
        ("nl2", "nl2.xhtml", xhtml("<p>Respuesta del ejercicio 1: cuarenta y dos.</p>"), 'linear="no"'),
        cap(3, "Capítulo 3"),
    ]
    epub(
        "E14-no-lineal.epub",
        d14,
        [("Capítulo 1", "c1.xhtml"), ("Capítulo 2", "c2.xhtml"), ("Capítulo 3", "c3.xhtml")],
        titulo="No lineal",
    )

    # ---------------------------------------------------------------- E15: nav sin epub:type (la primera nav es landmarks) y sin títulos en el texto
    d15 = [(f"s{i}", f"s{i}.xhtml", xhtml(f'<p class="titulo-cap">Capítulo {i}</p>{parrafos(4)}')) for i in range(1, 6)]
    nav15 = xhtml(
        '<nav><ol><li><a href="s1.xhtml">Comienzo</a></li></ol></nav><nav><h1>Índice</h1><ol>'
        + "".join(f'<li><a href="s{i}.xhtml">Capítulo {i}</a></li>' for i in range(1, 6))
        + "</ol></nav>"
    )
    epub(
        "E15-nav-sin-tipo.epub",
        d15,
        [(f"Capítulo {i}", f"s{i}.xhtml") for i in range(1, 6)],
        nav_raw=nav15,
        titulo="Nav sin tipo",
    )
    # nav y NCX que no coinciden
    epub(
        "E15b-nav-vs-ncx.epub",
        [cap(i, f"Capítulo {i}") for i in range(1, 4)],
        [("Uno (nav)", "c1.xhtml"), ("Dos (nav)", "c2.xhtml"), ("Tres (nav)", "c3.xhtml")],
        ncx_toc=[("Uno (ncx)", "c1.xhtml"), ("Dos (ncx)", "c2.xhtml"), ("Tres (ncx)", "c3.xhtml")],
        titulo="Nav contra NCX",
    )

    # ---------------------------------------------------------------- E16: nombre unicode y duplicado
    epub(
        "Él año del ñandú — copia (1).epub",
        [cap(1, "Capítulo 1"), cap(2, "Capítulo 2")],
        [("Capítulo 1", "c1.xhtml"), ("Capítulo 2", "c2.xhtml")],
        titulo="Ñandú",
    )
    (OUT / "Él año del ñandú — copia (2).epub").write_bytes((OUT / "Él año del ñandú — copia (1).epub").read_bytes())
    epub(
        "E16b-sin-titulo-opf.epub",
        [cap(1, "Capítulo 1")],
        [("Capítulo 1", "c1.xhtml")],
        meta='<dc:language>es</dc:language><dc:identifier id="uid">z</dc:identifier>',
    )

    # ---------------------------------------------------------------- TXT latin-1
    txt = ["La casa del faro", "", "Autora Sintética", "", "", "Prólogo", ""] + [frase() for _ in range(5)] + [""]
    for w in ["PRIMERO", "SEGUNDO", "TERCERO"]:
        txt += ["", f"CAPÍTULO {w}", ""] + [" ".join(frase() for _ in range(5)), ""] * 3
    txt += [
        "",
        "Agradecimientos",
        "",
        frase() + " Gracias a la señora Núñez por el café.",
        "",
        "NOTAS",
        "",
        "1. Nota de prueba en latín-1: «año», ñandú, pingüino.",
        "",
    ]
    (OUT / "T01-latin1.txt").write_bytes("\r\n".join(txt).encode("latin-1"))

    # ---------------------------------------------------------------- DOCX (pandoc desde markdown)
    md = (
        f"---\ntitle: Informe del faro\nauthor: Autora Sintética\nlang: es\n---\n\n# Dedicatoria\n\nA quien lea.\n\n# Prólogo\n\n{frase()} {frase()}\n\n"
        + "".join(
            f"# Capítulo {i}\n\n{frase()} {frase()}[^{i}]\n\n## Sección {i}.1\n\n{frase()} {frase()}\n\n"
            for i in range(1, 4)
        )
        + "# Agradecimientos\n\nGracias.\n\n"
        + "".join(f"[^{i}]: Nota al pie {i} que no debería leerse.\n" for i in range(1, 4))
    )
    if completo:
        import subprocess

        (OUT / "_docx.md").write_text(md, encoding="utf-8")
        subprocess.run(["pandoc", str(OUT / "_docx.md"), "-o", str(OUT / "D01-estilos-titulo.docx")], check=False)
        (OUT / "_docx.md").unlink()

    # ---------------------------------------------------------------- PDF: escaneado sin texto, 2 columnas con marcadores
    import pymupdf as fitz

    doc = fitz.open()
    for _ in range(3):
        p = doc.new_page()
        p.insert_image(p.rect, stream=jpeg(600, 800, (230, 230, 220)))
    doc.save(OUT / "P01-escaneado.pdf")
    doc = fitz.open()
    toc = []
    for i in range(1, 4):
        for k in range(2):
            p = doc.new_page()
            if k == 0:
                p.insert_text((72, 80), f"Capítulo {i}", fontsize=20)
                toc.append([1, f"Capítulo {i}", doc.page_count])
            txt_col = "\n".join(frase(8) for _ in range(30))
            p.insert_textbox(fitz.Rect(50, 110, 290, 800), txt_col, fontsize=9)
            p.insert_textbox(fitz.Rect(310, 110, 550, 800), "\n".join(frase(8) for _ in range(30)), fontsize=9)
    doc.set_toc([[1, "Portada", 1], [1, "Índice", 1]] + toc)
    doc.set_metadata({"title": "Dos columnas", "author": "Autora Sintética"})
    doc.save(OUT / "P02-dos-columnas-marcadores.pdf")
    doc = fitz.open()
    for i in range(1, 6):
        for k in range(3):
            p = doc.new_page()
            if k == 0:
                p.insert_text((72, 100), f"Capítulo {i}", fontsize=24)
            p.insert_textbox(fitz.Rect(72, 130, 520, 780), " ".join(frase() for _ in range(25)), fontsize=11)
    doc.save(OUT / "P03-sin-marcadores.pdf")

    return OUT

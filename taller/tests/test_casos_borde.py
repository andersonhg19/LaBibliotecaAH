"""Casos de borde: EPUB2 con NCX, EPUB incompletos, portadas raras, Word sin pandoc, arranque, voz por la cola."""

import io
import zipfile

import pytest
from PIL import Image

from app import __main__ as principal
from app.cola.trabajador import ManejadorVoz, procesar
from app.config.rutas import Rutas
from app.conversion import desde_docx
from app.conversion.convertir import convertir
from app.conversion.portada import ALTO_MAXIMO, a_jpeg
from app.dominio.modelo import ErrorDefinitivo
from tests.test_trabajador import RepoFalso, trabajo
from tests.validar import validar_salida

CONTAINER = (
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    '<rootfiles><rootfile full-path="{opf}" media-type="application/oebps-package+xml"/></rootfiles>'
    "</container>"
)

OPF2 = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="u">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
  <dc:title>Viejo EPUB</dc:title><dc:identifier id="u">0-306-40615-2</dc:identifier>
  <meta name="cover" content="tapa"/>
 </metadata>
 <manifest>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="tapa" href="tapa.jpg" media-type="image/jpeg"/>
  <item id="a" href="a.html" media-type="application/xhtml+xml"/>
  <item id="b" href="b.html" media-type="application/xhtml+xml"/>
 </manifest>
 <spine toc="ncx"><itemref idref="a"/><itemref idref="b"/><itemref idref="falta"/></spine>
</package>"""

NCX = """<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
<navPoint id="1"><navLabel><text>Uno</text></navLabel><content src="a.html"/>
 <navPoint id="2"><navLabel><text>Uno bis</text></navLabel><content src="a.html#x"/></navPoint></navPoint>
<navPoint id="3"><navLabel><text>Dos</text></navLabel><content src="b.html"/></navPoint>
</navMap></ncx>"""

A_ROTO = "<html><body><h1 id='x'>Uno</h1><p>Texto&nbsp;con entidad HTML. <br>Sin cerrar."
A_BIEN = '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="x">Uno</h1><p>Hola.</p></body></html>'
B = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Dos frases. Aquí.</p><svg><text>no</text></svg></body></html>'


def epub2(destino, con_ncx=True, html_roto=False):
    tapa = io.BytesIO()
    Image.new("RGB", (100, 150), (10, 20, 30)).save(tapa, "JPEG")
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", CONTAINER.format(opf="OPS/libro.opf"))
        z.writestr("OPS/libro.opf", OPF2)
        if con_ncx:
            z.writestr("OPS/toc.ncx", NCX)
        z.writestr("OPS/tapa.jpg", tapa.getvalue())
        z.writestr("OPS/a.html", A_ROTO if html_roto else A_BIEN)
        z.writestr("OPS/b.html", B)
    return destino


def test_epub2_con_ncx_portada_por_meta_e_isbn10(tmp_path):
    d = tmp_path / "n"
    convertir(epub2(tmp_path / "v.epub", html_roto=True), d, "x")
    est = validar_salida(d)
    assert est["titulo"] == "Viejo EPUB"
    assert est["isbn"] == "0306406152"
    assert est["tienePortada"] is True
    assert [c["titulo"] for c in est["capitulos"]] == ["Uno", "Dos"]
    assert est["toc"][0]["hijos"][0]["href"] == "cap-000.xhtml#x"


def test_epub_sin_indice_usa_titulos_del_texto(tmp_path):
    d = tmp_path / "n"
    convertir(epub2(tmp_path / "v.epub", con_ncx=False), d, "x")
    est = validar_salida(d)
    assert [c["titulo"] for c in est["capitulos"]] == ["Uno", "Sección 2"]


@pytest.mark.parametrize(
    ("archivos", "mensaje"),
    [
        ({}, "META-INF/container.xml"),
        ({"META-INF/container.xml": "<container/>"}, "OPF"),
        ({"META-INF/container.xml": CONTAINER.format(opf="x.opf")}, "OPF"),
        (
            {
                "META-INF/container.xml": CONTAINER.format(opf="x.opf"),
                "x.opf": '<package xmlns="http://www.idpf.org/2007/opf"><spine/></package>',
            },
            "capítulos legibles",
        ),
    ],
)
def test_epub_incompleto(tmp_path, archivos, mensaje):
    ruta = tmp_path / "m.epub"
    with zipfile.ZipFile(ruta, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        for k, v in archivos.items():
            z.writestr(k, v)
    with pytest.raises(ErrorDefinitivo, match=mensaje):
        convertir(ruta, tmp_path / "n", "x")


def test_portadas():
    assert a_jpeg(None) is None
    assert a_jpeg(b"no es imagen") is None
    b = io.BytesIO()
    Image.new("RGBA", (400, 3000), (1, 2, 3, 100)).save(b, "PNG")
    jpg = a_jpeg(b.getvalue())
    assert jpg is not None
    with Image.open(io.BytesIO(jpg)) as img:
        assert (img.format, img.height, img.mode) == ("JPEG", ALTO_MAXIMO, "RGB")
    g = io.BytesIO()
    Image.new("L", (10, 10)).save(g, "PNG")
    gris = a_jpeg(g.getvalue())
    assert gris is not None and gris[:2] == b"\xff\xd8"


def test_docx_sin_pandoc_usa_mammoth(tmp_path, docx_prueba, monkeypatch):
    monkeypatch.setattr(desde_docx.shutil, "which", lambda _n: None)
    d = tmp_path / "n"
    convertir(docx_prueba, d, "x")
    est = validar_salida(d)
    assert "Normas" in [c["titulo"] for c in est["capitulos"]]


def test_doc_sin_libreoffice(tmp_path, monkeypatch):
    monkeypatch.setattr(desde_docx.shutil, "which", lambda _n: None)
    f = tmp_path / "viejo.doc"
    f.write_bytes(b"\xd0\xcf\x11\xe0" + b"\0" * 100)
    with pytest.raises(ErrorDefinitivo, match="LibreOffice"):
        convertir(f, tmp_path / "n", "x")


def test_docx_danado(tmp_path):
    f = tmp_path / "roto.docx"
    f.write_bytes(b"PK\x03\x04basura")
    with pytest.raises(ErrorDefinitivo, match="Word"):
        convertir(f, tmp_path / "n", "x")


# ------------------------------------------------------------------ arranque


def test_arranque_sin_db_url_termina_con_codigo_2(monkeypatch, caplog):
    monkeypatch.delenv("TALLER_DB_URL", raising=False)
    assert principal.main() == 2
    assert "falta la variable TALLER_DB_URL" in caplog.text


def test_arranque_con_configuracion_lanza_uvicorn(monkeypatch, tmp_path):
    monkeypatch.setenv("TALLER_DB_URL", "postgresql://a:b@c/d")
    monkeypatch.setenv("TALLER_DATOS", str(tmp_path))
    llamadas = []
    monkeypatch.setattr(principal.uvicorn, "run", lambda app, **kw: llamadas.append(kw))
    assert principal.main() == 0
    assert llamadas == [{"host": "0.0.0.0", "port": 8926, "log_config": None}]


# ------------------------------------------------------------------ voz por la cola


def test_manejador_voz_ok_y_errores(tmp_path, monkeypatch):
    import app.cola.trabajador as tr

    async def generar_falso(rutas, aid, voz, cap, motor, voz_motor, latido=None, seguir=None, **opciones):
        assert opciones == {"concurrencia": 4, "urgente": False}  # (v1.5) prioridad 100 del trabajo de prueba
        latido()
        assert seguir()
        return 12.345

    monkeypatch.setattr(tr, "generar_capitulo", generar_falso)
    p = {"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 2}
    repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload=p)])
    Rutas(tmp_path).normalizados("a1").mkdir(parents=True)
    m = ManejadorVoz(Rutas(tmp_path))
    assert procesar(repo.tomar(["VOZ_CAPITULO"]), m, repo, 3) == "HECHO"
    assert repo.audios[("a1", "edge.es-ES-AlvaroNeural", 2)] == {"estado": "LISTO", "duracion": 12.35, "error": None}

    repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload={"vozId": "raro.x", "capitulo": 0})])
    assert procesar(repo.tomar(["VOZ_CAPITULO"]), m, repo, 3) == "ERROR"
    assert repo.trabajos[0]["error"] == "La voz «raro.x» no está disponible. Elige otra voz de la lista."
    assert repo.audios[("a1", "raro.x", 0)]["estado"] == "ERROR"

    repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload='{"capitulo": 1}')])
    assert procesar(repo.tomar(["VOZ_CAPITULO"]), m, repo, 3) == "ERROR"
    assert repo.trabajos[0]["error"] == "La petición de audio está incompleta (falta la voz o el capítulo)."


def test_voz_capitulo_inexistente_es_definitivo(tmp_path):
    p = {"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 7}
    repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload=p)])
    assert procesar(repo.tomar(["VOZ_CAPITULO"]), ManejadorVoz(Rutas(tmp_path)), repo, 3) == "ERROR"
    assert repo.trabajos[0]["error"] == "El capítulo 7 no existe o el libro aún no está convertido."
    assert repo.trabajos[0]["intentos"] == 1

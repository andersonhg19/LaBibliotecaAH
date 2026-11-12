"""(v1.6) Documentos de texto y ofimática → EPUB normalizado: Markdown, HTML, RTF, ODT, PPTX, JSON, YAML y LOG."""

import json
import shutil
import zipfile

import pytest

from app.conversion import formatos
from app.conversion.convertir import convertir, detectar_formato
from app.conversion.desde_codigo import nivel_de_sangria
from app.conversion.desde_html import convertir_markdown
from app.dominio.modelo import ErrorDefinitivo
from tests import corpus
from tests import corpus_documentos as cd
from tests.conftest import hay_soffice
from tests.validar import frases_cap, textos, validar_salida

ID = "11111111-2222-3333-4444-555555555555"
hay_pandoc = pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc no está instalado")


def _convertir(origen, datos):
    destino = datos / "normalizados" / ID
    r = convertir(origen, destino, ID)
    return r, destino


def _xhtml(d, n=None) -> str:
    with zipfile.ZipFile(d / "libro.epub") as z:
        nombres = sorted(x for x in z.namelist() if x.startswith("OEBPS/cap-"))
        if n is not None:
            return z.read(nombres[n]).decode()
        return "".join(z.read(x).decode() for x in nombres)


def _css(d) -> str:
    with zipfile.ZipFile(d / "libro.epub") as z:
        return z.read("OEBPS/estilo.css").decode()


# ------------------------------------------------------------------ detección


class TestDeteccion:
    def test_texto_por_extension(self, tmp_path):
        casos = {
            "a.md": "MD",
            "a.markdown": "MD",
            "a.html": "HTML",
            "a.htm": "HTML",
            "a.xhtml": "HTML",
            "a.csv": "CSV",
            "a.tsv": "CSV",
            "a.json": "JSON",
            "a.yaml": "YAML",
            "a.yml": "YAML",
            "a.log": "LOG",
            "a.txt": "TXT",
        }
        for nombre, esperado in casos.items():
            f = tmp_path / nombre
            f.write_text("hola", encoding="utf-8")
            assert detectar_formato(f) == esperado, nombre

    def test_rtf_por_firma(self, tmp_path):
        f = cd.escribir(tmp_path / "contrato.txt", cd.RTF)
        assert detectar_formato(f) == "RTF"

    def test_zip_por_contenido(self, tmp_path, epub_prueba, docx_prueba):
        # el contenido manda sobre la extensión
        for origen, esperado in ((epub_prueba, "EPUB"), (docx_prueba, "DOCX")):
            copia = tmp_path / ("x" + origen.suffix + ".bin")
            shutil.copy(origen, copia)
            assert detectar_formato(copia) == esperado
        assert detectar_formato(cd.crear_pptx(tmp_path / "p.zip")) == "PPTX"
        assert detectar_formato(cd.crear_ods(tmp_path / "h.zip")) == "ODS"
        assert detectar_formato(cd.crear_xlsx(tmp_path / "h.docx")) == "XLSX"

    def test_zip_desconocido_conserva_lo_de_siempre(self, tmp_path):
        for nombre, esperado in (("a.docx", "DOCX"), ("a.epub", "EPUB"), ("a.xlsx", "XLSX"), ("a.odt", "ODT")):
            f = tmp_path / nombre
            with zipfile.ZipFile(f, "w") as z:
                z.writestr("otra.txt", "x")
            assert detectar_formato(f) == esperado
        roto = tmp_path / "roto.docx"
        roto.write_bytes(b"PK\x03\x04 esto no es un zip")
        assert formatos.tipo_zip(roto) is None
        assert detectar_formato(roto) == "DOCX"

    def test_ole_por_sus_flujos(self, tmp_path):
        assert detectar_formato(cd.crear_ole(tmp_path / "a.doc", ["Workbook"])) == "XLS"
        assert detectar_formato(cd.crear_ole(tmp_path / "b.xls", ["WordDocument", "1Table"])) == "DOC"
        assert detectar_formato(cd.crear_ole(tmp_path / "c.xls", ["Book"])) == "XLS"
        assert formatos.flujos_ole(tmp_path / "c.xls") == {"Root Entry", "Book"}
        # ilegible: decide la extensión
        basura = tmp_path / "d.xls"
        basura.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 100)
        assert formatos.flujos_ole(basura) == set()
        assert detectar_formato(basura) == "XLS"
        basura2 = tmp_path / "d.doc"
        basura2.write_bytes(basura.read_bytes())
        assert detectar_formato(basura2) == "DOC"


# ------------------------------------------------------------------ Markdown


@hay_pandoc
class TestMarkdown:
    def test_markdown_completo(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "plan.md", cd.MARKDOWN)
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        assert est["titulo"] == "Plan del proyecto Biblioteca"
        assert est["autores"] == ["Anderson Herrera"]
        assert [c["titulo"] for c in est["capitulos"]] == ["Plan del proyecto", "Tareas", "Tabla de avance", "Notas"]
        html = _xhtml(d)
        # front matter fuera
        assert "author:" not in html
        # tareas: clases, sin casillas ni símbolos en el texto
        assert 'class="bah-tareas"' in html or "bah-tareas" in html
        assert html.count("bah-tarea-hecha") == 1
        assert "<input" not in html and "☐" not in html and "☑" not in html
        # tabla envuelta, cita marcada, código en línea marcado
        assert '<div class="bah-tabla"><table>' in html
        assert 'class="bah-cita"' in html
        assert '<code class="bah-codigo-linea">' in html
        assert 'href="https://example.com"' in html
        # código: tal cual (saltos y sangría), sin frases dentro
        assert '<pre class="bah-codigo">' in html
        assert '    if True:\n        print("hola  mundo")' in html
        todo = " ".join(textos(d))
        assert "print" not in todo and "def hola" not in todo
        assert "Diseñar las carpetas" in todo and "Ola 2" in todo and "Anidado" in todo
        css = _css(d)
        assert "li.bah-tarea::before" in css and "pre.bah-codigo" in css and "p.bah-sangria-20" in css

    def test_markdown_sin_titulos(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "nota_rapida.markdown", "Solo un párrafo *suelto*.\n\nY otro.\n")
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        assert est["titulo"] == "nota rapida"
        assert len(est["capitulos"]) == 1 and est["totalFrases"] == 2

    def test_markdown_vacio(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "vacio.md", "  \n\n")
        with pytest.raises(ErrorDefinitivo, match="vacío"):
            _convertir(f, datos)

    def test_sin_pandoc_cae_a_texto(self, tmp_path, monkeypatch):
        f = cd.escribir(tmp_path / "a.md", "# Hola\n\nUn texto.\n")
        monkeypatch.setattr("app.conversion.desde_html.shutil.which", lambda _p: None)
        libro = convertir_markdown(f)
        assert libro.capitulos and "Un texto." in "".join(libro.capitulos[0].cuerpo.itertext())

    def test_pandoc_falla(self, tmp_path, monkeypatch):
        import subprocess

        f = cd.escribir(tmp_path / "a.md", "# Hola\n")

        def falla(*_a, **_k):
            return subprocess.CompletedProcess([], 2, b"", b"error")

        monkeypatch.setattr("app.conversion.desde_html.subprocess.run", falla)
        with pytest.raises(ErrorDefinitivo, match="Markdown"):
            convertir_markdown(f)


# ------------------------------------------------------------------ HTML


class TestHtml:
    def test_html_hostil_sale_limpio(self, tmp_path, datos):
        f = cd.crear_html(tmp_path / "informe.html")
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        assert est["titulo"] == "Informe de la casa"
        assert est["autores"] == ["Samy"]
        assert est["idioma"] == "es"
        html = _xhtml(d).lower()
        for prohibido in (
            "<script",
            "alert(",
            "<iframe",
            "<object",
            "<form",
            "<input",
            "onload",
            "onclick",
            "javascript:",
            "data:text",
            "malo.example",
            "<svg",
            "<meta http-equiv",
            "<base",
            "remoto.example",
        ):
            assert prohibido not in html, prohibido
        assert 'href="https://example.com/ok"' in html
        with zipfile.ZipFile(d / "libro.epub") as z:
            assert any(n.startswith("OEBPS/imagenes/img-") for n in z.namelist())  # la incrustada sí
        # <pre> con <code> es código; el poema no
        assert html.count('<pre class="bah-codigo">') == 1
        assert "    linea 2 sangrada" in _xhtml(d)
        todo = " ".join(textos(d))
        assert "Un poema" in todo and "linea 1" not in todo
        assert [c["titulo"] for c in est["capitulos"]] == ["Informe"]  # un solo h1 y un solo h2: un capítulo

    def test_html_sin_titulo_usa_h1_o_nombre(self, tmp_path, datos):
        f = cd.escribir(
            tmp_path / "pagina.htm", "<html><body><h1>Receta de arepas</h1><p>Masa y sal.</p></body></html>"
        )
        _r, d = _convertir(f, datos)
        assert validar_salida(d)["titulo"] == "Receta de arepas"
        g = cd.escribir(tmp_path / "otra_pagina.xhtml", "<p>Sin títulos.</p>")
        _r, d = _convertir(g, datos)
        assert validar_salida(d)["titulo"] == "otra pagina"

    def test_html_vacio(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "vacio.html", "   ")
        with pytest.raises(ErrorDefinitivo):
            _convertir(f, datos)


# ------------------------------------------------------------------ RTF / ODT (LibreOffice)


@hay_soffice
def test_rtf(tmp_path, datos):
    f = cd.escribir(tmp_path / "contrato_arriendo.rtf", cd.RTF, "latin-1")
    _r, d = _convertir(f, datos)
    validar_salida(d)
    todo = " ".join(textos(d))
    assert "Contrato de arriendo de la casa." in todo
    assert "El inquilino paga el día cinco." in todo


@hay_soffice
def test_odt(docx_prueba, tmp_path, datos):
    odt = cd.crear_odt(docx_prueba, tmp_path)
    assert odt is not None
    assert detectar_formato(odt) == "ODT"
    _r, d = _convertir(odt, datos)
    est = validar_salida(d)
    assert "Normas" in [c["titulo"] for c in est["capitulos"]]
    assert "Esto va en cursiva." in " ".join(textos(d))


def test_rtf_sin_libreoffice(tmp_path, datos, monkeypatch):
    f = cd.escribir(tmp_path / "a.rtf", cd.RTF)
    monkeypatch.setattr("app.conversion.desde_docx.shutil.which", lambda _p: None)
    with pytest.raises(ErrorDefinitivo, match=r"archivos \.rtf"):
        _convertir(f, datos)


# ------------------------------------------------------------------ PPTX


class TestPptx:
    def test_pptx(self, tmp_path, datos):
        f = cd.crear_pptx(tmp_path / "presentacion.pptx")
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        assert est["titulo"] == "Presentación de la casa"
        assert est["autores"] == ["Anderson Herrera"]
        assert [c["titulo"] for c in est["capitulos"]] == [
            "Diapositiva 1 · Bienvenida al proyecto",
            "Diapositiva 3 · Resultados",
        ]
        html = _xhtml(d)
        assert "Diapositiva secreta" not in html and "No debe verse" not in html
        # viñetas anidadas
        assert "<ul><li>" in html.replace(" ", "") or "<ul>" in html
        assert html.index("Primer punto") < html.index("Detalle del punto") < html.index("Segundo punto")
        uno = _xhtml(d, 0)
        assert uno.count("<ul>") == 2
        # imagen, tabla y notas del orador (se ven, no se leen)
        assert 'alt="Logo de la casa"' in uno
        tres = _xhtml(d, 1)
        assert '<div class="bah-tabla"><table>' in tres and "<th>" in tres
        assert "Recordar saludar a Samy." in uno and "bah-nota-pie" in uno
        voz = [f["voz"] for f in frases_cap(d, 0)]
        assert not any("Samy" in v for v in voz)
        assert any(f["texto"] == "Primer punto" and f["voz"] for f in frases_cap(d, 0))

    def test_pptx_danado(self, tmp_path, datos):
        f = tmp_path / "rota.pptx"
        with zipfile.ZipFile(f, "w") as z:
            z.writestr("[Content_Types].xml", "<Types/>")
            z.writestr("ppt/presentation.xml", "esto < no es xml")
        with pytest.raises(ErrorDefinitivo, match="PowerPoint"):
            _convertir(f, datos)

    def test_pptx_sin_diapositivas_visibles(self, tmp_path, datos):
        f = tmp_path / "vacia.pptx"
        with zipfile.ZipFile(f, "w") as z:
            z.writestr("[Content_Types].xml", "<Types/>")
            z.writestr(
                "ppt/presentation.xml",
                f'<p:presentation xmlns:p="{cd._P}" xmlns:r="{cd._R}"><p:sldIdLst/></p:presentation>',
            )
        with pytest.raises(ErrorDefinitivo, match="texto legible"):
            _convertir(f, datos)


# ------------------------------------------------------------------ JSON / YAML / LOG


class TestCodigo:
    def test_json_reindentado(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "config.json", cd.JSON)
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        assert est["titulo"] == "config" and [c["titulo"] for c in est["capitulos"]] == ["JSON"]
        html = _xhtml(d)
        assert 'class="bah-linea bah-sangria-2"' in html  # "fases" a 4 espacios → nivel 2
        assert '"proyecto": "Biblioteca",' in " ".join(textos(d))

    def test_json_invalido_tal_cual(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "roto.json", '{"a": 1,\n   "b": ')
        _r, d = _convertir(f, datos)
        assert '"b":' in " ".join(textos(d))

    def test_yaml_y_tabuladores(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "datos.yml", cd.YAML)
        _r, d = _convertir(f, datos)
        validar_salida(d)
        html = _xhtml(d)
        assert "bah-sangria-1" in html and "bah-sangria-2" in html
        assert nivel_de_sangria("\tx") == 2 and nivel_de_sangria(" " * 100 + "x") == 20

    def test_log_largo_por_tramos(self, tmp_path, datos):
        lineas = "\n".join(f"2026-11-12 linea {i} del registro" for i in range(4500))
        f = cd.escribir(tmp_path / "servidor.log", cd.LOG + lineas)
        _r, d = _convertir(f, datos)
        est = validar_salida(d)
        titulos = [c["titulo"] for c in est["capitulos"]]
        assert titulos[:2] == ["Registro: líneas 1–800", "Registro: líneas 801–1600"]
        assert len(titulos) == 6

    def test_vacio(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "vacio.log", "\n\n")
        with pytest.raises(ErrorDefinitivo, match="vacío"):
            _convertir(f, datos)


def test_estructura_json_del_epub(tmp_path, datos):
    """Los nuevos formatos de texto dejan la misma salida que un libro (EPUB + frases + estructura)."""
    f = cd.escribir(tmp_path / "x.log", "una línea\n")
    _r, d = _convertir(f, datos)
    est = json.loads((d / "estructura.json").read_text(encoding="utf-8"))
    assert est["totalFrases"] == 1 and (d / "libro.epub").exists() and not (d / "hoja.json").exists()


def test_corpus_base_sigue_igual(docx_prueba, tmp_path):
    assert detectar_formato(docx_prueba) == "DOCX"
    assert detectar_formato(corpus.crear_txt_latin1(tmp_path / "t.txt")) == "TXT"

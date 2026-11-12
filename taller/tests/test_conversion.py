import json
import zipfile

import pytest

from app.conversion.convertir import convertir, detectar_formato
from app.dominio.modelo import ErrorDefinitivo
from tests import corpus
from tests.conftest import hay_soffice
from tests.validar import frases_cap, textos, validar_salida

LIGADURAS = "ﬀﬁﬂﬃﬄ"


def _convertir(origen, datos, archivo_id="11111111-2222-3333-4444-555555555555"):
    destino = datos / "normalizados" / archivo_id
    r = convertir(origen, destino, archivo_id)
    return r, destino


# ------------------------------------------------------------------ EPUB


def test_epub(epub_prueba, datos):
    r, d = _convertir(epub_prueba, datos)
    est = validar_salida(d)
    assert est["titulo"] == "La biblioteca de prueba"
    assert est["autores"] == ["Ana Autora", "Beto Coautor"]
    assert est["editorial"] == "Editorial Roble" and est["anio"] == 2019
    assert est["isbn"] == "9788420412146"
    assert est["sinopsis"] == "Una sinopsis breve."
    assert est["materias"] == ["Novela", "Fantástico", "Juvenil"]  # (v1.4) dc:subject, separados por «;»
    assert est["tienePortada"] and r.tiene_portada
    # portada, nav y el documento vacío no son capítulos; la lámina se queda dentro del cap. 1
    assert [c["titulo"] for c in est["capitulos"]] == ["Parte I", "Capítulo 1: La lluvia", "Capítulo 2: El final"]
    assert [c["nivel"] for c in est["capitulos"]] == [1, 2, 2]
    # índice anidado
    assert est["toc"][0]["titulo"] == "Parte I"
    assert [h["titulo"] for h in est["toc"][0]["hijos"]] == ["Capítulo 1: La lluvia", "Capítulo 2: El final"]
    assert est["toc"][0]["hijos"][1]["hijos"][0]["href"] == "cap-002.xhtml#s2"
    f1 = [f["texto"] for f in frases_cap(d, 1)]
    assert "La lluvia caía sobre el tejado." in f1 and "Nadie salió de casa." in f1
    voz = {f["texto"]: f["voz"] for f in frases_cap(d, 1)}
    assert voz["El Sr. Gómez leyó la pág. 5 del libro1."] == "El señor Gómez leyó la página 5 del libro."
    assert frases_cap(d, 1)[0]["voz"] == "Capítulo uno"
    nota = next(f for f in frases_cap(d, 1) if f["texto"] == "Nota al pie de prueba.")
    assert nota["voz"] == ""  # la nota al pie se ve pero no se lee
    with zipfile.ZipFile(d / "libro.epub") as z:
        cap1 = z.read("OEBPS/cap-001.xhtml").decode()
        assert "<script" not in cap1 and "color:red" not in cap1
        assert 'href="cap-002.xhtml#s2"' in cap1  # enlace interno reescrito
        assert 'class="bah-nota"' in cap1 and 'class="bah-nota-pie"' in cap1
        assert 'src="imagenes/img-001.png"' in cap1  # lámina copiada
        assert "OEBPS/imagenes/img-001.png" in z.namelist()
        assert "OEBPS/imagenes/portada.jpg" in z.namelist()
        assert 'properties="cover-image"' in z.read("OEBPS/content.opf").decode()
        cap2 = z.read("OEBPS/cap-002.xhtml").decode()
        assert 'id="s2"' in cap2
    assert r.metadatos["titulo"] == "La biblioteca de prueba"


def test_epub_danado(tmp_path, datos):
    malo = tmp_path / "malo.epub"
    malo.write_bytes(b"PK\x03\x04 esto no es un zip")
    with pytest.raises(ErrorDefinitivo):
        _convertir(malo, datos)


# ------------------------------------------------------------------ PDF


def test_pdf_dos_columnas(pdf_prueba, datos):
    _r, d = _convertir(pdf_prueba, datos)
    est = validar_salida(d)
    assert [c["titulo"] for c in est["capitulos"]] == ["Primera parte", "Segunda parte"]
    assert est["titulo"] == "Revista de prueba" and est["autores"] == ["Equipo Taller"]
    assert est["tienePortada"]
    todo = " ".join(textos(d))
    # cabeceras, pies y números de página fuera
    assert corpus.PDF_CABECERA not in todo
    assert corpus.PDF_PIE_TEXTO not in todo
    # guiones de corte deshechos
    assert "antiguos" in todo and "an-" not in todo
    assert "continúa" in todo and "página tres" in todo
    # sin ligaduras
    assert not any(c in todo for c in LIGADURAS)
    if corpus.fuente_con_ligaduras():
        assert "fila de estantes es firme y la oficina" in todo
    # orden de lectura: columna izquierda completa antes que la derecha
    assert todo.index("Primera columna") < todo.index("termina aquí") < todo.index("Columna derecha")
    assert todo.index("Columna derecha de la página uno") < todo.index("Página dos, columna izquierda")
    # ningún número de página suelto
    assert all(not t.strip().isdigit() for t in textos(d))


def test_pdf_sin_indice_por_tramos(tmp_path, datos):
    pdf = corpus.crear_pdf_sin_toc(tmp_path / "sin.pdf", paginas=20)
    _r, d = _convertir(pdf, datos)
    est = validar_salida(d)
    assert [c["titulo"] for c in est["capitulos"]] == ["Páginas 1–15", "Páginas 16–20"]


def test_pdf_escaneado(pdf_escaneado, datos):
    with pytest.raises(ErrorDefinitivo, match="PDF escaneado: el OCR llegará en una ola posterior"):
        _convertir(pdf_escaneado, datos)


# ------------------------------------------------------------------ DOCX / DOC


def test_docx(docx_prueba, datos):
    _r, d = _convertir(docx_prueba, datos)
    est = validar_salida(d)
    assert est["titulo"] == "Manual de la casa" and est["autores"] == ["Samy"]
    assert [c["titulo"] for c in est["capitulos"]] == ["Inicio", "Introducción", "Normas"]
    assert est["toc"][1]["hijos"][0]["titulo"] == "Detalles"
    todo = textos(d)
    assert "Esto va en cursiva." in todo
    assert "Segundo punto de la lista" in todo
    with zipfile.ZipFile(d / "libro.epub") as z:
        assert "<em>Esto va en cursiva.</em>" in z.read("OEBPS/cap-001.xhtml").decode()


@hay_soffice
def test_doc(docx_prueba, tmp_path, datos):
    doc = corpus.crear_doc(docx_prueba, tmp_path)
    assert doc is not None
    assert detectar_formato(doc) == "DOC"
    _r, d = _convertir(doc, datos)
    est = validar_salida(d)
    assert "Normas" in [c["titulo"] for c in est["capitulos"]]


# ------------------------------------------------------------------ TXT


def test_txt_latin1(txt_prueba, datos):
    _r, d = _convertir(txt_prueba, datos)
    est = validar_salida(d)
    assert [c["titulo"] for c in est["capitulos"]] == ["Inicio", "CAPÍTULO I", "CAPÍTULO II"]
    todo = textos(d)
    assert "Érase una vez una biblioteca en España." in todo
    assert "Tenía más de mil libros y una lámpara." in todo
    assert any("eñes y acentos: año, corazón." in t for t in todo)
    assert frases_cap(d, 1)[0]["voz"] == "CAPÍTULO uno"


def test_txt_utf8_sin_capitulos(tmp_path, datos):
    t = tmp_path / "nota.txt"
    t.write_text("Una línea.\nOtra línea.\nTercera línea.\nCuarta.\n", encoding="utf-8")
    _r, d = _convertir(t, datos)
    est = validar_salida(d)
    assert len(est["capitulos"]) == 1 and est["totalFrases"] == 4


def test_formato_no_soportado(tmp_path, datos):
    f = tmp_path / "x.exe"
    f.write_bytes(b"MZ\x90\x00 un ejecutable")
    with pytest.raises(ErrorDefinitivo, match=r"El formato \.exe"):
        _convertir(f, datos)


def test_reconversion_reemplaza(epub_prueba, datos):
    _r, d = _convertir(epub_prueba, datos)
    (d / "basura.txt").write_text("x")
    _r, d = _convertir(epub_prueba, datos)
    assert not (d / "basura.txt").exists()
    assert json.loads((d / "estructura.json").read_text(encoding="utf-8"))["totalFrases"] > 0

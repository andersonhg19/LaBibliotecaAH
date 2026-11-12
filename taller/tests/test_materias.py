"""(v1.4) Materias del archivo: dc:subject del EPUB, palabras clave de PDF y DOCX, y su relectura (RELEER_METADATOS)."""

import zipfile
from pathlib import Path

import pymupdf
import pytest

from app.cola.trabajador import ManejadorMetadatos, procesar
from app.config.rutas import Rutas
from app.conversion import materias as modulo_materias
from app.conversion.desde_epub import _opf_utf8, materias_epub
from app.conversion.materias import leer_materias
from app.conversion.metadatos import MAX_MATERIAS, limpiar_materias, reparar_mojibake
from app.dominio.modelo import ErrorDefinitivo
from tests import corpus
from tests.test_trabajador import RepoFalso, trabajo

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""


def _epub_con_opf(destino: Path, opf: bytes) -> Path:
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
        z.writestr("META-INF/container.xml", CONTAINER)
        z.writestr("content.opf", opf)
    return destino


def _opf(subjects: str, declaracion: str = '<?xml version="1.0" encoding="utf-8"?>') -> str:
    return (
        f'{declaracion}\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0">'
        f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title>{subjects}</metadata>'
        "<manifest/><spine/></package>"
    )


# ------------------------------------------------------------------ limpieza


class TestLimpiarMaterias:
    def test_separa_por_punto_y_coma_coma_barra_y_tubo(self):
        assert limpiar_materias(["Novela; Fantástico; Juvenil", "Novela, Intriga, Psicológico"]) == [
            "Novela",
            "Fantástico",
            "Juvenil",
            "Intriga",
            "Psicológico",
        ]
        assert limpiar_materias(["FICTION / Fantasy | General"]) == ["FICTION", "Fantasy", "General"]

    def test_limpia_espacios_y_bordes_sin_repetir_ni_vacios(self):
        assert limpiar_materias(["  Ciencia   ficción. ", "ciencia ficción", "", None, " ; ", "«Terror»"]) == [
            "Ciencia ficción",
            "Terror",
        ]
        assert limpiar_materias(["Fantasía (épica)"]) == ["Fantasía (épica)"]

    def test_topes(self):
        assert limpiar_materias(["x" * 101]) == []
        assert len(limpiar_materias([";".join(f"Tema {i}" for i in range(50))])) == MAX_MATERIAS

    def test_repara_mojibake(self):
        assert reparar_mojibake("RomÃ¡ntico") == "Romántico"
        assert reparar_mojibake("FantÃ¡stico; Ã‰pico") == "Fantástico; Épico"
        assert reparar_mojibake("Ãrbol") == "Ãrbol"  # parece, pero no es UTF-8 mal leído
        assert reparar_mojibake("Romántico") == "Romántico"
        assert limpiar_materias(["Novela; RomÃ¡ntico"]) == ["Novela", "Romántico"]


# ------------------------------------------------------------------ EPUB


class TestEpub:
    def test_materias_del_corpus_sin_convertir(self, epub_prueba):
        assert materias_epub(epub_prueba) == ["Novela", "Fantástico", "Juvenil"]

    def test_sin_dc_subject_lista_vacia(self, tmp_path):
        assert materias_epub(_epub_con_opf(tmp_path / "a.epub", _opf("").encode())) == []

    def test_opf_en_latin1_que_dice_utf8_se_lee_bien(self, tmp_path):
        """Sin la recodificación, lxml dejaba «Rom�ntico»."""
        opf = _opf("<dc:subject>Novela; Romántico</dc:subject>").encode("cp1252")
        assert materias_epub(_epub_con_opf(tmp_path / "a.epub", opf)) == ["Novela", "Romántico"]
        sin_declaracion = _opf("<dc:subject>Fantástico</dc:subject>", declaracion="").encode("cp1252")
        assert materias_epub(_epub_con_opf(tmp_path / "b.epub", sin_declaracion)) == ["Fantástico"]

    def test_otras_codificaciones_declaradas_se_respetan(self, tmp_path):
        opf = _opf(
            "<dc:subject>Histórico</dc:subject>", declaracion='<?xml version="1.0" encoding="ISO-8859-1"?>'
        ).encode("latin-1")
        assert _opf_utf8(opf) is opf
        assert materias_epub(_epub_con_opf(tmp_path / "a.epub", opf)) == ["Histórico"]
        utf16 = _opf("<dc:subject>Terror</dc:subject>", declaracion='<?xml version="1.0" encoding="UTF-16"?>')
        datos = utf16.encode("utf-16")
        assert _opf_utf8(datos) is datos
        assert materias_epub(_epub_con_opf(tmp_path / "b.epub", datos)) == ["Terror"]

    def test_utf8_correcto_no_se_toca(self):
        datos = _opf("<dc:subject>Romántico</dc:subject>").encode()
        assert _opf_utf8(datos) is datos

    def test_epub_danado(self, tmp_path):
        roto = tmp_path / "roto.epub"
        roto.write_bytes(b"no es un zip")
        with pytest.raises(ErrorDefinitivo):
            materias_epub(roto)


# ------------------------------------------------------------------ PDF, DOCX y otros


def _pdf_con_palabras_clave(destino: Path, keywords: str | None) -> Path:
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "Texto de prueba para el PDF con palabras clave.")
    if keywords is not None:
        doc.set_metadata({"keywords": keywords})
    doc.save(str(destino))
    doc.close()
    return destino


class TestOtrosFormatos:
    def test_pdf(self, tmp_path):
        assert leer_materias(_pdf_con_palabras_clave(tmp_path / "a.pdf", "Novela; Terror")) == ["Novela", "Terror"]
        assert leer_materias(_pdf_con_palabras_clave(tmp_path / "b.pdf", None)) == []

    def test_pdf_danado_da_lista_vacia(self, tmp_path):
        roto = tmp_path / "roto.pdf"
        roto.write_bytes(b"%PDF-1.7\nbasura")
        assert leer_materias(roto) == []

    def test_docx(self, docx_prueba):
        assert leer_materias(docx_prueba) == ["Ensayo", "Hogar"]

    def test_docx_al_convertir(self, docx_prueba, tmp_path):
        from app.conversion.convertir import convertir

        r = convertir(docx_prueba, tmp_path / "n", "x")
        assert r.metadatos["materias"] == ["Ensayo", "Hogar"]

    def test_epub_por_leer_materias(self, epub_prueba):
        assert leer_materias(epub_prueba) == ["Novela", "Fantástico", "Juvenil"]

    def test_txt_y_formatos_sin_materias(self, txt_prueba, tmp_path):
        assert leer_materias(txt_prueba) == []
        rtf = tmp_path / "a.rtf"
        rtf.write_bytes(b"{\\rtf1 hola}")
        assert leer_materias(rtf) == []  # RTF: error definitivo al detectar → lista vacía

    def test_un_fallo_inesperado_no_rompe(self, epub_prueba, monkeypatch):
        def falla(_ruta):
            raise RuntimeError("boom")

        monkeypatch.setattr(modulo_materias, "materias_epub", falla)
        assert leer_materias(epub_prueba) == []


# ------------------------------------------------------------------ RELEER_METADATOS


def _listo(repo: RepoFalso, aid: str = "a1") -> None:
    repo.archivos[aid] = {"estado": "LISTO", "metadatos": {"titulo": "Título que no se toca"}}


class TestManejadorMetadatos:
    def test_relee_solo_las_materias(self, tmp_path, epub_prueba):
        rutas = Rutas(tmp_path)
        rutas.originales("a1").mkdir(parents=True)
        (rutas.originales("a1") / "libro.epub").write_bytes(epub_prueba.read_bytes())
        repo = RepoFalso([trabajo(tipo="RELEER_METADATOS")])
        _listo(repo)

        assert procesar(repo.tomar(["RELEER_METADATOS"]), ManejadorMetadatos(rutas), repo, 3) == "HECHO"

        a = repo.archivos["a1"]
        assert a["metadatos"] == {"titulo": "Título que no se toca", "materias": ["Novela", "Fantástico", "Juvenil"]}
        assert a["estado"] == "LISTO" and a["aplicados"] is False
        assert not rutas.normalizados("a1").exists()  # no reconvierte

    def test_sin_original_deja_la_lista_vacia_y_no_falla(self, tmp_path):
        repo = RepoFalso([trabajo(tipo="RELEER_METADATOS")])
        _listo(repo)
        assert procesar(repo.tomar(["RELEER_METADATOS"]), ManejadorMetadatos(Rutas(tmp_path)), repo, 3) == "HECHO"
        assert repo.archivos["a1"]["metadatos"]["materias"] == []

    def test_archivo_retirado_o_no_listo_no_cambia_nada(self, tmp_path):
        repo = RepoFalso([trabajo(tipo="RELEER_METADATOS")])
        repo.archivos["a1"] = {"estado": "PROCESANDO"}
        assert procesar(repo.tomar(["RELEER_METADATOS"]), ManejadorMetadatos(Rutas(tmp_path)), repo, 3) == "HECHO"
        assert repo.archivos["a1"] == {"estado": "PROCESANDO"}

    def test_un_fallo_no_toca_el_estado_del_archivo(self, tmp_path):
        class RepoQueFalla(RepoFalso):
            def archivo_materias(self, aid, materias):
                raise RuntimeError("BD caída")

        repo = RepoQueFalla([trabajo(tipo="RELEER_METADATOS")])
        _listo(repo)
        assert procesar(repo.tomar(["RELEER_METADATOS"]), ManejadorMetadatos(Rutas(tmp_path)), repo, 3) == "PENDIENTE"
        assert repo.archivos["a1"]["estado"] == "LISTO"


def test_corpus_epub_trae_subjects(dir_corpus):
    assert b"dc:subject" in zipfile.ZipFile(corpus.crear_epub(dir_corpus / "otro.epub")).read("OEBPS/content.opf")

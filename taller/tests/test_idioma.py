"""QA NU-02: el idioma de un TXT, PDF, DOCX o EPUB sin metadatos se detecta del texto; nunca se inventa "es"."""

import zipfile
from pathlib import Path

import pytest

from app.conversion.convertir import convertir
from app.conversion.idioma import FRECUENTES, IDIOMAS, TROZO_MUESTRA, detectar_idioma, muestra
from app.dominio.modelo import Libro

PARRAFOS = {
    "es": "El viejo guardián dijo que no dejaría la casa antes de la tormenta, porque ellos estaban allí y era lo "
    "que él había sabido siempre. Ella lo miró con los ojos de alguien que no podía creer lo que se decía, pero él "
    "no se detuvo.",
    "en": "The old keeper said that he would not leave the house before the storm, because they were there and it "
    "was what he had always known. She looked at him with the eyes of someone who could not believe what was said, "
    "but he did not stop.",
    "pt": "O velho guardião disse que não deixaria a casa antes da tempestade, porque eles estavam lá e era o que "
    "ele sempre tinha sabido. Ela olhou para ele com os olhos de alguém que não podia acreditar no que se dizia, "
    "mas ele não parou.",
    "fr": "Le vieux gardien a dit qu'il ne quitterait pas la maison avant la tempête, parce qu'ils étaient là et "
    "c'était ce qu'il avait toujours su. Elle le regarda avec les yeux de quelqu'un qui ne pouvait pas croire ce "
    "qui se disait, mais il ne s'arrêta pas.",
    "it": "Il vecchio guardiano disse che non avrebbe lasciato la casa prima della tempesta, perché loro erano lì "
    "ed era quello che lui aveva sempre saputo. Lei lo guardò con gli occhi di qualcuno che non poteva credere a "
    "ciò che si diceva, ma lui non si fermò.",
    "de": "Der alte Wächter sagte, dass er das Haus nicht vor dem Sturm verlassen würde, weil sie dort waren und es "
    "das war, was er immer gewusst hatte. Sie sah ihn mit den Augen von jemandem an, der nicht glauben konnte, was "
    "gesagt wurde, aber er hörte nicht auf.",
}


def texto(idioma: str, veces: int = 6) -> str:
    return "\n\n".join([PARRAFOS[idioma]] * veces)


class TestDetectarIdioma:
    @pytest.mark.parametrize("idioma", IDIOMAS)
    def test_reconoce_los_seis_idiomas(self, idioma: str) -> None:
        assert detectar_idioma(texto(idioma)) == idioma

    def test_texto_corto_no_da_certeza(self) -> None:
        assert detectar_idioma("Hello world. The end.") is None

    def test_texto_vacio_o_sin_letras(self) -> None:
        assert detectar_idioma("") is None
        assert detectar_idioma("1234 5678 — … 90") is None

    def test_mezcla_a_partes_iguales_no_da_certeza(self) -> None:
        assert detectar_idioma(texto("es", 6) + "\n" + texto("fr", 4)) is None

    def test_un_poco_de_otro_idioma_no_cambia_el_resultado(self) -> None:
        assert detectar_idioma(texto("en", 8) + "\n" + PARRAFOS["es"]) == "en"

    def test_las_palabras_compartidas_no_cuentan(self) -> None:
        for a in IDIOMAS:
            for b in IDIOMAS:
                if a != b:
                    assert not FRECUENTES[a] & FRECUENTES[b]
        assert "de" not in FRECUENTES["es"]
        assert "the" in FRECUENTES["en"]


class TestMuestra:
    def test_texto_corto_entero(self) -> None:
        assert muestra(["uno", "dos"]) == "uno\ndos"

    def test_texto_largo_toma_inicio_centro_y_final(self) -> None:
        largo = "a" * TROZO_MUESTRA * 2 + "b" * TROZO_MUESTRA * 2 + "c" * TROZO_MUESTRA * 2
        m = muestra([largo])
        assert len(m) == 3 * TROZO_MUESTRA + 2
        assert m.startswith("a") and m.endswith("c")
        assert m.split("\n")[1] == "b" * TROZO_MUESTRA


class TestNU02ConversionSinIdiomaEnLosMetadatos:
    def test_el_libro_por_defecto_no_tiene_idioma(self) -> None:
        assert Libro().metadatos["idioma"] is None

    def test_txt_en_ingles_queda_en(self, tmp_path: Path) -> None:
        origen = tmp_path / "keeper.txt"
        origen.write_text(texto("en", 10), encoding="utf-8")
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "en"

    def test_txt_en_espanol_queda_es(self, tmp_path: Path) -> None:
        origen = tmp_path / "guardian.txt"
        origen.write_text(texto("es", 10), encoding="utf-8")
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "es"

    def test_txt_corto_queda_sin_idioma_en_vez_de_es(self, tmp_path: Path) -> None:
        origen = tmp_path / "nota.txt"
        origen.write_text("Hello there. See you soon.", encoding="utf-8")
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] is None

    def test_pdf_en_ingles_queda_en(self, tmp_path: Path) -> None:
        import pymupdf

        doc = pymupdf.open()
        for _ in range(4):
            pagina = doc.new_page(width=595, height=842)
            pagina.insert_textbox(pymupdf.Rect(50, 50, 545, 800), texto("en", 3), fontsize=10)
        origen = tmp_path / "keeper.pdf"
        doc.save(str(origen))
        doc.close()
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "en"

    def test_docx_en_ingles_sin_idioma_queda_en(self, tmp_path: Path) -> None:
        import docx

        d = docx.Document()
        d.core_properties.title = "The keeper"
        d.core_properties.language = ""
        for _ in range(8):
            d.add_paragraph(PARRAFOS["en"])
        origen = tmp_path / "keeper.docx"
        d.save(str(origen))
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "en"

    def test_docx_con_idioma_en_los_metadatos_lo_respeta(self, tmp_path: Path) -> None:
        import docx

        d = docx.Document()
        d.core_properties.title = "Le gardien"
        d.core_properties.language = "fr-FR"
        for _ in range(8):
            d.add_paragraph(PARRAFOS["fr"])
        origen = tmp_path / "gardien.docx"
        d.save(str(origen))
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "fr-FR"

    def test_epub_sin_dc_language_detecta_el_texto(self, tmp_path: Path) -> None:
        origen = tmp_path / "keeper.epub"
        cuerpo = "".join(f"<p>{PARRAFOS['en']}</p>" for _ in range(8))
        with zipfile.ZipFile(origen, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
            z.writestr(
                "META-INF/container.xml",
                '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                "</rootfiles></container>",
            )
            z.writestr(
                "OEBPS/content.opf",
                '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" '
                'unique-identifier="u"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
                '<dc:identifier id="u">x</dc:identifier><dc:title>The keeper</dc:title></metadata><manifest>'
                '<item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest>'
                '<spine><itemref idref="c1"/></spine></package>',
            )
            z.writestr(
                "OEBPS/cap1.xhtml",
                f'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>{cuerpo}</body></html>',
            )
        assert convertir(origen, tmp_path / "n", "x").metadatos["idioma"] == "en"

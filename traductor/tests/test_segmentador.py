from __future__ import annotations

import pytest

from app.segmentador import Pieza, partir


def frases(texto: str, maximo: int = 400) -> list[str]:
    return [p.texto for p in partir(texto, maximo) if p.es_frase]


class TestNoSePierdeNada:
    @pytest.mark.parametrize(
        "texto",
        [
            "",
            "   ",
            "Una frase.",
            "  Sangría inicial. Y otra.  \n\n\tSegundo párrafo!  ",
            "Línea uno.\r\nLínea dos.\n\n\nLínea tres.",
            '"Stop. Please stop," she said. He did not.',
        ],
    )
    def test_unir_las_piezas_da_el_texto_original(self, texto: str) -> None:
        assert "".join(p.texto for p in partir(texto)) == texto

    def test_los_separadores_no_son_frases(self) -> None:
        assert partir("Uno. Dos.\n\nTres.") == [
            Pieza("Uno.", True),
            Pieza(" ", False),
            Pieza("Dos.", True),
            Pieza("\n\n", False),
            Pieza("Tres.", True),
        ]


class TestCortes:
    def test_corta_en_punto_interrogacion_y_exclamacion(self) -> None:
        assert frases("He left. Did she? Yes! Fine…  Then") == ["He left.", "Did she?", "Yes!", "Fine…", "Then"]

    @pytest.mark.parametrize("abrev", ["Mr.", "Mrs.", "Dr.", "St.", "Prof.", "e.g.", "U.S.", "Sra.", "etc."])
    def test_no_corta_tras_abreviaturas(self, abrev: str) -> None:
        texto = f"She met {abrev} Hale yesterday. He smiled."
        assert frases(texto) == [f"She met {abrev} Hale yesterday.", "He smiled."]

    def test_no_corta_tras_iniciales_ni_decimales(self) -> None:
        assert frases("J. R. R. Tolkien wrote 3.5 books. Really.") == ["J. R. R. Tolkien wrote 3.5 books.", "Really."]

    def test_no_corta_si_sigue_minuscula(self) -> None:
        assert frases('"Why?" she asked. "Because..." he began.') == ['"Why?" she asked.', '"Because..." he began.']

    def test_corta_antes_de_comillas_y_rayas_de_apertura(self) -> None:
        assert frases('He waited. "Come in." —¿Quién es? ¡Nadie!') == [
            "He waited.",
            '"Come in."',
            "—¿Quién es?",
            "¡Nadie!",
        ]

    def test_corta_antes_del_inciso_del_narrador_en_un_dialogo(self) -> None:
        assert frases("—¿Quién anda ahí? —preguntó Margarita. Nadie.") == [
            "—¿Quién anda ahí?",
            "—preguntó Margarita.",
            "Nadie.",
        ]
        assert frases("She stopped—just for a moment—and listened.") == ["She stopped—just for a moment—and listened."]

    def test_no_parte_una_cita_abierta(self) -> None:
        assert frases('"Stop. Please stop," she said. He did not.') == ['"Stop. Please stop," she said.', "He did not."]
        assert frases("“Stop. Please.” Then silence.") == ["“Stop. Please.”", "Then silence."]
        assert frases("«Para. Por favor.» Silencio.") == ["«Para. Por favor.»", "Silencio."]

    def test_frase_larga_se_parte_por_punto_y_coma_o_coma(self) -> None:
        largo = "The road went on and on through the hills; " + "and the wind kept blowing, " * 6 + "until night."
        partes = frases(largo, maximo=80)
        assert len(partes) > 1
        assert all(len(p) <= 80 for p in partes)
        assert " ".join(partes) == largo

    def test_frase_larga_sin_signos_se_parte_por_espacios_nu01(self) -> None:
        sin_signos = ("word " * 50).strip()
        partes = frases(sin_signos, maximo=60)
        assert len(partes) > 1
        assert all(len(p) <= 60 for p in partes)
        assert " ".join(partes) == sin_signos
        assert all(not p.startswith(" ") and not p.endswith(" ") for p in partes)

    def test_texto_de_3000_caracteres_sin_signos_no_supera_el_maximo_nu01(self) -> None:
        palabras = ["lighthouse", "keeper", "watched", "the", "grey", "sea", "under", "a", "silent", "sky"]
        texto = " ".join(palabras[i % len(palabras)] for i in range(600))[:3000].strip()
        piezas = partir(texto)
        assert "".join(p.texto for p in piezas) == texto
        assert max(len(p.texto) for p in piezas if p.es_frase) <= 400

    def test_una_palabra_sin_espacios_se_corta_a_lo_bruto_nu01(self) -> None:
        enorme = "x" * 1000
        assert [len(p) for p in frases(enorme, maximo=400)] == [400, 400, 200]
        assert "".join(p.texto for p in partir(enorme, 400)) == enorme

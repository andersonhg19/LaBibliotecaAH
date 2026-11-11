from __future__ import annotations

import pytest

from app.config import AjusteInvalido, Ajustes, desde_entorno
from app.idiomas import FRECUENTES, Deteccion, detectar

EN_ES = ("en", "es")


class TestDeteccion:
    @pytest.mark.parametrize(
        ("texto", "idioma"),
        [
            ("The rain had not stopped for three days.", "en"),
            ("La lluvia no había parado en tres días.", "es"),
            ("¿Dónde?", "es"),
            ("Hola", "es"),
            ("Hello", "en"),
            ("I don't know what's wrong.", "en"),
            ("Mañana.", "es"),
        ],
    )
    def test_detecta_entre_los_idiomas_cargados(self, texto: str, idioma: str) -> None:
        assert detectar(texto, EN_ES).idioma == idioma

    def test_sin_pistas_devuelve_el_primero_con_confianza_cero(self) -> None:
        assert detectar("12345 !!", EN_ES) == Deteccion("en", 0.0)
        assert detectar("12345", ("es", "en")) == Deteccion("es", 0.0)

    def test_la_confianza_es_proporcional(self) -> None:
        d = detectar("the casa", EN_ES)
        assert d.confianza == 100.0
        mezcla = detectar("the and of la casa de", EN_ES)
        assert mezcla == Deteccion("en", 60.0)

    def test_palabras_comunes_a_ambos_idiomas_no_cuentan(self) -> None:
        assert not FRECUENTES["en"] & FRECUENTES["es"]


class TestAjustes:
    def test_por_defecto(self) -> None:
        assert desde_entorno({}) == Ajustes()

    def test_lee_el_entorno(self) -> None:
        a = desde_entorno(
            {
                "TRADUCTOR_IDIOMAS": " EN , es ",
                "TRADUCTOR_HILOS": "6",
                "TRADUCTOR_LOTES_PARALELOS": "2",
                "TRADUCTOR_BEAM": "4",
                "TRADUCTOR_PROTEGER_NOMBRES": "false",
                "TRADUCTOR_MODELOS": "/m",
                "TRADUCTOR_LOG": "debug",
            }
        )
        assert (a.idiomas, a.hilos, a.lotes_paralelos, a.beam, a.proteger_nombres, a.modelos, a.nivel_log) == (
            ("en", "es"),
            6,
            2,
            4,
            False,
            "/m",
            "DEBUG",
        )

    @pytest.mark.parametrize(
        ("entorno", "mensaje"),
        [
            ({"TRADUCTOR_HILOS": "muchos"}, "TRADUCTOR_HILOS debe ser un número entero (llegó 'muchos')"),
            ({"TRADUCTOR_BEAM": "0"}, "TRADUCTOR_BEAM debe estar entre 1 y 8 (llegó 0)"),
            ({"TRADUCTOR_IDIOMAS": "en"}, "TRADUCTOR_IDIOMAS necesita al menos dos idiomas (p. ej. en,es)"),
            (
                {"TRADUCTOR_PROTEGER_NOMBRES": "quizá"},
                "TRADUCTOR_PROTEGER_NOMBRES debe ser true o false (llegó 'quizá')",
            ),
        ],
    )
    def test_valores_invalidos_fallan_con_mensaje_claro(self, entorno: dict[str, str], mensaje: str) -> None:
        with pytest.raises(AjusteInvalido) as e:
            desde_entorno(entorno)
        assert str(e.value) == mensaje

    def test_booleano_verdadero(self) -> None:
        assert desde_entorno({"TRADUCTOR_PROTEGER_NOMBRES": "sí"}).proteger_nombres

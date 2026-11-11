"""MotorCTranslate2 con CTranslate2 y SentencePiece falsos (la prueba con el modelo real está en test_modelo_real)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.motor import MAX_TOKENS_ENTRADA, ModeloNoEncontrado, MotorCTranslate2, trocear_tokens


class SpFalso:
    def __init__(self, ruta: str) -> None:
        self.ruta = ruta

    def encode(self, texto: str, out_type: type = str) -> list[str]:
        return ["▁" + p for p in texto.split()]

    def decode(self, piezas: list[str]) -> str:
        return " " + " ".join(p.lstrip("▁") for p in piezas) + " "


class Ct2Falso:
    def __init__(self, ruta: str, hilos: int, lotes: int) -> None:
        self.ruta, self.hilos, self.lotes = ruta, hilos, lotes
        self.opciones: dict[str, Any] = {}
        self.fuente: list[list[str]] = []

    def translate_batch(self, fuente: list[list[str]], **opciones: Any) -> list[SimpleNamespace]:
        self.fuente, self.opciones = fuente, opciones
        return [SimpleNamespace(hypotheses=[[t.upper() for t in f if t != "</s>"]]) for f in fuente]


def carpeta_con_modelos(tmp: Path, pares: tuple[str, ...] = ("en-es", "es-en")) -> str:
    for par in pares:
        (tmp / par).mkdir()
        (tmp / par / "model.bin").write_bytes(b"")
    return str(tmp)


def test_carga_un_traductor_y_dos_tokenizadores_por_par(tmp_path: Path) -> None:
    creados: list[Ct2Falso] = []

    def fabrica(ruta: str, hilos: int, lotes: int) -> Ct2Falso:
        creados.append(Ct2Falso(ruta, hilos, lotes))
        return creados[-1]

    m = MotorCTranslate2(
        carpeta_con_modelos(tmp_path),
        ("en", "es"),
        hilos=3,
        lotes_paralelos=2,
        beam=4,
        max_lote=16,
        fabrica_traductor=fabrica,
        fabrica_tokenizador=SpFalso,
    )
    assert m.pares() == frozenset({("en", "es"), ("es", "en")})
    assert sorted(Path(c.ruta).name for c in creados) == ["en-es", "es-en"]
    assert {(c.hilos, c.lotes) for c in creados} == {(3, 2)}

    assert m.traducir(["hola mundo", "adiós"], "en", "es") == ["HOLA MUNDO", "ADIÓS"]
    usado = next(c for c in creados if c.ruta.endswith("en-es"))
    assert usado.fuente == [["▁hola", "▁mundo", "</s>"], ["▁adiós", "</s>"]]
    assert usado.opciones == {
        "beam_size": 4,
        "max_batch_size": 16,
        "max_decoding_length": 22,
        "max_input_length": 512,
        "repetition_penalty": 1.0,
    }


def test_lista_vacia_no_llama_al_modelo(tmp_path: Path) -> None:
    m = MotorCTranslate2(
        carpeta_con_modelos(tmp_path), ("en", "es"), fabrica_traductor=Ct2Falso, fabrica_tokenizador=SpFalso
    )
    assert m.traducir([], "en", "es") == []


def test_sin_modelo_falla_con_mensaje_claro(tmp_path: Path) -> None:
    with pytest.raises(ModeloNoEncontrado, match="Falta el modelo es-en"):
        MotorCTranslate2(
            carpeta_con_modelos(tmp_path, ("en-es",)),
            ("en", "es"),
            fabrica_traductor=Ct2Falso,
            fabrica_tokenizador=SpFalso,
        )


class TestNU01FrasesQueNoCabenEnElModelo:
    """NU-01: una frase de más de 512 tokens daba RuntimeError en CTranslate2 y 503 en la API."""

    def _motor(self, tmp_path: Path) -> tuple[MotorCTranslate2, list[Ct2Falso]]:
        creados: list[Ct2Falso] = []

        def fabrica(ruta: str, hilos: int, lotes: int) -> Ct2Falso:
            creados.append(Ct2Falso(ruta, hilos, lotes))
            return creados[-1]

        m = MotorCTranslate2(
            carpeta_con_modelos(tmp_path), ("en", "es"), fabrica_traductor=fabrica, fabrica_tokenizador=SpFalso
        )
        return m, creados

    def test_una_frase_de_1200_palabras_se_trocea_y_se_une_sin_perder_nada(self, tmp_path: Path) -> None:
        m, creados = self._motor(tmp_path)
        palabras = [f"w{i}" for i in range(1200)]
        salida = m.traducir([" ".join(palabras), "corta"], "en", "es")
        assert salida == [" ".join(p.upper() for p in palabras), "CORTA"]
        usado = next(c for c in creados if c.ruta.endswith("en-es"))
        assert [len(f) for f in usado.fuente] == [480, 480, 243, 2]
        assert max(len(f) for f in usado.fuente) <= 512
        assert usado.opciones["max_decoding_length"] == 512

    def test_una_frase_que_cabe_va_entera(self, tmp_path: Path) -> None:
        m, creados = self._motor(tmp_path)
        texto = " ".join(["a"] * (MAX_TOKENS_ENTRADA - 1))
        assert m.traducir([texto], "en", "es") == [" ".join(["A"] * (MAX_TOKENS_ENTRADA - 1))]
        usado = next(c for c in creados if c.ruta.endswith("en-es"))
        assert [len(f) for f in usado.fuente] == [MAX_TOKENS_ENTRADA]


class TestTrocearTokens:
    def test_lo_que_cabe_no_se_toca(self) -> None:
        assert trocear_tokens(["▁a", "▁b"], 5) == [["▁a", "▁b"]]

    def test_prefiere_cortar_tras_una_coma(self) -> None:
        tokens = ["▁a", "▁b", "▁c,", "▁d", "▁e", "▁f", "▁g"]
        assert trocear_tokens(tokens, 5) == [["▁a", "▁b", "▁c,"], ["▁d", "▁e", "▁f", "▁g"]]

    def test_sin_signos_corta_al_comienzo_de_una_palabra(self) -> None:
        tokens = ["▁ab", "c", "▁de", "f", "g", "▁h"]
        assert trocear_tokens(tokens, 4) == [["▁ab", "c"], ["▁de", "f", "g", "▁h"]]

    def test_sin_palabras_corta_a_lo_bruto_sin_perder_piezas(self) -> None:
        tokens = ["x"] * 11
        trozos = trocear_tokens(tokens, 4)
        assert [len(t) for t in trozos] == [4, 4, 3]
        assert [t for trozo in trozos for t in trozo] == tokens

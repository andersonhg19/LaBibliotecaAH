"""Recorte del silencio de cada frase al ensamblar (pausas raras entre frases, 2026-11-12)."""

from __future__ import annotations

import array

from app.voz import audio
from app.voz.capitulo import MARGEN_ANTES, MARGEN_DESPUES, recortar_silencio

F = audio.FRECUENCIA


def _pcm(silencio_antes: float, voz: float, silencio_despues: float) -> bytes:
    m = array.array("h", [0] * round(silencio_antes * F))
    m.extend(3000 if i % 2 else -3000 for i in range(round(voz * F)))
    m.extend([0] * round(silencio_despues * F))
    return m.tobytes()


def _dur(datos: bytes) -> float:
    return len(datos) / audio.BYTES_POR_MUESTRA / F


def test_quita_el_silencio_de_delante_y_de_detras_con_margen():
    datos, quitado = recortar_silencio(_pcm(0.1, 1.0, 0.9), [])
    assert abs(quitado - (0.1 - MARGEN_ANTES)) < 0.011
    assert abs(_dur(datos) - (1.0 + MARGEN_ANTES + MARGEN_DESPUES)) < 0.021


def test_nunca_corta_dentro_de_una_palabra():
    # la última palabra (según edge-tts) termina en 1,5 s aunque suene bajito: se respeta
    datos, quitado = recortar_silencio(_pcm(0.1, 1.0, 0.9), [("hola", 0.1, 0.5), ("adiós", 0.6, 1.5)])
    assert _dur(datos) + quitado >= 1.5


def test_todo_silencio_o_vacio_queda_igual():
    silencio = _pcm(0.5, 0, 0)
    assert recortar_silencio(silencio, []) == (silencio, 0.0)
    assert recortar_silencio(b"", []) == (b"", 0.0)


def test_sin_silencio_no_cambia():
    voz = _pcm(0, 0.5, 0)
    datos, quitado = recortar_silencio(voz, [])
    assert quitado == 0.0 and datos == voz

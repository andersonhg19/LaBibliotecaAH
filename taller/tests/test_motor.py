import asyncio
import sys
import types

import pytest

from app.dominio.modelo import ErrorDefinitivo, ErrorReintentable
from app.voz import motor as M
from app.voz import muestras


def edge_falso(monkeypatch, fallos_antes=0, sin_audio=False):
    estado = {"llamadas": 0}

    class Communicate:
        def __init__(self, texto, voz, boundary=None):
            assert boundary == "WordBoundary"
            self.texto = texto

        async def stream(self):
            estado["llamadas"] += 1
            if estado["llamadas"] <= fallos_antes:
                raise ConnectionError("403 Forbidden")
            if not sin_audio:
                yield {"type": "audio", "data": b"ID3mp3"}
            yield {"type": "WordBoundary", "offset": 1_000_000, "duration": 2_000_000, "text": "Hola"}

    mod = types.ModuleType("edge_tts")
    mod.Communicate = Communicate
    monkeypatch.setitem(sys.modules, "edge_tts", mod)
    return estado


def test_edge_reintenta_con_espera_y_devuelve_palabras(monkeypatch):
    estado = edge_falso(monkeypatch, fallos_antes=2)
    m = M.EdgeTts(concurrencia=2, reintentos=4, pausa_base=0.001)
    s = asyncio.run(m.sintetizar("Hola", "es-ES-AlvaroNeural"))
    assert estado["llamadas"] == 3
    assert s.audio == b"ID3mp3" and s.palabras == [("Hola", 0.1, pytest.approx(0.3))]


def test_edge_agota_reintentos_con_mensaje_claro(monkeypatch):
    edge_falso(monkeypatch, sin_audio=True)
    m = M.EdgeTts(reintentos=2, pausa_base=0.001)
    with pytest.raises(ErrorReintentable, match="El servicio de voz no respondió"):
        asyncio.run(m.sintetizar("Hola", "x"))


def test_piper_aun_no_disponible():
    m, voz = M.motor_para("piper.es_ES-davefx")
    assert voz == "es_ES-davefx"
    with pytest.raises(ErrorDefinitivo, match="Piper"):
        asyncio.run(m.sintetizar("Hola", voz))
    with pytest.raises(ValueError):
        M.motor_para("edge")


def test_muestras_se_generan_una_vez_y_fallos_solo_se_registran(monkeypatch, tmp_path):
    estado = edge_falso(monkeypatch)
    assert muestras.generar_muestras(tmp_path) == 9
    assert sorted(p.name for p in tmp_path.iterdir())[0] == "edge.es-AR-TomasNeural.mp3"
    assert muestras.generar_muestras(tmp_path) == 0  # ya existen
    assert estado["llamadas"] == 9
    (tmp_path / "edge.es-ES-AlvaroNeural.mp3").unlink()
    edge_falso(monkeypatch, sin_audio=True)
    monkeypatch.setattr(muestras, "EdgeTts", lambda **k: M.EdgeTts(concurrencia=1, reintentos=1, pausa_base=0))
    assert muestras.generar_muestras(tmp_path) == 0
    assert not (tmp_path / "edge.es-ES-AlvaroNeural.mp3").exists()

import asyncio
import json
import subprocess

import pytest

from app.config.rutas import Rutas
from app.voz import audio
from app.voz.alineacion import alinear_palabras
from app.voz.capitulo import PAUSA_FRASE, PAUSA_PARRAFO, PAUSA_TITULO, FraseSintetizada, ensamblar, generar_capitulo
from app.voz.motor import Sintesis, motor_para
from tests.conftest import hay_ffmpeg

# ------------------------------------------------------------------ alineación


def test_alineacion_directa():
    visual = "Hola mundo, qué tal."
    habladas = [("Hola", 0.1, 0.4), ("mundo", 0.45, 0.8), ("qué", 0.9, 1.0), ("tal", 1.05, 1.3)]
    p = alinear_palabras(visual, visual, habladas, desplazamiento=10)
    assert p == [[0, 4, 10.1, 10.4], [5, 10, 10.45, 10.8], [12, 15, 10.9, 11.0], [16, 19, 11.05, 11.3]]
    assert [visual[a:b] for a, b, *_ in p] == ["Hola", "mundo", "qué", "tal"]


def test_alineacion_con_expansiones():
    visual = "Capítulo IV del Sr. Pérez en EE. UU."
    voz = "Capítulo cuatro del señor Pérez en Estados Unidos."
    habladas = [
        ("Capítulo", 0, 0.5),
        ("cuatro", 0.5, 0.9),
        ("del", 1, 1.1),
        ("señor", 1.1, 1.4),
        ("Pérez", 1.4, 1.8),
        ("en", 1.8, 1.9),
        ("Estados", 2, 2.4),
        ("Unidos", 2.4, 2.8),
    ]
    p = alinear_palabras(visual, voz, habladas)
    vistos = [visual[a:b] for a, b, *_ in p]
    assert vistos[:5] == ["Capítulo", "IV", "del", "Sr", "Pérez"]
    assert vistos[-1] in ("EE. UU", "UU", "EE")
    assert p[-1][3] == 2.8  # "Estados Unidos" fusionado hasta el final
    assert all(p[i][0] >= p[i - 1][1] for i in range(1, len(p)))


def test_alineacion_desajuste_devuelve_vacio():
    assert alinear_palabras("Hola mundo.", "Hola mundo.", [("xyz", 0, 1), ("abc", 1, 2)]) == []
    assert alinear_palabras("Hola.", "Hola.", []) == []


# ------------------------------------------------------------------ ensamblado (con PCM falso, sin ffmpeg)


def test_ensamblar_tiempos_exactos(tmp_path):
    frases = [
        {"id": "c000-s00000", "texto": "Capítulo I", "voz": "Capítulo uno", "esTitulo": True, "finParrafo": True},
        {"id": "c000-s00001", "texto": "Uno dos.", "voz": "Uno dos.", "finParrafo": False},
        {"id": "c000-s00002", "texto": "* * *", "voz": ""},
        {"id": "c000-s00003", "texto": "Tres.", "voz": "Tres.", "finParrafo": True},
    ]
    duraciones = {"c000-s00000": 1.0, "c000-s00001": 2.0, "c000-s00003": 0.5}
    sint = {
        fid: FraseSintetizada(
            tmp_path / f"{fid}.mp3", [("Uno", 0.1, 0.5), ("dos", 0.6, 1.0)] if fid == "c000-s00001" else []
        )
        for fid in duraciones
    }

    def decodificar_falso(ruta):
        return audio.silencio(duraciones[ruta.stem])

    t = ensamblar(frases, sint, tmp_path / "x.raw", decodificar_falso, capitulo=0, voz_id="edge.x")
    f = {x["id"]: x for x in t["frases"]}
    assert f["c000-s00000"]["t0"] == 0 and f["c000-s00000"]["t1"] == 1.0
    assert f["c000-s00001"]["t0"] == pytest.approx(1.0 + PAUSA_TITULO)
    assert f["c000-s00001"]["t1"] == pytest.approx(3.0 + PAUSA_TITULO)
    assert f["c000-s00002"]["t0"] == f["c000-s00002"]["t1"] == pytest.approx(3.0 + PAUSA_TITULO + PAUSA_FRASE)
    assert f["c000-s00003"]["t0"] == pytest.approx(3.0 + PAUSA_TITULO + PAUSA_FRASE)
    assert t["duracion"] == pytest.approx(3.5 + PAUSA_TITULO + PAUSA_FRASE)  # sin pausa tras la última
    assert f["c000-s00001"]["palabras"] == [
        [0, 3, pytest.approx(1.8), pytest.approx(2.2)],
        [4, 7, pytest.approx(2.3), pytest.approx(2.7)],
    ]
    assert (tmp_path / "x.raw").stat().st_size == round(t["duracion"] * audio.FRECUENCIA) * 2
    assert PAUSA_PARRAFO > PAUSA_FRASE


# ------------------------------------------------------------------ capítulo completo con motor falso + ffmpeg


class MotorFalso:
    nombre = "falso"
    version = "falso/1"

    def __init__(self):
        self.llamadas = 0

    async def sintetizar(self, texto, voz):
        self.llamadas += 1
        seg = 0.2 + 0.05 * len(texto.split())
        mp3 = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency=440:duration={seg}",
                "-ac",
                "1",
                "-ar",
                "24000",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "48k",
                "-f",
                "mp3",
                "pipe:1",
            ],
            capture_output=True,
            check=True,
        ).stdout
        palabras = []
        t = 0.0
        for w in texto.split():
            palabras.append((w.strip(".,¿?"), t, t + 0.04))
            t += 0.05
        return Sintesis(mp3, "mp3", palabras)


@hay_ffmpeg
def test_generar_capitulo_con_motor_falso(tmp_path):
    rutas = Rutas(tmp_path)
    aid = "aaaaaaaa-0000-0000-0000-000000000001"
    ruta = rutas.frases(aid, 0)
    ruta.parent.mkdir(parents=True)
    frases = [
        {
            "id": f"c000-s{i:05d}",
            "texto": f"Frase número {i}.",
            "voz": f"Frase número {i}.",
            "finParrafo": i % 2 == 1,
            "esTitulo": False,
        }
        for i in range(6)
    ]
    frases.append({"id": "c000-s00006", "texto": "Frase número 0.", "voz": "Frase número 0.", "finParrafo": True})
    ruta.write_text(json.dumps({"capitulo": 0, "frases": frases}), encoding="utf-8")
    motor = MotorFalso()
    dur = asyncio.run(generar_capitulo(rutas, aid, "edge.prueba", 0, motor, "prueba"))
    assert motor.llamadas == 6  # la frase repetida sale de la misma síntesis
    d = rutas.audio(aid, "edge.prueba")
    m4a, m4a2, tiempos = d / "cap-000.m4a", d / "cap-000-2x.m4a", d / "cap-000.tiempos.json"
    assert m4a.exists() and m4a2.exists() and tiempos.exists()
    t = json.loads(tiempos.read_text(encoding="utf-8"))
    assert t["duracion"] == pytest.approx(dur)
    assert audio.duracion(m4a) == pytest.approx(dur, abs=0.08)
    assert audio.duracion(m4a2) == pytest.approx(dur / 2, abs=0.08)
    ts = t["frases"]
    assert all(ts[i]["t0"] >= ts[i - 1]["t1"] for i in range(1, len(ts)))
    assert all(f["palabras"] for f in ts)
    # códec: AAC-LC mono
    info = json.loads(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(m4a)], capture_output=True, check=True
        ).stdout
    )["streams"][0]
    assert info["codec_name"] == "aac" and info["channels"] == 1 and info.get("profile") == "LC"
    # caché: segunda pasada no llama al motor
    motor2 = MotorFalso()
    asyncio.run(generar_capitulo(rutas, aid, "edge.prueba", 0, motor2, "prueba"))
    assert motor2.llamadas == 0
    assert len(list((tmp_path / "cache-voz").glob("*.mp3"))) == 6


def test_motor_para():
    m, voz = motor_para("edge.es-ES-AlvaroNeural")
    assert m.nombre == "edge" and voz == "es-ES-AlvaroNeural"
    with pytest.raises(ValueError):
        motor_para("desconocido.x")


@pytest.mark.red
@hay_ffmpeg
def test_edge_tts_real(tmp_path):
    from app.voz.motor import EdgeTts

    s = asyncio.run(EdgeTts().sintetizar("Hola, esta es la biblioteca.", "es-ES-AlvaroNeural"))
    assert len(s.audio) > 1000
    assert [w for w, *_ in s.palabras][:2] == ["Hola", "esta"]
    p = tmp_path / "x.mp3"
    p.write_bytes(s.audio)
    assert 1.0 < audio.duracion(p) < 5.0

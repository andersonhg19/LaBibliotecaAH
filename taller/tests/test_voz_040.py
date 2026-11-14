"""Voz 0.4.0: robustez (A1–A7), pausas y silencios internos (B8, B9), volumen y 2x desde el PCM (B10, B11),
tiempos y envolvente (B12, C7), voz multilingüe (A3, B13) y diccionario (B17). Casos de CASOS.md."""

import array
import asyncio
import json
import subprocess

import pytest

from app.config.rutas import Rutas
from app.dominio.modelo import ErrorReintentable
from app.dominio.voces import genero_de
from app.voz import audio, volumen
from app.voz import capitulo as cap
from app.voz.capitulo import (
    PAUSA_FRASE,
    PAUSA_PARRAFO,
    PAUSA_TITULO,
    SILENCIO_INICIO,
    SILENCIO_INTERNO_MAX,
    Ensamblador,
    FraseSintetizada,
    clave_cache,
    compactar_internos,
    generar_capitulo,
)
from app.voz.motor import FraseSinAudio, Sintesis, audio_truncado
from tests.conftest import hay_ffmpeg
from tests.test_voz import MotorFalso

AID = "aaaaaaaa-0000-0000-0000-000000000040"
F = audio.FRECUENCIA


def preparar(rutas: Rutas, frases: list[dict], idioma: str | None = "es") -> None:
    ruta = rutas.frases(AID, 0)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps({"capitulo": 0, "frases": frases}), encoding="utf-8")
    (rutas.normalizados(AID) / "estructura.json").write_text(json.dumps({"idioma": idioma}), encoding="utf-8")


def frase(i: int, voz: str, texto: str | None = None, **k) -> dict:
    return {"id": f"c000-s{i:05d}", "texto": texto or voz, "voz": voz, "finParrafo": False, "esTitulo": False, **k}


class MotorRegistro(MotorFalso):
    """Motor falso que apunta qué texto y qué voz se le piden; `mudas` = textos que no dan audio."""

    def __init__(self, mudas=(), mudas_voz=()):
        super().__init__()
        self.pedidas: list[tuple[str, str]] = []
        self.mudas = set(mudas)
        self.mudas_voz = set(mudas_voz)

    async def sintetizar(self, texto, voz):
        self.pedidas.append((texto, voz))
        if texto in self.mudas or voz in self.mudas_voz:
            raise FraseSinAudio(cap.Msj.SERVICIO_VOZ_CAIDO, detalle="No audio was received")
        return await super().sintetizar(texto, voz)


# ------------------------------------------------------------------ A1, A2: audio truncado


def test_audio_truncado_por_bytes():
    palabras = [("Hola", 0.1, 0.5), ("mundo", 0.6, 4.04)]
    assert audio_truncado(1440, palabras)  # el caso de la auditoría: 0,24 s de MP3 y la última palabra a 4,04 s
    assert not audio_truncado(6000 * 4, palabras)
    assert not audio_truncado(10, [])


@hay_ffmpeg
def test_cache_truncada_se_descarta_y_se_regenera(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, [frase(0, "Una frase que se cortó en la caché.")])
    dir_cache = rutas.cache_voz()
    dir_cache.mkdir(parents=True)
    clave = clave_cache("Una frase que se cortó en la caché.", "edge.prueba", MotorFalso.version)
    (dir_cache / f"{clave}.mp3").write_bytes(b"\xff" * 1440)
    (dir_cache / f"{clave}.json").write_text(json.dumps({"palabras": [["Una", 0.0, 4.04]]}), encoding="utf-8")
    motor = MotorFalso()
    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))
    assert motor.llamadas == 1  # se volvió a pedir
    assert (dir_cache / f"{clave}.mp3").stat().st_size > 1440


def test_edge_truncado_reintenta_y_nunca_se_guarda(monkeypatch):
    import sys
    import types

    from app.voz import motor as M

    llamadas = {"n": 0}

    class Communicate:
        def __init__(self, texto, voz, boundary=None):
            pass

        async def stream(self):
            llamadas["n"] += 1
            yield {"type": "audio", "data": b"\xff" * (1440 if llamadas["n"] < 3 else 30000)}
            yield {"type": "WordBoundary", "offset": 0, "duration": 40_400_000, "text": "Hola"}

    mod = types.ModuleType("edge_tts")
    mod.Communicate = Communicate
    monkeypatch.setitem(sys.modules, "edge_tts", mod)
    s = asyncio.run(M.EdgeTts(reintentos=5, pausa_base=0.001).sintetizar("Hola", "x"))
    assert llamadas["n"] == 3 and len(s.audio) == 30000
    llamadas["n"] = -10  # siempre truncado \u2192 FraseSinAudio tras los reintentos «sin audio»
    with pytest.raises(FraseSinAudio):
        asyncio.run(M.EdgeTts(reintentos=5, pausa_base=0.001, reintentos_sin_audio=2).sintetizar("Hola", "x"))


# ------------------------------------------------------------------ A3, A4, A5: frases que la voz no sabe leer


@hay_ffmpeg
def test_frase_no_latina_va_a_la_voz_multilingue_y_el_capitulo_sale(tmp_path):
    rutas = Rutas(tmp_path)
    frases = [frase(0, "Empieza el epígrafe."), frase(1, "γνῶθι σεαυτόν"), frase(2, "Москва — столица России.")]
    frases += [frase(3, "ª"), frase(4, "Ⅳ"), frase(5, "Y sigue el capítulo.")]
    preparar(rutas, frases)
    motor = MotorRegistro()
    dur = asyncio.run(generar_capitulo(rutas, AID, "edge.es-ES-ElviraNeural", 0, motor, "es-ES-ElviraNeural"))
    assert dur > 0
    voces = dict(motor.pedidas)
    assert voces["γνῶθι σεαυτόν"] == "en-US-AvaMultilingualNeural"  # Elvira es voz femenina
    assert voces["cuatro"] == "es-ES-ElviraNeural"
    assert "ª" not in voces  # «ª» suelta no se pide: sería «No audio» y tumbaría el capítulo
    t = json.loads((rutas.audio(AID, "edge.es-ES-ElviraNeural") / "cap-000.tiempos.json").read_text("utf-8"))
    por_id = {x["id"]: x for x in t["frases"]}
    assert por_id["c000-s00001"]["t1"] > por_id["c000-s00001"]["t0"]  # suena
    assert por_id["c000-s00003"]["t1"] == por_id["c000-s00003"]["t0"]  # muda


@hay_ffmpeg
def test_frase_que_el_servicio_rechaza_queda_muda_y_el_capitulo_esta_listo(tmp_path, caplog):
    rutas = Rutas(tmp_path)
    preparar(rutas, [frase(0, "Primera frase."), frase(1, "Frase rara."), frase(2, "Tercera frase.")])
    motor = MotorRegistro(mudas={"Frase rara."})
    with caplog.at_level("WARNING"):
        asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))
    t = json.loads((rutas.audio(AID, "edge.prueba") / "cap-000.tiempos.json").read_text("utf-8"))
    muda = t["frases"][1]
    assert muda["t0"] == muda["t1"] and muda["palabras"] == []
    assert "quedaron en silencio" in caplog.text
    assert not list(rutas.cache_voz().glob("*.tmp"))


@hay_ffmpeg
def test_multilingue_que_falla_cae_a_la_voz_propia(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, [frase(0, "Dijo: alea iacta est, ad hoc."), frase(1, "Y se fue.")])
    motor = MotorRegistro(mudas_voz={"en-US-AndrewMultilingualNeural"})
    asyncio.run(generar_capitulo(rutas, AID, "edge.es-ES-AlvaroNeural", 0, motor, "es-ES-AlvaroNeural"))
    assert ("Dijo: alea iacta est, ad hoc.", "en-US-AndrewMultilingualNeural") in motor.pedidas
    assert ("Dijo: alea iacta est, ad hoc.", "es-ES-AlvaroNeural") in motor.pedidas


@hay_ffmpeg
def test_muchas_frases_mudas_es_el_servicio_y_se_reintenta(tmp_path):
    rutas = Rutas(tmp_path)
    frases = [frase(i, f"Frase número {i} del capítulo.") for i in range(10)]
    preparar(rutas, frases)
    motor = MotorRegistro(mudas={f["voz"] for f in frases[:6]})
    with pytest.raises(ErrorReintentable):
        asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))


@hay_ffmpeg
def test_ultima_frase_muda_cierra_la_parte(tmp_path):
    rutas = Rutas(tmp_path)
    frases = [frase(i, f"Frase número {i} del capítulo.") for i in range(5)]
    preparar(rutas, frases)
    motor = MotorRegistro(mudas={frases[-1]["voz"]})
    dur = asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))
    m = json.loads((rutas.audio(AID, "edge.prueba") / "cap-000.partes.json").read_text("utf-8"))
    assert m["completo"] and m["partes"][-1]["t1"] == pytest.approx(dur, abs=1e-3)


def test_emojis_no_se_leen_y_el_resaltado_sigue(tmp_path):
    frases = [frase(0, "Estaba feliz 😀 hoy.")]
    sint = FraseSintetizada(
        tmp_path / "x.mp3",
        [("Estaba", 0.1, 0.4), ("feliz", 0.5, 0.8), ("hoy", 0.9, 1.1)],
        cap.preparar_lectura("Estaba feliz 😀 hoy."),
    )
    assert sint.lectura is not None and "😀" not in sint.lectura.texto
    with open(tmp_path / "x.raw", "wb") as pcm:
        e = Ensamblador(frases, pcm, {"c000-s00000"})
        e.agregar(0, sint, audio.silencio(1.2))
        t = e.terminar(0, "v")
    visual = frases[0]["texto"]
    assert [visual[a:b] for a, b, *_ in t["frases"][0]["palabras"]] == ["Estaba", "feliz", "hoy"]


def test_capitulo_vacio_un_segundo(tmp_path):
    with open(tmp_path / "x.raw", "wb") as pcm:
        e = Ensamblador([frase(0, "")], pcm, set(), partes=True)
        e.agregar(0, None, None)
        assert e.terminar(0, "v")["duracion"] == 1.0


# ------------------------------------------------------------------ B8, B9: silencios y pausas


def _voz(seg: float) -> array.array:
    return array.array("h", (3000 if i % 2 else -3000 for i in range(round(seg * F))))


def test_compactar_silencio_interno_de_dialogo():
    m = _voz(0.5)
    m.extend([0] * round(0.86 * F))  # «¿Vienes?» + 0,86 s de edge
    m.extend(_voz(0.6))
    palabras = [("Vienes", 0.0, 0.5), ("preguntó", 1.36, 1.96)]
    datos, nuevas = compactar_internos(m.tobytes(), palabras)
    assert len(datos) / 2 / F == pytest.approx(0.5 + SILENCIO_INTERNO_MAX + 0.6, abs=2e-3)
    assert nuevas[1][1] - nuevas[0][2] == pytest.approx(SILENCIO_INTERNO_MAX, abs=2e-3)


def test_no_compacta_si_hay_sonido_o_el_hueco_es_corto():
    m = _voz(0.5)
    m.extend(_voz(0.86))  # «silencio» que suena (respiración): no se toca
    m.extend(_voz(0.6))
    palabras = [("a", 0.0, 0.5), ("b", 1.36, 1.96)]
    assert compactar_internos(m.tobytes(), palabras) == (m.tobytes(), palabras)
    corto = [("a", 0.0, 0.5), ("b", 0.8, 1.0)]
    assert compactar_internos(m.tobytes(), corto)[1] == corto


def test_jerarquia_de_pausas_y_respiro_inicial(tmp_path):
    frases = [
        frase(0, "Capítulo uno", esTitulo=True),
        frase(1, "Primera."),
        frase(2, "Fin de párrafo.", finParrafo=True),
        frase(3, "Otro párrafo."),
        frase(4, "Subtítulo", esTitulo=True),
        frase(5, "Final."),
    ]
    sint = {f["id"]: FraseSintetizada(tmp_path / f"{f['id']}.mp3", []) for f in frases}
    with open(tmp_path / "x.raw", "wb") as pcm:
        e = Ensamblador(frases, pcm, set(sint))
        for k, f in enumerate(frases):
            e.agregar(k, sint[f["id"]], _voz(1.0).tobytes())
        t = e.terminar(0, "v")["frases"]
    huecos = [round(t[k]["t0"] - t[k - 1]["t1"], 3) for k in range(1, len(t))]
    assert t[0]["t0"] == pytest.approx(SILENCIO_INICIO)
    assert huecos == [PAUSA_TITULO, PAUSA_FRASE, PAUSA_PARRAFO, cap.PAUSA_ANTES_TITULO, PAUSA_TITULO]
    constantes = [PAUSA_FRASE, PAUSA_PARRAFO, PAUSA_TITULO, SILENCIO_INICIO]
    assert constantes == pytest.approx([0.35, 0.70, 1.0, 0.4])


# ------------------------------------------------------------------ B10, B11, C7: volumen, 2x y envolvente


@hay_ffmpeg
def test_tiempos_llevan_version_y_envolvente_y_2x_desde_pcm(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, [frase(i, f"Frase número {i} del capítulo.") for i in range(6)])
    dur = asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, MotorFalso(), "prueba"))
    d = rutas.audio(AID, "edge.prueba")
    t = json.loads((d / "cap-000.tiempos.json").read_text("utf-8"))
    assert t["versionAudio"] == 2
    env = t["envolvente"]
    assert env["hz"] == 10 and len(env["v"]) == pytest.approx(dur * 10, abs=1)
    assert all(isinstance(v, int) and 0 <= v <= 100 for v in env["v"]) and max(env["v"]) == 100
    assert env["v"][0] == 0  # el respiro inicial es silencio
    assert audio.duracion(d / "cap-000-2x.m4a") == pytest.approx(dur / 2, abs=0.06)


@hay_ffmpeg
def test_volumen_objetivo_y_pico(tmp_path):
    # 30 s de «voz» sintética bajita (≈ −24 LUFS) con chasquidos fuertes: la ganancia la sube a −18 y el limitador
    # frena los picos para que no pasen de −1,5 dBTP
    raw = tmp_path / "x.raw"
    senal = r"aevalsrc=0.1*sin(2*PI*300*t)+0.5*lt(mod(t\,1)\,0.003):s=24000:d=30"
    subprocess.run(
        [
            *("ffmpeg", "-v", "error", "-f", "lavfi", "-i", senal),
            *("-f", "s16le", "-ar", str(F), "-ac", "1", str(raw)),
        ],
        check=True,
    )
    assert audio.medir_lufs(raw) < -21
    g = volumen.ajustar(raw, 30.0, tmp_path / "cache", "edge.nueva", 3.0)
    assert audio.medir_lufs(raw, g) == pytest.approx(-18.0, abs=0.5)
    uno, dos = tmp_path / "a.m4a", tmp_path / "b.m4a"
    audio.codificar_1x_y_2x(raw, uno, dos, g)
    for m4a in (uno, dos):
        r = subprocess.run(
            ["ffmpeg", "-nostats", "-i", str(m4a), "-af", "ebur128=peak=true", "-f", "null", "-"],
            capture_output=True,
            text=True,
        )
        resumen = r.stderr[r.stderr.rindex("Summary") :]
        lufs = float(resumen.split("I:")[1].split("LUFS")[0])
        pico = float(resumen.split("Peak:")[1].split("dBFS")[0])
        assert lufs == pytest.approx(-18.0, abs=1.0) and pico <= -1.5
    assert audio.duracion(dos) / audio.duracion(uno) == pytest.approx(0.5, abs=0.005)
    # la calibración queda guardada para la próxima vez
    assert volumen.ganancia(tmp_path / "cache", "edge.nueva") != 3.0


def test_ganancia_inicial_por_voz(tmp_path):
    assert volumen.ganancia(tmp_path, "edge.es-CO-GonzaloNeural") == 4.8
    assert volumen.ganancia(tmp_path, "edge.desconocida") == volumen.GANANCIA_POR_DEFECTO
    assert volumen.ajustar(tmp_path / "no-existe.raw", 5.0, tmp_path, "v", 2.0) == 2.0  # corto: no se mide
    assert volumen.ajustar(tmp_path / "no-existe.raw", 60.0, tmp_path, "v", 2.0) == 2.0  # sin audio: se queda


def test_envolvente_normalizada(tmp_path):
    raw = tmp_path / "x.raw"
    m = array.array("h", [0] * (F // 10))
    m.extend(_voz(0.1))
    m.extend(array.array("h", (300 if i % 2 else -300 for i in range(F // 10))))
    raw.write_bytes(m.tobytes())
    assert audio.envolvente(raw) == [0, 100, 67]
    vacio = tmp_path / "v.raw"
    vacio.write_bytes(b"")
    assert audio.envolvente(vacio) == []


# ------------------------------------------------------------------ B12, B17: resaltado y diccionario


@hay_ffmpeg
def test_resaltado_de_numero_normalizado_y_diccionario(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, [frase(0, "Hermione vio 1.250 casas.")])
    motor = MotorRegistro()
    asyncio.run(
        generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba", pronunciacion=[("Hermione", "Jermáyoni")])
    )
    assert motor.pedidas[0][0] == "Jermáyoni vio mil doscientas cincuenta casas."
    t = json.loads((rutas.audio(AID, "edge.prueba") / "cap-000.tiempos.json").read_text("utf-8"))
    visual = "Hermione vio 1.250 casas."
    vistos = [visual[a:b] for a, b, *_ in t["frases"][0]["palabras"]]
    assert vistos == ["Hermione", "vio", "1.250", "casas"]


def test_genero_de_voz():
    assert genero_de("edge.es-ES-ElviraNeural") == "F"
    assert genero_de("edge.es-ES-AlvaroNeural") == "M"
    assert genero_de("edge.otra") == "M"


def test_sintesis_conserva_palabras():
    assert Sintesis(b"x", "mp3", [("a", 0, 1)]).palabras == [("a", 0, 1)]

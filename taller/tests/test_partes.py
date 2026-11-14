"""Síntesis progresiva por partes (contratos v1.5 §6 bis) y cola con hilo de voz reservado."""

import asyncio
import json
import os
import threading
import time

import pytest

from app.cola import repositorio as R
from app.cola.trabajador import Manejador, ManejadorVoz, Trabajador
from app.config.rutas import Rutas
from app.dominio.modelo import ErrorReintentable
from app.voz import audio
from app.voz import capitulo as cap
from app.voz.capitulo import (
    Ensamblador,
    FraseSintetizada,
    ensamblar,
    generar_capitulo,
    limpiar_partes_viejas,
    tamano_parte,
)
from app.voz.motor import EdgeTts
from tests.conftest import hay_ffmpeg
from tests.test_repositorio_unidad import repo  # noqa: F401  (fixture)
from tests.test_voz import MotorFalso

AID = "aaaaaaaa-0000-0000-0000-0000000000aa"


def frases_de(n: int, silenciosa: int | None = None) -> list[dict]:
    fs = []
    for i in range(n):
        voz = "" if i == silenciosa else f"Frase número {i} del capítulo."
        fs.append(
            {
                "id": f"c000-s{i:05d}",
                "texto": f"Frase número {i}.",
                "voz": voz,
                "finParrafo": i % 4 == 3,
                "esTitulo": i == 0,
            }
        )
    return fs


def preparar(rutas: Rutas, frases: list[dict]) -> None:
    ruta = rutas.frases(AID, 0)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps({"capitulo": 0, "frases": frases}), encoding="utf-8")


# ------------------------------------------------------------------ ensamblador


def test_tamanos_de_parte_crecen():
    assert [tamano_parte(n) for n in range(4)] == [3, 12, 60, 60]


def test_las_partes_cubren_el_capitulo_sin_cambiar_los_tiempos(tmp_path):
    frases = frases_de(20, silenciosa=5)
    dur = {f["id"]: 0.5 + 0.01 * k for k, f in enumerate(frases)}
    sint = {f["id"]: FraseSintetizada(tmp_path / f"{f['id']}.mp3", []) for f in frases if f["voz"]}

    def deco(ruta):
        return audio.silencio(dur[ruta.stem])

    sin_partes = ensamblar(frases, sint, tmp_path / "a.raw", deco, 0, "edge.x")
    with open(tmp_path / "b.raw", "wb") as pcm:
        e = Ensamblador(frases, pcm, set(sint), partes=True)
        cerradas = []
        for k, f in enumerate(frases):
            s = sint.get(f["id"])
            p = e.agregar(k, s, deco(s.ruta_mp3) + b"\x00" if s else None)  # un byte suelto se descarta
            if p is not None:
                cerradas.append((p.n, p.t0, p.t1, len(p.pcm), len(e.salida)))
        con_partes = e.terminar(0, "edge.x")
    assert con_partes == sin_partes
    # 19 frases con voz → partes de 3, 12 y 4
    assert [c[0] for c in cerradas] == [0, 1, 2]
    assert [c[4] for c in cerradas] == [3, 16, 20]
    ts = {f["id"]: f for f in sin_partes["frases"]}
    assert cerradas[0][1] == 0 and cerradas[0][2] == pytest.approx(ts["c000-s00002"]["t1"], abs=1e-3)
    assert cerradas[1][1] == pytest.approx(ts["c000-s00003"]["t0"], abs=1e-3)  # tras la pausa
    assert cerradas[2][2] == pytest.approx(sin_partes["duracion"], abs=1e-3)  # la última sin pausa final
    for _n, t0, t1, n_bytes, _ in cerradas:  # el PCM de cada parte dura exactamente t1 - t0
        assert n_bytes / 2 / audio.FRECUENCIA == pytest.approx(t1 - t0, abs=1e-3)


def test_un_capitulo_sin_voz_no_tiene_partes(tmp_path):
    frases = [{"id": "c000-s00000", "texto": "* * *", "voz": ""}]
    with open(tmp_path / "x.raw", "wb") as pcm:
        e = Ensamblador(frases, pcm, set(), partes=True)
        assert e.agregar(0, None, None) is None and e.parte is None
        assert e.terminar(0, "v")["duracion"] == 1.0


# ------------------------------------------------------------------ capítulo completo


@hay_ffmpeg
def test_generar_capitulo_escribe_partes_y_manifiesto_coherentes(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(18))
    dur = asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, MotorFalso(), "prueba"))
    d = rutas.audio(AID, "edge.prueba")
    m = json.loads((d / "cap-000.partes.json").read_text(encoding="utf-8"))
    t = json.loads((d / "cap-000.tiempos.json").read_text(encoding="utf-8"))
    assert m["completo"] is True and m["duracionEstimada"] == pytest.approx(dur)
    assert m["versionFormato"] == 1 and m["capitulo"] == 0 and m["vozId"] == "edge.prueba"
    assert [p["archivo"] for p in m["partes"]] == [f"cap-000.parte-00{n}.m4a" for n in range(3)]
    assert m["frases"] == t["frases"]
    for p in m["partes"]:
        assert audio.duracion(d / p["archivo"]) == pytest.approx(p["t1"] - p["t0"], abs=0.08)
    assert m["partes"][-1]["t1"] == pytest.approx(dur, abs=1e-3)


@hay_ffmpeg
def test_sin_partes_si_se_piden_asi(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(5))
    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, MotorFalso(), "prueba", partes=False))
    d = rutas.audio(AID, "edge.prueba")
    assert (d / "cap-000.m4a").exists() and not list(d.glob("*.parte-*")) and not (d / "cap-000.partes.json").exists()


class MotorQueEspera(MotorFalso):
    """Las frases a partir de la 4.ª esperan a una señal: la primera parte debe salir antes."""

    def __init__(self):
        super().__init__()
        self.seguir = threading.Event()

    async def sintetizar(self, texto, voz):
        if not any(f"número {i} " in texto for i in range(3)):
            while not self.seguir.is_set():
                await asyncio.sleep(0.01)
        return await super().sintetizar(texto, voz)


@hay_ffmpeg
def test_la_primera_parte_suena_antes_de_terminar_el_capitulo(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(10))
    motor = MotorQueEspera()
    manifiesto = rutas.audio(AID, "edge.prueba") / "cap-000.partes.json"
    visto: dict = {}

    def vigilar():
        fin = time.monotonic() + 30
        while time.monotonic() < fin and not manifiesto.exists():
            time.sleep(0.02)
        if manifiesto.exists():
            visto.update(json.loads(manifiesto.read_text(encoding="utf-8")))
        motor.seguir.set()

    h = threading.Thread(target=vigilar)
    h.start()
    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))
    h.join()
    assert visto["completo"] is False and len(visto["partes"]) == 1
    assert [f["id"] for f in visto["frases"]] == ["c000-s00000", "c000-s00001", "c000-s00002"]
    assert visto["duracionEstimada"] > visto["partes"][0]["t1"]  # estima el resto por los caracteres


@hay_ffmpeg
def test_un_fallo_al_escribir_una_parte_no_tumba_el_capitulo(tmp_path, monkeypatch):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(5))
    original = audio.codificar_m4a

    def codificar(raw, salida, *resto):  # (R2-2) también se llama para recodificar con ganancia y techo
        if ".parte-" in salida.name:
            raise audio.ErrorAudio(cap.Msj.ERROR_AUDIO, detalle="disco lleno")
        original(raw, salida, *resto)

    monkeypatch.setattr(audio, "codificar_m4a", codificar)
    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, MotorFalso(), "prueba"))
    d = rutas.audio(AID, "edge.prueba")
    assert (d / "cap-000.m4a").exists() and not (d / "cap-000.partes.json").exists()


def test_una_frase_que_no_sale_cancela_el_resto_y_falla_reintentable(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(30))

    class MotorRoto:
        nombre = "roto"
        version = "roto/1"

        def __init__(self):
            self.llamadas = 0

        async def sintetizar(self, texto, voz):
            self.llamadas += 1
            if "número 0 " in texto:
                raise ErrorReintentable(cap.Msj.SERVICIO_VOZ_CAIDO, detalle="403")
            await asyncio.sleep(5)
            raise AssertionError("no debería terminar")

    motor = MotorRoto()
    inicio = time.monotonic()
    with pytest.raises(ErrorReintentable):
        asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, motor, "prueba"))
    assert time.monotonic() - inicio < 4  # no espera a las demás frases


# ------------------------------------------------------------------ limpieza de partes


def test_limpiar_partes_viejas_solo_borra_las_que_no_se_tocan(tmp_path):
    rutas = Rutas(tmp_path)
    d = rutas.audio(AID, "edge.v")
    d.mkdir(parents=True)
    for n in ("cap-000.partes.json", "cap-000.parte-000.m4a", "cap-000.parte-001.m4a", "cap-000.m4a"):
        (d / n).write_bytes(b"x")
    (d / "cap-001.partes.json").write_bytes(b"x")
    (d / "cap-001.parte-000.m4a").write_bytes(b"x")
    viejo = time.time() - 3600
    os.utime(d / "cap-000.partes.json", (viejo, viejo))
    assert limpiar_partes_viejas(rutas, minutos=30) == 1
    assert sorted(p.name for p in d.iterdir()) == ["cap-000.m4a", "cap-001.parte-000.m4a", "cap-001.partes.json"]
    assert limpiar_partes_viejas(Rutas(tmp_path / "no-existe")) == 0


def test_borrar_audio_capitulo_se_lleva_tambien_las_partes(tmp_path):
    rutas = Rutas(tmp_path)
    d = rutas.audio(AID, "edge.v")
    d.mkdir(parents=True)
    for n in ("cap-000.m4a", "cap-000.partes.json", "cap-000.parte-000.m4a", "cap-001.m4a"):
        (d / n).write_bytes(b"x")
    cap.borrar_audio_capitulo(rutas, AID, "edge.v", 0)
    assert [p.name for p in d.iterdir()] == ["cap-001.m4a"]


# ------------------------------------------------------------------ cola: hilo reservado


def test_tomar_hasta_una_prioridad_filtra_en_sql(repo):  # noqa: F811
    assert repo.tomar(["VOZ_CAPITULO"], 10) == {"id": "t1"}
    sql, params = repo.conexiones[0].ejecutadas[0]
    assert sql == R.SQL_TOMAR_HASTA and params == {"tipos": ["VOZ_CAPITULO"], "prioridad_max": 10}
    assert "AND prioridad <= %(prioridad_max)s" in sql and "ORDER BY prioridad, creado" in sql


def test_el_trabajador_reservado_pide_solo_su_prioridad():
    pedidas = []
    parar = threading.Event()

    class Repo:
        def tomar(self, tipos, prioridad_max=None):
            pedidas.append((tipos, prioridad_max))
            parar.set()

        def cerrar(self):
            pass

    class M(Manejador):
        tipos = ("VOZ_CAPITULO",)

    t = Trabajador("voz-urgente", M(), Repo, 0.01, 3, parar, prioridad_max=10)
    t.run()
    assert pedidas == [(["VOZ_CAPITULO"], 10)]


# ------------------------------------------------------------------ concurrencia del capítulo que se escucha


def test_el_capitulo_pedido_se_sintetiza_con_mas_concurrencia(tmp_path):
    m = ManejadorVoz(Rutas(tmp_path), concurrencia=4, concurrencia_urgente=8, prioridad_urgente=10)
    assert m._concurrencia_de({"prioridad": 10}) == 8
    assert m._concurrencia_de({"prioridad": 20}) == 4
    assert m._concurrencia_de({}) == 4
    assert ManejadorVoz(Rutas(tmp_path))._concurrencia_de({"prioridad": 1}) == 4


def test_fijar_concurrencia_solo_afecta_al_bucle_del_trabajo():
    motor = EdgeTts(concurrencia=4)

    async def con(n):
        if n:
            motor.fijar_concurrencia(n)
        return motor._sem()._value

    assert asyncio.run(con(8)) == 8
    assert asyncio.run(con(0)) == 4


@hay_ffmpeg
def test_generar_capitulo_fija_la_concurrencia_del_motor(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(2))
    fijadas = []

    class Motor(MotorFalso):
        def fijar_concurrencia(self, n):
            fijadas.append(n)

    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, Motor(), "prueba", concurrencia=8))
    assert fijadas == [8]


# ------------------------------------------------------------------ duplicado de una frase lenta al arrancar


class MotorConColaLenta:
    """La primera petición de la frase tarda mucho; el duplicado llega enseguida (o falla)."""

    nombre = "lento"
    version = "lento/1"

    def __init__(self, falla_rapida=False, falla_lenta=False):
        self.normales = 0
        self.sin_cola = 0
        self.falla_rapida = falla_rapida
        self.falla_lenta = falla_lenta

    async def sintetizar(self, texto, voz):
        self.normales += 1
        return cap.Sintesis(b"con-cola", "mp3", [])

    async def sintetizar_sin_cola(self, texto, voz):
        self.sin_cola += 1
        if self.sin_cola == 1:  # la original: lenta
            await asyncio.sleep(0.5)
            if self.falla_lenta:
                raise ErrorReintentable(cap.Msj.SERVICIO_VOZ_CAIDO, detalle="y")
            return cap.Sintesis(b"lenta", "mp3", [])
        if self.falla_rapida:
            raise ErrorReintentable(cap.Msj.SERVICIO_VOZ_CAIDO, detalle="x")
        return cap.Sintesis(b"rapida", "mp3", [])


def test_una_frase_lenta_del_arranque_se_duplica_y_gana_la_primera(monkeypatch):
    monkeypatch.setattr(cap, "RESPALDO_SEG", 0.05)
    m = MotorConColaLenta()
    inicio = time.monotonic()
    r = asyncio.run(cap._con_respaldo(m, "Hola.", "v"))
    assert r.audio == b"rapida" and m.sin_cola == 2
    assert m.normales == 0  # el arranque no hace cola en el semáforo
    assert time.monotonic() - inicio < 0.4


def test_si_el_duplicado_falla_vale_la_original(monkeypatch):
    monkeypatch.setattr(cap, "RESPALDO_SEG", 0.05)
    r = asyncio.run(cap._con_respaldo(MotorConColaLenta(falla_rapida=True), "Hola.", "v"))
    assert r.audio == b"lenta"


def test_si_fallan_las_dos_sale_el_error(monkeypatch):
    monkeypatch.setattr(cap, "RESPALDO_SEG", 0.05)
    with pytest.raises(ErrorReintentable):
        asyncio.run(cap._con_respaldo(MotorConColaLenta(falla_rapida=True, falla_lenta=True), "Hola.", "v"))


def test_sin_respaldo_si_responde_a_tiempo_o_el_motor_no_sabe():
    assert asyncio.run(cap._con_respaldo(MotorFalso(), "Hola.", "v")).audio  # MotorFalso no tiene sin_cola
    m = MotorConColaLenta()
    assert asyncio.run(cap._con_respaldo(m, "Hola.", "v")).audio == b"lenta"  # 0.5 s < 2 s
    assert m.sin_cola == 1


def test_edge_sin_cola_no_espera_turno(monkeypatch):
    motor = EdgeTts(concurrencia=1)
    llamadas = []

    async def falso(texto, voz):
        llamadas.append(texto)
        return cap.Sintesis(b"x", "mp3", [])

    monkeypatch.setattr(motor, "_sintetizar", falso)

    async def prueba():
        async with motor._sem():  # la única plaza ocupada
            return await asyncio.wait_for(motor.sintetizar_sin_cola("a", "v"), 1)

    assert asyncio.run(prueba()).audio == b"x" and llamadas == ["a"]


# ------------------------------------------------------------------ las precargas ceden el paso al arranque


def test_una_precarga_espera_mientras_un_pedido_prepara_su_primera_parte(monkeypatch):
    monkeypatch.setattr(cap, "CEDER_MAX_SEG", 5)
    with cap.ArranqueUrgente() as a:
        assert cap.hay_arranque_urgente()

        async def precarga():
            inicio = time.monotonic()
            tarea = asyncio.ensure_future(cap.ceder_paso())
            await asyncio.sleep(0.15)
            assert not tarea.done()  # sigue esperando
            a.terminar()  # el pedido ya suena
            await tarea
            return time.monotonic() - inicio

        assert 0.15 <= asyncio.run(precarga()) < 1
        a.terminar()  # terminar dos veces no descuenta de más
    assert not cap.hay_arranque_urgente()


def test_ceder_paso_tiene_tope(monkeypatch):
    monkeypatch.setattr(cap, "CEDER_MAX_SEG", 0.1)
    with cap.ArranqueUrgente():
        inicio = time.monotonic()
        asyncio.run(cap.ceder_paso())
        assert time.monotonic() - inicio < 0.5


@hay_ffmpeg
def test_un_pedido_urgente_marca_el_arranque_hasta_su_primera_parte(tmp_path):
    rutas = Rutas(tmp_path)
    preparar(rutas, frases_de(6))
    vistos = []

    class Motor(MotorFalso):
        async def sintetizar(self, texto, voz):
            vistos.append(cap.hay_arranque_urgente())
            return await super().sintetizar(texto, voz)

    asyncio.run(generar_capitulo(rutas, AID, "edge.prueba", 0, Motor(), "prueba", urgente=True))
    assert vistos[0] is True and not cap.hay_arranque_urgente()


def test_el_manejador_sabe_que_es_urgente(tmp_path):
    m = ManejadorVoz(Rutas(tmp_path), prioridad_urgente=10)
    assert m._es_urgente({"prioridad": 10}) and not m._es_urgente({"prioridad": 20}) and not m._es_urgente({})

"""Generación del audio de un capítulo (plan-maestro §6.2, contratos.md §6 y §6 bis).

1. Lee `frases/cap-NNN.json`.
2. Sintetiza el texto `voz` de cada frase (concurrencia limitada por el motor, en orden: las primeras frases piden
   el servicio antes), con caché en `cache-voz/{sha1(voz + vozId + versionMotor)}.mp3` (+ `.json` con las palabras).
3. MIENTRAS se sintetiza, ensambla en orden: decodifica cada frase a PCM y concatena con pausas (250 ms entre
   frases, 500 ms al final de párrafo, 700 ms tras un título). Los tiempos t0/t1 salen de las muestras reales →
   exactos.
4. Síntesis progresiva (v1.5, contratos §6 bis): en cuanto están las primeras frases se escribe una PARTE
   reproducible (`cap-NNN.parte-000.m4a`, 3 frases) y el manifiesto `cap-NNN.partes.json`; luego partes más
   largas. Así la web empieza a sonar a los pocos segundos en vez de esperar al capítulo entero.
5. Al final codifica `cap-NNN.m4a` (AAC-LC mono 48 kbps, faststart), escribe `cap-NNN.tiempos.json` y crea
   `cap-NNN-2x.m4a` con atempo=2.0. Los tiempos de las partes coinciden con los del capítulo entero.
Un capítulo sin nada que leer en voz (solo separadores, QA DA-11) da un audio de 1 s de silencio (sin partes).
Si el libro se retira mientras se genera (`seguir()` devuelve False), se borra lo escrito (QA DA-28).
"""

from __future__ import annotations

import array
import asyncio
import hashlib
import json
import logging
import os
import sys
import tempfile
import threading
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO

from ..config.rutas import Rutas
from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, TrabajoCancelado
from . import audio
from .alineacion import alinear_palabras
from .motor import MotorDeVoz, Sintesis

log = logging.getLogger(__name__)

# Pausas tras cada frase. Son las ÚNICAS: el silencio que trae cada audio de edge-tts (~0,1 s delante y ~0,9 s
# detrás) se recorta al ensamblar (`recortar_silencio`); sin ese recorte una pausa entre frases sumaba ~1,2 s y
# entre párrafos ~1,7 s, y la lectura sonaba a trompicones (medido en producción el 2026-11-12).
PAUSA_FRASE = 0.25
PAUSA_PARRAFO = 0.50
PAUSA_TITULO = 0.80
# Recorte: margen que se deja alrededor de la voz para no comerse ataques ni colas suaves (s, f, respiraciones).
MARGEN_ANTES = 0.03
MARGEN_DESPUES = 0.08
UMBRAL_SILENCIO = 200  # |muestra| s16 por debajo de esto (~ -44 dBFS) es silencio
VENTANA_SILENCIO = 240  # 10 ms a 24 kHz
SILENCIO_SIN_TEXTO = 1.0  # duración del audio de un capítulo sin texto hablable

# Frases con voz de cada parte: la primera, corta para sonar enseguida; la segunda da margen mientras se
# sintetiza el resto; después partes largas (menos cambios de archivo en el reproductor).
TAMANOS_PARTE = (3, 12)
TAMANO_PARTE_RESTO = 60
VERSION_PARTES = 1
# Una frase de la primera parte que tarda más que esto se pide otra vez (por fuera de la cola) y gana la primera
# respuesta: el servicio de voz a veces se queda segundos en una sola petición y eso es lo que más se nota.
RESPALDO_SEG = 2.0
# Mientras un capítulo pedido (urgente) prepara su primera parte, las precargas no empiezan frases nuevas: el
# servicio de voz responde más despacio cuantas más peticiones hay a la vez, y esos segundos son los que se oyen.
# Tope de espera por si algo se queda colgado.
CEDER_MAX_SEG = 15.0
_arranques = [0]
_cerrojo_arranques = threading.Lock()


class ArranqueUrgente:
    """Marca (para todos los hilos) que un capítulo pedido está preparando su primera parte."""

    def __init__(self) -> None:
        self.activo = False

    def __enter__(self) -> ArranqueUrgente:
        with _cerrojo_arranques:
            _arranques[0] += 1
        self.activo = True
        return self

    def terminar(self) -> None:
        if self.activo:
            self.activo = False
            with _cerrojo_arranques:
                _arranques[0] -= 1

    def __exit__(self, *_exc: object) -> None:
        self.terminar()


def hay_arranque_urgente() -> bool:
    return _arranques[0] > 0


async def ceder_paso() -> None:
    """Una precarga espera (hasta CEDER_MAX_SEG) a que los capítulos pedidos tengan su primera parte."""
    fin = time.monotonic() + CEDER_MAX_SEG
    while hay_arranque_urgente() and time.monotonic() < fin:
        await asyncio.sleep(0.05)


@dataclass
class FraseSintetizada:
    ruta_mp3: Path
    palabras: list[tuple[str, float, float]]


def clave_cache(texto_voz: str, voz_id: str, version_motor: str) -> str:
    return hashlib.sha1(f"{texto_voz}\x1f{voz_id}\x1f{version_motor}".encode()).hexdigest()


def _hay_voz(muestras: array.array[int], i: int) -> bool:
    ventana = muestras[i : i + VENTANA_SILENCIO]
    return bool(ventana) and max(abs(x) for x in ventana) > UMBRAL_SILENCIO


def recortar_silencio(datos: bytes, palabras: list[tuple[str, float, float]]) -> tuple[bytes, float]:
    """Quita el silencio de delante y de detrás del PCM de una frase. Devuelve (pcm, segundos quitados delante).

    El borde se busca por energía (ventanas de 10 ms) y nunca corta dentro de una palabra según los tiempos de
    edge-tts. Si no hay nada que suene por encima del umbral, se devuelve tal cual.
    """
    n = len(datos) // audio.BYTES_POR_MUESTRA
    if n == 0:
        return datos, 0.0
    muestras = array.array("h")
    muestras.frombytes(datos[: n * audio.BYTES_POR_MUESTRA])
    if sys.byteorder != "little":
        muestras.byteswap()
    inicio = 0
    while inicio < n and not _hay_voz(muestras, inicio):
        inicio += VENTANA_SILENCIO
    if inicio >= n:
        return datos, 0.0
    fin = n
    while fin > inicio and not _hay_voz(muestras, max(inicio, fin - VENTANA_SILENCIO)):
        fin -= VENTANA_SILENCIO
    f = audio.FRECUENCIA
    a = max(0, inicio - round(MARGEN_ANTES * f))
    b = min(n, fin + round(MARGEN_DESPUES * f))
    if palabras:  # nunca dentro de una palabra
        a = min(a, max(0, round(min(p[1] for p in palabras) * f)))
        b = max(b, min(n, round(max(p[2] for p in palabras) * f) + round(0.02 * f)))
    bps = audio.BYTES_POR_MUESTRA
    return datos[a * bps : b * bps], a / f


def pausa_tras(frase: dict) -> float:
    if frase.get("esTitulo"):
        return PAUSA_TITULO
    if frase.get("finParrafo"):
        return PAUSA_PARRAFO
    return PAUSA_FRASE


def tamano_parte(n: int) -> int:
    """Frases con voz de la parte n (0, 1, 2…)."""
    return TAMANOS_PARTE[n] if n < len(TAMANOS_PARTE) else TAMANO_PARTE_RESTO


def nombre_parte(capitulo: int, n: int) -> str:
    return f"cap-{capitulo:03d}.parte-{n:03d}.m4a"


def _escribir_atomico(ruta: Path, texto: str) -> None:
    tmp = ruta.with_name(f"{ruta.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_text(texto, encoding="utf-8")
    os.replace(tmp, ruta)


async def _con_respaldo(motor: MotorDeVoz, texto: str, voz_motor: str) -> Sintesis:
    """Sintetiza; si tarda más de RESPALDO_SEG y el motor lo permite, lanza un duplicado y gana el primero bueno."""
    sin_cola = getattr(motor, "sintetizar_sin_cola", None)
    if sin_cola is None:
        return await motor.sintetizar(texto, voz_motor)
    # Las frases del arranque no hacen cola en el semáforo: si no, las de detrás (que ya esperan turno) se les
    # adelantan y la primera parte tarda segundos de más.
    primera = asyncio.ensure_future(sin_cola(texto, voz_motor))
    hechas, _ = await asyncio.wait({primera}, timeout=RESPALDO_SEG)
    if hechas:
        return primera.result()
    log.info("Una frase del arranque tarda más de %.1fs: se pide un duplicado", RESPALDO_SEG)
    pendientes = {primera, asyncio.ensure_future(sin_cola(texto, voz_motor))}
    error: BaseException | None = None
    try:
        while pendientes:
            hechas, pendientes = await asyncio.wait(pendientes, return_when=asyncio.FIRST_COMPLETED)
            for t in hechas:
                e = t.exception()
                if e is None:
                    r: Sintesis = t.result()
                    return r
                error = e
        assert error is not None
        raise error
    finally:
        for t in pendientes:
            t.cancel()


async def _sintetizar_con_cache(
    motor: MotorDeVoz,
    voz_motor: str,
    voz_id: str,
    texto: str,
    dir_cache: Path,
    respaldo: bool = False,
    ceder: bool = False,
) -> FraseSintetizada:
    clave = clave_cache(texto, voz_id, motor.version)
    mp3 = dir_cache / f"{clave}.mp3"
    meta = dir_cache / f"{clave}.json"
    if mp3.exists() and meta.exists() and mp3.stat().st_size > 0:
        try:
            palabras = [tuple(p) for p in json.loads(meta.read_text(encoding="utf-8"))["palabras"]]
            return FraseSintetizada(mp3, palabras)
        except Exception:
            log.warning("Caché de voz corrupta, se regenera: %s", clave)
    if ceder:
        await ceder_paso()
    s = await (_con_respaldo(motor, texto, voz_motor) if respaldo else motor.sintetizar(texto, voz_motor))
    dir_cache.mkdir(parents=True, exist_ok=True)
    sufijo = uuid.uuid4().hex[:8]
    tmp_mp3 = mp3.with_name(mp3.name + f".{sufijo}.tmp")
    tmp_meta = meta.with_name(meta.name + f".{sufijo}.tmp")
    tmp_mp3.write_bytes(s.audio)
    tmp_meta.write_text(
        json.dumps(
            {"texto": texto, "vozId": voz_id, "motor": motor.version, "palabras": s.palabras}, ensure_ascii=False
        ),
        encoding="utf-8",
    )
    os.replace(tmp_mp3, mp3)
    os.replace(tmp_meta, meta)
    return FraseSintetizada(mp3, s.palabras)


@dataclass
class Parte:
    """Una parte reproducible: PCM de sus frases SIN la pausa final (el cambio de archivo hace de pausa)."""

    n: int
    t0: float
    t1: float = 0.0
    pcm: bytearray = field(default_factory=bytearray)
    con_voz: int = 0


class Ensamblador:
    """Concatena en orden el PCM de las frases con sus pausas, calcula los tiempos exactos y va cerrando partes.

    Se alimenta frase a frase (`agregar`). Cuando una parte llega a su tamaño (o es la última frase con audio),
    la devuelve cerrada para que quien llama la codifique.
    """

    def __init__(self, frases: list[dict[str, Any]], pcm: BinaryIO, con_audio: set[str], partes: bool = False):
        self.frases = frases
        self.pcm = pcm
        self.muestras = 0
        self.salida: list[dict[str, Any]] = []
        self.ultima_con_audio = max((k for k, f in enumerate(frases) if f["id"] in con_audio), default=-1)
        self.con_partes = partes and self.ultima_con_audio >= 0
        self.parte: Parte | None = Parte(0, 0.0) if self.con_partes else None
        self.n_partes = 0

    def _escribir(self, datos: bytes, en_parte: bool) -> None:
        self.pcm.write(datos)
        self.muestras += len(datos) // audio.BYTES_POR_MUESTRA
        if en_parte and self.parte is not None:
            self.parte.pcm.extend(datos)

    def agregar(self, k: int, s: FraseSintetizada | None, datos: bytes | None) -> Parte | None:
        """Añade la frase k (con su audio ya decodificado, o None si no tiene). Devuelve una parte cerrada o None."""
        f = self.frases[k]
        t0 = self.muestras / audio.FRECUENCIA
        if s is None or datos is None:  # frase sin contenido hablable (separadores, solo una nota al pie…)
            self.salida.append({"id": f["id"], "t0": round(t0, 3), "t1": round(t0, 3), "palabras": []})
            return None
        if len(datos) % 2:
            datos = datos[:-1]
        datos, quitado = recortar_silencio(datos, s.palabras)
        self._escribir(datos, True)
        t1 = self.muestras / audio.FRECUENCIA
        palabras = alinear_palabras(f["texto"], f["voz"], s.palabras, desplazamiento=t0 - quitado)
        # las palabras nunca se salen de la frase
        palabras = [[a, b, min(max(x, t0), t1), min(max(y, t0), t1)] for a, b, x, y in palabras]
        self.salida.append({"id": f["id"], "t0": round(t0, 3), "t1": round(t1, 3), "palabras": palabras})
        cerrada: Parte | None = None
        if self.parte is not None:
            self.parte.con_voz += 1
            if self.parte.con_voz >= tamano_parte(self.parte.n) or k == self.ultima_con_audio:
                cerrada = self.parte
                cerrada.t1 = t1
                self.n_partes += 1
                self.parte = None
        if k < self.ultima_con_audio:
            self._escribir(audio.silencio(pausa_tras(f)), True)
            if cerrada is not None:
                self.parte = Parte(self.n_partes, self.muestras / audio.FRECUENCIA)
        return cerrada

    def terminar(self, capitulo: int, voz_id: str) -> dict[str, Any]:
        if self.muestras == 0:  # nada que leer: silencio corto en vez de un audio vacío que ffmpeg rechaza
            self._escribir(audio.silencio(SILENCIO_SIN_TEXTO), False)
        return {
            "capitulo": capitulo,
            "vozId": voz_id,
            "duracion": round(self.muestras / audio.FRECUENCIA, 3),
            "frases": self.salida,
        }


def ensamblar(
    frases: list[dict[str, Any]],
    sintetizadas: dict[str, FraseSintetizada],
    ruta_pcm: Path,
    decodificar: Callable[[Path], bytes] = audio.decodificar_a_pcm,
    capitulo: int = 0,
    voz_id: str = "",
) -> dict[str, Any]:
    """Concatena el PCM de las frases con pausas y calcula los tiempos exactos. Devuelve el dict de tiempos."""
    with open(ruta_pcm, "wb") as pcm:
        e = Ensamblador(frases, pcm, set(sintetizadas))
        for k, f in enumerate(frases):
            s = sintetizadas.get(f["id"])
            e.agregar(k, s, decodificar(s.ruta_mp3) if s else None)
        return e.terminar(capitulo, voz_id)


class Manifiesto:
    """`cap-NNN.partes.json`: las partes ya escritas y los tiempos de sus frases (contratos §6 bis)."""

    def __init__(self, dir_audio: Path, capitulo: int, voz_id: str, frases: list[dict[str, Any]]):
        self.dir = dir_audio
        self.capitulo = capitulo
        self.voz_id = voz_id
        self.ruta = dir_audio / f"cap-{capitulo:03d}.partes.json"
        self.partes: list[dict[str, Any]] = []
        self.caracteres = [len((f.get("voz") or "").strip()) for f in frases]
        self.total_caracteres = max(1, sum(self.caracteres))

    def estimar(self, segundos: float, frases_hechas: int) -> float:
        """Duración estimada del capítulo con lo que se lleva (proporcional a los caracteres de voz)."""
        hechos = sum(self.caracteres[:frases_hechas])
        if hechos <= 0:
            return round(segundos, 1)
        return round(max(segundos, segundos * self.total_caracteres / hechos), 1)

    def escribir(
        self, frases_salida: list[dict[str, Any]], completo: bool = False, duracion: float | None = None
    ) -> None:
        ultima = self.partes[-1]["t1"] if self.partes else 0.0
        datos = {
            "versionFormato": VERSION_PARTES,
            "capitulo": self.capitulo,
            "vozId": self.voz_id,
            "completo": completo,
            "duracionEstimada": duracion if duracion is not None else self.estimar(ultima, len(frases_salida)),
            "partes": self.partes,
            "frases": frases_salida,
        }
        _escribir_atomico(self.ruta, json.dumps(datos, ensure_ascii=False))


async def generar_capitulo(
    rutas: Rutas,
    archivo_id: str,
    voz_id: str,
    capitulo: int,
    motor: MotorDeVoz,
    voz_motor: str,
    latido: Callable[[], None] | None = None,
    seguir: Callable[[], bool] | None = None,
    partes: bool = True,
    concurrencia: int | None = None,
    urgente: bool = False,
) -> float:
    ruta_frases = rutas.frases(archivo_id, capitulo)
    if not ruta_frases.exists():
        raise ErrorDefinitivo(Msj.CAPITULO_INEXISTENTE, capitulo=capitulo)
    datos = json.loads(ruta_frases.read_text(encoding="utf-8"))
    frases = datos["frases"]
    # Un capítulo sin ninguna frase (una página de imagen, una portadilla «Sección 4») no es un error: da el mismo
    # segundo de silencio que uno con solo separadores (DA-11) y el reproductor pasa solo al siguiente. Antes era
    # un ERROR definitivo que paraba la escucha en el iPhone (2026-11-12).

    dir_cache = rutas.cache_voz()
    ultimo_latido = [time.monotonic()]
    fijar = getattr(motor, "fijar_concurrencia", None)
    if concurrencia and fijar is not None:
        fijar(concurrencia)

    # frases con el mismo texto de voz se sintetizan una sola vez
    tareas_por_texto: dict[str, asyncio.Task] = {}

    async def una(f: dict) -> FraseSintetizada:
        tarea = tareas_por_texto[f["voz"]]
        r: FraseSintetizada = await tarea
        if seguir is not None and not seguir():
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
        if latido and time.monotonic() - ultimo_latido[0] > 60:
            ultimo_latido[0] = time.monotonic()
            try:
                await asyncio.to_thread(latido)
            except Exception as e:
                log.warning("Latido fallido: %s", e)
        return r

    con_voz = [f for f in frases if (f.get("voz") or "").strip()]
    # Se crean en orden: el semáforo del motor es FIFO, así las primeras frases se piden antes.
    for k, f in enumerate(con_voz):
        if f["voz"] not in tareas_por_texto:
            respaldo = partes and k < TAMANOS_PARTE[0]  # solo el arranque: lo que se oye primero
            tareas_por_texto[f["voz"]] = asyncio.ensure_future(
                _sintetizar_con_cache(motor, voz_motor, voz_id, f["voz"], dir_cache, respaldo, ceder=not urgente)
            )
    inicio = time.monotonic()
    arranque = ArranqueUrgente()
    try:
        if urgente and partes and con_voz:
            arranque.__enter__()
        return await _sintetizar_y_ensamblar(
            rutas,
            archivo_id,
            voz_id,
            capitulo,
            frases,
            {f["id"] for f in con_voz},
            una,
            inicio,
            seguir,
            partes,
            arranque.terminar,
        )
    except TrabajoCancelado:
        borrar_audio_capitulo(rutas, archivo_id, voz_id, capitulo)
        raise
    finally:
        arranque.terminar()
        for t in tareas_por_texto.values():  # un fallo a mitad no deja síntesis huérfanas corriendo
            if not t.done():
                t.cancel()
        await asyncio.gather(*tareas_por_texto.values(), return_exceptions=True)


async def _sintetizar_y_ensamblar(
    rutas: Rutas,
    archivo_id: str,
    voz_id: str,
    capitulo: int,
    frases: list[dict[str, Any]],
    con_voz: set[str],
    una: Callable[[dict], Awaitable[FraseSintetizada]],
    inicio: float,
    seguir: Callable[[], bool] | None,
    con_partes: bool,
    al_sonar: Callable[[], None] = lambda: None,
) -> float:
    dir_audio = rutas.audio(archivo_id, voz_id)
    dir_audio.mkdir(parents=True, exist_ok=True)
    base = f"cap-{capitulo:03d}"
    manifiesto = Manifiesto(dir_audio, capitulo, voz_id, frases)
    primera_parte: float | None = None
    with tempfile.TemporaryDirectory(prefix="bah-voz-") as tmp:
        ruta_pcm = Path(tmp) / "capitulo.raw"
        with open(ruta_pcm, "wb") as pcm:
            e = Ensamblador(frases, pcm, con_voz, partes=con_partes)
            for k, f in enumerate(frases):
                s = await una(f) if f["id"] in con_voz else None
                datos = await asyncio.to_thread(audio.decodificar_a_pcm, s.ruta_mp3) if s else None
                cerrada = e.agregar(k, s, datos)
                if cerrada is not None:
                    await _escribir_parte(cerrada, Path(tmp), dir_audio, capitulo, manifiesto, e.salida)
                    if primera_parte is None:
                        al_sonar()  # ya suena: las precargas pueden seguir
                        primera_parte = time.monotonic() - inicio
                        log.info("Capítulo %d (%s): primera parte lista en %.1fs", capitulo, voz_id, primera_parte)
            tiempos = e.terminar(capitulo, voz_id)
        log.info(
            "Capítulo %d (%s): %d frases sintetizadas y ensambladas en %.1fs (%d partes)",
            capitulo,
            voz_id,
            len(con_voz),
            time.monotonic() - inicio,
            len(manifiesto.partes),
        )
        m4a = dir_audio / f"{base}.m4a"
        await asyncio.to_thread(audio.codificar_m4a, ruta_pcm, m4a)
    _escribir_atomico(dir_audio / f"{base}.tiempos.json", json.dumps(tiempos, ensure_ascii=False))
    await asyncio.to_thread(audio.variante_2x, m4a, dir_audio / f"{base}-2x.m4a")
    if manifiesto.partes:
        manifiesto.escribir(tiempos["frases"], completo=True, duracion=float(tiempos["duracion"]))
    if seguir is not None and not seguir():
        raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
    return float(tiempos["duracion"])


async def _escribir_parte(
    parte: Parte,
    tmp: Path,
    dir_audio: Path,
    capitulo: int,
    manifiesto: Manifiesto,
    frases_salida: list[dict[str, Any]],
) -> None:
    """Codifica una parte y la anuncia en el manifiesto. Un fallo aquí no tumba el capítulo (solo se pierde la
    escucha anticipada: el capítulo entero sigue generándose)."""
    nombre = nombre_parte(capitulo, parte.n)
    try:
        raw = tmp / f"parte-{parte.n:03d}.raw"
        raw.write_bytes(bytes(parte.pcm))
        await asyncio.to_thread(audio.codificar_m4a, raw, dir_audio / nombre)
        raw.unlink(missing_ok=True)
        manifiesto.partes.append({"n": parte.n, "archivo": nombre, "t0": round(parte.t0, 3), "t1": round(parte.t1, 3)})
        manifiesto.escribir(list(frases_salida))
    except Exception:
        log.warning("No se pudo escribir la parte %s (el capítulo sigue)", nombre, exc_info=True)
    finally:
        parte.pcm = bytearray()


def borrar_audio_capitulo(rutas: Rutas, archivo_id: str, voz_id: str, capitulo: int) -> None:
    """Borra el audio de un capítulo (1x, 2x, tiempos, partes y temporales) y las carpetas que queden vacías."""
    dir_audio = rutas.audio(archivo_id, voz_id)
    if not dir_audio.is_dir():
        return
    for f in dir_audio.glob(f"cap-{capitulo:03d}[.-]*"):
        try:
            f.unlink()
        except OSError:
            log.warning("No se pudo borrar %s", f, exc_info=True)
    for d in (dir_audio, dir_audio.parent):
        try:
            d.rmdir()  # solo si está vacía
        except OSError:
            break


def limpiar_partes_viejas(rutas: Rutas, minutos: float = 30, ahora: float | None = None) -> int:
    """Borra las partes (y su manifiesto) de los capítulos cuyo manifiesto no se toca desde hace `minutos`: ya
    están enteros (o su generación murió y se rehará). Nunca lanza. Devuelve cuántos capítulos limpió."""
    raiz = rutas.raiz / "audio"
    limite = (time.time() if ahora is None else ahora) - minutos * 60
    n = 0
    try:
        manifiestos = list(raiz.glob("*/*/cap-*.partes.json"))
    except OSError:
        return 0
    for m in manifiestos:
        try:
            if m.stat().st_mtime > limite:
                continue
            base = m.name[: -len(".partes.json")]
            for p in m.parent.glob(f"{base}.parte-*.m4a"):
                p.unlink(missing_ok=True)
            m.unlink(missing_ok=True)
            n += 1
        except OSError:
            log.warning("No se pudieron limpiar las partes de %s", m, exc_info=True)
    if n:
        log.info("Partes de %d capítulo(s) ya enteros borradas", n)
    return n

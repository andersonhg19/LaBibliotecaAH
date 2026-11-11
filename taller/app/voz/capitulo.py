"""Generación del audio de un capítulo (plan-maestro §6.2, contratos.md §6).

1. Lee `frases/cap-NNN.json`.
2. Sintetiza el texto `voz` de cada frase (concurrencia limitada por el motor), con caché en
   `cache-voz/{sha1(voz + vozId + versionMotor)}.mp3` (+ `.json` con las palabras).
3. Decodifica cada frase a PCM y concatena con pausas (250 ms entre frases, 500 ms al final de párrafo,
   700 ms tras un título). Los tiempos t0/t1 salen de las muestras reales → exactos.
4. Codifica `cap-NNN.m4a` (AAC-LC mono 48 kbps, faststart), escribe `cap-NNN.tiempos.json` y crea
   `cap-NNN-2x.m4a` con atempo=2.0.
Un capítulo sin nada que leer en voz (solo separadores, QA DA-11) da un audio de 1 s de silencio.
Si el libro se retira mientras se genera (`seguir()` devuelve False), se borra lo escrito (QA DA-28).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import tempfile
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..config.rutas import Rutas
from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, TrabajoCancelado
from . import audio
from .alineacion import alinear_palabras
from .motor import MotorDeVoz

log = logging.getLogger(__name__)

PAUSA_FRASE = 0.25
PAUSA_PARRAFO = 0.50
PAUSA_TITULO = 0.70
SILENCIO_SIN_TEXTO = 1.0  # duración del audio de un capítulo sin texto hablable


@dataclass
class FraseSintetizada:
    ruta_mp3: Path
    palabras: list[tuple[str, float, float]]


def clave_cache(texto_voz: str, voz_id: str, version_motor: str) -> str:
    return hashlib.sha1(f"{texto_voz}\x1f{voz_id}\x1f{version_motor}".encode()).hexdigest()


def pausa_tras(frase: dict) -> float:
    if frase.get("esTitulo"):
        return PAUSA_TITULO
    if frase.get("finParrafo"):
        return PAUSA_PARRAFO
    return PAUSA_FRASE


async def _sintetizar_con_cache(
    motor: MotorDeVoz, voz_motor: str, voz_id: str, texto: str, dir_cache: Path
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
    s = await motor.sintetizar(texto, voz_motor)
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


def ensamblar(
    frases: list[dict[str, Any]],
    sintetizadas: dict[str, FraseSintetizada],
    ruta_pcm: Path,
    decodificar: Callable[[Path], bytes] = audio.decodificar_a_pcm,
    capitulo: int = 0,
    voz_id: str = "",
) -> dict[str, Any]:
    """Concatena el PCM de las frases con pausas y calcula los tiempos exactos. Devuelve el dict de tiempos."""
    muestras = 0
    salida_frases: list[dict[str, Any]] = []
    with open(ruta_pcm, "wb") as pcm:
        ultima_con_audio = max((k for k, f in enumerate(frases) if f["id"] in sintetizadas), default=-1)
        for k, f in enumerate(frases):
            t0 = muestras / audio.FRECUENCIA
            s = sintetizadas.get(f["id"])
            if s is None:  # frase sin contenido hablable (separadores, solo una nota al pie…)
                salida_frases.append({"id": f["id"], "t0": round(t0, 3), "t1": round(t0, 3), "palabras": []})
                continue
            datos = decodificar(s.ruta_mp3)
            if len(datos) % 2:
                datos = datos[:-1]
            pcm.write(datos)
            muestras += len(datos) // audio.BYTES_POR_MUESTRA
            t1 = muestras / audio.FRECUENCIA
            palabras = alinear_palabras(f["texto"], f["voz"], s.palabras, desplazamiento=t0)
            # las palabras nunca se salen de la frase
            palabras = [[a, b, min(max(x, t0), t1), min(max(y, t0), t1)] for a, b, x, y in palabras]
            salida_frases.append({"id": f["id"], "t0": round(t0, 3), "t1": round(t1, 3), "palabras": palabras})
            if k < ultima_con_audio:
                sil = audio.silencio(pausa_tras(f))
                pcm.write(sil)
                muestras += len(sil) // audio.BYTES_POR_MUESTRA
        if muestras == 0:  # nada que leer: silencio corto en vez de un audio vacío que ffmpeg rechaza
            sil = audio.silencio(SILENCIO_SIN_TEXTO)
            pcm.write(sil)
            muestras = len(sil) // audio.BYTES_POR_MUESTRA
    return {
        "capitulo": capitulo,
        "vozId": voz_id,
        "duracion": round(muestras / audio.FRECUENCIA, 3),
        "frases": salida_frases,
    }


async def generar_capitulo(
    rutas: Rutas,
    archivo_id: str,
    voz_id: str,
    capitulo: int,
    motor: MotorDeVoz,
    voz_motor: str,
    latido: Callable[[], None] | None = None,
    seguir: Callable[[], bool] | None = None,
) -> float:
    ruta_frases = rutas.frases(archivo_id, capitulo)
    if not ruta_frases.exists():
        raise ErrorDefinitivo(Msj.CAPITULO_INEXISTENTE, capitulo=capitulo)
    datos = json.loads(ruta_frases.read_text(encoding="utf-8"))
    frases = datos["frases"]
    if not frases:
        raise ErrorDefinitivo(Msj.CAPITULO_SIN_TEXTO, capitulo=capitulo)

    dir_cache = rutas.cache_voz()
    ultimo_latido = [time.monotonic()]
    hechas = [0]

    # frases con el mismo texto de voz se sintetizan una sola vez
    tareas_por_texto: dict[str, asyncio.Task] = {}

    async def una(f: dict) -> tuple[str, FraseSintetizada]:
        tarea = tareas_por_texto.get(f["voz"])
        if tarea is None:
            tarea = asyncio.ensure_future(_sintetizar_con_cache(motor, voz_motor, voz_id, f["voz"], dir_cache))
            tareas_por_texto[f["voz"]] = tarea
        r = await tarea
        hechas[0] += 1
        if seguir is not None and not seguir():
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
        if latido and time.monotonic() - ultimo_latido[0] > 60:
            ultimo_latido[0] = time.monotonic()
            try:
                await asyncio.to_thread(latido)
            except Exception as e:
                log.warning("Latido fallido: %s", e)
        return f["id"], r

    con_voz = [f for f in frases if (f.get("voz") or "").strip()]
    inicio = time.monotonic()
    try:
        return await _sintetizar_y_ensamblar(rutas, archivo_id, voz_id, capitulo, frases, con_voz, una, inicio, seguir)
    except TrabajoCancelado:
        borrar_audio_capitulo(rutas, archivo_id, voz_id, capitulo)
        raise


async def _sintetizar_y_ensamblar(
    rutas: Rutas,
    archivo_id: str,
    voz_id: str,
    capitulo: int,
    frases: list[dict[str, Any]],
    con_voz: list[dict[str, Any]],
    una: Callable[[dict], Any],
    inicio: float,
    seguir: Callable[[], bool] | None,
) -> float:
    resultados = await asyncio.gather(*(una(f) for f in con_voz))
    sintetizadas = dict(resultados)
    log.info(
        "Capítulo %d (%s): %d frases sintetizadas en %.1fs", capitulo, voz_id, len(con_voz), time.monotonic() - inicio
    )

    dir_audio = rutas.audio(archivo_id, voz_id)
    dir_audio.mkdir(parents=True, exist_ok=True)
    base = f"cap-{capitulo:03d}"
    with tempfile.TemporaryDirectory(prefix="bah-voz-") as tmp:
        ruta_pcm = Path(tmp) / "capitulo.raw"
        tiempos = await asyncio.to_thread(
            ensamblar, frases, sintetizadas, ruta_pcm, audio.decodificar_a_pcm, capitulo, voz_id
        )
        m4a = dir_audio / f"{base}.m4a"
        await asyncio.to_thread(audio.codificar_m4a, ruta_pcm, m4a)
    ruta_tiempos = dir_audio / f"{base}.tiempos.json"
    tmp_t = ruta_tiempos.with_name(f"{ruta_tiempos.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp_t.write_text(json.dumps(tiempos, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp_t, ruta_tiempos)
    await asyncio.to_thread(audio.variante_2x, m4a, dir_audio / f"{base}-2x.m4a")
    if seguir is not None and not seguir():
        raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
    return float(tiempos["duracion"])


def borrar_audio_capitulo(rutas: Rutas, archivo_id: str, voz_id: str, capitulo: int) -> None:
    """Borra el audio de un capítulo (1x, 2x, tiempos y temporales) y las carpetas que queden vacías."""
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

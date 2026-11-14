"""Utilidades de audio con ffmpeg/ffprobe (PCM s16le mono 24 kHz como formato intermedio exacto)."""

from __future__ import annotations

import array
import json
import logging
import math
import os
import re
import subprocess
import sys
import uuid
from collections.abc import Callable
from pathlib import Path

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorReintentable

log = logging.getLogger(__name__)

FRECUENCIA = 24000
BYTES_POR_MUESTRA = 2
BITRATE = "48k"


class ErrorAudio(ErrorReintentable):
    """Fallo de ffmpeg/ffprobe (mensaje claro para el usuario; el detalle va en el texto técnico)."""


def _ejecutar(args: list[str], entrada: bytes | None = None, tiempo: int = 600) -> bytes:
    try:
        r = subprocess.run(args, input=entrada, capture_output=True, timeout=tiempo)
    except FileNotFoundError as e:
        raise ErrorAudio(Msj.ERROR_AUDIO, detalle=f"no está instalado {args[0]}") from e
    if r.returncode != 0:
        # el detalle técnico va solo al log (QA DA-20); el usuario ve el mensaje del catálogo
        raise ErrorAudio(Msj.ERROR_AUDIO, detalle=f"{args[0]}: {r.stderr.decode('utf-8', 'replace')[-300:]}")
    return r.stdout


def decodificar_a_pcm(ruta: Path) -> bytes:
    """Decodifica cualquier audio a PCM s16le mono 24 kHz. La duración exacta = len/2/24000."""
    return _ejecutar(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-i",
            str(ruta),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-ac",
            "1",
            "-ar",
            str(FRECUENCIA),
            "pipe:1",
        ]
    )


def silencio(segundos: float) -> bytes:
    return b"\x00\x00" * round(segundos * FRECUENCIA)


def duracion_pcm(pcm_bytes: int) -> float:
    return pcm_bytes / BYTES_POR_MUESTRA / FRECUENCIA


# (0.4.0) Volumen (V-05): ganancia fija por capítulo + limitador de picos. `latency=1` compensa el retardo del
# limitador (mismas muestras y en el mismo sitio: los tiempos no cambian) y `level=0` evita que reajuste el nivel.
# (B10) El limitador trabaja SOBREMUESTREADO ×4 (así ve los picos entre muestras: el pico verdadero) con el techo
# 1,5 dB por debajo del objetivo (−1,5 dBTP), porque el AAC de 48 kbps aún sube los picos; y después se MIDE el pico
# verdadero del m4a final: si pasa del objetivo, esa variante se recodifica con el techo más bajo.
LUFS_OBJETIVO = -18.0
PICO_OBJETIVO_DBTP = -1.5
TECHO_MUESTRA_DB = -3.0
COMPENSACION_2X_DB = 0.6
SOBREMUESTREO = 4
MARGEN_REINTENTO_DB = 0.5  # cuánto más se baja el techo, además de lo que sobró, al recodificar
MAX_RECODIFICACIONES = 3


def filtro_volumen(ganancia_db: float | None, techo_db: float = TECHO_MUESTRA_DB) -> str | None:
    """Cadena de filtros ffmpeg: ganancia + limitador sobremuestreado sin retardo. None = sin tocar el volumen."""
    if ganancia_db is None:
        return None
    techo = 10 ** (techo_db / 20)
    alto = FRECUENCIA * SOBREMUESTREO
    return (
        f"volume={ganancia_db:.2f}dB,aresample={alto},"
        f"alimiter=limit={techo:.4f}:level=0:latency=1:attack=5:release=50,aresample={FRECUENCIA}"
    )


def _entrada_pcm(ruta_pcm: Path) -> list[str]:
    return ["-f", "s16le", "-ar", str(FRECUENCIA), "-ac", "1", "-i", str(ruta_pcm)]


def _salida_aac(destino: Path) -> list[str]:
    return [
        *("-c:a", "aac", "-profile:a", "aac_low", "-b:a", BITRATE, "-ac", "1"),
        *("-movflags", "+faststart", str(destino)),
    ]


def codificar_m4a(
    ruta_pcm: Path, salida: Path, ganancia_db: float | None = None, techo_db: float = TECHO_MUESTRA_DB
) -> None:
    """PCM → AAC-LC mono 48 kbps en .m4a con moov al principio (faststart). Escritura atómica."""
    tmp = _temporal(salida)
    filtro = filtro_volumen(ganancia_db, techo_db)
    _ejecutar(
        ["ffmpeg", "-v", "error", "-nostdin", "-y", *_entrada_pcm(ruta_pcm)]
        + (["-af", filtro] if filtro else [])
        + _salida_aac(tmp)
    )
    os.replace(tmp, salida)


def _codificar_2x(ruta_pcm: Path, salida: Path, ganancia_db: float | None, techo_db: float) -> None:
    """Solo la variante 2x (para recodificarla con otro techo)."""
    tmp = _temporal(salida)
    filtro = filtro_volumen(ganancia_db, techo_db)
    cadena = (filtro + "," if filtro else "") + "atempo=2.0"
    if filtro:
        cadena += "," + str(filtro_volumen(COMPENSACION_2X_DB, techo_db))
    _ejecutar(["ffmpeg", "-v", "error", "-nostdin", "-y", *_entrada_pcm(ruta_pcm), "-af", cadena, *_salida_aac(tmp)])
    os.replace(tmp, salida)


def codificar_1x_y_2x(ruta_pcm: Path, salida_1x: Path, salida_2x: Path, ganancia_db: float | None = None) -> None:
    """(0.4.0) El capítulo a 1x y a 2x en una sola pasada y AMBOS desde el PCM (V-14): la 2x ya no se recodifica
    desde el AAC de la 1x (una pérdida menos) y los dos llevan el mismo volumen. Escritura atómica.
    (B10) Después se mide el pico verdadero de cada m4a y la variante que pase de PICO_OBJETIVO_DBTP se recodifica
    con el techo del limitador más bajo (como mucho MAX_RECODIFICACIONES veces; nunca falla por esto)."""
    _codificar_1x_y_2x(ruta_pcm, salida_1x, salida_2x, ganancia_db)
    if ganancia_db is None:
        return
    variantes: list[tuple[Path, Callable[[float], None]]] = [
        (salida_1x, lambda techo: codificar_m4a(ruta_pcm, salida_1x, ganancia_db, techo)),
        (salida_2x, lambda techo: _codificar_2x(ruta_pcm, salida_2x, ganancia_db, techo)),
    ]
    for salida, recodificar in variantes:
        techo = TECHO_MUESTRA_DB
        for _ in range(MAX_RECODIFICACIONES):
            pico = medir_pico_verdadero(salida)
            if pico is None or pico <= PICO_OBJETIVO_DBTP:
                break
            techo -= pico - PICO_OBJETIVO_DBTP + MARGEN_REINTENTO_DB
            log.info("Pico verdadero %.1f dBTP en %s: se recodifica con el techo a %.1f dB", pico, salida.name, techo)
            recodificar(techo)
        else:
            pico = medir_pico_verdadero(salida)
            if pico is not None and pico > PICO_OBJETIVO_DBTP:
                log.warning("%s sigue con el pico verdadero en %.1f dBTP", salida.name, pico)


def _codificar_1x_y_2x(ruta_pcm: Path, salida_1x: Path, salida_2x: Path, ganancia_db: float | None = None) -> None:
    tmp1, tmp2 = _temporal(salida_1x), _temporal(salida_2x)
    filtro = filtro_volumen(ganancia_db)
    # atempo deja la 2x ~0,6 LU más baja y crea picos nuevos: se compensa y se vuelve a limitar (medido 2026-11-14)
    filtro_2x = filtro_volumen(COMPENSACION_2X_DB) if filtro else None
    cadena = (filtro + "," if filtro else "") + "asplit=2[a][b];[b]atempo=2.0" + ("," + filtro_2x if filtro_2x else "")
    cadena += "[c]"
    _ejecutar(
        [
            *("ffmpeg", "-v", "error", "-nostdin", "-y", *_entrada_pcm(ruta_pcm)),
            *("-filter_complex", "[0:a]" + cadena),
            *("-map", "[a]", *_salida_aac(tmp1)),
            *("-map", "[c]", *_salida_aac(tmp2)),
        ]
    )
    os.replace(tmp1, salida_1x)
    os.replace(tmp2, salida_2x)


_LUFS = re.compile(r"I:\s+(-?[\d.]+|-inf) LUFS")
_PICO = re.compile(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS")


def medir_pico_verdadero(ruta: Path) -> float | None:
    """(B10) Pico verdadero (dBTP, EBU R128) de un archivo de audio tal cual sonará (el m4a ya codificado); None si
    no se puede medir."""
    try:
        r = subprocess.run(
            [
                *("ffmpeg", "-nostats", "-hide_banner", "-nostdin", "-i", str(ruta)),
                *("-af", "ebur128=peak=true", "-f", "null", "-"),
            ],
            capture_output=True,
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    hallados = _PICO.findall(r.stderr.decode("utf-8", "replace"))
    if r.returncode != 0 or not hallados or hallados[-1] == "-inf":
        return None
    return float(hallados[-1])


def medir_lufs(ruta_pcm: Path, ganancia_db: float | None = None) -> float | None:
    """Sonoridad integrada (EBU R128) del PCM con la ganancia y el limitador aplicados; None si no se puede."""
    filtro = filtro_volumen(ganancia_db)
    cadena = (filtro + "," if filtro else "") + "ebur128=framelog=verbose"
    try:
        r = subprocess.run(
            [
                *("ffmpeg", "-nostats", "-hide_banner", "-nostdin", *_entrada_pcm(ruta_pcm)),
                *("-af", cadena, "-f", "null", "-"),
            ],
            capture_output=True,
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    hallados = _LUFS.findall(r.stderr.decode("utf-8", "replace"))
    if r.returncode != 0 or not hallados or hallados[-1] == "-inf":
        return None
    return float(hallados[-1])


def envolvente(ruta_pcm: Path, hz: int = 10, paso: int = 4) -> list[int]:
    """(0.4.0, contratos C7) Energía RMS del audio por ventanas de 1/hz s, en dB y normalizada a 0..100 enteros
    (100 = la ventana más fuerte, 0 = 60 dB por debajo o silencio). Mira 1 de cada `paso` muestras: basta para
    dibujar una onda y un capítulo de media hora se calcula en un par de segundos."""
    ventana = FRECUENCIA // hz
    rms: list[float] = []
    with open(ruta_pcm, "rb") as f:
        while True:
            datos = f.read(ventana * BYTES_POR_MUESTRA)
            if not datos:
                break
            muestras = array.array("h")
            muestras.frombytes(datos[: len(datos) - len(datos) % BYTES_POR_MUESTRA])
            if sys.byteorder != "little":
                muestras.byteswap()
            sub = muestras[::paso]
            rms.append(math.sqrt(sum(x * x for x in sub) / len(sub)) if sub else 0.0)
    if not rms:
        return []
    db = [20 * math.log10(r / 32768) if r > 0 else -120.0 for r in rms]
    tope = max(db)
    suelo = tope - 60
    if tope <= -100:
        return [0] * len(db)
    return [max(0, min(100, round((d - suelo) / (tope - suelo) * 100))) for d in db]


def _temporal(salida: Path) -> Path:
    """Nombre temporal único: dos hilos de voz pueden generar a la vez el mismo capítulo."""
    return salida.with_name(f"{salida.stem}.{uuid.uuid4().hex[:8]}.tmp.m4a")


def variante_2x(entrada: Path, salida: Path) -> None:
    tmp = _temporal(salida)
    _ejecutar(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(entrada),
            "-filter:a",
            "atempo=2.0",
            "-c:a",
            "aac",
            "-profile:a",
            "aac_low",
            "-b:a",
            BITRATE,
            "-ac",
            "1",
            "-movflags",
            "+faststart",
            str(tmp),
        ]
    )
    os.replace(tmp, salida)


def duracion(ruta: Path) -> float:
    salida = _ejecutar(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(ruta)])
    return float(json.loads(salida)["format"]["duration"])

"""Utilidades de audio con ffmpeg/ffprobe (PCM s16le mono 24 kHz como formato intermedio exacto)."""

from __future__ import annotations

import json
import os
import subprocess
import uuid
from pathlib import Path

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorReintentable

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


def codificar_m4a(ruta_pcm: Path, salida: Path) -> None:
    """PCM → AAC-LC mono 48 kbps en .m4a con moov al principio (faststart). Escritura atómica."""
    tmp = _temporal(salida)
    _ejecutar(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "s16le",
            "-ar",
            str(FRECUENCIA),
            "-ac",
            "1",
            "-i",
            str(ruta_pcm),
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

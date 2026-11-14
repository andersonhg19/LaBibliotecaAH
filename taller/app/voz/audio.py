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
MAX_RECODIFICACIONES = 4
TOLERANCIA_LUFS_RECODIFICAR = 1.0  # sonoridad que puede perder una variante al bajarle el techo
# (R2-2) Además del pico, la SONORIDAD del m4a final: si se aparta más de TOLERANCIA_LUFS_FINAL de −18 (la 2x de los
# diálogos quedaba a −19,2; un capítulo corto con la voz multilingüe, a −20; y bajar el techo por el pico costaba hasta
# 1,7 LU), esa variante se recodifica corrigiendo a la vez la ganancia (lo que falte) y el techo del limitador (lo que
# sobre de pico): el limitador sobremuestreado frena los picos y la ganancia devuelve la sonoridad. Solo en capítulos
# de al menos MIN_SEGUNDOS_SONORIDAD (en menos, la sonoridad integrada no es fiable) y sin pasar de EXTRA_GANANCIA_MAX
# ni bajar el techo de TECHO_MINIMO_DB (más sería aplastar la voz).
TOLERANCIA_LUFS_FINAL = 0.5
MIN_SEGUNDOS_SONORIDAD = 3.0
EXTRA_GANANCIA_MAX_DB = 6.0
TECHO_MINIMO_DB = -10.0


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


# (R2-2) Lo que entra al AAC va en s16: alimentado en coma flotante tras el limitador y atempo, la 2x de Alonso
# «Enorme» salía a +3,9 dBTP con el PCM a −2,8; la misma señal en s16 queda a −1,4 (medido 2026-11-14). Sin esto la
# corrección de picos bajaba el techo hasta −9 dB y la sonoridad caía a −20 LUFS.
A_S16 = "aformat=sample_fmts=s16"


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
        + (["-af", f"{filtro},{A_S16}"] if filtro else [])
        + _salida_aac(tmp)
    )
    os.replace(tmp, salida)


def _codificar_2x(ruta_pcm: Path, salida: Path, ganancia_db: float | None, techo_db: float) -> None:
    """Solo la variante 2x (para recodificarla con otro techo)."""
    tmp = _temporal(salida)
    filtro = filtro_volumen(ganancia_db, techo_db)
    cadena = (filtro + "," if filtro else "") + "atempo=2.0"
    if filtro:
        cadena += "," + str(filtro_volumen(COMPENSACION_2X_DB, techo_db)) + "," + A_S16
    _ejecutar(["ffmpeg", "-v", "error", "-nostdin", "-y", *_entrada_pcm(ruta_pcm), "-af", cadena, *_salida_aac(tmp)])
    os.replace(tmp, salida)


def codificar_1x_y_2x(
    ruta_pcm: Path,
    salida_1x: Path,
    salida_2x: Path,
    ganancia_db: float | None = None,
    duracion: float | None = None,
) -> None:
    """(0.4.0) El capítulo a 1x y a 2x en una sola pasada y AMBOS desde el PCM (V-14): la 2x ya no se recodifica
    desde el AAC de la 1x (una pérdida menos) y los dos llevan el mismo volumen. Escritura atómica.
    (B10) Después se mide cada m4a: el AAC de 48 kbps sube los picos hasta 4 dB en algunas voces (Alonso), así que
    la variante que pase de PICO_OBJETIVO_DBTP se recodifica con el techo del limitador más bajo.
    (R2-2) Con `duracion` (≥ MIN_SEGUNDOS_SONORIDAD) también se corrige la sonoridad del m4a final: la variante que
    se aparte más de TOLERANCIA_LUFS_FINAL de LUFS_OBJETIVO se recodifica con la ganancia corregida (y el techo más
    bajo si hace falta), así cumple −18 ± 1 LUFS y ≤ −1,5 dBTP a la vez. Como mucho MAX_RECODIFICACIONES pruebas por
    variante. Nunca falla por esto."""
    _codificar_1x_y_2x(ruta_pcm, salida_1x, salida_2x, ganancia_db)
    if ganancia_db is None:
        return
    sonoridad = duracion is not None and duracion >= MIN_SEGUNDOS_SONORIDAD
    variantes: list[tuple[Path, Callable[[Path, float, float], None]]] = [
        (salida_1x, lambda destino, g, techo: codificar_m4a(ruta_pcm, destino, g, techo)),
        (salida_2x, lambda destino, g, techo: _codificar_2x(ruta_pcm, destino, g, techo)),
    ]
    for salida, recodificar in variantes:
        if sonoridad:
            _ajustar_sonoridad_y_picos(salida, recodificar, ganancia_db)
        else:
            _ajustar_picos(salida, recodificar, ganancia_db)


def _fuera_de_objetivo(lufs: float | None, pico: float | None) -> bool:
    return (pico is not None and pico > PICO_OBJETIVO_DBTP) or (
        lufs is not None and abs(lufs - LUFS_OBJETIVO) > TOLERANCIA_LUFS_FINAL
    )


def _ajustar_sonoridad_y_picos(
    salida: Path, recodificar: Callable[[Path, float, float], None], ganancia_db: float
) -> None:
    """(R2-2) Recodifica la variante hasta que el m4a final quede a LUFS_OBJETIVO ± TOLERANCIA_LUFS_FINAL con el pico
    verdadero ≤ PICO_OBJETIVO_DBTP. En cada prueba: ganancia += lo que falte de sonoridad; techo −= lo que sobre de
    pico (+ un margen). Se queda la prueba que cumple el pico y queda más cerca de −18 (o el original si ninguna
    cumple el pico y el original sí). Los candidatos se borran siempre."""
    lufs, pico = medir_m4a(salida)
    if lufs is None or not _fuera_de_objetivo(lufs, pico):
        return
    techo, g = TECHO_MUESTRA_DB, ganancia_db

    def distancia(sonoridad: float | None) -> float:
        return abs(sonoridad - LUFS_OBJETIVO) if sonoridad is not None else 99.0

    cumple_original = pico is not None and pico <= PICO_OBJETIVO_DBTP
    mejor: tuple[float, Path | None] | None = (distancia(lufs), None) if cumple_original else None
    candidatos: list[Path] = []
    try:
        for intento in range(MAX_RECODIFICACIONES):
            if pico is not None and pico > PICO_OBJETIVO_DBTP:
                techo = max(TECHO_MINIMO_DB, techo - (pico - PICO_OBJETIVO_DBTP + MARGEN_REINTENTO_DB))
            if lufs is not None:
                g = min(ganancia_db + EXTRA_GANANCIA_MAX_DB, g + (LUFS_OBJETIVO - lufs))
            candidato = salida.with_name(f"{salida.stem}.s{intento}.{uuid.uuid4().hex[:6]}.tmp.m4a")
            candidatos.append(candidato)
            log.info(
                "%s: %.1f LUFS y %.1f dBTP: se prueba con %.1f dB de ganancia y el techo a %.1f dB",
                salida.name,
                lufs if lufs is not None else float("nan"),
                pico if pico is not None else float("nan"),
                g,
                techo,
            )
            recodificar(candidato, g, techo)
            lufs, pico = medir_m4a(candidato)
            if pico is not None and pico <= PICO_OBJETIVO_DBTP and (mejor is None or distancia(lufs) < mejor[0]):
                mejor = (distancia(lufs), candidato)
            if not _fuera_de_objetivo(lufs, pico):
                break
        if mejor is None:
            log.warning("%s sigue con el pico verdadero por encima de %.1f dBTP", salida.name, PICO_OBJETIVO_DBTP)
            return
        if mejor[1] is not None:
            os.replace(mejor[1], salida)
        log.info(
            "%s queda a %.1f LU de %.0f LUFS con el pico verdadero ≤ %.1f dBTP",
            salida.name,
            mejor[0],
            LUFS_OBJETIVO,
            PICO_OBJETIVO_DBTP,
        )
    finally:
        for c in candidatos:
            c.unlink(missing_ok=True)


def _ajustar_picos(salida: Path, recodificar: Callable[[Path, float, float], None], ganancia_db: float) -> None:
    """Prueba candidatos (techo más bajo si el pico no cumple; algo más de ganancia si cumple pero perdió más de
    TOLERANCIA_LUFS_RECODIFICAR) y se queda con el que cumple el pico y suena más fuerte. Los picos del AAC no son
    proporcionales al techo, por eso se miden todos en vez de calcular uno."""
    lufs, pico = medir_m4a(salida)
    if pico is None or pico <= PICO_OBJETIVO_DBTP:
        return
    referencia = min(lufs, LUFS_OBJETIVO) if lufs is not None else LUFS_OBJETIVO
    techo, g = TECHO_MUESTRA_DB, ganancia_db
    mejor: tuple[float, Path] | None = None  # (sonoridad, archivo) del mejor candidato que cumple el pico
    candidatos: list[Path] = []
    try:
        for intento in range(MAX_RECODIFICACIONES):
            if pico is not None and pico > PICO_OBJETIVO_DBTP:
                techo -= pico - PICO_OBJETIVO_DBTP + MARGEN_REINTENTO_DB
            elif lufs is not None:
                g += (referencia - lufs) / 2
            candidato = salida.with_name(f"{salida.stem}.c{intento}.{uuid.uuid4().hex[:6]}.tmp.m4a")
            candidatos.append(candidato)
            log.info(
                "%s: %.1f LUFS y %.1f dBTP: se prueba con %.1f dB de ganancia y el techo a %.1f dB",
                salida.name,
                lufs if lufs is not None else float("nan"),
                pico if pico is not None else float("nan"),
                g,
                techo,
            )
            recodificar(candidato, g, techo)
            lufs, pico = medir_m4a(candidato)
            if pico is not None and pico <= PICO_OBJETIVO_DBTP:
                sonoridad = lufs if lufs is not None else -99.0
                if mejor is None or sonoridad > mejor[0]:
                    mejor = (sonoridad, candidato)
                if lufs is None or lufs >= referencia - TOLERANCIA_LUFS_RECODIFICAR:
                    break
        if mejor is None:
            log.warning("%s sigue con el pico verdadero por encima de %.1f dBTP", salida.name, PICO_OBJETIVO_DBTP)
            return
        os.replace(mejor[1], salida)
        log.info("%s queda a %.1f LUFS con el pico verdadero ≤ %.1f dBTP", salida.name, mejor[0], PICO_OBJETIVO_DBTP)
    finally:
        for c in candidatos:
            c.unlink(missing_ok=True)


def _codificar_1x_y_2x(ruta_pcm: Path, salida_1x: Path, salida_2x: Path, ganancia_db: float | None = None) -> None:
    tmp1, tmp2 = _temporal(salida_1x), _temporal(salida_2x)
    filtro = filtro_volumen(ganancia_db)
    # atempo deja la 2x ~0,6 LU más baja y crea picos nuevos: se compensa y se vuelve a limitar (medido 2026-11-14)
    filtro_2x = filtro_volumen(COMPENSACION_2X_DB) if filtro else None
    cadena = (filtro + "," if filtro else "") + "asplit=2[a0][b];[b]atempo=2.0" + ("," + filtro_2x if filtro_2x else "")
    cadena += "[c0];[a0]" + (A_S16 if filtro else "anull") + "[a];[c0]" + (A_S16 if filtro else "anull") + "[c]"
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
    return medir_m4a(ruta)[1]


def medir_m4a(ruta: Path) -> tuple[float | None, float | None]:
    """(B10) (sonoridad integrada LUFS, pico verdadero dBTP) de un archivo de audio ya codificado, en una pasada."""
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
        return None, None
    if r.returncode != 0:
        return None, None
    texto = r.stderr.decode("utf-8", "replace")
    picos, sonoridades = _PICO.findall(texto), _LUFS.findall(texto)
    pico = float(picos[-1]) if picos and picos[-1] != "-inf" else None
    lufs = float(sonoridades[-1]) if sonoridades and sonoridades[-1] != "-inf" else None
    return lufs, pico


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

"""Ganancia por voz para dejar todo el audio a −18 LUFS (V-05, contratos C8).

Cada voz de edge sale con un volumen distinto (−19,6 a −22,8 LUFS medidos en la auditoría de 2026-11-13). Las partes
de un capítulo se codifican ANTES de tener el capítulo entero, así que no se puede medir y normalizar al final sin que
partes y capítulo suenen distinto. Por eso:

1. Se parte de una ganancia conocida por voz (la de la tabla, medida en la auditoría; +3 dB si la voz es nueva).
2. Partes y capítulo usan esa ganancia (+ limitador de picos): suenan igual y los tiempos no cambian.
3. Al terminar el capítulo se mide su sonoridad real. Si se aparta más de 0,5 LU del objetivo, el capítulo entero
   (1x y 2x) se codifica con la corrección, y la ganancia de esa voz se ajusta para los capítulos siguientes
   (`cache-voz/volumen.json`, media móvil). Así se calibra solo, también con voces nuevas.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from pathlib import Path

from . import audio

log = logging.getLogger(__name__)

# Ganancia inicial = −18 − LUFS medido a 1x en la auditoría (capítulo de números, 2026-11-13).
GANANCIA_INICIAL = {
    "edge.es-ES-AlvaroNeural": 3.2,
    "edge.es-ES-ElviraNeural": 4.2,
    "edge.es-ES-XimenaNeural": 4.1,
    "edge.es-HN-CarlosNeural": 1.9,
    "edge.es-CO-GonzaloNeural": 4.8,
    "edge.es-CO-SalomeNeural": 2.3,
    "edge.es-MX-JorgeNeural": 1.7,
    "edge.es-US-AlonsoNeural": 1.6,
    "edge.es-AR-TomasNeural": 2.8,
}
GANANCIA_POR_DEFECTO = 3.0
TOPE_GANANCIA = 12.0
TOLERANCIA_LU = 0.5
MIN_SEGUNDOS_MEDIDA = 20.0  # por debajo, la sonoridad integrada es poco fiable
PESO_NUEVA = 0.3  # media móvil de la calibración por voz
ARCHIVO = "volumen.json"

_cerrojo = threading.Lock()


def _ruta(dir_cache: Path) -> Path:
    return dir_cache / ARCHIVO


def _leer(dir_cache: Path) -> dict[str, float]:
    try:
        datos = json.loads(_ruta(dir_cache).read_text(encoding="utf-8"))
        return {str(k): float(v) for k, v in datos.get("ganancias", {}).items()}
    except (OSError, ValueError, AttributeError):
        return {}


def ganancia(dir_cache: Path, voz_id: str) -> float:
    """Ganancia (dB) con la que se codifican las partes y, salvo corrección, el capítulo de esta voz."""
    with _cerrojo:
        guardada = _leer(dir_cache).get(voz_id)
    if guardada is not None:
        return guardada
    return GANANCIA_INICIAL.get(voz_id, GANANCIA_POR_DEFECTO)


def _limitar(g: float) -> float:
    return max(-TOPE_GANANCIA, min(TOPE_GANANCIA, g))


def ajustar(ruta_pcm: Path, duracion: float, dir_cache: Path, voz_id: str, g: float) -> float:
    """Mide el capítulo con la ganancia `g` y devuelve la ganancia final con la que codificarlo; actualiza la
    calibración de la voz. Nunca lanza: si no se puede medir, se queda `g`."""
    if duracion < MIN_SEGUNDOS_MEDIDA:
        return g
    medido = audio.medir_lufs(ruta_pcm, g)
    if medido is None:
        log.warning("No se pudo medir la sonoridad del capítulo (se deja la ganancia %.1f dB)", g)
        return g
    final = _limitar(g + (audio.LUFS_OBJETIVO - medido)) if abs(medido - audio.LUFS_OBJETIVO) > TOLERANCIA_LU else g
    log.info("Sonoridad del capítulo: %.1f LUFS con %.1f dB → se codifica con %.1f dB", medido, g, final)
    try:
        with _cerrojo:
            datos = _leer(dir_cache)
            previa = datos.get(voz_id, GANANCIA_INICIAL.get(voz_id, GANANCIA_POR_DEFECTO))
            datos[voz_id] = round(_limitar(previa + PESO_NUEVA * (final - previa)), 2)
            dir_cache.mkdir(parents=True, exist_ok=True)
            tmp = _ruta(dir_cache).with_name(f"{ARCHIVO}.{uuid.uuid4().hex[:8]}.tmp")
            tmp.write_text(json.dumps({"lufsObjetivo": audio.LUFS_OBJETIVO, "ganancias": datos}), encoding="utf-8")
            os.replace(tmp, _ruta(dir_cache))
    except OSError:
        log.warning("No se pudo guardar la calibración de volumen de %s", voz_id, exc_info=True)
    return final

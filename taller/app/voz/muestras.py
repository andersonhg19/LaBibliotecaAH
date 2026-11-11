"""Muestras de voz (`/datos/muestras/{vozId}.mp3`), generadas al arrancar si faltan. Los fallos solo se registran."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from ..dominio.voces import FRASE_MUESTRA, VOCES
from .motor import EdgeTts

log = logging.getLogger(__name__)


async def _generar(dir_muestras: Path) -> int:
    motor = EdgeTts(concurrencia=2, reintentos=3)  # instancia propia: corre en su propio hilo/bucle
    dir_muestras.mkdir(parents=True, exist_ok=True)
    generadas = 0
    for voz in VOCES:
        destino = dir_muestras / f"{voz['id']}.mp3"
        if destino.exists() and destino.stat().st_size > 0:
            continue
        motor_id, _, nombre = voz["id"].partition(".")
        if motor_id != "edge":
            continue
        try:
            s = await motor.sintetizar(FRASE_MUESTRA, nombre)
            tmp = destino.with_name(destino.name + ".tmp")
            tmp.write_bytes(s.audio)
            os.replace(tmp, destino)
            generadas += 1
            log.info("Muestra de voz generada: %s", destino.name)
        except Exception as e:
            log.warning("No se pudo generar la muestra de %s: %s", voz["id"], e)
    return generadas


def generar_muestras(dir_muestras: Path) -> int:
    try:
        return asyncio.run(_generar(dir_muestras))
    except Exception as e:
        log.warning("Fallo generando muestras de voz: %s", e)
        return 0

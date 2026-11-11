"""Herramienta de línea de comandos para pruebas manuales (sin base de datos).

    python -m app.cli convertir RUTA_ORIGINAL ARCHIVO_ID
    python -m app.cli voz ARCHIVO_ID [VOZ_ID] [CAPITULO]
Usa TALLER_DATOS como raíz (por defecto ./datos-dev). El resultado sale por el log.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import sys
from pathlib import Path

from .config.ajustes import AjustesBasicos
from .config.registro import configurar_logs, contexto
from .config.rutas import Rutas
from .conversion.convertir import convertir
from .dominio.voces import VOZ_POR_DEFECTO
from .voz.capitulo import generar_capitulo
from .voz.motor import motor_para

log = logging.getLogger("app.cli")


def main(argv: list[str]) -> int:
    ajustes = AjustesBasicos()
    configurar_logs(ajustes.log)
    rutas = Rutas(ajustes.datos)
    if len(argv) >= 3 and argv[0] == "convertir":
        origen, archivo_id = Path(argv[1]), argv[2]
        with contexto("cli", archivo_id):
            dir_orig = rutas.originales(archivo_id)
            dir_orig.mkdir(parents=True, exist_ok=True)
            copia = dir_orig / origen.name
            if origen.resolve() != copia.resolve():
                shutil.copyfile(origen, copia)
            r = convertir(copia, rutas.normalizados(archivo_id), archivo_id)
            log.info("Resultado: %s", json.dumps(r.__dict__, ensure_ascii=False))
        return 0
    if len(argv) >= 2 and argv[0] == "voz":
        archivo_id = argv[1]
        voz_id = argv[2] if len(argv) > 2 else VOZ_POR_DEFECTO
        capitulo = int(argv[3]) if len(argv) > 3 else 0
        with contexto("cli", archivo_id):
            motor, voz = motor_para(voz_id, ajustes.concurrencia_voz)
            d = asyncio.run(generar_capitulo(rutas, archivo_id, voz_id, capitulo, motor, voz))
            log.info("Audio generado: duracion=%.2fs destino=%s", d, rutas.audio(archivo_id, voz_id))
        return 0
    log.error("Uso incorrecto.%s", __doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

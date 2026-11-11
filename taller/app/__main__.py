"""Punto de entrada: `python -m app` (API + trabajadores en el mismo proceso).

Valida la configuración antes de arrancar; si falta algo (p. ej. TALLER_DB_URL) termina con código 2 y un
mensaje claro en el log.
"""

from __future__ import annotations

import logging
import sys

import uvicorn

from .api.servidor import crear_app
from .config.ajustes import ErrorDeConfiguracion, cargar_ajustes
from .config.registro import configurar_logs

log = logging.getLogger("app")


def main() -> int:
    configurar_logs()
    try:
        ajustes = cargar_ajustes()
    except ErrorDeConfiguracion as e:
        log.critical("%s", e)
        return 2
    configurar_logs(ajustes.log)
    uvicorn.run(crear_app(ajustes), host="0.0.0.0", port=ajustes.puerto, log_config=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())

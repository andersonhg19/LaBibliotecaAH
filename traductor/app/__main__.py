"""Arranque: ``python -m app`` (un solo proceso; el paralelismo lo da CTranslate2 con sus hilos)."""

from __future__ import annotations

import logging

import uvicorn

from .api import crear_app
from .config import desde_entorno


def main() -> None:
    ajustes = desde_entorno()
    logging.basicConfig(level=ajustes.nivel_log, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    uvicorn.run(
        crear_app(ajustes),
        host="0.0.0.0",
        port=ajustes.puerto,
        access_log=False,
        log_config=None,
        timeout_graceful_shutdown=10,
    )


if __name__ == "__main__":
    main()

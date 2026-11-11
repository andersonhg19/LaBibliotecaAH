"""Logs estructurados (clave=valor) con el id del trabajo y del archivo en cada línea.

El contexto se guarda en `contextvars`, así que se propaga a las tareas asyncio y a `asyncio.to_thread`.
"""

from __future__ import annotations

import contextlib
import contextvars
import logging
from collections.abc import Iterator

_trabajo: contextvars.ContextVar[str] = contextvars.ContextVar("trabajo", default="-")
_archivo: contextvars.ContextVar[str] = contextvars.ContextVar("archivo", default="-")

FORMATO = (
    "%(asctime)s nivel=%(levelname)s hilo=%(threadName)s trabajo=%(trabajo)s archivo=%(archivo)s "
    "origen=%(name)s msg=%(message)s"
)


class FiltroContexto(logging.Filter):
    """Añade `trabajo` y `archivo` a cada registro."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trabajo = _trabajo.get()
        record.archivo = _archivo.get()
        return True


@contextlib.contextmanager
def contexto(trabajo_id: object, archivo_id: object) -> Iterator[None]:
    """Mientras dure el bloque, los logs llevan el trabajo y el archivo."""
    t1 = _trabajo.set(str(trabajo_id))
    t2 = _archivo.set(str(archivo_id))
    try:
        yield
    finally:
        _trabajo.reset(t1)
        _archivo.reset(t2)


def configurar_logs(nivel: str = "INFO") -> None:
    """Configura el logging raíz una sola vez (idempotente)."""
    raiz = logging.getLogger()
    raiz.setLevel(nivel)
    if not any(isinstance(f, FiltroContexto) for h in raiz.handlers for f in h.filters):
        manejador = logging.StreamHandler()
        manejador.setFormatter(logging.Formatter(FORMATO))
        manejador.addFilter(FiltroContexto())
        raiz.addHandler(manejador)
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

"""Ejecución de una conversión en un subproceso con memoria y tiempo acotados (QA SE-01).

Un archivo hostil (zip-bomb, PDF patológico) ya no puede tumbar el contenedor: la conversión corre en un proceso
hijo (`spawn`, sin heredar hilos ni conexiones) con
- tope de memoria virtual (`RLIMIT_AS`): al pasarlo Python lanza `MemoryError` y el hijo lo informa;
- `oom_score_adj = 1000`: si aun así el sistema se queda sin memoria, el núcleo mata al hijo y no al servidor;
- tiempo máximo: al vencer, el padre mata al hijo.
El hijo devuelve el resultado o el error por una tubería; los errores del taller conservan su mensaje humano y
cualquier otro fallo llega como error interno (el detalle técnico queda en el log del hijo).
"""

from __future__ import annotations

import logging
import multiprocessing
import time
from collections.abc import Callable
from multiprocessing.connection import Connection
from typing import Any

from ..config.registro import configurar_logs, contexto
from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, ErrorDeTaller, ErrorReintentable, TrabajoCancelado

log = logging.getLogger(__name__)

MB = 1024 * 1024
SENAL_KILL = 9
_CLASES: dict[str, type[ErrorDeTaller]] = {
    "ErrorDefinitivo": ErrorDefinitivo,
    "ErrorReintentable": ErrorReintentable,
    "TrabajoCancelado": TrabajoCancelado,
}


class ErrorInternoAislado(RuntimeError):
    """Fallo inesperado dentro del subproceso (el trabajador lo convierte en el mensaje genérico del catálogo)."""


def _preparar_hijo(memoria_mb: int) -> None:  # pragma: no cover - corre en el subproceso
    try:
        with open("/proc/self/oom_score_adj", "w", encoding="ascii") as f:
            f.write("1000")
    except OSError:
        log.debug("No se pudo ajustar oom_score_adj", exc_info=True)
    try:
        import resource

        _blando, duro = resource.getrlimit(resource.RLIMIT_AS)
        tope = memoria_mb * MB
        if duro != resource.RLIM_INFINITY:
            tope = min(tope, duro)
        resource.setrlimit(resource.RLIMIT_AS, (tope, duro))
    except (ImportError, ValueError, OSError):
        log.warning("No se pudo limitar la memoria de la conversión", exc_info=True)


def _hijo(  # pragma: no cover - corre en el subproceso (sus ramas se prueban por su efecto en el padre)
    conexion: Connection,
    funcion: Callable[..., Any],
    args: tuple[Any, ...],
    memoria_mb: int,
    nivel_log: str,
    ids: tuple[str, str],
) -> None:
    configurar_logs(nivel_log)
    with contexto(*ids):
        _preparar_hijo(memoria_mb)
        try:
            conexion.send(("ok", funcion(*args)))
        except ErrorDeTaller as e:
            if e.detalle:
                log.warning("Detalle técnico: %s", e.detalle)
            conexion.send(("taller", type(e).__name__, str(e), e.detalle))
        except MemoryError:
            log.error("La conversión superó el tope de memoria (%d MB)", memoria_mb)
            conexion.send(("memoria",))
        except BaseException as e:
            log.exception("Fallo inesperado en la conversión")
            conexion.send(("interno", f"{type(e).__name__}: {e}"[:1000]))
        finally:
            conexion.close()


def ejecutar_aislado(
    funcion: Callable[..., Any],
    args: tuple[Any, ...],
    *,
    memoria_mb: int,
    tiempo_seg: float,
    ids: tuple[str, str] = ("-", "-"),
) -> Any:
    """Ejecuta `funcion(*args)` en un subproceso acotado y devuelve su resultado (o relanza su error)."""
    ctx = multiprocessing.get_context("spawn")
    receptor, emisor = ctx.Pipe(duplex=False)
    nivel = logging.getLevelName(logging.getLogger().getEffectiveLevel())
    proceso = ctx.Process(
        target=_hijo, args=(emisor, funcion, args, memoria_mb, nivel, ids), name="conversion-aislada", daemon=True
    )
    proceso.start()
    emisor.close()
    inicio = time.monotonic()
    respuesta: tuple[Any, ...] | None = None
    try:
        while True:
            if receptor.poll(0.2):
                try:
                    respuesta = receptor.recv()
                except EOFError:  # el hijo murió sin responder
                    respuesta = None
                break
            if not proceso.is_alive() and not receptor.poll(0):
                break
            if time.monotonic() - inicio > tiempo_seg:
                log.error("La conversión superó el tiempo máximo (%.0f s): se detiene", tiempo_seg)
                proceso.kill()
                raise ErrorDefinitivo(Msj.CONVERSION_DEMASIADO_LARGA, minutos=max(1, round(tiempo_seg / 60)))
    finally:
        proceso.join(10)
        if proceso.is_alive():
            proceso.kill()
            proceso.join(5)
        receptor.close()
    return _interpretar(respuesta, proceso.exitcode)


def _interpretar(respuesta: tuple[Any, ...] | None, exitcode: int | None) -> Any:
    if respuesta is None:
        log.error("El subproceso de conversión terminó sin responder (código %s)", exitcode)
        if exitcode == -SENAL_KILL:  # típico del OOM killer: reintentar volvería a matarlo
            raise ErrorDefinitivo(Msj.CONVERSION_INTERRUMPIDA)
        raise ErrorReintentable(Msj.CONVERSION_INTERRUMPIDA)
    tipo = respuesta[0]
    if tipo == "ok":
        return respuesta[1]
    if tipo == "taller":
        clase = _CLASES.get(respuesta[1], ErrorDeTaller)
        error = clase(respuesta[2])
        error.detalle = respuesta[3]
        raise error
    if tipo == "memoria":
        raise ErrorDefinitivo(Msj.CONVERSION_SIN_MEMORIA)
    raise ErrorInternoAislado(respuesta[1])

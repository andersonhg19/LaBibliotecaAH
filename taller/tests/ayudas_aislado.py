"""Funciones que se ejecutan en el subproceso de conversión aislada (deben poder importarse por nombre)."""

import os
import signal
import time

from app.dominio.mensajes import Msj
from app.dominio.modelo import ErrorDefinitivo


def doble(x: int) -> int:
    return x * 2


def agotar_memoria() -> int:
    bloques = [bytearray(256 * 1024 * 1024) for _ in range(16)]  # 4 GB
    return len(bloques)


def dormir(segundos: float) -> None:
    time.sleep(segundos)


def fallar_con_mensaje() -> None:
    raise ErrorDefinitivo(Msj.PDF_DANADO)


def fallar_raro() -> None:
    raise ValueError("All strings must be XML compatible: Unicode or ASCII, no NULL bytes or control characters")


def morir_por_oom() -> None:
    os.kill(os.getpid(), signal.SIGKILL)


def salir_sin_responder() -> None:
    os._exit(3)

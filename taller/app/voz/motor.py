"""Motores de voz detrás de una interfaz común (plan-maestro §6.1)."""

from __future__ import annotations

import asyncio
import logging
import random
import threading
import weakref
from dataclasses import dataclass, field
from typing import Protocol

from ..dominio.mensajes import Msj
from ..dominio.modelo import ErrorDefinitivo, ErrorReintentable

log = logging.getLogger(__name__)


@dataclass
class Sintesis:
    audio: bytes  # MP3
    formato: str = "mp3"
    # (texto hablado, t0, t1) en segundos relativos al inicio del audio de la frase
    palabras: list[tuple[str, float, float]] = field(default_factory=list)


class MotorDeVoz(Protocol):
    nombre: str
    version: str  # entra en la clave de caché: cambiarla invalida el audio guardado

    async def sintetizar(self, texto: str, voz: str) -> Sintesis: ...


class EdgeTts:
    """Microsoft Edge "Leer en voz alta" vía `edge-tts` (endpoint no oficial; puede romperse → reintentos)."""

    nombre = "edge"
    version = "edge-tts-7/48k-mono-mp3/v1"

    def __init__(self, concurrencia: int = 4, reintentos: int = 5, pausa_base: float = 1.5):
        # un semáforo por bucle de eventos: cada trabajo corre su propio asyncio.run y puede haber varios hilos de
        # voz a la vez (QA DA-19); compartir uno entre bucles daría "bound to a different event loop"
        self._semaforos: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
            weakref.WeakKeyDictionary()
        )
        self._cerrojo = threading.Lock()
        self._concurrencia = concurrencia
        self.reintentos = reintentos
        self.pausa_base = pausa_base

    def fijar_concurrencia(self, n: int) -> None:
        """Tope de síntesis simultáneas SOLO para el bucle de eventos actual (un trabajo): el capítulo que alguien
        escucha va con más que las precargas (v1.5)."""
        bucle = asyncio.get_running_loop()
        with self._cerrojo:
            self._semaforos[bucle] = asyncio.Semaphore(max(1, n))

    def _sem(self) -> asyncio.Semaphore:
        bucle = asyncio.get_running_loop()
        with self._cerrojo:
            sem = self._semaforos.get(bucle)
            if sem is None:
                sem = asyncio.Semaphore(self._concurrencia)
                self._semaforos[bucle] = sem
            return sem

    async def sintetizar(self, texto: str, voz: str) -> Sintesis:
        async with self._sem():
            return await self._sintetizar(texto, voz)

    async def sintetizar_sin_cola(self, texto: str, voz: str) -> Sintesis:
        """Sin esperar turno en el semáforo: el duplicado de una frase del arranque que tarda (v1.5)."""
        return await self._sintetizar(texto, voz)

    async def _sintetizar(self, texto: str, voz: str) -> Sintesis:
        import edge_tts

        ultimo: Exception | None = None
        for intento in range(1, self.reintentos + 1):
            try:
                com = edge_tts.Communicate(texto, voz, boundary="WordBoundary")
                audio = bytearray()
                palabras: list[tuple[str, float, float]] = []
                async for trozo in com.stream():
                    tipo = trozo.get("type")
                    if tipo == "audio":
                        audio.extend(trozo["data"])
                    elif tipo == "WordBoundary":
                        t0 = trozo["offset"] / 1e7
                        palabras.append((trozo["text"], t0, t0 + trozo["duration"] / 1e7))
                if not audio:
                    raise ConnectionError("edge-tts no devolvió audio")
                return Sintesis(bytes(audio), "mp3", palabras)
            except Exception as e:  # 403, desconexiones, límites…
                if isinstance(e, ValueError) and "voice" in str(e).lower():
                    # "Invalid voice": no es una caída del servicio, no se reintenta (QA DA-12)
                    raise ErrorDefinitivo(Msj.VOZ_DESCONOCIDA, voz=voz, detalle=str(e)) from e
                ultimo = e
                espera = self.pausa_base * (2 ** (intento - 1)) + random.uniform(0, 0.5)
                log.warning(
                    "edge-tts falló (intento %d/%d, voz %s): %s — reintento en %.1fs",
                    intento,
                    self.reintentos,
                    voz,
                    e,
                    espera,
                )
                if intento < self.reintentos:
                    await asyncio.sleep(espera)
        raise ErrorReintentable(Msj.SERVICIO_VOZ_CAIDO, detalle=f"edge-tts, {self.reintentos} intentos: {ultimo}")


class PiperLocal:
    """Respaldo local sin internet (Piper, CPU).

    TODO (Ola 3+): descargar el modelo (es_ES-davefx-medium / carlfm / sharvard) en /datos/modelos/piper,
    invocar `piper --model ... --output_raw --json-input` y obtener tiempos por fonema → palabra.
    No se descargan modelos grandes todavía.
    """

    nombre = "piper"
    version = "piper/pendiente"

    async def sintetizar(self, texto: str, voz: str) -> Sintesis:
        raise ErrorDefinitivo(Msj.MOTOR_NO_DISPONIBLE, motor="Piper")


_EDGE: EdgeTts | None = None


def motor_para(voz_id: str, concurrencia: int = 4) -> tuple[MotorDeVoz, str]:
    """`edge.es-ES-AlvaroNeural` → (EdgeTts, "es-ES-AlvaroNeural")."""
    global _EDGE
    motor, _, voz = voz_id.partition(".")
    if not voz:
        raise ValueError(f"vozId inválido: {voz_id}")
    if motor == "edge":
        if _EDGE is None:
            _EDGE = EdgeTts(concurrencia=concurrencia)
        return _EDGE, voz
    if motor == "piper":
        return PiperLocal(), voz
    raise ValueError(f"Motor de voz desconocido: {motor}")

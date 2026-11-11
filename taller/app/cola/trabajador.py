"""Bucle de trabajadores: sondea la cola, ejecuta el manejador del tipo y registra el resultado.

- Dos hilos: uno para CONVERTIR y otro para VOZ_CAPITULO (la voz nunca bloquea conversiones).
- Máx. `max_intentos` (3): un fallo con intentos < 3 vuelve a PENDIENTE; al 3.º queda ERROR.
- `ErrorDefinitivo` (formato no soportado, PDF escaneado…) va directo a ERROR: reintentar no lo arregla.
- Ninguna excepción mata el bucle y ninguna se traga sin log.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections.abc import Callable
from typing import Any

from ..config.registro import contexto
from ..config.rutas import Rutas
from ..conversion.convertir import VERSION_TEXTO, buscar_original, convertir
from ..dominio.mensajes import Msj, texto
from ..dominio.modelo import ErrorDefinitivo, ErrorDeTaller
from ..voz.capitulo import generar_capitulo
from ..voz.motor import motor_para
from .repositorio import Repositorio

log = logging.getLogger(__name__)

Trabajo = dict[str, Any]


def _payload(trabajo: Trabajo) -> dict[str, Any]:
    p = trabajo.get("payload") or {}
    if isinstance(p, str):
        p = json.loads(p or "{}")
    return dict(p)


class Manejador:
    """Ejecuta un tipo de trabajo y sabe cómo reflejar su fallo en la tabla de destino."""

    tipos: tuple[str, ...] = ()
    mensaje_interno: Msj = Msj.ERROR_INTERNO_CONVERSION

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        raise NotImplementedError

    def al_fallar(self, trabajo: Trabajo, repo: Repositorio, mensaje: str, definitivo: bool) -> None:
        """Por defecto no hay tabla de destino que actualizar."""


class ManejadorConvertir(Manejador):
    """CONVERTIR: original → normalizados/{archivoId}/ y actualización de bah_lib_archivo."""

    tipos = ("CONVERTIR",)
    mensaje_interno = Msj.ERROR_INTERNO_CONVERSION

    def __init__(self, rutas: Rutas):
        self.rutas = rutas

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        repo.archivo_procesando(archivo_id)
        original = buscar_original(self.rutas.originales(archivo_id))
        r = convertir(original, self.rutas.normalizados(archivo_id), archivo_id)
        repo.archivo_listo(
            archivo_id, r.metadatos, r.n_capitulos, r.n_palabras, r.minutos_estimados, r.tiene_portada, VERSION_TEXTO
        )
        log.info(
            "Convertido: capitulos=%d frases=%d palabras=%d portada=%s",
            r.n_capitulos,
            r.total_frases,
            r.n_palabras,
            r.tiene_portada,
        )

    def al_fallar(self, trabajo: Trabajo, repo: Repositorio, mensaje: str, definitivo: bool) -> None:
        repo.archivo_estado(str(trabajo["archivo_id"]), "ERROR" if definitivo else "PENDIENTE", mensaje)


class ManejadorVoz(Manejador):
    """VOZ_CAPITULO: audio 1x/2x + tiempos de un capítulo y upsert en bah_lib_audio."""

    tipos = ("VOZ_CAPITULO",)
    mensaje_interno = Msj.ERROR_INTERNO_VOZ

    def __init__(self, rutas: Rutas, concurrencia: int = 4):
        self.rutas = rutas
        self.concurrencia = concurrencia

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        p = _payload(trabajo)
        voz_id = p.get("vozId")
        capitulo = p.get("capitulo")
        if not voz_id or capitulo is None:
            raise ErrorDefinitivo(Msj.TRABAJO_VOZ_INCOMPLETO)
        try:
            motor, voz_motor = motor_para(str(voz_id), self.concurrencia)
        except ValueError as e:
            raise ErrorDefinitivo(Msj.VOZ_DESCONOCIDA, voz=voz_id) from e
        repo.audio_estado(archivo_id, str(voz_id), int(capitulo), "GENERANDO")
        duracion = asyncio.run(
            generar_capitulo(
                self.rutas,
                archivo_id,
                str(voz_id),
                int(capitulo),
                motor,
                voz_motor,
                latido=lambda: repo.latido(trabajo["id"]),
            )
        )
        repo.audio_estado(archivo_id, str(voz_id), int(capitulo), "LISTO", duracion=round(duracion, 2))
        log.info("Audio listo: voz=%s capitulo=%s duracion=%.1fs", voz_id, capitulo, duracion)

    def al_fallar(self, trabajo: Trabajo, repo: Repositorio, mensaje: str, definitivo: bool) -> None:
        p = _payload(trabajo)
        if p.get("vozId") and p.get("capitulo") is not None:
            repo.audio_estado(
                str(trabajo["archivo_id"]),
                str(p["vozId"]),
                int(p["capitulo"]),
                "ERROR" if definitivo else "PENDIENTE",
                error=mensaje,
            )


def mensaje_de(e: BaseException, manejador: Manejador, intentos: int) -> str:
    """Mensaje claro para el usuario: el del catálogo o uno genérico con el detalle técnico al final."""
    if isinstance(e, ErrorDeTaller):
        return str(e)
    return texto(manejador.mensaje_interno, intentos=intentos, detalle=f"{type(e).__name__}: {e}")[:2000]


def procesar(trabajo: Trabajo, manejador: Manejador, repo: Repositorio, max_intentos: int) -> str:
    """Ejecuta un trabajo ya tomado. Devuelve el estado final del trabajo (HECHO | PENDIENTE | ERROR)."""
    with contexto(trabajo["id"], trabajo.get("archivo_id")):
        tid = trabajo["id"]
        intentos = int(trabajo.get("intentos") or 1)
        if intentos > max_intentos:
            log.warning("Intentos agotados (%d > %d): se marca ERROR sin ejecutar", intentos, max_intentos)
            msg = trabajo.get("error") or texto(Msj.INTENTOS_AGOTADOS)
            _registrar_fallo(trabajo, manejador, repo, str(msg), True)
            return "ERROR"
        try:
            manejador.ejecutar(trabajo, repo)
            repo.marcar_hecho(tid)
            return "HECHO"
        except Exception as e:
            definitivo = isinstance(e, ErrorDefinitivo) or intentos >= max_intentos
            msg = mensaje_de(e, manejador, intentos)
            if isinstance(e, ErrorDefinitivo):
                log.warning("Sin solución al reintentar: %s", msg)
            else:
                log.exception("Falló (intento %d/%d, definitivo=%s): %s", intentos, max_intentos, definitivo, msg)
            _registrar_fallo(trabajo, manejador, repo, msg, definitivo)
            return "ERROR" if definitivo else "PENDIENTE"


def _registrar_fallo(trabajo: Trabajo, manejador: Manejador, repo: Repositorio, msg: str, definitivo: bool) -> None:
    try:
        manejador.al_fallar(trabajo, repo, msg, definitivo)
    except Exception:
        log.exception("No se pudo registrar el fallo en la tabla de destino")
    try:
        repo.marcar_fallo(trabajo["id"], msg, definitivo)
    except Exception:
        log.exception("No se pudo registrar el fallo del trabajo")


class Trabajador(threading.Thread):
    """Hilo que sondea la cola cada `intervalo` segundos y procesa los trabajos de sus tipos."""

    def __init__(
        self,
        nombre: str,
        manejador: Manejador,
        fabrica_repo: Callable[[], Repositorio],
        intervalo: float,
        max_intentos: int,
        parar: threading.Event,
    ):
        super().__init__(name=nombre, daemon=True)
        self.manejador = manejador
        self.fabrica_repo = fabrica_repo
        self.intervalo = intervalo
        self.max_intentos = max_intentos
        self.parar = parar
        self.procesados = 0
        self.ultimo_error: str | None = None

    def run(self) -> None:
        log.info("Trabajador iniciado: tipos=%s", ",".join(self.manejador.tipos))
        repo: Repositorio | None = None
        while not self.parar.is_set():
            try:
                if repo is None:
                    repo = self.fabrica_repo()
                trabajo = repo.tomar(list(self.manejador.tipos))
                if trabajo is None:
                    self.parar.wait(self.intervalo)
                    continue
                with contexto(trabajo["id"], trabajo["archivo_id"]):
                    log.info("Trabajo tomado: tipo=%s intento=%s", trabajo["tipo"], trabajo.get("intentos"))
                procesar(trabajo, self.manejador, repo, self.max_intentos)
                self.procesados += 1
                self.ultimo_error = None
            except Exception as e:  # BD caída, etc.: se registra, se reconecta y se espera
                self.ultimo_error = str(e)
                log.exception("Error en el bucle del trabajador; se reintenta")
                if repo is not None:
                    repo.cerrar()
                    repo = None
                self.parar.wait(max(self.intervalo, 5))
        if repo is not None:
            repo.cerrar()
        log.info("Trabajador detenido")

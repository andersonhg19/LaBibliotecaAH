"""Bucle de trabajadores: sondea la cola, ejecuta el manejador del tipo y registra el resultado.

- (v1.4) Un hilo para RELEER_METADATOS (relleno de géneros: solo lee las materias del original).
- (0.4.0) Un hilo para RECLASIFICAR_ESTRUCTURA (tipo de cada capítulo de un libro ya convertido, sin reconvertir).
- Un hilo para CONVERTIR y `hilos_voz` (2) para VOZ_CAPITULO: la voz nunca bloquea conversiones y un capítulo
  largo no deja esperando a los demás (QA DA-19).
- Máx. `max_intentos` (3): un fallo con intentos < 3 vuelve a PENDIENTE; al 3.º queda ERROR.
- `ErrorDefinitivo` (formato no soportado, PDF escaneado, voz inexistente…) va directo a ERROR.
- `TrabajoCancelado` (el libro se retiró mientras se procesaba): se limpia lo escrito y no se toca nada más.
- Mientras un trabajo corre, un hilo de latido refresca `actualizado` cada `intervalo_latido` s; el `Barrendero`
  devuelve a PENDIENTE los EN_CURSO sin latido (QA DA-01).
- La conversión corre en un subproceso con memoria y tiempo acotados (QA SE-01).
- Al usuario solo llegan mensajes del catálogo; el detalle técnico va al log. Ninguna excepción mata el bucle.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import threading
from collections.abc import Callable
from typing import Any

from ..config.registro import contexto
from ..config.rutas import Rutas
from ..conversion.aislado import ejecutar_aislado
from ..conversion.convertir import VERSION_TEXTO, buscar_original, convertir
from ..conversion.materias import leer_materias
from ..conversion.reclasificar import reclasificar
from ..dominio.mensajes import Msj, texto
from ..dominio.modelo import ErrorDefinitivo, ErrorDeTaller, TrabajoCancelado
from ..dominio.voces import voz_conocida
from ..voz.capitulo import borrar_audio_capitulo, generar_capitulo, limpiar_partes_viejas
from ..voz.lectura import reglas_de_pronunciacion
from ..voz.motor import motor_para
from .repositorio import Repositorio

log = logging.getLogger(__name__)

Trabajo = dict[str, Any]
INTERVALO_LATIDO = 60.0


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

    def __init__(self, rutas: Rutas, aislar: bool = True, memoria_mb: int = 1536, tiempo_seg: float = 1200):
        self.rutas = rutas
        self.aislar = aislar
        self.memoria_mb = memoria_mb
        self.tiempo_seg = tiempo_seg

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        if not repo.archivo_procesando(archivo_id):
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
        original = buscar_original(self.rutas.originales(archivo_id))
        destino = self.rutas.normalizados(archivo_id)
        if self.aislar:
            r = ejecutar_aislado(
                convertir,
                (original, destino, archivo_id),
                memoria_mb=self.memoria_mb,
                tiempo_seg=self.tiempo_seg,
                ids=(str(trabajo["id"]), archivo_id),
            )
        else:
            r = convertir(original, destino, archivo_id)
        retirado = not original.exists() or not repo.archivo_listo(
            archivo_id, r.metadatos, r.n_capitulos, r.n_palabras, r.minutos_estimados, r.tiene_portada, VERSION_TEXTO
        )
        if retirado:  # el libro se retiró mientras se convertía: no se deja nada huérfano (QA DA-14)
            shutil.rmtree(destino, ignore_errors=True)
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
        log.info(
            "Convertido: capitulos=%d frases=%d palabras=%d portada=%s",
            r.n_capitulos,
            r.total_frases,
            r.n_palabras,
            r.tiene_portada,
        )

    def al_fallar(self, trabajo: Trabajo, repo: Repositorio, mensaje: str, definitivo: bool) -> None:
        repo.archivo_estado(str(trabajo["archivo_id"]), "ERROR" if definitivo else "PENDIENTE", mensaje)


class ManejadorMetadatos(Manejador):
    """RELEER_METADATOS (v1.4): materias del original → `metadatos.materias` del archivo, sin reconvertir.

    No toca título, autores, portada ni el EPUB normalizado. Un original que falta o no se puede leer deja la lista
    vacía (el archivo queda «releído» y el relleno no lo vuelve a encolar). Un fallo no cambia el estado del archivo.
    """

    tipos = ("RELEER_METADATOS",)

    def __init__(self, rutas: Rutas):
        self.rutas = rutas

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        try:
            materias = leer_materias(buscar_original(self.rutas.originales(archivo_id)))
        except ErrorDefinitivo as e:
            log.warning("Relectura de materias sin original: %s", e)
            materias = []
        if repo.archivo_materias(archivo_id, materias):
            log.info("Materias releídas: %d (%s)", len(materias), "; ".join(materias))
        else:
            log.info("Relectura de materias descartada: el archivo ya no existe o no está LISTO")


class ManejadorReclasificar(Manejador):
    """RECLASIFICAR_ESTRUCTURA (0.4.0, contratos C2): añade tipo/región/número/enVoz a los capítulos de un libro ya
    convertido, sin cambiar sus índices ni reconvertirlo. Lee el original en un subproceso acotado (como la
    conversión). Un libro sin `estructura.json` o sin original no es un error: se registra y el trabajo termina."""

    tipos = ("RECLASIFICAR_ESTRUCTURA",)

    def __init__(self, rutas: Rutas, aislar: bool = True, memoria_mb: int = 1536, tiempo_seg: float = 1200):
        self.rutas = rutas
        self.aislar = aislar
        self.memoria_mb = memoria_mb
        self.tiempo_seg = tiempo_seg

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        try:
            original = buscar_original(self.rutas.originales(archivo_id))
        except ErrorDefinitivo:
            original = None
        args = (self.rutas.normalizados(archivo_id), original)
        if self.aislar:
            r = ejecutar_aislado(
                reclasificar,
                args,
                memoria_mb=self.memoria_mb,
                tiempo_seg=self.tiempo_seg,
                ids=(str(trabajo["id"]), archivo_id),
            )
        else:
            r = reclasificar(*args)
        log.info("Reclasificación de la estructura: %s", r)


class ManejadorVoz(Manejador):
    """VOZ_CAPITULO: audio 1x/2x + tiempos de un capítulo y upsert en bah_lib_audio."""

    tipos = ("VOZ_CAPITULO",)
    mensaje_interno = Msj.ERROR_INTERNO_VOZ

    def __init__(
        self, rutas: Rutas, concurrencia: int = 4, concurrencia_urgente: int | None = None, prioridad_urgente: int = 10
    ):
        self.rutas = rutas
        self.concurrencia = concurrencia
        # (v1.5) el capítulo que alguien escucha (prioridad <= prioridad_urgente) se sintetiza con más concurrencia
        self.concurrencia_urgente = concurrencia_urgente or concurrencia
        self.prioridad_urgente = prioridad_urgente

    def ejecutar(self, trabajo: Trabajo, repo: Repositorio) -> None:
        archivo_id = str(trabajo["archivo_id"])
        p = _payload(trabajo)
        voz_id = p.get("vozId")
        capitulo = p.get("capitulo")
        if not voz_id or capitulo is None:
            raise ErrorDefinitivo(Msj.TRABAJO_VOZ_INCOMPLETO)
        voz_id, capitulo = str(voz_id), int(capitulo)
        # Voz fuera del catálogo: error definitivo inmediato, sin llamar al servicio ni reintentar (QA DA-12)
        if not voz_conocida(voz_id):
            raise ErrorDefinitivo(Msj.VOZ_DESCONOCIDA, voz=voz_id)
        try:
            motor, voz_motor = motor_para(voz_id, self.concurrencia)
        except ValueError as e:
            raise ErrorDefinitivo(Msj.VOZ_DESCONOCIDA, voz=voz_id) from e

        def sigue_existiendo() -> bool:
            return self.rutas.normalizados(archivo_id).is_dir()

        # (B17) Regenerar un capítulo ya LISTO (cambió el diccionario de pronunciación): el estado sigue LISTO y el
        # audio viejo sonando mientras se genera el nuevo, sin partes; los m4a y tiempos se sustituyen de forma
        # atómica al terminar. Si no hay audio que conservar, es una generación normal.
        regenerar = bool(p.get("regenerar")) and self._hay_audio(archivo_id, voz_id, capitulo)
        if regenerar:
            if not sigue_existiendo():
                raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
            log.info("Regenerando el capítulo %s (%s) con el diccionario de pronunciación nuevo", capitulo, voz_id)
        elif not repo.audio_estado(archivo_id, voz_id, capitulo, "GENERANDO"):
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)

        duracion = asyncio.run(
            generar_capitulo(
                self.rutas,
                archivo_id,
                voz_id,
                capitulo,
                motor,
                voz_motor,
                latido=lambda: repo.latido(trabajo["id"]),
                seguir=sigue_existiendo,
                concurrencia=self._concurrencia_de(trabajo),
                urgente=self._es_urgente(trabajo),
                pronunciacion=reglas_de_pronunciacion(p.get("pronunciacion")),
                partes=not regenerar,
            )
        )
        listo = sigue_existiendo() and repo.audio_estado(
            archivo_id, voz_id, capitulo, "LISTO", duracion=round(duracion, 2)
        )
        if not listo:  # retirado mientras se generaba: se borra lo escrito (QA DA-28)
            borrar_audio_capitulo(self.rutas, archivo_id, voz_id, capitulo)
            raise TrabajoCancelado(Msj.ARCHIVO_RETIRADO)
        log.info("Audio listo: voz=%s capitulo=%s duracion=%.1fs", voz_id, capitulo, duracion)
        limpiar_partes_viejas(self.rutas)  # (v1.5) partes de capítulos ya enteros (al final: no retrasa el arranque)

    def _hay_audio(self, archivo_id: str, voz_id: str, capitulo: int) -> bool:
        base = self.rutas.audio(archivo_id, voz_id) / f"cap-{capitulo:03d}"
        return all(base.with_name(base.name + sufijo).is_file() for sufijo in (".m4a", "-2x.m4a", ".tiempos.json"))

    def _es_urgente(self, trabajo: Trabajo) -> bool:
        prioridad = trabajo.get("prioridad")
        return prioridad is not None and int(prioridad) <= self.prioridad_urgente

    def _concurrencia_de(self, trabajo: Trabajo) -> int:
        return self.concurrencia_urgente if self._es_urgente(trabajo) else self.concurrencia

    def al_fallar(self, trabajo: Trabajo, repo: Repositorio, mensaje: str, definitivo: bool) -> None:
        p = _payload(trabajo)
        # (B17) una regeneración que falla no estropea el audio que ya sonaba: sigue LISTO
        if (
            p.get("regenerar")
            and p.get("vozId")
            and p.get("capitulo") is not None
            and self._hay_audio(str(trabajo["archivo_id"]), str(p["vozId"]), int(p["capitulo"]))
        ):
            log.warning(
                "La regeneración del capítulo %s (%s) falló; queda el audio anterior", p["capitulo"], p["vozId"]
            )
            return
        if p.get("vozId") and p.get("capitulo") is not None:
            repo.audio_estado(
                str(trabajo["archivo_id"]),
                str(p["vozId"]),
                int(p["capitulo"]),
                "ERROR" if definitivo else "PENDIENTE",
                error=mensaje,
            )


def mensaje_de(e: BaseException, manejador: Manejador) -> str:
    """Mensaje para el usuario: el del catálogo. Nunca nombres de excepciones ni salidas de programas (QA DA-20)."""
    if isinstance(e, ErrorDeTaller):
        return str(e)
    return texto(manejador.mensaje_interno)


class Latido:
    """Hilo que refresca `actualizado` del trabajo mientras se ejecuta (para el barrido de colgados)."""

    def __init__(self, repo: Repositorio, trabajo_id: Any, intervalo: float):
        self.repo = repo
        self.trabajo_id = trabajo_id
        self.intervalo = intervalo
        self.latidos = 0
        self._fin = threading.Event()
        self._hilo = threading.Thread(target=self._latir, name=f"{threading.current_thread().name}-latido", daemon=True)

    def _latir(self) -> None:
        while not self._fin.wait(self.intervalo):
            try:
                self.repo.latido(self.trabajo_id)
                self.latidos += 1
            except Exception as e:
                log.warning("Latido fallido: %s", e)

    def __enter__(self) -> Latido:
        self._hilo.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._fin.set()
        self._hilo.join(5)


def procesar(
    trabajo: Trabajo,
    manejador: Manejador,
    repo: Repositorio,
    max_intentos: int,
    intervalo_latido: float = INTERVALO_LATIDO,
) -> str:
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
            with Latido(repo, tid, intervalo_latido):
                manejador.ejecutar(trabajo, repo)
            repo.marcar_hecho(tid)
            return "HECHO"
        except TrabajoCancelado as e:
            log.info("Trabajo cancelado: %s", e)
            try:
                repo.marcar_fallo(tid, str(e), True)
            except Exception:
                log.exception("No se pudo registrar la cancelación del trabajo")
            return "ERROR"
        except Exception as e:
            definitivo = isinstance(e, ErrorDefinitivo) or intentos >= max_intentos
            msg = mensaje_de(e, manejador)
            detalle = getattr(e, "detalle", None)
            if isinstance(e, ErrorDefinitivo):
                log.warning("Sin solución al reintentar: %s%s", msg, f" (detalle: {detalle})" if detalle else "")
            else:
                log.exception(
                    "Falló (intento %d/%d, definitivo=%s): %s%s",
                    intentos,
                    max_intentos,
                    definitivo,
                    msg,
                    f" (detalle: {detalle})" if detalle else "",
                )
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
        intervalo_latido: float = INTERVALO_LATIDO,
        prioridad_max: int | None = None,
    ):
        super().__init__(name=nombre, daemon=True)
        self.manejador = manejador
        self.fabrica_repo = fabrica_repo
        self.intervalo = intervalo
        self.max_intentos = max_intentos
        self.parar = parar
        self.intervalo_latido = intervalo_latido
        # (v1.5) hilo reservado: solo toma trabajos con prioridad <= prioridad_max (el capítulo que se escucha)
        self.prioridad_max = prioridad_max
        self.procesados = 0
        self.ultimo_error: str | None = None

    def run(self) -> None:
        log.info("Trabajador iniciado: tipos=%s", ",".join(self.manejador.tipos))
        repo: Repositorio | None = None
        while not self.parar.is_set():
            try:
                if repo is None:
                    repo = self.fabrica_repo()
                tipos = list(self.manejador.tipos)
                trabajo = repo.tomar(tipos) if self.prioridad_max is None else repo.tomar(tipos, self.prioridad_max)
                if trabajo is None:
                    self.parar.wait(self.intervalo)
                    continue
                with contexto(trabajo["id"], trabajo["archivo_id"]):
                    log.info("Trabajo tomado: tipo=%s intento=%s", trabajo["tipo"], trabajo.get("intentos"))
                procesar(trabajo, self.manejador, repo, self.max_intentos, self.intervalo_latido)
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


class Barrendero(threading.Thread):
    """Cada `intervalo` s devuelve a PENDIENTE los trabajos EN_CURSO sin latido desde hace `segundos_atascado`
    (un hilo colgado o un proceso que murió sin que el contenedor se reiniciara, QA DA-01)."""

    def __init__(
        self,
        fabrica_repo: Callable[[], Repositorio],
        tipos: list[str],
        segundos_atascado: int,
        intervalo: float,
        parar: threading.Event,
    ):
        super().__init__(name="barrendero", daemon=True)
        self.fabrica_repo = fabrica_repo
        self.tipos = tipos
        self.segundos_atascado = segundos_atascado
        self.intervalo = intervalo
        self.parar = parar
        self.barridos = 0
        self.devueltos = 0

    def barrer(self) -> int:
        repo = self.fabrica_repo()
        try:
            n = repo.reiniciar_atascados(self.segundos_atascado, self.tipos)
        finally:
            repo.cerrar()
        self.barridos += 1
        self.devueltos += n
        if n:
            log.warning("Trabajos EN_CURSO sin latido devueltos a PENDIENTE: %d", n)
        return n

    def run(self) -> None:
        while not self.parar.wait(self.intervalo):
            try:
                self.barrer()
            except Exception:
                log.exception("No se pudo barrer los trabajos colgados (se reintenta en el próximo barrido)")

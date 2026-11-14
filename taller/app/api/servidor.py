"""API HTTP del taller (FastAPI) y arranque de los trabajadores en segundo plano (mismo proceso).

- GET /salud  → estado del proceso, de los trabajadores y del volumen /datos.
- GET /voces  → catálogo de voces (contratos.md §8).
Al arrancar: devuelve a PENDIENTE TODOS los trabajos EN_CURSO del taller (con un único taller por base de datos,
lo que estaba EN_CURSO murió con el proceso anterior; QA DA-01), inicia un hilo para CONVERTIR, uno para
RELEER_METADATOS, uno para RECLASIFICAR_ESTRUCTURA (0.4.0) y `hilos_voz` para
VOZ_CAPITULO (más uno reservado al capítulo que se escucha, v1.5), un barrendero que cada minuto devuelve a
PENDIENTE los EN_CURSO sin latido, y genera en otro hilo las muestras de voz que falten.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from .. import __version__
from ..cola.repositorio import Repositorio, RepositorioPg
from ..cola.trabajador import (
    Barrendero,
    ManejadorConvertir,
    ManejadorMetadatos,
    ManejadorReclasificar,
    ManejadorVoz,
    Trabajador,
)
from ..config.ajustes import Ajustes
from ..config.rutas import Rutas
from ..dominio.voces import listar_voces
from ..voz.muestras import generar_muestras

log = logging.getLogger(__name__)


class Taller:
    """Estado del proceso: ajustes, rutas, hilos de trabajo."""

    def __init__(self, ajustes: Ajustes):
        self.ajustes = ajustes
        self.rutas = Rutas(ajustes.datos)
        self.parar = threading.Event()
        self.trabajadores: list[Trabajador] = []
        self.barrendero: Barrendero | None = None

    def fabrica_repo(self) -> Repositorio:
        return RepositorioPg(self.ajustes.db_url)

    def iniciar(self) -> None:
        a = self.ajustes
        try:
            self.rutas.raiz.mkdir(parents=True, exist_ok=True)
        except OSError:
            log.exception("El volumen de datos %s no está disponible", self.rutas.raiz)
        if a.muestras:
            threading.Thread(
                target=generar_muestras, args=(self.rutas.muestras(),), name="muestras", daemon=True
            ).start()
        if not a.trabajadores:
            log.warning("Trabajadores desactivados (TALLER_TRABAJADORES=false)")
            return
        conversion = ManejadorConvertir(
            self.rutas, a.aislar_conversion, a.memoria_conversion_mb, a.tiempo_conversion_seg
        )
        voz = ManejadorVoz(self.rutas, a.concurrencia_voz, a.concurrencia_voz_urgente, a.prioridad_urgente)
        releer = ManejadorMetadatos(self.rutas)
        estructura = ManejadorReclasificar(
            self.rutas, a.aislar_conversion, a.memoria_conversion_mb, a.tiempo_conversion_seg
        )
        tipos = [*conversion.tipos, *voz.tipos, *releer.tipos, *estructura.tipos]
        self.barrendero = Barrendero(
            self.fabrica_repo, tipos, a.minutos_atascado * 60, a.intervalo_barrido_seg, self.parar
        )
        try:
            n = Barrendero(self.fabrica_repo, tipos, 0, a.intervalo_barrido_seg, self.parar).barrer()
            log.info("Arranque: %d trabajos interrumpidos devueltos a PENDIENTE", n)
        except Exception:
            log.exception("No se pudieron reabrir los trabajos interrumpidos (el barrido periódico lo reintentará)")
        self.trabajadores = [
            Trabajador("conversion", conversion, self.fabrica_repo, a.intervalo_seg, a.max_intentos, self.parar),
            Trabajador("metadatos", releer, self.fabrica_repo, a.intervalo_seg, a.max_intentos, self.parar),
            Trabajador("estructura", estructura, self.fabrica_repo, a.intervalo_seg, a.max_intentos, self.parar),
        ]
        nombres_voz = ["voz"] + [f"voz-{k}" for k in range(2, a.hilos_voz + 1)]
        self.trabajadores += [
            Trabajador(nombre, voz, self.fabrica_repo, a.intervalo_voz_seg, a.max_intentos, self.parar)
            for nombre in nombres_voz
        ]
        if a.hilo_voz_urgente:
            self.trabajadores.append(
                Trabajador(
                    "voz-urgente",
                    voz,
                    self.fabrica_repo,
                    a.intervalo_voz_seg,
                    a.max_intentos,
                    self.parar,
                    prioridad_max=a.prioridad_urgente,
                )
            )
        for t in self.trabajadores:
            t.start()
        self.barrendero.start()

    def detener(self) -> None:
        self.parar.set()
        for t in self.trabajadores:
            t.join(timeout=5)
        if self.barrendero is not None and self.barrendero.is_alive():
            self.barrendero.join(timeout=5)


def crear_app(ajustes: Ajustes) -> FastAPI:
    """Construye la aplicación con sus rutas y su ciclo de vida."""
    taller = Taller(ajustes)

    @asynccontextmanager
    async def ciclo_de_vida(_app: FastAPI) -> AsyncIterator[None]:
        log.info("Taller %s arrancando: datos=%s", __version__, ajustes.datos)
        taller.iniciar()
        yield
        taller.detener()

    app = FastAPI(title="Taller de La Biblioteca AH", version=__version__, lifespan=ciclo_de_vida)
    app.state.taller = taller

    @app.get("/salud")
    def salud() -> dict[str, Any]:
        return {
            "estado": "ok",
            "version": __version__,
            "datos": {"ruta": str(taller.rutas.raiz), "disponible": taller.rutas.raiz.is_dir()},
            "trabajadores": [
                {"nombre": t.name, "vivo": t.is_alive(), "procesados": t.procesados, "ultimoError": t.ultimo_error}
                for t in taller.trabajadores
            ],
        }

    @app.get("/voces")
    def voces() -> list[dict[str, Any]]:
        return listar_voces()

    return app

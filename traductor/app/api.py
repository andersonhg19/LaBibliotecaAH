"""API HTTP compatible con LibreTranslate en lo que usa biblioteca-service (contratos v1.3.1).

- ``POST /translate`` ``{q: str | [str], source: "auto"|idioma, target: idioma, format?: "text"}``
  → ``{translatedText, detectedLanguage?}`` (string o lista según ``q``; ``detectedLanguage`` solo con ``auto``).
- ``POST /detect`` ``{q}`` → ``[{language, confidence}]``
- ``GET /languages`` → ``[{code, name, targets}]``
- ``GET /health`` → 200 con los modelos cargados y probados; 503 mientras no.

Errores con el formato de LibreTranslate ``{"error": "..."}``: 400 petición mal formada, 413 demasiado
texto, 404/405 ruta o método, 503 sin modelos, 500 inesperado (en el log, nunca la traza al cliente).
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Ajustes
from .idiomas import NOMBRES
from .motor import Motor, MotorCTranslate2
from .traductor import Traductor

log = logging.getLogger(__name__)


class ErrorDePeticion(Exception):
    def __init__(self, estado: int, mensaje: str) -> None:
        super().__init__(mensaje)
        self.estado = estado
        self.mensaje = mensaje


def _motor_real(ajustes: Ajustes) -> Motor:
    return MotorCTranslate2(
        ajustes.modelos,
        ajustes.idiomas,
        hilos=ajustes.hilos,
        lotes_paralelos=ajustes.lotes_paralelos,
        beam=ajustes.beam,
        max_lote=ajustes.max_lote_modelo,
    )


def crear_app(ajustes: Ajustes, fabrica_motor: Callable[[Ajustes], Motor] = _motor_real) -> FastAPI:
    estado: dict[str, Any] = {"traductor": None}

    @asynccontextmanager
    async def ciclo(_: FastAPI) -> AsyncIterator[None]:
        inicio = time.monotonic()
        traductor = Traductor(
            fabrica_motor(ajustes), ajustes.idiomas, ajustes.max_caracteres_frase, ajustes.proteger_nombres
        )
        # Prueba real de cada par antes de declararse sano: si el modelo no traduce, no arranca.
        for origen in traductor.idiomas:
            for destino in traductor.destinos(origen):
                if not traductor.traducir(["Hello." if origen == "en" else "Hola."], [origen], destino)[0]:
                    raise RuntimeError(f"El modelo {origen}-{destino} no devolvió traducción")
        estado["traductor"] = traductor
        log.info("Traductor listo en %.1f s con %s", time.monotonic() - inicio, ", ".join(traductor.idiomas))
        yield
        estado["traductor"] = None

    app = FastAPI(
        title="Traductor de La Biblioteca AH",
        version="1.3.1",
        lifespan=ciclo,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    def traductor_listo() -> Traductor:
        traductor = estado["traductor"]
        if traductor is None:
            raise ErrorDePeticion(503, "El traductor todavía está cargando los modelos")
        return traductor

    async def leer_cuerpo(request: Request) -> dict[str, Any]:
        largo = request.headers.get("content-length")
        if largo and largo.isdigit() and int(largo) > ajustes.max_bytes_cuerpo:
            raise ErrorDePeticion(413, f"La petición supera {ajustes.max_bytes_cuerpo} bytes")
        crudo = await request.body()
        if len(crudo) > ajustes.max_bytes_cuerpo:
            raise ErrorDePeticion(413, f"La petición supera {ajustes.max_bytes_cuerpo} bytes")
        try:
            cuerpo = json.loads(crudo or b"{}")
        except (ValueError, UnicodeDecodeError) as e:
            raise ErrorDePeticion(400, "Petición inválida: el cuerpo debe ser JSON") from e
        if not isinstance(cuerpo, dict):
            raise ErrorDePeticion(400, "Petición inválida: el cuerpo debe ser un objeto JSON")
        return cuerpo

    def leer_q(cuerpo: dict[str, Any]) -> tuple[list[str], bool]:
        q = cuerpo.get("q")
        if q is None:
            raise ErrorDePeticion(400, "Petición inválida: falta el parámetro q")
        es_lista = isinstance(q, list)
        textos = q if es_lista else [q]
        if not all(isinstance(t, str) for t in textos):
            raise ErrorDePeticion(400, "Petición inválida: q debe ser un texto o una lista de textos")
        if len(textos) > ajustes.max_textos:
            raise ErrorDePeticion(413, f"Demasiados textos: {len(textos)} (máximo {ajustes.max_textos})")
        total = sum(len(t) for t in textos)
        if total > ajustes.max_caracteres:
            raise ErrorDePeticion(413, f"Demasiado texto: {total} caracteres (máximo {ajustes.max_caracteres})")
        return textos, es_lista

    def idioma(cuerpo: dict[str, Any], campo: str, traductor: Traductor, admite_auto: bool) -> str:
        valor = cuerpo.get(campo)
        if not isinstance(valor, str) or not valor.strip():
            raise ErrorDePeticion(400, f"Petición inválida: falta el parámetro {campo}")
        valor = valor.strip().lower()
        if valor == "auto" and admite_auto:
            return valor
        if valor not in traductor.idiomas:
            raise ErrorDePeticion(400, f"{valor} no está disponible (idiomas: {', '.join(traductor.idiomas)})")
        return valor

    @app.exception_handler(ErrorDePeticion)
    async def _error_de_peticion(_: Request, e: ErrorDePeticion) -> JSONResponse:
        return JSONResponse({"error": e.mensaje}, status_code=e.estado)

    @app.exception_handler(StarletteHTTPException)
    async def _error_http(_: Request, e: StarletteHTTPException) -> JSONResponse:
        mensaje = {404: "Ruta no encontrada", 405: "Método no permitido"}.get(e.status_code, "Petición inválida")
        return JSONResponse({"error": mensaje}, status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _error_inesperado(_: Request, e: Exception) -> JSONResponse:
        log.error("Error inesperado en el traductor: %s", type(e).__name__, exc_info=e)
        return JSONResponse({"error": "Error interno del traductor"}, status_code=500)

    @app.get("/health")
    async def salud() -> dict[str, Any]:
        traductor = traductor_listo()
        return {"status": "ok", "languages": list(traductor.idiomas)}

    @app.get("/languages")
    async def idiomas() -> list[dict[str, Any]]:
        traductor = traductor_listo()
        return [
            {"code": i, "name": NOMBRES.get(i, i), "targets": sorted({i, *traductor.destinos(i)})}
            for i in traductor.idiomas
        ]

    @app.post("/detect")
    async def detectar(request: Request) -> list[dict[str, Any]]:
        traductor = traductor_listo()
        textos, _ = leer_q(await leer_cuerpo(request))
        detecciones = [traductor.detectar(t) for t in textos]
        return [{"confidence": d.confianza, "language": d.idioma} for d in detecciones]

    @app.post("/translate")
    async def traducir(request: Request) -> dict[str, Any]:
        traductor = traductor_listo()
        cuerpo = await leer_cuerpo(request)
        textos, es_lista = leer_q(cuerpo)
        origen = idioma(cuerpo, "source", traductor, admite_auto=True)
        destino = idioma(cuerpo, "target", traductor, admite_auto=False)
        formato = cuerpo.get("format", "text")
        if formato not in (None, "text"):
            raise ErrorDePeticion(400, "Formato no admitido: solo format=text")
        detecciones = [traductor.detectar(t) for t in textos] if origen == "auto" else None
        origenes = [d.idioma for d in detecciones] if detecciones else [origen] * len(textos)
        inicio = time.monotonic()
        traducciones = await run_in_threadpool(traductor.traducir, textos, origenes, destino)
        log.info(
            "Traducidos %d textos (%d caracteres) %s -> %s en %d ms",
            len(textos),
            sum(len(t) for t in textos),
            origen,
            destino,
            (time.monotonic() - inicio) * 1000,
        )
        respuesta: dict[str, Any] = {"translatedText": traducciones if es_lista else traducciones[0]}
        if detecciones is not None:
            lista = [{"confidence": d.confianza, "language": d.idioma} for d in detecciones]
            respuesta["detectedLanguage"] = lista if es_lista else lista[0]
        return respuesta

    return app

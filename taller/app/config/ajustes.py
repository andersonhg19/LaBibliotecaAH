"""Ajustes del taller desde variables de entorno, validados al arrancar (pydantic-settings).

Secretos sin valor por defecto: `TALLER_DB_URL` es obligatoria para el servicio; si falta, el arranque falla con
un mensaje claro. Los valores no secretos tienen defecto.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class AjustesBasicos(BaseSettings):
    """Ajustes que no necesitan base de datos (CLI y pruebas)."""

    model_config = SettingsConfigDict(env_prefix="TALLER_", extra="ignore")

    datos: Path = Field(default=Path("./datos-dev"), description="Raíz del volumen /datos")
    log: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR)$")
    concurrencia_voz: int = Field(default=4, ge=1, le=16)
    # (v1.5) síntesis simultáneas del capítulo que alguien escucha (prioridad <= prioridad_urgente): medido en QA,
    # con 8 la primera parte sale antes y el capítulo tarda la mitad; las precargas siguen con concurrencia_voz.
    concurrencia_voz_urgente: int = Field(default=8, ge=1, le=16)


class Ajustes(AjustesBasicos):
    """Ajustes completos del servicio (API + trabajadores)."""

    db_url: str = Field(min_length=1, description="postgresql://USUARIO:CLAVE@host:5432/biblioteca_db")
    puerto: int = Field(default=8926, ge=1, le=65535)
    intervalo_seg: float = Field(default=2.0, gt=0, le=60)
    max_intentos: int = Field(default=3, ge=1, le=10)
    # EN_CURSO sin latido (cada 60 s) durante más de estos minutos → PENDIENTE (barrido periódico, QA DA-01)
    minutos_atascado: int = Field(default=5, ge=2)
    intervalo_barrido_seg: float = Field(default=60.0, gt=0, le=3600)
    hilos_voz: int = Field(default=2, ge=1, le=8, description="trabajos de voz simultáneos (QA DA-19)")
    # (v1.5) un hilo de voz más, reservado al capítulo que alguien escucha (prioridad <= prioridad_urgente): no
    # espera detrás de precargas ni de otros libros. Sondea la cola más a menudo que los demás.
    hilo_voz_urgente: bool = True
    prioridad_urgente: int = Field(default=10, ge=0)
    intervalo_voz_seg: float = Field(default=0.5, gt=0, le=60)
    # conversión en subproceso acotado (QA SE-01)
    aislar_conversion: bool = True
    memoria_conversion_mb: int = Field(default=1536, ge=256)
    tiempo_conversion_seg: int = Field(default=1200, ge=30)
    trabajadores: bool = True
    muestras: bool = True


class ErrorDeConfiguracion(RuntimeError):
    """Configuración inválida o incompleta: el taller no debe arrancar."""


def cargar_ajustes() -> Ajustes:
    """Lee y valida la configuración; traduce los errores a un mensaje claro en español."""
    try:
        return Ajustes()  # type: ignore[call-arg]  # db_url llega por entorno
    except ValidationError as e:
        problemas = []
        for err in e.errors():
            campo = "TALLER_" + str(err["loc"][0]).upper() if err["loc"] else "?"
            if err["type"] == "missing":
                problemas.append(f"falta la variable {campo}")
            else:
                problemas.append(f"{campo} inválida: {err['msg']}")
        raise ErrorDeConfiguracion("Configuración del taller incompleta: " + "; ".join(problemas)) from None

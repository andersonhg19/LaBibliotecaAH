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


class Ajustes(AjustesBasicos):
    """Ajustes completos del servicio (API + trabajadores)."""

    db_url: str = Field(min_length=1, description="postgresql://USUARIO:CLAVE@host:5432/biblioteca_db")
    puerto: int = Field(default=8926, ge=1, le=65535)
    intervalo_seg: float = Field(default=2.0, gt=0, le=60)
    max_intentos: int = Field(default=3, ge=1, le=10)
    minutos_atascado: int = Field(default=30, ge=1)
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

"""Catálogo de voces aprobado (contratos.md §8)."""

from __future__ import annotations

from typing import Any

VOZ_POR_DEFECTO = "edge.es-ES-AlvaroNeural"

VOCES: list[dict[str, str]] = [
    {"id": "edge.es-ES-AlvaroNeural", "nombre": "Álvaro", "pais": "España", "genero": "M", "motor": "edge"},
    {"id": "edge.es-ES-ElviraNeural", "nombre": "Elvira", "pais": "España", "genero": "F", "motor": "edge"},
    {"id": "edge.es-ES-XimenaNeural", "nombre": "Ximena", "pais": "España", "genero": "F", "motor": "edge"},
    {"id": "edge.es-HN-CarlosNeural", "nombre": "Carlos", "pais": "Honduras", "genero": "M", "motor": "edge"},
    {"id": "edge.es-CO-GonzaloNeural", "nombre": "Gonzalo", "pais": "Colombia", "genero": "M", "motor": "edge"},
    {"id": "edge.es-CO-SalomeNeural", "nombre": "Salomé", "pais": "Colombia", "genero": "F", "motor": "edge"},
    {"id": "edge.es-MX-JorgeNeural", "nombre": "Jorge", "pais": "México", "genero": "M", "motor": "edge"},
    {"id": "edge.es-US-AlonsoNeural", "nombre": "Alonso", "pais": "Estados Unidos", "genero": "M", "motor": "edge"},
    {"id": "edge.es-AR-TomasNeural", "nombre": "Tomás", "pais": "Argentina", "genero": "M", "motor": "edge"},
]

FRASE_MUESTRA = (
    "Bienvenido a tu biblioteca. Entre estantes de roble y cedro, cada libro espera "
    "su turno para ser leído en voz alta, sin prisa y con buena luz."
)


def listar_voces() -> list[dict[str, Any]]:
    return [dict(v, porDefecto=(v["id"] == VOZ_POR_DEFECTO)) for v in VOCES]


def voz_conocida(voz_id: str) -> bool:
    return any(v["id"] == voz_id for v in VOCES)


def genero_de(voz_id: str) -> str:
    """Género "M" o "F" del catálogo ("M" si la voz no está): para la voz multilingüe de una frase (0.4.0)."""
    return next((v["genero"] for v in VOCES if v["id"] == voz_id), "M")

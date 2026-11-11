"""Rutas del volumen /datos según contratos.md §2."""

from __future__ import annotations

from pathlib import Path


class Rutas:
    """Calcula las rutas de originales, normalizados, audio, caché y muestras."""

    def __init__(self, raiz: Path | str):
        self.raiz = Path(raiz)

    def originales(self, archivo_id: str) -> Path:
        return self.raiz / "originales" / str(archivo_id)

    def normalizados(self, archivo_id: str) -> Path:
        return self.raiz / "normalizados" / str(archivo_id)

    def frases(self, archivo_id: str, capitulo: int) -> Path:
        return self.normalizados(archivo_id) / "frases" / f"cap-{capitulo:03d}.json"

    def audio(self, archivo_id: str, voz_id: str) -> Path:
        return self.raiz / "audio" / str(archivo_id) / voz_id

    def cache_voz(self) -> Path:
        return self.raiz / "cache-voz"

    def muestras(self) -> Path:
        return self.raiz / "muestras"

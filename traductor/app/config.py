"""Ajustes del traductor, leídos del entorno con valores por defecto (nada secreto)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass


class AjusteInvalido(ValueError):
    """Una variable de entorno con un valor que no se puede usar."""


@dataclass(frozen=True)
class Ajustes:
    modelos: str = "/modelos"
    idiomas: tuple[str, ...] = ("en", "es")
    puerto: int = 5000
    # Lotes que CTranslate2 traduce a la vez (inter_threads) y hilos de cada lote (intra_threads).
    lotes_paralelos: int = 1
    hilos: int = 4
    # Medido en casa (bitácora 2026-11-11): beam 4 es el de referencia de Opus-MT; con 2 o menos aparecen
    # errores de concordancia («silencio… pesadas… la rompiera») y solo se gana ~1 s por capítulo.
    beam: int = 4
    max_lote_modelo: int = 32
    # Límites de entrada: por encima, 413 (como LT_CHAR_LIMIT / LT_BATCH_LIMIT del LibreTranslate anterior).
    max_caracteres: int = 20_000
    max_textos: int = 100
    max_bytes_cuerpo: int = 1_000_000
    # Frases más largas que esto se parten por ; : o , antes de ir al modelo (Opus-MT pierde calidad).
    max_caracteres_frase: int = 400
    proteger_nombres: bool = True
    nivel_log: str = "INFO"


def _entero(entorno: Mapping[str, str], nombre: str, defecto: int, minimo: int, maximo: int) -> int:
    crudo = entorno.get(nombre, "").strip()
    if not crudo:
        return defecto
    try:
        valor = int(crudo)
    except ValueError as e:
        raise AjusteInvalido(f"{nombre} debe ser un número entero (llegó {crudo!r})") from e
    if not minimo <= valor <= maximo:
        raise AjusteInvalido(f"{nombre} debe estar entre {minimo} y {maximo} (llegó {valor})")
    return valor


def _booleano(entorno: Mapping[str, str], nombre: str, defecto: bool) -> bool:
    crudo = entorno.get(nombre, "").strip().lower()
    if not crudo:
        return defecto
    if crudo in {"1", "true", "si", "sí", "yes"}:
        return True
    if crudo in {"0", "false", "no"}:
        return False
    raise AjusteInvalido(f"{nombre} debe ser true o false (llegó {crudo!r})")


def desde_entorno(entorno: Mapping[str, str] | None = None) -> Ajustes:
    e = os.environ if entorno is None else entorno
    idiomas = tuple(i.strip().lower() for i in e.get("TRADUCTOR_IDIOMAS", "en,es").split(",") if i.strip())
    if len(idiomas) < 2:
        raise AjusteInvalido("TRADUCTOR_IDIOMAS necesita al menos dos idiomas (p. ej. en,es)")
    return Ajustes(
        modelos=e.get("TRADUCTOR_MODELOS", "/modelos").strip() or "/modelos",
        idiomas=idiomas,
        puerto=_entero(e, "TRADUCTOR_PUERTO", 5000, 1, 65535),
        lotes_paralelos=_entero(e, "TRADUCTOR_LOTES_PARALELOS", 1, 1, 16),
        hilos=_entero(e, "TRADUCTOR_HILOS", 4, 1, 64),
        beam=_entero(e, "TRADUCTOR_BEAM", 4, 1, 8),
        max_lote_modelo=_entero(e, "TRADUCTOR_LOTE_MODELO", 32, 1, 256),
        max_caracteres=_entero(e, "TRADUCTOR_MAX_CARACTERES", 20_000, 100, 1_000_000),
        max_textos=_entero(e, "TRADUCTOR_MAX_TEXTOS", 100, 1, 10_000),
        max_bytes_cuerpo=_entero(e, "TRADUCTOR_MAX_BYTES", 1_000_000, 1_000, 50_000_000),
        max_caracteres_frase=_entero(e, "TRADUCTOR_MAX_CARACTERES_FRASE", 400, 50, 5_000),
        proteger_nombres=_booleano(e, "TRADUCTOR_PROTEGER_NOMBRES", True),
        nivel_log=e.get("TRADUCTOR_LOG", "INFO").strip().upper() or "INFO",
    )

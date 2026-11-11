"""El modelo: Opus-MT convertido a CTranslate2 (int8, CPU) con sus tokenizadores SentencePiece.

Cada par de idiomas vive en ``{modelos}/{origen}-{destino}/`` (model.bin, shared_vocabulary.json,
source.spm, target.spm), generado en la construcción de la imagen (``convertir/convertir.py``).
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable, Sequence
from typing import Any, Protocol

log = logging.getLogger(__name__)


class Motor(Protocol):
    """Traduce frases sueltas (ya limpias) de un par de idiomas. Mismo orden, misma cantidad."""

    def pares(self) -> frozenset[tuple[str, str]]: ...

    def traducir(self, frases: Sequence[str], origen: str, destino: str) -> list[str]: ...


class ModeloNoEncontrado(RuntimeError):
    pass


def _traductor_real(ruta: str, hilos: int, lotes_paralelos: int) -> Any:
    import ctranslate2

    return ctranslate2.Translator(
        ruta, device="cpu", compute_type="int8", inter_threads=lotes_paralelos, intra_threads=hilos
    )


def _tokenizador_real(ruta: str) -> Any:
    import sentencepiece

    return sentencepiece.SentencePieceProcessor(model_file=ruta)


class _Par:
    def __init__(self, traductor: Any, fuente: Any, objetivo: Any) -> None:
        self.traductor = traductor
        self.fuente = fuente
        self.objetivo = objetivo


class MotorCTranslate2:
    def __init__(
        self,
        carpeta: str,
        idiomas: Sequence[str],
        hilos: int = 4,
        lotes_paralelos: int = 1,
        beam: int = 4,
        max_lote: int = 32,
        fabrica_traductor: Callable[[str, int, int], Any] = _traductor_real,
        fabrica_tokenizador: Callable[[str], Any] = _tokenizador_real,
    ) -> None:
        self._beam = beam
        self._max_lote = max_lote
        self._pares: dict[tuple[str, str], _Par] = {}
        self._cerrojo = threading.Lock()
        for origen in idiomas:
            for destino in idiomas:
                if origen == destino:
                    continue
                ruta = os.path.join(carpeta, f"{origen}-{destino}")
                if not os.path.isfile(os.path.join(ruta, "model.bin")):
                    raise ModeloNoEncontrado(f"Falta el modelo {origen}-{destino} en {ruta}")
                self._pares[(origen, destino)] = _Par(
                    fabrica_traductor(ruta, hilos, lotes_paralelos),
                    fabrica_tokenizador(os.path.join(ruta, "source.spm")),
                    fabrica_tokenizador(os.path.join(ruta, "target.spm")),
                )
                log.info("Modelo %s-%s cargado (%s hilos, %s lotes paralelos)", origen, destino, hilos, lotes_paralelos)

    def pares(self) -> frozenset[tuple[str, str]]:
        return frozenset(self._pares)

    def traducir(self, frases: Sequence[str], origen: str, destino: str) -> list[str]:
        if not frases:
            return []
        par = self._pares[(origen, destino)]
        # Por prudencia, SentencePiece se usa desde un hilo a la vez (es barato frente a la traducción).
        with self._cerrojo:
            tokens = [par.fuente.encode(f, out_type=str) for f in frases]
        # NU-01: Opus-MT no admite más de 512 posiciones. Una frase que no quepa se trocea (por comas o
        # palabras) en segmentos que sí quepan; se traducen aparte y se unen con un espacio.
        segmentos: list[list[str]] = []
        trozos_por_frase: list[int] = []
        for t in tokens:
            trozos = trocear_tokens(t, MAX_TOKENS_ENTRADA - 1)
            trozos_por_frase.append(len(trozos))
            segmentos.extend([*trozo, "</s>"] for trozo in trozos)
        resultados = par.traductor.translate_batch(
            segmentos,
            beam_size=self._beam,
            max_batch_size=self._max_lote,
            # Margen para frases que en español se alargan; corta repeticiones degeneradas.
            max_decoding_length=min(MAX_POSICIONES, 2 * max(len(t) for t in segmentos) + 16),
            # Red de seguridad: nunca pasa al modelo más posiciones de las que tiene (antes: 503).
            max_input_length=MAX_POSICIONES,
            repetition_penalty=1.0,
        )
        with self._cerrojo:
            traducidos = [par.objetivo.decode(r.hypotheses[0]).strip() for r in resultados]
        salida: list[str] = []
        i = 0
        for n in trozos_por_frase:
            salida.append(" ".join(p for p in traducidos[i : i + n] if p))
            i += n
        return salida


# Opus-MT (Marian) tiene 512 posiciones; se deja margen para </s> y para no rozar el borde.
MAX_POSICIONES = 512
MAX_TOKENS_ENTRADA = 480
_CIERRES = (",", ";", ":", ".", "!", "?", "…", ")", "»", "”")


def trocear_tokens(tokens: Sequence[str], maximo: int) -> list[list[str]]:
    """Parte una lista de piezas SentencePiece en trozos de como mucho ``maximo`` piezas.

    Corta preferentemente tras una pieza que cierra con , ; : (o fin de frase) y, si no hay, antes del
    comienzo de una palabra (pieza con "▁"); en el peor caso, a ``maximo`` piezas. Nunca pierde piezas.
    """
    if len(tokens) <= maximo:
        return [list(tokens)]
    trozos: list[list[str]] = []
    resto = list(tokens)
    while len(resto) > maximo:
        # Solo se buscan cortes en la segunda mitad de la ventana para no dejar trozos diminutos.
        desde = max(1, maximo // 2)
        corte = next((i + 1 for i in range(maximo - 1, desde - 1, -1) if resto[i].endswith(_CIERRES)), 0)
        if not corte:
            corte = next((i for i in range(maximo, desde - 1, -1) if resto[i].startswith("▁")), maximo)
        trozos.append(resto[:corte])
        resto = resto[corte:]
    if resto:
        trozos.append(resto)
    return trozos

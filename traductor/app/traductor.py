"""Orquesta una petición: parte en frases, traduce en lote (cada frase única una vez), protege nombres
propios, repone cursivas y vuelve a montar cada texto con sus espacios y saltos originales."""

from __future__ import annotations

import logging
from collections.abc import Sequence

from . import nombres as nom
from .idiomas import Deteccion, detectar
from .motor import Motor
from .segmentador import partir
from .tipografia import Preparada, marcar_enfasis, preparar, reponer_enfasis, restaurar, tiene_letras

log = logging.getLogger(__name__)

# (origen, destino) → núcleo → (preparada, traducción)
_Lote = dict[tuple[str, str], dict[str, tuple[Preparada, str]]]


class Traductor:
    def __init__(
        self, motor: Motor, idiomas: Sequence[str], max_caracteres_frase: int = 400, proteger_nombres: bool = True
    ) -> None:
        self._motor = motor
        self._max_frase = max_caracteres_frase
        self._proteger = proteger_nombres
        pares = motor.pares()
        self.idiomas = tuple(i for i in idiomas if any(i in p for p in pares))

    def destinos(self, origen: str) -> list[str]:
        return [d for (o, d) in sorted(self._motor.pares()) if o == origen]

    def detectar(self, texto: str) -> Deteccion:
        return detectar(texto, self.idiomas)

    def traducir(self, textos: Sequence[str], origenes: Sequence[str], destino: str) -> list[str]:
        """Traduce cada texto desde su origen (ya resuelto, nunca "auto") a ``destino``."""
        montajes: list[tuple[str, list[tuple[str, Preparada | None]]]] = []
        lote: _Lote = {}
        for texto, origen in zip(textos, origenes, strict=True):
            piezas: list[tuple[str, Preparada | None]] = []
            for pieza in partir(texto, self._max_frase):
                if not pieza.es_frase or origen == destino or not tiene_letras(pieza.texto):
                    piezas.append((pieza.texto, None))
                    continue
                prep = preparar(pieza.texto)
                piezas.append((pieza.texto, prep))
                lote.setdefault((origen, destino), {})[prep.nucleo] = (prep, "")
            montajes.append((origen, piezas))

        for (origen, dest), frases in lote.items():
            preps = [p for p, _ in frases.values()]
            for prep, traducida in zip(
                preps, self._motor.traducir([p.para_modelo for p in preps], origen, dest), strict=True
            ):
                frases[prep.nucleo] = (prep, traducida)
            if self._proteger:
                self._nombres(frases, origen, dest)
            self._enfasis(frases, origen, dest)

        salida: list[str] = []
        for origen, piezas in montajes:
            partes = []
            for original, preparada in piezas:
                if preparada is None:
                    partes.append(original)
                else:
                    partes.append(restaurar(preparada, lote[(origen, destino)][preparada.nucleo][1], destino))
            salida.append("".join(partes))
        return salida

    def _nombres(self, frases: dict[str, tuple[Preparada, str]], origen: str, destino: str) -> None:
        """Frases cuyo nombre propio no salió tal cual: se traducen otra vez con marcadores."""
        candidatas: list[tuple[Preparada, list[str], str]] = []
        conocidos: set[str] = set()
        for prep, _ in frases.values():
            conocidos |= nom.palabras_de(nom.nombres_propios(prep.para_modelo))
        for prep, traducida in frases.values():
            encontrados = nom.nombres_propios(prep.para_modelo, frozenset(conocidos))
            if encontrados and not nom.conservados(traducida, encontrados):
                candidatas.append((prep, encontrados, nom.proteger(prep.para_modelo, encontrados)))
        if not candidatas:
            return
        protegidas = self._motor.traducir([c[2] for c in candidatas], origen, destino)
        for (prep, encontrados, _), traducida in zip(candidatas, protegidas, strict=True):
            repuesta = nom.reponer(traducida, encontrados)
            if repuesta is not None:
                frases[prep.nucleo] = (prep, repuesta)
            else:
                log.debug("Marcador de nombre perdido; se queda la primera traducción")

    def _enfasis(self, frases: dict[str, tuple[Preparada, str]], origen: str, destino: str) -> None:
        """Frases con cursivas interiores: se traducen marcadas para saber dónde reponerlas."""
        con_enfasis = [prep for prep, _ in frases.values() if prep.enfasis]
        if not con_enfasis:
            return
        marcadas = self._motor.traducir([marcar_enfasis(p) for p in con_enfasis], origen, destino)
        for prep, marcada in zip(con_enfasis, marcadas, strict=True):
            repuesta = reponer_enfasis(prep, frases[prep.nucleo][1], marcada)
            if repuesta is not None:
                frases[prep.nucleo] = (prep, repuesta)
            else:
                log.debug("Cursiva perdida; se queda la traducción sin ella")

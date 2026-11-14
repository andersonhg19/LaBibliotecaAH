"""Troceo de capítulos y párrafos desmesurados (QA DA-18, DA-19 y PL-01).

Un libro sin títulos detectables (TXT, Word sin estilos de título) o con un capítulo enorme quedaba como un único
capítulo de horas de audio: imposible de reproducir y bloqueando la cola de voz. Aquí se parte en trozos de tamaño
razonable por los límites de bloque (y los párrafos gigantes, por frases), conservando:
- el título del capítulo en el primer trozo y "(parte k de n)" en los siguientes;
- el índice: cada entrada apunta al trozo que contiene su ancla, y las partes nuevas cuelgan de la entrada del
  capítulo;
- los enlaces internos `cap-NNN.xhtml#ancla`, reescritos al trozo correcto.
"""

from __future__ import annotations

import re
from dataclasses import replace

from lxml import etree

from ..dominio.modelo import Capitulo, Libro, NodoToc
from .html_util import Elemento, texto_de
from .segmentador import segmentar

MAX_PALABRAS_CAPITULO = 6000  # ≈ 40 min de audio a 150 palabras/minuto
MAX_PALABRAS_PARRAFO = 1500
_PALABRA = re.compile(r"\w+")
_HREF_CAP = re.compile(r"^cap-(\d{3})\.xhtml(?:#(.*))?$")


def _palabras(texto: str) -> int:
    return len(_PALABRA.findall(texto))


def partir_parrafo(texto: str, maximo: int | None = None) -> list[str]:
    """Parte un párrafo de texto plano en trozos de ≤ `maximo` palabras por límites de frase."""
    maximo = maximo or MAX_PALABRAS_PARRAFO
    if _palabras(texto) <= maximo:
        return [texto]
    trozos: list[str] = []
    ini = None
    cuenta = 0
    fin = 0
    for a, b in segmentar(texto):
        if ini is None:
            ini = a
        cuenta += _palabras(texto[a:b])
        fin = b
        if cuenta >= maximo:
            trozos.append(texto[ini:fin])
            ini, cuenta = None, 0
    if ini is not None:
        trozos.append(texto[ini:fin])
    return [t for t in trozos if t.strip()]


def _trocear(cuerpo: Elemento, maximo: int) -> list[Elemento]:
    piezas: list[Elemento] = []
    actual = etree.Element("body")
    cuenta = 0
    if cuerpo.text and cuerpo.text.strip():
        etree.SubElement(actual, "p").text = cuerpo.text
        cuenta = _palabras(cuerpo.text)
    for hijo in list(cuerpo):
        n = _palabras(texto_de(hijo)) if isinstance(hijo.tag, str) else 0
        if cuenta and cuenta + n > maximo:
            piezas.append(actual)
            actual = etree.Element("body")
            cuenta = 0
        actual.append(hijo)
        cuenta += n
    if len(actual) or not piezas:
        piezas.append(actual)
    return piezas


def partir_capitulos_largos(libro: Libro, maximo: int | None = None) -> None:
    """Sustituye en `libro` cada capítulo de más de `maximo` palabras por varios trozos (modifica en sitio)."""
    maximo = maximo or MAX_PALABRAS_CAPITULO
    nuevos: list[Capitulo] = []
    # índice viejo → [(índice nuevo, ids del trozo)]
    mapa: dict[int, list[tuple[int, set[str]]]] = {}
    hubo_cambios = False
    for i, cap in enumerate(libro.capitulos):
        if _palabras(texto_de(cap.cuerpo)) <= maximo:
            mapa[i] = [(len(nuevos), set())]
            nuevos.append(cap)
            continue
        piezas = _trocear(cap.cuerpo, maximo)
        if len(piezas) == 1:
            mapa[i] = [(len(nuevos), set())]
            nuevos.append(replace(cap, cuerpo=piezas[0]))
            continue
        hubo_cambios = True
        mapa[i] = []
        n = len(piezas)
        for k, pieza in enumerate(piezas, start=1):
            ids = {str(e.get("id")) for e in pieza.iter() if e.get("id")}
            titulo = cap.titulo if k == 1 else f"{cap.titulo} (parte {k} de {n})"
            mapa[i].append((len(nuevos), ids))
            nuevos.append(replace(cap, titulo=titulo[:300], cuerpo=pieza))
    if not hubo_cambios:
        return

    def destino(viejo: int, fragmento: str | None) -> int:
        trozos = mapa.get(viejo) or [(viejo, set())]
        if fragmento:
            for nuevo, ids in trozos:
                if fragmento in ids:
                    return nuevo
        return trozos[0][0]

    con_partes: set[int] = set()

    def remapear(nodos: list[NodoToc]) -> None:
        for nodo in nodos:
            viejo = nodo.capitulo
            nodo.capitulo = destino(viejo, nodo.fragmento)
            remapear(nodo.hijos)
            if not nodo.fragmento and len(mapa.get(viejo, [])) > 1 and viejo not in con_partes:
                con_partes.add(viejo)
                nodo.hijos.extend(NodoToc(nuevos[j].titulo, j) for j, _ids in mapa[viejo][1:])

    remapear(libro.toc)
    for viejo, trozos in mapa.items():  # capítulos troceados sin entrada propia en el índice
        if len(trozos) > 1 and viejo not in con_partes and libro.toc:
            libro.toc.extend(NodoToc(nuevos[j].titulo, j) for j, _ids in trozos[1:])

    for cap in nuevos:  # enlaces internos al trozo correcto
        for a in cap.cuerpo.iter("a"):
            m = _HREF_CAP.match(a.get("href") or "")
            if m:
                nuevo = destino(int(m.group(1)), m.group(2))
                a.set("href", f"cap-{nuevo:03d}.xhtml" + (f"#{m.group(2)}" if m.group(2) else ""))
    libro.capitulos = nuevos

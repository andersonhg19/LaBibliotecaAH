"""PDF con texto → Libro (PyMuPDF).

- Capítulos desde `get_toc()`; si no hay índice, tramos de 15 páginas ("Páginas X–Y").
- Orden de lectura por columnas: los bloques que cruzan el centro de la página separan "bandas"; dentro de
  cada banda se lee la columna izquierda completa y luego la derecha.
- Se quitan cabeceras y pies repetidos (texto que se repite en la franja superior/inferior de muchas páginas,
  ignorando dígitos) y números de página.
- Párrafos: un bloque de PyMuPDF ≈ un párrafo; se separa también por saltos verticales grandes y se une con el
  siguiente bloque/página si el párrafo no terminó (no acaba en puntuación y sigue minúscula).
- Guiones de corte de línea se deshacen; cursivas y negritas se conservan como <em>/<strong>.
- PDF escaneado (sin capa de texto) → ErrorDefinitivo (el OCR llega en una ola posterior).
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf
from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import Capitulo, ErrorDefinitivo, Libro, NodoToc
from .html_util import Elemento
from .normalizador import normalizar_visual, unir_dos

log = logging.getLogger(__name__)

PAGINAS_POR_TRAMO = 15
FRANJA = 0.09  # fracción del alto de página considerada cabecera/pie
_NUM_PAGINA = re.compile(
    r"^\s*(?:p[aá]g(?:ina)?\.?\s*)?[-–—·|]?\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*[-–—·|]?\s*"
    r"(?:(?:de|/)\s*\d{1,4})?\s*$",
    re.IGNORECASE,
)
_FIN_PARRAFO = re.compile(r"[.!?…:»”\")\]]\s*$")


@dataclass
class _Linea:
    runs: list[tuple[str, bool, bool]]  # (texto, cursiva, negrita)
    x0: float
    y0: float
    x1: float
    y1: float
    tamano: float

    @property
    def texto(self) -> str:
        return "".join(r[0] for r in self.runs)


@dataclass
class _Bloque:
    lineas: list[_Linea] = field(default_factory=list)

    @property
    def x0(self):
        return min(ln.x0 for ln in self.lineas)

    @property
    def x1(self):
        return max(ln.x1 for ln in self.lineas)

    @property
    def y0(self):
        return min(ln.y0 for ln in self.lineas)


@dataclass
class _Parrafo:
    runs: list[tuple[str, bool, bool]]
    titulo: int = 0  # 0 = párrafo, 2/3 = nivel de encabezado

    @property
    def texto(self) -> str:
        return "".join(r[0] for r in self.runs)


def _clave_repeticion(texto: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", texto.strip().lower()))


def convertir_pdf(ruta: Path) -> Libro:
    try:
        doc = pymupdf.open(str(ruta))
    except Exception as e:
        raise ErrorDefinitivo(Msj.PDF_DANADO) from e
    with doc:
        if doc.needs_pass:
            raise ErrorDefinitivo(Msj.PDF_CON_CLAVE)
        if doc.page_count == 0:
            raise ErrorDefinitivo(Msj.PDF_SIN_PAGINAS)
        paginas = [_lineas_pagina(doc[i]) for i in range(doc.page_count)]
        chars = sum(len(ln.texto.strip()) for p in paginas for b in p[0] for ln in b.lineas)
        if chars < 40 * min(doc.page_count, 3):
            raise ErrorDefinitivo(Msj.PDF_ESCANEADO)

        libro = Libro()
        _metadatos(doc, libro)
        libro.portada = _render_portada(doc)

        _quitar_cabeceras_y_pies(paginas)
        tamano_cuerpo = _tamano_cuerpo(paginas)
        parrafos_por_pagina = [_parrafos(bloques, tamano_cuerpo) for bloques, _alto in paginas]

        toc = [(n, t, p) for n, t, p, *_ in doc.get_toc(simple=True) if 1 <= p <= doc.page_count and t.strip()]
        tramos = _tramos(toc, doc.page_count, parrafos_por_pagina)
        for titulo, nivel, desde, hasta in tramos:
            parrafos = _unir_entre_paginas(parrafos_por_pagina[desde : hasta + 1])
            cuerpo = _cuerpo(parrafos)
            libro.capitulos.append(Capitulo(titulo=titulo, cuerpo=cuerpo, nivel=nivel))
        if not libro.capitulos or not any(len(c.cuerpo) for c in libro.capitulos):
            raise ErrorDefinitivo(Msj.PDF_ESCANEADO)
        libro.toc = _toc(toc, tramos)
        return libro


# ------------------------------------------------------------------ extracción


def _lineas_pagina(pagina: Any) -> tuple[list[_Bloque], float]:
    d = pagina.get_text("dict")
    alto = d.get("height") or pagina.rect.height
    bloques: list[_Bloque] = []
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        bloque = _Bloque()
        for ln in b.get("lines", []):
            dir_ = ln.get("dir", (1, 0))
            if abs(dir_[1]) > 0.3:  # texto vertical/rotado (márgenes): se ignora
                continue
            runs = []
            tamanos = []
            for sp in ln.get("spans", []):
                t = normalizar_visual(sp.get("text", ""))
                if not t:
                    continue
                flags = sp.get("flags", 0)
                fuente = (sp.get("font") or "").lower()
                cursiva = bool(flags & 2) or "italic" in fuente or "oblique" in fuente
                negrita = bool(flags & 16) or "bold" in fuente
                runs.append((t, cursiva, negrita))
                tamanos.extend([sp.get("size", 0)] * len(t.strip()))
            if not runs or not "".join(r[0] for r in runs).strip():
                continue
            x0, y0, x1, y1 = ln["bbox"]
            tam = Counter(round(s, 1) for s in tamanos).most_common(1)[0][0] if tamanos else 0
            bloque.lineas.append(_Linea(runs, x0, y0, x1, y1, tam))
        if bloque.lineas:
            bloques.append(bloque)
    ancho = pagina.rect.width
    return _ordenar_columnas(bloques, ancho), alto


def _ordenar_columnas(bloques: list[_Bloque], ancho: float) -> list[_Bloque]:
    if not bloques:
        return bloques
    centro = ancho / 2
    tol = ancho * 0.02
    bloques = sorted(bloques, key=lambda b: (round(b.y0, 1), b.x0))
    salida: list[_Bloque] = []
    izquierda: list[_Bloque] = []
    derecha: list[_Bloque] = []

    def vaciar() -> None:
        salida.extend(sorted(izquierda, key=lambda b: b.y0))
        salida.extend(sorted(derecha, key=lambda b: b.y0))
        izquierda.clear()
        derecha.clear()

    for b in bloques:
        if b.x1 <= centro + tol:
            izquierda.append(b)
        elif b.x0 >= centro - tol:
            derecha.append(b)
        else:
            vaciar()
            salida.append(b)
    vaciar()
    return salida


def _quitar_cabeceras_y_pies(paginas: list[tuple[list[_Bloque], float]]) -> None:
    n = len(paginas)
    conteo: Counter = Counter()
    for bloques, alto in paginas:
        vistas = set()
        for b in bloques:
            for ln in b.lineas:
                if ln.y1 <= alto * FRANJA or ln.y0 >= alto * (1 - FRANJA):
                    zona = "sup" if ln.y1 <= alto * FRANJA else "inf"
                    vistas.add((zona, _clave_repeticion(ln.texto)))
        conteo.update(vistas)
    minimo = max(2, int(n * 0.35 + 0.5))
    repetidas = {k for k, c in conteo.items() if c >= minimo} if n >= 2 else set()
    for bloques, alto in paginas:
        for b in bloques:
            conservar = []
            for ln in b.lineas:
                en_franja = ln.y1 <= alto * FRANJA or ln.y0 >= alto * (1 - FRANJA)
                if en_franja:
                    zona = "sup" if ln.y1 <= alto * FRANJA else "inf"
                    if (zona, _clave_repeticion(ln.texto)) in repetidas or _NUM_PAGINA.match(ln.texto):
                        continue
                elif _NUM_PAGINA.match(ln.texto) and len(b.lineas) == 1 and ln.texto.strip().isdigit():
                    # número de página suelto fuera de la franja (bloque de una sola línea)
                    continue
                conservar.append(ln)
            b.lineas = conservar
        bloques[:] = [b for b in bloques if b.lineas]


def _tamano_cuerpo(paginas: list[tuple[list[_Bloque], float]]) -> float:
    c: Counter = Counter()
    for bloques, _ in paginas:
        for b in bloques:
            for ln in b.lineas:
                c[ln.tamano] += len(ln.texto)
    return c.most_common(1)[0][0] if c else 10.0


def _parrafos(bloques: list[_Bloque], tamano_cuerpo: float) -> list[_Parrafo]:
    salida: list[_Parrafo] = []
    for b in bloques:
        actual: list[_Linea] = []
        alturas = [ln.y1 - ln.y0 for ln in b.lineas]
        alto_linea = sorted(alturas)[len(alturas) // 2] if alturas else 10
        previa: _Linea | None = None
        for ln in b.lineas:
            nivel = _nivel_titulo(ln, tamano_cuerpo)
            if previa is not None:
                salto = ln.y0 - previa.y1
                cambio_titulo = nivel != _nivel_titulo(previa, tamano_cuerpo)
                if salto > alto_linea * 0.8 or cambio_titulo:
                    salida.append(_hacer_parrafo(actual, tamano_cuerpo))
                    actual = []
            actual.append(ln)
            previa = ln
        if actual:
            salida.append(_hacer_parrafo(actual, tamano_cuerpo))
    # unir bloques consecutivos que son el mismo párrafo (p. ej. salto de columna)
    unidos: list[_Parrafo] = []
    for p in salida:
        if unidos and _continua(unidos[-1], p):
            unidos[-1] = _concatenar(unidos[-1], p)
        else:
            unidos.append(p)
    return unidos


def _nivel_titulo(ln: _Linea, tamano_cuerpo: float) -> int:
    if tamano_cuerpo and ln.tamano >= tamano_cuerpo * 1.6 and len(ln.texto) < 150:
        return 2
    if tamano_cuerpo and ln.tamano >= tamano_cuerpo * 1.25 and len(ln.texto) < 150:
        return 3
    return 0


def _hacer_parrafo(lineas: list[_Linea], tamano_cuerpo: float) -> _Parrafo:
    runs: list[tuple[str, bool, bool]] = []
    for ln in lineas:
        runs = _unir_runs(runs, ln.runs) if runs else list(ln.runs)
    nivel = max((_nivel_titulo(ln, tamano_cuerpo) for ln in lineas), default=0)
    return _Parrafo(_compactar(runs), nivel)


def _unir_runs(
    previos: list[tuple[str, bool, bool]], siguientes: list[tuple[str, bool, bool]]
) -> list[tuple[str, bool, bool]]:
    """Une dos líneas a nivel de runs, deshaciendo el guion de corte entre la última y la primera."""
    if not siguientes:
        return previos
    previos = list(previos)
    siguientes = list(siguientes)
    t_prev, c_prev, n_prev = previos[-1]
    t_sig, c_sig, n_sig = siguientes[0]
    unido = unir_dos(t_prev, t_sig)
    # unir_dos devuelve "prev sig" o "prevsig" (sin guion). Lo repartimos de vuelta en dos runs.
    t_prev_limpio = t_prev.rstrip()
    if unido.startswith(t_prev_limpio + " "):
        previos[-1] = (t_prev_limpio + " ", c_prev, n_prev)
    else:
        previos[-1] = (t_prev_limpio[:-1], c_prev, n_prev)
    siguientes[0] = (t_sig.lstrip(), c_sig, n_sig)
    return previos + siguientes


def _compactar(runs: list[tuple[str, bool, bool]]) -> list[tuple[str, bool, bool]]:
    salida: list[tuple[str, bool, bool]] = []
    for t, c, n in runs:
        if not t:
            continue
        if salida and salida[-1][1] == c and salida[-1][2] == n:
            salida[-1] = (salida[-1][0] + t, c, n)
        else:
            salida.append((t, c, n))
    return salida


def _continua(previo: _Parrafo, siguiente: _Parrafo) -> bool:
    if previo.titulo or siguiente.titulo:
        return False
    t_prev = previo.texto.rstrip()
    t_sig = siguiente.texto.lstrip()
    if not t_prev or not t_sig:
        return False
    if _FIN_PARRAFO.search(t_prev):
        return False
    return t_sig[0].islower() or t_prev[-1] in "-‐,;"


def _concatenar(a: _Parrafo, b: _Parrafo) -> _Parrafo:
    return _Parrafo(_compactar(_unir_runs(a.runs, b.runs)), a.titulo)


def _unir_entre_paginas(paginas: list[list[_Parrafo]]) -> list[_Parrafo]:
    salida: list[_Parrafo] = []
    for parrafos in paginas:
        for i, p in enumerate(parrafos):
            if i == 0 and salida and _continua(salida[-1], p):
                salida[-1] = _concatenar(salida[-1], p)
            else:
                salida.append(p)
    return salida


def _cuerpo(parrafos: list[_Parrafo]) -> Elemento:
    body = etree.Element("body")
    for p in parrafos:
        if not p.texto.strip():
            continue
        el = etree.SubElement(body, f"h{p.titulo}" if p.titulo else "p")
        for texto, cursiva, negrita in p.runs:
            if not (cursiva or negrita) or el.tag.startswith("h"):
                if len(el):
                    el[-1].tail = (el[-1].tail or "") + texto
                else:
                    el.text = (el.text or "") + texto
                continue
            destino = el
            if negrita:
                destino = etree.SubElement(destino, "strong")
            if cursiva:
                destino = etree.SubElement(destino, "em")
            destino.text = texto
    return body


# ------------------------------------------------------------------ capítulos, índice, metadatos


def _tramos(
    toc: list[tuple[int, str, int]], n_paginas: int, parrafos_por_pagina: list[list[_Parrafo]]
) -> list[tuple[str, int, int, int]]:
    """Lista de (titulo, nivel, pagina_desde, pagina_hasta) con páginas 0-based inclusivas."""
    if toc:
        nivel_corte = 1
        n1 = sum(1 for n, *_ in toc if n == 1)
        if n1 < 2 and sum(1 for n, *_ in toc if n == 2) >= 2:
            nivel_corte = 2
        inicios: list[tuple[str, int, int]] = []
        for n, t, p in toc:
            if n > nivel_corte:
                continue
            if inicios and inicios[-1][2] == p - 1:
                continue  # dos entradas en la misma página: se queda la primera
            inicios.append((t.strip(), n, p - 1))
        if inicios:
            tramos = []
            if inicios[0][2] > 0 and any(parrafos_por_pagina[i] for i in range(inicios[0][2])):
                tramos.append(("Inicio", 1, 0, inicios[0][2] - 1))
            for k, (t, n, p) in enumerate(inicios):
                hasta = inicios[k + 1][2] - 1 if k + 1 < len(inicios) else n_paginas - 1
                tramos.append((t[:300], n, p, max(p, hasta)))
            return [tr for tr in tramos if any(parrafos_por_pagina[i] for i in range(tr[2], tr[3] + 1))]
    tramos = []
    for desde in range(0, n_paginas, PAGINAS_POR_TRAMO):
        hasta = min(n_paginas, desde + PAGINAS_POR_TRAMO) - 1
        if any(parrafos_por_pagina[i] for i in range(desde, hasta + 1)):
            titulo = f"Páginas {desde + 1}–{hasta + 1}" if hasta > desde else f"Página {desde + 1}"
            tramos.append((titulo, 1, desde, hasta))
    return tramos


def _toc(toc: list[tuple[int, str, int]], tramos: list[tuple[str, int, int, int]]) -> list[NodoToc]:
    if not toc:
        return []

    def capitulo_de(pagina0: int) -> int:
        idx = 0
        for i, (_t, _n, desde, _h) in enumerate(tramos):
            if desde <= pagina0:
                idx = i
        return idx

    raiz: list[NodoToc] = []
    pila: list[tuple[int, NodoToc]] = []
    for n, t, p in toc:
        nodo = NodoToc(t.strip()[:300], capitulo_de(p - 1))
        while pila and pila[-1][0] >= n:
            pila.pop()
        (pila[-1][1].hijos if pila else raiz).append(nodo)
        pila.append((n, nodo))
    return raiz


def _metadatos(doc: Any, libro: Libro) -> None:
    md = doc.metadata or {}
    titulo = (md.get("title") or "").strip()
    if titulo and not re.search(r"\.(pdf|docx?|odt|txt)$|^microsoft word|^untitled|^sin t[ií]tulo", titulo, re.I):
        libro.metadatos["titulo"] = titulo[:300]
    autor = (md.get("author") or "").strip()
    if autor:
        libro.metadatos["autores"] = [a.strip() for a in re.split(r";|,| y | & ", autor) if a.strip()][:10]


def _render_portada(doc: Any) -> bytes | None:
    try:
        pagina = doc[0]
        escala = min(3.0, 1200 / max(1.0, pagina.rect.height))
        pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
        return pix.tobytes("png")
    except Exception as e:
        log.warning("No se pudo renderizar la portada del PDF: %s", e)
        return None

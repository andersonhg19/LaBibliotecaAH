"""JSON, YAML y registros (.log) → Libro monoespaciado, una línea por párrafo.

Cada línea es un `<p class="bah-linea bah-sangria-N">` (N = nivel de sangría, de 2 en 2 espacios, tope 20): así se
conservan la sangría y el orden visual y, a la vez, cada línea es una frase normal del lector (notas, subrayado,
voz y traducción siguen funcionando). Un JSON válido y no enorme se reindenta con 2 espacios.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import Capitulo, ErrorDefinitivo, Libro, NodoToc
from . import limites
from .desde_txt import decodificar
from .limites import revisar_tamano
from .metadatos import titulo_desde_nombre
from .normalizador import normalizar_visual

log = logging.getLogger(__name__)

MAX_SANGRIA = 20
LINEAS_POR_CAPITULO = 800
MAX_JSON_REINDENTAR = 4 * limites.MB
MAX_LARGO_LINEA = 4000
_ETIQUETA = {"JSON": "JSON", "YAML": "YAML", "LOG": "Registro"}


def convertir_codigo(ruta: Path, formato: str) -> Libro:
    revisar_tamano(ruta, limites.MAX_TXT, "archivo de texto")
    texto = decodificar(ruta.read_bytes()).replace("\r\n", "\n").replace("\r", "\n")
    if formato == "JSON" and len(texto) <= MAX_JSON_REINDENTAR:
        try:
            texto = json.dumps(json.loads(texto), indent=2, ensure_ascii=False)
        except (ValueError, RecursionError):
            log.info("JSON no válido o demasiado anidado: se muestra tal cual")
    texto = normalizar_visual(texto.replace("\f", "\n").replace("\v", "\n"))
    lineas = texto.split("\n")
    while lineas and not lineas[-1].strip():
        lineas.pop()
    if not any(ln.strip() for ln in lineas):
        raise ErrorDefinitivo(Msj.TXT_VACIO)

    libro = Libro()
    libro.metadatos["titulo"] = titulo_desde_nombre(ruta.stem)
    etiqueta = _ETIQUETA.get(formato, formato)
    trozos = [lineas[i : i + LINEAS_POR_CAPITULO] for i in range(0, len(lineas), LINEAS_POR_CAPITULO)]
    for n, trozo in enumerate(trozos):
        body = etree.Element("body")
        for linea in trozo:
            p = etree.SubElement(body, "p", {"class": f"bah-linea bah-sangria-{nivel_de_sangria(linea)}"})
            contenido = linea.strip()
            if len(contenido) > MAX_LARGO_LINEA:
                contenido = contenido[:MAX_LARGO_LINEA] + "…"
            p.text = contenido or None
        inicio = n * LINEAS_POR_CAPITULO + 1
        fin = inicio + len(trozo) - 1
        titulo = etiqueta if len(trozos) == 1 else f"{etiqueta}: líneas {inicio}–{fin}"
        libro.capitulos.append(Capitulo(titulo=titulo, cuerpo=body))
        libro.toc.append(NodoToc(titulo, n))
    return libro


def nivel_de_sangria(linea: str) -> int:
    """Espacios iniciales / 2 (un tabulador = 4 espacios), con tope."""
    espacios = 0
    for c in linea:
        if c == " ":
            espacios += 1
        elif c == "\t":
            espacios += 4
        else:
            break
    return min(MAX_SANGRIA, espacios // 2)

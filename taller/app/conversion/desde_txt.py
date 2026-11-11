"""TXT → Libro: detección de codificación, heurística de capítulos y párrafos por líneas en blanco."""

from __future__ import annotations

import re
from pathlib import Path

from charset_normalizer import from_bytes
from lxml import etree

from ..dominio.mensajes import Msj
from ..dominio.modelo import Capitulo, ErrorDefinitivo, Libro, NodoToc
from .normalizador import normalizar_visual, unir_lineas
from .numeros import romano_a_entero

_NUMERO = r"(?:\d{1,4}|[IVXLCDM]{1,8}|[A-ZÁÉÍÓÚa-záéíóúñ]+)"
_CAPITULO = re.compile(rf"^\s*(?:cap[ií]tulo|CAP[IÍ]TULO|Cap[ií]tulo|CAP\.|Cap\.)\s+{_NUMERO}\b.{{0,100}}$")
_PARTE = re.compile(rf"^\s*(?:parte|PARTE|Parte|libro|LIBRO|Libro|tomo|TOMO|Tomo)\s+{_NUMERO}\b.{{0,100}}$")
_SOLO_ROMANO = re.compile(r"^\s*([IVXLCDM]{1,8})\.?\s*$")
_PROLOGO = re.compile(
    r"^\s*(?:pr[oó]logo|PR[OÓ]LOGO|Pr[oó]logo|ep[ií]logo|EP[IÍ]LOGO|Ep[ií]logo|"
    r"introducci[oó]n|INTRODUCCI[OÓ]N|Introducci[oó]n|PREFACIO|Prefacio)\s*\.?\s*$"
)


_HABITUALES = set("áéíóúüñÁÉÍÓÚÜÑ¿¡«»çÇàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöÄËÏÖ€–—“”‘’…ºª°·§©")


def decodificar(datos: bytes) -> str:
    if datos.startswith(b"\xef\xbb\xbf"):
        return datos[3:].decode("utf-8", "replace")
    if datos.startswith((b"\xff\xfe", b"\xfe\xff")):
        return datos.decode("utf-16", "replace")
    try:
        return datos.decode("utf-8")
    except UnicodeDecodeError:
        pass
    # Los libros son mayoritariamente en español/occidentales: se puntúa cada candidato por la proporción de
    # caracteres no ASCII que son letras/signos habituales (charset-normalizer confunde a veces cp1252 con cp1250).
    mejor = from_bytes(datos).best()
    candidatos = ["cp1252"] + ([mejor.encoding] if mejor is not None else []) + ["latin-1", "mac_roman"]
    elegido, puntos_max = None, -1.0
    for cod in candidatos:
        try:
            texto = datos.decode(cod)
        except (UnicodeDecodeError, LookupError):
            continue
        no_ascii = [c for c in texto if ord(c) > 127]
        if not no_ascii:
            return texto
        puntos = sum(1 for c in no_ascii if c in _HABITUALES) / len(no_ascii)
        if puntos > puntos_max:
            elegido, puntos_max = texto, puntos
    return elegido if elegido is not None else datos.decode("cp1252", "replace")


def _es_titulo(linea: str, previa_vacia: bool, siguiente_vacia: bool, usar_mayusculas: bool) -> int:
    """0 = no es título; 1 = parte; 2 = capítulo."""
    s = linea.strip()
    if not s or len(s) > 120:
        return 0
    if _PARTE.match(s):
        return 1
    if _CAPITULO.match(s) or _PROLOGO.match(s):
        return 2
    m = _SOLO_ROMANO.match(s)
    if m and romano_a_entero(m.group(1)) and previa_vacia:
        return 2
    if (
        usar_mayusculas
        and previa_vacia
        and siguiente_vacia
        and len(s) <= 60
        and sum(c.isalpha() for c in s) >= 3
        and s.upper() == s
        and not s.endswith((".", ","))
    ):
        return 2
    return 0


def convertir_txt(ruta: Path) -> Libro:
    texto = normalizar_visual(decodificar(ruta.read_bytes())).replace("\r\n", "\n").replace("\r", "\n")
    if not texto.strip():
        raise ErrorDefinitivo(Msj.TXT_VACIO)
    lineas = texto.split("\n")
    hay_capitulos = any(_CAPITULO.match(ln) or _PARTE.match(ln) for ln in lineas)
    vacias = sum(1 for ln in lineas if not ln.strip())
    # Si no hay líneas en blanco, cada línea es un párrafo
    linea_es_parrafo = vacias == 0 and len(lineas) > 3

    # 1) recorrer líneas → secuencia de ("titulo", nivel, texto) / ("parrafo", texto)
    eventos: list[tuple] = []
    buffer: list[str] = []

    def cerrar_parrafo() -> None:
        if buffer:
            eventos.append(("p", unir_lineas(buffer)))
            buffer.clear()

    for i, linea in enumerate(lineas):
        previa_vacia = i == 0 or not lineas[i - 1].strip()
        siguiente_vacia = i + 1 >= len(lineas) or not lineas[i + 1].strip()
        nivel = _es_titulo(linea, previa_vacia, siguiente_vacia, not hay_capitulos)
        if nivel:
            cerrar_parrafo()
            eventos.append(("h", nivel, linea.strip()))
        elif not linea.strip():
            cerrar_parrafo()
        else:
            buffer.append(linea)
            if linea_es_parrafo:
                cerrar_parrafo()
    cerrar_parrafo()

    # 2) agrupar en capítulos; un título sin texto propio (p. ej. "PARTE I" seguida de "CAPÍTULO 1")
    #    se fusiona con el capítulo siguiente y queda como padre en el índice.
    libro = Libro()
    secciones: list[dict] = []
    for ev in eventos:
        if ev[0] == "h":
            secciones.append({"titulos": [(ev[1], ev[2])], "parrafos": []})
        else:
            if not secciones:
                secciones.append({"titulos": [], "parrafos": []})
            secciones[-1]["parrafos"].append(ev[1])
    fusionadas: list[dict] = []
    pendientes: list[tuple[int, str]] = []
    for s in secciones:
        if not s["parrafos"]:
            pendientes.extend(s["titulos"])
            continue
        s["titulos"] = pendientes + s["titulos"]
        pendientes = []
        fusionadas.append(s)
    if pendientes and fusionadas:
        fusionadas[-1]["parrafos"].extend(t for _n, t in pendientes)

    parte_actual: NodoToc | None = None
    for s in fusionadas:
        body = etree.Element("body")
        indice = len(libro.capitulos)
        titulo_cap = None
        nivel_cap = 1
        for nivel, t in s["titulos"]:
            h = etree.SubElement(body, "h1" if nivel == 1 else "h2")
            h.text = t
            if nivel == 1:
                parte_actual = NodoToc(t[:300], indice)
                libro.toc.append(parte_actual)
            else:
                titulo_cap = t
        for p in s["parrafos"]:
            etree.SubElement(body, "p").text = p
        if titulo_cap is None:
            titulo_cap = s["titulos"][-1][1] if s["titulos"] else ("Inicio" if indice == 0 else f"Sección {indice + 1}")
        if s["titulos"] and s["titulos"][-1][0] == 2:
            nodo = NodoToc(titulo_cap[:300], indice)
            if parte_actual is not None:
                parte_actual.hijos.append(nodo)
                nivel_cap = 2
            else:
                libro.toc.append(nodo)
        elif not s["titulos"]:
            libro.toc.append(NodoToc(titulo_cap[:300], indice))
        libro.capitulos.append(Capitulo(titulo=titulo_cap[:300], cuerpo=body, nivel=nivel_cap))
    if not libro.capitulos:
        raise ErrorDefinitivo(Msj.SIN_TEXTO)
    return libro

"""Modelo intermedio común a todos los formatos de entrada."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from .mensajes import Msj, texto


class ErrorDeTaller(Exception):
    """Error con mensaje para el usuario (catálogo `Msj`, en español)."""

    def __init__(self, msj: Msj | str, **datos: object):
        self.msj = msj
        # `detalle` (técnico) solo va al log; el mensaje para el usuario nunca lo incluye
        self.detalle: str | None = str(datos["detalle"]) if datos.get("detalle") is not None else None
        super().__init__(texto(msj, **datos) if isinstance(msj, Msj) else msj)


class ErrorDefinitivo(ErrorDeTaller):
    """Error que no se arregla reintentando (formato no soportado, PDF escaneado, archivo dañado…)."""


class ErrorReintentable(ErrorDeTaller):
    """Error transitorio con mensaje claro para el usuario (servicio de voz caído, ffmpeg…)."""


class TrabajoCancelado(ErrorDeTaller):
    """El archivo se retiró mientras se procesaba: se limpia lo escrito y no se reintenta ni se marca nada más."""


@dataclass
class Capitulo:
    titulo: str
    cuerpo: etree._Element  # <body> limpio, sin espacio de nombres
    nivel: int = 1


@dataclass
class NodoToc:
    titulo: str
    capitulo: int
    fragmento: str | None = None
    hijos: list[NodoToc] = field(default_factory=list)


@dataclass
class Libro:
    metadatos: dict = field(
        default_factory=lambda: {
            "titulo": None,
            "autores": [],
            "idioma": None,  # solo si el archivo lo dice; si no, lo detecta convertir (QA NU-02)
            "isbn": None,
            "editorial": None,
            "anio": None,
            "sinopsis": None,
            "materias": [],  # (v1.4) temas tal cual los trae el archivo; biblioteca-service los normaliza
        }
    )
    capitulos: list[Capitulo] = field(default_factory=list)
    toc: list[NodoToc] = field(default_factory=list)
    # ruta relativa a OEBPS (p. ej. "imagenes/img-001.jpg") → (bytes, media-type)
    recursos: dict[str, tuple[bytes, str]] = field(default_factory=dict)
    portada: bytes | None = None  # imagen en cualquier formato; se normaliza a JPEG


def metadatos_vacios() -> dict[str, Any]:
    return Libro().metadatos


TIPOS_IMAGEN = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


class AlmacenImagenes:
    """Asigna nombres estables (imagenes/img-NNN.ext) a las imágenes copiadas al EPUB nuevo."""

    def __init__(self, libro: Libro):
        self.libro = libro
        self._por_origen: dict[str, str] = {}

    def agregar(self, clave_origen: str, datos: bytes, extension: str) -> str | None:
        extension = extension.lower()
        if extension == ".jpeg":
            extension = ".jpg"
        if extension not in TIPOS_IMAGEN or extension == ".svg":
            # SVG suelto: se omite (puede traer scripts); formatos raros también
            return None
        if clave_origen in self._por_origen:
            return self._por_origen[clave_origen]
        nombre = f"imagenes/img-{len(self._por_origen) + 1:03d}{extension}"
        self._por_origen[clave_origen] = nombre
        self.libro.recursos[nombre] = (datos, TIPOS_IMAGEN[extension])
        return nombre

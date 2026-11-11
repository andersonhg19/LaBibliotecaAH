"""Normalización de la portada a JPEG (máx. 1200 px de alto)."""

from __future__ import annotations

import io
import logging

from PIL import Image

log = logging.getLogger(__name__)

ALTO_MAXIMO = 1200


def a_jpeg(datos: bytes | None) -> bytes | None:
    if not datos:
        return None
    try:
        with Image.open(io.BytesIO(datos)) as original:
            original.load()
            img: Image.Image = original
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                fondo = Image.new("RGB", img.size, (255, 255, 255))
                fondo.paste(img, mask=img.split()[-1])
                img = fondo
            elif img.mode != "RGB":
                img = img.convert("RGB")
            if img.height > ALTO_MAXIMO:
                ancho = max(1, round(img.width * ALTO_MAXIMO / img.height))
                img = img.resize((ancho, ALTO_MAXIMO), Image.Resampling.LANCZOS)
            salida = io.BytesIO()
            img.save(salida, "JPEG", quality=85, optimize=True, progressive=True)
            return salida.getvalue()
    except Exception as e:  # una portada rota no debe tumbar la conversión
        log.warning("No se pudo procesar la portada: %s", e)
        return None

"""Catálogo de mensajes que llegan al usuario (columnas `error_conversion` y `error` de la BD).

Todos en español, claros y sin jerga; el detalle técnico va SOLO a los logs (nunca nombres de excepciones,
de programas ni "intentos"). Ningún texto para el usuario se escribe a mano fuera de este módulo.
"""

from __future__ import annotations

from enum import StrEnum
from string import Formatter


class Msj(StrEnum):
    """Mensajes para el usuario. Los marcadores `{x}` se rellenan con `texto(...)`."""

    ORIGINAL_NO_ENCONTRADO = "No se encontró el archivo original en el disco de la biblioteca."
    ARCHIVO_RETIRADO = "El libro se retiró de la biblioteca mientras se procesaba; no se guardó nada."
    FORMATO_NO_SOPORTADO = "El formato .{extension} todavía no se puede convertir."
    RTF_PENDIENTE = "Los archivos RTF aún no se pueden convertir (llegará en una ola posterior)."
    SIN_TEXTO = "El documento no contiene texto legible."
    LIBRO_DEMASIADO_GRANDE = "El libro es demasiado grande para convertirlo: {motivo}."
    ARCHIVO_SOSPECHOSO = (
        "El archivo está comprimido de una forma anómala (ocupa muchísimo más al descomprimirlo) "
        "y no se puede convertir con seguridad."
    )
    CONVERSION_SIN_MEMORIA = (
        "El libro es demasiado grande o complejo: convertirlo necesitó más memoria de la permitida."
    )
    CONVERSION_DEMASIADO_LARGA = (
        "La conversión tardó más de {minutos} minutos y se detuvo. "
        "El archivo puede ser demasiado grande o estar dañado."
    )
    CONVERSION_INTERRUMPIDA = (
        "La conversión se interrumpió de forma inesperada (probablemente por falta de memoria). "
        "El archivo puede ser demasiado grande o estar dañado."
    )
    EPUB_DANADO = "El EPUB está dañado: no es un archivo ZIP válido."
    EPUB_CONTAINER_ILEGIBLE = "El EPUB está dañado: su archivo META-INF/container.xml no se puede leer."
    EPUB_SIN_CONTAINER = "El EPUB está incompleto: le falta META-INF/container.xml."
    EPUB_SIN_OPF = "El EPUB está incompleto: no se encontró su archivo de contenido (OPF)."
    EPUB_SIN_CONTENIDO = "El EPUB no tiene capítulos legibles."
    EPUB_CON_DRM = (
        "El EPUB está protegido con DRM (cifrado por la tienda donde se compró) y no se puede leer. "
        "Descárgalo sin protección o en otro formato y vuelve a subirlo."
    )
    PDF_DANADO = "El PDF está dañado o no se puede abrir."
    PDF_CON_CLAVE = "El PDF está protegido con contraseña; quítela y vuelva a subirlo."
    PDF_SIN_PAGINAS = "El PDF no tiene páginas."
    PDF_ESCANEADO = "PDF escaneado: el OCR llegará en una ola posterior"
    WORD_DANADO = "El documento Word está dañado o no se puede leer."
    WORD_VACIO = "El documento Word está vacío."
    DOC_SIN_LIBREOFFICE = "No se pueden convertir archivos .doc: LibreOffice no está instalado en el taller."
    DOC_NO_CONVERTIBLE = "No se pudo convertir el archivo .doc antiguo a un formato moderno."
    TXT_VACIO = "El archivo de texto está vacío."
    ERROR_INTERNO_CONVERSION = (
        "No se pudo convertir el libro por un problema inesperado del taller. "
        "Quedó registrado para revisarlo; puedes volver a intentarlo más tarde."
    )
    CAPITULO_INEXISTENTE = "El capítulo {capitulo} no existe o el libro aún no está convertido."
    CAPITULO_SIN_TEXTO = "El capítulo {capitulo} no tiene texto para leer."
    VOZ_DESCONOCIDA = "La voz «{voz}» no está disponible. Elige otra voz de la lista."
    TRABAJO_VOZ_INCOMPLETO = "La petición de audio está incompleta (falta la voz o el capítulo)."
    SERVICIO_VOZ_CAIDO = "El servicio de voz no respondió tras varios intentos; se volverá a probar más tarde."
    MOTOR_NO_DISPONIBLE = "El motor de voz {motor} aún no está disponible en el taller."
    ERROR_AUDIO = "No se pudo preparar el archivo de audio del capítulo; se volverá a probar más tarde."
    ERROR_INTERNO_VOZ = (
        "No se pudo generar el audio por un problema inesperado del taller. "
        "Quedó registrado para revisarlo; puedes volver a intentarlo más tarde."
    )
    INTENTOS_AGOTADOS = "Se agotaron los intentos para este trabajo."


def texto(msj: Msj, **datos: object) -> str:
    """Devuelve el mensaje con sus marcadores rellenos (los datos que el mensaje no usa se ignoran)."""
    if not datos:
        return msj.value
    usados = {campo for _t, campo, _f, _c in Formatter().parse(msj.value) if campo}
    return msj.value.format(**{k: v for k, v in datos.items() if k in usados})

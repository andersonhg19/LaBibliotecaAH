"""Catálogo de mensajes que llegan al usuario (columnas `error_conversion` y `error` de la BD).

Todos en español, claros y sin jerga; el detalle técnico va a los logs. Ningún texto para el usuario se escribe
a mano fuera de este módulo.
"""

from __future__ import annotations

from enum import StrEnum


class Msj(StrEnum):
    """Mensajes para el usuario. Los marcadores `{x}` se rellenan con `texto(...)`."""

    ORIGINAL_NO_ENCONTRADO = "No se encontró el archivo original en el disco de la biblioteca."
    FORMATO_NO_SOPORTADO = "El formato .{extension} todavía no se puede convertir."
    RTF_PENDIENTE = "Los archivos RTF aún no se pueden convertir (llegará en una ola posterior)."
    SIN_TEXTO = "El documento no contiene texto legible."
    EPUB_DANADO = "El EPUB está dañado: no es un archivo ZIP válido."
    EPUB_SIN_CONTAINER = "El EPUB está incompleto: le falta META-INF/container.xml."
    EPUB_SIN_OPF = "El EPUB está incompleto: no se encontró su archivo de contenido (OPF)."
    EPUB_SIN_CONTENIDO = "El EPUB no tiene capítulos legibles."
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
        "No se pudo convertir el libro por un error interno del taller "
        "(se intentó {intentos} veces). Detalle técnico: {detalle}"
    )
    CAPITULO_INEXISTENTE = "El capítulo {capitulo} no existe o el libro aún no está convertido."
    CAPITULO_SIN_TEXTO = "El capítulo {capitulo} no tiene texto para leer."
    VOZ_DESCONOCIDA = "La voz {voz} no está disponible."
    TRABAJO_VOZ_INCOMPLETO = "La petición de audio está incompleta (falta la voz o el capítulo)."
    SERVICIO_VOZ_CAIDO = (
        "El servicio de voz no respondió tras varios intentos; se volverá a probar más tarde. "
        "Detalle técnico: {detalle}"
    )
    MOTOR_NO_DISPONIBLE = "El motor de voz {motor} aún no está disponible en el taller."
    ERROR_AUDIO = "No se pudo preparar el archivo de audio del capítulo. Detalle técnico: {detalle}"
    ERROR_INTERNO_VOZ = (
        "No se pudo generar el audio por un error interno del taller "
        "(se intentó {intentos} veces). Detalle técnico: {detalle}"
    )
    INTENTOS_AGOTADOS = "Se agotaron los intentos para este trabajo."


def texto(msj: Msj, **datos: object) -> str:
    """Devuelve el mensaje con sus marcadores rellenos."""
    return msj.value.format(**datos) if datos else msj.value

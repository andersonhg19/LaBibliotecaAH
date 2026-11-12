package com.bibliotecaah.biblioteca.enums;

/**
 * Formatos originales aceptados en la subida.
 *
 * (v1.6) Ademas de los libros (EPUB, PDF, DOCX, DOC, TXT), documentos de texto
 * y ofimatica (MD, HTML, RTF, ODT, PPTX y JSON/YAML/LOG como texto), que el
 * taller convierte al EPUB normalizado, y hojas de calculo (XLSX, XLS, ODS,
 * CSV), que el taller convierte a {@code hoja.json} para el visor de hojas.
 */
public enum Formato {
    EPUB, PDF, DOCX, DOC, TXT,
    MD, HTML, RTF, ODT, PPTX, JSON, YAML, LOG,
    XLSX, XLS, ODS, CSV;

    /** ¿Se ve en el visor de hojas (hoja.json) en vez de en el lector (libro.epub)? */
    public boolean esHojaDeCalculo() {
        return this == XLSX || this == XLS || this == ODS || this == CSV;
    }
}

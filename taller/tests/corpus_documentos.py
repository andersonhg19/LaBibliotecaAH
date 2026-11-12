"""Corpus generado para los formatos de documentos y hojas de cálculo (contratos v1.6). Nada con derechos de autor."""

from __future__ import annotations

import re
import shutil
import struct
import subprocess
import zipfile
from datetime import date, datetime
from pathlib import Path

from tests.corpus import imagen_png

# ------------------------------------------------------------------ Markdown / HTML

MARKDOWN = """---
title: "Plan del proyecto Biblioteca"
author: Anderson Herrera
---

# Plan del proyecto

Este documento resume el **estado** del proyecto. Lleva `código en línea` y un [enlace](https://example.com).

## Tareas

- [x] Diseñar las carpetas
- [ ] Probar en el iPhone
- [ ] Revisar con Samy

## Tabla de avance

| Fase | Estado | Avance |
|------|--------|-------:|
| Ola 1 | Lista | 100 % |
| Ola 2 | En curso | 40 % |

## Notas

> Una cita importante del equipo.

```python
def hola():
    if True:
        print("hola  mundo")
```

1. Primero
2. Segundo
   - Anidado
"""

HTML_HOSTIL = """<!DOCTYPE html>
<html lang="es"><head><title>Informe de la casa</title>
<meta name="author" content="Samy">
<meta http-equiv="refresh" content="0;url=https://malo.example">
<base href="https://malo.example/">
<script>alert('x')</script><style>body{display:none}</style></head>
<body onload="robar()">
<h1>Informe</h1>
<p onclick="robar()">Texto con <a href="javascript:alert(1)">enlace malo</a>, <a href="data:text/html,hola">otro</a>
y <a href="https://example.com/ok">uno bueno</a>.</p>
<iframe src="https://malo.example"></iframe>
<svg><script>alert(2)</script><text>svg</text></svg>
<object data="x.swf"></object><form action="https://malo.example"><input name="clave"></form>
<img src="https://remoto.example/foto.png" alt="remota">
<img src="data:image/png;base64,{png}" alt="incrustada">
<h2>Sección dos</h2>
<p>Más texto de la segunda sección.</p>
<pre><code>linea 1
    linea 2 sangrada</code></pre>
<pre>Un poema
   con sangría</pre>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
</body></html>
"""

RTF = (
    r"{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0 Times New Roman;}}"
    r"\f0\fs24 Contrato de arriendo de la casa.\par "
    r"El inquilino paga el d\'eda cinco. Se acepta la se\'f1al.\par }"
)

JSON = '{"proyecto": "Biblioteca", "fases": [{"nombre": "Ola 1", "lista": true}, {"nombre": "Ola 2", "lista": false}]}'

YAML = """proyecto: Biblioteca
fases:
  - nombre: Ola 1
    lista: true
  - nombre: Ola 2
\tlista: false
"""

LOG = """2026-11-12 08:00:01 INFO  Arranca el taller
2026-11-12 08:00:02 WARN  Sin pandoc
    detalle sangrado
2026-11-12 08:00:03 ERROR Falló la conversión
"""


def escribir(destino: Path, texto: str, codificacion: str = "utf-8") -> Path:
    destino.write_bytes(texto.encode(codificacion))
    return destino


def crear_html(destino: Path) -> Path:
    import base64

    return escribir(destino, HTML_HOSTIL.replace("{png}", base64.b64encode(imagen_png(tam=(20, 20))).decode()))


def crear_odt(desde_docx: Path, destino_dir: Path) -> Path | None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    perfil = (destino_dir / "perfil-lo-odt").resolve().as_uri()
    subprocess.run(
        [
            soffice,
            f"-env:UserInstallation={perfil}",
            "--headless",
            "--convert-to",
            "odt",
            "--outdir",
            str(destino_dir),
            str(desde_docx),
        ],
        check=True,
        capture_output=True,
        timeout=300,
    )
    salida = destino_dir / (desde_docx.stem + ".odt")
    return salida if salida.exists() else None


# ------------------------------------------------------------------ PPTX

_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
_TIPO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"


def _sp(texto_parrafos: str, tipo_ph: str | None = None) -> str:
    ph = f'<p:ph type="{tipo_ph}"/>' if tipo_ph else ""
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>{ph}</p:nvPr></p:nvSpPr>'
        f"<p:txBody>{texto_parrafos}</p:txBody></p:sp>"
    )


def _p(texto: str, nivel: int = 0, vineta: bool = False) -> str:
    vin = '<a:buChar char="•"/>' if vineta else ""
    ppr = f'<a:pPr lvl="{nivel}">{vin}</a:pPr>'
    return f"<a:p>{ppr}<a:r><a:t>{texto}</a:t></a:r></a:p>"


def _diapo(contenido: str, oculta: bool = False) -> str:
    show = ' show="0"' if oculta else ""
    return (
        f'<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="{_P}" xmlns:a="{_A}" xmlns:r="{_R}"{show}>'
        f"<p:cSld><p:spTree>{contenido}</p:spTree></p:cSld></p:sld>"
    )


def crear_pptx(destino: Path) -> Path:
    tabla = (
        '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/>'
        "</p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl>"
        "<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Mes</a:t></a:r></a:p></a:txBody></a:tc>"
        "<a:tc><a:txBody><a:p><a:r><a:t>Ventas</a:t></a:r></a:p></a:txBody></a:tc></a:tr>"
        "<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Enero</a:t></a:r></a:p></a:txBody></a:tc>"
        "<a:tc><a:txBody><a:p><a:r><a:t>100</a:t></a:r></a:p></a:txBody></a:tc></a:tr>"
        "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"
    )
    imagen = (
        '<p:pic><p:nvPicPr><p:cNvPr id="5" name="foto" descr="Logo de la casa"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill></p:pic>'
    )
    d1 = _diapo(
        _sp(_p("Bienvenida al proyecto"), "title")
        + _sp(_p("Primer punto", 0, True) + _p("Detalle del punto", 1, True) + _p("Segundo punto", 0, True))
        + imagen
    )
    d2 = _diapo(_sp(_p("Diapositiva secreta"), "title") + _sp(_p("No debe verse.")), oculta=True)
    d3 = _diapo(_sp(_p("Resultados"), "ctrTitle") + _sp(_p("Las cifras del trimestre.")) + tabla)
    notas = (
        f'<?xml version="1.0" encoding="UTF-8"?><p:notes xmlns:p="{_P}" xmlns:a="{_A}"><p:cSld><p:spTree>'
        + _sp(_p("1"), "sldNum")
        + _sp(_p("Recordar saludar a Samy."), "body")
        + "</p:spTree></p:cSld></p:notes>"
    )
    rels_pres = (
        f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="{_REL}">'
        f'<Relationship Id="rId1" Type="{_TIPO}slide" Target="slides/slide1.xml"/>'
        f'<Relationship Id="rId2" Type="{_TIPO}slide" Target="slides/slide2.xml"/>'
        f'<Relationship Id="rId3" Type="{_TIPO}slide" Target="slides/slide3.xml"/></Relationships>'
    )
    rels_d1 = (
        f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="{_REL}">'
        f'<Relationship Id="rIdImg" Type="{_TIPO}image" Target="../media/image1.png"/>'
        f'<Relationship Id="rIdN" Type="{_TIPO}notesSlide" Target="../notesSlides/notesSlide1.xml"/>'
        f'<Relationship Id="rIdX" Type="{_TIPO}hyperlink" Target="https://example.com" TargetMode="External"/>'
        "</Relationships>"
    )
    presentacion = (
        f'<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="{_P}" xmlns:r="{_R}"><p:sldIdLst>'
        '<p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/>'
        "</p:sldIdLst></p:presentation>"
    )
    core = (
        '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties '
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Presentación de la casa</dc:title>'
        "<dc:creator>Anderson Herrera</dc:creator></cp:coreProperties>"
    )
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
        z.writestr("ppt/presentation.xml", presentacion)
        z.writestr("ppt/_rels/presentation.xml.rels", rels_pres)
        z.writestr("ppt/slides/slide1.xml", d1)
        z.writestr("ppt/slides/_rels/slide1.xml.rels", rels_d1)
        z.writestr("ppt/slides/slide2.xml", d2)
        z.writestr("ppt/slides/slide3.xml", d3)
        z.writestr("ppt/notesSlides/notesSlide1.xml", notas)
        z.writestr("ppt/media/image1.png", imagen_png(tam=(40, 30)))
        z.writestr("docProps/core.xml", core)
    return destino


# ------------------------------------------------------------------ XLSX


def crear_xlsx(destino: Path) -> Path:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = openpyxl.Workbook()
    wb.properties.title = "Seguimiento del proyecto"
    wb.properties.creator = "Samy"
    ws = wb.active
    ws.title = "Ventas"
    ws.append(["Fecha", "Cliente", "Valor COP", "Valor EUR", "Avance"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFFFF")
        c.fill = PatternFill("solid", fgColor="FF2F4A3A")
        c.alignment = Alignment(horizontal="center")
    filas = [
        (date(2026, 11, 12), "Ana", 1234567.891, -5, 0.1234),
        (datetime(2026, 1, 5, 14, 30), "Luis", 1500, 2500.5, 1),
    ]
    for fila in filas:
        ws.append(list(fila))
    for r in (2, 3):
        ws.cell(r, 1).number_format = "d/m/yyyy"
        ws.cell(r, 3).number_format = '"$"\\ #,##0'
        ws.cell(r, 4).number_format = "[$€-2] #,##0.00"
        ws.cell(r, 5).number_format = "0.0%"
    ws["A5"] = "Total del trimestre (celda combinada)"
    ws.merge_cells("A5:C5")
    ws["A5"].alignment = Alignment(wrap_text=True, vertical="top")
    ws["E5"] = True
    ws["E6"] = "=1/0"
    ws.freeze_panes = "B2"
    ws.column_dimensions["B"].width = 30
    ws.row_dimensions[1].height = 30
    resumen = wb.create_sheet("Resumen")
    resumen["A1"] = "Suma"
    resumen["B1"] = "=SUM(Ventas!C2:C3)"
    resumen["B1"].number_format = "#,##0.00"
    resumen["A2"] = "Sin caché"
    resumen["B2"] = "=2+2"
    oculta = wb.create_sheet("Oculta")
    oculta["A1"] = "secreto"
    oculta.sheet_state = "hidden"
    wb.create_sheet("Vacía")
    wb.save(destino)
    _poner_cache(destino, "SUM(Ventas!C2:C3)", "1236067.891")
    _poner_error(destino, "1/0")
    return destino


def _reescribir_hoja(destino: Path, cambio) -> None:
    tmp = destino.with_suffix(".tmp")
    with zipfile.ZipFile(destino) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            datos = zin.read(info.filename)
            if info.filename.startswith("xl/worksheets/sheet"):
                datos = cambio(datos.decode("utf-8")).encode("utf-8")
            zout.writestr(info, datos)
    tmp.replace(destino)


def _poner_cache(destino: Path, formula: str, valor: str) -> None:
    patron = re.compile(r"(<f>" + re.escape(formula) + r"</f>)(<v\s*/>|<v></v>)?")
    _reescribir_hoja(destino, lambda x: patron.sub(lambda m: m.group(1) + f"<v>{valor}</v>", x))


def _poner_error(destino: Path, formula: str) -> None:
    patron = re.compile(r'<c r="E6"([^>]*)>(<f>' + re.escape(formula) + r"</f>)(<v\s*/>|<v></v>)?</c>")

    def cambio(x: str) -> str:
        return patron.sub(lambda m: f'<c r="E6" t="e"><f>{formula}</f><v>#DIV/0!</v></c>', x)

    _reescribir_hoja(destino, cambio)


def crear_xlsx_grande(destino: Path, filas: int, columnas: int, hojas: int = 1) -> Path:
    import openpyxl

    wb = openpyxl.Workbook()
    for h in range(hojas):
        ws = wb.active if h == 0 else wb.create_sheet(f"H{h}")
        if h == 0:
            ws.title = "H0"
        for r in range(1, filas + 1):
            ws.append([f"{r}-{c}" for c in range(columnas)])
    wb.save(destino)
    return destino


# ------------------------------------------------------------------ ODS

_ODS_NS = (
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
    'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" '
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/"'
)


def crear_ods(destino: Path) -> Path:
    contenido = f"""<?xml version="1.0" encoding="UTF-8"?>
<office:document-content {_ODS_NS}>
<office:automatic-styles>
 <style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="4cm"/></style:style>
 <style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="1cm"/></style:style>
 <style:style style:name="ce1" style:family="table-cell"><style:table-cell-properties fo:background-color="#2f4a3a"/>
  <style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-weight="bold" fo:color="#ffffff"/></style:style>
 <style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>
 <table:table table:name="Datos">
  <table:table-column table:style-name="co1"/>
  <table:table-column table:number-columns-repeated="16383"/>
  <table:table-header-rows>
  <table:table-row table:style-name="ro1">
   <table:table-cell table:style-name="ce1" office:value-type="string"><text:p>Concepto</text:p></table:table-cell>
   <table:table-cell table:style-name="ce1" office:value-type="string"><text:p>Valor</text:p></table:table-cell>
   <table:table-cell table:number-columns-repeated="16382"/>
  </table:table-row>
  </table:table-header-rows>
  <table:table-row>
   <table:table-cell office:value-type="string"><text:p>Arriendo<text:s text:c="2"/>casa</text:p></table:table-cell>
   <table:table-cell office:value-type="currency" office:value="1234.5"><text:p>$ 1.234,50</text:p></table:table-cell>
  </table:table-row>
  <table:table-row>
   <table:table-cell office:value-type="date" office:date-value="2026-11-12"><text:p>12/11/2026</text:p></table:table-cell>
   <table:table-cell office:value-type="percentage" office:value="0.5"><text:p>50%</text:p></table:table-cell>
  </table:table-row>
  <table:table-row>
   <table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>Nota combinada</text:p>
    <office:annotation><text:p>comentario oculto</text:p></office:annotation></table:table-cell>
   <table:covered-table-cell/>
  </table:table-row>
  <table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
 </table:table>
 <table:table table:name="Oculta" table:style-name="ta2"><table:table-row><table:table-cell office:value-type="string"><text:p>no</text:p></table:table-cell></table:table-row></table:table>
</office:spreadsheet></office:body></office:document-content>"""
    ajustes = f"""<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings {_ODS_NS}><office:settings><config:config-item-set config:name="ooo:view-settings">
<config:config-item-map-indexed config:name="Views"><config:config-item-map-entry>
<config:config-item-map-named config:name="Tables"><config:config-item-map-entry config:name="Datos">
<config:config-item config:name="HorizontalSplitMode" config:type="short">2</config:config-item>
<config:config-item config:name="VerticalSplitMode" config:type="short">2</config:config-item>
<config:config-item config:name="HorizontalSplitPosition" config:type="int">1</config:config-item>
<config:config-item config:name="VerticalSplitPosition" config:type="int">1</config:config-item>
</config:config-item-map-entry></config:config-item-map-named></config:config-item-map-entry></config:config-item-map-indexed>
</config:config-item-set></office:settings></office:document-settings>"""
    meta = f"""<?xml version="1.0" encoding="UTF-8"?><office:document-meta {_ODS_NS}><office:meta>
<dc:title>Gastos de la casa</dc:title><meta:initial-creator>Anderson Herrera</meta:initial-creator></office:meta></office:document-meta>"""
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", contenido)
        z.writestr("settings.xml", ajustes)
        z.writestr("meta.xml", meta)
        z.writestr("META-INF/manifest.xml", '<?xml version="1.0"?><manifest/>')
    return destino


# ------------------------------------------------------------------ CSV

CSV = 'Nombre;Valor;Fecha\n"Pérez; Ana";1.234,5;12/11/2026\n"Con ""comillas""";-7;\nÑandú;50%;hoy\n'


def crear_csv(destino: Path) -> Path:
    return escribir(destino, CSV, "latin-1")


# ------------------------------------------------------------------ OLE (CFB) mínimo


def crear_ole(destino: Path, flujos: list[str]) -> Path:
    """Un archivo compuesto OLE mínimo (sector 512): FAT en el sector 0 y directorio en el 1, con esos flujos."""
    fin, libre, fat = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD
    cab = bytearray(512)
    cab[0:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    struct.pack_into("<HHHHH", cab, 0x18, 0x3E, 3, 0xFFFE, 9, 6)
    struct.pack_into("<I", cab, 0x2C, 1)  # sectores FAT
    struct.pack_into("<I", cab, 0x30, 1)  # primer sector del directorio
    struct.pack_into("<III", cab, 0x38, 4096, fin, 0)
    struct.pack_into("<II", cab, 0x40, fin, 0)
    difat = [0] + [libre] * 108
    struct.pack_into("<109I", cab, 0x4C, *difat)
    tabla = [fat, fin] + [libre] * 126
    sector_fat = struct.pack("<128I", *tabla)
    directorio = bytearray(512)
    for i, nombre in enumerate((["Root Entry", *flujos])[:4]):
        datos = nombre.encode("utf-16-le") + b"\x00\x00"
        directorio[i * 128 : i * 128 + len(datos)] = datos
        struct.pack_into("<H", directorio, i * 128 + 0x40, len(datos))
        directorio[i * 128 + 0x42] = 5 if i == 0 else 2
    destino.write_bytes(bytes(cab) + sector_fat + bytes(directorio))
    return destino

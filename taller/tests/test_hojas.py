"""(v1.6) Hojas de cálculo → hoja.json: formateador de Excel (es-CO), XLSX, XLS, ODS, CSV y límites."""

import json
import zipfile
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace

import pytest

from app.conversion import limites
from app.conversion.convertir import convertir, detectar_formato
from app.conversion.hojas import desde_xls, leer_hoja_de_calculo
from app.conversion.hojas.formato_excel import (
    codigo_regional,
    es_codigo_de_fecha,
    formatear,
    formatear_numero,
    general,
)
from app.conversion.hojas.modelo import HojaLeida, color, construir, limpiar_estilo
from app.dominio.modelo import ErrorDefinitivo
from tests import corpus_documentos as cd

ID = "11111111-2222-3333-4444-555555555555"


def _convertir(origen, datos):
    destino = datos / "normalizados" / ID
    r = convertir(origen, destino, ID)
    return r, destino


def _hoja(d) -> dict:
    return json.loads((d / "hoja.json").read_text(encoding="utf-8"))


def _celdas(hoja: dict) -> dict[tuple[int, int], list]:
    return {(c[0], c[1]): c for c in hoja["celdas"]}


# ------------------------------------------------------------------ formateador


@pytest.mark.parametrize(
    ("valor", "codigo", "esperado"),
    [
        (1234567.891, "#,##0.00", "1.234.567,89"),
        (1234567.891, "General", "1234567,891"),
        (42, "General", "42"),
        (0.1 + 0.2, "General", "0,3"),
        (1e20, "General", "1E+20"),
        (-0.5, "General", "-0,5"),
        (0.1234, "0.0%", "12,3%"),
        (1, "0%", "100%"),
        (-5, "[$€-2] #,##0.00", "-€ 5,00"),
        (2500.5, "#,##0.00 [$€-C0A]", "2.500,50 €"),
        (-1500, "$#,##0;($#,##0)", "($1.500)"),
        (1500, "$#,##0;($#,##0)", "$1.500"),
        (1234, '"$"\\ #,##0', "$ 1.234"),
        (1234, "[$COP] #,##0", "COP 1.234"),
        (12345, "0.00E+00", "1,23E+04"),
        (0.000123, "0.0E+0", "1,2E-4"),
        (1.25, "# ?/?", "1 1/4"),
        (0.75, "?/?", "3/4"),
        (1.5, "# ?/8", "1 4/8"),
        (0, '0;-0;"cero"', "cero"),
        (-3, "0;-0", "-3"),
        (-3, "[Red]#,##0", "-3"),
        (1234567, "#,##0,", "1.235"),
        (0.5, "#.00", ",50"),
        (0, "#", ""),
        (7, "000", "007"),
        (5, '[<0]"neg";"pos"', "pos"),
        (-5, '[<0]"neg";"pos"', "neg"),
        (3, '0 "kg"', "3 kg"),
        (3, "0_);(0)", "3 "),
        (3, "* #,##0", "3"),
        (-0.001, "0.00", "0,00"),
    ],
)
def test_numeros(valor, codigo, esperado):
    assert formatear_numero(float(valor), codigo) == esperado


@pytest.mark.parametrize(
    ("valor", "codigo", "esperado", "tipo"),
    [
        (date(2026, 11, 12), "d/m/yyyy", "12/11/2026", "f"),
        (date(2026, 11, 12), "mm-dd-yy", "12/11/2026", "f"),
        (date(2026, 11, 12), 'dddd d "de" mmmm "de" yyyy', "jueves 12 de noviembre de 2026", "f"),
        (date(2026, 11, 12), "ddd dd-mmm-yy", "jue 12-nov-26", "f"),
        (date(2026, 11, 12), "mmmmm", "n", "f"),
        (date(2026, 11, 12), "General", "12/11/2026", "f"),
        (datetime(2026, 1, 5, 14, 30), "General", "05/01/2026 14:30", "f"),
        (datetime(2026, 11, 12, 8, 5, 9), "yyyy-mm-dd hh:mm:ss", "2026-11-12 08:05:09", "f"),
        (datetime(2026, 11, 12, 15, 5), "h:mm AM/PM", "3:05 p. m.", "f"),
        (datetime(2026, 11, 12, 0, 5), "hh:mm A/P", "12:05 a", "f"),
        (time(9, 7, 3), "General", "9:07:03", "f"),
        (time(9, 7), "h:mm", "9:07", "f"),
        (timedelta(days=1.5), "[h]:mm", "36:00", "f"),
        (timedelta(days=1.5), "General", "36:00:00", "f"),
        (timedelta(seconds=62.36), "mm:ss.0", "01:02,4", "f"),
        (timedelta(minutes=90), "[mm]", "90", "f"),
        (True, "General", "VERDADERO", "b"),
        (False, "General", "FALSO", "b"),
        ("hola", '0;0;0;"Texto: "@', "Texto: hola", "t"),
        ("hola", "0.00", "hola", "t"),
        ("hola", "@", "hola", "t"),
        (5, "General", "5", "n"),
        (46338, "d/m/yyyy", "12/11/2026", "f"),
        (float("nan"), "General", "#NUM!", "e"),
    ],
)
def test_formatear(valor, codigo, esperado, tipo):
    assert formatear(valor, codigo) == (esperado, tipo)


def test_regional_y_fecha():
    assert codigo_regional(None, 14) == "dd/mm/yyyy"
    assert codigo_regional("m/d/yy h:mm", 22) == "dd/mm/yyyy h:mm"
    assert codigo_regional("") == "General"
    assert codigo_regional("0.00") == "0.00"
    assert es_codigo_de_fecha("[h]:mm") and es_codigo_de_fecha("dd/mm/yyyy")
    assert not es_codigo_de_fecha("#,##0.00") and not es_codigo_de_fecha(None)
    assert general(123456789012.0) == "1,23456789E+11"
    assert formatear_numero(-1, "dd/mm/yyyy") == "-1"  # fuera del rango de fechas
    assert formatear_numero(3, "") == ""


def test_modelo_colores_y_estilos():
    assert color("FF112233") == "#112233" and color("#abcdef") == "#ABCDEF"
    assert color("tema") is None and color(None) is None and color(5) is None
    assert limpiar_estilo({"fondo": "#FFFFFF", "color": "#000000", "negrita": False, "cursiva": True}) == {
        "cursiva": True
    }


# ------------------------------------------------------------------ XLSX


class TestXlsx:
    def test_xlsx_completo(self, tmp_path, datos):
        f = cd.crear_xlsx(tmp_path / "seguimiento.xlsx")
        assert detectar_formato(f) == "XLSX"
        r, d = _convertir(f, datos)
        assert r.n_capitulos == 2 and r.total_frases == 0 and r.minutos_estimados == 0
        assert not (d / "libro.epub").exists() and not (d / "frases").exists()
        est = json.loads((d / "estructura.json").read_text(encoding="utf-8"))
        assert est["titulo"] == "Seguimiento del proyecto" and est["autores"] == ["Samy"]
        assert [c["titulo"] for c in est["capitulos"]] == ["Ventas", "Resumen"]
        assert est["totalFrases"] == 0 and est["capitulos"][0]["href"] is None
        h = _hoja(d)
        assert h["versionFormato"] == 1 and h["recortado"] is False
        assert [x["nombre"] for x in h["hojas"]] == ["Ventas", "Resumen"]  # sin la oculta ni la vacía
        v = h["hojas"][0]
        assert (v["filas"], v["columnas"], v["recortada"]) == (6, 5, False)
        assert v["fijas"] == {"filas": 1, "columnas": 1}
        celdas = _celdas(v)
        assert celdas[(1, 0)][2:4] == ["12/11/2026", "f"]
        assert celdas[(2, 0)][2:4] == ["5/1/2026", "f"]
        assert celdas[(1, 2)][2:4] == ["$ 1.234.568", "n"]
        assert celdas[(1, 3)][2:4] == ["-€ 5,00", "n"]
        assert celdas[(1, 4)][2:4] == ["12,3%", "n"]
        assert celdas[(4, 4)][2:4] == ["VERDADERO", "b"]
        assert celdas[(5, 4)][2:4] == ["#DIV/0!", "e"]
        cabecera = v["estilos"][celdas[(0, 0)][4]]
        assert cabecera == {"negrita": True, "color": "#FFFFFF", "fondo": "#2F4A3A", "alinear": "centro"}
        assert v["estilos"][0] == {}
        assert v["combinadas"] == [[4, 0, 4, 2]]
        assert v["estilos"][celdas[(4, 0)][4]] == {"vertical": "arriba", "ajustar": True}
        assert v["anchos"][1] == 215 and v["anchos"][0] == 96
        assert v["altos"] == [[0, 40]]
        res = _celdas(h["hojas"][1])
        assert res[(0, 1)][2] == "1.236.067,89"  # valor guardado de la fórmula
        assert (1, 1) not in res  # fórmula sin valor guardado: vacía (no se evalúa)

    def test_xlsx_recortado_por_filas_y_columnas(self, tmp_path, datos, monkeypatch):
        monkeypatch.setattr(limites, "MAX_FILAS_HOJA", 10)
        monkeypatch.setattr(limites, "MAX_COLUMNAS_HOJA", 3)
        f = cd.crear_xlsx_grande(tmp_path / "grande.xlsx", 25, 6)
        _r, d = _convertir(f, datos)
        hoja = _hoja(d)["hojas"][0]
        assert (hoja["filas"], hoja["columnas"]) == (10, 3)
        assert (hoja["filasOriginal"], hoja["columnasOriginal"], hoja["recortada"]) == (25, 6, True)
        assert len(hoja["celdas"]) == 30 and len(hoja["anchos"]) == 3

    def test_xlsx_demasiadas_hojas_y_celdas(self, tmp_path, datos, monkeypatch):
        monkeypatch.setattr(limites, "MAX_HOJAS", 2)
        f = cd.crear_xlsx_grande(tmp_path / "muchas.xlsx", 2, 2, hojas=4)
        _r, d = _convertir(f, datos)
        h = _hoja(d)
        assert len(h["hojas"]) == 2 and h["recortado"] is True
        monkeypatch.setattr(limites, "MAX_HOJAS", 50)
        monkeypatch.setattr(limites, "MAX_CELDAS_HOJAS", 6)
        _r, d = _convertir(f, datos)
        h = _hoja(d)
        assert h["recortado"] is True and len(h["hojas"]) == 2
        assert h["hojas"][0]["recortada"] is False and h["hojas"][1]["recortada"] is True
        assert len(h["hojas"][1]["celdas"]) == 2 and h["hojas"][1]["filas"] == 1

    def test_xlsx_danado_y_vacio(self, tmp_path, datos):
        roto = tmp_path / "roto.xlsx"
        with zipfile.ZipFile(roto, "w") as z:
            z.writestr("[Content_Types].xml", "<Types/>")
            z.writestr("xl/workbook.xml", "no es xml")
        with pytest.raises(ErrorDefinitivo, match="hoja de cálculo está dañada"):
            _convertir(roto, datos)
        import openpyxl

        vacio = tmp_path / "vacio.xlsx"
        openpyxl.Workbook().save(vacio)
        with pytest.raises(ErrorDefinitivo, match="hoja de cálculo está vacía"):
            _convertir(vacio, datos)

    def test_texto_largo_se_corta(self, tmp_path, datos):
        import openpyxl

        wb = openpyxl.Workbook()
        wb.active["A1"] = "x" * (limites.MAX_TEXTO_CELDA + 50)
        f = tmp_path / "largo.xlsx"
        wb.save(f)
        _r, d = _convertir(f, datos)
        texto = _hoja(d)["hojas"][0]["celdas"][0][2]
        assert len(texto) == limites.MAX_TEXTO_CELDA and texto.endswith("…")
        assert _hoja(d)["hojas"][0]["fijas"] == {"filas": 0, "columnas": 0}


# ------------------------------------------------------------------ XLS (xlrd con un libro simulado)


def _xls_simulado():
    """Un libro con la interfaz de xlrd (no hay forma de generar un .xls real en el contenedor del taller)."""
    tipos = {
        (0, 0): (1, "Concepto"),
        (0, 1): (1, "Valor"),
        (1, 0): (3, 46338.0),
        (1, 1): (2, 1234.5),
        (2, 0): (4, 1),
        (2, 1): (5, 0x07),
        (3, 0): (1, ""),
    }
    hoja = SimpleNamespace(
        name="Gastos",
        visibility=0,
        nrows=4,
        ncols=2,
        cell_type=lambda f, c: tipos.get((f, c), (0, ""))[0],
        cell_value=lambda f, c: tipos.get((f, c), (0, ""))[1],
        cell_xf_index=lambda f, c: 1 if f == 0 else 2 if (f, c) == (1, 1) else 3 if (f, c) == (1, 0) else 0,
        merged_cells=[(3, 4, 0, 2)],
        colinfo_map={0: SimpleNamespace(width=20 * 256, hidden=0), 1: SimpleNamespace(width=256, hidden=1)},
        rowinfo_map={0: SimpleNamespace(height=600, has_default_height=0)},
        panes_are_frozen=1,
        horz_split_pos=1,
        vert_split_pos=0,
    )
    oculta = SimpleNamespace(name="Oculta", visibility=1)
    alin = SimpleNamespace(hor_align=2, vert_align=0, text_wrapped=1)
    sin = SimpleNamespace(hor_align=0, vert_align=2, text_wrapped=0)
    fondo = SimpleNamespace(fill_pattern=1, pattern_colour_index=10)
    xf = [
        SimpleNamespace(format_key=0, font_index=0, background=None, alignment=sin),
        SimpleNamespace(format_key=0, font_index=1, background=fondo, alignment=alin),
        SimpleNamespace(format_key=4, font_index=0, background=None, alignment=sin),
        SimpleNamespace(format_key=14, font_index=0, background=None, alignment=sin),
    ]
    libro = SimpleNamespace(
        nsheets=2,
        sheet_by_index=lambda i: [hoja, oculta][i],
        unload_sheet=lambda i: None,
        xf_list=xf,
        format_map={
            0: SimpleNamespace(format_str="General"),
            4: SimpleNamespace(format_str="#,##0.00"),
            14: SimpleNamespace(format_str="m/d/yy"),
        },
        font_list=[
            SimpleNamespace(bold=0, italic=0, underline_type=0, colour_index=8),
            SimpleNamespace(bold=1, italic=1, underline_type=1, colour_index=9),
        ],
        colour_map={8: (0, 0, 0), 9: (255, 255, 255), 10: (47, 74, 58)},
        datemode=0,
        user_name="Samy",
    )
    return libro


def test_xls_con_formato():
    libro = _xls_simulado()
    hojas = list(desde_xls.hojas(libro))
    assert [h.nombre for h in hojas] == ["Gastos"]
    h = construir(hojas)["hojas"][0]
    celdas = _celdas(h)
    assert celdas[(1, 0)][2:4] == ["12/11/2026", "f"]
    assert celdas[(1, 1)][2:4] == ["1.234,50", "n"]
    assert celdas[(2, 0)][2:4] == ["VERDADERO", "b"]
    assert celdas[(2, 1)][2:4] == ["#DIV/0!", "e"]
    assert h["estilos"][celdas[(0, 0)][4]] == {
        "negrita": True,
        "cursiva": True,
        "subrayado": True,
        "color": "#FFFFFF",
        "fondo": "#2F4A3A",
        "alinear": "centro",
        "vertical": "arriba",
        "ajustar": True,
    }
    assert h["combinadas"] == [[3, 0, 3, 1]] and h["filas"] == 4
    assert h["anchos"] == [145, 40] and h["altos"] == [[0, 40]]
    assert h["fijas"] == {"filas": 1, "columnas": 0}
    assert desde_xls.metadatos(libro) == {"titulo": None, "autores": ["Samy"]}


def test_xls_fechas_1904_y_sin_formato():
    libro = _xls_simulado()
    libro.datemode = 1
    libro.xf_list = []
    h = construir(desde_xls.hojas(libro))["hojas"][0]
    assert _celdas(h)[(1, 0)][2] == "13/11/2030"  # 46338 + 1462 días, formato de fecha por defecto


def test_xls_danado(tmp_path, datos):
    f = cd.crear_ole(tmp_path / "libro.xls", ["Workbook"])
    with pytest.raises(ErrorDefinitivo, match="hoja de cálculo está dañada"):
        _convertir(f, datos)


# ------------------------------------------------------------------ ODS


class TestOds:
    def test_ods(self, tmp_path, datos):
        f = cd.crear_ods(tmp_path / "gastos.ods")
        r, d = _convertir(f, datos)
        assert r.n_capitulos == 1
        est = json.loads((d / "estructura.json").read_text(encoding="utf-8"))
        assert est["titulo"] == "Gastos de la casa" and est["autores"] == ["Anderson Herrera"]
        h = _hoja(d)
        assert [x["nombre"] for x in h["hojas"]] == ["Datos"]
        datos_h = h["hojas"][0]
        assert (datos_h["filas"], datos_h["columnas"], datos_h["recortada"]) == (4, 2, False)
        celdas = _celdas(datos_h)
        assert celdas[(1, 0)][2:4] == ["Arriendo  casa", "t"]
        assert celdas[(1, 1)][2:4] == ["$ 1.234,50", "n"]
        assert celdas[(2, 0)][2:4] == ["12/11/2026", "f"]
        assert celdas[(3, 0)][2] == "Nota combinada"  # sin el comentario
        assert datos_h["combinadas"] == [[3, 0, 3, 1]]
        assert datos_h["estilos"][celdas[(0, 0)][4]] == {
            "negrita": True,
            "color": "#FFFFFF",
            "fondo": "#2F4A3A",
            "alinear": "centro",
        }
        assert datos_h["anchos"][0] == 151 and datos_h["altos"] == [[0, 38]]
        assert datos_h["fijas"] == {"filas": 1, "columnas": 1}

    def test_ods_danado(self, tmp_path, datos):
        f = tmp_path / "roto.ods"
        with zipfile.ZipFile(f, "w") as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.spreadsheet")
            z.writestr("content.xml", "<roto")
        with pytest.raises(ErrorDefinitivo, match="dañada"):
            _convertir(f, datos)

    def test_ods_cifrado(self, tmp_path, datos):
        f = tmp_path / "clave.ods"
        with zipfile.ZipFile(f, "w") as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.spreadsheet")
            z.writestr("content.xml", "<x/>")
            z.writestr("META-INF/manifest.xml", "<manifest><encryption-data/></manifest>")
        with pytest.raises(ErrorDefinitivo, match="contraseña"):
            _convertir(f, datos)


# ------------------------------------------------------------------ CSV


class TestCsv:
    def test_csv_latin1_punto_y_coma(self, tmp_path, datos):
        f = cd.crear_csv(tmp_path / "gastos.csv")
        r, d = _convertir(f, datos)
        assert r.n_capitulos == 1
        h = _hoja(d)["hojas"][0]
        assert h["nombre"] == "gastos" and (h["filas"], h["columnas"]) == (4, 3)
        c = _celdas(h)
        assert c[(1, 0)][2:4] == ["Pérez; Ana", "t"]
        assert c[(1, 1)][2:4] == ["1.234,5", "n"]
        assert c[(2, 0)][2] == 'Con "comillas"'
        assert c[(2, 1)][2:4] == ["-7", "n"]
        assert c[(3, 0)][2] == "Ñandú" and c[(3, 1)][3] == "n"
        assert h["estilos"][c[(0, 0)][4]] == {"negrita": True}
        assert h["fijas"] == {"filas": 1, "columnas": 1}

    def test_tsv_y_coma(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "datos.tsv", "a\tb\n1\t2\n")
        _r, d = _convertir(f, datos)
        assert _hoja(d)["hojas"][0]["columnas"] == 2
        g = cd.escribir(tmp_path / "una.csv", "solo una columna\n")
        _r, d = _convertir(g, datos)
        assert _hoja(d)["hojas"][0]["columnas"] == 1

    def test_csv_vacio(self, tmp_path, datos):
        f = cd.escribir(tmp_path / "vacio.csv", "\n")
        with pytest.raises(ErrorDefinitivo, match="vacía"):
            _convertir(f, datos)


def test_leer_formato_desconocido(tmp_path):
    with pytest.raises(ValueError):
        leer_hoja_de_calculo(tmp_path / "x", "PDF")


def test_construir_omite_hojas_vacias():
    vacia = HojaLeida(nombre="v")
    llena = HojaLeida(nombre="", celdas=[(0, 0, "x", "t", None)])
    h = construir([vacia, llena])
    assert [x["nombre"] for x in h["hojas"]] == ["Hoja 1"]

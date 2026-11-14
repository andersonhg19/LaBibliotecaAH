"""Estructura v2 (contratos 0.4.0, C1/C2): casos C1–C11, C15 y C16 de CASOS.md con el corpus sintético de la
auditoría de conversión (tests/corpus_estructura.py) y con entradas a mano."""

import json
import zipfile
from pathlib import Path

import pytest

from app.cola.trabajador import ManejadorReclasificar
from app.config.rutas import Rutas
from app.conversion.convertir import convertir
from app.conversion.estructura import VERSION_CLASIFICADOR, Entrada, clasificar, numero_en_titulo, tipo_por_titulo
from app.conversion.metadatos import autor_util, normalizar_idioma
from app.conversion.reclasificar import reclasificar
from tests import corpus_estructura


@pytest.fixture(scope="module")
def corpus(tmp_path_factory) -> Path:
    return corpus_estructura.generar(tmp_path_factory.mktemp("corpus-estructura"))


@pytest.fixture(scope="module")
def convertidos(tmp_path_factory, corpus):
    """Convierte cada archivo del corpus una sola vez: nombre → (dir normalizado, estructura)."""
    base = tmp_path_factory.mktemp("convertidos")
    cache: dict[str, tuple[Path, dict]] = {}

    def conv(nombre: str) -> tuple[Path, dict]:
        if nombre not in cache:
            destino = base / nombre.replace(" ", "_")
            convertir(corpus / nombre, destino, "00000000-0000-0000-0000-0000000000e1")
            cache[nombre] = (destino, json.loads((destino / "estructura.json").read_text(encoding="utf-8")))
        return cache[nombre]

    return conv


def resumen(estructura: dict) -> list[tuple]:
    return [(c["titulo"], c["tipo"], c["region"], c["numero"], c["enVoz"]) for c in estructura["capitulos"]]


# ------------------------------------------------------------------ títulos y números (C2)


@pytest.mark.parametrize(
    ("titulo", "numero"),
    [
        ("Capítulo primero", 1),
        ("CAPÍTULO 01", 1),
        ("Chapter 01", 1),
        ("Chapter One", 1),
        ("I.", 1),
        ("IV", 4),
        ("Capítulo XII. El regreso", 12),
        ("Capítulo 7", 7),
        ("Uno", 1),
        ("CAPÍTULO PRIMERO", 1),
        ("Capítulo segunda", 2),
        ("1984", None),
        ("12 de octubre", None),
        ("Prólogo", None),
        ("La tormenta", None),
    ],
)
def test_numero_en_titulo(titulo, numero):
    assert numero_en_titulo(titulo) == numero


@pytest.mark.parametrize(
    ("titulo", "tipo"),
    [
        ("Prólogo", "prologo"),
        ("Prefacio", "prologo"),
        ("Introducción", "introduccion"),
        ("Epílogo", "epilogo"),
        ("Agradecimientos", "agradecimientos"),
        ("Acknowledgments", "agradecimientos"),
        ("Sobre la autora", "autor"),
        ("About the Author", "autor"),
        ("Also by Synthetic Author", "publicidad"),
        ("Otros títulos de la autora", "publicidad"),
        ("Notas", "notas"),
        ("Apéndice A. Tabla de mareas", "apendice"),
        ("Colofón", "colofon"),
        ("Índice", "indice"),
        ("Créditos", "creditos"),
        ("Dedicatoria", "dedicatoria"),
        ("Primera parte. La orilla", "parte"),
        ("Parte II", "parte"),
        ("Part One: The Sea", "parte"),
        ("Parte de mí", None),
        ("Capítulo 3", "capitulo"),
        ("El regreso", None),
    ],
)
def test_tipo_por_titulo(titulo, tipo):
    assert tipo_por_titulo(titulo) == tipo


def _e(titulo: str, palabras: int = 800, **k) -> Entrada:
    return Entrada(titulo=titulo, palabras=palabras, palabras_voz=k.pop("palabras_voz", palabras), **k)


def test_prologo_sin_numero_con_cualquier_forma_del_capitulo_uno():
    for forma in ("Capítulo primero", "CAPÍTULO 01", "Chapter 01", "Chapter One", "I.", "Capítulo 1"):
        c = clasificar([_e("Prólogo"), _e(forma), _e("Capítulo siguiente")])
        assert [(x.tipo, x.numero) for x in c] == [("prologo", None), ("capitulo", 1), ("capitulo", 2)]
        assert c[0].en_voz and c[0].region == "cuerpo"


def test_adelanto_al_final_no_rompe_la_numeracion():  # C4
    titulos = ["Portadilla", "El regreso", "La tormenta", "El faro", "Agradecimientos", "Capítulo 1", "Sobre la autora"]
    tamanos = {"Portadilla": 30, "Agradecimientos": 100, "Sobre la autora": 80}
    c = clasificar([_e(t, tamanos.get(t, 800)) for t in titulos])
    assert [x.numero for x in c] == [None, 1, 2, 3, None, None, None]
    assert c[5].tipo == "publicidad" and c[5].region == "despues" and not c[5].en_voz
    assert [x.region for x in c] == ["antes", "cuerpo", "cuerpo", "cuerpo", "despues", "despues", "despues"]


def test_partes_sin_numero_y_trozos_heredan():  # C5, C6
    c = clasificar(
        [
            _e("Primera parte", 20, con_hijos=True),
            _e("Capítulo 1"),
            _e("Capítulo 2"),
            _e("Capítulo 2 (parte 2 de 3)"),
            _e("Capítulo 2 (parte 3 de 3)"),
            _e("Segunda parte. El mar", 20),
            _e("Capítulo 3"),
        ]
    )
    assert [(x.tipo, x.numero) for x in c] == [
        ("parte", None),
        ("capitulo", 1),
        ("capitulo", 2),
        ("capitulo", 2),
        ("capitulo", 2),
        ("parte", None),
        ("capitulo", 3),
    ]
    assert c[0].en_voz  # una parte con texto se lee


def test_un_capitulo_que_se_llama_como_lo_del_final_en_mitad_del_libro():
    c = clasificar([_e("Capítulo 1"), _e("Notas de viaje", 3000), _e("Notas", 3000), _e("Capítulo 4", 3000)])
    assert [x.tipo for x in c] == ["capitulo", "capitulo", "capitulo", "capitulo"]
    assert [x.numero for x in c] == [1, 2, 3, 4]


def test_sin_ningun_capitulo_reconocible():
    c = clasificar([_e("La casa del faro", 6), _e("Sección 2", 5000), _e("Sección 3", 5000)])
    assert [(x.tipo, x.numero) for x in c] == [("preliminar", None), ("capitulo", 1), ("capitulo", 2)]
    assert [x.tipo for x in clasificar([_e("Sección 1", 50)])] == ["capitulo"]


def test_portada_con_texto_es_un_capitulo_mal_titulado():
    # PDF convertido con 0.3.3: el capítulo 1 se llamaba «Portada» (CF-10); al reclasificar no se saca de la voz
    c = clasificar([_e("Portada", 600), _e("Capítulo 2"), _e("Capítulo 3")])
    assert [(x.tipo, x.numero, x.en_voz) for x in c] == [
        ("capitulo", 1, True),
        ("capitulo", 2, True),
        ("capitulo", 3, True),
    ]
    assert clasificar([_e("Portada", 5), _e("Capítulo 1")])[0].tipo == "preliminar"


def test_palabras_voz_y_en_voz():
    c = clasificar([_e("Capítulo 1", 100, palabras_voz=0), _e("Capítulo 2", 100, palabras_voz=90)])
    assert [x.en_voz for x in c] == [False, True]
    assert c[1].a_json() == {
        "tipo": "capitulo",
        "region": "cuerpo",
        "numero": 2,
        "enVoz": True,
        "palabrasVoz": 90,
        "origenTipo": "titulo",
    }


# ------------------------------------------------------------------ libros enteros (corpus sintético)


def test_c1_epub3_completo(convertidos):
    destino, e = convertidos("E01-epub3-completo.epub")
    assert e["version"] == 2 and e["versionFormato"] == 1
    r = {c["titulo"]: c for c in e["capitulos"]}
    capitulos = [c for c in e["capitulos"] if c["tipo"] == "capitulo"]
    assert [c["numero"] for c in capitulos] == [1, 2, 3, 4, 5]
    assert all(c["region"] == "cuerpo" and c["enVoz"] and c["origenTipo"] == "epub-type" for c in capitulos)
    esperados = {
        "Portadilla": ("preliminar", "antes"),
        "Créditos": ("creditos", "antes"),
        "Dedicatoria": ("dedicatoria", "antes"),
        "Epígrafe": ("epigrafe", "antes"),
        "Índice": ("indice", "antes"),
        "Prólogo": ("prologo", "cuerpo"),
        "Introducción": ("introduccion", "cuerpo"),
        "Notas": ("notas", "despues"),
        "Apéndice A. Tabla de mareas": ("apendice", "despues"),
        "Agradecimientos": ("agradecimientos", "despues"),
        "Sobre la autora": ("autor", "despues"),
        "Otros títulos de la autora": ("publicidad", "despues"),
        "Colofón": ("colofon", "despues"),
    }
    for titulo, (tipo, region) in esperados.items():
        assert (r[titulo]["tipo"], r[titulo]["region"]) == (tipo, region), titulo
        assert r[titulo]["numero"] is None
        assert r[titulo]["enVoz"] is (region == "cuerpo"), titulo
    # el tipo viaja en el EPUB de salida (C1): epub:type original + data-bah-tipo
    with zipfile.ZipFile(destino / "libro.epub") as z:
        k = next(c["indice"] for c in e["capitulos"] if c["titulo"] == "Dedicatoria")
        xhtml = z.read(f"OEBPS/cap-{k:03d}.xhtml").decode("utf-8")
        assert 'epub:type="frontmatter dedication"' in xhtml and 'data-bah-tipo="dedicatoria"' in xhtml
        k1 = next(c["indice"] for c in capitulos)
        assert 'epub:type="chapter"' in z.read(f"OEBPS/cap-{k1:03d}.xhtml").decode("utf-8")


def test_c15_tablas_no_se_leen_celda_a_celda(convertidos):
    destino, e = convertidos("E01-epub3-completo.epub")
    k = next(c["indice"] for c in e["capitulos"] if c["tipo"] == "apendice")
    frases = json.loads((destino / "frases" / f"cap-{k:03d}.json").read_text(encoding="utf-8"))["frases"]
    leidas = [f["voz"] for f in frases if f["voz"]]
    assert leidas == ["Apéndice A. Tabla de mareas"]
    _d, e11 = convertidos("E11-imagenes-tablas-notas.epub")
    tablas = next(c for c in e11["capitulos"] if c["titulo"] == "Capítulo 2. Tablas")
    assert tablas["palabrasVoz"] < tablas["palabras"] - 20


@pytest.mark.parametrize(
    ("nombre", "esperado"),
    [
        ("E03c-capitulo-primero.epub", [None, None, 1, 2, 3, 4]),
        ("E03d-capitulo-01.epub", [None, 1, 2, 3]),
        ("E03b-romanos.epub", [None, 1, 2, 3, 4, 5, 6]),
        ("E03e-uno-dos.epub", [None, None, 1, 2, 3, 4]),
        ("E03a-solo-numeros.epub", [None, *range(1, 13)]),
        ("E03f-cero.epub", [0, 1, 2, 3]),
        ("E03g-numero-y-nombre-sin-ancla.epub", [None, None, 1, 2, 3, 4, 5]),
    ],
)
def test_c2_numeracion_de_titulos_raros(convertidos, nombre, esperado):
    _d, e = convertidos(nombre)
    assert [c["numero"] for c in e["capitulos"]] == esperado


def test_c3_xhtml_con_varios_capitulos_se_parte(convertidos):
    destino, e = convertidos("E07-varios-en-uno.epub")
    assert resumen(e) == [
        ("Prólogo", "prologo", "cuerpo", None, True),
        *[(f"Capítulo {i}", "capitulo", "cuerpo", i, True) for i in range(1, 6)],
    ]
    # el índice del lector apunta a cada trozo y las frases de cada capítulo son suyas
    assert [n["href"] for n in e["toc"]][1:] == [f"cap-{i:03d}.xhtml#cap{i}" for i in range(1, 6)]
    for i in range(1, 6):
        frases = json.loads((destino / "frases" / f"cap-{i:03d}.json").read_text(encoding="utf-8"))["frases"]
        assert frases[0]["texto"] == f"Capítulo {i}"


def test_c4_adelanto_capitulo_1_al_final(convertidos):
    _d, e = convertidos("E09-capitulo1-adelanto.epub")
    numeros = [(c["titulo"], c["numero"]) for c in e["capitulos"]]
    assert numeros[1:8] == [
        (t, i)
        for i, t in enumerate(
            ["El regreso", "La tormenta", "El faro", "La carta", "La isla", "El puerto", "La marea"], start=1
        )
    ]
    adelanto = next(c for c in e["capitulos"] if c["titulo"] == "Capítulo 1")
    assert (adelanto["tipo"], adelanto["region"], adelanto["numero"], adelanto["enVoz"]) == (
        "publicidad",
        "despues",
        None,
        False,
    )


def test_c5_partes(convertidos):
    _d, e = convertidos("E04-partes.epub")
    assert [(c["tipo"], c["numero"]) for c in e["capitulos"]] == [
        ("prologo", None),
        ("parte", None),
        ("capitulo", 1),
        ("capitulo", 2),
        ("capitulo", 3),
        ("parte", None),
        ("capitulo", 1),
        ("capitulo", 2),
        ("capitulo", 3),
        ("epilogo", None),
    ]


def test_c6_trozos_heredan_el_numero(convertidos):
    _d, e = convertidos("E05b-un-bloque-enorme.epub")
    assert len(e["capitulos"]) > 3
    assert {c["numero"] for c in e["capitulos"]} == {1}
    assert all(c["tipo"] == "capitulo" and c["enVoz"] for c in e["capitulos"])


def test_c7_epub2_notas_y_autor_no_entran_en_el_ultimo_capitulo(convertidos):
    destino, e = convertidos("E02-epub2-ncx-parcial.epub")
    assert [(c["tipo"], c["numero"]) for c in e["capitulos"]][:6] == [("preliminar", None)] + [
        ("capitulo", i) for i in range(1, 6)
    ]
    finales = e["capitulos"][6:]
    assert len(finales) == 2 and all(c["region"] == "despues" and not c["enVoz"] for c in finales)
    ultimo = json.loads((destino / "frases" / "cap-005.json").read_text(encoding="utf-8"))["frases"]
    assert not any("faro y vive" in f["texto"] or "nota del final" in f["texto"] for f in ultimo)


def test_c7_no_lineal_fuera_del_cuerpo(convertidos):
    destino, e = convertidos("E14-no-lineal.epub")
    titulos = [c["titulo"] for c in e["capitulos"]]
    assert [c["numero"] for c in e["capitulos"] if c["tipo"] == "capitulo"] == [1, 2, 3]
    nota = e["capitulos"][titulos.index("Nota emergente")]
    assert nota["origenTipo"] == "linear" and not nota["enVoz"] and nota["numero"] is None
    k2 = titulos.index("Capítulo 2")
    cap2 = json.loads((destino / "frases" / f"cap-{k2:03d}.json").read_text(encoding="utf-8"))["frases"]
    assert not any("cuarenta y dos" in f["texto"] for f in cap2)  # el anexo no lineal no se pega al capítulo 2


def test_c8_nav_sin_tipo(convertidos):
    _d, e = convertidos("E15-nav-sin-tipo.epub")
    assert [(c["titulo"], c["numero"]) for c in e["capitulos"]] == [(f"Capítulo {i}", i) for i in range(1, 6)]


def test_c9_pdf_varias_entradas_en_la_misma_pagina(convertidos):
    _d, e = convertidos("P02-dos-columnas-marcadores.pdf")
    assert e["capitulos"][0]["titulo"] == "Capítulo 1" and e["capitulos"][0]["numero"] == 1


def test_c10_metadatos_opf(convertidos):
    _d, a = convertidos("E12a-opf-raro.epub")
    assert a["titulo"] == "La casa del faro" and a["subtitulo"] == "una historia de mareas"
    assert a["autores"] == ["Ana Pérez"] and a["idioma"] == "es"
    _d, c = convertidos("E12c-calibre-unknown.epub")
    assert c["autores"] == [] and c["titulo"] != "Unknown" and c["idioma"] == "es"
    _d, d = convertidos("E12d-idioma-mal.epub")
    assert d["idioma"] == "es"
    assert normalizar_idioma("spa") == "es" and normalizar_idioma("Castellano") == "es"
    assert normalizar_idioma("es-CO") == "es" and normalizar_idioma("English") == "en"
    assert normalizar_idioma("") is None and normalizar_idioma("xx-YY") == "xx"
    assert autor_util("Pérez, Ana") == "Ana Pérez" and autor_util("Unknown") is None


def test_c16_portada_enorme_no_rechaza_el_libro(convertidos):
    destino, e = convertidos("E13b-portada-gigante.epub")
    assert e["tienePortada"] is False and len(e["capitulos"]) == 1
    assert not (destino / "portada.jpg").exists()


def test_txt_y_ingles(convertidos):
    _d, t = convertidos("T01-latin1.txt")
    tipos = {c["titulo"].lower(): c["tipo"] for c in t["capitulos"]}
    assert tipos.get("prólogo") == "prologo"
    assert [c["numero"] for c in t["capitulos"] if c["tipo"] == "capitulo"] == [1, 2, 3]
    _d, en = convertidos("E08-ingles.epub")
    r = {c["titulo"]: c for c in en["capitulos"]}
    assert [r[f"Chapter {w}"]["numero"] for w in ("One", "Two", "Three", "Four")] == [1, 2, 3, 4]
    assert r["Acknowledgments"]["region"] == "despues" and r["Foreword"]["tipo"] == "prologo"


# ------------------------------------------------------------------ C11: reclasificar libros ya convertidos


def _como_033(e: dict) -> dict:
    """Lo que tendría un libro convertido con 0.3.3: sin «version» ni los campos de C1."""
    viejo = json.loads(json.dumps(e))
    viejo.pop("version", None)
    viejo.pop("clasificador", None)
    for c in viejo["capitulos"]:
        for k in ("tipo", "region", "numero", "enVoz", "palabrasVoz", "origenTipo"):
            c.pop(k)
    return viejo


def test_c11_reclasificar_conserva_indices_y_es_idempotente(convertidos, corpus, tmp_path):
    destino, nuevo = convertidos("E01-epub3-completo.epub")
    copia = tmp_path / "n"
    copia.mkdir()
    (copia / "frases").mkdir()
    for f in (destino / "frases").iterdir():
        (copia / "frases" / f.name).write_bytes(f.read_bytes())
    viejo = _como_033(nuevo)
    (copia / "estructura.json").write_text(json.dumps(viejo), encoding="utf-8")
    assert reclasificar(copia, corpus / "E01-epub3-completo.epub") == "hecho"
    r = json.loads((copia / "estructura.json").read_text(encoding="utf-8"))
    assert r["version"] == 2
    for a, b in zip(viejo["capitulos"], r["capitulos"], strict=True):
        assert {k: b[k] for k in a} == a  # índice, título, href, palabras… intactos
    assert [c["tipo"] for c in r["capitulos"]] == [c["tipo"] for c in nuevo["capitulos"]]
    assert [c["origenTipo"] for c in r["capitulos"]] == [c["origenTipo"] for c in nuevo["capitulos"]]
    antes = (copia / "estructura.json").read_bytes()
    assert reclasificar(copia, corpus / "E01-epub3-completo.epub") == "ya"
    assert (copia / "estructura.json").read_bytes() == antes


def test_c11_libro_033_con_varios_capitulos_en_un_xhtml_no_cambia_de_indices(corpus, tmp_path):
    # 0.3.3 dejaba E07 en 2 capítulos («Prólogo» y todo lo demás como «Capítulo 1»): se clasifica sin partirlo
    viejo = {
        "versionFormato": 1,
        "titulo": "Todo en un archivo",
        "capitulos": [
            {"indice": 0, "titulo": "Prólogo", "href": "cap-000.xhtml", "nivel": 1, "frases": 3, "palabras": 90},
            {"indice": 1, "titulo": "Capítulo 1", "href": "cap-001.xhtml", "nivel": 1, "frases": 9, "palabras": 900},
        ],
        "toc": [],
    }
    (tmp_path / "estructura.json").write_text(json.dumps(viejo), encoding="utf-8")
    assert reclasificar(tmp_path, corpus / "E07-varios-en-uno.epub") == "hecho"
    r = json.loads((tmp_path / "estructura.json").read_text(encoding="utf-8"))
    assert [(c["indice"], c["tipo"], c["numero"]) for c in r["capitulos"]] == [(0, "prologo", None), (1, "capitulo", 1)]


def test_c11_sin_original_o_que_no_casa_clasifica_por_titulo(tmp_path):
    viejo = {
        "capitulos": [
            {"indice": 0, "titulo": "Prólogo", "href": "cap-000.xhtml", "palabras": 500},
            {"indice": 1, "titulo": "Capítulo primero", "href": "cap-001.xhtml", "palabras": 900},
            {"indice": 2, "titulo": "Agradecimientos", "href": "cap-002.xhtml", "palabras": 50},
        ],
        "toc": [],
    }
    (tmp_path / "estructura.json").write_text(json.dumps(viejo), encoding="utf-8")
    assert reclasificar(tmp_path, None) == "hecho"
    r = json.loads((tmp_path / "estructura.json").read_text(encoding="utf-8"))
    assert [(c["tipo"], c["numero"], c["origenTipo"]) for c in r["capitulos"]] == [
        ("prologo", None, "titulo"),
        ("capitulo", 1, "titulo"),
        ("agradecimientos", None, "titulo"),
    ]
    assert reclasificar(tmp_path / "no-existe", None) == "sin-estructura"


def test_c11_hoja_de_calculo(tmp_path):
    (tmp_path / "hoja.json").write_text("{}", encoding="utf-8")
    viejo = {"capitulos": [{"indice": 0, "titulo": "Ventas", "href": None, "palabras": 0}], "toc": []}
    (tmp_path / "estructura.json").write_text(json.dumps(viejo), encoding="utf-8")
    assert reclasificar(tmp_path, None) == "hecho"
    c = json.loads((tmp_path / "estructura.json").read_text(encoding="utf-8"))["capitulos"][0]
    assert (c["tipo"], c["enVoz"]) == ("otro", False)


def test_manejador_reclasificar(corpus, tmp_path, convertidos):
    rutas = Rutas(tmp_path)
    aid = "00000000-0000-0000-0000-0000000000c2"
    _destino, nuevo = convertidos("E04-partes.epub")
    n = rutas.normalizados(aid)
    n.mkdir(parents=True)
    (n / "estructura.json").write_text(json.dumps(_como_033(nuevo)), encoding="utf-8")
    o = rutas.originales(aid)
    o.mkdir(parents=True)
    (o / "libro.epub").write_bytes((corpus / "E04-partes.epub").read_bytes())
    ManejadorReclasificar(rutas, aislar=False).ejecutar({"id": "t", "archivo_id": aid}, None)  # type: ignore[arg-type]
    r = json.loads((n / "estructura.json").read_text(encoding="utf-8"))
    assert [c["tipo"] for c in r["capitulos"]] == [c["tipo"] for c in nuevo["capitulos"]]
    # sin original ni estructura: no falla
    ManejadorReclasificar(rutas, aislar=False).ejecutar({"id": "t", "archivo_id": "otro"}, None)  # type: ignore[arg-type]


# ------------------------------------------------------------------ arreglos de la validación 0.4.0 (V-NUEVO-1, A-1)

_CUENTOS = ["La lluvia", "El gato", "La abuela", "Mi calle", "El río"]


def test_v_nuevo_1_cuentos_cortos_antes_de_uno_largo_son_el_libro():
    # VS07: cinco cuentos de ~250 palabras y uno largo; 0.4.0 dejaba los cinco en «preliminar», antes y fuera de voz
    c = clasificar([_e(t, 250) for t in _CUENTOS] + [_e("El viaje", 900)])
    assert [(x.tipo, x.region, x.numero, x.en_voz) for x in c] == [("capitulo", "cuerpo", k, True) for k in range(1, 7)]
    # VS08 (sin el largo) daba lo mismo: el resultado ya no depende de que haya un capítulo largo detrás
    assert [x.numero for x in clasificar([_e(t, 250) for t in _CUENTOS])] == [1, 2, 3, 4, 5]


def test_v_nuevo_1_portadilla_y_dedicatoria_siguen_antes():
    entradas = [
        _e("La casa del faro", 30),  # la página con el título del libro
        _e("A mi madre", 6),  # dedicatoria sin título de diccionario: muy corta
        _e("Sección 3", 60),  # título genérico que pone el conversor
        _e("Dedicatoria", 10),
    ] + [_e(t, 40) for t in _CUENTOS]  # poemas cortos con título
    c = clasificar(entradas, "La casa del faro")
    assert [x.region for x in c[:4]] == ["antes"] * 4 and not any(x.en_voz for x in c[:4])
    assert [(x.tipo, x.numero, x.en_voz) for x in c[4:]] == [("capitulo", k, True) for k in range(1, 6)]


def test_v_nuevo_1_cuento_que_da_titulo_al_libro_no_es_la_portadilla():
    c = clasificar([_e("El llano en llamas", 300), _e("Macario", 300)], "El llano en llamas")
    assert [x.numero for x in c] == [1, 2]


def test_v_nuevo_1_numero_del_encabezado_si_el_indice_no_lo_trae():
    titulos = ["Números", "Romanos", "Diálogos"]
    con = [_e(t, 150, encabezado=f"Capítulo {k}. {t}") for k, t in enumerate(titulos, start=1)]
    c = clasificar([*con, _e("Enorme", 4800, encabezado="Capítulo 7. Enorme")])
    assert [(x.tipo, x.numero, x.en_voz) for x in c] == [
        ("capitulo", 1, True),
        ("capitulo", 2, True),
        ("capitulo", 3, True),
        ("capitulo", 7, True),
    ]
    # encabezados desordenados (qa-aud-voz: 1, IV, 3…): mandan las posiciones; «Enorme» ya no es el capítulo 1
    raros = [("Números", "Capítulo 1. Números"), ("Romanos", "Capítulo IV"), ("Diálogos", "Capítulo 3. Diálogos")]
    c = clasificar([_e(t, 150, encabezado=h) for t, h in raros] + [_e("Enorme", 4800, encabezado="Capítulo 7.")])
    assert [x.numero for x in c] == [1, 2, 3, 4]


def test_a1_si_nada_queda_en_voz_se_lee_todo_lo_que_tiene_texto():
    # VS09: un solo cuento titulado «Epígrafe»
    c = clasificar([_e("Epígrafe", 300)])
    assert (c[0].tipo, c[0].en_voz) == ("epigrafe", True)
    # qa-datos-E10: dos «Notas» y nada más; lo vacío sigue fuera
    c = clasificar([_e("Notas", 200), _e("Notas", 150), _e("Créditos", 5, palabras_voz=0)])
    assert [x.en_voz for x in c] == [True, True, False]
    # si algo ya está en voz, lo demás no cambia
    c = clasificar([_e("Dedicatoria", 10), _e("Capítulo 1", 900)])
    assert [x.en_voz for x in c] == [False, True]


def _v2_con_reglas_viejas(tmp_path: Path) -> dict:
    """Un libro de cuentos clasificado por el taller 0.4.0 (V-NUEVO-1): v2 sin «clasificador»."""
    capitulos = []
    (tmp_path / "frases").mkdir()
    for k, (t, palabras) in enumerate([*((t, 250) for t in _CUENTOS), ("El viaje", 900)]):
        largo = k == 5
        capitulos.append(
            {
                "indice": k,
                "titulo": t,
                "href": f"cap-{k:03d}.xhtml",
                "nivel": 1,
                "frases": 2,
                "palabras": palabras,
                "tipo": "capitulo" if largo else "preliminar",
                "region": "cuerpo" if largo else "antes",
                "numero": 1 if largo else None,
                "enVoz": largo,
                "palabrasVoz": palabras,
                "origenTipo": "posicion",
            }
        )
        frases = [{"id": f"c{k:03d}-s00000", "texto": t, "voz": t, "esTitulo": True}]
        frases.append({"id": f"c{k:03d}-s00001", "texto": "x", "voz": " ".join(["palabra"] * palabras)})
        (tmp_path / "frases" / f"cap-{k:03d}.json").write_text(json.dumps({"frases": frases}), encoding="utf-8")
    datos = {"versionFormato": 1, "version": 2, "titulo": "Cuentos", "capitulos": capitulos, "toc": []}
    (tmp_path / "estructura.json").write_text(json.dumps(datos), encoding="utf-8")
    return datos


def test_v_nuevo_1_reclasificar_rehace_lo_clasificado_con_reglas_viejas(tmp_path):
    viejo = _v2_con_reglas_viejas(tmp_path)
    assert reclasificar(tmp_path, None) == "hecho"
    r = json.loads((tmp_path / "estructura.json").read_text(encoding="utf-8"))
    assert r["version"] == 2 and r["clasificador"] == VERSION_CLASIFICADOR
    assert [(c["tipo"], c["region"], c["numero"], c["enVoz"]) for c in r["capitulos"]] == [
        ("capitulo", "cuerpo", k, True) for k in range(1, 7)
    ]
    campos = ("indice", "titulo", "href", "nivel", "frases", "palabras")
    for a, b in zip(viejo["capitulos"], r["capitulos"], strict=True):
        assert {k: b[k] for k in campos} == {k: a[k] for k in campos}
    antes = (tmp_path / "estructura.json").read_bytes()
    assert reclasificar(tmp_path, None) == "ya"  # idempotente con las reglas nuevas
    assert (tmp_path / "estructura.json").read_bytes() == antes


def test_reclasificar_v2_sin_original_conserva_las_pistas_del_formato(tmp_path):
    datos = {
        "version": 2,
        "titulo": "x",
        "toc": [],
        "capitulos": [
            {"indice": 0, "titulo": "Lo que sea", "palabras": 30, "tipo": "dedicatoria", "origenTipo": "epub-type"},
            {"indice": 1, "titulo": "Glosa", "palabras": 900, "tipo": "otro", "origenTipo": "linear"},
            {"indice": 2, "titulo": "Uno", "palabras": 900, "tipo": "capitulo", "origenTipo": "titulo"},
        ],
    }
    (tmp_path / "estructura.json").write_text(json.dumps(datos), encoding="utf-8")
    assert reclasificar(tmp_path, None) == "hecho"
    r = json.loads((tmp_path / "estructura.json").read_text(encoding="utf-8"))["capitulos"]
    assert [(c["tipo"], c["origenTipo"]) for c in r] == [
        ("dedicatoria", "epub-type"),
        ("otro", "linear"),
        ("capitulo", "titulo"),
    ]


def test_v_nuevo_1_convertir_libro_de_cuentos(tmp_path):
    corpus_estructura.OUT = tmp_path

    def doc(k: int, t: str, parrafos: int) -> tuple[str, str, str]:  # sin epub:type: decide la posición
        return f"c{k}", f"c{k}.xhtml", corpus_estructura.xhtml(f"<h1>{t}</h1>{corpus_estructura.parrafos(parrafos)}", t)

    docs = [doc(k, t, 5) for k, t in enumerate(_CUENTOS)] + [doc(9, "El viaje", 25)]
    toc = [(t, f"c{k}.xhtml") for k, t in enumerate(_CUENTOS)] + [("El viaje", "c9.xhtml")]
    corpus_estructura.epub("cuentos.epub", docs, toc, titulo="Cuentos de la orilla")
    convertir(tmp_path / "cuentos.epub", tmp_path / "n", "00000000-0000-0000-0000-0000000000e2")
    e = json.loads((tmp_path / "n" / "estructura.json").read_text(encoding="utf-8"))
    assert e["clasificador"] == VERSION_CLASIFICADOR
    assert [(c["titulo"], c["numero"], c["enVoz"]) for c in e["capitulos"]] == [
        (t, k, True) for k, t in enumerate([*_CUENTOS, "El viaje"], start=1)
    ]

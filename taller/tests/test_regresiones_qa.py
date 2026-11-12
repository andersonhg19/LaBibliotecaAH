"""Regresiones de los informes de QA (documentación/pruebas/qa-conversion-datos.md, qa-seguridad.md y
qa-biblioteca.md). Cada prueba lleva el id del hallazgo; los archivos de `datos_qa/` son los que usaron los QA."""

import asyncio
import json
import re
import shutil
import threading
import time
import zipfile
from pathlib import Path

import pytest

from app.api.servidor import Taller
from app.cola import trabajador as tr
from app.cola.trabajador import Barrendero, Manejador, ManejadorConvertir, ManejadorVoz, mensaje_de, procesar
from app.config.ajustes import Ajustes
from app.config.rutas import Rutas
from app.conversion import convertir as modulo_convertir
from app.conversion import limites
from app.conversion.aislado import ErrorInternoAislado, ejecutar_aislado
from app.conversion.convertir import convertir
from app.conversion.desde_txt import decodificar
from app.conversion.metadatos import normalizar_autores, titulo_desde_nombre, titulo_util
from app.conversion.normalizador import normalizar_visual, preparar_voz
from app.conversion.partir import partir_capitulos_largos, partir_parrafo
from app.dominio.modelo import Capitulo, ErrorDefinitivo, ErrorReintentable, Libro, NodoToc, TrabajoCancelado
from app.voz import audio
from app.voz import motor as modulo_motor
from app.voz.capitulo import borrar_audio_capitulo, generar_capitulo
from tests import ayudas_aislado as ayudas
from tests import corpus
from tests.conftest import hay_ffmpeg, hay_soffice
from tests.test_trabajador import RepoFalso, trabajo
from tests.test_voz import MotorFalso
from tests.validar import frases_cap, textos, validar_salida

QA = Path(__file__).parent / "datos_qa"
CONTROLES = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

CONTAINER = (
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>'
    "</container>"
)
OPF = (
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="u">'
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="u">x</dc:identifier>'
    "<dc:title>Bomba</dc:title></metadata><manifest>"
    '<item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest>'
    '<spine><itemref idref="c1"/></spine></package>'
)


def convertido(tmp_path: Path, origen: Path) -> tuple[Path, dict]:
    d = tmp_path / "n"
    convertir(origen, d, "x")
    return d, validar_salida(d)


def todas_las_frases(d: Path, est: dict) -> list[dict]:
    return [f for c in est["capitulos"] for f in frases_cap(d, c["indice"])]


# ================================================================== SE-01: zip-bomb y archivos desmesurados


def epub_bomba(ruta: Path, mb: int) -> Path:
    with zipfile.ZipFile(ruta, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
        z.writestr("META-INF/container.xml", CONTAINER)
        z.writestr("OEBPS/content.opf", OPF)
        with z.open("OEBPS/cap1.xhtml", "w", force_zip64=True) as f:
            f.write(b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>')
            bloque = b"Hola mundo. " * (1024 * 1024 // 12)
            for _ in range(mb):
                f.write(bloque)
            f.write(b"</p></body></html>")
    return ruta


class TestSE01LimitesDeConversion:
    def test_la_zip_bomba_de_un_epub_se_rechaza_sin_descomprimirla(self, tmp_path):
        bomba = epub_bomba(tmp_path / "bomba.epub", 30)
        assert bomba.stat().st_size < 2 * 1024 * 1024  # pocos KB/MB comprimidos que serían 30 MB de texto
        inicio = time.monotonic()
        with pytest.raises(ErrorDefinitivo, match="comprimido de una forma anómala"):
            convertir(bomba, tmp_path / "n", "x")
        assert time.monotonic() - inicio < 5
        assert not (tmp_path / "n").exists()

    def test_una_parte_de_texto_desmesurada_se_rechaza(self, tmp_path, monkeypatch, epub_prueba):
        monkeypatch.setattr(limites, "MAX_ENTRADA_TEXTO", 200)
        with pytest.raises(ErrorDefinitivo, match="demasiado grande para convertirlo: una de sus partes ocupa"):
            convertir(epub_prueba, tmp_path / "n", "x")

    def test_demasiadas_entradas_o_tamano_total_se_rechazan(self, tmp_path, monkeypatch, epub_prueba):
        monkeypatch.setattr(limites, "MAX_ENTRADAS_ZIP", 3)
        with pytest.raises(ErrorDefinitivo, match="más de 3 archivos internos"):
            convertir(epub_prueba, tmp_path / "n", "x")
        monkeypatch.setattr(limites, "MAX_ENTRADAS_ZIP", 10_000)
        monkeypatch.setattr(limites, "MAX_TOTAL_TEXTO", 1000)
        with pytest.raises(ErrorDefinitivo, match="su texto ocupa más de"):
            convertir(epub_prueba, tmp_path / "n", "x")
        monkeypatch.setattr(limites, "MAX_TOTAL_TEXTO", 10**9)
        monkeypatch.setattr(limites, "MAX_TOTAL_ZIP", 1000)
        with pytest.raises(ErrorDefinitivo, match="descomprimido ocupa más de"):
            convertir(epub_prueba, tmp_path / "n", "x")

    def test_la_zip_bomba_de_un_docx_se_rechaza(self, tmp_path):
        ruta = tmp_path / "bomba.docx"
        with zipfile.ZipFile(ruta, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", "<Types/>")
            z.writestr("word/document.xml", b"<w:t>Hola mundo. </w:t>" * (2 * 1024 * 1024 // 10))
        with pytest.raises(ErrorDefinitivo, match="anómala"):
            convertir(ruta, tmp_path / "n", "x")

    def test_txt_doc_y_pdf_desmesurados_se_rechazan(self, tmp_path, monkeypatch, txt_prueba):
        monkeypatch.setattr(limites, "MAX_TXT", 10)
        with pytest.raises(ErrorDefinitivo, match="el archivo de texto ocupa más de"):
            convertir(txt_prueba, tmp_path / "n", "x")
        monkeypatch.setattr(limites, "MAX_DOC", 10)
        doc = tmp_path / "viejo.doc"
        doc.write_bytes(b"\xd0\xcf\x11\xe0" + b"\0" * 100)
        with pytest.raises(ErrorDefinitivo, match=r"el documento .doc ocupa más de"):
            convertir(doc, tmp_path / "n", "x")
        monkeypatch.setattr(limites, "MAX_PAGINAS_PDF", 2)
        pdf = corpus.crear_pdf_sin_toc(tmp_path / "p.pdf", paginas=3)
        with pytest.raises(ErrorDefinitivo, match="tiene más de 2 páginas"):
            convertir(pdf, tmp_path / "n", "x")

    def test_un_epub_normal_pasa_los_limites(self, tmp_path, epub_prueba):
        _d, est = convertido(tmp_path, epub_prueba)
        assert est["titulo"] == "La biblioteca de prueba"


class TestSE01ConversionAislada:
    def test_devuelve_el_resultado_del_subproceso(self):
        assert ejecutar_aislado(ayudas.doble, (21,), memoria_mb=1024, tiempo_seg=60) == 42

    def test_sin_memoria_da_error_definitivo_y_el_servidor_sigue_vivo(self):
        with pytest.raises(ErrorDefinitivo, match="más memoria de la permitida"):
            ejecutar_aislado(ayudas.agotar_memoria, (), memoria_mb=512, tiempo_seg=60)

    def test_tiempo_agotado_mata_el_subproceso(self):
        inicio = time.monotonic()
        with pytest.raises(ErrorDefinitivo, match="tardó más de 1 minutos"):
            ejecutar_aislado(ayudas.dormir, (60,), memoria_mb=1024, tiempo_seg=1)
        assert time.monotonic() - inicio < 15

    def test_los_errores_del_taller_conservan_su_mensaje(self):
        with pytest.raises(ErrorDefinitivo, match="El PDF está dañado"):
            ejecutar_aislado(ayudas.fallar_con_mensaje, (), memoria_mb=1024, tiempo_seg=60)

    def test_un_fallo_inesperado_no_llega_con_jerga_al_usuario(self):
        with pytest.raises(ErrorInternoAislado) as e:
            ejecutar_aislado(ayudas.fallar_raro, (), memoria_mb=1024, tiempo_seg=60)
        msg = mensaje_de(e.value, ManejadorConvertir(Rutas("/tmp")))
        assert "ValueError" not in msg and "XML" not in msg and "Detalle técnico" not in msg
        assert msg.startswith("No se pudo convertir el libro por un problema inesperado")

    def test_un_hijo_muerto_por_el_sistema_da_mensaje_claro(self):
        with pytest.raises(ErrorDefinitivo, match="se interrumpió de forma inesperada"):
            ejecutar_aislado(ayudas.morir_por_oom, (), memoria_mb=1024, tiempo_seg=60)
        with pytest.raises(ErrorReintentable, match="se interrumpió de forma inesperada"):
            ejecutar_aislado(ayudas.salir_sin_responder, (), memoria_mb=1024, tiempo_seg=60)

    def test_el_manejador_convierte_en_subproceso_y_la_bomba_queda_en_error(self, tmp_path, txt_prueba):
        rutas = Rutas(tmp_path)
        rutas.originales("a1").mkdir(parents=True)
        shutil.copy(txt_prueba, rutas.originales("a1") / "libro.txt")
        epub_bomba(rutas.originales("a2").parent / "bomba.epub", 20)
        rutas.originales("a2").mkdir()
        shutil.move(str(rutas.originales("a2").parent / "bomba.epub"), rutas.originales("a2") / "bomba.epub")
        repo = RepoFalso([trabajo("t1"), trabajo("t2", archivo="a2", creado=1)])
        m = ManejadorConvertir(rutas, aislar=True, memoria_mb=1024, tiempo_seg=120)
        assert procesar(repo.tomar(["CONVERTIR"]), m, repo, 3) == "HECHO"
        assert repo.archivos["a1"]["estado"] == "LISTO" and repo.archivos["a1"]["n_capitulos"] == 3
        assert procesar(repo.tomar(["CONVERTIR"]), m, repo, 3) == "ERROR"
        assert repo.trabajos[1]["intentos"] == 1  # sin reintentos inútiles
        assert repo.archivos["a2"]["estado"] == "ERROR"
        assert "comprimido de una forma anómala" in repo.archivos["a2"]["error"]
        assert not rutas.normalizados("a2").exists()


# ================================================================== DA-01: trabajos EN_CURSO tras un reinicio


def ajustes(tmp_path, **extra) -> Ajustes:
    base = {"db_url": "postgresql://x:y@nadie:5432/db", "datos": tmp_path, "muestras": False}
    return Ajustes(**{**base, **extra})


class TestDA01RecuperacionDeTrabajos:
    def test_al_arrancar_se_reabren_todos_los_en_curso_y_luego_se_barre_cada_poco(self, tmp_path):
        repo = RepoFalso()
        taller = Taller(ajustes(tmp_path, intervalo_seg=0.05, intervalo_barrido_seg=0.05, minutos_atascado=5))
        taller.fabrica_repo = lambda: repo  # type: ignore[method-assign]
        taller.iniciar()
        try:
            fin = time.monotonic() + 5
            while len(repo.reinicios) < 3 and time.monotonic() < fin:
                time.sleep(0.02)
        finally:
            taller.detener()
        # 1.º: al arrancar, sin esperar 30 min (antes: solo los de > 30 min y solo al arrancar)
        assert repo.reinicios[0] == (0, ["CONVERTIR", "VOZ_CAPITULO", "RELEER_METADATOS"])
        # después, barrido periódico de los que llevan 5 min sin latido
        assert repo.reinicios[1] == (300, ["CONVERTIR", "VOZ_CAPITULO", "RELEER_METADATOS"])
        assert [t.name for t in taller.trabajadores] == ["conversion", "metadatos", "voz", "voz-2", "voz-urgente"]
        assert taller.barrendero is not None and not taller.barrendero.is_alive()

    def test_el_barrendero_sobrevive_a_la_base_de_datos_caida(self):
        llamadas = []

        def fabrica():
            llamadas.append(1)
            raise ConnectionError("BD caída")

        parar = threading.Event()
        b = Barrendero(fabrica, ["CONVERTIR"], 300, 0.02, parar)
        b.start()
        fin = time.monotonic() + 5
        while len(llamadas) < 3 and time.monotonic() < fin:
            time.sleep(0.02)
        assert b.is_alive()
        parar.set()
        b.join(2)
        assert len(llamadas) >= 3 and not b.is_alive()

    def test_un_trabajo_largo_late_mientras_corre(self):
        class Lento(Manejador):
            tipos = ("CONVERTIR",)

            def ejecutar(self, t, repo):
                time.sleep(0.4)

        repo = RepoFalso([trabajo()])
        assert procesar(repo.tomar(["CONVERTIR"]), Lento(), repo, 3, intervalo_latido=0.05) == "HECHO"
        assert repo.latidos >= 3


# ================================================================== DA-03: caracteres de control


class TestDA03CaracteresDeControl:
    @pytest.mark.parametrize(
        "nombre", ["qa-datos-T11-formfeed.txt", "qa-datos-T14-vtab.txt", "qa-datos-T15-escape.txt"]
    )
    def test_los_txt_de_qa_se_convierten(self, tmp_path, nombre):
        d, est = convertido(tmp_path, QA / nombre)
        assert est["totalFrases"] > 1
        assert not any(CONTROLES.search(t) for t in textos(d))

    def test_nulo_fin_de_archivo_y_c1_se_quitan(self, tmp_path):
        f = tmp_path / "c.txt"
        f.write_text("CAPÍTULO 1\n\nTexto con fin DOS\x1a y nulo\x00 en medio.\x85 Otra frase.\n", encoding="utf-8")
        d, _est = convertido(tmp_path, f)
        assert "Texto con fin DOS y nulo en medio." in textos(d)

    def test_normalizar_visual_quita_controles_y_convierte_saltos_en_espacio(self):
        assert normalizar_visual("a\x00b\x0cc\x0bd\x1be\x7ff\x9fg￾h") == "ab c defgh"
        assert normalizar_visual("línea\tcon\ttabs\n") == "línea\tcon\ttabs\n"


# ================================================================== DA-04, DA-05, DA-21: EPUB problemáticos


class TestEpubProblematicos:
    def test_da04_un_ncx_roto_no_tumba_el_libro(self, tmp_path):
        _d, est = convertido(tmp_path, QA / "qa-datos-E07-ncx-basura.epub")
        assert [c["titulo"] for c in est["capitulos"]] == ["Uno"]

    @pytest.mark.parametrize("nombre", ["qa-datos-E05-cifrado.epub", "qa-datos-E05b-cifrado-imprimible.epub"])
    def test_da05_un_epub_con_drm_da_un_mensaje_claro(self, tmp_path, nombre):
        with pytest.raises(ErrorDefinitivo, match="protegido con DRM"):
            convertir(QA / nombre, tmp_path / "n", "x")

    def test_da05_la_ofuscacion_de_fuentes_no_es_drm(self, tmp_path, epub_prueba):
        ruta = tmp_path / "fuentes.epub"
        shutil.copy(epub_prueba, ruta)
        with zipfile.ZipFile(ruta, "a") as z:
            z.writestr(
                "META-INF/encryption.xml",
                '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" '
                'xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData>'
                '<enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>'
                '<enc:CipherData><enc:CipherReference URI="OEBPS/fuente.otf"/></enc:CipherData>'
                "</enc:EncryptedData></encryption>",
            )
        _d, est = convertido(tmp_path, ruta)
        assert est["totalFrases"] > 5

    def test_da21_un_container_ilegible_es_definitivo_y_claro(self, tmp_path):
        with pytest.raises(ErrorDefinitivo, match=r"META-INF/container\.xml no se puede leer"):
            convertir(QA / "qa-datos-E08-container-basura.epub", tmp_path / "n", "x")

    def test_da17_un_capitulo_repartido_en_varios_xhtml_es_uno(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-E12-capitulo-partido.epub")
        assert len(est["capitulos"]) == 2  # antes 4 ("Sección 2", "Sección 3")
        assert not any(c["titulo"].startswith("Sección") for c in est["capitulos"])
        assert est["capitulos"][0]["palabras"] > 2 * est["capitulos"][1]["palabras"]
        assert [n["href"] for n in est["toc"]] == ["cap-000.xhtml", "cap-001.xhtml"]
        assert len(frases_cap(d, 0)) == est["capitulos"][0]["frases"]

    def test_da27_con_indice_anidado_gana_el_titulo_mas_concreto(self, tmp_path):
        _d, est = convertido(tmp_path, QA / "qa-datos-E01-epub3-anidado.epub")
        assert est["capitulos"][0]["titulo"] == "Capítulo 1. El comienzo"


# ================================================================== DA-06, DA-15, DA-18: TXT


class TestTxt:
    def test_da06_lineas_cortadas_no_inventan_capitulos(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-T08-gutenberg-70col.txt")
        assert [c["titulo"] for c in est["capitulos"]] == ["CAPÍTULO 1", "CAPÍTULO 2", "CAPÍTULO 3"]
        titulos = [f["texto"] for f in todas_las_frases(d, est) if f["esTitulo"]]
        assert titulos == ["CAPÍTULO 1", "CAPÍTULO 2", "CAPÍTULO 3"]

    def test_da06_un_parrafo_con_parte_libro_y_capitulo_al_inicio_de_linea(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-T20-gutenberg-2.txt")
        assert [c["titulo"] for c in est["capitulos"]] == ["CAPÍTULO 1", "CAPÍTULO 2"]
        assert [f["texto"] for f in todas_las_frases(d, est) if f["esTitulo"]] == ["CAPÍTULO 1", "CAPÍTULO 2"]

    def test_da06_siguen_valiendo_los_titulos_reales(self, tmp_path):
        f = tmp_path / "t.txt"
        f.write_text(
            "Capítulo primero\n\nUno. Dos.\n\nCapítulo 2: El viaje\n\nTres.\n\nPARTE II\n\nCAPÍTULO III\n\nCuatro.\n",
            encoding="utf-8",
        )
        _d, est = convertido(tmp_path, f)
        assert [c["titulo"] for c in est["capitulos"]] == ["Capítulo primero", "Capítulo 2: El viaje", "CAPÍTULO III"]
        assert est["toc"][2]["titulo"] == "PARTE II"

    @pytest.mark.parametrize("nombre", ["qa-datos-T05-utf16-bom.txt", "qa-datos-T06-utf16le-sin-bom.txt"])
    def test_da15_utf16_con_y_sin_bom(self, tmp_path, nombre):
        assert decodificar((QA / nombre).read_bytes()).startswith("CAPÍTULO 1")
        _d, est = convertido(tmp_path, QA / nombre)
        assert [c["titulo"] for c in est["capitulos"]] == ["CAPÍTULO 1", "CAPÍTULO 2", "CAPÍTULO 3"]

    def test_da18_un_txt_sin_titulos_se_trocea(self, tmp_path):
        f = tmp_path / "largo.txt"
        parrafo = " ".join(f"La palabra número {i} del libro sin títulos." for i in range(40))
        f.write_text("\n\n".join(parrafo for _ in range(80)), encoding="utf-8")  # ~25 600 palabras
        _d, est = convertido(tmp_path, f)
        caps = est["capitulos"]
        assert len(caps) >= 4  # antes: un único capítulo de horas
        assert all(c["palabras"] <= 6000 for c in caps)
        assert caps[0]["titulo"] == "Inicio" and caps[1]["titulo"] == f"Inicio (parte 2 de {len(caps)})"

    def test_da18_una_sola_linea_gigante_se_parte_por_frases(self, tmp_path):
        f = tmp_path / "linea.txt"
        f.write_text(" ".join(f"Frase corta número {i}." for i in range(5000)), encoding="utf-8")
        _d, est = convertido(tmp_path, f)
        assert len(est["capitulos"]) >= 3
        assert all(c["palabras"] <= 6000 for c in est["capitulos"])


# ================================================================== DA-18: troceo genérico (índice y enlaces)


def test_da18_partir_conserva_indice_anclas_y_enlaces():
    from lxml import etree

    def cuerpo(*parrafos: str, ids: tuple = ()) -> etree._Element:
        b = etree.Element("body")
        for k, t in enumerate(parrafos):
            p = etree.SubElement(b, "p")
            p.text = t
            if k < len(ids) and ids[k]:
                p.set("id", ids[k])
        return b

    largo = cuerpo("uno dos tres", "cuatro cinco seis", "siete ocho nueve", ids=(None, None, "ancla"))
    enlace = cuerpo("ver")
    a = etree.SubElement(enlace[0], "a", {"href": "cap-000.xhtml#ancla"})
    a.text = "aquí"
    libro = Libro(
        capitulos=[Capitulo("Largo", largo), Capitulo("Corto", enlace)],
        toc=[NodoToc("Largo", 0, None, [NodoToc("Ancla", 0, "ancla")]), NodoToc("Corto", 1)],
    )
    partir_capitulos_largos(libro, maximo=4)
    assert [c.titulo for c in libro.capitulos] == [
        "Largo",
        "Largo (parte 2 de 3)",
        "Largo (parte 3 de 3)",
        "Corto",
    ]
    assert libro.toc[0].hijos[0].capitulo == 2  # el ancla vive en el 3.er trozo
    assert [h.titulo for h in libro.toc[0].hijos[1:]] == ["Largo (parte 2 de 3)", "Largo (parte 3 de 3)"]
    assert libro.toc[1].capitulo == 3
    assert libro.capitulos[3].cuerpo.find(".//a").get("href") == "cap-002.xhtml#ancla"
    assert partir_parrafo("Corta.") == ["Corta."]


# ================================================================== DA-07, DA-08, DA-16, DA-22: PDF


def pdf_cabecera_por_capitulo(destino: Path) -> Path:
    """Como el P10 de QA: páginas pares "QA DATOS NOVELA", impares el nombre del capítulo; párrafos que cruzan."""
    import pymupdf

    nombres = ["El viaje al norte", "La casa del puerto", "Epílogo del mar"]
    doc = pymupdf.open()
    toc = []
    pag = 0
    for nombre in nombres:
        palabras = ("la casa miraba el río y recordaba la historia del pueblo " * 360).split()
        lineas, actual = [], ""
        for w in palabras:
            if len(actual) + 1 + len(w) > 92:
                lineas.append(actual)
                actual = w
            else:
                actual = (actual + " " + w).strip()
        lineas.append(actual + ".")
        k, primera = 0, True
        while k < len(lineas):
            p = doc.new_page(width=595, height=842)
            pag += 1
            if primera:
                toc.append([1, nombre, pag])
                p.insert_text((60, 100), nombre, fontsize=22)
                y, primera = 130, False
            else:
                y = 90
            p.insert_text((60, 45), "QA DATOS NOVELA" if pag % 2 == 0 else nombre.upper(), fontsize=9)
            p.insert_text((290, 815), str(pag), fontsize=9)
            while k < len(lineas) and y < 842 - 80:
                p.insert_text((60, y), lineas[k], fontsize=10)
                y += 13
                k += 1
    doc.set_toc(toc)
    doc.save(str(destino))
    doc.close()
    return destino


class TestPdf:
    def test_da07_la_cabecera_con_el_nombre_del_capitulo_se_quita(self, tmp_path):
        d, est = convertido(tmp_path, pdf_cabecera_por_capitulo(tmp_path / "p10.pdf"))
        assert [c["titulo"] for c in est["capitulos"]] == ["El viaje al norte", "La casa del puerto", "Epílogo del mar"]
        todo = " ".join(textos(d))
        for cabecera in ("QA DATOS NOVELA", "EL VIAJE AL NORTE", "LA CASA DEL PUERTO", "EPÍLOGO DEL MAR"):
            assert cabecera not in todo
        for c in est["capitulos"]:  # el párrafo que cruza páginas queda entero
            assert sum(1 for f in frases_cap(d, c["indice"]) if f["finParrafo"] and not f["esTitulo"]) == 1

    def test_da08_las_notas_al_pie_no_se_leen_y_quedan_en_su_capitulo(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-P01-pdf-cabeceras-notas.pdf")
        assert len(est["capitulos"]) == 4
        for c in est["capitulos"]:
            frases = frases_cap(d, c["indice"])
            notas = [f for f in frases if "Nota al pie" in f["texto"]]
            assert notas, c["titulo"]
            assert all(f["voz"] == "" for f in notas)
            assert all("Nota al pie" not in f["voz"] for f in frases)
        assert not any(re.search(r"\w- ?1 Nota", t) for t in textos(d))  # ya no parte palabras con guion
        assert "QA DATOS: EL LIBRO DE PRUEBA" not in " ".join(textos(d))

    def test_da16_autor_apellido_nombre_es_una_persona(self, tmp_path):
        _d, est = convertido(tmp_path, QA / "qa-datos-P14-pdf-autor-apellido.pdf")
        assert est["autores"] == ["Miguel de Cervantes Saavedra"]
        assert normalizar_autores("García Márquez, Gabriel") == ["Gabriel García Márquez"]
        assert normalizar_autores("Ana Pérez; Luis Gómez") == ["Ana Pérez", "Luis Gómez"]
        assert normalizar_autores("Ana Pérez, Luis Gómez, Marta Ruiz") == ["Ana Pérez", "Luis Gómez", "Marta Ruiz"]
        assert normalizar_autores("  ") == []


# ================================================================== DA-09, DA-10, BI-17: notas y títulos en Word/EPUB


class TestNotasYTitulos:
    def _comprobar_notas_word(self, d: Path, est: dict) -> None:
        todo = textos(d)
        assert not any("↩" in t for t in todo)
        for k in (1, 2, 3):
            cap = next(c for c in est["capitulos"] if c["titulo"] == f"Capítulo {k}")
            notas = [f for f in frases_cap(d, cap["indice"]) if f"nota al pie número {k}" in f["texto"]]
            assert notas and all(f["voz"] == "" for f in notas), k
        ultimo = frases_cap(d, est["capitulos"][-1]["indice"])
        assert sum(1 for f in ultimo if "nota al pie número" in f["texto"]) == 1  # antes estaban las 3 al final

    def test_da09_notas_de_word_en_su_capitulo_y_sin_leerse(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-D01-docx-titulos.docx")
        self._comprobar_notas_word(d, est)

    @hay_soffice
    def test_da09_bi17_doc_antiguo_notas_y_titulo_no_generico(self, tmp_path):
        origen = tmp_path / "el_coronel.doc"
        shutil.copy(QA / "qa-datos-D04-doc-antiguo.doc", origen)
        d, est = convertido(tmp_path, origen)
        self._comprobar_notas_word(d, est)
        assert est["titulo"] not in (None, "Word Document")

    def test_da10_nota_epub_en_xhtml_mal_formado_no_se_lee(self, tmp_path):
        d, est = convertido(tmp_path, QA / "qa-datos-E10-notas-xml-vs-html.epub")
        notas = [f for f in todas_las_frases(d, est) if "nota al pie que no se debe leer" in f["texto"]]
        assert len(notas) == 2 and all(f["voz"] == "" for f in notas)

    def test_bi17_titulo_generico_de_word_se_sustituye(self, tmp_path):
        import docx

        ruta = tmp_path / "el_coronel.docx"
        doc = docx.Document()
        doc.core_properties.title = "Word Document"
        doc.add_paragraph("Texto del libro. Otra frase.")
        doc.save(str(ruta))
        _d, est = convertido(tmp_path, ruta)
        assert est["titulo"] == "el coronel"
        doc.add_heading("El coronel no tiene quien le escriba", level=0)  # estilo "Title"
        doc.core_properties.title = "Microsoft Word - coronel.doc"
        doc.save(str(ruta))
        _d, est = convertido(tmp_path / "otra", ruta)
        assert est["titulo"] == "El coronel no tiene quien le escriba"

    def test_bi17_titulos_genericos(self):
        for generico in ("Word Document", "Documento de Microsoft Word", "Untitled", "Sin título", "Documento1", ""):
            assert titulo_util(generico) is None, generico
        assert titulo_util("Microsoft Word - informe.doc") is None
        assert titulo_util("  Cien años  de soledad ") == "Cien años de soledad"
        assert titulo_desde_nombre("el_viejo_y_el_mar") == "el viejo y el mar"


# ================================================================== DA-11, DA-12, DA-19, DA-20, DA-28: voz


def preparar_frases(rutas: Rutas, aid: str, frases: list[dict]) -> None:
    ruta = rutas.frases(aid, 0)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps({"capitulo": 0, "frases": frases}), encoding="utf-8")


FRASES = [
    {"id": "c000-s00000", "texto": "Uno.", "voz": "Uno.", "finParrafo": True, "esTitulo": False},
    {"id": "c000-s00001", "texto": "Dos.", "voz": "Dos.", "finParrafo": True, "esTitulo": False},
]


class TestVoz:
    @hay_ffmpeg
    def test_da11_capitulo_sin_texto_hablable_da_un_silencio_corto(self, tmp_path):
        rutas = Rutas(tmp_path)
        preparar_frases(rutas, "a1", [{"id": "c000-s00000", "texto": "* * *", "voz": "", "finParrafo": True}])
        motor = MotorFalso()
        duracion = asyncio.run(generar_capitulo(rutas, "a1", "edge.v", 0, motor, "v"))
        assert duracion == 1.0 and motor.llamadas == 0
        d = rutas.audio("a1", "edge.v")
        assert (d / "cap-000.m4a").stat().st_size > 0 and (d / "cap-000-2x.m4a").stat().st_size > 0
        t = json.loads((d / "cap-000.tiempos.json").read_text(encoding="utf-8"))
        assert t["duracion"] == 1.0 and t["frases"][0]["t0"] == t["frases"][0]["t1"] == 0
        assert audio.duracion(d / "cap-000.m4a") == pytest.approx(1.0, abs=0.05)

    def test_da12_voz_fuera_del_catalogo_es_error_definitivo_inmediato(self, tmp_path, monkeypatch):
        def no_llamar(*_a, **_k):
            raise AssertionError("no debe pedirse un motor para una voz inexistente")

        monkeypatch.setattr(tr, "motor_para", no_llamar)
        p = {"vozId": "edge.es-ES-NoExisteNeural", "capitulo": 0}
        repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload=p)])
        assert procesar(repo.tomar(["VOZ_CAPITULO"]), ManejadorVoz(Rutas(tmp_path)), repo, 3) == "ERROR"
        assert repo.trabajos[0]["intentos"] == 1
        assert repo.trabajos[0]["error"] == (
            "La voz «edge.es-ES-NoExisteNeural» no está disponible. Elige otra voz de la lista."
        )

    def test_da12_invalid_voice_del_servicio_no_se_reintenta(self, monkeypatch):
        import edge_tts

        llamadas = []

        def comunicar(texto, voz, **_k):
            llamadas.append(voz)
            raise ValueError(f"Invalid voice '{voz}'.")

        monkeypatch.setattr(edge_tts, "Communicate", comunicar)
        motor = modulo_motor.EdgeTts(reintentos=5, pausa_base=10)
        inicio = time.monotonic()
        with pytest.raises(ErrorDefinitivo, match="no está disponible"):
            asyncio.run(motor.sintetizar("Hola.", "es-ES-Inventada"))
        assert llamadas == ["es-ES-Inventada"] and time.monotonic() - inicio < 2

    def test_da19_dos_hilos_de_voz_comparten_el_motor_sin_errores_de_bucle(self, monkeypatch):
        import edge_tts

        class Comunicar:
            def __init__(self, texto, voz, **_k):
                self.texto = texto

            async def stream(self):
                await asyncio.sleep(0.01)
                yield {"type": "audio", "data": b"mp3"}
                yield {"type": "WordBoundary", "offset": 0, "duration": 10_000_000, "text": self.texto}

        monkeypatch.setattr(edge_tts, "Communicate", Comunicar)
        motor = modulo_motor.EdgeTts(concurrencia=1)
        errores: list[BaseException] = []

        async def varias(n):
            return await asyncio.gather(*(motor.sintetizar(f"f{k}", "v") for k in range(n)))

        def hilo():
            try:
                for _ in range(5):
                    assert len(asyncio.run(varias(4))) == 4
            except BaseException as e:
                errores.append(e)

        hilos = [threading.Thread(target=hilo) for _ in range(3)]
        [h.start() for h in hilos]
        [h.join(20) for h in hilos]
        assert errores == []

    @hay_ffmpeg
    def test_da20_un_fallo_de_ffmpeg_no_muestra_jerga(self, tmp_path):
        with pytest.raises(audio.ErrorAudio) as e:
            audio.decodificar_a_pcm(tmp_path / "no-existe.mp3")
        assert "ffmpeg" not in str(e.value) and "Detalle" not in str(e.value)
        assert e.value.detalle and e.value.detalle.startswith("ffmpeg:")

    def test_da20_el_servicio_caido_no_muestra_jerga(self, monkeypatch):
        import edge_tts

        def comunicar(*_a, **_k):
            raise ConnectionError("403 Forbidden wss://speech.platform.bing.com")

        monkeypatch.setattr(edge_tts, "Communicate", comunicar)
        with pytest.raises(ErrorReintentable) as e:
            asyncio.run(modulo_motor.EdgeTts(reintentos=2, pausa_base=0.01).sintetizar("Hola.", "v"))
        assert str(e.value) == "El servicio de voz no respondió tras varios intentos; se volverá a probar más tarde."
        assert "403" in (e.value.detalle or "")

    def test_da28_retirado_antes_de_empezar_no_genera_nada(self, tmp_path, monkeypatch):
        rutas = Rutas(tmp_path)
        preparar_frases(rutas, "a1", FRASES)
        motor = MotorFalso()
        monkeypatch.setattr(tr, "motor_para", lambda *_a: (motor, "v"))
        repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload={"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 0})])
        repo.retirados.add("a1")
        assert procesar(repo.tomar(["VOZ_CAPITULO"]), ManejadorVoz(rutas), repo, 3) == "ERROR"
        assert motor.llamadas == 0 and repo.audios == {}
        assert not (tmp_path / "audio").exists()
        assert repo.trabajos[0]["error"].startswith("El libro se retiró de la biblioteca")

    def test_da28_retirado_mientras_se_genera_borra_lo_escrito(self, tmp_path, monkeypatch):
        rutas = Rutas(tmp_path)
        preparar_frases(rutas, "a1", FRASES)
        sobrante = rutas.audio("a1", "edge.es-ES-AlvaroNeural") / "cap-000.123abc.tmp.m4a"
        sobrante.parent.mkdir(parents=True)
        sobrante.write_bytes(b"x")

        class MotorQueRetira(MotorFalso):
            async def sintetizar(self, texto, voz):
                shutil.rmtree(rutas.normalizados("a1"))  # biblioteca-service retira el libro
                self.llamadas += 1
                return modulo_motor.Sintesis(b"mp3", "mp3", [])

        motor = MotorQueRetira()
        monkeypatch.setattr(tr, "motor_para", lambda *_a: (motor, "v"))
        repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload={"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 0})])
        assert procesar(repo.tomar(["VOZ_CAPITULO"]), ManejadorVoz(rutas), repo, 3) == "ERROR"
        assert not (tmp_path / "audio" / "a1").exists()
        assert repo.audios[("a1", "edge.es-ES-AlvaroNeural", 0)]["estado"] == "GENERANDO"  # nunca LISTO
        assert repo.trabajos[0]["intentos"] == 1

    @hay_ffmpeg
    def test_da28_retirado_justo_al_terminar_borra_el_audio(self, tmp_path, monkeypatch):
        rutas = Rutas(tmp_path)
        preparar_frases(rutas, "a1", FRASES)
        motor = MotorFalso()
        monkeypatch.setattr(tr, "motor_para", lambda *_a: (motor, "v"))
        original = tr.generar_capitulo

        async def y_luego_retirar(*a, **k):
            k["seguir"] = None
            r = await original(*a, **k)
            repo.retirados.add("a1")  # la fila del archivo se borró mientras se ensamblaba
            return r

        monkeypatch.setattr(tr, "generar_capitulo", y_luego_retirar)
        repo = RepoFalso([trabajo(tipo="VOZ_CAPITULO", payload={"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 0})])
        assert procesar(repo.tomar(["VOZ_CAPITULO"]), ManejadorVoz(rutas), repo, 3) == "ERROR"
        assert not (tmp_path / "audio" / "a1").exists()
        assert repo.audios[("a1", "edge.es-ES-AlvaroNeural", 0)]["estado"] == "GENERANDO"

    def test_borrar_audio_capitulo_solo_toca_ese_capitulo(self, tmp_path):
        rutas = Rutas(tmp_path)
        d = rutas.audio("a1", "edge.v")
        d.mkdir(parents=True)
        for n in ("cap-000.m4a", "cap-000-2x.m4a", "cap-000.tiempos.json", "cap-0001.m4a", "cap-001.m4a"):
            (d / n).write_bytes(b"x")
        borrar_audio_capitulo(rutas, "a1", "edge.v", 0)
        assert sorted(p.name for p in d.iterdir()) == ["cap-0001.m4a", "cap-001.m4a"]
        borrar_audio_capitulo(rutas, "a2", "edge.v", 0)  # no existe: no falla


# ================================================================== DA-14: retirar mientras se convierte


class TestDA14RetirarDuranteLaConversion:
    def _preparar(self, tmp_path, txt_prueba) -> tuple[Rutas, RepoFalso]:
        rutas = Rutas(tmp_path)
        rutas.originales("a1").mkdir(parents=True)
        shutil.copy(txt_prueba, rutas.originales("a1") / "libro.txt")
        return rutas, RepoFalso([trabajo()])

    def test_original_borrado_durante_la_conversion_no_deja_huerfanos(self, tmp_path, txt_prueba, monkeypatch):
        rutas, repo = self._preparar(tmp_path, txt_prueba)
        extraer = modulo_convertir.extraer

        def extraer_y_retirar(ruta):
            libro = extraer(ruta)
            shutil.rmtree(ruta.parent)  # biblioteca-service borra el original
            return libro

        monkeypatch.setattr(modulo_convertir, "extraer", extraer_y_retirar)
        assert procesar(repo.tomar(["CONVERTIR"]), ManejadorConvertir(rutas, aislar=False), repo, 3) == "ERROR"
        assert not (tmp_path / "normalizados").exists() or not any((tmp_path / "normalizados").iterdir())
        assert repo.archivos["a1"]["estado"] == "PROCESANDO"  # nunca LISTO
        assert repo.trabajos[0]["error"].startswith("El libro se retiró")

    def test_fila_borrada_durante_la_conversion_borra_lo_escrito(self, tmp_path, txt_prueba, monkeypatch):
        rutas, repo = self._preparar(tmp_path, txt_prueba)
        extraer = modulo_convertir.extraer

        def extraer_y_borrar_fila(ruta):
            repo.retirados.add("a1")
            return extraer(ruta)

        monkeypatch.setattr(modulo_convertir, "extraer", extraer_y_borrar_fila)
        assert procesar(repo.tomar(["CONVERTIR"]), ManejadorConvertir(rutas, aislar=False), repo, 3) == "ERROR"
        assert not rutas.normalizados("a1").exists()

    def test_retirado_antes_de_empezar_no_convierte(self, tmp_path, txt_prueba):
        rutas, repo = self._preparar(tmp_path, txt_prueba)
        repo.retirados.add("a1")
        assert procesar(repo.tomar(["CONVERTIR"]), ManejadorConvertir(rutas, aislar=False), repo, 3) == "ERROR"
        assert not rutas.normalizados("a1").exists() and repo.archivos == {}

    def test_convertir_cancela_si_el_original_desaparece_al_publicar(self, tmp_path, txt_prueba):
        destino = tmp_path / "n"
        with pytest.raises(TrabajoCancelado):
            convertir(txt_prueba, destino, "x", seguir=lambda: False)
        assert not destino.exists() and not (tmp_path / "n.tmp").exists()
        llamadas = iter([True, False])  # desaparece justo después de publicar
        with pytest.raises(TrabajoCancelado):
            convertir(txt_prueba, destino, "x", seguir=lambda: next(llamadas))
        assert not destino.exists()


# ================================================================== DA-24, DA-25: lectura en voz


class TestDA24DA25Voz:
    @pytest.mark.parametrize(
        ("visual", "voz"),
        [
            ("Malcolm X habló.", "Malcolm X habló."),
            ("La Generación X creció.", "La Generación X creció."),
            ("El Grupo V ganó.", "El Grupo V ganó."),
            ("Carlos V reinó.", "Carlos quinto reinó."),
            ("Alfonso X el Sabio.", "Alfonso décimo el Sabio."),
            ("Felipe II y Luis XIV.", "Felipe segundo y Luis catorce."),
            ("Le hicieron rayos X.", "Le hicieron rayos X."),
        ],
    )
    def test_da24_romanos_sueltos(self, visual, voz):
        assert preparar_voz(visual) == voz

    @pytest.mark.parametrize(
        ("visual", "voz"),
        [
            ("El área es de 50 m² y 3 km/h.", "El área es de 50 metros cuadrados y 3 km/h."),
            ("Un depósito de 2 m³.", "Un depósito de 2 metros cúbicos."),
            ("Hay 10³ células.", "Hay 10 elevado a 3 células."),
            ("AT&T y H&M cotizan.", "AT y T y H y M cotizan."),
            ("Lo dice el libro¹.", "Lo dice el libro."),
        ],
    )
    def test_da25_superindices_y_ampersand(self, visual, voz):
        assert preparar_voz(visual) == voz

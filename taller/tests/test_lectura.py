"""Texto que se manda al motor de voz (0.4.0, contratos C8): casos A6, B1–B7, B13, B15, B17 de CASOS.md."""

import pytest

from app.conversion.numeros import femenino, numero_a_palabras, ordinal
from app.voz.alineacion import alinear_palabras
from app.voz.lectura import idioma_de_frase, preparar_lectura, voz_multilingue


def lee(voz: str, **k) -> str:
    return preparar_lectura(voz, **k).texto


# ------------------------------------------------------------------ números (B1, B2, B3, B5)


def test_numeros_grandes_y_genero():
    assert numero_a_palabras(1_250) == "mil doscientos cincuenta"
    assert numero_a_palabras(12_345_678) == "doce millones trescientos cuarenta y cinco mil seiscientos setenta y ocho"
    assert numero_a_palabras(1_000_000) == "un millón"
    assert numero_a_palabras(21_000_000) == "veintiún millones"
    assert femenino("doscientos uno") == "doscientas una"
    assert ordinal(1) == "primero" and ordinal(1, apocope=True) == "primer" and ordinal(2, "f") == "segunda"
    assert ordinal(21) == "vigésimo primero" and ordinal(3, apocope=True) == "tercer"


@pytest.mark.parametrize(
    ("voz", "esperado"),
    [
        ("En 1.250 casas.", "En mil doscientas cincuenta casas."),
        ("Hace 1.250 días.", "Hace mil doscientos cincuenta días."),
        ("Son 3,5 personas.", "Son tres coma cinco personas."),
        ("Mide 1/2 metro.", "Mide un medio metro."),
        ("La 2.ª vez.", "La segunda vez."),
        ("El 1º día.", "El primer día."),
        ("El 1.º de mayo.", "El primero de mayo."),
        ("El 3.er piso.", "El tercer piso."),
        (
            "Hay 12.345.678 almas.",
            "Hay doce millones trescientas cuarenta y cinco mil seiscientas setenta y ocho almas.",
        ),
        ("Pesa 0,05 kilos.", "Pesa cero coma cero cinco kilos."),
        ("El 15 % de todo.", "El quince por ciento de todo."),
    ],
)
def test_numeros_con_formato_espanol_iguales_para_todas_las_voces(voz, esperado):
    assert lee(voz) == esperado


@pytest.mark.parametrize(
    ("voz", "esperado"),
    [
        ("Cuesta $30.", "Cuesta treinta dólares."),
        ("Cuesta 30 €.", "Cuesta treinta euros."),
        ("Cuesta 30 USD.", "Cuesta treinta dólares."),
        ("Cuesta 1 $.", "Cuesta un dólar."),
        ("Cuesta 25 MXN.", "Cuesta veinticinco pesos mexicanos."),
        ("Vale $1.250,50 hoy.", "Vale mil doscientos cincuenta dólares con cincuenta centavos hoy."),
        ("Vale £1.", "Vale una libra."),
        ("Vale 21 €.", "Vale veintiún euros."),
        ("Ganó 2.000.000 $.", "Ganó dos millones de dólares."),
    ],
)
def test_monedas(voz, esperado):
    assert lee(voz) == esperado


@pytest.mark.parametrize(
    ("voz", "esperado"),
    [
        ("A las 22:00 cenamos.", "A las veintidós horas cenamos."),
        ("A las 7:30 sale.", "A las siete y media sale."),
        ("A las 10.30 h abre.", "A las diez y media abre."),
        ("A la 1:15 llega.", "A la una y cuarto llega."),
        ("A las 7:00.", "A las siete en punto."),
        ("A las 21:05.", "A las veintiuna y cinco."),
    ],
)
def test_horas(voz, esperado):
    assert lee(voz) == esperado


def test_por_2x1_4x4_x2():
    assert lee("Oferta 2x1 y un 4x4.") == "Oferta dos por uno y un cuatro por cuatro."
    assert lee("Multiplica x2.") == "Multiplica por dos."
    assert lee("Pantalla 1920×1080.") == "Pantalla mil novecientos veinte por mil ochenta."


def test_enteros_sueltos_y_anios_quedan_para_la_voz():
    # sin separador, edge los lee bien en todas las voces y concuerda el género («21 páginas» → «veintiuna»)
    assert lee("En 1492 llegaron 21 páginas.") == "En 1492 llegaron 21 páginas."
    assert lee("Versión 2.0 del 12/10.") == "Versión 2.0 del 12/10."


def test_libro_en_ingles_no_aplica_formato_espanol():
    assert lee("It costs 1,250 dollars.", idioma_libro="en") == "It costs 1,250 dollars."


# ------------------------------------------------------------------ abreviaturas y romanos (B4, B6)


@pytest.mark.parametrize(
    ("voz", "esperado"),
    [
        ("Lea el art. 14 hoy.", "Lea el artículo 14 hoy."),
        ("Ver arts. 3 y 4.", "Ver artículos 3 y 4."),
        ("Trabaja en Pérez S.A. desde 1990.", "Trabaja en Pérez sociedad anónima desde 1990."),
        ("Vive en la C/ Mayor.", "Vive en la calle Mayor."),
        ("Era el s. XIX.", "Era el siglo diecinueve."),
        ("Ver págs. 10 y ss.", "Ver págs. 10 y siguientes."),
        ("Firmado: Fdo. Ana.", "Firmado: firmado Ana."),
        ("Se fundó en Pérez S.A.", "Se fundó en Pérez sociedad anónima."),
    ],
)
def test_abreviaturas_nuevas(voz, esperado):
    assert lee(voz) == esperado


# ------------------------------------------------------------------ URL, correo, ruta, emojis, invisibles (A6, B7, B15)


def test_url_correo_y_ruta_breves():
    assert lee("Visita https://www.ejemplo.com/ruta?x=1 hoy.") == "Visita enlace a ejemplo punto com hoy."
    assert lee("Ver www.biblioteca.es.") == "Ver enlace a biblioteca punto es."
    assert lee("Escribe a ana.perez@correo.es ya.") == "Escribe a ana punto perez arroba correo punto es ya."
    assert lee("Abre /usr/bin/python3 y C:\\Users\\ana\\x.txt ya.") == (
        "Abre una ruta de archivo y una ruta de archivo ya."
    )
    assert lee("Y/o, 1/2 y 24/7.") == "Y/o, un medio y 24/7."


def test_emojis_fuera_y_grados_se_quedan():
    assert lee("Estaba feliz 😀 y triste 😢; luego \u2764\ufe0f y 👍🏽.") == "Estaba feliz y triste; luego y."
    assert lee("Hace \u22125 °C.") == "Hace \u22125 °C."


def test_espacios_invisibles():
    assert lee("Texto\u200bcon\u200bespacios") == "Texto con espacios"
    assert lee("pala\u00adbra y\u2060junta") == "palabra yjunta"


# ------------------------------------------------------------------ alfabetos e idiomas (A3, A4, B13)


def test_alfabetos_no_latinos_van_a_la_voz_multilingue():
    for texto in ("γνῶθι σεαυτόν", "Москва — столица России.", "日本語の文章です。", "مرحبا بالعالم"):
        lectura = preparar_lectura(texto)
        assert lectura.idioma == "otro" and lectura.hablable
    mezcla = preparar_lectura("Dijo: γνῶθι σεαυτόν, y se fue.")
    assert mezcla.idioma == "otro"


def test_simbolos_sueltos_no_tumban_nada():
    assert not preparar_lectura("ª").hablable
    assert lee("Ⅳ") == "cuatro" and preparar_lectura("Ⅳ").hablable
    assert lee("Paso \u2460.") == "Paso uno."
    assert lee("Una letra ω suelta.") == "Una letra suelta."  # 1 o 2 letras sueltas: fuera
    tatweel = preparar_lectura("ـــ")
    assert tatweel.idioma == "otro" or not tatweel.hablable


@pytest.mark.parametrize(
    ("texto", "idioma"),
    [
        ("The quick brown fox jumps over the lazy dog.", "en"),
        ("Le petit prince est arrivé.", "fr"),
        ("Der Himmel ist blau und die Sonne scheint.", "de"),
        ("Alea iacta est, ad hoc.", "la"),
        ("Era un hombre de mundo y de palabra.", None),
        ("No, no, no.", None),
        ("Le dije que no.", None),
        ("Mi best seller favorito.", None),
        ("Dame lo que tienes, mi amor.", None),
    ],
)
def test_frase_en_otro_idioma(texto, idioma):
    assert idioma_de_frase(texto) == idioma
    assert preparar_lectura(texto).idioma == idioma


def test_otro_idioma_solo_en_libros_en_espanol():
    assert preparar_lectura("The quick brown fox jumps over the lazy dog.", idioma_libro="en").idioma is None


def test_voz_multilingue_por_genero_e_idioma():
    assert voz_multilingue("en", "M") == "en-US-AndrewMultilingualNeural"
    assert voz_multilingue("fr", "F") == "fr-FR-VivienneMultilingualNeural"
    assert voz_multilingue("otro", "F") == "en-US-AvaMultilingualNeural"


# ------------------------------------------------------------------ diccionario (B17)


def test_diccionario_de_pronunciacion():
    r = preparar_lectura("Hermione miró a Hermione.", pronunciacion=[("Hermione", "Jermáyoni")])
    assert r.texto == "Jermáyoni miró a Jermáyoni."
    assert lee("hermione", pronunciacion=[("Hermione", "Jermáyoni")]) == "Jermáyoni"
    assert lee("Hermioneta", pronunciacion=[("Hermione", "Jermáyoni")]) == "Hermioneta"  # solo palabra entera


# ------------------------------------------------------------------ resaltado: el mapa lleva al texto original (B12)


def _resaltado(visual: str, voz: str, **k) -> list[str]:
    lectura = preparar_lectura(voz, **k)
    habladas = []
    t = 0.0
    for palabra in lectura.texto.replace(".", " ").replace(",", " ").split():
        habladas.append((palabra, t, t + 0.2))
        t += 0.25
    p = alinear_palabras(visual, voz, habladas, texto_motor=lectura.texto, mapa_motor=lectura.mapa)
    return [visual[a:b] for a, b, *_ in p]


def test_el_resaltado_sigue_al_texto_original():
    assert _resaltado("En 1.250 casas.", "En 1.250 casas.") == ["En", "1.250", "casas"]
    assert _resaltado("A las 22:00 y $30.", "A las 22:00 y $30.") == ["A", "las", "22:00", "y", "30"]
    assert _resaltado("Feliz 😀 hoy.", "Feliz 😀 hoy.") == ["Feliz", "hoy"]
    assert _resaltado("Ver https://ejemplo.com ya.", "Ver https://ejemplo.com ya.")[0] == "Ver"
    assert _resaltado("Ver https://ejemplo.com ya.", "Ver https://ejemplo.com ya.")[-1] == "ya"
    vistos = _resaltado("Hermione vino.", "Hermione vino.", pronunciacion=[("Hermione", "Jermáyoni")])
    assert vistos == ["Hermione", "vino"]


def test_el_resaltado_con_palabras_no_alfanumericas_no_se_pierde():
    # V-10: tokens de edge sin letras («#», «=») ya no cuentan para el umbral del 70 %
    visual = "Uno dos tres cuatro."
    habladas = [("Uno", 0, 1), ("#", 1, 1.1), ("=", 1.1, 1.2), ("<", 1.2, 1.3), ("dos", 1.3, 2), ("tres", 2, 3)]
    assert len(alinear_palabras(visual, visual, habladas)) == 3

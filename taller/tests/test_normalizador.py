import pytest

from app.conversion.normalizador import normalizar_visual, preparar_voz, unir_dos, unir_lineas, zwsp_separa
from app.conversion.numeros import numero_a_palabras, romano_a_entero


def test_ligaduras_y_espacios_duros():
    assert normalizar_visual("la ﬁla ﬂota en la oﬃcina ﬀ ﬄ") == "la fila flota en la officina ff ffl"
    assert normalizar_visual("a b c") == "a b c"
    assert normalizar_visual("pa­labra") == "palabra"  # guion blando: fuera
    # (0.4.0, V-16) espacio de ancho cero entre letras = separador de palabras; en otro sitio se quita
    assert normalizar_visual("Texto​con​espacios") == "Texto con espacios"
    assert normalizar_visual("fin.​") == "fin."
    # (V-NUEVO-8) uno suelto en una frase con espacios es un punto de corte DENTRO de la palabra: no la parte
    assert normalizar_visual("Pala\u200bbras con espacio de ancho cero.") == "Palabras con espacio de ancho cero."
    # en japonés solo marca dónde se puede cortar
    assert normalizar_visual("東京​は​大きい") == "東京は大きい"
    assert normalizar_visual("árbol") == "árbol"  # NFC


# (R2-1) se decide por tramo y no por párrafo: una racha de palabras unidas solo por ZWSP se separa aunque el resto de
# la frase tenga espacios normales o duros; un ZWSP suelto dentro de una palabra se quita
CASOS_ZWSP_R2 = [
    (
        "Texto\u200bcon\u200bespacios\u200binvisibles y\u00a0espacios\u00a0duros\u00a0aquí.",
        "Texto con espacios invisibles y espacios duros aquí.",
    ),
    ("Uno\u200bdos\u200btres cuatro\u00a0cinco seis.", "Uno dos tres cuatro cinco seis."),
    (
        "Texto\u200bcon\u200bespacios\u200binvisibles y espacios duros aquí.",
        "Texto con espacios invisibles y espacios duros aquí.",
    ),
    ("Una pala\u200bbra y otra\u200b\u200bmás\u200bjuntas.", "Una palabra y otra más juntas."),
    ("Al principio, uno\u200by\u200bdos; al final pala\u200bbra.", "Al principio, uno y dos; al final palabra."),
    ("Hola\u200bmundo", "Holamundo"),  # suelto: punto de corte dentro de una palabra
    ("\u200bfin.\u200b ", "fin. "),
    ("Dijo «uno\u200bdos\u200btres» y\u00a0se fue.", "Dijo «uno dos tres» y se fue."),
    ("東京\u200bは\u200b大きい y\u200ba\u200bb", "東京は大きい y a b"),
]


@pytest.mark.parametrize(("texto", "visto"), CASOS_ZWSP_R2)
def test_zwsp_por_tramo(texto, visto):
    assert normalizar_visual(texto) == visto


def test_zwsp_separa_por_posicion():
    t = "Pala\u200bbras y uno\u200bdos\u200btres."
    assert zwsp_separa(t)
    assert not zwsp_separa(t, t.index("\u200b"))  # el de «Pala<ZWSP>bras» no separa
    assert zwsp_separa(t, t.index("\u200b", t.index("uno")))
    assert not zwsp_separa("Pala\u200bbras con espacio.")


def test_deshifenacion():
    assert unir_dos("con-", "tinuar") == "continuar"
    assert unir_dos("franco-", "Alemán") == "franco- Alemán"  # mayúscula: no se une
    assert unir_dos("año", "nuevo") == "año nuevo"
    assert unir_dos("pa­", "labra") == "palabra"
    assert unir_lineas(["Los libros an-", "tiguos se guar-", "dan bien."]) == "Los libros antiguos se guardan bien."


def test_numeros():
    assert romano_a_entero("IV") == 4
    assert romano_a_entero("MCMXCIX") == 1999
    assert romano_a_entero("IIII") is None
    assert numero_a_palabras(4) == "cuatro"
    assert numero_a_palabras(21) == "veintiuno"
    assert numero_a_palabras(99) == "noventa y nueve"
    assert numero_a_palabras(100) == "cien"
    assert numero_a_palabras(115) == "ciento quince"
    assert numero_a_palabras(1999) == "mil novecientos noventa y nueve"
    assert numero_a_palabras(21000) == "veintiún mil"


def test_voz_titulos_y_abreviaturas():
    assert preparar_voz("Capítulo IV", es_titulo=True) == "Capítulo cuatro"
    assert preparar_voz("CAPÍTULO XII. El regreso", es_titulo=True) == "CAPÍTULO doce. El regreso"
    assert preparar_voz("IX", es_titulo=True) == "nueve"
    assert preparar_voz("El Sr. Pérez y la Dra. Ruiz.") == "El señor Pérez y la doctora Ruiz."
    assert preparar_voz("Vive en EE. UU. desde el siglo XX.") == "Vive en Estados Unidos desde el siglo veinte."
    assert preparar_voz("Ver pág. 5 y núm. 3, etc.") == "Ver página 5 y número 3, etcétera."
    assert preparar_voz("Felipe II nació el 21/05/1527.") == "Felipe segundo nació el 21 de mayo de 1527."


def test_voz_quita_notas_al_pie():
    assert preparar_voz("Como dijo Borges[12], el libro.") == "Como dijo Borges, el libro."
    assert preparar_voz("Una nota¹ aquí.") == "Una nota aquí."
    # (V-NUEVO-6) tras una letra suelta es una potencia
    assert preparar_voz("Comió x² de pan y a³.") == "Comió x al cuadrado de pan y a al cubo."
    assert preparar_voz("Una palabra² con nota.") == "Una palabra con nota."
    texto = "Leyó el libro1."
    assert preparar_voz(texto, excluidos={13}) == "Leyó el libro."


def test_voz_no_toca_palabras_normales():
    assert preparar_voz("Yo vi a Carlos y a Victoria.") == "Yo vi a Carlos y a Victoria."
    assert preparar_voz("La Vida es sueño.") == "La Vida es sueño."

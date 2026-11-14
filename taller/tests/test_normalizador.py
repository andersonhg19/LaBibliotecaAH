from app.conversion.normalizador import normalizar_visual, preparar_voz, unir_dos, unir_lineas
from app.conversion.numeros import numero_a_palabras, romano_a_entero


def test_ligaduras_y_espacios_duros():
    assert normalizar_visual("la ﬁla ﬂota en la oﬃcina ﬀ ﬄ") == "la fila flota en la officina ff ffl"
    assert normalizar_visual("a b c") == "a b c"
    assert normalizar_visual("pa­labra") == "palabra"  # guion blando: fuera
    # (0.4.0, V-16) espacio de ancho cero entre letras = separador de palabras; en otro sitio se quita
    assert normalizar_visual("Texto​con​espacios") == "Texto con espacios"
    assert normalizar_visual("fin.​") == "fin."
    # (V-NUEVO-8) uno suelto en una frase con espacios es un punto de corte DENTRO de la palabra: no la parte
    assert normalizar_visual("Pala​bras con espacio de ancho cero.") == "Palabras con espacio de ancho cero."
    assert normalizar_visual("東京​は​大きい") == "東京は大きい"  # en japonés solo marca dónde se puede cortar
    assert normalizar_visual("árbol") == "árbol"  # NFC


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

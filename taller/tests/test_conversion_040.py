"""Conversión 0.4.0 en la capa de voz de las frases: poesía (B14), frases larguísimas (B16), espacios invisibles (B15),
tablas (C15) y «&» dentro de una URL."""

from lxml import etree

from app.conversion.frases import envolver_capitulo
from app.conversion.normalizador import preparar_voz
from app.conversion.segmentador import MAX_FRASE, segmentar


def _frases(html: str):
    return envolver_capitulo(etree.fromstring(f"<body>{html}</body>"), 0)


def test_poesia_pausa_por_verso():
    f = _frases("<p>Caminante, no hay camino<br/>se hace camino al andar<br/>golpe a golpe, verso a verso.</p>")
    assert len(f) == 1
    assert f[0].texto == "Caminante, no hay camino se hace camino al andar golpe a golpe, verso a verso."
    assert f[0].voz == "Caminante, no hay camino, se hace camino al andar, golpe a golpe, verso a verso."


def test_un_solo_br_no_es_poesia():
    f = _frases("<p>Calle Mayor 3<br/>Madrid</p>")
    assert f[0].voz == "Calle Mayor 3 Madrid"


def test_tablas_se_ven_pero_no_se_leen():
    f = _frases(
        "<p>Antes.</p><table><tr><th>Día</th><th>Pleamar</th></tr><tr><td>Lunes</td><td>06:12</td></tr></table>"
    )
    assert [x.texto for x in f] == ["Antes.", "Día", "Pleamar", "Lunes", "06:12"]
    assert [x.voz for x in f] == ["Antes.", "", "", "", ""]


def test_espacio_de_ancho_cero_separa_palabras():
    from app.conversion.html_util import limpiar_cuerpo

    cuerpo = limpiar_cuerpo(etree.fromstring("<body><p>Texto\u200bcon\u200bespacios.</p></body>"))
    f = envolver_capitulo(cuerpo, 0)
    assert f[0].texto == "Texto con espacios." and f[0].voz == "Texto con espacios."


def test_frase_larguisima_no_se_parte_a_mitad_de_sintagma():
    trozo = "el hombre caminó por el sendero hacia la casa del faro "
    texto = (trozo * 30).strip()
    rangos = segmentar(texto)
    assert len(rangos) > 1 and all(b - a <= MAX_FRASE for a, b in rangos)
    finales = [texto[a:b].split()[-1] for a, b in rangos[:-1]]
    assert not set(finales) & {"el", "la", "por", "hacia", "del"}


def test_frase_larga_corta_antes_de_una_conjuncion():
    texto = ("palabra " * 40) + "y " + ("otra " * 100)  # la «y» cae dentro de la ventana de corte
    _a, b = segmentar(texto.strip())[0]
    assert texto.strip()[b:].lstrip().startswith("y ")


def test_ampersand_dentro_de_url_no_se_cambia():
    assert preparar_voz("AT&T y https://x.com/?a=1&b=2") == "AT y T y https://x.com/?a=1&b=2"

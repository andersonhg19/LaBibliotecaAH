from lxml import etree

from app.conversion.frases import envolver_capitulo
from app.conversion.html_util import limpiar_cuerpo


def preparar(html: str):
    src = etree.fromstring(f'<body xmlns="http://www.w3.org/1999/xhtml">{html}</body>')
    return limpiar_cuerpo(src)


def spans(body):
    return [s for s in body.iter("span") if s.get("class") == "bah-f"]


def test_cursiva_que_cruza_frases_se_divide_sin_romper():
    body = preparar('<p>Era de noche. <em id="x">La lluvia caía. Nadie</em> salió.</p>')
    fr = envolver_capitulo(body, 2)
    assert [f.texto for f in fr] == ["Era de noche.", "La lluvia caía.", "Nadie salió."]
    assert [f.id for f in fr] == ["c002-s00000", "c002-s00001", "c002-s00002"]
    ss = spans(body)
    assert ["".join(s.itertext()) for s in ss] == [f.texto for f in fr]
    # la cursiva se conserva en ambos trozos; el id solo en el primero
    ems = list(body.iter("em"))
    assert ["".join(e.itertext()) for e in ems] == ["La lluvia caía.", "Nadie"]
    assert ems[0].get("id") == "x" and ems[1].get("id") is None
    assert ems[0].getparent() is ss[1] and ems[1].getparent() is ss[2]


def test_em_dentro_de_frase_se_conserva_entera():
    body = preparar("<p>Una <strong>palabra</strong> fuerte.</p>")
    envolver_capitulo(body, 0)
    s = spans(body)[0]
    assert (
        etree.tostring(s, encoding="unicode")
        == '<span class="bah-f" id="c000-s00000">Una <strong>palabra</strong> fuerte.</span>'
    )


def test_texto_suelto_y_br_y_notas():
    body = preparar("<div>Suelto. <b>Más</b><p>Dentro.</p></div><p>Verso uno<br/>verso dos<sup>4</sup>.</p>")
    fr = envolver_capitulo(body, 1)
    assert [f.texto for f in fr] == ["Suelto.", "Más", "Dentro.", "Verso uno verso dos4."]
    assert fr[-1].voz == "Verso uno verso dos."
    assert fr[-1].fin_parrafo and not fr[0].fin_parrafo


def test_titulos_y_vacios():
    body = preparar("<h1>Capítulo IV</h1><p>* * *</p><p>   </p>")
    fr = envolver_capitulo(body, 0)
    assert fr[0].es_titulo and fr[0].voz == "Capítulo cuatro"
    assert fr[1].texto == "* * *" and fr[1].voz == ""  # nada que leer
    assert len(fr) == 2


def test_lista_y_tabla():
    body = preparar("<ul><li>Uno.</li><li><p>Dos.</p></li></ul><table><tr><td>Celda.</td></tr></table>")
    fr = envolver_capitulo(body, 0)
    assert [f.texto for f in fr] == ["Uno.", "Dos.", "Celda."]

from app.conversion.segmentador import MAX_FRASE, segmentar


def frases(t):
    return [t[a:b] for a, b in segmentar(t)]


def test_basico():
    assert frases("Hola. Adiós.") == ["Hola.", "Adiós."]
    assert frases("  Uno.   Dos!  ¿Tres?  ") == ["Uno.", "Dos!", "¿Tres?"]


def test_abreviaturas_no_cortan():
    assert frases("El Sr. García llegó. La Dra. Ruiz no.") == ["El Sr. García llegó.", "La Dra. Ruiz no."]
    assert frases("Vea la pág. 5 del cap. 3. Luego siga.") == ["Vea la pág. 5 del cap. 3.", "Luego siga."]
    assert frases("Vive en EE. UU. desde ayer. Bien.") == ["Vive en EE. UU. desde ayer.", "Bien."]
    assert frases("Lo escribió J. R. R. Tolkien. Fin.") == ["Lo escribió J. R. R. Tolkien.", "Fin."]


def test_etc_si_corta_con_mayuscula():
    assert frases("Pan, leche, etc. Luego volví.") == ["Pan, leche, etc.", "Luego volví."]


def test_dialogo_y_puntos_suspensivos():
    assert frases("¿Vienes? —preguntó ella. —Sí.") == ["¿Vienes? —preguntó ella.", "—Sí."]
    assert frases("Y entonces... nada. Silencio.") == ["Y entonces... nada.", "Silencio."]
    assert frases("«Hola.» Dijo él.") == ["«Hola.»", "Dijo él."]


def test_frase_muy_larga_se_parte():
    t = ("palabra, " * 120).strip()
    partes = frases(t)
    assert len(partes) > 1
    assert all(len(p) <= MAX_FRASE for p in partes)
    assert " ".join(partes) == t


def test_offsets_exactos():
    t = "Uno dos. Tres cuatro? Cinco"
    for a, b in segmentar(t):
        assert t[a:b].strip() == t[a:b]

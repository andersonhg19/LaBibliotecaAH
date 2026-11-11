from __future__ import annotations

from app.tipografia import Preparada, marcar_enfasis, preparar, reponer_enfasis, restaurar, tiene_letras


class TestPreparar:
    def test_frase_normal_no_cambia(self) -> None:
        assert preparar("He said hi.") == Preparada("He said hi.")

    def test_raya_de_dialogo_se_aparta(self) -> None:
        assert preparar("—¿Quién es?") == Preparada("¿Quién es?", prefijo="—")
        assert preparar("– Hola.") == Preparada("Hola.", prefijo="– ")
        assert preparar("- Hi.") == Preparada("Hi.", prefijo="- ")

    def test_raya_sola_no_se_aparta(self) -> None:
        assert preparar("—").nucleo == "—"

    def test_cursiva_que_envuelve_la_frase(self) -> None:
        assert preparar("*The house was empty.*") == Preparada("The house was empty.", prefijo="*", sufijo="*")
        assert preparar("_The house was empty_.") == Preparada("The house was empty", prefijo="_", sufijo="_.")

    def test_cursiva_interior_se_deja(self) -> None:
        assert preparar("It was *never* about money.").nucleo == "It was *never* about money."

    def test_comillas_curvas_se_enderezan_y_se_recuerdan(self) -> None:
        p = preparar("“You shouldn’t,” he said.")
        assert p.nucleo == '"You shouldn\'t," he said.'
        assert p.comillas == "curvas"
        assert p.simples_curvas

    def test_comillas_angulares(self) -> None:
        p = preparar("«Where?» he asked.")
        assert p.nucleo == '"Where?" he asked.'
        assert p.comillas == "angulares"


class TestRestaurar:
    def test_raya_y_cursiva_vuelven(self) -> None:
        assert restaurar(preparar("—*Who is it?*"), "¿Quién es?", "es") == "—*¿Quién es?*"
        assert restaurar(preparar("_The house was empty_."), "La casa estaba vacía", "es") == "_La casa estaba vacía_."

    def test_coma_fuera_de_las_comillas_en_espanol(self) -> None:
        assert restaurar(Preparada("x"), '"No deberías," dijo.', "es") == '"No deberías", dijo.'
        assert restaurar(Preparada("x"), '"Shouldn\'t," he said.', "en") == '"Shouldn\'t," he said.'
        assert restaurar(Preparada("x"), '"Fin," Dijo.', "es") == '"Fin," Dijo.'

    def test_comillas_curvas_vuelven_alternadas(self) -> None:
        p = preparar("“I’m not asking,” she said. “Listen.”")
        assert restaurar(p, '"No te pido," susurró. "Escucha."', "es") == "“No te pido”, susurró. “Escucha.”"

    def test_comillas_angulares_vuelven(self) -> None:
        assert restaurar(preparar("«Where?» he asked."), '"¿Dónde?" preguntó.', "es") == "«¿Dónde?» preguntó."

    def test_apostrofos_y_simples_curvas(self) -> None:
        p = preparar("‘I don’t know,’ she said.")
        assert restaurar(p, "'I don't know,' she said.", "en") == "‘I don’t know,’ she said."

    def test_tiene_letras(self) -> None:
        assert tiene_letras("ñ")
        assert not tiene_letras("* * * 1. —")


class TestCursivasInteriores:
    def test_preparar_las_quita_para_el_modelo_y_recuerda_la_marca(self) -> None:
        p = preparar("It was *never* about _money_.")
        assert p.nucleo == "It was *never* about _money_."
        assert p.para_modelo == "It was never about money."
        assert p.enfasis == ("*", "_")
        assert marcar_enfasis(p) == "It was «never» about «money»."

    def test_sin_cursivas_el_modelo_recibe_el_nucleo(self) -> None:
        p = preparar("snake_case and 2*3*4 stay.")
        assert p.enfasis == ()
        assert p.para_modelo == "snake_case and 2*3*4 stay."

    def test_se_reponen_en_la_traduccion_fluida_si_el_trozo_aparece_una_vez(self) -> None:
        p = preparar("It was *never* about money.")
        assert reponer_enfasis(p, "Nunca fue por dinero.", "Era «nunca» por dinero.") == "*Nunca* fue por dinero."

    def test_si_el_trozo_no_esta_en_la_fluida_se_usa_la_marcada(self) -> None:
        p = preparar("It was *never* about money.")
        assert reponer_enfasis(p, "Jamás fue por dinero.", "Era «nunca» por dinero.") == "Era *nunca* por dinero."

    def test_comillas_rectas_en_lugar_de_angulares_valen(self) -> None:
        p = preparar("It was a *very* bad idea.")
        assert reponer_enfasis(p, "Era una muy mala idea.", 'Era una "muy" mala idea.') == "Era una *muy* mala idea."

    def test_si_se_pierde_la_marca_none(self) -> None:
        p = preparar("It was *never* about money.")
        assert reponer_enfasis(p, "Nunca fue por dinero.", "Nunca fue por dinero.") is None

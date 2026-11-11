from __future__ import annotations

from collections.abc import Sequence

from app.nombres import MARCADORES
from app.traductor import Traductor
from tests.conftest import MotorFalso


def traductor(motor: MotorFalso | None = None, proteger: bool = True) -> Traductor:
    return Traductor(motor or MotorFalso(), ("en", "es", "fr"), proteger_nombres=proteger)


class TestMontaje:
    def test_solo_conoce_los_idiomas_de_sus_modelos(self) -> None:
        t = traductor()
        assert t.idiomas == ("en", "es")
        assert t.destinos("en") == ["es"]

    def test_respeta_saltos_sangrias_y_espacios(self) -> None:
        texto = "  Hello.  She left.\n\n\tThe rain had not stopped.\n"
        assert traductor().traducir([texto], ["en"], "es") == [
            "  Hola.  Ella se fue.\n\n\tLa lluvia no había parado.\n"
        ]

    def test_frases_repetidas_van_una_sola_vez_al_modelo(self) -> None:
        motor = MotorFalso()
        salida = traductor(motor).traducir(["Hello. Hello.", "Hello.", "She left."], ["en"] * 3, "es")
        assert salida == ["Hola. Hola.", "Hola.", "Ella se fue."]
        assert motor.llamadas == [(["Hello.", "She left."], "en", "es")]

    def test_lo_que_no_tiene_letras_no_va_al_modelo(self) -> None:
        motor = MotorFalso()
        assert traductor(motor).traducir(["* * *", "1.", "—"], ["en"] * 3, "es") == ["* * *", "1.", "—"]
        assert motor.llamadas == []

    def test_origenes_distintos_en_un_mismo_lote(self) -> None:
        motor = MotorFalso()
        salida = traductor(motor).traducir(["Hello.", "Hola.", "La casa estaba vacía."], ["en", "es", "es"], "en")
        assert salida == ["Hello.", "Hello.", "The house was empty."]
        assert motor.llamadas == [(["Hola.", "La casa estaba vacía."], "es", "en")]

    def test_tipografia_alrededor(self) -> None:
        salida = traductor().traducir(
            ["—*The house was empty.*", "“You should not have come here,” he said."], ["en", "en"], "es"
        )
        assert salida == ["—*La casa estaba vacía.*", "“No deberías haber venido aquí”, dijo."]


class TestNombresPropios:
    def test_segunda_pasada_con_marcador_conserva_el_nombre(self) -> None:
        motor = MotorFalso()
        salida = traductor(motor).traducir(["The fog rolled in over Saltmarsh Point."], ["en"], "es")
        assert salida == ["La niebla llegó sobre Saltmarsh Point."]
        assert motor.llamadas[-1] == ([f"The fog rolled in over {MARCADORES[0]}."], "en", "es")

    def test_un_nombre_visto_en_el_lote_se_protege_tambien_al_comienzo(self) -> None:
        class Hispanizador(MotorFalso):
            def traducir(self, frases: Sequence[str], origen: str, destino: str) -> list[str]:
                self.llamadas.append((list(frases), origen, destino))
                return [f.replace("Thomas", "Tomás") for f in frases]

        motor = Hispanizador()
        salida = traductor(motor).traducir(["Then Thomas left.", "Thomas smiled."], ["en", "en"], "es")
        assert salida == ["Then Thomas left.", "Thomas smiled."]
        assert motor.llamadas[-1] == ([f"Then {MARCADORES[0]} left.", f"{MARCADORES[0]} smiled."], "en", "es")

    def test_si_el_nombre_ya_salio_bien_no_hay_segunda_pasada(self) -> None:
        motor = MotorFalso()
        assert traductor(motor).traducir(["Mr. Hale opened the door."], ["en"], "es") == [
            "El Sr. Hale abrió la puerta."
        ]
        assert len(motor.llamadas) == 1

    def test_si_el_marcador_se_pierde_queda_la_primera_traduccion(self) -> None:
        salida = traductor().traducir(["Then Thomas lost sight of Mary."], ["en"], "es")
        assert salida == ["Entonces Tomás perdió de vista a María."]

    def test_sin_proteccion_no_hay_segunda_pasada(self) -> None:
        motor = MotorFalso()
        salida = traductor(motor, proteger=False).traducir(["The fog rolled in over Saltmarsh Point."], ["en"], "es")
        assert salida == ["La niebla llegó sobre Punta Marisma."]
        assert len(motor.llamadas) == 1


class TestCursivas:
    def test_cursiva_interior_repuesta_con_una_pasada_extra(self) -> None:
        motor = MotorFalso()
        assert traductor(motor).traducir(["It was *never* about money."], ["en"], "es") == ["*Nunca* fue por dinero."]
        assert [c[0] for c in motor.llamadas] == [["It was never about money."], ["It was «never» about money."]]

    def test_cursiva_perdida_deja_la_traduccion_fluida(self) -> None:
        assert traductor().traducir(["It was _always_ about money."], ["en"], "es") == ["Siempre fue por dinero."]


class TestMotorConOtroOrden:
    def test_el_orden_de_salida_es_el_de_entrada(self) -> None:
        class Inverso(MotorFalso):
            def traducir(self, frases: Sequence[str], origen: str, destino: str) -> list[str]:
                return [f[::-1] for f in frases]

        assert traductor(Inverso()).traducir(["Ab. Cd.", "Ef."], ["en", "en"], "es") == [".bA .dC", ".fE"]

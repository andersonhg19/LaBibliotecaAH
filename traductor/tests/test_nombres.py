from __future__ import annotations

import pytest

from app.nombres import MARCADORES, conservados, nombres_propios, palabras_de, proteger, reponer


class TestDeteccion:
    @pytest.mark.parametrize(
        ("frase", "esperado"),
        [
            ("The fog rolled in over Saltmarsh Point before anyone noticed.", ["Saltmarsh Point"]),
            ("For a terrible second Thomas lost sight of his sister.", ["Thomas"]),
            ("Mr. Hale opened the door and looked at Dr. Grant.", ["Hale", "Grant"]),
            ("Saltmarsh Point was quiet.", ["Saltmarsh Point"]),
            ("The house was quiet.", []),
            ("Margaret had always believed it.", []),
            ("She said I was late on Monday in January.", []),
            ('He whispered, "Thomas, come here."', []),
            ("They spoke English with the BBC reporter.", []),
            ("When Anna met Anna again.", ["Anna"]),
            ("But Saltmarsh Point and Old Harbour were far.", ["Saltmarsh Point", "Old Harbour"]),
            ("She turned to St. James's Park.", ["St. James's Park"]),
            ("¿Quién anda ahí? —preguntó Margarita.", ["Margarita"]),
            ("El Sr. Pérez llegó tarde.", ["Pérez"]),
        ],
    )
    def test_nombres_propios(self, frase: str, esperado: list[str]) -> None:
        assert nombres_propios(frase) == esperado

    def test_titulos_en_mayusculas_no_tienen_nombres(self) -> None:
        assert nombres_propios("Chapter Three: The Keeper of Saltmarsh Light") == []
        assert nombres_propios("Thomas Wren left.") == ["Thomas Wren"]

    def test_nombre_conocido_tambien_al_comienzo(self) -> None:
        assert nombres_propios("Tobias and the others followed.") == []
        assert nombres_propios("Tobias and the others followed.", frozenset({"Tobias"})) == ["Tobias"]
        assert palabras_de(["St. James's Park", "Tobias"]) == {"James's", "Park", "Tobias"}

    def test_como_mucho_tantos_nombres_como_marcadores(self) -> None:
        frase = "they met " + " and then ".join(f"Nombre{chr(65 + i)}" for i in range(10))
        assert len(nombres_propios(frase)) == len(MARCADORES)


class TestMarcadores:
    def test_proteger_y_reponer(self) -> None:
        nombres = ["Saltmarsh Point", "Saltmarsh"]
        protegida = proteger("Saltmarsh and Saltmarsh Point.", nombres)
        assert protegida == f"{MARCADORES[1]} and {MARCADORES[0]}."
        assert reponer(f"{MARCADORES[1]} y {MARCADORES[0]}.", nombres) == "Saltmarsh y Saltmarsh Point."

    def test_reponer_admite_tildes_y_mayusculas_que_ponga_el_modelo(self) -> None:
        assert reponer(f"dijo {MARCADORES[0].replace('a', 'á')}.", ["Tobias"]) == "dijo Tobias."
        assert reponer(f"dijo {MARCADORES[0].upper()}.", ["Tobias"]) == "dijo Tobias."
        assert reponer(f"dijo {MARCADORES[0]}es.", ["Tobias"]) is None

    def test_reponer_falla_si_se_pierde_un_marcador(self) -> None:
        assert reponer("Nada que ver.", ["Thomas"]) is None

    def test_conservados(self) -> None:
        assert conservados("Thomas perdió de vista a Mary.", ["Thomas", "Mary"])
        assert not conservados("Tomás perdió de vista a Mary.", ["Thomas", "Mary"])
        assert not conservados("Thomasina vino.", ["Thomas"])

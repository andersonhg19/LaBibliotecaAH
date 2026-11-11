from __future__ import annotations

from collections.abc import Iterator, Sequence

import pytest
from fastapi.testclient import TestClient

from app.api import crear_app
from app.config import Ajustes
from app.nombres import MARCADORES

# Diccionario mínimo del traductor falso: lo que no está, se devuelve marcado con el destino.
DICCIONARIO = {
    ("en", "es"): {
        "Hello.": "Hola.",
        "Good morning.": "Buenos días.",
        "The rain had not stopped.": "La lluvia no había parado.",
        "She left.": "Ella se fue.",
        "The fog rolled in over Saltmarsh Point.": "La niebla llegó sobre Punta Marisma.",
        f"The fog rolled in over {MARCADORES[0]}.": f"La niebla llegó sobre {MARCADORES[0]}.",
        "Thomas lost sight of Mary.": "Tomás perdió de vista a Mary.",
        "Then Thomas lost sight of Mary.": "Entonces Tomás perdió de vista a María.",
        f"Then {MARCADORES[0]} lost sight of {MARCADORES[1]}.": f"Entonces perdió de vista a {MARCADORES[1]}.",
        '"You should not have come here," he said.': '"No deberías haber venido aquí," dijo.',
        "The house was empty.": "La casa estaba vacía.",
        "The house was empty": "La casa estaba vacía",
        "Mr. Hale opened the door.": "El Sr. Hale abrió la puerta.",
        "It was never about money.": "Nunca fue por dinero.",
        "It was «never» about money.": "Era «nunca» por dinero.",
        "It was always about money.": "Siempre fue por dinero.",
        "It was «always» about money.": "Siempre fue por dinero.",
    },
    ("es", "en"): {"Hola.": "Hello.", "La casa estaba vacía.": "The house was empty."},
}


class MotorFalso:
    def __init__(self, idiomas: Sequence[str] = ("en", "es")) -> None:
        self.llamadas: list[tuple[list[str], str, str]] = []
        self._pares = frozenset((o, d) for o in idiomas for d in idiomas if o != d)

    def pares(self) -> frozenset[tuple[str, str]]:
        return self._pares

    def traducir(self, frases: Sequence[str], origen: str, destino: str) -> list[str]:
        self.llamadas.append((list(frases), origen, destino))
        tabla = DICCIONARIO.get((origen, destino), {})
        return [tabla.get(f, f"[{destino}] {f}") for f in frases]


@pytest.fixture
def motor() -> MotorFalso:
    return MotorFalso()


@pytest.fixture
def ajustes() -> Ajustes:
    return Ajustes(max_caracteres=500, max_textos=5, max_bytes_cuerpo=4_000)


@pytest.fixture
def cliente(motor: MotorFalso, ajustes: Ajustes) -> Iterator[TestClient]:
    with TestClient(crear_app(ajustes, lambda _: motor), raise_server_exceptions=False) as c:
        yield c

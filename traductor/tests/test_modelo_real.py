"""Humo con el modelo real (Opus-MT int8). Corre en la imagen (target ``pruebas``), donde están los modelos;
en CI y en un PC sin modelos se salta (``-m 'not modelo'`` o carpeta ausente)."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.api import crear_app
from app.config import desde_entorno

MODELOS = os.environ.get("TRADUCTOR_MODELOS", "/modelos")

pytestmark = [
    pytest.mark.modelo,
    pytest.mark.skipif(not os.path.isfile(os.path.join(MODELOS, "en-es", "model.bin")), reason="sin modelos"),
]


def test_traduce_de_verdad_en_los_dos_sentidos_y_conserva_nombres() -> None:
    with TestClient(crear_app(desde_entorno())) as c:
        assert c.get("/health").status_code == 200
        r = c.post(
            "/translate",
            json={
                "q": [
                    "The old lighthouse keeper began to suspect that the sea was trying to tell him something.",
                    "The fog rolled in over Saltmarsh Point before anyone noticed.",
                    "Mr. Hale opened the door.\n\nShe smiled.",
                ],
                "source": "auto",
                "target": "es",
            },
        )
        assert r.status_code == 200
        es = r.json()["translatedText"]
        assert "faro" in es[0]
        assert "Saltmarsh Point" in es[1]
        assert "\n\n" in es[2]
        assert [d["language"] for d in r.json()["detectedLanguage"]] == ["en", "en", "en"]
        en = c.post("/translate", json={"q": "La casa estaba vacía.", "source": "es", "target": "en"}).json()
        assert "house" in en["translatedText"].lower()


def test_texto_largo_sin_puntuacion_se_traduce_nu01() -> None:
    texto = " ".join(["the old keeper watched the grey sea under a silent sky"] * 60)[:3000].strip()
    with TestClient(crear_app(desde_entorno())) as c:
        r = c.post("/translate", json={"q": texto, "source": "en", "target": "es"})
        assert r.status_code == 200
        assert "mar" in r.json()["translatedText"]
        # Una sola "palabra" de 3000 letras tampoco tumba el modelo.
        assert c.post("/translate", json={"q": "a" * 3000, "source": "en", "target": "es"}).status_code == 200

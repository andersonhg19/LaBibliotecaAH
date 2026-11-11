"""La API habla el protocolo de LibreTranslate tal como lo usa TraductorClient (biblioteca-service)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.api import crear_app
from app.config import Ajustes
from tests.conftest import MotorFalso


class TestTranslateComoLoUsaBiblioteca:
    def test_lote_con_origen_fijo_devuelve_lista_en_orden_y_sin_idioma_detectado(self, cliente: TestClient) -> None:
        r = cliente.post(
            "/translate", json={"q": ["Hello.", "She left."], "source": "en", "target": "es", "format": "text"}
        )
        assert r.status_code == 200
        assert r.json() == {"translatedText": ["Hola.", "Ella se fue."]}

    def test_lote_con_auto_devuelve_una_deteccion_por_texto(self, cliente: TestClient) -> None:
        r = cliente.post(
            "/translate", json={"q": ["The rain had not stopped.", "Hola."], "source": "auto", "target": "es"}
        )
        assert r.status_code == 200
        cuerpo = r.json()
        assert cuerpo["translatedText"] == ["La lluvia no había parado.", "Hola."]
        assert [d["language"] for d in cuerpo["detectedLanguage"]] == ["en", "es"]
        assert all(0 < d["confidence"] <= 100 for d in cuerpo["detectedLanguage"])

    def test_texto_suelto_devuelve_texto_y_objeto_de_deteccion(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "The rain had not stopped.", "source": "auto", "target": "es"})
        assert r.json() == {
            "translatedText": "La lluvia no había parado.",
            "detectedLanguage": {"confidence": 100.0, "language": "en"},
        }

    def test_texto_suelto_con_origen_fijo(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "Hola.", "source": "es", "target": "en"})
        assert r.json() == {"translatedText": "Hello."}

    def test_lista_vacia_y_textos_vacios_se_respetan(self, cliente: TestClient) -> None:
        assert cliente.post("/translate", json={"q": [], "source": "en", "target": "es"}).json() == {
            "translatedText": []
        }
        r = cliente.post("/translate", json={"q": ["", "  ", "Hello."], "source": "en", "target": "es"})
        assert r.json() == {"translatedText": ["", "  ", "Hola."]}

    def test_mismo_idioma_devuelve_el_texto_sin_llamar_al_modelo(self, cliente: TestClient, motor: MotorFalso) -> None:
        antes = len(motor.llamadas)
        r = cliente.post("/translate", json={"q": ["Hola."], "source": "es", "target": "es"})
        assert r.json() == {"translatedText": ["Hola."]}
        assert len(motor.llamadas) == antes

    def test_idiomas_en_mayusculas_o_con_espacios_se_aceptan(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "Hello.", "source": " EN ", "target": "Es"})
        assert r.json() == {"translatedText": "Hola."}


class TestErroresClaros:
    def test_sin_q_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"source": "en", "target": "es"})
        assert r.status_code == 400
        assert r.json() == {"error": "Petición inválida: falta el parámetro q"}

    def test_q_con_numeros_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": ["a", 3], "source": "en", "target": "es"})
        assert r.status_code == 400
        assert r.json() == {"error": "Petición inválida: q debe ser un texto o una lista de textos"}

    def test_idioma_no_cargado_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "Hello.", "source": "en", "target": "fr"})
        assert r.status_code == 400
        assert r.json() == {"error": "fr no está disponible (idiomas: en, es)"}

    def test_auto_como_destino_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "Hello.", "source": "en", "target": "auto"})
        assert r.status_code == 400

    def test_sin_source_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "Hello.", "target": "es"})
        assert r.json() == {"error": "Petición inválida: falta el parámetro source"}

    def test_formato_html_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": "<b>Hi</b>", "source": "en", "target": "es", "format": "html"})
        assert r.status_code == 400
        assert r.json() == {"error": "Formato no admitido: solo format=text"}

    def test_cuerpo_que_no_es_json_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", content=b"q=hola", headers={"Content-Type": "application/x-www-form-urlencoded"})
        assert r.status_code == 400
        assert r.json() == {"error": "Petición inválida: el cuerpo debe ser JSON"}

    def test_json_que_no_es_objeto_es_400(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json=["Hello."])
        assert r.json() == {"error": "Petición inválida: el cuerpo debe ser un objeto JSON"}

    def test_demasiados_caracteres_es_413(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": ["a" * 300, "b" * 201], "source": "en", "target": "es"})
        assert r.status_code == 413
        assert r.json() == {"error": "Demasiado texto: 501 caracteres (máximo 500)"}

    def test_demasiados_textos_es_413(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", json={"q": ["a"] * 6, "source": "en", "target": "es"})
        assert r.status_code == 413
        assert r.json() == {"error": "Demasiados textos: 6 (máximo 5)"}

    def test_cuerpo_enorme_es_413_sin_leerlo(self, cliente: TestClient) -> None:
        r = cliente.post("/translate", content=b"x" * 5_000, headers={"Content-Type": "application/json"})
        assert r.status_code == 413
        assert r.json() == {"error": "La petición supera 4000 bytes"}

    def test_cuerpo_enorme_sin_content_length_es_413(self, cliente: TestClient) -> None:
        def trozos():  # type: ignore[no-untyped-def]
            yield b"x" * 3_000
            yield b"x" * 3_000

        r = cliente.post("/translate", content=trozos(), headers={"Content-Type": "application/json"})
        assert r.status_code == 413

    def test_ruta_desconocida_es_404_json(self, cliente: TestClient) -> None:
        r = cliente.get("/nada")
        assert r.status_code == 404
        assert r.json() == {"error": "Ruta no encontrada"}

    def test_metodo_equivocado_es_405_json(self, cliente: TestClient) -> None:
        r = cliente.get("/translate")
        assert r.status_code == 405
        assert r.json() == {"error": "Método no permitido"}

    def test_fallo_del_modelo_es_500_sin_traza(self, cliente: TestClient, motor: MotorFalso) -> None:
        def roto(*_: object) -> list[str]:
            raise RuntimeError("detalle interno /modelos/en-es")

        motor.traducir = roto  # type: ignore[method-assign]
        r = cliente.post("/translate", json={"q": "Hello.", "source": "en", "target": "es"})
        assert r.status_code == 500
        assert r.json() == {"error": "Error interno del traductor"}
        assert "modelos" not in r.text


class TestOtrasRutas:
    def test_languages_como_libretranslate(self, cliente: TestClient) -> None:
        assert cliente.get("/languages").json() == [
            {"code": "en", "name": "English", "targets": ["en", "es"]},
            {"code": "es", "name": "Spanish", "targets": ["en", "es"]},
        ]

    def test_health_con_modelos_cargados(self, cliente: TestClient) -> None:
        r = cliente.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "languages": ["en", "es"]}

    def test_detect(self, cliente: TestClient) -> None:
        r = cliente.post("/detect", json={"q": ["¿Dónde está la casa?", "Where is the house?"]})
        assert [d["language"] for d in r.json()] == ["es", "en"]

    def test_sin_modelos_cargados_todo_es_503(self, ajustes: Ajustes) -> None:
        app = crear_app(ajustes, lambda _: MotorFalso())
        with TestClient(app) as c:
            pass  # al salir del contexto el ciclo de vida descarga los modelos
        c2 = TestClient(app)  # sin ciclo de vida: nunca se cargaron
        r = c2.get("/health")
        assert r.status_code == 503
        assert r.json() == {"error": "El traductor todavía está cargando los modelos"}
        assert c2.post("/translate", json={"q": "Hello.", "source": "en", "target": "es"}).status_code == 503
        assert c.app is app

    def test_si_el_modelo_no_traduce_no_arranca(self, ajustes: Ajustes) -> None:
        class Mudo(MotorFalso):
            def traducir(self, frases, origen, destino):  # type: ignore[no-untyped-def]
                return ["" for _ in frases]

        try:
            with TestClient(crear_app(ajustes, lambda _: Mudo())):
                raise AssertionError("no debía arrancar")
        except RuntimeError as e:
            assert "no devolvió traducción" in str(e)


class TestNU01TextoSinPuntuacion:
    def test_3000_caracteres_sin_signos_se_traducen_sin_503(self, motor: MotorFalso) -> None:
        texto = " ".join(["the grey sea under a silent sky"] * 100)[:3000].strip()
        with TestClient(crear_app(Ajustes(), lambda _: motor), raise_server_exceptions=False) as c:
            r = c.post("/translate", json={"q": texto, "source": "en", "target": "es"})
        assert r.status_code == 200
        enviadas = [f for llamada in motor.llamadas for f in llamada[0] if llamada[1:] == ("en", "es")]
        assert len(enviadas) > 1
        assert max(len(f) for f in enviadas) <= 400
        assert r.json()["translatedText"].startswith("[es] the grey sea")

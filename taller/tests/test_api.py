from fastapi.testclient import TestClient

from app.api.servidor import crear_app
from app.config.ajustes import Ajustes


def ajustes(tmp_path, **extra):
    base = {"db_url": "postgresql://x:y@nadie:5432/db", "datos": tmp_path, "trabajadores": False, "muestras": False}
    return Ajustes(**{**base, **extra})


def test_salud_y_voces(tmp_path):
    with TestClient(crear_app(ajustes(tmp_path))) as c:
        r = c.get("/salud")
        assert r.status_code == 200
        cuerpo = r.json()
        assert cuerpo["estado"] == "ok" and cuerpo["datos"] == {"ruta": str(tmp_path), "disponible": True}
        assert cuerpo["trabajadores"] == []
        v = c.get("/voces").json()
        assert len(v) == 9
        assert v[0] == {
            "id": "edge.es-ES-AlvaroNeural",
            "nombre": "Álvaro",
            "pais": "España",
            "genero": "M",
            "motor": "edge",
            "porDefecto": True,
        }
        assert sum(1 for x in v if x["porDefecto"]) == 1
        assert {x["nombre"] for x in v} == {
            "Álvaro",
            "Elvira",
            "Ximena",
            "Carlos",
            "Gonzalo",
            "Salomé",
            "Jorge",
            "Alonso",
            "Tomás",
        }


def test_arranque_con_trabajadores_y_bd_caida_no_tumba_el_servicio(tmp_path, monkeypatch):
    import app.api.servidor as srv

    generadas = []
    monkeypatch.setattr(srv, "generar_muestras", lambda d: generadas.append(d))
    a = ajustes(
        tmp_path, trabajadores=True, muestras=True, intervalo_seg=0.05, db_url="postgresql://x:y@127.0.0.1:1/db"
    )
    with TestClient(crear_app(a)) as c:
        cuerpo = c.get("/salud").json()
        assert [t["nombre"] for t in cuerpo["trabajadores"]] == ["conversion", "voz", "voz-2"]
        assert all(t["vivo"] for t in cuerpo["trabajadores"])
    assert generadas == [tmp_path / "muestras"]

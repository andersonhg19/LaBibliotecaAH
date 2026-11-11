import json

from app import cli


def test_cli_convierte_y_registra(tmp_path, monkeypatch, txt_prueba, caplog):
    monkeypatch.setenv("TALLER_DATOS", str(tmp_path))
    assert cli.main(["convertir", str(txt_prueba), "a1"]) == 0
    est = json.loads((tmp_path / "normalizados" / "a1" / "estructura.json").read_text(encoding="utf-8"))
    assert len(est["capitulos"]) == 3
    assert (tmp_path / "originales" / "a1" / "prueba.txt").exists()


def test_cli_uso_incorrecto(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLER_DATOS", str(tmp_path))
    assert cli.main([]) == 2

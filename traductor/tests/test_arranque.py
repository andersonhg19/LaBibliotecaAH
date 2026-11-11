from __future__ import annotations

from typing import Any

import pytest

from app import __main__ as arranque


def test_main_arranca_uvicorn_con_el_puerto_del_entorno(monkeypatch: pytest.MonkeyPatch) -> None:
    llamadas: list[dict[str, Any]] = []
    monkeypatch.setenv("TRADUCTOR_PUERTO", "5123")
    monkeypatch.setattr(arranque.uvicorn, "run", lambda app, **kw: llamadas.append({"app": app, **kw}))
    arranque.main()
    assert llamadas[0]["port"] == 5123
    assert llamadas[0]["host"] == "0.0.0.0"
    assert llamadas[0]["app"].title == "Traductor de La Biblioteca AH"

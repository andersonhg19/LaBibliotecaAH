import logging

import pytest

from app.config.ajustes import AjustesBasicos, ErrorDeConfiguracion, cargar_ajustes
from app.config.registro import FiltroContexto, configurar_logs, contexto
from app.config.rutas import Rutas
from app.dominio.mensajes import Msj, texto
from app.dominio.modelo import ErrorDefinitivo


def test_sin_db_url_falla_temprano_con_mensaje_claro(monkeypatch):
    monkeypatch.delenv("TALLER_DB_URL", raising=False)
    with pytest.raises(ErrorDeConfiguracion, match="falta la variable TALLER_DB_URL"):
        cargar_ajustes()


def test_valores_invalidos_se_explican(monkeypatch):
    monkeypatch.setenv("TALLER_DB_URL", "postgresql://a:b@c/d")
    monkeypatch.setenv("TALLER_PUERTO", "99999")
    with pytest.raises(ErrorDeConfiguracion, match="TALLER_PUERTO inválida"):
        cargar_ajustes()


def test_ajustes_desde_entorno(monkeypatch, tmp_path):
    monkeypatch.setenv("TALLER_DB_URL", "postgresql://a:b@c/d")
    monkeypatch.setenv("TALLER_DATOS", str(tmp_path))
    monkeypatch.setenv("TALLER_TRABAJADORES", "false")
    a = cargar_ajustes()
    assert a.db_url == "postgresql://a:b@c/d" and a.datos == tmp_path and a.trabajadores is False
    assert a.puerto == 8926 and a.max_intentos == 3 and a.minutos_atascado == 30 and a.intervalo_seg == 2.0
    monkeypatch.delenv("TALLER_DATOS")
    assert str(AjustesBasicos().datos) == "datos-dev"


def test_rutas_del_contrato(tmp_path):
    r = Rutas(tmp_path)
    assert r.frases("A", 3) == tmp_path / "normalizados" / "A" / "frases" / "cap-003.json"
    assert r.audio("A", "edge.x") == tmp_path / "audio" / "A" / "edge.x"
    assert r.cache_voz() == tmp_path / "cache-voz" and r.muestras() == tmp_path / "muestras"
    assert r.originales("A") == tmp_path / "originales" / "A"


def test_logs_llevan_trabajo_y_archivo(caplog):
    configurar_logs("INFO")
    configurar_logs("INFO")  # idempotente
    raiz = logging.getLogger()
    assert sum(1 for h in raiz.handlers for f in h.filters if isinstance(f, FiltroContexto)) == 1
    caplog.handler.addFilter(FiltroContexto())
    with contexto("t-1", "a-1"):
        logging.getLogger("prueba").info("hola")
    logging.getLogger("prueba").info("fuera")
    assert (caplog.records[0].trabajo, caplog.records[0].archivo) == ("t-1", "a-1")
    assert (caplog.records[1].trabajo, caplog.records[1].archivo) == ("-", "-")


def test_mensajes_en_espanol_con_datos():
    assert texto(Msj.CAPITULO_INEXISTENTE, capitulo=4) == "El capítulo 4 no existe o el libro aún no está convertido."
    assert str(ErrorDefinitivo(Msj.PDF_ESCANEADO)) == "PDF escaneado: el OCR llegará en una ola posterior"
    assert str(ErrorDefinitivo("texto libre")) == "texto libre"

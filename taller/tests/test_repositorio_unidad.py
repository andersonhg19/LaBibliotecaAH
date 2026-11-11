"""RepositorioPg con una conexión falsa: comprueba qué SQL y qué parámetros manda (sin PostgreSQL)."""

import json
import sys
import types

import pytest

from app.cola import repositorio as R


class CursorFalso:
    def __init__(self, con):
        self.con = con
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params):
        if self.con.fallar:
            raise RuntimeError("conexión perdida")
        self.con.ejecutadas.append((sql, params))

    def fetchone(self):
        sql = self.con.ejecutadas[-1][0]
        return {"n": 2} if "count(*)" in sql else {"id": "t1"}


class ConexionFalsa:
    def __init__(self):
        self.ejecutadas = []
        self.closed = False
        self.broken = False
        self.fallar = False

    def cursor(self):
        return CursorFalso(self)

    def close(self):
        self.closed = True


@pytest.fixture
def repo(monkeypatch):
    conexiones = []

    def connect(url, **kw):
        assert kw["autocommit"] is True
        c = ConexionFalsa()
        conexiones.append(c)
        return c

    falso = types.ModuleType("psycopg")
    falso.connect = connect
    filas = types.ModuleType("psycopg.rows")
    filas.dict_row = object()
    monkeypatch.setitem(sys.modules, "psycopg", falso)
    monkeypatch.setitem(sys.modules, "psycopg.rows", filas)
    r = R.RepositorioPg("postgresql://x")
    r.conexiones = conexiones
    return r


def test_tomar_usa_sql_del_contrato_con_filtro_de_tipo(repo):
    assert repo.tomar(["CONVERTIR"]) == {"id": "t1"}
    sql, params = repo.conexiones[0].ejecutadas[0]
    assert sql == R.SQL_TOMAR and params == {"tipos": ["CONVERTIR"]}


def test_operaciones_y_parametros(repo):
    assert repo.reiniciar_atascados(300, ["CONVERTIR"]) == 2
    repo.marcar_hecho("t1")
    repo.marcar_fallo("t1", "x" * 5000, definitivo=False)
    repo.marcar_fallo("t1", "fin", definitivo=True)
    repo.latido("t1")
    repo.archivo_procesando("a1")
    repo.archivo_listo("a1", {"titulo": "Ñ"}, 2, 100, 1, True, 1)
    repo.archivo_estado("a1", "ERROR", "malo")
    repo.archivo_estado("a1", "PENDIENTE", None)
    repo.audio_estado("a1", "edge.v", 0, "LISTO", duracion=1.5)
    ej = repo.conexiones[0].ejecutadas
    assert ej[0] == (R.SQL_REINICIAR_ATASCADOS, {"segundos": 300, "tipos": ["CONVERTIR"]})
    assert ej[2][1]["estado"] == "PENDIENTE" and len(ej[2][1]["error"]) == 4000
    assert ej[3][1]["estado"] == "ERROR"
    assert json.loads(ej[6][1]["metadatos"]) == {"titulo": "Ñ"} and ej[6][1]["portada"] is True
    assert ej[8][1]["error"] is None
    assert ej[9][1] == {
        "archivo": "a1",
        "voz": "edge.v",
        "capitulo": 0,
        "estado": "LISTO",
        "duracion": 1.5,
        "error": None,
    }
    assert len(repo.conexiones) == 1  # una sola conexión reutilizada


def test_conexion_rota_se_descarta_y_reconecta(repo):
    repo.marcar_hecho("t1")
    c = repo.conexiones[0]
    c.fallar, c.broken = True, True
    with pytest.raises(RuntimeError):
        repo.marcar_hecho("t1")
    repo.marcar_hecho("t1")
    assert len(repo.conexiones) == 2
    repo.cerrar()
    assert repo.conexiones[1].closed

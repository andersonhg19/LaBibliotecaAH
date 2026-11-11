"""Pruebas contra un PostgreSQL real (opcionales): exporta TALLER_DB_URL_PRUEBA para ejecutarlas."""

import os
import threading
import uuid

import pytest

from app.cola.repositorio import RepositorioPg

URL = os.environ.get("TALLER_DB_URL_PRUEBA")
pytestmark = [pytest.mark.postgres, pytest.mark.skipif(not URL, reason="sin TALLER_DB_URL_PRUEBA")]

DDL = """
DROP TABLE IF EXISTS bah_lib_trabajo, bah_lib_audio, bah_lib_archivo;
CREATE TABLE bah_lib_trabajo (
  id UUID PRIMARY KEY, tipo VARCHAR(30) NOT NULL, archivo_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  prioridad INT NOT NULL DEFAULT 100, intentos INT NOT NULL DEFAULT 0, error TEXT,
  creado TIMESTAMP NOT NULL DEFAULT now(), actualizado TIMESTAMP NOT NULL DEFAULT now());
CREATE INDEX ix_bah_lib_trabajo_cola ON bah_lib_trabajo (estado, prioridad, creado);
CREATE TABLE bah_lib_archivo (
  id UUID PRIMARY KEY, estado_conversion VARCHAR(20), error_conversion TEXT, version_texto INT,
  n_capitulos INT, n_palabras INT, minutos_estimados INT, metadatos JSONB, tiene_portada BOOLEAN,
  actualizado TIMESTAMP);
CREATE TABLE bah_lib_audio (
  archivo_id UUID NOT NULL, voz_id VARCHAR(80) NOT NULL, capitulo INT NOT NULL, estado VARCHAR(20) NOT NULL,
  duracion_seg NUMERIC(10,2), error TEXT, actualizado TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (archivo_id, voz_id, capitulo));
"""


@pytest.fixture
def con():
    import psycopg

    c = psycopg.connect(URL, autocommit=True)
    c.execute(DDL)
    yield c
    c.close()


def insertar(con, tipo="CONVERTIR", prioridad=100, creado="now()", payload="{}"):
    tid = uuid.uuid4()
    con.execute(
        f"INSERT INTO bah_lib_trabajo (id, tipo, archivo_id, payload, prioridad, creado) "
        f"VALUES (%s, %s, %s, %s::jsonb, %s, {creado})",
        (tid, tipo, uuid.uuid4(), payload, prioridad),
    )
    return tid


def test_tomar_respeta_orden_tipo_e_intentos(con):
    a = insertar(con, creado="now() - interval '2 min'")
    b = insertar(con, prioridad=10)
    c = insertar(con, creado="now() - interval '5 min'")
    v = insertar(con, tipo="VOZ_CAPITULO", prioridad=1, payload='{"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 3}')
    repo = RepositorioPg(URL)
    tomados = [repo.tomar(["CONVERTIR"]) for _ in range(4)]
    assert [t["id"] for t in tomados[:3]] == [b, c, a]
    assert tomados[3] is None
    assert all(t["estado"] == "EN_CURSO" and t["intentos"] == 1 for t in tomados[:3])
    tv = repo.tomar(["VOZ_CAPITULO"])
    assert tv["id"] == v and tv["payload"] == {"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 3}
    repo.marcar_fallo(a, "falló", definitivo=False)
    repo.marcar_hecho(b)
    repo.marcar_fallo(c, "sin arreglo", definitivo=True)
    estados = dict(con.execute("SELECT id, estado FROM bah_lib_trabajo").fetchall())
    assert estados[a] == "PENDIENTE" and estados[b] == "HECHO" and estados[c] == "ERROR"
    assert repo.tomar(["CONVERTIR"])["intentos"] == 2
    repo.cerrar()


def test_skip_locked_concurrente(con):
    ids = {insertar(con) for _ in range(20)}
    tomados = []
    lock = threading.Lock()

    def hilo():
        r = RepositorioPg(URL)
        while (t := r.tomar(["CONVERTIR"])) is not None:
            with lock:
                tomados.append(t["id"])
        r.cerrar()

    hs = [threading.Thread(target=hilo) for _ in range(4)]
    [h.start() for h in hs]
    [h.join() for h in hs]
    assert sorted(tomados) == sorted(ids)  # cada trabajo una sola vez


def test_reiniciar_atascados(con):
    viejo = insertar(con)
    nuevo = insertar(con)
    con.execute(
        "UPDATE bah_lib_trabajo SET estado='EN_CURSO', actualizado=now() - interval '31 min' WHERE id=%s", (viejo,)
    )
    con.execute("UPDATE bah_lib_trabajo SET estado='EN_CURSO' WHERE id=%s", (nuevo,))
    repo = RepositorioPg(URL)
    assert repo.reiniciar_atascados(30) == 1
    estados = dict(con.execute("SELECT id, estado FROM bah_lib_trabajo").fetchall())
    assert estados[viejo] == "PENDIENTE" and estados[nuevo] == "EN_CURSO"
    repo.cerrar()


def test_archivo_y_audio(con):
    aid = uuid.uuid4()
    con.execute("INSERT INTO bah_lib_archivo (id, estado_conversion) VALUES (%s, 'PENDIENTE')", (aid,))
    repo = RepositorioPg(URL)
    repo.archivo_procesando(str(aid))
    assert con.execute("SELECT estado_conversion FROM bah_lib_archivo").fetchone()[0] == "PROCESANDO"
    md = {
        "titulo": "Ñandú",
        "autores": ["Ana"],
        "idioma": "es",
        "isbn": None,
        "editorial": None,
        "anio": 2020,
        "sinopsis": None,
    }
    repo.archivo_listo(str(aid), md, 3, 1200, 8, True, 1)
    fila = con.execute(
        "SELECT estado_conversion, metadatos, n_capitulos, n_palabras, minutos_estimados, "
        "tiene_portada, version_texto FROM bah_lib_archivo"
    ).fetchone()
    assert fila == ("LISTO", md, 3, 1200, 8, True, 1)
    repo.archivo_estado(str(aid), "ERROR", "PDF escaneado: el OCR llegará en una ola posterior")
    assert con.execute("SELECT error_conversion FROM bah_lib_archivo").fetchone()[0].startswith("PDF escaneado")

    repo.audio_estado(str(aid), "edge.es-ES-AlvaroNeural", 0, "GENERANDO")
    repo.audio_estado(str(aid), "edge.es-ES-AlvaroNeural", 0, "LISTO", duracion=123.456)
    filas = con.execute("SELECT estado, duracion_seg FROM bah_lib_audio").fetchall()
    assert len(filas) == 1 and filas[0][0] == "LISTO" and float(filas[0][1]) == 123.46
    repo.cerrar()

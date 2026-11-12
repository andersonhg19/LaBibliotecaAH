import threading
import time

from app.cola import repositorio as R
from app.cola.trabajador import Manejador, ManejadorConvertir, Trabajador, procesar
from app.config.rutas import Rutas
from app.dominio.modelo import ErrorDefinitivo


class RepoFalso:
    """Cola en memoria que imita la semántica del SQL del contrato."""

    def __init__(self, trabajos=None):
        self.trabajos = trabajos or []
        self.archivos: dict = {}
        self.audios: dict = {}
        self.cerrado = 0
        self.retirados: set = set()  # archivos borrados por biblioteca-service
        self.latidos = 0
        self.reinicios: list = []

    def tomar(self, tipos, prioridad_max=None):
        pend = [t for t in self.trabajos if t["estado"] == "PENDIENTE" and t["tipo"] in tipos]
        if prioridad_max is not None:
            pend = [t for t in pend if t["prioridad"] <= prioridad_max]
        if not pend:
            return None
        t = sorted(pend, key=lambda x: (x["prioridad"], x["creado"]))[0]
        t["estado"] = "EN_CURSO"
        t["intentos"] += 1
        return dict(t)

    def _t(self, tid):
        return next(t for t in self.trabajos if t["id"] == tid)

    def reiniciar_atascados(self, segundos, tipos):
        self.reinicios.append((segundos, list(tipos)))
        return 0

    def marcar_hecho(self, tid):
        self._t(tid).update(estado="HECHO", error=None)

    def marcar_fallo(self, tid, mensaje, definitivo):
        self._t(tid).update(estado="ERROR" if definitivo else "PENDIENTE", error=mensaje)

    def latido(self, tid):
        self.latidos += 1

    def archivo_procesando(self, aid):
        if aid in self.retirados:
            return False
        self.archivos[aid] = {"estado": "PROCESANDO"}
        return True

    def archivo_listo(self, aid, metadatos, n_capitulos, n_palabras, minutos, tiene_portada, version_texto):
        if aid in self.retirados:
            return False
        self.archivos[aid] = {
            "estado": "LISTO",
            "metadatos": metadatos,
            "n_capitulos": n_capitulos,
            "n_palabras": n_palabras,
            "minutos": minutos,
            "portada": tiene_portada,
            "version": version_texto,
        }
        return True

    def archivo_estado(self, aid, estado, error):
        self.archivos[aid] = {"estado": estado, "error": error}

    def archivo_materias(self, aid, materias):
        a = self.archivos.get(aid)
        if aid in self.retirados or not a or a.get("estado") != "LISTO":
            return False
        a.setdefault("metadatos", {})["materias"] = materias
        a["aplicados"] = False
        return True

    def audio_estado(self, aid, voz, cap, estado, duracion=None, error=None):
        if aid in self.retirados:
            return False
        self.audios[(aid, voz, cap)] = {"estado": estado, "duracion": duracion, "error": error}
        return True

    def cerrar(self):
        self.cerrado += 1


def trabajo(tid="t1", tipo="CONVERTIR", prioridad=100, creado=0, intentos=0, archivo="a1", payload=None):
    return {
        "id": tid,
        "tipo": tipo,
        "archivo_id": archivo,
        "payload": payload or {},
        "estado": "PENDIENTE",
        "prioridad": prioridad,
        "intentos": intentos,
        "error": None,
        "creado": creado,
    }


class ManejadorQueFalla(Manejador):
    tipos = ("CONVERTIR",)

    def __init__(self, excepcion):
        self.excepcion = excepcion
        self.fallos = []

    def ejecutar(self, t, repo):
        raise self.excepcion

    def al_fallar(self, t, repo, mensaje, definitivo):
        self.fallos.append((mensaje, definitivo))


def test_sql_del_contrato():
    s = R.SQL_TOMAR
    assert "SET estado='EN_CURSO', intentos=intentos+1, actualizado=now()" in s
    assert "WHERE estado='PENDIENTE'" in s and "ORDER BY prioridad, creado FOR UPDATE SKIP LOCKED LIMIT 1" in s
    assert s.endswith("RETURNING *")
    assert "EN_CURSO" in R.SQL_REINICIAR_ATASCADOS and "PENDIENTE" in R.SQL_REINICIAR_ATASCADOS
    assert "ON CONFLICT (archivo_id, voz_id, capitulo)" in R.SQL_AUDIO_UPSERT


def test_orden_por_prioridad_y_fecha():
    repo = RepoFalso(
        [
            trabajo("a", creado=2),
            trabajo("b", prioridad=50, creado=3),
            trabajo("c", creado=1),
            trabajo("v", tipo="VOZ_CAPITULO", prioridad=1),
        ]
    )
    assert [repo.tomar(["CONVERTIR"])["id"] for _ in range(3)] == ["b", "c", "a"]
    assert repo.tomar(["CONVERTIR"]) is None
    assert repo.tomar(["VOZ_CAPITULO"])["id"] == "v"


def test_reintentos_hasta_tres():
    repo = RepoFalso([trabajo()])
    m = ManejadorQueFalla(RuntimeError("se cayó"))
    estados = []
    for _ in range(3):
        t = repo.tomar(["CONVERTIR"])
        estados.append(procesar(t, m, repo, max_intentos=3))
    assert estados == ["PENDIENTE", "PENDIENTE", "ERROR"]
    assert repo.trabajos[0]["estado"] == "ERROR" and repo.trabajos[0]["intentos"] == 3
    # el detalle técnico no llega al usuario (QA DA-20)
    assert repo.trabajos[0]["error"] == (
        "No se pudo convertir el libro por un problema inesperado del taller. "
        "Quedó registrado para revisarlo; puedes volver a intentarlo más tarde."
    )
    assert [d for _m, d in m.fallos] == [False, False, True]
    assert repo.tomar(["CONVERTIR"]) is None


def test_error_definitivo_no_reintenta():
    repo = RepoFalso([trabajo()])
    m = ManejadorQueFalla(ErrorDefinitivo("PDF escaneado: el OCR llegará en una ola posterior"))
    assert procesar(repo.tomar(["CONVERTIR"]), m, repo, 3) == "ERROR"
    assert repo.trabajos[0]["error"] == "PDF escaneado: el OCR llegará en una ola posterior"


def test_intentos_excedidos_por_reinicio_va_a_error():
    repo = RepoFalso([trabajo(intentos=3)])
    m = ManejadorQueFalla(RuntimeError("no debería ejecutarse"))
    assert procesar(repo.tomar(["CONVERTIR"]), m, repo, 3) == "ERROR"
    assert m.fallos and m.fallos[0][1] is True


def test_convertir_actualiza_archivo(tmp_path, txt_prueba):
    rutas = Rutas(tmp_path)
    (rutas.originales("a1")).mkdir(parents=True)
    (rutas.originales("a1") / "libro.txt").write_bytes(txt_prueba.read_bytes())
    repo = RepoFalso([trabajo()])
    assert procesar(repo.tomar(["CONVERTIR"]), ManejadorConvertir(rutas, aislar=False), repo, 3) == "HECHO"
    a = repo.archivos["a1"]
    assert a["estado"] == "LISTO" and a["n_capitulos"] == 3 and a["version"] == 1 and a["n_palabras"] > 10
    assert set(a["metadatos"]) == {"titulo", "autores", "idioma", "isbn", "editorial", "anio", "sinopsis", "materias"}
    assert (rutas.normalizados("a1") / "libro.epub").exists()


def test_convertir_sin_original_marca_error(tmp_path):
    repo = RepoFalso([trabajo()])
    procesar(repo.tomar(["CONVERTIR"]), ManejadorConvertir(Rutas(tmp_path), aislar=False), repo, 3)
    assert repo.archivos["a1"]["estado"] == "ERROR"
    assert "original" in repo.archivos["a1"]["error"]


def test_el_bucle_sobrevive_a_excepciones():
    llamadas = {"n": 0}

    class RepoInestable(RepoFalso):
        def tomar(self, tipos):
            llamadas["n"] += 1
            if llamadas["n"] == 1:
                raise ConnectionError("BD caída")
            return super().tomar(tipos)

    repos = []

    def fabrica():
        r = RepoInestable([trabajo()]) if not repos else repos[0]
        repos.append(r)
        return r

    class Ok(Manejador):
        tipos = ("CONVERTIR",)
        hechos = 0

        def ejecutar(self, t, repo):
            Ok.hechos += 1

    parar = threading.Event()
    t = Trabajador("prueba", Ok(), fabrica, 0.01, 3, parar)
    # acelerar la espera tras error
    original_wait = parar.wait
    parar.wait = lambda s: original_wait(0.01)
    t.start()
    fin = time.time() + 5
    while Ok.hechos == 0 and time.time() < fin:
        time.sleep(0.02)
    parar.set()
    t.join(2)
    assert Ok.hechos == 1
    assert repos[0].trabajos[0]["estado"] == "HECHO"
    assert not t.is_alive()

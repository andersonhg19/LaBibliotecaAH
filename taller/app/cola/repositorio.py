"""Acceso a PostgreSQL (biblioteca_db): cola `bah_lib_trabajo`, `bah_lib_archivo` y `bah_lib_audio`.

Ver contratos.md §7.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Protocol

log = logging.getLogger(__name__)

# SQL del contrato, con UNA diferencia documentada: el filtro `AND tipo = ANY(%(tipos)s)` para que el
# trabajador de voz y el de conversión no se bloqueen entre sí (cada hilo toma solo sus tipos).
SQL_TOMAR = (
    "UPDATE bah_lib_trabajo SET estado='EN_CURSO', intentos=intentos+1, actualizado=now() "
    "WHERE id = (SELECT id FROM bah_lib_trabajo WHERE estado='PENDIENTE' AND tipo = ANY(%(tipos)s) "
    "ORDER BY prioridad, creado FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *"
)
SQL_REINICIAR_ATASCADOS = (
    "UPDATE bah_lib_trabajo SET estado='PENDIENTE', actualizado=now() "
    "WHERE estado='EN_CURSO' AND actualizado < now() - make_interval(mins => %(minutos)s)"
)
SQL_HECHO = "UPDATE bah_lib_trabajo SET estado='HECHO', error=NULL, actualizado=now() WHERE id=%(id)s"
SQL_FALLO = "UPDATE bah_lib_trabajo SET estado=%(estado)s, error=%(error)s, actualizado=now() WHERE id=%(id)s"
SQL_LATIDO = "UPDATE bah_lib_trabajo SET actualizado=now() WHERE id=%(id)s AND estado='EN_CURSO'"

SQL_ARCHIVO_PROCESANDO = (
    "UPDATE bah_lib_archivo SET estado_conversion='PROCESANDO', error_conversion=NULL, actualizado=now() "
    "WHERE id=%(id)s"
)
SQL_ARCHIVO_LISTO = (
    "UPDATE bah_lib_archivo SET estado_conversion='LISTO', error_conversion=NULL, version_texto=%(version)s, "
    "n_capitulos=%(n_capitulos)s, n_palabras=%(n_palabras)s, minutos_estimados=%(minutos)s, "
    "metadatos=%(metadatos)s::jsonb, tiene_portada=%(portada)s, actualizado=now() WHERE id=%(id)s"
)
SQL_ARCHIVO_ESTADO = (
    "UPDATE bah_lib_archivo SET estado_conversion=%(estado)s, error_conversion=%(error)s, actualizado=now() "
    "WHERE id=%(id)s"
)
SQL_AUDIO_UPSERT = (
    "INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg, error, actualizado) "
    "VALUES (%(archivo)s, %(voz)s, %(capitulo)s, %(estado)s, %(duracion)s, %(error)s, now()) "
    "ON CONFLICT (archivo_id, voz_id, capitulo) DO UPDATE SET estado=EXCLUDED.estado, "
    "duracion_seg=EXCLUDED.duracion_seg, error=EXCLUDED.error, actualizado=now()"
)


class Repositorio(Protocol):
    def tomar(self, tipos: list[str]) -> dict[str, Any] | None: ...
    def reiniciar_atascados(self, minutos: int) -> int: ...
    def marcar_hecho(self, trabajo_id: Any) -> None: ...
    def marcar_fallo(self, trabajo_id: Any, mensaje: str, definitivo: bool) -> None: ...
    def latido(self, trabajo_id: Any) -> None: ...
    def archivo_procesando(self, archivo_id: str) -> None: ...
    def archivo_listo(
        self,
        archivo_id: str,
        metadatos: dict[str, Any],
        n_capitulos: int,
        n_palabras: int,
        minutos: int,
        tiene_portada: bool,
        version_texto: int,
    ) -> None: ...
    def archivo_estado(self, archivo_id: str, estado: str, error: str | None) -> None: ...
    def audio_estado(
        self,
        archivo_id: str,
        voz_id: str,
        capitulo: int,
        estado: str,
        duracion: float | None = None,
        error: str | None = None,
    ) -> None: ...
    def cerrar(self) -> None: ...


class RepositorioPg:
    """Implementación con psycopg 3. Una conexión por hilo, autocommit (cada sentencia es atómica)."""

    def __init__(self, url: str):
        self.url = url
        self._con: Any = None

    def _conexion(self) -> Any:
        import psycopg
        from psycopg.rows import dict_row

        if self._con is None or self._con.closed:
            self._con = psycopg.connect(self.url, autocommit=True, row_factory=dict_row, connect_timeout=10)
        return self._con

    def _ejecutar(self, sql: str, params: dict[str, Any], devolver: bool = False) -> Any:
        try:
            with self._conexion().cursor() as cur:
                cur.execute(sql, params)
                if devolver:
                    return cur.fetchone()
                return cur.rowcount
        except Exception:
            # conexión rota: se descarta para reconectar en la próxima llamada
            if self._con is not None and (self._con.closed or self._con.broken):
                self._con = None
            raise

    def tomar(self, tipos: list[str]) -> dict[str, Any] | None:
        fila: dict[str, Any] | None = self._ejecutar(SQL_TOMAR, {"tipos": list(tipos)}, devolver=True)
        return fila

    def reiniciar_atascados(self, minutos: int) -> int:
        return int(self._ejecutar(SQL_REINICIAR_ATASCADOS, {"minutos": minutos}))

    def marcar_hecho(self, trabajo_id: Any) -> None:
        self._ejecutar(SQL_HECHO, {"id": trabajo_id})

    def marcar_fallo(self, trabajo_id: Any, mensaje: str, definitivo: bool) -> None:
        self._ejecutar(
            SQL_FALLO, {"id": trabajo_id, "estado": "ERROR" if definitivo else "PENDIENTE", "error": mensaje[:4000]}
        )

    def latido(self, trabajo_id: Any) -> None:
        self._ejecutar(SQL_LATIDO, {"id": trabajo_id})

    def archivo_procesando(self, archivo_id: str) -> None:
        self._ejecutar(SQL_ARCHIVO_PROCESANDO, {"id": archivo_id})

    def archivo_listo(
        self,
        archivo_id: str,
        metadatos: dict[str, Any],
        n_capitulos: int,
        n_palabras: int,
        minutos: int,
        tiene_portada: bool,
        version_texto: int,
    ) -> None:
        self._ejecutar(
            SQL_ARCHIVO_LISTO,
            {
                "id": archivo_id,
                "version": version_texto,
                "n_capitulos": n_capitulos,
                "n_palabras": n_palabras,
                "minutos": minutos,
                "metadatos": json.dumps(metadatos, ensure_ascii=False),
                "portada": tiene_portada,
            },
        )

    def archivo_estado(self, archivo_id: str, estado: str, error: str | None) -> None:
        self._ejecutar(
            SQL_ARCHIVO_ESTADO, {"id": archivo_id, "estado": estado, "error": error[:4000] if error else None}
        )

    def audio_estado(
        self,
        archivo_id: str,
        voz_id: str,
        capitulo: int,
        estado: str,
        duracion: float | None = None,
        error: str | None = None,
    ) -> None:
        self._ejecutar(
            SQL_AUDIO_UPSERT,
            {
                "archivo": archivo_id,
                "voz": voz_id,
                "capitulo": capitulo,
                "estado": estado,
                "duracion": duracion,
                "error": error[:4000] if error else None,
            },
        )

    def cerrar(self) -> None:
        if self._con is not None:
            try:
                self._con.close()
            except Exception:
                log.warning("No se pudo cerrar la conexión a PostgreSQL", exc_info=True)
            self._con = None

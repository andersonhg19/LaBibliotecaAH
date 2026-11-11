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
# Devuelve a PENDIENTE los trabajos EN_CURSO de los tipos del taller sin latido desde hace `segundos` (0 = todos,
# al arrancar: con un único taller por base de datos, lo que estaba EN_CURSO murió con el proceso anterior, QA
# DA-01). También deja en PENDIENTE el archivo (PROCESANDO) o el audio (GENERANDO) de esos trabajos, para que nadie
# los tome por vivos.
SQL_REINICIAR_ATASCADOS = (
    "WITH r AS (UPDATE bah_lib_trabajo SET estado='PENDIENTE', actualizado=now() "
    "WHERE estado='EN_CURSO' AND tipo = ANY(%(tipos)s) "
    "AND actualizado <= now() - make_interval(secs => %(segundos)s) RETURNING id, tipo, archivo_id, payload), "
    "a AS (UPDATE bah_lib_archivo f SET estado_conversion='PENDIENTE', actualizado=now() FROM r "
    "WHERE r.tipo='CONVERTIR' AND f.id=r.archivo_id AND f.estado_conversion='PROCESANDO' RETURNING 1), "
    "v AS (UPDATE bah_lib_audio au SET estado='PENDIENTE', actualizado=now() FROM r "
    "WHERE r.tipo='VOZ_CAPITULO' AND au.archivo_id=r.archivo_id AND au.voz_id=r.payload->>'vozId' "
    "AND au.capitulo=(r.payload->>'capitulo')::int AND au.estado='GENERANDO' RETURNING 1) "
    "SELECT count(*) AS n FROM r"
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
# Solo si el archivo sigue existiendo: un libro retirado no deja filas de audio huérfanas (QA DA-28).
SQL_AUDIO_UPSERT = (
    "INSERT INTO bah_lib_audio (archivo_id, voz_id, capitulo, estado, duracion_seg, error, actualizado) "
    "SELECT %(archivo)s::uuid, %(voz)s, %(capitulo)s, %(estado)s, %(duracion)s, %(error)s, now() "
    "WHERE EXISTS (SELECT 1 FROM bah_lib_archivo WHERE id = %(archivo)s::uuid) "
    "ON CONFLICT (archivo_id, voz_id, capitulo) DO UPDATE SET estado=EXCLUDED.estado, "
    "duracion_seg=EXCLUDED.duracion_seg, error=EXCLUDED.error, actualizado=now()"
)


class Repositorio(Protocol):
    def tomar(self, tipos: list[str]) -> dict[str, Any] | None: ...
    def reiniciar_atascados(self, segundos: int, tipos: list[str]) -> int: ...
    def marcar_hecho(self, trabajo_id: Any) -> None: ...
    def marcar_fallo(self, trabajo_id: Any, mensaje: str, definitivo: bool) -> None: ...
    def latido(self, trabajo_id: Any) -> None: ...
    def archivo_procesando(self, archivo_id: str) -> bool: ...
    def archivo_listo(
        self,
        archivo_id: str,
        metadatos: dict[str, Any],
        n_capitulos: int,
        n_palabras: int,
        minutos: int,
        tiene_portada: bool,
        version_texto: int,
    ) -> bool: ...
    def archivo_estado(self, archivo_id: str, estado: str, error: str | None) -> None: ...
    def audio_estado(
        self,
        archivo_id: str,
        voz_id: str,
        capitulo: int,
        estado: str,
        duracion: float | None = None,
        error: str | None = None,
    ) -> bool: ...
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

    def _filas(self, sql: str, params: dict[str, Any]) -> bool:
        return int(self._ejecutar(sql, params)) > 0

    def tomar(self, tipos: list[str]) -> dict[str, Any] | None:
        fila: dict[str, Any] | None = self._ejecutar(SQL_TOMAR, {"tipos": list(tipos)}, devolver=True)
        return fila

    def reiniciar_atascados(self, segundos: int, tipos: list[str]) -> int:
        fila = self._ejecutar(SQL_REINICIAR_ATASCADOS, {"segundos": segundos, "tipos": list(tipos)}, devolver=True)
        return int(fila["n"]) if fila else 0

    def marcar_hecho(self, trabajo_id: Any) -> None:
        self._ejecutar(SQL_HECHO, {"id": trabajo_id})

    def marcar_fallo(self, trabajo_id: Any, mensaje: str, definitivo: bool) -> None:
        self._ejecutar(
            SQL_FALLO, {"id": trabajo_id, "estado": "ERROR" if definitivo else "PENDIENTE", "error": mensaje[:4000]}
        )

    def latido(self, trabajo_id: Any) -> None:
        self._ejecutar(SQL_LATIDO, {"id": trabajo_id})

    def archivo_procesando(self, archivo_id: str) -> bool:
        """False si el archivo ya no existe (se retiró antes de empezar)."""
        return int(self._ejecutar(SQL_ARCHIVO_PROCESANDO, {"id": archivo_id})) > 0

    def archivo_listo(
        self,
        archivo_id: str,
        metadatos: dict[str, Any],
        n_capitulos: int,
        n_palabras: int,
        minutos: int,
        tiene_portada: bool,
        version_texto: int,
    ) -> bool:
        """False si el archivo ya no existe (se retiró durante la conversión)."""
        return self._filas(
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
    ) -> bool:
        """False si el archivo ya no existe (no se crea la fila)."""
        return self._filas(
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

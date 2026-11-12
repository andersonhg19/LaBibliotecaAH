-- ============================================================================
-- V5 — Carpetas del archivador de documentos (contratos v1.6)
-- ============================================================================
--
-- Cada usuario ordena sus documentos personales (ejemplares tipo DOCUMENTO) en
-- carpetas y subcarpetas, como en un archivador. Una carpeta es SOLO de su
-- usuario (aislamiento como el resto: toda consulta filtra por usuario_id).
--
--  · padre_id NULL = carpeta en la raiz del archivador.
--  · Unicidad de negocio: dos carpetas hermanas no se llaman igual (sin
--    distinguir mayusculas); tambien se comprueba en el servicio (101).
--  · Borrar una carpeta borra su subarbol (ON DELETE CASCADE). El servicio
--    decide antes que pasa con lo de dentro (subirlo a la carpeta de arriba o
--    retirarlo); un documento retirado que conserva una carpeta ya borrada
--    vuelve a la raiz (ON DELETE SET NULL).
--  · Los libros y deseos nunca tienen carpeta (CHECK).
-- ============================================================================

CREATE TABLE bah_lib_carpeta (
    id             UUID PRIMARY KEY,
    usuario_id     BIGINT       NOT NULL,
    padre_id       UUID         REFERENCES bah_lib_carpeta (id) ON DELETE CASCADE,
    nombre         VARCHAR(100) NOT NULL,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT,
    CONSTRAINT ck_carpeta_no_es_su_padre CHECK (padre_id IS NULL OR padre_id <> id)
);

CREATE INDEX ix_bah_lib_carpeta_usuario ON bah_lib_carpeta (usuario_id, padre_id);
CREATE UNIQUE INDEX ux_bah_lib_carpeta_nombre ON bah_lib_carpeta
    (usuario_id, COALESCE(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));

ALTER TABLE bah_lib_ejemplar ADD COLUMN carpeta_id UUID REFERENCES bah_lib_carpeta (id) ON DELETE SET NULL;
ALTER TABLE bah_lib_ejemplar ADD CONSTRAINT ck_ejemplar_carpeta_solo_documentos
    CHECK (carpeta_id IS NULL OR tipo = 'DOCUMENTO');
CREATE INDEX ix_bah_lib_ejemplar_carpeta ON bah_lib_ejemplar (usuario_id, carpeta_id) WHERE tipo = 'DOCUMENTO';

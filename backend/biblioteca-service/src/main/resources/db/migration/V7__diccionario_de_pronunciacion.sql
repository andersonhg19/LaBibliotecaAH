-- ============================================================================
-- V7 — Diccionario de pronunciacion por libro (B17, arreglos 0.4.0 ronda 3)
-- ============================================================================
--
-- SOLO ADITIVA: una tabla nueva; nada existente cambia.
--
-- bah_lib_pronunciacion: como debe decir la voz una palabra de un LIBRO
--   ("Hermione" -> "Jermayoni"). Es por ARCHIVO y no por usuario porque el
--   audio se comparte por archivo y voz (bah_lib_audio): dos personas con el
--   mismo libro oyen el mismo audio. Lo edita el dueno de cualquier ejemplar
--   de ese archivo. biblioteca-service lo manda en el payload de cada
--   VOZ_CAPITULO ("pronunciacion": [{"de", "a"}]) y, al cambiarlo, encola la
--   regeneracion de los capitulos LISTO que contienen alguna palabra cambiada
--   (el audio viejo sigue sonando hasta que el nuevo esta LISTO).
--   La palabra no distingue mayusculas (indice unico sobre lower(de)).
-- ============================================================================

CREATE TABLE bah_lib_pronunciacion (
    archivo_id  UUID         NOT NULL REFERENCES bah_lib_archivo (id) ON DELETE CASCADE,
    de          VARCHAR(80)  NOT NULL,
    a           VARCHAR(120) NOT NULL,
    usuario_id  BIGINT       NOT NULL,
    creation    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (archivo_id, de),
    CONSTRAINT ck_pronunciacion_de CHECK (length(btrim(de)) > 0),
    CONSTRAINT ck_pronunciacion_a CHECK (length(btrim(a)) > 0)
);

CREATE UNIQUE INDEX ux_bah_lib_pronunciacion_palabra ON bah_lib_pronunciacion (archivo_id, lower(de));

-- ============================================================================
-- V2 — Retirar un libro conserva lo que el usuario escribio (QA BI-01)
-- ============================================================================
--
-- Antes, "Retirar de la biblioteca" borraba el ejemplar y, por ON DELETE
-- CASCADE, su progreso, anotaciones, diario, calificacion, estantes y favorito.
-- Ahora el ejemplar se RETIRA (borrado logico): deja de verse en todas partes,
-- suelta el archivo (archivo_id = NULL, para que el fichero se borre si nadie
-- mas lo usa) y guarda el sha256 del archivo. Si el mismo usuario vuelve a
-- subir el mismo fichero, el ejemplar retirado reaparece con todo lo suyo.
--
-- Los deseos (sin archivo) se siguen borrando de verdad: no hay nada con que
-- volver a encontrarlos.
-- ============================================================================

ALTER TABLE bah_lib_ejemplar ADD COLUMN retirado_en TIMESTAMPTZ;
ALTER TABLE bah_lib_ejemplar ADD COLUMN archivo_sha256 VARCHAR(64);

-- Los ejemplares que ya existen guardan ya el sha256 de su archivo.
UPDATE bah_lib_ejemplar e
SET archivo_sha256 = a.sha256
FROM bah_lib_archivo a
WHERE a.id = e.archivo_id;

-- Un retirado no puede seguir agarrado a un archivo.
ALTER TABLE bah_lib_ejemplar ADD CONSTRAINT ck_ejemplar_retirado_sin_archivo
    CHECK (retirado_en IS NULL OR archivo_id IS NULL);

-- Buscar el retirado de un usuario por el sha256 al volver a subirlo.
CREATE INDEX ix_bah_lib_ejemplar_retirado ON bah_lib_ejemplar (usuario_id, archivo_sha256)
    WHERE retirado_en IS NOT NULL;

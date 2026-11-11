-- ============================================================================
-- V3 — Cache de traducciones de textos sueltos (contratos v1.3, POST /v1/traducir)
-- ============================================================================
--
-- La web traduce una frase o un parrafo seleccionado. La misma seleccion se
-- repite a menudo (volver a abrir el libro, los dos usuarios con el mismo
-- libro): se guarda el resultado y no se vuelve a pedir al traductor.
--
-- La clave es el sha256 de "origen|destino|texto": no depende del usuario (el
-- texto sale de un libro, no es un dato personal de nadie) y nunca se guarda
-- quien lo pidio. Los capitulos enteros NO van aqui: se guardan como fichero
-- junto al libro (/datos/normalizados/{archivoId}/traducciones/{destino}/).
-- ============================================================================

CREATE TABLE bah_lib_traduccion (
    hash              VARCHAR(64)  PRIMARY KEY,
    origen            VARCHAR(10)  NOT NULL,
    destino           VARCHAR(10)  NOT NULL,
    traduccion        TEXT         NOT NULL,
    origen_detectado  VARCHAR(10),
    creado            TIMESTAMP    NOT NULL DEFAULT now(),
    usado             TIMESTAMP    NOT NULL DEFAULT now()
);

-- Para purgar lo que lleva mucho sin usarse (TareaLimpieza).
CREATE INDEX ix_bah_lib_traduccion_usado ON bah_lib_traduccion (usado);

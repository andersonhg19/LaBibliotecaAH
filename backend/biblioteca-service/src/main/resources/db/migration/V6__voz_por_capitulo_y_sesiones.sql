-- ============================================================================
-- V6 — Capitulos en voz por usuario y sesiones de lectura (contratos v1.7 / 0.4.0)
-- ============================================================================
--
-- SOLO ADITIVA: dos tablas nuevas; nada existente cambia.
--
-- bah_lib_capitulo_voz (C3): que capitulos quiere cada usuario oir en voz en
--   cada ejemplar. Sin fila = lo que diga estructura.json (enVoz, o true en los
--   libros convertidos antes de la v2). Solo guarda lo que el usuario cambio.
--
-- bah_lib_sesion (C4): tiempo de lectura y escucha. El cliente manda un latido
--   cada minuto con su sesionId (uuid que genera el); cada latido crea la fila o
--   la alarga (segundos acumulados, fin, capitulo y posicion finales). De aqui
--   salen los minutos por dia y las rachas (zona America/Bogota).
-- ============================================================================

CREATE TABLE bah_lib_capitulo_voz (
    usuario_id  BIGINT      NOT NULL,
    ejemplar_id UUID        NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    indice      INT         NOT NULL,
    en_voz      BOOLEAN     NOT NULL,
    creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_update TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, ejemplar_id, indice),
    CONSTRAINT ck_capitulo_voz_indice CHECK (indice >= 0)
);

CREATE TABLE bah_lib_sesion (
    id              UUID PRIMARY KEY,
    usuario_id      BIGINT        NOT NULL,
    ejemplar_id     UUID          NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    modo            VARCHAR(10)   NOT NULL,
    inicio          TIMESTAMPTZ   NOT NULL,
    fin             TIMESTAMPTZ   NOT NULL,
    segundos        INT           NOT NULL DEFAULT 0,
    capitulo_inicio INT,
    capitulo_fin    INT,
    posicion_fin    NUMERIC(14,4),
    palabras        INT,
    dispositivo     VARCHAR(40),
    creation        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    last_update     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_sesion_modo CHECK (modo IN ('LECTURA', 'VOZ')),
    CONSTRAINT ck_sesion_segundos CHECK (segundos >= 0)
);

CREATE INDEX ix_bah_lib_sesion_usuario_inicio ON bah_lib_sesion (usuario_id, inicio);

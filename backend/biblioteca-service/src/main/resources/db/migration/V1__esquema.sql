-- ============================================================================
-- V1 — Esquema de biblioteca-service (La Biblioteca AH)
-- ============================================================================
--
-- SOLO PostgreSQL (JSONB, text[], indices parciales). Las pruebas corren contra
-- un PostgreSQL de verdad con Testcontainers, no contra H2.
--
-- MODELO
--  · archivo: el fichero fisico, deduplicado por sha256. Lo comparten los
--    usuarios que subieron el mismo fichero. El taller (Python) actualiza sus
--    columnas de conversion (contratos.md §7).
--  · obra: los datos bibliograficos. Hay UNA obra por ejemplar: si Samy corrige
--    el titulo de su copia, la de Anderson no cambia.
--  · ejemplar: el libro en la biblioteca de un usuario (o un deseo sin archivo).
--  · estante / estante_item: colecciones y el estante de sistema FAVORITOS,
--    con orden fraccional para reordenar sin reescribir todo.
--  · progreso: uno por (usuario, ejemplar); gana el actualizado_en mas reciente.
--  · anotacion / comentario: del usuario sobre su ejemplar.
--  · trabajo / audio: cola y estado del audio, con el DDL EXACTO del contrato.
--  · Auditoria (estandares §18): creation, last_update, id_modified_by en las
--    tablas del dominio. archivo, trabajo y audio conservan las columnas del
--    contrato porque tambien las escribe el taller.
-- ============================================================================

CREATE TABLE bah_lib_archivo (
    id                  UUID PRIMARY KEY,
    sha256              VARCHAR(64)  NOT NULL UNIQUE,
    formato_original    VARCHAR(10)  NOT NULL,
    ruta_original       TEXT         NOT NULL,
    nombre_original     VARCHAR(500) NOT NULL,
    tamano              BIGINT       NOT NULL,
    estado_conversion   VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
    error_conversion    TEXT,
    version_texto       INT,
    n_capitulos         INT,
    n_palabras          INT,
    minutos_estimados   INT,
    metadatos           JSONB,
    tiene_portada       BOOLEAN      NOT NULL DEFAULT FALSE,
    metadatos_aplicados BOOLEAN      NOT NULL DEFAULT FALSE,
    creado              TIMESTAMP    NOT NULL DEFAULT now(),
    actualizado         TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX ix_bah_lib_archivo_listo ON bah_lib_archivo (estado_conversion) WHERE metadatos_aplicados = FALSE;

CREATE TABLE bah_lib_obra (
    id               UUID PRIMARY KEY,
    titulo           VARCHAR(500) NOT NULL,
    subtitulo        VARCHAR(500),
    autores          TEXT[]       NOT NULL DEFAULT '{}',
    anio             INT,
    editorial        VARCHAR(300),
    idioma           VARCHAR(20),
    isbn             VARCHAR(20),
    sinopsis         TEXT,
    generos          TEXT[]       NOT NULL DEFAULT '{}',
    fuente_metadatos VARCHAR(20)  NOT NULL,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT
);

CREATE TABLE bah_lib_ejemplar (
    id              UUID PRIMARY KEY,
    usuario_id      BIGINT       NOT NULL,
    obra_id         UUID         NOT NULL REFERENCES bah_lib_obra (id),
    archivo_id      UUID         REFERENCES bah_lib_archivo (id),
    tipo            VARCHAR(20)  NOT NULL,
    estado          VARCHAR(20)  NOT NULL,
    calificacion    NUMERIC(2,1),
    fecha_llegada   TIMESTAMPTZ  NOT NULL,
    ultima_apertura TIMESTAMPTZ,
    fecha_inicio    TIMESTAMPTZ,
    fecha_fin       TIMESTAMPTZ,
    veces_leido     INT          NOT NULL DEFAULT 0,
    etiquetas       TEXT[]       NOT NULL DEFAULT '{}',
    nota            TEXT,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT,
    CONSTRAINT ck_ejemplar_calificacion CHECK (calificacion IS NULL OR (calificacion >= 0.5 AND calificacion <= 5)),
    CONSTRAINT ck_ejemplar_deseo_sin_archivo CHECK (tipo <> 'DESEO' OR archivo_id IS NULL)
);

CREATE INDEX ix_bah_lib_ejemplar_usuario ON bah_lib_ejemplar (usuario_id, fecha_llegada DESC);
CREATE INDEX ix_bah_lib_ejemplar_archivo ON bah_lib_ejemplar (archivo_id);
-- Un usuario no tiene dos ejemplares del mismo archivo.
CREATE UNIQUE INDEX ux_bah_lib_ejemplar_usuario_archivo ON bah_lib_ejemplar (usuario_id, archivo_id) WHERE archivo_id IS NOT NULL;

CREATE TABLE bah_lib_estante (
    id           UUID PRIMARY KEY,
    usuario_id   BIGINT       NOT NULL,
    nombre       VARCHAR(100) NOT NULL,
    tipo         VARCHAR(20)  NOT NULL,
    color_madera VARCHAR(30),
    orden        INT          NOT NULL DEFAULT 0,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT
);

CREATE INDEX ix_bah_lib_estante_usuario ON bah_lib_estante (usuario_id);
-- Unicidad de negocio: un usuario no repite nombre de estante (tambien se
-- comprueba en el servicio para dar un mensaje claro).
CREATE UNIQUE INDEX ux_bah_lib_estante_nombre ON bah_lib_estante (usuario_id, lower(nombre));
-- Un solo estante FAVORITOS por usuario.
CREATE UNIQUE INDEX ux_bah_lib_estante_favoritos ON bah_lib_estante (usuario_id) WHERE tipo = 'FAVORITOS';

CREATE TABLE bah_lib_estante_item (
    estante_id  UUID             NOT NULL REFERENCES bah_lib_estante (id) ON DELETE CASCADE,
    ejemplar_id UUID             NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    orden       DOUBLE PRECISION NOT NULL,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT,
    PRIMARY KEY (estante_id, ejemplar_id)
);

CREATE INDEX ix_bah_lib_estante_item_orden ON bah_lib_estante_item (estante_id, orden);

CREATE TABLE bah_lib_progreso (
    id                 UUID PRIMARY KEY,
    usuario_id         BIGINT           NOT NULL,
    ejemplar_id        UUID             NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    capitulo           INT              NOT NULL DEFAULT 0,
    frase_id           VARCHAR(20),
    cfi                TEXT,
    posicion_audio_seg DOUBLE PRECISION,
    voz_id             VARCHAR(80),
    velocidad          DOUBLE PRECISION,
    porcentaje         DOUBLE PRECISION NOT NULL DEFAULT 0,
    modo               VARCHAR(10)      NOT NULL DEFAULT 'VISTA',
    dispositivo        VARCHAR(100),
    actualizado_en     TIMESTAMPTZ      NOT NULL,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT,
    CONSTRAINT uk_bah_lib_progreso UNIQUE (usuario_id, ejemplar_id)
);

CREATE TABLE bah_lib_anotacion (
    id             UUID PRIMARY KEY,
    usuario_id     BIGINT      NOT NULL,
    ejemplar_id    UUID        NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    tipo           VARCHAR(20) NOT NULL,
    color          VARCHAR(30),
    cfi            TEXT,
    frase_inicio   VARCHAR(20),
    offset_inicio  INT,
    frase_fin      VARCHAR(20),
    offset_fin     INT,
    version_texto  INT,
    texto_citado   TEXT,
    prefijo        TEXT,
    sufijo         TEXT,
    nota           TEXT,
    capitulo       INT,
    editado        TIMESTAMPTZ,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT
);

CREATE INDEX ix_bah_lib_anotacion_ejemplar ON bah_lib_anotacion (ejemplar_id);

CREATE TABLE bah_lib_comentario (
    id          UUID PRIMARY KEY,
    usuario_id  BIGINT      NOT NULL,
    ejemplar_id UUID        NOT NULL REFERENCES bah_lib_ejemplar (id) ON DELETE CASCADE,
    texto       TEXT        NOT NULL,
    creation       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_update    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    id_modified_by BIGINT
);

CREATE INDEX ix_bah_lib_comentario_ejemplar ON bah_lib_comentario (ejemplar_id);

-- Registro de cambios del dominio (estandares §21): lo escribe un listener
-- asincrono despues del commit; si falla, la operacion ya quedo hecha.
CREATE TABLE bah_lib_cambio (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    entidad    VARCHAR(40)  NOT NULL,
    entidad_id VARCHAR(40)  NOT NULL,
    accion     VARCHAR(20)  NOT NULL,
    usuario_id BIGINT,
    detalle    VARCHAR(1000),
    ocurrido   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_bah_lib_cambio_entidad ON bah_lib_cambio (entidad, entidad_id);

-- Cola de trabajos: DDL exacto de contratos.md §7.
CREATE TABLE bah_lib_trabajo (
  id            UUID PRIMARY KEY,
  tipo          VARCHAR(30)  NOT NULL,
  archivo_id    UUID         NOT NULL,
  payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  estado        VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
  prioridad     INT          NOT NULL DEFAULT 100,
  intentos      INT          NOT NULL DEFAULT 0,
  error         TEXT,
  creado        TIMESTAMP    NOT NULL DEFAULT now(),
  actualizado   TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX ix_bah_lib_trabajo_cola ON bah_lib_trabajo (estado, prioridad, creado);

-- Audio por capitulo: DDL exacto de contratos.md §7.
CREATE TABLE bah_lib_audio (
  archivo_id UUID NOT NULL, voz_id VARCHAR(80) NOT NULL, capitulo INT NOT NULL,
  estado VARCHAR(20) NOT NULL,
  duracion_seg NUMERIC(10,2), error TEXT, actualizado TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (archivo_id, voz_id, capitulo)
);

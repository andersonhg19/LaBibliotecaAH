-- ============================================================================
-- V8 — Diario del reproductor (contrato C9, 0.5.0)
-- ============================================================================
--
-- SOLO ADITIVA: una tabla nueva y sus indices; nada existente cambia.
--
-- bah_lib_diario: telemetria propia del reproductor de la web (atascos, pausas
--   del sistema, errores de audio o de red...). Nunca sale de casa. La escribe
--   POST /v1/diario con el usuario del token (nunca del cuerpo); como el resto
--   de tablas del usuario, sin RLS: el aislamiento es la columna usuario_id que
--   pone el servicio. ejemplar_id NO es clave foranea a proposito: es
--   telemetria, un ejemplar ajeno o inexistente se guarda como null y un libro
--   borrado no debe arrastrar ni bloquear su diario (se va solo a los 30 dias).
--
-- Retencion: TareaDiario borra cada dia lo creado hace mas de 30 dias (por
--   creado_en, la hora del servidor: un reloj de movil mal puesto no lo salva
--   ni lo condena). De ahi el segundo indice.
-- ============================================================================

CREATE TABLE bah_lib_diario (
    id          UUID PRIMARY KEY,
    usuario_id  BIGINT           NOT NULL,
    ejemplar_id UUID,
    cuando      TIMESTAMPTZ      NOT NULL,
    tipo        VARCHAR(40)      NOT NULL,
    capitulo    INT,
    posicion    DOUBLE PRECISION,
    detalle     VARCHAR(500),
    contexto    JSONB,
    creado_en   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX ix_bah_lib_diario_usuario_cuando ON bah_lib_diario (usuario_id, cuando);
CREATE INDEX ix_bah_lib_diario_creado_en ON bah_lib_diario (creado_en);

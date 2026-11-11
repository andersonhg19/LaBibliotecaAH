-- ============================================================================
-- V4 — Version de sesion por cuenta (QA SE-02)
-- ============================================================================
--
-- Cada token lleva el claim "ver" con la version de sesion de la cuenta en el
-- momento de emitirlo. auth-service la sube (+1) al desactivar o reactivar la
-- cuenta, al cambiarle los roles y al cambiar la contrasena; desde ese momento
-- los tokens anteriores dejan de valer en auth-service (al instante) y en
-- biblioteca-service (en cuanto caduca su cache corta, ver contratos.md §9).
--
-- Las cuentas existentes empiezan en 0, igual que los tokens ya emitidos que
-- no traen el claim: nadie pierde la sesion por desplegar esto.
--
-- Sintaxis valida en PostgreSQL y en H2 (las pruebas corren sobre los dos).
-- ============================================================================

ALTER TABLE bah_auth_user ADD COLUMN version_sesion INT DEFAULT 0 NOT NULL;

-- ============================================================================
-- V6 — Nombres visibles con tildes (QA UX-14)
-- ============================================================================
--
-- La semilla (V2) escribio sin tildes los textos que la web muestra tal cual:
-- el menu de administracion ("Modulos", "Auditoria"), el modulo
-- "Administracion" y las descripciones de un rol y de un ajuste. V2 no se
-- toca (Flyway valida su checksum): aqui se corrigen los NOMBRES VISIBLES.
--
-- No cambian codigos (code), rutas (route) ni claves (config_key, name del
-- rol): la web y ElMenuLlevaAPantallasQueExistenTest dependen de ellas.
-- Cada UPDATE solo toca la fila si conserva el texto de la semilla: si un
-- administrador ya lo cambio a mano, se respeta.
--
-- Sintaxis valida tal cual en PostgreSQL y en H2.
-- ============================================================================

UPDATE bah_auth_module SET name = 'Administración', updated_at = CURRENT_TIMESTAMP
WHERE code = 'administracion' AND name = 'Administracion';

UPDATE bah_auth_page SET name = 'Módulos', updated_at = CURRENT_TIMESTAMP
WHERE code = 'admin-modulos' AND name = 'Modulos';

UPDATE bah_auth_page SET name = 'Auditoría', updated_at = CURRENT_TIMESTAMP
WHERE code = 'admin-auditoria' AND name = 'Auditoria';

UPDATE bah_auth_role SET description = 'Administra usuarios, roles y módulos de la plataforma',
                         updated_at = CURRENT_TIMESTAMP
WHERE name = 'ADMIN' AND description = 'Administra usuarios, roles y modulos de la plataforma';

UPDATE bah_auth_app_config SET description = 'Cómo se muestran fechas y números', updated_at = CURRENT_TIMESTAMP
WHERE config_key = 'app.locale' AND description = 'Como se muestran fechas y numeros';

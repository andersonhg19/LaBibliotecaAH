-- ============================================================================
-- V2 — Semilla: roles, modulos, paginas, permisos y ajustes de la instalacion
-- ============================================================================
--
-- Las CUENTAS no se siembran aqui: las crea LoadData al arrancar, con las
-- contrasenas que llegan por variables de entorno (SEED_*_PASSWORD). Una
-- contrasena en una migracion queda en el repositorio para siempre.
--
-- Las paginas llevan el nombre de ruta EXACTO de la pantalla de la web
-- (ElMenuLlevaAPantallasQueExistenTest compara esta lista con el navegador del
-- frontend cuando lo encuentra). Una linea SELECT por pagina, a proposito: esa
-- prueba lee este fichero linea a linea.
--
-- Sintaxis valida tal cual en PostgreSQL y en H2.
-- ============================================================================

INSERT INTO bah_auth_role (name, description, active, created_at, updated_at)
VALUES ('ADMIN', 'Administra usuarios, roles y modulos de la plataforma', TRUE,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO bah_auth_role (name, description, active, created_at, updated_at)
VALUES ('USER', 'Usa la biblioteca con sus propios libros', TRUE,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO bah_auth_module (code, name, icon, sort_order, active, created_at, updated_at) VALUES
    ('biblioteca', 'Biblioteca', 'book', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('administracion', 'Administracion', 'shield', 9, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO bah_auth_page (module_id, code, name, route, icon, in_menu, sort_order, active, created_at, updated_at)
SELECT m.id, p.code, p.name, p.route, p.icon, p.in_menu, p.sort_order, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM bah_auth_module m
JOIN (
    SELECT 'biblioteca' AS modulo, 'biblioteca' AS code, 'Biblioteca' AS name, 'Biblioteca' AS route, 'book' AS icon, TRUE AS in_menu, 1 AS sort_order UNION ALL
    SELECT 'biblioteca', 'documentos', 'Documentos', 'Documentos', 'folder', TRUE, 2 UNION ALL
    SELECT 'biblioteca', 'notas', 'Notas', 'Notas', 'edit-3', TRUE, 3 UNION ALL
    SELECT 'biblioteca', 'ajustes', 'Ajustes', 'Ajustes', 'settings', TRUE, 4 UNION ALL
    SELECT 'biblioteca', 'libro', 'Libro', 'Libro', 'info', FALSE, 10 UNION ALL
    SELECT 'biblioteca', 'lector', 'Leer', 'Leer', 'book-open', FALSE, 11 UNION ALL
    SELECT 'biblioteca', 'reproductor', 'Escuchar', 'Escuchar', 'headphones', FALSE, 12 UNION ALL
    SELECT 'administracion', 'admin-usuarios', 'Usuarios', 'AdminUsers', 'users', TRUE, 1 UNION ALL
    SELECT 'administracion', 'admin-roles', 'Roles', 'AdminRoles', 'key', TRUE, 2 UNION ALL
    SELECT 'administracion', 'admin-modulos', 'Modulos', 'AdminModules', 'grid', TRUE, 3 UNION ALL
    SELECT 'administracion', 'admin-auditoria', 'Auditoria', 'AdminAudit', 'file-text', TRUE, 4
) p ON p.modulo = m.code;

-- USER y ADMIN usan la biblioteca con todos los permisos.
INSERT INTO bah_auth_role_permission (role_id, page_id, can_read, can_create, can_update, can_delete, active, created_at, updated_at)
SELECT r.id, pg.id, TRUE, TRUE, TRUE, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM bah_auth_role r
CROSS JOIN bah_auth_page pg
JOIN bah_auth_module m ON m.id = pg.module_id
WHERE r.name IN ('USER', 'ADMIN')
  AND m.code = 'biblioteca';

-- Solo ADMIN administra. La auditoria es de solo lectura: una linea de
-- auditoria que se puede editar o borrar desde la aplicacion no prueba nada.
INSERT INTO bah_auth_role_permission (role_id, page_id, can_read, can_create, can_update, can_delete, active, created_at, updated_at)
SELECT r.id, pg.id, TRUE, TRUE, TRUE, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM bah_auth_role r
CROSS JOIN bah_auth_page pg
JOIN bah_auth_module m ON m.id = pg.module_id
WHERE r.name = 'ADMIN'
  AND m.code = 'administracion'
  AND pg.code <> 'admin-auditoria';

INSERT INTO bah_auth_role_permission (role_id, page_id, can_read, can_create, can_update, can_delete, active, created_at, updated_at)
SELECT r.id, p.id, TRUE, FALSE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM bah_auth_role r
CROSS JOIN bah_auth_page p
WHERE r.name = 'ADMIN'
  AND p.code = 'admin-auditoria';

INSERT INTO bah_auth_app_config (config_key, config_value, description, active, created_at, updated_at) VALUES
    ('app.name', 'La Biblioteca AH', 'Nombre que ve el usuario', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('app.locale', 'es-CO', 'Como se muestran fechas y numeros', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

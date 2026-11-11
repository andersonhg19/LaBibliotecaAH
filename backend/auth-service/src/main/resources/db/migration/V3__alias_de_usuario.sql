-- ============================================================================
-- V3 — Alias de usuario: se puede entrar con el correo O con el alias
-- ============================================================================
--
-- El alias es un nombre corto (anderson, samy) que sirve para iniciar sesion
-- igual que el correo. Formato: 3 a 30 caracteres [a-z0-9._-], guardado en
-- minusculas y recortado, sin @ (asi un identificador con @ es siempre un
-- correo y uno sin @ es siempre un alias: el login no tiene que adivinar).
--
-- QUE HACE CON LAS CUENTAS QUE YA EXISTEN
--  1. Las tres cuentas de la semilla reciben su alias fijo: admin, anderson,
--     samy (por su correo EXACTO, el que pone LoadData).
--  2. Cualquier otra cuenta recibe un alias sacado de la parte local de su
--     correo: en minusculas, las tildes y la enie pasan a su letra base y los
--     simbolos que admite un correo (+ ! # $ % & * / = ? ^ ` { | } ~, espacio,
--     comillas) pasan a punto; se recorta a 30.
--  3. Si aun asi queda algo fuera del formato (letras de otros alfabetos, por
--     ejemplo), o queda vacio o solo con signos (".", "-", "_"), el alias pasa
--     a ser "usuario".
--  4. Si el alias queda corto (menos de 3) o ya lo tiene otra cuenta (una de
--     la semilla o una con id menor), se le anade "-{id}" recortando la base
--     para no pasar de 30. El id es unico, asi que el sufijo desambigua.
--  5. Solo entonces: NOT NULL, unico y la regla de formato en la base.
--
-- UNICO SIN DISTINGUIR MAYUSCULAS: la regla ck_usuario_alias_formato obliga a
-- que el alias este ya en minusculas y recortado, asi que la restriccion UNIQUE
-- sobre la columna equivale a un indice unico sobre LOWER(alias). Se hace asi
-- y no con CREATE UNIQUE INDEX ... (LOWER(alias)) porque esta migracion tambien
-- la ejecutan las pruebas sobre H2, que no tiene indices sobre expresiones.
--
-- SIN REGEXP_REPLACE(..., 'g'): PostgreSQL necesita la bandera 'g' para
-- reemplazar todas las apariciones y H2 la rechaza. Por eso el saneado va con
-- TRANSLATE (misma longitud en origen y destino: igual en los dos motores) y la
-- expresion regular solo se usa anclada (^...$), donde una sola coincidencia
-- es todo el texto y la bandera no importa.
--
-- NI CONTRASENAS NI HASHES AQUI: el repositorio es publico. Las cuentas y sus
-- claves las crea LoadData desde variables de entorno.
--
-- Sintaxis valida tal cual en PostgreSQL y en H2 (la prueba
-- LaMigracionDelAliasRellenaLasCuentasTest la corre sobre los dos).
-- ============================================================================

ALTER TABLE bah_auth_user ADD COLUMN alias VARCHAR(30);

-- 1. Las cuentas de la semilla.
UPDATE bah_auth_user SET alias = 'admin'    WHERE email = 'admin@biblioteca.ah';
UPDATE bah_auth_user SET alias = 'anderson' WHERE email = 'anderson@biblioteca.ah';
UPDATE bah_auth_user SET alias = 'samy'     WHERE email = 'samy@biblioteca.ah';

-- 2. Las demas: la parte local del correo, saneada.
UPDATE bah_auth_user
SET alias = LEFT(
        TRANSLATE(
            CASE WHEN POSITION('@' IN LOWER(TRIM(email))) > 1
                 THEN SUBSTRING(LOWER(TRIM(email)) FROM 1 FOR POSITION('@' IN LOWER(TRIM(email))) - 1)
                 ELSE LOWER(TRIM(email))
            END,
            'áàäâãéèëêíìïîóòöôõúùüûñç+!#$%&*/=?^`{|}~ ''"',
            'aaaaaeeeeiiiiooooouuuunc...................'),
        30)
WHERE alias IS NULL;

-- 3. Lo que no se pudo sanear.
UPDATE bah_auth_user
SET alias = 'usuario'
WHERE email NOT IN ('admin@biblioteca.ah', 'anderson@biblioteca.ah', 'samy@biblioteca.ah')
  AND (REGEXP_REPLACE(alias, '^[a-z0-9._-]+$', '') <> ''
       OR REGEXP_REPLACE(alias, '^[._-]*$', '') = '');

-- 4. Cortos o repetidos: sufijo con el id. Las cuentas de la semilla nunca
--    ceden su alias; entre las demas lo conserva la de id menor.
UPDATE bah_auth_user u
SET alias = CONCAT(
        LEFT(u.alias, 29 - CHAR_LENGTH(CAST(u.id AS VARCHAR(20)))),
        '-',
        CAST(u.id AS VARCHAR(20)))
WHERE u.email NOT IN ('admin@biblioteca.ah', 'anderson@biblioteca.ah', 'samy@biblioteca.ah')
  AND (CHAR_LENGTH(u.alias) < 3
       OR EXISTS (SELECT 1
                  FROM bah_auth_user o
                  WHERE o.alias = u.alias
                    AND o.id <> u.id
                    AND (o.id < u.id
                         OR o.email IN ('admin@biblioteca.ah', 'anderson@biblioteca.ah', 'samy@biblioteca.ah'))));

-- 5. Las reglas, ya con todos los alias puestos.
ALTER TABLE bah_auth_user ALTER COLUMN alias SET NOT NULL;

ALTER TABLE bah_auth_user ADD CONSTRAINT uk_usuario_alias UNIQUE (alias);

ALTER TABLE bah_auth_user ADD CONSTRAINT ck_usuario_alias_formato
    CHECK (alias = LOWER(TRIM(alias))
           AND CHAR_LENGTH(alias) >= 3
           AND POSITION('@' IN alias) = 0);

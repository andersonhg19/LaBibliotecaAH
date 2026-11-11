-- Crea las bases de La Biblioteca AH si no existen (idempotente).
-- Lo ejecuta la imagen postgres:14 solo en el primer arranque del volumen.
\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE auth_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db');
\gexec

SELECT 'CREATE DATABASE biblioteca_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'biblioteca_db');
\gexec

-- Zona horaria de la casa (estandares §12).
ALTER DATABASE auth_db SET timezone TO 'America/Bogota';
ALTER DATABASE biblioteca_db SET timezone TO 'America/Bogota';

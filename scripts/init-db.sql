-- Inicializa la base y el usuario de la app en una instancia MySQL existente.
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- El usuario 'inventory' se crea con la contraseña 'Inv3ntory!' (cumple la
-- política validate_password=MEDIUM por defecto en MySQL 8). Está pensada
-- solo para desarrollo local; el .env.local ya la incluye así que no necesitás
-- tipearla nunca.
--
-- Uso:
--   mysql -u root < scripts/init-db.sql
--   (o desde Workbench: abrir este archivo y ejecutar)

CREATE DATABASE IF NOT EXISTS inventory
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

DROP USER IF EXISTS 'inventory'@'localhost';
DROP USER IF EXISTS 'inventory'@'127.0.0.1';

CREATE USER 'inventory'@'localhost' IDENTIFIED BY 'Inv3ntory!';
CREATE USER 'inventory'@'127.0.0.1' IDENTIFIED BY 'Inv3ntory!';

GRANT ALL PRIVILEGES ON inventory.* TO 'inventory'@'localhost';
GRANT ALL PRIVILEGES ON inventory.* TO 'inventory'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT 'OK' AS status, 'inventory' AS database_name, 'inventory@localhost' AS app_user, 'Inv3ntory!' AS app_password;

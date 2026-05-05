-- Inicializa la base y el usuario de la app en una instancia MySQL existente.
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- Uso:
--   mysql -u root -p < scripts/init-db.sql
--   (o desde Workbench: abrir este archivo y ejecutar)

CREATE DATABASE IF NOT EXISTS inventory
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'inventory'@'localhost'
  IDENTIFIED BY 'inventory';
CREATE USER IF NOT EXISTS 'inventory'@'127.0.0.1'
  IDENTIFIED BY 'inventory';

ALTER USER 'inventory'@'localhost'
  IDENTIFIED WITH mysql_native_password BY 'inventory';
ALTER USER 'inventory'@'127.0.0.1'
  IDENTIFIED WITH mysql_native_password BY 'inventory';

GRANT ALL PRIVILEGES ON inventory.* TO 'inventory'@'localhost';
GRANT ALL PRIVILEGES ON inventory.* TO 'inventory'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT 'OK' AS status, 'inventory' AS database_name, 'inventory@localhost' AS app_user;

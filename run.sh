#!/usr/bin/env bash
# Helper para tareas comunes del monorepo. Cross-platform: Mac, Linux y Windows
# (vía Git Bash o WSL — Windows native no soporta este script).
#
# Requisitos: Node 20+, MySQL 8 corriendo localmente en :3306.
# pnpm se habilita automáticamente vía corepack si no está instalado.
#
# Comandos:
#   ./run.sh setup    -> instalación completa de cero (idempotente)
#   ./run.sh dev      -> verifica MySQL y arranca api+web (modo watch)
#   ./run.sh stop     -> detiene los procesos node lanzados por dev
#   ./run.sh status   -> muestra estado de servicios y procesos
#   ./run.sh doctor   -> diagnostica problemas comunes sin tocar nada
#   ./run.sh build    -> rebuild de shared/api/web
#   ./run.sh db:init  -> inicializa DB y usuario (lo hace setup también)
#   ./run.sh db:reset -> DROP + CREATE de la DB y reseed (¡borra datos!)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

API_LOG="$ROOT_DIR/.run/api.log"
WEB_LOG="$ROOT_DIR/.run/web.log"
API_PID="$ROOT_DIR/.run/api.pid"
WEB_PID="$ROOT_DIR/.run/web.pid"

# ---------- helpers de output ----------
color() { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
ok()    { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn()  { printf "\033[1;33m! %s\033[0m\n" "$*"; }
err()   { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

# ---------- detección de OS ----------
detect_os() {
  case "$(uname -s)" in
    Darwin)              OS=mac ;;
    Linux)               OS=linux ;;
    MINGW*|MSYS*|CYGWIN*) OS=windows ;;
    *)                   OS=unknown ;;
  esac
}

# ---------- chequeos individuales (no hacen acciones destructivas) ----------
have() { command -v "$1" >/dev/null 2>&1; }

mysql_is_up() {
  have mysqladmin && mysqladmin -h 127.0.0.1 -P 3306 ping --connect-timeout=2 >/dev/null 2>&1
}

mysql_app_user_works() {
  have mysql && mysql -h 127.0.0.1 -P 3306 -u inventory -p'Inv3ntory!' \
    --connect-timeout=2 -e "SELECT 1" inventory >/dev/null 2>&1
}

port_in_use() {
  curl -s -o /dev/null --max-time 1 "http://localhost:$1" >/dev/null 2>&1
}

# ---------- ensure_* (acciones idempotentes) ----------
ensure_pnpm() {
  if have pnpm; then return; fi
  color "Habilitando pnpm vía corepack"
  if ! have corepack; then
    err "No encuentro corepack. Necesitás Node.js >= 20.11."
    exit 1
  fi
  corepack enable
  corepack prepare pnpm@9.12.0 --activate
  ok "pnpm $(pnpm --version) listo"
}

ensure_env_files() {
  for app in api web; do
    if [ ! -f "apps/$app/.env.local" ]; then
      cp "apps/$app/.env.example" "apps/$app/.env.local"
      ok "apps/$app/.env.local creado desde .env.example"
    fi
  done
}

ensure_mysql_running() {
  if mysql_is_up; then
    ok "MySQL escucha en 127.0.0.1:3306"
    return
  fi

  warn "MySQL no responde en 127.0.0.1:3306"
  case "$OS" in
    mac)
      if have brew; then
        color "Intentando: brew services start mysql"
        brew services start mysql 2>&1 | grep -v "^$" || true
      else
        err "Iniciá MySQL manualmente: System Settings → MySQL → Start MySQL Server"
        exit 1
      fi
      ;;
    linux)
      if have systemctl; then
        color "Intentando: sudo systemctl start mysql"
        sudo systemctl start mysql 2>/dev/null || sudo systemctl start mysqld 2>/dev/null || true
      else
        err "Iniciá MySQL manualmente (service mysql start, etc.)"
        exit 1
      fi
      ;;
    windows)
      err "En Windows iniciá MySQL desde Services (services.msc) o desde el MySQL Installer"
      exit 1
      ;;
    *)
      err "OS no soportado para auto-start. Iniciá MySQL manualmente."
      exit 1
      ;;
  esac

  # Esperar hasta 15 segundos
  for _ in $(seq 1 15); do
    sleep 1
    if mysql_is_up; then ok "MySQL arrancó"; return; fi
  done
  err "MySQL no respondió en 15s. Iniciálo manualmente y reintentá."
  exit 1
}

ensure_mysql_client() {
  if have mysql && have mysqladmin; then return; fi
  err "No encuentro el cliente 'mysql' / 'mysqladmin' en tu PATH."
  case "$OS" in
    mac)     echo "    Instalá: brew install mysql-client (o el server completo)" ;;
    linux)   echo "    Instalá: sudo apt install mysql-client (o equivalente)" ;;
    windows) echo "    Agregá la carpeta bin de tu MySQL al PATH (típico: C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin)" ;;
  esac
  exit 1
}

install_deps() {
  color "Instalando dependencias del workspace (pnpm install)"
  pnpm install
  ok "Dependencias instaladas"
}

build_shared() {
  color "Compilando @inventory/shared (la api lo necesita en runtime)"
  pnpm --filter @inventory/shared build
  ok "@inventory/shared compilado"
}

init_db_if_needed() {
  if mysql_app_user_works; then
    ok "Base 'inventory' y usuario 'inventory@127.0.0.1' ya existen"
    return
  fi
  color "Inicializando base 'inventory' y usuario en MySQL local (root sin contraseña)"
  if ! mysql -h 127.0.0.1 -P 3306 -u root < scripts/init-db.sql 2>&1; then
    err "No pude conectar como root sin contraseña."
    echo "    Si tu root tiene contraseña, abrí scripts/init-db.sql en MySQL Workbench y ejecutalo a mano."
    exit 1
  fi
  ok "DB y usuario listos (password 'Inv3ntory!', ya cargado en .env.local)"
}

run_migrations() {
  color "Aplicando migraciones (pnpm db:migrate)"
  pnpm --filter @inventory/api db:migrate >/dev/null
  ok "Migraciones aplicadas"
}

run_seeds() {
  color "Cargando seeds (pnpm db:seed)"
  pnpm --filter @inventory/api db:seed
  ok "Seeds cargados"
}

# ---------- comandos públicos ----------
cmd_setup() {
  detect_os
  color "Setup completo para $OS"
  ensure_pnpm
  ensure_mysql_client
  ensure_mysql_running
  ensure_env_files
  install_deps
  build_shared
  init_db_if_needed
  run_migrations
  run_seeds
  echo
  ok "Setup completo. Para arrancar:"
  echo "    ./run.sh dev"
  echo
  echo "  Login:  admin@inventory.local / admin123"
  echo "  Web:    http://localhost:3000"
  echo "  API:    http://localhost:4000/api/health"
}

cmd_build() {
  detect_os
  ensure_pnpm
  install_deps
  build_shared
  color "Build de apps/api"
  pnpm --filter @inventory/api build
  color "Build de apps/web"
  pnpm --filter @inventory/web build
  ok "Build completo"
}

cmd_dev() {
  detect_os
  ensure_pnpm
  ensure_mysql_client
  ensure_env_files
  ensure_mysql_running
  if ! mysql_app_user_works; then
    err "No puedo conectar como inventory@127.0.0.1 a la base 'inventory'."
    echo "    Corré primero: ./run.sh setup"
    exit 1
  fi
  ok "MySQL local OK (inventory@127.0.0.1:3306/inventory)"

  mkdir -p "$ROOT_DIR/.run"

  if [ -f "$API_PID" ] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
    warn "API ya corriendo (PID $(cat "$API_PID")). Usá ./run.sh stop primero."
    exit 1
  fi
  if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
    warn "Web ya corriendo (PID $(cat "$WEB_PID")). Usá ./run.sh stop primero."
    exit 1
  fi

  color "Arrancando API (logs: $API_LOG)"
  nohup pnpm --filter @inventory/api dev >"$API_LOG" 2>&1 &
  echo $! >"$API_PID"

  color "Arrancando Web (logs: $WEB_LOG)"
  nohup pnpm --filter @inventory/web dev >"$WEB_LOG" 2>&1 &
  echo $! >"$WEB_PID"

  color "Esperando a que la API responda en http://localhost:4000/api/health"
  local tries=0
  until curl -sf http://localhost:4000/api/health >/dev/null 2>&1; do
    sleep 2
    tries=$((tries + 1))
    if [ $tries -gt 45 ]; then
      err "La API no respondió en 90s. Ver $API_LOG"
      tail -30 "$API_LOG"
      exit 1
    fi
  done

  color "Esperando a que la Web responda en http://localhost:3000"
  tries=0
  until curl -sf http://localhost:3000 >/dev/null 2>&1; do
    sleep 2
    tries=$((tries + 1))
    if [ $tries -gt 45 ]; then
      err "La Web no respondió en 90s. Ver $WEB_LOG"
      tail -30 "$WEB_LOG"
      exit 1
    fi
  done

  echo
  ok "Listo:"
  echo "    Web    -> http://localhost:3000"
  echo "    API    -> http://localhost:4000/api/health"
  echo "    Login  -> admin@inventory.local / admin123"
  echo
  echo "  Para detener: ./run.sh stop"
  echo "  Logs:         tail -f $API_LOG  $WEB_LOG"
}

cmd_stop() {
  for pidfile in "$API_PID" "$WEB_PID"; do
    if [ -f "$pidfile" ]; then
      local pid
      pid="$(cat "$pidfile")"
      if kill -0 "$pid" 2>/dev/null; then
        color "Deteniendo PID $pid"
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    fi
  done
  ok "Stop OK (MySQL local sigue corriendo; gestionalo con tu init system)"
}

cmd_status() {
  detect_os
  color "Estado del proyecto"
  echo
  if mysql_is_up; then ok "MySQL  :3306  arriba"; else warn "MySQL  :3306  caído"; fi
  if mysql_app_user_works; then
    ok "DB     'inventory' accesible con usuario 'inventory'"
  else
    warn "DB     'inventory' NO accesible (corré ./run.sh setup)"
  fi
  if port_in_use 4000; then ok "API    :4000  responde"; else warn "API    :4000  no responde"; fi
  if port_in_use 3000; then ok "Web    :3000  responde"; else warn "Web    :3000  no responde"; fi
  echo
  for pidfile in "$API_PID" "$WEB_PID"; do
    [ -f "$pidfile" ] || continue
    local pid name
    pid="$(cat "$pidfile")"
    name="$(basename "$pidfile" .pid)"
    if kill -0 "$pid" 2>/dev/null; then
      ok "process $name PID $pid (running)"
    else
      warn "process $name PID $pid (muerto, archivo viejo en .run/)"
    fi
  done
}

cmd_doctor() {
  detect_os
  color "Diagnóstico (no toca nada)"
  echo
  echo "  OS detectado:        $OS"
  echo "  Node:                $(node --version 2>/dev/null || echo 'NO INSTALADO')"
  if have corepack; then echo "  corepack:            $(corepack --version)"; else warn "corepack no encontrado"; fi
  if have pnpm;     then echo "  pnpm:                $(pnpm --version)"; else warn "pnpm no encontrado (corepack lo instala)"; fi
  if have mysql;    then echo "  mysql client:        $(mysql --version | awk '{print $3,$4,$5}')"; else warn "mysql CLI no encontrado"; fi
  if have mysqladmin; then echo "  mysqladmin:          ok"; else warn "mysqladmin no encontrado"; fi
  if mysql_is_up;   then echo "  MySQL :3306:         arriba"; else warn "MySQL :3306 no responde"; fi
  if mysql_app_user_works; then
    echo "  DB inventory:        accesible como inventory@127.0.0.1"
  else
    warn "DB inventory: no accesible (corré ./run.sh setup)"
  fi
  for app in api web; do
    if [ -f "apps/$app/.env.local" ]; then
      echo "  apps/$app/.env.local: existe"
    else
      warn "apps/$app/.env.local: falta (lo crea ./run.sh setup)"
    fi
  done
  if [ -d packages/shared/dist ]; then
    echo "  shared/dist:         existe"
  else
    warn "shared/dist: falta (corré pnpm --filter @inventory/shared build)"
  fi
}

cmd_db_init() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  init_db_if_needed
}

cmd_db_migrate() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  run_migrations
}

cmd_db_revert() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  color "Revirtiendo la última migración"
  pnpm --filter @inventory/api db:migrate:revert
  ok "Migración revertida"
}

cmd_db_generate() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  if [ -z "${1:-}" ]; then
    err "Falta el nombre de la migración."
    echo "    Uso: ./run.sh db:generate NombreDescriptivo"
    echo "    Ej:  ./run.sh db:generate AddProductTags"
    exit 1
  fi
  color "Generando migración 'apps/api/src/database/migrations/$1'"
  pnpm --filter @inventory/api db:migrate:generate "src/database/migrations/$1"
  ok "Migración generada — revisá el SQL antes de aplicar con db:migrate"
}

cmd_db_seed() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  run_seeds
}

cmd_db_reset() {
  detect_os
  ensure_mysql_client
  ensure_mysql_running
  warn "Esto va a BORRAR la base 'inventory' y todos sus datos. Ctrl+C en 3s para cancelar."
  sleep 3
  color "Dropeando y recreando la base"
  mysql -h 127.0.0.1 -P 3306 -u root \
    -e "DROP DATABASE IF EXISTS inventory; CREATE DATABASE inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  init_db_if_needed
  run_migrations
  run_seeds
  ok "DB reseteada y reseedeada"
}

cmd_mysql_restart() {
  detect_os
  case "$OS" in
    mac)
      if have brew; then
        color "brew services restart mysql"
        brew services restart mysql 2>&1 | grep -v "^$" || true
      else
        err "Sin Homebrew, reiniciá MySQL desde System Settings → MySQL"
        exit 1
      fi
      ;;
    linux)
      if have systemctl; then
        color "sudo systemctl restart mysql"
        sudo systemctl restart mysql 2>/dev/null || sudo systemctl restart mysqld
      else
        err "Reiniciá MySQL manualmente (service mysql restart)"
        exit 1
      fi
      ;;
    windows)
      err "En Windows reiniciá MySQL desde Services (services.msc)"
      exit 1
      ;;
  esac
  for _ in $(seq 1 15); do
    sleep 1
    if mysql_is_up; then ok "MySQL reiniciado"; return; fi
  done
  err "MySQL no respondió tras el reinicio"
  exit 1
}

cmd_mysql_cli() {
  ensure_mysql_client
  ensure_mysql_running
  color "Abriendo mysql shell como inventory@127.0.0.1/inventory (Ctrl+D para salir)"
  exec mysql -h 127.0.0.1 -P 3306 -u inventory -p'Inv3ntory!' inventory
}

cmd_logs() {
  if [ ! -f "$API_LOG" ] && [ ! -f "$WEB_LOG" ]; then
    warn "No hay logs todavía. Arrancá el dev primero: ./run.sh dev"
    exit 1
  fi
  color "Siguiendo logs (Ctrl+C para salir)"
  tail -f "$API_LOG" "$WEB_LOG" 2>/dev/null
}

usage() {
  cat <<EOF
Uso: ./run.sh <comando>

Setup y diagnóstico:
  setup            Instalación completa de cero (idempotente)
                   deps + MySQL + DB + migraciones + seed
  doctor           Diagnostica problemas comunes sin tocar nada
  status           Muestra qué servicios están arriba

Desarrollo diario:
  dev              Arranca api+web en watch (background)
  stop             Detiene api+web
  logs             tail -f de los logs de api y web
  build            Rebuild de shared/api/web

Base de datos:
  db:init          Crea DB e usuario (lo hace setup también)
  db:migrate       Aplica migraciones pendientes
  db:revert        Revierte la última migración aplicada
  db:generate <N>  Genera una migración nueva desde el diff entidades vs DB
  db:seed          Corre los seeds (idempotente)
  db:reset         DROP + CREATE de la DB + migrate + seed (¡borra datos!)

MySQL:
  mysql:restart    Reinicia el servicio MySQL local
  mysql:cli        Abre el cliente mysql como inventory@127.0.0.1/inventory

Compatibilidad:
  Mac/Linux:  funciona out of the box
  Windows:    usá Git Bash (viene con Git for Windows) o WSL2
              No funciona en PowerShell/cmd nativos.
EOF
}

case "${1:-}" in
  setup)             cmd_setup ;;
  build)             cmd_build ;;
  dev|up)            cmd_dev ;;
  stop|down)         cmd_stop ;;
  status)            cmd_status ;;
  doctor)            cmd_doctor ;;
  logs)              cmd_logs ;;
  db:init|db-init)             cmd_db_init ;;
  db:migrate|db-migrate)       cmd_db_migrate ;;
  db:revert|db-revert)         cmd_db_revert ;;
  db:generate|db-generate)     shift; cmd_db_generate "${1:-}" ;;
  db:seed|db-seed)             cmd_db_seed ;;
  db:reset|db-reset)           cmd_db_reset ;;
  mysql:restart|mysql-restart) cmd_mysql_restart ;;
  mysql:cli|mysql-cli)         cmd_mysql_cli ;;
  ""|-h|--help|help) usage ;;
  *) err "Comando desconocido: $1"; usage; exit 1 ;;
esac

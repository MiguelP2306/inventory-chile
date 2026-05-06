#!/usr/bin/env bash
# Helper para tareas comunes del monorepo.
# Requisitos: Node 20+, pnpm (corepack), MySQL 8 corriendo localmente en :3306.
#
# Uso:
#   ./run.sh build    -> instala deps + buildea shared/api/web
#   ./run.sh dev      -> verifica MySQL local y arranca api+web (modo watch)
#   ./run.sh stop     -> detiene los procesos node lanzados por dev
#   ./run.sh status   -> muestra estado de puertos 3000/4000/3306
#   ./run.sh db:init  -> crea la base 'inventory' y el usuario en tu MySQL local
#                        (password 'Inv3ntory!', ya cargado en apps/api/.env.local)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

API_LOG="$ROOT_DIR/.run/api.log"
WEB_LOG="$ROOT_DIR/.run/web.log"
API_PID="$ROOT_DIR/.run/api.pid"
WEB_PID="$ROOT_DIR/.run/web.pid"

color() { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
warn()  { printf "\033[1;33m!! %s\033[0m\n" "$*"; }
err()   { printf "\033[1;31mxx %s\033[0m\n" "$*" >&2; }

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    color "Habilitando pnpm vía corepack"
    corepack enable
    corepack prepare pnpm@9.12.0 --activate
  fi
}

ensure_env_files() {
  if [ ! -f apps/api/.env.local ]; then
    color "Creando apps/api/.env.local desde .env.example"
    cp apps/api/.env.example apps/api/.env.local
  fi
  if [ ! -f apps/web/.env.local ]; then
    color "Creando apps/web/.env.local desde .env.example"
    cp apps/web/.env.example apps/web/.env.local
  fi
}

check_mysql() {
  if ! command -v mysql >/dev/null 2>&1; then
    err "No encuentro el cliente 'mysql' en tu PATH. Instalá MySQL o agregá su bin al PATH."
    exit 1
  fi
  if ! lsof -i :3306 -sTCP:LISTEN >/dev/null 2>&1; then
    err "No hay nada escuchando en :3306. Asegurate de tener MySQL corriendo:"
    echo "      brew services start mysql      (Homebrew)"
    echo "      o System Settings -> MySQL -> Start MySQL Server (instalador oficial)"
    exit 1
  fi
  if ! mysql -h 127.0.0.1 -P 3306 -u inventory -p'Inv3ntory!' -e "SELECT 1" inventory >/dev/null 2>&1; then
    err "MySQL está arriba pero no puedo conectar como inventory@127.0.0.1 a la base 'inventory'."
    echo "      Corré una vez: ./run.sh db:init"
    exit 1
  fi
  color "MySQL local OK (inventory@127.0.0.1:3306/inventory)"
}

cmd_build() {
  ensure_pnpm
  ensure_env_files
  color "pnpm install"
  pnpm install
  color "Build de packages/shared"
  pnpm --filter @inventory/shared build
  color "Build de apps/api"
  pnpm --filter @inventory/api build
  color "Build de apps/web"
  pnpm --filter @inventory/web build
  color "Build completo OK"
}

cmd_dev() {
  ensure_pnpm
  ensure_env_files
  check_mysql
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

  color "Listo:"
  echo "   API   -> http://localhost:4000/api/health"
  echo "   Web   -> http://localhost:3000"
  echo "   MySQL -> 127.0.0.1:3306 (user: inventory, db: inventory)"
  echo
  echo "Para detener todo: ./run.sh stop"
  echo "Logs: tail -f $API_LOG  |  tail -f $WEB_LOG"
}

cmd_stop() {
  for pidfile in "$API_PID" "$WEB_PID"; do
    if [ -f "$pidfile" ]; then
      local pid
      pid="$(cat "$pidfile")"
      if kill -0 "$pid" 2>/dev/null; then
        color "Deteniendo PID $pid ($pidfile)"
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    fi
  done
  color "Stop OK (MySQL local sigue corriendo; gestionalo con tu init system)"
}

cmd_status() {
  color "Puertos"
  for port in 3000 4000 3306; do
    if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "   $port -> escuchando"
    else
      echo "   $port -> libre"
    fi
  done
  echo
  color "Procesos del proyecto"
  for pidfile in "$API_PID" "$WEB_PID"; do
    if [ -f "$pidfile" ]; then
      local pid
      pid="$(cat "$pidfile")"
      if kill -0 "$pid" 2>/dev/null; then
        echo "   $(basename "$pidfile" .pid) -> PID $pid (running)"
      else
        echo "   $(basename "$pidfile" .pid) -> PID $pid (muerto, archivo viejo)"
      fi
    fi
  done
}

cmd_db_init() {
  if [ ! -f scripts/init-db.sql ]; then
    err "No encuentro scripts/init-db.sql"
    exit 1
  fi
  if ! command -v mysql >/dev/null 2>&1; then
    err "No encuentro el cliente 'mysql' en tu PATH"
    exit 1
  fi
  color "Ejecutando scripts/init-db.sql en tu MySQL local (127.0.0.1:3306, root sin contraseña)"
  mysql -h 127.0.0.1 -P 3306 -u root < scripts/init-db.sql
  color "DB y usuario 'inventory' listos (password 'Inv3ntory!', ya cargado en .env.local)"
}

usage() {
  cat <<EOF
Uso: ./run.sh <comando>

Comandos:
  build     Instala deps y compila shared/api/web
  dev       Verifica MySQL local y arranca api+web en background (watch)
  stop      Detiene api y web
  status    Muestra puertos 3000/4000/3306 y procesos del proyecto
  db:init   Crea la base 'inventory' y el usuario en tu MySQL local
            (password 'Inv3ntory!' ya cargado en .env.local).
            Asume root sin contraseña.
EOF
}

case "${1:-}" in
  build)    cmd_build ;;
  dev|up)   cmd_dev ;;
  stop|down) cmd_stop ;;
  status)   cmd_status ;;
  db:init|db-init) cmd_db_init ;;
  ""|-h|--help|help) usage ;;
  *) err "Comando desconocido: $1"; usage; exit 1 ;;
esac

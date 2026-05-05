#!/usr/bin/env bash
# Helper para tareas comunes del monorepo.
# Uso:
#   ./run.sh build   -> instala deps + levanta MySQL + buildea todo
#   ./run.sh dev     -> levanta MySQL + arranca api y web en modo desarrollo
#   ./run.sh stop    -> detiene MySQL y procesos node lanzados por dev
#   ./run.sh status  -> muestra estado de docker y puertos 3000/4000
#   ./run.sh logs    -> sigue los logs de MySQL

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

start_mysql() {
  color "Levantando MySQL en docker"
  docker compose up -d mysql
  color "Esperando a que MySQL esté healthy"
  local tries=0
  until [ "$(docker inspect --format='{{.State.Health.Status}}' inventory-mysql 2>/dev/null || echo starting)" = "healthy" ]; do
    sleep 2
    tries=$((tries + 1))
    if [ $tries -gt 60 ]; then
      err "MySQL no llegó a healthy en 120s"
      docker compose logs mysql | tail -30
      exit 1
    fi
  done
  color "MySQL OK (puerto 3306)"
}

cmd_build() {
  ensure_pnpm
  ensure_env_files
  color "pnpm install"
  pnpm install
  start_mysql
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
  start_mysql
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
  echo "   MySQL -> localhost:3306 (user: inventory, db: inventory)"
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
  color "Apagando MySQL"
  docker compose down
  color "Stop OK"
}

cmd_status() {
  color "Docker"
  docker compose ps || true
  echo
  color "Puertos"
  for port in 3000 4000 3306; do
    if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "   $port -> escuchando"
    else
      echo "   $port -> libre"
    fi
  done
}

cmd_logs() {
  docker compose logs -f mysql
}

usage() {
  cat <<EOF
Uso: ./run.sh <comando>

Comandos:
  build    Instala dependencias, levanta MySQL y compila shared/api/web
  dev      Levanta MySQL y arranca api+web en background (modo watch)
  stop     Detiene api, web y MySQL
  status   Muestra estado de docker y puertos 3000/4000/3306
  logs     Sigue los logs de MySQL
EOF
}

case "${1:-}" in
  build)  cmd_build ;;
  dev|up) cmd_dev ;;
  stop|down) cmd_stop ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
  ""|-h|--help|help) usage ;;
  *) err "Comando desconocido: $1"; usage; exit 1 ;;
esac

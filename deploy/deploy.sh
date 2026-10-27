#!/usr/bin/env bash
# Uso:  bash deploy/deploy.sh pruebas        (rama staging -> servidor de pruebas)
#       bash deploy/deploy.sh produccion     (rama main    -> servidor de producción)
# Requisitos: todo commiteado y subido (git push) ANTES de desplegar, y tu deploy/deploy.env (copia deploy/deploy.env.example).
# Los datos de los servidores (direcciones, usuarios, llaves) NO están en este archivo: viven en deploy/deploy.env, que no se versiona.
set -euo pipefail

CONFIG="$(dirname "$0")/deploy.env"
[ -f "$CONFIG" ] || { echo "Falta deploy/deploy.env. Copia deploy/deploy.env.example como deploy/deploy.env y llénalo (ver DEPLOY.md)."; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
req() { [ -n "${!1:-}" ] || { echo "Falta $1 en deploy/deploy.env"; exit 1; }; }
expand() { eval echo "$1"; }   # permite ~ en las rutas de las llaves

AMBIENTE="${1:-}"
RAMA_ACTUAL="$(git rev-parse --abbrev-ref HEAD)"
RUTA="${RUTA_PROYECTO:-/var/www/Simulador}"

case "$AMBIENTE" in
  pruebas)
    req PRUEBAS_USUARIO; req PRUEBAS_SERVIDOR; req PRUEBAS_LLAVE
    RAMA="staging"
    HOST="${PRUEBAS_USUARIO}@${PRUEBAS_SERVIDOR}"
    # accept-new: acepta la llave del servidor la primera vez y AVISA (y se niega) si después cambia; ya no se desactiva la verificación.
    SSH_OPTS=(-i "$(expand "$PRUEBAS_LLAVE")" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
    MODO_FRONT="build:pruebas"
    MIGRAR="npm run migrate:up --silent"   # en pruebas las migraciones se aplican solas
    ;;
  produccion)
    req PROD_BASTION_USUARIO; req PROD_BASTION; req PROD_SERVIDOR_INTERNO; req PROD_USUARIO; req PROD_LLAVE
    RAMA="main"
    PUERTO="${PROD_PUERTO_TUNEL:-2223}"
    HOST="${PROD_USUARIO}@localhost"
    # HostKeyAlias: la llave del servidor se guarda con un nombre fijo y no como "localhost:puerto" (que sirve para cualquier túnel).
    SSH_OPTS=(-p "$PUERTO" -i "$(expand "$PROD_LLAVE")" -o StrictHostKeyChecking=accept-new -o HostKeyAlias=simac-produccion -o ConnectTimeout=20)
    MODO_FRONT="build"
    # En producción: respaldo primero. Por omisión NO migra (npm run migrate:up a mano, ver DEPLOY.md).
    # Cuando el código nuevo exige la migración (p. ej. 0008, que renombra tablas), se pasa MIGRAR_PROD="npm run migrate:up --silent":
    # así la migración corre entre la compilación y el reinicio y la ventana con errores dura segundos.
    MIGRAR="${MIGRAR_PROD:-true}"
    ;;
  *) echo "Uso: $0 pruebas|produccion"; exit 1 ;;
esac

[ "$RAMA_ACTUAL" = "$RAMA" ] || { echo "Para '$AMBIENTE' debes estar en la rama '$RAMA' (estás en '$RAMA_ACTUAL')."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Hay cambios sin commitear. Haz commit y push primero."; exit 1; }
git fetch -q origin "$RAMA"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$RAMA")" ] || { echo "Tu rama '$RAMA' no coincide con origin/$RAMA. Haz git push primero."; exit 1; }

if [ "$AMBIENTE" = "produccion" ]; then
  # Producción solo recibe lo que ya pasó por pruebas: staging debe estar contenida en main.
  git fetch -q origin staging 2>/dev/null || true
  if git rev-parse -q --verify origin/staging >/dev/null && ! git merge-base --is-ancestor origin/staging HEAD; then
    echo "AVISO: main NO incluye todo lo de staging (hay cambios probados o en prueba aún sin mezclar)."
  fi
  read -r -p "Vas a desplegar a PRODUCCIÓN. Escribe 'si' para continuar: " R
  [ "$R" = "si" ] || { echo "Cancelado."; exit 1; }
  # Túnel al servidor interno a través del bastión
  pkill -f "ssh.*${PUERTO}:" 2>/dev/null || true
  ssh -i "$(expand "$PROD_LLAVE")" -L "${PUERTO}:${PROD_SERVIDOR_INTERNO}:22" -N -f -o StrictHostKeyChecking=accept-new "${PROD_BASTION_USUARIO}@${PROD_BASTION}"
  sleep 2
fi

echo ">> Desplegando '$RAMA' a $AMBIENTE ..."
ssh "${SSH_OPTS[@]}" "$HOST" "set -e; cd $RUTA && git pull -q origin $RAMA \
  && cd backend && npm install --no-audit --no-fund --silent && npx tsc && $MIGRAR && pm2 restart bodegas-api \
  && cd ../frontend && npm install --legacy-peer-deps --no-audit --no-fund --silent && npm run $MODO_FRONT \
  && sudo nginx -s reload && echo DEPLOY_OK"

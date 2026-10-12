#!/usr/bin/env bash
# Uso:  deploy/deploy.sh pruebas        (rama staging  -> servidor de pruebas simacqa)
#       deploy/deploy.sh produccion     (rama main     -> servidor de produccion AWS)
# Requisitos: VPN conectada y todo commiteado y subido (git push) ANTES de desplegar.
set -euo pipefail

AMBIENTE="${1:-}"
RAMA_ACTUAL="$(git rev-parse --abbrev-ref HEAD)"

case "$AMBIENTE" in
  pruebas)
    RAMA="staging"
    HOST="qasimac@10.1.24.200"
    SSH_OPTS=(-i "$HOME/.ssh/simacqa" -o StrictHostKeyChecking=no -o ConnectTimeout=20)
    MODO_FRONT="build:pruebas"
    ;;
  produccion)
    RAMA="main"
    HOST="jesus.rios@localhost"
    SSH_OPTS=(-p 2223 -i "$HOME/.ssh/jesus.rios.pem" -o StrictHostKeyChecking=no -o ConnectTimeout=20)
    MODO_FRONT="build"
    ;;
  *) echo "Uso: $0 pruebas|produccion"; exit 1 ;;
esac

[ "$RAMA_ACTUAL" = "$RAMA" ] || { echo "Para '$AMBIENTE' debes estar en la rama '$RAMA' (estas en '$RAMA_ACTUAL')."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Hay cambios sin commitear. Haz commit y push primero."; exit 1; }
git fetch -q origin "$RAMA"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$RAMA")" ] || { echo "Tu rama '$RAMA' no coincide con origin/$RAMA. Haz git push primero."; exit 1; }

if [ "$AMBIENTE" = "produccion" ]; then
  # Produccion solo recibe lo que ya paso por pruebas: staging debe estar contenida en main.
  git fetch -q origin staging 2>/dev/null || true
  if git rev-parse -q --verify origin/staging >/dev/null && ! git merge-base --is-ancestor origin/staging HEAD; then
    echo "AVISO: main NO incluye todo lo de staging (hay cambios probados o en prueba aun sin mezclar)."
  fi
  read -r -p "Vas a desplegar a PRODUCCION. Escribe 'si' para continuar: " R
  [ "$R" = "si" ] || { echo "Cancelado."; exit 1; }
  # Tunel al EC2 via bastion (igual que el flujo manual anterior)
  pkill -f "ssh.*2223" 2>/dev/null || true
  ssh -i "$HOME/.ssh/jesus.rios.pem" -L 2223:10.54.32.127:22 -N -f -o StrictHostKeyChecking=no jesus.rios@35.169.108.155
  sleep 2
fi

echo ">> Desplegando '$RAMA' a $AMBIENTE ..."
ssh "${SSH_OPTS[@]}" "$HOST" "set -e; cd /var/www/Simulador && git pull -q origin $RAMA \
  && cd backend && npm install --no-audit --no-fund --silent && npx tsc && pm2 restart bodegas-api \
  && cd ../frontend && npm install --no-audit --no-fund --silent && npm run $MODO_FRONT \
  && sudo nginx -s reload && echo DEPLOY_OK"

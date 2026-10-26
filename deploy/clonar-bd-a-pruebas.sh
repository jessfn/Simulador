#!/usr/bin/env bash
# Copia la base de PRODUCCION (esquema + datos) a la base de PRUEBAS (bodegas_qa).
# Solo LEE de produccion (pg_dump); solo ESCRIBE en pruebas. Requiere VPN y las dos llaves SSH.
# Uso: deploy/clonar-bd-a-pruebas.sh
set -euo pipefail

# Los datos de los servidores salen de deploy/deploy.env (copia deploy/deploy.env.example); no se versiona.
CONFIG="$(dirname "$0")/deploy.env"
[ -f "$CONFIG" ] || { echo "Falta deploy/deploy.env (ver deploy/deploy.env.example)."; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
for v in PRUEBAS_USUARIO PRUEBAS_SERVIDOR PRUEBAS_LLAVE PROD_BASTION_USUARIO PROD_BASTION PROD_SERVIDOR_INTERNO PROD_USUARIO PROD_LLAVE; do
  [ -n "${!v:-}" ] || { echo "Falta $v en deploy/deploy.env"; exit 1; }
done
PUERTO="${PROD_PUERTO_TUNEL:-2223}"
PROD=(-p "$PUERTO" -i "$(eval echo "$PROD_LLAVE")" -o StrictHostKeyChecking=accept-new -o HostKeyAlias=simac-produccion "${PROD_USUARIO}@localhost")
QA=(-i "$(eval echo "$PRUEBAS_LLAVE")" -o StrictHostKeyChecking=accept-new "${PRUEBAS_USUARIO}@${PRUEBAS_SERVIDOR}")

echo "ATENCION: la copia contiene datos personales reales (CURP, telefonos, correos)."
echo "Destino: bodegas_qa en el servidor de pruebas (se BORRA y se reemplaza todo su contenido)."
read -r -p "Escribe 'si' para continuar: " R; [ "$R" = "si" ] || { echo Cancelado.; exit 1; }

pkill -f "ssh.*${PUERTO}:" 2>/dev/null || true
ssh -i "$(eval echo "$PROD_LLAVE")" -L "${PUERTO}:${PROD_SERVIDOR_INTERNO}:22" -N -f -o StrictHostKeyChecking=accept-new "${PROD_BASTION_USUARIO}@${PROD_BASTION}"
sleep 2

echo ">> Volcando produccion y restaurando en pruebas (puede tardar)..."
ssh "${PROD[@]}" 'cd /var/www/Simulador/backend && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc --no-owner --no-privileges "$DB_NAME"' \
 | ssh "${QA[@]}" 'sudo -u postgres dropdb --if-exists bodegas_qa && sudo -u postgres createdb -O simac_qa bodegas_qa && sudo -u postgres pg_restore --no-owner --role=simac_qa -d bodegas_qa -j1 && echo CLON_OK'

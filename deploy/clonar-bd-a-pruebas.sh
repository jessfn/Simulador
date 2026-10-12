#!/usr/bin/env bash
# Copia la base de PRODUCCION (esquema + datos) a la base de PRUEBAS (bodegas_qa).
# Solo LEE de produccion (pg_dump); solo ESCRIBE en pruebas. Requiere VPN y las dos llaves SSH.
# Uso: deploy/clonar-bd-a-pruebas.sh
set -euo pipefail

PROD=(-p 2223 -i "$HOME/.ssh/jesus.rios.pem" -o StrictHostKeyChecking=no jesus.rios@localhost)
QA=(-i "$HOME/.ssh/simacqa" -o StrictHostKeyChecking=no qasimac@10.1.24.200)

echo "ATENCION: la copia contiene datos personales reales (CURP, telefonos, correos)."
echo "Destino: bodegas_qa en 10.1.24.200 (se BORRA y se reemplaza todo su contenido)."
read -r -p "Escribe 'si' para continuar: " R; [ "$R" = "si" ] || { echo Cancelado.; exit 1; }

pkill -f "ssh.*2223" 2>/dev/null || true
ssh -i "$HOME/.ssh/jesus.rios.pem" -L 2223:10.54.32.127:22 -N -f -o StrictHostKeyChecking=no jesus.rios@35.169.108.155
sleep 2

echo ">> Volcando produccion y restaurando en pruebas (puede tardar)..."
ssh "${PROD[@]}" 'cd /var/www/Simulador/backend && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc --no-owner --no-privileges "$DB_NAME"' \
 | ssh "${QA[@]}" 'sudo -u postgres dropdb --if-exists bodegas_qa && sudo -u postgres createdb -O simac_qa bodegas_qa && sudo -u postgres pg_restore --no-owner --role=simac_qa -d bodegas_qa -j1 && echo CLON_OK'

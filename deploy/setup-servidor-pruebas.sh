#!/usr/bin/env bash
# Prepara Ubuntu 22.04 (simacqa) desde cero. Ejecutar UNA vez en el servidor, como qasimac con sudo:
#   bash setup-servidor-pruebas.sh https://github.com/jessfn/Simulador.git
set -euo pipefail
REPO="${1:?Falta la URL del repositorio}"

sudo apt-get update -y
sudo apt-get install -y curl git nginx postgresql postgresql-contrib build-essential
# Node 20 LTS + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Codigo
sudo mkdir -p /var/www && sudo chown "$USER":"$USER" /var/www
[ -d /var/www/Simulador ] || git clone "$REPO" /var/www/Simulador
cd /var/www/Simulador && git fetch -q origin && git checkout staging

# Base de datos propia de pruebas (NUNCA el RDS de produccion)
DBPASS="$(openssl rand -hex 16)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='simac_qa'" | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE simac_qa LOGIN PASSWORD '$DBPASS'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='bodegas_qa'" | grep -q 1 || sudo -u postgres createdb -O simac_qa bodegas_qa
echo "Contrasena BD simac_qa (guardala en backend/.env): $DBPASS"

# nginx
sudo cp /var/www/Simulador/deploy/nginx-pruebas.conf /etc/nginx/sites-available/simac-pruebas
sudo ln -sf /etc/nginx/sites-available/simac-pruebas /etc/nginx/sites-enabled/simac-pruebas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx

echo "Siguiente: crear /var/www/Simulador/backend/.env (ver deploy/env.pruebas.example), cargar el esquema SQL y arrancar PM2."

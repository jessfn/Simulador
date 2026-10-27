#!/bin/bash
# Monta en el servidor una instancia AISLADA para ensayar la homologación: esquema desechable "ensayo" (copia de la estructura de producción, ya migrada)
# con catálogos y usuarios ficticios, y una API en el puerto 3999. NO toca el esquema público. Se borra con borrar.sh.
cd "$(dirname "$0")/../../.." || exit 1
S="ssh -p 2223 -i $HOME/.ssh/jesus.rios.pem -o HostKeyAlias=simac-produccion jesus.rios@localhost"
F=db/migrations/0008_homologar_nombres_espanol.sql
awk '/^-- Down Migration/{exit} {print}' $F | $S 'cat > /tmp/up0008.sql'
awk 'f{print} /^-- Down Migration/{f=1}' $F | $S 'cat > /tmp/down0008.sql'
rm -rf /tmp/h/dist && npx tsc --outDir /tmp/h/dist || exit 1
$S 'pkill -f "[n]ode dist/index.js"; rm -rf ~/ensayo_app && mkdir -p ~/ensayo_app/ens && ln -s /var/www/Simulador/backend/node_modules ~/ensayo_app/node_modules && cp /var/www/Simulador/backend/package.json ~/ensayo_app/'
tar -C /tmp/h -cf - dist | $S 'tar -C ~/ensayo_app -xf -'
tar -C db/homologacion/ensayo -cf - . | $S 'tar -C ~/ensayo_app/ens -xf -'
$S 'cd /var/www/Simulador/backend && set -a && . ./.env && set +a && export PGPASSWORD=$DB_PASSWORD && PS="psql -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME -v ON_ERROR_STOP=1 -q" &&
pg_dump -s -n public --no-owner --no-privileges -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME -f /tmp/esquema_public.sql &&
grep -v -E "^(CREATE EXTENSION|COMMENT ON EXTENSION|CREATE SCHEMA|COMMENT ON SCHEMA)" /tmp/esquema_public.sql | perl -pe "s/\bpublic\.(?!geometry|geography|spatial_ref_sys|box2d|box3d|st_|_st_|postgis|gidx|pgis|geometry_dump|valid_detail)/ensayo./g" > /tmp/esquema_ensayo.sql &&
$PS -c "DROP SCHEMA IF EXISTS ensayo CASCADE" -c "CREATE SCHEMA ensayo" 2>/dev/null; $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/esquema_ensayo.sql >/dev/null 2>&1 && $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/up0008.sql 2>&1 | tail -1 &&
for par in cat_catalog:cat_catalogo cat_crop_variety:cat_variedad_cultivo geo_state:geo_estado geo_municipality:geo_municipio cat_programa:cat_programa cat_programas_gobierno:cat_programas_gobierno roles_panel:roles_panel regiones:regiones municipios_referencia:municipios_referencia cat_conceptos_servicio:cat_conceptos_servicio encuesta_categorias:encuesta_categorias encuesta_productos:encuesta_productos encuesta_presentaciones:encuesta_presentaciones encuesta_ediciones:encuesta_ediciones encuesta_alias:encuesta_alias precio_parametros:precio_parametros senasica_parametros:senasica_parametros; do v=${par%%:*}; n=${par##*:}; $PS -c "INSERT INTO ensayo.$n SELECT * FROM public.$v"; done && cd ~/ensayo_app && node ens/sembrar.js | tail -1 &&
export PGOPTIONS="-c search_path=ensayo,public" NODE_ENV=development IDENTIDAD_SIMULADA=true JOBS_ENABLED=false PORT=3999 JWT_SECRET=ensayo_local_secreto_no_produccion_0123456789 && (setsid nohup node dist/index.js > ~/ensayo_app/app.log 2>&1 < /dev/null &) ; sleep 5; curl -s -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:3999/api/health'

#!/bin/bash
# Ensaya la migración 0010 (llaves foráneas) en una copia desechable CON DATOS de las tablas involucradas (esquema "ensayo", sin llaves foráneas previas).
cd "$(dirname "$0")/../../.." || exit 1
S="ssh -p 2223 -i $HOME/.ssh/jesus.rios.pem -o HostKeyAlias=simac-produccion jesus.rios@localhost"
F=db/migrations/0010_llaves_foraneas.sql
awk '/^-- Down Migration/{exit} {print}' $F | $S 'cat > /tmp/up0010.sql'
awk 'f{print} /^-- Down Migration/{f=1}' $F | $S 'cat > /tmp/down0010.sql'
$S 'cd /var/www/Simulador/backend && set -a && . ./.env && set +a && export PGPASSWORD=$DB_PASSWORD && PS="psql -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME -v ON_ERROR_STOP=1 -q" &&
pg_dump -s -n public --no-owner --no-privileges -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME -f /tmp/esquema_public.sql &&
grep -v -E "^(CREATE EXTENSION|COMMENT ON EXTENSION|CREATE SCHEMA|COMMENT ON SCHEMA)" /tmp/esquema_public.sql | perl -pe "s/\bpublic\.(?!geometry|geography|spatial_ref_sys|box2d|box3d|st_|_st_|postgis|gidx|pgis|geometry_dump|valid_detail)/ensayo./g" > /tmp/esquema_ensayo.sql &&
$PS -c "DROP SCHEMA IF EXISTS ensayo CASCADE" -c "CREATE SCHEMA ensayo" 2>/dev/null; $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/esquema_ensayo.sql >/dev/null 2>&1;
for c in $($PS -At -c "select k.relname||\$\$:\$\$||c.conname from pg_constraint c join pg_class k on k.oid=c.conrelid where c.contype=\$\$f\$\$ and k.relnamespace=\$\$ensayo\$\$::regnamespace"); do $PS -c "ALTER TABLE ensayo.${c%%:*} DROP CONSTRAINT ${c##*:}"; done;
for t in usuarios productor up ciclo ciclo_cultivo bodegas regiones geo_estado geo_municipio ventanillas apoyos_ventanilla alertas alertas_externas alertas_up senales_compra senal_interesados senal_variedades seguimiento_visitas seguimiento_incidencias cosecha_real estimacion_cosecha precios disponibilidad_productor solicitudes_apoyo supervisor_productores transacciones notificaciones sesiones tokens_revocados productor_perfil oferta_interes bodeguero_bodegas infraestructura_contactos inventarios tarifario_servicios cat_conceptos_servicio senasica_cargas precio_parametros discrepancias tecnico_zona encuesta_contexto_territorial; do $PS -c "INSERT INTO ensayo.$t SELECT * FROM public.$t"; done;
echo "== up"; $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/up0010.sql 2>&1 | tail -25;
echo "== resumen"; psql -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER $DB_NAME -At -F "|" -c "set search_path=ensayo,public" -c "select count(*) filter (where convalidated) validas, count(*) filter (where not convalidated) no_validas from pg_constraint where contype=\$\$f\$\$ and conname like \$\$fk\_%\$\$" -c "select tabla||\$\$.\$\$||columna, huerfanos from llaves_foraneas_pendientes order by huerfanos desc";
echo "== bajada y subida"; $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/down0010.sql 2>&1 | tail -3; $PS --single-transaction -c "SET search_path=ensayo,public" -f /tmp/up0010.sql 2>&1 | tail -1'

#!/bin/bash
# Extrae las consultas del código y las valida con PREPARE contra el esquema "ensayo" (copia desechable ya homologada) en el servidor.
cd "$(dirname "$0")/../.." || exit 1
node db/homologacion/extraer-consultas.js || exit 1
S="ssh -p 2223 -i $HOME/.ssh/jesus.rios.pem -o HostKeyAlias=simac-produccion jesus.rios@localhost"
cat db/homologacion/consultas.json | $S 'cat > /var/www/Simulador/backend/consultas_tmp.json'
cat db/homologacion/validar-consultas.js | $S 'cat > /var/www/Simulador/backend/validar_tmp.js'
$S 'cd /var/www/Simulador/backend && node validar_tmp.js && node -e "const e=require(\"/tmp/errores_prepare.json\");for(const x of e)console.log(x.f+\":\"+x.l+\" \"+(x.interp?\"[i] \":\"\")+x.error)"'

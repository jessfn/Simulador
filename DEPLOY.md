# Despliegue de SIMAC (sin secretos)

> Los accesos, direcciones privadas y contraseñas están en el archivo privado `DEPLOY_PRIVADO.md`
> (no se sube a git). Aquí solo van los pasos.

## Ambientes y ramas

| Ambiente | Rama | Quién lo ve |
|---|---|---|
| **Pruebas** | `staging` | Equipo de TI y quienes aprueban (red interna / VPN) |
| **Producción** | `main` | Todos los usuarios |

`main` = exactamente lo que está en producción. Todo cambio entra primero a `staging`.

## Flujo normal

1. Trabajar en una rama por ticket: `ticket/TXX-descripcion` (arreglos urgentes de maíz: `fix/descripcion`, desde `main`).
2. Integrar a `staging`, subir con `git push` y desplegar a pruebas: `bash deploy/deploy.sh pruebas`.
3. Probar en el ambiente de pruebas. Cuando se apruebe, mezclar `staging` en `main`.
4. **Antes de producción:**
   - Snapshot manual de la base (RDS) con el nombre `simac-pre-<descripcion>-AAAA-MM-DD`.
   - Etiqueta en git de la versión actual: `git tag prod-AAAA-MM-DD && git push --tags`.
5. Desplegar a producción: `bash deploy/deploy.sh produccion` (pide confirmación).
6. Aplicar migraciones de base: `npm run migrate:up` en `backend/` del servidor (ver abajo).
7. Verificar: cifras del tablero de administración, un acceso de productor y uno de técnico.

## Qué hace `deploy/deploy.sh`

`git pull` de la rama → instala dependencias → compila el backend (`npx tsc`) → reinicia el proceso (`pm2 restart bodegas-api`)
→ compila el frontend (en pruebas con `build:pruebas`, que muestra el aviso "AMBIENTE DE PRUEBAS") → recarga nginx.

## Migraciones de base de datos

Todo cambio de estructura o de catálogos se hace con una migración, nunca a mano. Carpeta única: `backend/db/migrations/`.

```bash
cd backend
npm run migrate:create nombre_del_cambio   # crea el archivo (subida y bajada)
npm run migrate:status                     # qué se aplicaría, sin tocar la base
npm run migrate:up                         # aplica las pendientes
npm run migrate:down                       # revierte la última
```

- `0000_linea_base.sql` es la estructura de producción al 2026-10-12. En producción **no se ejecuta**: se marca con
  `npm run migrate:fake-base` (una sola vez, después del snapshot). En una base vacía construye todo (requiere superusuario).
- Una migración con datos de catálogo usa `ON CONFLICT` para que no falle si se corre dos veces.
- Los SQL anteriores están en `backend/db/legacy/` (histórico; no volver a ejecutarlos).

## Variables de entorno relevantes

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`, `JOBS_ENABLED` (apaga las tareas programadas),
`VAPID_*`, `SMTP_*`, `SADER_*`, `RENAPO_*`, `CHAT_BOT_ENABLED`. El ambiente de pruebas usa otro `JWT_SECRET`, otra base y
**sin** llaves de servicios externos (ver `deploy/env.pruebas.example`).

## Regresar a la versión anterior

- Falla de código sin daño a datos: desplegar la etiqueta anterior (`git checkout prod-AAAA-MM-DD` en el servidor, compilar y reiniciar).
- Falla en migración o datos: `npm run migrate:down` hasta el punto previo; si no basta, restaurar el snapshot **como base nueva** y
  apuntar el backend a ella. Documentar lo ocurrido.

## Logs

`pm2 logs bodegas-api` y los registros de nginx del servidor.

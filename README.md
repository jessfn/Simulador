Proyecto Simulador
## Estructura del repositorio

- `frontend/` — React + Vite + TypeScript + Tailwind (PWA)
- `backend/` — Node.js + Express + PostgreSQL/PostGIS
- `icons/` — recursos gráficos del proyecto
- `nginx-bodegas.conf` — configuración de referencia de Nginx

## Cómo trabajamos con ramas

- `main` es exactamente lo que está en producción.
- Cada ticket va en su propia rama (`ticket/TXX-descripcion`); los arreglos urgentes de maíz en `fix/descripcion`, desde `main`.
- Cambios de base de datos: solo con migraciones nuevas (`backend/db/migrations`, ver `DEPLOY.md`). Nunca se edita una migración que ya se aplicó.
- Antes de cada salida a producción: respaldo de la base (`pg_dump` y snapshot de RDS) y etiqueta en git (ver `DEPLOY.md`).
- Despliegue: `bash deploy/deploy.sh produccion`. Pasos completos en `DEPLOY.md`.

### Proceso de revisión (el que se usa cuando el ambiente de pruebas está activo)

1. Todo entra por **Pull Request** hacia `staging` (la plantilla está en `.github/pull_request_template.md`); `staging` pasa a `main` también por Pull Request.
2. Nadie fusiona su propio Pull Request sin aprobación. `main` (y `staging`, si se puede) deben tener activada en GitHub la protección de rama:
   exigir Pull Request y una aprobación, sin `force push` y sin borrar la rama (ver `docs/AMBIENTE_DE_PRUEBAS.md`, sección "Protección de ramas").
3. Cada Pull Request lleva sus pruebas (`npm test` en `backend/`, ver `backend/tests/README.md`) y, si toca maíz, la comparación "maíz no cambió".

> **Desde el 2026-10-26 el ambiente de pruebas está suspendido** y los cambios se integran directo a `main` y se despliegan a producción con respaldo previo.
> El proceso de revisión de arriba queda documentado y listo para retomarse cuando el ambiente de pruebas vuelva.

## Pruebas

Las pruebas viven en `backend/tests/` y se corren con `npm test` (ver `backend/tests/README.md`). Usan datos ficticios y se niegan a correr contra producción.

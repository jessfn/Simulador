Proyecto Simulador
## Estructura del repositorio

- `frontend/` — React + Vite + TypeScript + Tailwind (PWA)
- `backend/` — Node.js + Express + PostgreSQL/PostGIS
- `icons/` — recursos gráficos del proyecto
- `nginx-bodegas.conf` — configuración de referencia de Nginx

## Cómo trabajamos con ramas

- `main` es exactamente lo que está en producción. `staging` es lo que se prueba en el ambiente de pruebas.
- Cada ticket va en su propia rama (`ticket/TXX-descripcion`); los arreglos urgentes de maíz en `fix/descripcion`, desde `main`.
- Todo entra primero a `staging`, se despliega a pruebas y solo después de aprobarse pasa a `main`.
- Cambios de base de datos: solo con migraciones (`backend/db/migrations`, ver `DEPLOY.md`).
- Despliegue: `bash deploy/deploy.sh pruebas|produccion`. Pasos completos en `DEPLOY.md`.

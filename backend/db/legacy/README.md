# Histórico de migraciones (no volver a ejecutar)

Estos archivos `.sql` estaban repartidos en seis carpetas (`backend/sql`, `backend/sql/migrations`, `backend/migrations`,
`backend/src/migrations`, `backend/src/sql` y `backend/scripts`). Se conservan **sin borrar** y agrupados por su
carpeta de origen, solo como referencia.

**Ya están incluidos en la línea base** (`backend/db/migrations/0000_linea_base.sql`), que es la estructura real de
producción. **No volver a ejecutarlos.**

Desde ahora, todo cambio de estructura o de catálogos se hace con una migración nueva:

```bash
cd backend
npm run migrate:create nombre_del_cambio   # crea el archivo con su "subida" y su "bajada"
npm run migrate:status                     # muestra qué se aplicaría, sin tocar la base
npm run migrate:up                         # aplica las pendientes
npm run migrate:down                       # revierte la última
```

# Ambiente de pruebas

> **Estado:** suspendido desde el 2026-10-26 (decisión de la dirección del proyecto). El servidor sigue encendido pero no es parte del flujo de salida.
> Este documento deja listo cómo se usa y se refresca para cuando se reanude.

## Para qué sirve

Es una copia del sistema donde se prueban los cambios **antes** de producción, con datos de prueba, sin enviar correos ni avisos reales y sin consultar a RENAPO/SADER de verdad.

- Sitio: en la red interna de la oficina o con la VPN. La dirección interna y los accesos los tiene el equipo de TI (no se escriben aquí).
- Código: se despliega la rama `staging` con `bash deploy/deploy.sh pruebas`.
- El sitio muestra la franja **"AMBIENTE DE PRUEBAS"** para que nadie lo confunda con producción.

## Qué debe tener (y por qué)

| Configuración del servidor de pruebas | Para qué |
|---|---|
| `IDENTIDAD_SIMULADA=true` | La verificación de CURP usa un simulador. Las tres letras del medio de la CURP eligen el resultado: `REN` válida, `SAD` padrón SADER, `FAL` fallecida, `INV` no existe, `CAI`/`CAD` servicios caídos. No consulta servicios reales. |
| `JOBS_ENABLED=false` | No corren las tareas programadas (avisos, actualización de precios, reverificación). Así una copia de datos reales no manda avisos ni mueve datos. |
| Sin llaves de RENAPO/SADER, sin correo (`SMTP_*`) y sin notificaciones (`VAPID_*`) | Aunque algo fallara, no se puede contactar a nadie real. |
| Otro `JWT_SECRET` y otra base que producción | Una sesión de pruebas nunca sirve en producción. |

## Datos: copia de producción y datos personales

La base de pruebas se arma como **copia de producción** para que las cifras sean realistas (necesario para la comparación "maíz no cambió").
Por eso **contiene datos personales reales** (CURP, teléfonos): quien tenga acceso debe tratarla con el mismo cuidado que producción, no sacarla del servidor y no pegar capturas con datos de personas.

- **Cuándo se refresca:** antes de revisar un ticket que toque maíz (T10, T11) y, en general, una vez al mes. Cada refresco borra lo creado por las pruebas.
- **Cómo:** respaldo de producción (`pg_dump`) → restaurar sobre la base de pruebas → aplicar las migraciones pendientes (`npm run migrate:up`) → `npm run test:seed` para volver a crear los usuarios ficticios.
- **Después de refrescar, comprobar:** que `JOBS_ENABLED=false` y `IDENTIDAD_SIMULADA=true` siguen en el `.env` del servidor de pruebas.
- **Mejor aún (recomendado):** anonimizar nombres, teléfonos y CURP al restaurar. Si se hace, las cifras y los conteos siguen siendo los mismos.

## Usuarios de prueba (paquete de revisión)

Se crean con `npm run test:seed` (datos ficticios, correos `qa.<rol>@ejemplo.test`):

| Rol | Usuario | Para qué |
|---|---|---|
| Administrador | `qa.admin@ejemplo.test` | Panel, permisos, panel de Frijol |
| Técnico de maíz | `qa.maiz1@ejemplo.test` | Flujo de maíz |
| Técnico de frijol | `qa.frijol1@ejemplo.test` (y `qa.frijol2`) | Flujo de frijol |
| Técnico de ambos | `qa.ambos@ejemplo.test` | Cuenta con los dos programas |
| Panel sin permisos | `qa.sinpermisos@ejemplo.test` | Comprobar que sin permiso no se ve la sección |

- **Las contraseñas no están en el repositorio ni en los Pull Requests.** Quien monta el ambiente las define en `TEST_PASSWORD` y se las entrega a la persona que revisa por un canal seguro (en persona o mensajería interna).
- El productor de prueba para los recorridos: usar CURP inventadas con `REN` en el centro (ejemplo de formato: `ZABC900101HDGRENA1`) y nombres ficticios.

### Paquete de revisión por Pull Request

Para cada Pull Request, además de la plantilla, se deja listo para quien revisa:
1. La **dirección** del sitio de pruebas y cómo llegar (red de la oficina o VPN).
2. Los **usuarios** de arriba y dónde recibir las contraseñas.
3. Los **pasos** para ver lo nuevo (qué pantalla abrir, qué botón tocar, qué debe pasar), con capturas.
4. El resultado de `npm test` (y de `npm run test:maiz:comparar` si toca maíz).
5. Una **lista de datos creados** por las pruebas, para limpiarlos si hace falta.

## Protección de ramas en GitHub (la configura quien administre el repositorio)

Quien tenga permiso de **administrador del repositorio** debe, para `main` (y `staging` si es posible):

1. GitHub → el repositorio → **Settings** → **Branches** → **Add branch ruleset** (o *Add rule*).
2. Nombre de la regla, rama objetivo: `main` (repetir para `staging`).
3. Activar **Require a pull request before merging** y poner **Required approvals = 1**.
4. Activar **Block force pushes** y **Restrict deletions**.
5. (Opcional, cuando exista el flujo automático) **Require status checks to pass** → elegir la verificación de pruebas.
6. Guardar. Quien programa **no** puede fusionar su propio Pull Request sin una aprobación.

> Esto no se puede hacer desde el código ni desde el equipo de desarrollo sin ese permiso. **Pendiente de confirmar quién lo configuró.**

## Propuesta (no activada): correr las pruebas automáticamente en cada Pull Request

Un flujo de GitHub Actions (`.github/workflows/pruebas.yml`) que en cada Pull Request levante una base temporal, aplique las migraciones, arranque el backend y corra `npm test`.

| A favor | En contra / cuidado |
|---|---|
| Nadie olvida correr las pruebas; el resultado queda visible en el Pull Request | Necesita una base PostgreSQL con PostGIS dentro del flujo (servicio de contenedor) y que la base baseline se pueda construir ahí |
| Bloquea fusionar si algo falla (junto con la protección de ramas) | Las pruebas de la tarea de verificación y de "servicios caídos" necesitan el backend en la misma máquina: se resuelven corriendo el backend dentro del flujo |
| Cuesta nada en un repositorio público | Si el repositorio es público, el flujo no debe tener secretos; todo sería ficticio, lo cual ya cumplen las pruebas |
| | El flujo de despliegue existente está **desactivado a propósito**; este sería otro archivo, independiente |

**Esfuerzo estimado:** 1 a 2 días (principalmente armar la base temporal con PostGIS y sembrarla). **No se activa sin que la líder del proyecto lo apruebe.**

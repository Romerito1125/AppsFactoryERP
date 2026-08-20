# Deploy en Dockploy

Este proyecto quedó preparado para desplegarse como stack con `docker-compose.yml`.

## Servicios

- `web`: frontend Vite compilado y servido con Nginx.
- `api`: backend NestJS + Prisma.

## Variables recomendadas

Usa `.env.docker.example` como base para las variables del stack:

```env
DATABASE_URL=postgresql://usuario:password@host:5432/base_de_datos
WEB_PORT=9080
```

## Qué usar en Dockploy

1. Crea una app tipo `Compose`.
2. Apunta al repositorio y selecciona `docker-compose.yml`.
3. Carga las variables del archivo `.env.docker.example` en Dockploy.
4. Publica el servicio `web`.

## Dominio

- Usa `mundotienda.appsfactory.com.co` en la pestaña `Domains` de Dockploy.
- Apunta el dominio al servicio `web`.
- Usa puerto interno `80` del contenedor para el dominio.
- Si también expones el host, el mapeo recomendado es `WEB_PORT=9080`.

## Notas

- El frontend consume la API por `/api` en el mismo dominio.
- Nginx hace proxy interno a `api:7502`, así que no hace falta exponer la API públicamente.
- `DATABASE_URL` debe existir en Dockploy y apuntar a tu base de datos ya creada.
- El contenedor `api` levanta directamente NestJS en `7502`; no ejecuta semillas demo ni migraciones en cada reinicio.
- Antes del primer despliegue o después de agregar una migración, ejecuta una tarea puntual en el servicio `api`:

  ```bash
  bun run db:deploy
  ```

- La carga de datos demo es opcional y debe ejecutarse manualmente cuando se necesite:

  ```bash
  bun run db:seed:full-demo
  ```

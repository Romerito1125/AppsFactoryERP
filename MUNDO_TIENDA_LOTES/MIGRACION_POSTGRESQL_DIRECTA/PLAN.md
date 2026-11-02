# Plan de operación: PostgreSQL directo

**Estado:** conexión directa validada, 37 migraciones aplicadas y catálogo inicial cargado; quedan pendientes las pruebas funcionales completas.

**Objetivo:** ejecutar Mundo Tienda únicamente contra PostgreSQL directo en `72.60.31.217:9054`, base `Mundo Tienda`, conservando el comportamiento de la aplicación, los datos, las credenciales propias y las migraciones Prisma.

## Hallazgo actual

- No existe código de proveedor de base de datos en la aplicación; la persistencia usa Prisma y PostgreSQL estándar.
- La configuración ya apunta a PostgreSQL directo mediante `DATABASE_URL` en `app/api/.env`.
- Prisma ya usa PostgreSQL estándar mediante `@prisma/adapter-pg`; no se necesita reemplazar Prisma.
- La conexión directa fue validada correctamente: `current_database()` devuelve `Mundo Tienda`, `current_user` devuelve `postgres` y el servidor responde con PostgreSQL 18.6.
- La base directa ya tiene el esquema de la aplicación; las 37 migraciones Prisma se aplicaron correctamente.
- El endpoint `/health` actual solo confirma que NestJS está levantado; no valida la base de datos.
- Cloudflare R2 y Resend son servicios independientes de la base de datos y se conservan.

## Estado de la base directa

La aplicación ya apunta al servidor PostgreSQL directo y la base destino tiene las tablas Prisma de Mundo Tienda.

Orden usado para habilitar el login:

1. Generar el cliente Prisma con la configuración actual.
2. Ejecutar las migraciones existentes con `DATABASE_URL` apuntando a la base directa.
3. Verificar que se creen `User`, `Employee`, `Client`, permisos y el resto de tablas.
4. Ejecutar la semilla o crear el usuario administrador autorizado.
5. Repetir el login y validar permisos, perfil y refresh.

La cuenta administrativa inicial y seis productos con precios, costos e inventario quedaron cargados en la base directa.

No se deben crear tablas manualmente ni saltar las migraciones del repositorio.

## Cadena objetivo

Usar una cadena URL codificada para el espacio del nombre de la base:

```env
DATABASE_URL=postgresql://postgres:<PASSWORD_REAL>@72.60.31.217:9054/Mundo%20Tienda
```

La cadena ya quedó guardada en `app/api/.env` y no se versiona. Antes de ejecutar migraciones se debe confirmar:

1. si el servidor exige SSL, agregar `?sslmode=require`;
2. permisos del usuario para leer, escribir, crear extensiones necesarias y ejecutar migraciones;
3. zona horaria del servidor y política de conexiones;
4. si el entorno de producción usará `postgres` para migrar o un usuario de aplicación con mínimo privilegio.

La cadena no se debe subir al repositorio. `.env` ya está ignorado por Git.

## Inventario de puntos a migrar

### 1. Configuración de conexión

| Punto | Archivo | Acción |
|---|---|---|
| Runtime NestJS | `app/api/.env` | Mantener la cadena directa validada y fuera de Git. |
| Validación de entorno | `app/api/src/config/envs.ts` | Mantener `DATABASE_URL`; agregar validación de SSL y nombre de entorno si aplica. |
| Cliente Prisma | `app/api/src/shared/prisma/prisma.service.ts` | Mantener `PrismaPg`; validar conexión y registrar host/base sin exponer secretos. |
| Prisma CLI | `app/api/prisma.config.ts` | Mantener `env('DATABASE_URL')`; ejecutar deploy contra la base directa. |
| Desarrollo | `scripts/dev.mjs` | Confirmar que el proceso API lea el `.env` nuevo y no reutilice una API antigua. |
| Turbo | `turbo.json` | Mantener propagación de `DATABASE_URL` a scripts y builds. |
| Docker | `docker-compose.yml`, `.env.docker.example` | Cambiar ejemplos y variables de despliegue al servidor directo. |
| Imagen API | `Dockerfile.api` | Mantener la URL ficticia solo para generar Prisma durante build; nunca usarla en runtime. |
| Documentación | `app/api/README.md`, `DOCKPLOY.md` | Documentar PostgreSQL directo y la carga segura de secretos. |

### 2. Autenticación y usuarios

La aplicación ya tiene autenticación propia:

- `User.password` usa el hash local de `AuthService`.
- `AuthService.login`, `refresh` y `profile` consultan Prisma.
- JWT, empleados, clientes, roles y `UserPermission` viven en tablas propias.

Plan:

1. Migrar `User`, `Employee`, `Client`, `UserPermission` y `AuditLog` conservando IDs, usernames, hashes, roles, estados y relaciones.
2. Mantener `JWT_SECRET` estable durante el cambio para no cerrar sesiones innecesariamente; rotarlo después de validar el corte.
3. Verificar login de administrador, refresh, perfil, permisos efectivos y usuarios inactivos.
4. Mantener la autenticación dentro de las tablas y servicios propios de la aplicación.

### 3. Catálogo e inventario

Migrar y validar:

- `ProductType`, `Product`, `ProductProvider`, `ProductBarcode`, `ProductPrice`, `ProductPriceHistory`;
- `ProductCost`, `ProductWarehouse`, `ProductPackagingProfile`, `ProductFavorite`;
- `Warehouse`, `InventoryMovement`, `InventoryTransferTicket`;
- `Provider`, `Tag`, `ProductTag`.

Funciones que deben probarse después del corte:

- CRUD de productos, tipos, proveedores, etiquetas y bodegas;
- precios por nivel, precio default e historial;
- códigos de barras y escaneo;
- existencias por bodega, ajustes, entradas, salidas y traslados;
- costos, utilidades, favoritos e imágenes.

Las imágenes continúan en Cloudflare R2. Solo se valida que las URLs almacenadas sigan accesibles; no se trasladan a PostgreSQL.

### 4. Ventas, caja y facturación

Migrar y validar:

- `Invoice`, `InvoiceItem`, `InvoiceCredit`, `CreditPayment`;
- `Quote`, `QuoteItem`;
- `Offer`, `OfferClient`, `OfferProduct`, `OfferProductType`, `OfferTag`;
- `Delivery`;
- `ReferralProfitPolicy`, `ReferralBenefit`, `ReferralBenefitRedemption`, `ReferralSocialContribution`;
- `Notification`, `NotificationRead`.

Funciones a verificar:

- login y apertura de POS;
- facturación desde `/pos` y Ventas;
- precios, IVA, descuentos y ofertas;
- crédito, cartera, pagos y límites;
- cotizaciones y conversión a factura;
- domicilios, pedidos y envío a bodega;
- referidos y beneficios;
- notificaciones y auditoría.

Se deben conservar los importes históricos, consecutivos, estados, fechas, bodegas, usuarios y relaciones. No se deben recalcular facturas históricas por cambiar de servidor.

### 5. Compras, finanzas y configuración

Migrar y validar:

- `PurchaseOrder`, `PurchaseOrderItem` y documentos adjuntos;
- `BankAccount`, `BankAccountMovement`;
- `Retention`, `RetentionRange`;
- enums y tablas auxiliares asociadas.

Funciones a probar:

- compras, recepción y actualización de costos;
- cuentas bancarias, ingresos, egresos y transferencias;
- retenciones y rangos;
- reportes de compras, ventas, IVA, GMF, inventario y cartera.

Los correos de reportes continúan usando Resend. Solo se verifica que los reportes consulten la nueva base.

### 6. Scripts y operación

Todos los scripts de `app/api/scripts/` ya reciben `process.env.DATABASE_URL`. Deben ejecutarse con la URL directa después de migrar:

- semillas de personal y acceso rápido;
- datos demo y ejemplos de módulos;
- imágenes y correcciones de catálogo;
- QA CRUD y pruebas de flujos comerciales;
- tareas de bodegas, compras, pagos y referidos.

No se debe ejecutar ningún script de limpieza o reset sobre la base destino hasta tener respaldo y aprobación explícita.

## Fases de ejecución

### Fase 0 — credenciales y conectividad

1. Confirmar contraseña real, SSL y permisos de `postgres`.
2. Probar `current_database()`, `current_user`, versión de PostgreSQL y `information_schema`.
3. Crear un usuario de aplicación con mínimo privilegio para runtime; reservar `postgres` para migraciones si la operación lo permite.
4. Crear respaldo lógico de cualquier base destino existente antes de tocarla.

**Salida:** conexión validada y credenciales guardadas fuera de Git.

### Fase 1 — compatibilidad del esquema

1. Comparar versión de PostgreSQL, extensiones, collation, timezone y límites de conexión.
2. Ejecutar `bun run db:generate` con la cadena destino.
3. Ejecutar `bun run db:deploy` contra una base de staging o esquema temporal.
4. Revisar que las 36 migraciones del repositorio apliquen en orden y que los índices, constraints, enums y secuencias queden creados.
5. Confirmar que no haya SQL dependiente de servicios externos; usar únicamente capacidades estándar de PostgreSQL.

**Salida:** esquema destino compatible y reproducible desde migraciones.

### Fase 2 — migración de datos

1. Obtener un dump de la base origen o confirmar que la base directa será la fuente inicial; si no se requieren históricos, no se hace una importación adicional.
2. Congelar escrituras o definir una ventana de corte.
3. Exportar tablas en orden de dependencias y restaurar conservando IDs.
4. Restaurar secuencias con `setval` después de cargar datos.
5. Validar conteos, sumas financieras, fechas mínimas/máximas, estados y huérfanos.
6. Auditar los archivos externos por sus URLs; las imágenes de R2 se conservan y no se trasladan a PostgreSQL.

**Salida:** base directa con datos completos y consistentes.

### Fase 3 — cambio controlado de configuración

1. Respaldar `app/api/.env` actual fuera del repositorio.
2. Guardar la URL directa validada en `app/api/.env`.
3. Actualizar `.env.docker.example`, Dockploy y secretos del entorno de despliegue.
4. Reiniciar API y frontend; confirmar que solo existe un proceso API activo.
5. Implementar health check que pruebe también `SELECT 1` y muestre estado de migraciones.

**Salida:** desarrollo y despliegue usan PostgreSQL directo y una única fuente de conexión.

### Fase 4 — pruebas funcionales y corte

1. Ejecutar login, refresh y permisos.
2. Ejecutar CRUD de cada módulo y flujos transaccionales.
3. Comparar reportes antes/después.
4. Probar imágenes R2 y envío de reportes Resend.
5. Revisar logs, tiempos de respuesta, conexiones y errores de Prisma.
6. Hacer el corte definitivo cuando los conteos y totales coincidan.

## Plan de rollback

- Conservar el dump de origen y el respaldo de configuración anterior.
- Mantener la URL anterior en un archivo seguro fuera del repositorio.
- Si falla la validación, restaurar `DATABASE_URL`, reiniciar API y detener escrituras en la base destino.
- No borrar la base origen ni sus respaldos durante la primera ventana de operación.
- Registrar cualquier diferencia de conteos o totales antes de reintentar.

## Matriz de aceptación

| Área | Criterio |
|---|---|
| Conexión | `SELECT 1` estable y sin errores de autenticación |
| Esquema | Todas las migraciones aplicadas y Prisma operativo |
| Login | Administrador puede iniciar sesión y consultar perfil |
| Datos | Conteos, IDs, relaciones y secuencias coinciden |
| Finanzas | Subtotales, IVA, totales, saldos y pagos coinciden |
| Inventario | Existencias y movimientos coinciden por bodega |
| Archivos | URLs R2 siguen funcionando |
| Reportes | Consultas y correo Resend funcionan |
| Operación | Health check detecta caída de base y no reporta falso positivo |
| Seguridad | No quedan credenciales en Git ni dependencias de proveedor de base de datos |

## Pendientes actuales

1. Confirmar si la base directa ya contiene datos históricos que deban conservarse o si se cargará un respaldo de otra base.
2. Confirmar SSL, permisos de migración y usuario de runtime para producción.
3. Si se requieren datos históricos de otra base, obtener un dump o acceso de lectura antes del corte.

## Criterio para iniciar la ejecución

Iniciar solo cuando estén disponibles:

- confirmación de SSL y permisos;
- respaldo/dump de la base de origen o confirmación de que la base destino empieza vacía;
- ventana de cambio y criterio de rollback.


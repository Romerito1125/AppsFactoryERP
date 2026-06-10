# API REST Modular con NestJS, Bun y Prisma

Base de monolito modular para una API REST construida con NestJS + TypeScript, Bun como gestor de paquetes y Prisma como ORM.

La aplicación corre como un solo proceso NestJS. No usa microservicios, NATS, RabbitMQ ni comunicación entre servicios.

## Arquitectura

La estructura separa configuración, código común, Prisma compartido y módulos de negocio:

```txt
src/
  config/
    envs.ts
  shared/
    prisma/
      prisma.module.ts
      prisma.service.ts
  common/
    decorators/
    enums/
    guards/
  modules/
    usuarios/
    clientes/
    productos/
    bodegas/
    facturas/
```

Cada dominio tiene su propio módulo, controlador, servicio y DTOs.

## Requisitos

- Bun
- PostgreSQL
- Variables de entorno configuradas en `.env`

Ejemplo:

```env
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/app"
```

También puedes tomar `.env.example` como base.

## Instalación y ejecución

```bash
bun install
bunx prisma generate
bunx prisma migrate dev
bun run start:dev
```

Comandos útiles:

```bash
bun run build
bun run format
bun run test
```

## Prisma

El schema está en `prisma/schema.prisma` y define:

- `User`
- `Client`
- `Warehouse`
- `Product`
- `Invoice`
- `InvoiceItem`
- `Role`
- `InvoiceStatus`

Este proyecto usa Prisma 7. Por eso la URL de conexión no vive dentro de `schema.prisma`; se configura en `prisma.config.ts` usando `DATABASE_URL`.

## Validación

La validación global está configurada en `src/main.ts`:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
);
```

Los DTOs usan `class-validator` y `class-transformer` para validar cuerpos, queries e IDs numéricos positivos cuando aplica.

## Endpoints

Las rutas usan sustantivos en español y siguen convenciones REST.

### Usuarios

- `GET /usuarios`
- `GET /usuarios/:id`
- `POST /usuarios`
- `PATCH /usuarios/:id`
- `DELETE /usuarios/:id`

Notas:

- `DELETE` hace eliminación lógica con `isActive = false` y `deletedAt`.
- La contraseña se guarda hasheada.
- Existe estructura base para permisos con `@Roles(...)`, `RolesGuard` y `Role`.

### Clientes

- `GET /clientes`
- `GET /clientes?estado=inactivos`
- `GET /clientes?estado=todos`
- `GET /clientes/:id`
- `POST /clientes`
- `PATCH /clientes/:id`
- `DELETE /clientes/:id`
- `PATCH /clientes/:id/reactivar`

Notas:

- Por defecto `GET /clientes` retorna solo activos.
- `identification` es único, incluso si el cliente está inactivo.
- `DELETE` no elimina físicamente.

### Productos

- `GET /productos`
- `GET /productos?estado=inactivos`
- `GET /productos?estado=todos`
- `GET /productos/:id`
- `POST /productos`
- `PATCH /productos/:id`
- `DELETE /productos/:id`
- `PATCH /productos/:id/reactivar`

Notas:

- Por defecto retorna productos activos.
- `warehouseId` relaciona el producto con una bodega.
- `quantity` representa inventario disponible.
- `price`, `taxRate` y `quantity` no aceptan valores negativos.

### Bodegas

- `GET /bodegas`
- `GET /bodegas?estado=inactivos`
- `GET /bodegas?estado=todos`
- `GET /bodegas/:id`
- `POST /bodegas`
- `PATCH /bodegas/:id`
- `DELETE /bodegas/:id`
- `PATCH /bodegas/:id/reactivar`

Notas:

- `DELETE` hace eliminación lógica.
- No se borran bodegas físicamente para conservar relaciones históricas con productos.

### Facturas

- `GET /facturas`
- `GET /facturas/:id`
- `POST /facturas`
- `PATCH /facturas/:id`
- `DELETE /facturas/:id`

Ejemplo para crear factura:

```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 3,
      "quantity": 1
    }
  ]
}
```

Notas:

- La factura pertenece a un cliente.
- Los productos se guardan mediante `InvoiceItem`, no como arreglo simple.
- El backend consulta precio e impuesto actual del producto.
- El backend calcula subtotal, impuestos y total por item y por factura.
- La creación descuenta inventario en transacción.
- Si no hay stock suficiente, lanza error y no crea la factura.
- `DELETE /facturas/:id` anula la factura y devuelve stock en transacción.
- `PATCH /facturas/:id` solo actualiza campos no contables básicos; no recalcula items ni totales.

## Reglas de negocio importantes

- No se eliminan físicamente usuarios, clientes, productos, bodegas ni facturas.
- Las facturas anuladas mantienen sus `InvoiceItem`.
- Los endpoints están en español; modelos y campos internos están en inglés.
- Las operaciones sensibles de facturación usan transacciones Prisma.
- `username`, `identification` y `consecutive` son únicos.

## Siguientes pasos sugeridos

1. Crear `.env` con una `DATABASE_URL` real.
2. Ejecutar `bunx prisma migrate dev`.
3. Agregar autenticación JWT y poblar `request.user` para que `RolesGuard` valide usuarios reales.

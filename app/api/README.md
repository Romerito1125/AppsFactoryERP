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

`GET /usuarios`

No recibe body. Lista usuarios registrados sin exponer la contraseña.

`GET /usuarios/:id`

No recibe body. `id` debe ser un número positivo.

`POST /usuarios`

Body requerido:

```json
{
  "username": "admin",
  "password": "secret123",
  "role": "ADMIN"
}
```

Body con campo opcional:

```json
{
  "username": "vendedor1",
  "password": "secret123",
  "role": "VENDEDOR",
  "isActive": true
}
```

Roles válidos: `ADMIN`, `VENDEDOR`, `BODEGA`, `CONTADOR`.

`PATCH /usuarios/:id`

Body parcial. Envía solo los campos a cambiar:

```json
{
  "password": "nuevoSecret123",
  "role": "CONTADOR",
  "isActive": true
}
```

`DELETE /usuarios/:id`

No recibe body. Hace eliminación lógica con `isActive = false` y `deletedAt`.

Notas:

- La contraseña se guarda hasheada.
- Existe estructura base para permisos con `@Roles(...)`, `RolesGuard` y `Role`.

### Clientes

`GET /clientes`

No recibe body. Por defecto retorna solo clientes activos.

`GET /clientes?estado=inactivos`

No recibe body. Retorna clientes inactivos.

`GET /clientes?estado=todos`

No recibe body. Retorna clientes activos e inactivos.

`GET /clientes/:id`

No recibe body. Puede consultar clientes activos o inactivos.

`POST /clientes`

Body requerido:

```json
{
  "identification": "123456789",
  "firstName": "Juan",
  "lastName": "Pérez"
}
```

Body con campos opcionales:

```json
{
  "identification": "123456789",
  "firstName": "Juan",
  "lastName": "Pérez",
  "phone": "3001234567",
  "address": "Calle 123 #45-67"
}
```

`PATCH /clientes/:id`

Body parcial. Envía solo los campos a cambiar:

```json
{
  "phone": "3112223344",
  "address": "Carrera 10 #20-30"
}
```

También permite cambiar identificación si no existe en otro cliente:

```json
{
  "identification": "987654321"
}
```

`DELETE /clientes/:id`

No recibe body. Marca `isActive = false` y `deletedAt`.

`PATCH /clientes/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

Notas:

- `identification` es único, incluso si el cliente está inactivo.
- Si `identification` ya existe, responde `409 Conflict`.

### Productos

`GET /productos`

No recibe body. Por defecto retorna solo productos activos.

`GET /productos?estado=inactivos`

No recibe body. Retorna productos inactivos.

`GET /productos?estado=todos`

No recibe body. Retorna productos activos e inactivos.

`GET /productos/:id`

No recibe body. `id` debe ser un número positivo.

`POST /productos`

Body requerido:

```json
{
  "type": "alimento",
  "name": "Café premium",
  "price": 25000,
  "taxRate": 19,
  "quantity": 50,
  "warehouseId": 1
}
```

Body con descripción opcional:

```json
{
  "type": "tecnología",
  "name": "Mouse inalámbrico",
  "description": "Mouse ergonómico de 2.4 GHz",
  "price": 85000,
  "taxRate": 19,
  "quantity": 20,
  "warehouseId": 1
}
```

`PATCH /productos/:id`

Body parcial. Envía solo los campos a cambiar:

```json
{
  "price": 90000,
  "quantity": 25
}
```

Otro ejemplo:

```json
{
  "name": "Mouse inalámbrico pro",
  "description": "Versión actualizada",
  "taxRate": 19
}
```

`DELETE /productos/:id`

No recibe body. Hace eliminación lógica para conservar historial de facturas.

`PATCH /productos/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

Notas:

- `warehouseId` debe existir.
- `price`, `taxRate` y `quantity` no aceptan valores negativos.
- `quantity` representa inventario disponible.

### Bodegas

`GET /bodegas`

No recibe body. Por defecto retorna solo bodegas activas.

`GET /bodegas?estado=inactivos`

No recibe body. Retorna bodegas inactivas.

`GET /bodegas?estado=todos`

No recibe body. Retorna bodegas activas e inactivas.

`GET /bodegas/:id`

No recibe body. Incluye sus productos relacionados.

`POST /bodegas`

Body requerido:

```json
{
  "location": "Bodega principal Bogotá"
}
```

`PATCH /bodegas/:id`

Body parcial:

```json
{
  "location": "Bodega norte Medellín"
}
```

`DELETE /bodegas/:id`

No recibe body. Hace eliminación lógica.

`PATCH /bodegas/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

Notas:

- No se borran bodegas físicamente para conservar relaciones históricas con productos.

### Facturas

`GET /facturas`

No recibe body. Lista facturas con cliente e items.

`GET /facturas/:id`

No recibe body. Consulta una factura con cliente, items y productos.

`POST /facturas`

Body requerido:

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

Reglas del body:

- `clientId` debe existir y estar activo.
- `items` debe tener al menos un producto.
- `productId` debe existir y estar activo.
- `quantity` debe ser un número entero positivo.
- Debe existir stock suficiente para cada producto.

`PATCH /facturas/:id`

Body parcial. Por ahora solo permite actualizar campos no contables básicos:

```json
{
  "consecutive": "FAC-2026-0001"
}
```

`DELETE /facturas/:id`

No recibe body. Marca la factura como `ANULADA` y devuelve el stock de sus items.

Notas:

- Los productos se guardan mediante `InvoiceItem`, no como arreglo simple.
- El backend consulta precio e impuesto actual del producto.
- El backend calcula subtotal, impuestos y total por item y por factura.
- La creación descuenta inventario en transacción.
- Si no hay stock suficiente, lanza error y no crea la factura.
- `PATCH /facturas/:id` no recalcula items ni totales para evitar inconsistencias contables.

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

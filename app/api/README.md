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
    product-prices/
    product-types/
    tags/
    bodegas/
    facturas/
    deliveries/
    referrals/
    ofertas/
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

Pruebas HTTP de contratos contra un backend corriendo:

```bash
bun scripts/test-api-contracts.ts
```

Por defecto usa `http://localhost:3000`. Para otro host:

```bash
API_URL="http://localhost:3001" bun scripts/test-api-contracts.ts
```

El script crea datos de prueba únicos y valida los endpoints nuevos/ajustados con 5 verificaciones por endpoint: productos con precios, precios de producto, facturas con `productPriceId`, domicilios y referidos.

## Prisma

El schema está en `prisma/schema.prisma` y define:

- `User`
- `Client`
- `Warehouse`
- `ProductType`
- `Product`
- `ProductPrice`
- `Tag`
- `ProductTag`
- `Invoice`
- `Delivery`
- `InvoiceItem`
- `Referral`
- `Offer`
- `OfferClient`
- `OfferProduct`
- `OfferProductType`
- `OfferTag`
- `Role`
- `InvoiceStatus`
- `DeliveryStatus`
- `DiscountType`

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
  "clientId": 1,
  "username": "admin",
  "password": "secret123",
  "role": "ADMIN"
}
```

Body con campo opcional:

```json
{
  "clientId": 2,
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
  "clientId": 3,
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

`GET /clientes/:id/referidos`

No recibe body. Retorna los clientes referidos por el cliente `:id`.

`POST /clientes/:id/codigo-referido`

No recibe body. Si el cliente no tiene código de referido, lo genera; si ya tiene uno, retorna el existente.

Respuesta esperada:

```json
{
  "id": 1,
  "identification": "123456789",
  "firstName": "Juan",
  "lastName": "Pérez",
  "referralCode": "JUAN1A9X2"
}
```

Notas:

- `identification` es único, incluso si el cliente está inactivo.
- Si `identification` ya existe, responde `409 Conflict`.
- `referralCode` es único y se guarda en el cliente.

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

Body requerido. `prices` es opcional; si se envía un solo precio sin `isDefault`, queda como default automáticamente. Si se envían varios precios sin default, el primero queda como default. Si se envían varios con `isDefault = true`, responde `400`.

```json
{
  "productTypeId": 1,
  "name": "Café premium",
  "taxRate": 19,
  "quantity": 50,
  "warehouseId": 1,
  "prices": [
    {
      "name": "Precio normal",
      "price": 25000,
      "isDefault": true
    }
  ]
}
```

Body con descripción, etiquetas y varios precios:

```json
{
  "productTypeId": 2,
  "name": "Mouse inalámbrico",
  "description": "Mouse ergonómico de 2.4 GHz",
  "taxRate": 19,
  "quantity": 20,
  "warehouseId": 1,
  "tagIds": [1, 2, 3],
  "prices": [
    {
      "name": "Precio normal",
      "price": 85000,
      "isDefault": true
    },
    {
      "name": "Precio mayorista",
      "price": 78000
    }
  ]
}
```

`PATCH /productos/:id`

Body parcial. Envía solo los campos a cambiar:

```json
{
  "quantity": 25,
  "tagIds": [1, 3]
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

- `productTypeId` debe existir y estar activo.
- `warehouseId` debe existir y estar activo.
- `tagIds` es opcional; si se envía en actualización, reemplaza todas las etiquetas anteriores.
- `taxRate` y `quantity` no aceptan valores negativos.
- `quantity` representa inventario disponible.
- Las respuestas incluyen `productType`, `warehouse`, `tags` y `prices` como arrays/objetos listos para mostrar en frontend.

### Precios de producto

`GET /precios-producto`

No recibe body. Lista todos los precios con su producto relacionado.

`GET /precios-producto/:id`

No recibe body. Consulta un precio por id.

`GET /productos/:id/precios`

No recibe body. Lista los precios del producto `:id`.

`POST /productos/:id/precios`

Body requerido:

```json
{
  "name": "Precio normal",
  "price": 85000,
  "isDefault": true,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "endsAt": "2026-12-31T23:59:59.000Z"
}
```

Body mínimo:

```json
{
  "name": "Precio mayorista",
  "price": 78000
}
```

`PATCH /precios-producto/:id`

Body parcial:

```json
{
  "name": "Precio mayorista actualizado",
  "price": 76000,
  "isActive": true
}
```

`DELETE /precios-producto/:id`

No recibe body. No borra físicamente; marca `isActive = false` y `isDefault = false`.

`PATCH /precios-producto/:id/default`

No recibe body. Marca ese precio activo como default y desmarca los demás precios del mismo producto dentro de una transacción.

Notas:

- `price` debe ser mayor que 0.
- `endsAt` debe ser mayor que `startsAt` si ambas fechas existen.
- Un precio inactivo no puede ser default.
- Debe existir máximo un precio default activo por producto.
- Los precios no se eliminan físicamente porque las facturas históricas pueden referenciarlos.

### Tipos de producto

`GET /tipos-producto`

No recibe body. Por defecto retorna solo tipos activos.

`GET /tipos-producto?estado=inactivos`

No recibe body. Retorna tipos inactivos.

`GET /tipos-producto?estado=todos`

No recibe body. Retorna tipos activos e inactivos.

`GET /tipos-producto/:id`

No recibe body. `id` debe ser un número positivo.

`POST /tipos-producto`

Body requerido:

```json
{
  "name": "Tecnología",
  "description": "Productos tecnológicos y accesorios"
}
```

`PATCH /tipos-producto/:id`

Body parcial:

```json
{
  "description": "Periféricos, accesorios y dispositivos"
}
```

`DELETE /tipos-producto/:id`

No recibe body. Hace soft delete. No permite desactivar si tiene productos activos asociados.

`PATCH /tipos-producto/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

Notas:

- `name` es único.
- No se elimina físicamente para conservar relaciones con productos y ofertas.

### Etiquetas

`GET /etiquetas`

No recibe body. Por defecto retorna solo etiquetas activas.

`GET /etiquetas?estado=inactivos`

No recibe body. Retorna etiquetas inactivas.

`GET /etiquetas?estado=todos`

No recibe body. Retorna etiquetas activas e inactivas.

`GET /etiquetas/:id`

No recibe body. `id` debe ser un número positivo.

`POST /etiquetas`

Body requerido:

```json
{
  "name": "Destacado",
  "description": "Productos destacados para promociones"
}
```

`PATCH /etiquetas/:id`

Body parcial:

```json
{
  "name": "Promoción"
}
```

`DELETE /etiquetas/:id`

No recibe body. Hace soft delete.

`PATCH /etiquetas/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

Notas:

- `name` es único.
- Una etiqueta puede relacionarse con productos y ofertas.

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

### Ofertas

`GET /ofertas`

No recibe body. Por defecto retorna solo ofertas activas.

`GET /ofertas?estado=inactivos`

No recibe body. Retorna ofertas inactivas.

`GET /ofertas?estado=todos`

No recibe body. Retorna ofertas activas e inactivas.

`GET /ofertas/:id`

No recibe body. Retorna la oferta con `clients`, `products`, `productTypes` y `tags`.

`POST /ofertas`

Body para una oferta con targets:

```json
{
  "name": "Descuento productos del mes",
  "description": "Oferta especial para productos destacados",
  "discountType": "PORCENTAJE",
  "discountValue": 15,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "endsAt": "2026-06-30T23:59:59.000Z",
  "clientIds": [1, 2],
  "productIds": [5, 6],
  "productTypeIds": [3],
  "tagIds": [1]
}
```

Body para una oferta general:

```json
{
  "name": "Descuento general",
  "discountType": "MONTO_FIJO",
  "discountValue": 10000
}
```

`PATCH /ofertas/:id`

Body parcial. Si se envía un array de IDs, reemplaza por completo esa relación:

```json
{
  "discountValue": 20,
  "productTypeIds": [1, 4],
  "tagIds": [2]
}
```

`DELETE /ofertas/:id`

No recibe body. Hace soft delete con `isActive = false` y `deletedAt`.

`PATCH /ofertas/:id/reactivar`

No recibe body. Marca `isActive = true` y `deletedAt = null`.

`POST /ofertas/aplicables`

Consulta ofertas aplicables para un cliente y productos. No modifica facturas ni totales.

```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 5,
      "quantity": 2
    },
    {
      "productId": 9,
      "quantity": 1
    }
  ]
}
```

Respuesta esperada:

```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 5,
      "quantity": 2,
      "applicableOffers": [
        {
          "id": 1,
          "name": "Descuento productos del mes",
          "discountType": "PORCENTAJE",
          "discountValue": "15"
        }
      ]
    }
  ]
}
```

Notas:

- `discountType` acepta `PORCENTAJE` o `MONTO_FIJO`.
- `PORCENTAJE` exige `discountValue > 0` y `<= 100`.
- `MONTO_FIJO` exige `discountValue > 0`.
- Si existen `startsAt` y `endsAt`, `endsAt` debe ser mayor que `startsAt`.
- Una oferta aplica si es general o coincide con cliente, producto, tipo de producto o alguna etiqueta del producto.

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
      "productPriceId": 2,
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
- `productPriceId` es opcional. Si se envía, debe existir, estar activo y pertenecer al `productId`.
- Si no se envía `productPriceId`, el backend usa el precio default activo del producto.
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
- El backend consulta el precio activo indicado por `productPriceId` o el precio default activo del producto.
- El backend calcula subtotal, impuestos y total por item y por factura.
- `unitPrice` guarda una copia histórica del precio usado; si luego cambia `ProductPrice.price`, la factura no cambia.
- Las respuestas de factura incluyen `productPrice` cuando el item lo tiene asociado.
- La creación descuenta inventario en transacción.
- Si no hay stock suficiente, lanza error y no crea la factura.
- `PATCH /facturas/:id` no recalcula items ni totales para evitar inconsistencias contables.

### Domicilios

`GET /domicilios`

No recibe body. Lista domicilios con la factura relacionada y su `consecutive`.

`GET /domicilios/:id`

No recibe body. Consulta un domicilio por id.

`POST /domicilios`

Body requerido:

```json
{
  "invoiceId": 1,
  "address": "Calle 123 #45-67",
  "recipientName": "Juan Pérez",
  "recipientPhone": "3001234567",
  "notes": "Entregar en portería"
}
```

`PATCH /domicilios/:id`

Body parcial:

```json
{
  "address": "Carrera 10 #20-30",
  "recipientPhone": "3112223344",
  "notes": "Llamar antes de llegar"
}
```

`PATCH /domicilios/:id/estado`

Body requerido:

```json
{
  "status": "EN_CAMINO"
}
```

Estados válidos: `PENDIENTE`, `EN_PREPARACION`, `EN_CAMINO`, `ENTREGADO`, `CANCELADO`.

`DELETE /domicilios/:id`

No recibe body. No borra físicamente porque `Delivery` no tiene `isActive`; marca `status = CANCELADO` y limpia `deliveredAt`.

Notas:

- `invoiceId` debe existir.
- Una factura anulada no puede recibir domicilio.
- `invoiceId` es único: una factura solo puede tener un domicilio.
- Si el estado cambia a `ENTREGADO`, el backend llena `deliveredAt` con la fecha actual.
- Si el estado cambia de `ENTREGADO` a otro estado, el backend limpia `deliveredAt` para reflejar que ya no está entregado.

### Referidos

`GET /referidos`

No recibe body. Lista referidos con datos básicos de quien refiere y del referido.

`GET /referidos/:id`

No recibe body. Consulta un referido por id.

`GET /clientes/:id/referidos`

No recibe body. Lista los referidos generados por el cliente `:id`.

`POST /clientes/:id/codigo-referido`

No recibe body. Genera o retorna el código existente del cliente.

`POST /referidos`

Body requerido:

```json
{
  "referredClientId": 10,
  "codeUsed": "JUAN123"
}
```

Notas:

- `codeUsed` debe existir en `Client.referralCode`.
- El dueño del código debe estar activo.
- `referredClientId` debe existir y estar activo.
- Un cliente no puede referirse a sí mismo.
- Un cliente referido solo puede tener un registro en `Referral`.
- Las respuestas incluyen datos básicos de `referrerClient` y `referredClient`.

## Peticiones desde frontend

El backend recibe y responde JSON. Desde el frontend usa siempre `Content-Type: application/json` cuando envíes body.

Ejemplo de cliente HTTP simple:

```ts
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? 'Error inesperado del backend');
  }

  return response.json();
}
```

Crear un tipo de producto:

```ts
await apiRequest('/tipos-producto', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Tecnología',
    description: 'Productos tecnológicos y accesorios',
  }),
});
```

Crear etiquetas:

```ts
await apiRequest('/etiquetas', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Destacado',
    description: 'Productos visibles en promociones',
  }),
});
```

Crear un producto con tipo y etiquetas:

```ts
await apiRequest('/productos', {
  method: 'POST',
  body: JSON.stringify({
    productTypeId: 1,
    name: 'Mouse Logitech',
    description: 'Mouse inalámbrico',
    taxRate: 19,
    quantity: 10,
    warehouseId: 1,
    tagIds: [1, 2, 3],
    prices: [
      { name: 'Precio normal', price: 85000, isDefault: true },
      { name: 'Precio mayorista', price: 78000 },
    ],
  }),
});
```

Crear un precio para un producto existente:

```ts
await apiRequest('/productos/5/precios', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Precio temporada',
    price: 82000,
  }),
});
```

Marcar un precio como default:

```ts
await apiRequest('/precios-producto/8/default', {
  method: 'PATCH',
});
```

Actualizar etiquetas de un producto:

```ts
await apiRequest('/productos/5', {
  method: 'PATCH',
  body: JSON.stringify({
    tagIds: [2, 4],
  }),
});
```

Importante: enviar `tagIds` en `PATCH /productos/:id` reemplaza todas las etiquetas del producto. Si no quieres modificar etiquetas, no envíes `tagIds`.

Crear una oferta por cliente, producto, tipo de producto o etiqueta:

```ts
await apiRequest('/ofertas', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Descuento productos del mes',
    description: 'Oferta especial para productos destacados',
    discountType: 'PORCENTAJE',
    discountValue: 15,
    startsAt: '2026-06-01T00:00:00.000Z',
    endsAt: '2026-06-30T23:59:59.000Z',
    clientIds: [1, 2],
    productIds: [5, 6],
    productTypeIds: [3],
    tagIds: [1],
  }),
});
```

Crear una oferta general:

```ts
await apiRequest('/ofertas', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Descuento general',
    discountType: 'MONTO_FIJO',
    discountValue: 10000,
  }),
});
```

Consultar ofertas aplicables antes de facturar:

```ts
const result = await apiRequest('/ofertas/aplicables', {
  method: 'POST',
  body: JSON.stringify({
    clientId: 1,
    items: [
      { productId: 5, quantity: 2 },
      { productId: 9, quantity: 1 },
    ],
  }),
});
```

Crear una factura:

```ts
await apiRequest('/facturas', {
  method: 'POST',
  body: JSON.stringify({
    clientId: 1,
    items: [
      { productId: 5, productPriceId: 8, quantity: 2 },
      { productId: 9, quantity: 1 },
    ],
  }),
});
```

Crear un domicilio para una factura:

```ts
await apiRequest('/domicilios', {
  method: 'POST',
  body: JSON.stringify({
    invoiceId: 1,
    address: 'Calle 123 #45-67',
    recipientName: 'Juan Pérez',
    recipientPhone: '3001234567',
    notes: 'Entregar en portería',
  }),
});
```

Actualizar estado de domicilio:

```ts
await apiRequest('/domicilios/1/estado', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'ENTREGADO' }),
});
```

Generar código de referido:

```ts
const client = await apiRequest('/clientes/1/codigo-referido', {
  method: 'POST',
});
```

Registrar referido:

```ts
await apiRequest('/referidos', {
  method: 'POST',
  body: JSON.stringify({
    referredClientId: 10,
    codeUsed: client.referralCode,
  }),
});
```

Notas para frontend:

- Los IDs deben enviarse como números, no strings.
- Las fechas se envían en ISO 8601, por ejemplo `2026-06-01T00:00:00.000Z`.
- Los listados aceptan `?estado=inactivos` y `?estado=todos`; sin query retornan activos.
- Para facturar, envía `productPriceId` cuando el usuario seleccione un precio específico; si no, el backend usa el precio default activo.
- Las ofertas aplicables son solo consulta; la factura todavía no descuenta ofertas automáticamente.
- Si el backend responde `400`, revisa validaciones de DTO: IDs positivos, arrays únicos, fechas y descuentos.

## Reglas de negocio importantes

- No se eliminan físicamente usuarios, clientes, productos, bodegas, tipos de producto, etiquetas ni ofertas.
- Las facturas anuladas mantienen sus `InvoiceItem`.
- Los domicilios cancelados mantienen el registro con `status = CANCELADO`.
- Los precios de producto desactivados mantienen el registro con `isActive = false`.
- Los endpoints están en español; modelos y campos internos están en inglés.
- Las operaciones sensibles de facturación usan transacciones Prisma.
- Las escrituras de productos con etiquetas y ofertas con targets usan transacciones Prisma.
- `username`, `identification`, `consecutive`, `ProductType.name`, `Tag.name`, `Client.referralCode`, `User.clientId`, `Delivery.invoiceId` y `Referral.referredClientId` son únicos.

## Siguientes pasos sugeridos

1. Crear `.env` con una `DATABASE_URL` real.
2. Ejecutar `bunx prisma migrate dev`.
3. Agregar autenticación JWT y poblar `request.user` para que `RolesGuard` valide usuarios reales.

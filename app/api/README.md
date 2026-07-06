# API REST Modular ERP

API NestJS + TypeScript ejecutada con Bun, Prisma y PostgreSQL/Supabase. Es un monolito modular: no usa microservicios, NATS, RabbitMQ ni mensajería.

Base local por defecto:

```txt
http://localhost:3000
```

Para enviar bodies JSON usa:

```http
Content-Type: application/json
```

Para endpoints protegidos, envía el JWT en cada request:

```http
Authorization: Bearer <accessToken>
```

Excepción: los endpoints de productos que reciben imagen usan `multipart/form-data`. En ese caso no fijes manualmente el header `Content-Type`; deja que el navegador, `fetch`, `axios` o Postman agreguen el `boundary` automáticamente.

## Comandos

```bash
bun install
bunx prisma format
bunx prisma generate
bun run start:dev
```

Si necesitas migrar:

```bash
bunx prisma migrate dev --name update_erp_features
```

Para agregar soporte de múltiples códigos de barras por producto:

```bash
bunx prisma migrate dev --name add_product_barcodes
```

Build y formato:

```bash
bun run build
bun run format
```

Pruebas HTTP contra el servidor corriendo en el puerto 3000:

```bash
bun run test:erp-endpoints
```

Con otra URL:

```bash
API_URL="http://localhost:3001" bun run test:erp-endpoints
```

El script `scripts/test-erp-endpoints.ts` crea datos únicos, ejecuta casos válidos con 10 registros de prueba por dominio principal y también valida escenarios que deben fallar.

## Queries Comunes

Los módulos con soft delete listan activos por defecto y aceptan:

```http
GET /recurso?estado=inactivos
GET /recurso?estado=todos
```

Aplica a clientes, productos, tipos de producto, etiquetas, bodegas, proveedores y ofertas.

## Autenticación

| Método | Ruta | Qué hace | Body | Auth |
| --- | --- | --- | --- | --- |
| POST | `/auth/registro` | Registra cliente final, crea usuario `CLIENTE` y retorna JWT | Sí | No |
| POST | `/auth/login` | Valida credenciales y retorna JWT | Sí | No |
| GET | `/auth/perfil` | Retorna usuario autenticado con `client` o `employee` | No | Bearer JWT |

Registro de cliente final desde frontend:

```json
{
  "identification": "123456789",
  "firstName": "Juan",
  "lastName": "Zuluaga",
  "phone": "3000000000",
  "address": "Cali",
  "username": "juan",
  "password": "Password123"
}
```

Login:

```json
{
  "username": "juan",
  "password": "Password123"
}
```

Respuesta esperada en registro y login:

```json
{
  "accessToken": "jwt...",
  "user": {
    "id": 1,
    "clientId": 1,
    "username": "juan",
    "role": "CLIENTE",
    "isActive": true
  },
  "client": {
    "id": 1,
    "identification": "123456789",
    "firstName": "Juan",
    "lastName": "Zuluaga"
  },
  "employee": null,
  "role": "CLIENTE"
}
```

El token contiene:

```json
{
  "sub": 1,
  "clientId": 1,
  "role": "CLIENTE",
  "username": "juan"
}
```

Para funcionarios, `clientId` puede ser `null` y la respuesta incluye `employee`.

## Clientes

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/clientes` | Lista clientes activos | No |
| GET | `/clientes/:id` | Consulta un cliente | No |
| POST | `/clientes` | Crea cliente | Sí |
| PATCH | `/clientes/:id` | Actualiza campos parciales | Sí |
| DELETE | `/clientes/:id` | Soft delete | No |
| PATCH | `/clientes/:id/reactivar` | Reactiva cliente | No |
| GET | `/clientes/:id/referidos` | Lista referidos hechos por el cliente | No |
| GET | `/clientes/:id/red-referidos` | Devuelve la red completa de referidos agrupada por generación | No |
| GET | `/clientes/:id/estadisticas-referidos` | Calcula compras y comisiones por red de referidos | No |
| POST | `/clientes/:id/codigo-referido` | Genera o retorna código de referido | No |
| PATCH | `/clientes/:id/nivel-referido` | Actualiza manualmente el nivel de referido | Sí |

Crear cliente:

```json
{
  "identification": "123456789",
  "firstName": "Juan",
  "lastName": "Perez",
  "phone": "3001234567",
  "address": "Calle 123",
  "clientType": "MINORISTA"
}
```

`clientType`: `MINORISTA` o `MAYORISTA`.

Actualizar nivel de referido:

```json
{
  "referralLevel": 3
}
```

## Usuarios

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/usuarios` | Lista usuarios sin contraseña | No |
| GET | `/usuarios/:id` | Consulta usuario | No |
| POST | `/usuarios` | Crea usuario | Sí |
| POST | `/usuarios/funcionarios` | Crea funcionario interno con usuario y perfil `Employee` | Sí |
| PATCH | `/usuarios/:id` | Actualiza usuario | Sí |
| DELETE | `/usuarios/:id` | Soft delete | No |

Crear usuario:

```json
{
  "clientId": 1,
  "username": "admin",
  "password": "secret123",
  "role": "ADMIN"
}
```

`role`: `ADMIN`, `VENDEDOR`, `BODEGA`, `CONTADOR`.

Crear funcionario interno desde frontend:

```json
{
  "identification": "123456789",
  "firstName": "Carlos",
  "lastName": "Perez",
  "phone": "3000000000",
  "address": "Cali",
  "username": "cperez",
  "password": "Password123",
  "role": "VENDEDOR"
}
```

Protección requerida:

```http
Authorization: Bearer <token-admin>
```

Reglas:

- Solo un usuario con rol `ADMIN` puede crear funcionarios.
- Un funcionario no crea `Client`; crea `User` sin `clientId` y un perfil `Employee` asociado.
- Roles permitidos para funcionarios: `ADMIN`, `VENDEDOR`, `BODEGA`, `CONTADOR`.
- `CLIENTE` solo debe usarse en `/auth/registro`.

Roles disponibles en el sistema: `CLIENTE`, `ADMIN`, `VENDEDOR`, `BODEGA`, `CONTADOR`.

## Tienda Pública

Estos endpoints son públicos y no requieren JWT.

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/tienda/productos` | Lista productos ecommerce con paginación, filtros y ordenamiento | No |
| GET | `/tienda/productos/:id` | Consulta detalle público de producto | No |
| GET | `/tienda/categorias` | Lista categorías activas | No |
| GET | `/tienda/etiquetas` | Lista etiquetas activas | No |
| GET | `/tienda/ofertas` | Lista ofertas activas públicas | No |

Ejemplo de consulta desde frontend:

```http
GET /tienda/productos?page=1&limit=20&q=coca&productTypeId=1&tagIds=1,2&sortBy=price&sortOrder=asc
```

Parámetros disponibles:

- `page`: página, default `1`.
- `limit`: tamaño de página, default `20`, máximo `100`.
- `q`: búsqueda por nombre, descripción o marca.
- `productTypeId`: filtro por categoría.
- `tagIds`: ids separados por coma, por ejemplo `1,2,3`.
- `sortBy`: `price` o `createdAt`.
- `sortOrder`: `asc` o `desc`.

Respuesta paginada:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Coca-Cola 1.5L",
      "description": "Gaseosa 1.5 litros",
      "imageUrl": "https://cdn.example.com/productos/1.webp",
      "brand": "Coca-Cola",
      "productType": { "id": 1, "name": "Bebidas" },
      "tags": [{ "id": 1, "name": "Promocion" }],
      "currentPrice": 5000,
      "stock": 35,
      "activeOffer": null,
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 100,
  "totalPages": 5
}
```

## Tipos De Producto

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/tipos-producto` | Lista tipos activos | No |
| GET | `/tipos-producto/:id` | Consulta tipo | No |
| POST | `/tipos-producto` | Crea tipo | Sí |
| PATCH | `/tipos-producto/:id` | Actualiza tipo | Sí |
| DELETE | `/tipos-producto/:id` | Soft delete | No |
| PATCH | `/tipos-producto/:id/reactivar` | Reactiva tipo | No |

Crear tipo:

```json
{
  "name": "Bebidas",
  "description": "Bebidas y gaseosas"
}
```

`name` es único. No se puede desactivar si tiene productos activos asociados.

## Etiquetas

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/etiquetas` | Lista etiquetas activas | No |
| GET | `/etiquetas/:id` | Consulta etiqueta | No |
| POST | `/etiquetas` | Crea etiqueta | Sí |
| PATCH | `/etiquetas/:id` | Actualiza etiqueta | Sí |
| DELETE | `/etiquetas/:id` | Soft delete | No |
| PATCH | `/etiquetas/:id/reactivar` | Reactiva etiqueta | No |

Crear etiqueta:

```json
{
  "name": "Promocion",
  "description": "Productos promocionales"
}
```

## Proveedores

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/proveedores` | Lista proveedores activos | No |
| GET | `/proveedores/:id` | Consulta proveedor | No |
| POST | `/proveedores` | Crea proveedor | Sí |
| PATCH | `/proveedores/:id` | Actualiza proveedor | Sí |
| DELETE | `/proveedores/:id` | Soft delete | No |
| PATCH | `/proveedores/:id/reactivar` | Reactiva proveedor | No |

Crear proveedor:

```json
{
  "name": "Distribuidora Central",
  "description": "Proveedor principal"
}
```

`name` es único. No se puede desactivar si tiene productos activos asociados.

## Bodegas

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/bodegas` | Lista bodegas activas | No |
| GET | `/bodegas/:id` | Consulta bodega con productos | No |
| POST | `/bodegas` | Crea bodega | Sí |
| PATCH | `/bodegas/:id` | Actualiza bodega | Sí |
| DELETE | `/bodegas/:id` | Soft delete | No |
| PATCH | `/bodegas/:id/reactivar` | Reactiva bodega | No |

Crear bodega:

```json
{
  "location": "Bodega principal Bogota"
}
```

## Productos

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/productos` | Lista productos activos con tipo, proveedor, tags, precios y bodegas | No |
| GET | `/productos/:id` | Consulta producto | No |
| GET | `/productos/codigo-barras/:code` | Busca producto por código de barras activo para punto de venta, protegido con JWT | No |
| POST | `/productos` | Crea producto con precios, tags, stock inicial e imagen opcional | Sí, JSON o multipart |
| PATCH | `/productos/:id` | Actualiza datos, reemplaza tags si envías `tagIds` e imagen opcional | Sí, JSON o multipart |
| PATCH | `/productos/:id/imagen` | Reemplaza la imagen del producto | Sí, multipart |
| DELETE | `/productos/:id/imagen` | Elimina la imagen del producto | No |
| DELETE | `/productos/:id` | Soft delete | No |
| PATCH | `/productos/:id/reactivar` | Reactiva producto | No |
| GET | `/productos/:id/utilidades` | Calcula utilidad por cada precio activo, solo `ADMIN` y `CONTADOR` | No |
| GET | `/productos/utilidades?page=1&limit=20` | Lista utilidades paginadas por producto, solo `ADMIN` y `CONTADOR` | No |

Crear producto:

```json
{
  "productTypeId": 1,
  "providerId": 1,
  "name": "Coca-Cola 1.5L",
  "description": "Gaseosa 1.5 litros",
  "taxRate": 19,
  "brand": "Coca-Cola",
  "unit": "L",
  "minimumStock": 10,
  "maximumStock": 100,
  "tagIds": [1, 2],
  "prices": [
    {
      "name": "Precio normal",
      "price": 5000,
      "unit": "L",
      "quantity": 1.5,
      "isDefault": true
    }
  ],
  "warehouses": [
    {
      "warehouseId": 1,
      "quantity": 20
    },
    {
      "warehouseId": 2,
      "quantity": 15
    }
  ],
  "barcodes": [
    {
      "code": "7701234567890",
      "type": "EAN13",
      "isPrimary": true
    },
    {
      "code": "COCA15L-PROMO",
      "type": "CODE128"
    }
  ]
}
```

Crear producto con imagen desde frontend:

```ts
const formData = new FormData();

formData.append('productTypeId', String(1));
formData.append('providerId', String(1));
formData.append('name', 'Coca-Cola 1.5L');
formData.append('description', 'Gaseosa 1.5 litros');
formData.append('taxRate', String(19));
formData.append('brand', 'Coca-Cola');
formData.append('unit', 'L');
formData.append('minimumStock', String(10));
formData.append('maximumStock', String(100));
formData.append('tagIds', JSON.stringify([1, 2]));
formData.append(
  'prices',
  JSON.stringify([
    {
      name: 'Precio normal',
      price: 5000,
      unit: 'L',
      quantity: 1.5,
      isDefault: true,
    },
  ]),
);
formData.append(
  'warehouses',
  JSON.stringify([
    {
      warehouseId: 1,
      quantity: 20,
    },
  ]),
);
formData.append(
  'barcodes',
  JSON.stringify([
    { code: '7701234567890', type: 'EAN13', isPrimary: true },
    { code: 'COCA15L-PROMO', type: 'CODE128' },
  ]),
);

if (imageFile) {
  formData.append('image', imageFile);
}

await fetch('http://localhost:3000/productos', {
  method: 'POST',
  body: formData,
});
```

No agregues manualmente este header cuando envías `FormData`:

```ts
headers: { 'Content-Type': 'multipart/form-data' }
```

El navegador debe generarlo con `boundary`. Si lo fijas manualmente, el backend puede recibir el body vacío o mal parseado.

Formato esperado en `multipart/form-data`:

| Campo | Tipo form-data | Valor |
| --- | --- | --- |
| `productTypeId` | Text | `1` |
| `providerId` | Text | `1` |
| `name` | Text | `Coca-Cola 1.5L` |
| `description` | Text | `Gaseosa 1.5 litros` |
| `taxRate` | Text | `19` |
| `brand` | Text | `Coca-Cola` |
| `unit` | Text | `L` |
| `minimumStock` | Text | `10` |
| `maximumStock` | Text | `100` |
| `tagIds` | Text | `[1,2]` |
| `prices` | Text | `[{"name":"Precio normal","price":5000,"unit":"L","quantity":1.5,"isDefault":true}]` |
| `warehouses` | Text | `[{"warehouseId":1,"quantity":20}]` |
| `barcodes` | Text | `[{"code":"7701234567890","type":"EAN13","isPrimary":true}]` |
| `image` | File | Archivo JPG, PNG o WEBP |

Los campos `tagIds`, `prices`, `warehouses` y `barcodes` deben enviarse como JSON string en una sola key cada uno. No los envíes como `warehouses[0][warehouseId]`, `warehouseId` separado o varias filas con la misma key.

Actualizar producto con imagen opcional:

```ts
const formData = new FormData();

formData.append('name', 'Coca-Cola 1.5L retornable');
formData.append('tagIds', JSON.stringify([1, 3]));

if (imageFile) {
  formData.append('image', imageFile);
}

await fetch('http://localhost:3000/productos/1', {
  method: 'PATCH',
  body: formData,
});
```

Actualizar solo la imagen:

```ts
const formData = new FormData();
formData.append('image', imageFile);

await fetch('http://localhost:3000/productos/1/imagen', {
  method: 'PATCH',
  body: formData,
});
```

Eliminar imagen:

```ts
await fetch('http://localhost:3000/productos/1/imagen', {
  method: 'DELETE',
});
```

Validaciones de imagen:

- El campo del archivo debe llamarse `image`.
- Formatos permitidos: JPG, PNG y WEBP.
- Tamaño máximo: 5 MB.
- No se aceptan SVG ni base64.
- La respuesta del producto incluye `imageUrl`.

Reglas:

- `productTypeId`, `providerId`, tags y bodegas deben existir y estar activos.
- `warehouses` crea `ProductWarehouse` y movimientos `ENTRADA` como stock inicial.
- El stock después de creado se mueve por `/inventario`, no por `PATCH /productos/:id`.
- Solo puede haber un precio default activo por producto.
- Un producto puede tener varios códigos de barras. Si se envía un solo código sin `isPrimary`, queda principal automáticamente. Si se envían varios y ninguno es principal, el primero queda principal.
- `unit` debe ser una de: `UND`, `KG`, `G`, `LB`, `L`, `ML`, `CAJA`, `PAQUETE`.
- La utilidad no se expone en tienda pública; solo está en endpoints administrativos con JWT.

## Códigos De Barras

| Método | Ruta | Qué hace | Body | Auth |
| --- | --- | --- | --- | --- |
| GET | `/codigos-barras` | Lista códigos de barras | No | Bearer JWT |
| GET | `/codigos-barras/:id` | Consulta un código | No | Bearer JWT |
| GET | `/productos/:id/codigos-barras` | Lista códigos de un producto | No | Bearer JWT |
| POST | `/productos/:id/codigos-barras` | Crea código para un producto activo | Sí | Bearer JWT |
| PATCH | `/codigos-barras/:id` | Actualiza código, tipo o principal | Sí | Bearer JWT |
| DELETE | `/codigos-barras/:id` | Soft delete: `isActive=false`, `isPrimary=false` | No | Bearer JWT |
| PATCH | `/codigos-barras/:id/principal` | Marca código activo como principal | No | Bearer JWT |

Roles permitidos: `ADMIN`, `BODEGA`, `VENDEDOR`.

Tipos permitidos por `BarcodeType`:

| Enum | Formato básico | Ejemplo |
| --- | --- | --- |
| `EAN13` | 13 dígitos | `7701234567890` |
| `EAN8` | 8 dígitos | `96385074` |
| `UPC_A` | 12 dígitos | `042100005264` |
| `UPC_E` | 6 u 8 dígitos | `042526` |
| `CODE128` | Alfanumérico | `COCA15L-PROMO` |
| `QR` | Texto no vacío | `https://example.com/p/1` |
| `OTHER` | Texto no vacío | `INTERNO-001` |

Crear código de barras:

```json
{
  "code": "7701234567890",
  "type": "EAN13",
  "isPrimary": true
}
```

Buscar producto por código de barras para escáner POS:

```http
GET /productos/codigo-barras/7701234567890
Authorization: Bearer <token-vendedor>
```

La respuesta incluye producto, tipo, proveedor, precios activos, stock por bodega, tags y códigos de barras.

Usar `barcode` en facturación:

```json
{
  "clientId": 1,
  "items": [
    {
      "barcode": "7701234567890",
      "quantity": 2
    }
  ]
}
```

Usar `barcode` en inventario:

```json
{
  "barcode": "7701234567890",
  "toWarehouseId": 1,
  "quantity": 10,
  "reason": "Entrada por compra"
}
```

Si se envían `productId` y `barcode`, ambos deben pertenecer al mismo producto. Los códigos inactivos y productos inactivos son rechazados.

Consultar utilidad de un producto:

```http
GET /productos/1/utilidades
Authorization: Bearer <token-admin-o-contador>
```

Respuesta cuando hay costo activo y precios compatibles:

```json
{
  "productId": 1,
  "productName": "Arroz Diana",
  "currentCost": {
    "cost": "4000",
    "unit": "KG",
    "quantity": "1"
  },
  "prices": [
    {
      "priceId": 1,
      "name": "Minorista",
      "price": "6000",
      "unit": "KG",
      "quantity": "1",
      "profitAmount": "2000",
      "profitPercentage": "50.00"
    }
  ]
}
```

Consultar utilidades paginadas:

```http
GET /productos/utilidades?page=1&limit=20
Authorization: Bearer <token-admin-o-contador>
```

Si no hay costo activo, la respuesta incluye `warning` y no calcula utilidad. Si el costo y el precio usan unidades incompatibles, la línea del precio incluye `warning` y `profitAmount`/`profitPercentage` en `null`.

## Inventario

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/inventario` | Lista inventario con producto, tipo, proveedor y bodegas | No |
| GET | `/inventario/productos/:productId` | Stock de un producto por bodega | No |
| GET | `/inventario/bodegas/:warehouseId` | Stock de una bodega | No |
| POST | `/inventario/entrada` | Aumenta stock en bodega destino | Sí |
| POST | `/inventario/salida` | Descuenta stock de bodega origen | Sí |
| POST | `/inventario/traslado` | Mueve stock entre bodegas | Sí |
| POST | `/inventario/ajuste` | Ajusta stock exacto de un producto en una bodega | Sí |
| GET | `/inventario/movimientos` | Lista historial de movimientos | No |
| GET | `/inventario/movimientos/:id` | Consulta movimiento | No |

Entrada:

```json
{
  "productId": 1,
  "toWarehouseId": 1,
  "quantity": 10,
  "reason": "Compra inicial"
}
```

Salida:

```json
{
  "productId": 1,
  "fromWarehouseId": 1,
  "quantity": 3,
  "reason": "Salida manual"
}
```

Traslado:

```json
{
  "productId": 1,
  "fromWarehouseId": 1,
  "toWarehouseId": 2,
  "quantity": 5,
  "reason": "Reposicion"
}
```

Ajuste:

```json
{
  "productId": 1,
  "warehouseId": 1,
  "quantity": 25,
  "reason": "Conteo fisico"
}
```

Todas las escrituras usan transacción. No se permiten cantidades menores o iguales a cero. Salida y traslado validan stock suficiente.

## Precios De Producto

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/precios-producto` | Lista precios | No |
| GET | `/precios-producto/:id` | Consulta precio | No |
| GET | `/productos/:id/precios` | Lista precios de un producto | No |
| POST | `/productos/:id/precios` | Crea precio para producto | Sí |
| PATCH | `/precios-producto/:id` | Actualiza precio | Sí |
| DELETE | `/precios-producto/:id` | Desactiva precio | No |
| PATCH | `/precios-producto/:id/default` | Marca precio como default y desmarca otros | No |
| GET | `/precios-producto/:id/historial` | Lista historial de cambios de precio | No |

Crear precio:

```json
{
  "name": "Precio mayorista",
  "price": 4500,
  "unit": "KG",
  "quantity": 1,
  "isDefault": false,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "endsAt": "2026-12-31T23:59:59.000Z"
}
```

Cambiar valor y registrar historial:

```json
{
  "price": 4300,
  "reason": "Ajuste por proveedor"
}
```

`price` y `quantity` deben ser mayores que 0. `unit` debe ser una unidad válida. `endsAt` debe ser mayor que `startsAt`. Si cambia `price`, se registra en `ProductPriceHistory`.

## Costos De Producto

Estos endpoints requieren JWT y rol `ADMIN` o `CONTADOR`.

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/productos/:id/costos` | Lista costos históricos de un producto | No |
| POST | `/productos/:id/costos` | Crea costo histórico para producto | Sí |
| PATCH | `/costos-producto/:id` | Actualiza un costo histórico | Sí |
| DELETE | `/costos-producto/:id` | Desactiva costo histórico sin borrarlo físicamente | No |

Crear costo:

```json
{
  "cost": 4000,
  "unit": "KG",
  "quantity": 1
}
```

Crear costo con fechas:

```json
{
  "cost": 4500,
  "unit": "KG",
  "quantity": 1,
  "startsAt": "2026-07-01T00:00:00.000Z",
  "isActive": true
}
```

Actualizar costo:

```json
{
  "cost": 4200,
  "unit": "KG",
  "quantity": 1,
  "isActive": true
}
```

Reglas:

- `cost` y `quantity` deben ser mayores que 0.
- `unit` debe ser una de: `UND`, `KG`, `G`, `LB`, `L`, `ML`, `CAJA`, `PAQUETE`.
- Al crear un nuevo costo activo, se desactiva el costo activo anterior y se cierra con `endsAt`.
- `DELETE /costos-producto/:id` no borra el registro; lo deja con `isActive = false` y `endsAt`.
- La utilidad usa el costo activo más reciente por `startsAt` e `id`.

## Ofertas

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/ofertas` | Lista ofertas activas | No |
| GET | `/ofertas/:id` | Consulta oferta con targets | No |
| POST | `/ofertas` | Crea oferta | Sí |
| PATCH | `/ofertas/:id` | Actualiza oferta y reemplaza arrays enviados | Sí |
| DELETE | `/ofertas/:id` | Soft delete | No |
| PATCH | `/ofertas/:id/reactivar` | Reactiva oferta | No |
| POST | `/ofertas/aplicables` | Evalúa ofertas por línea de producto | Sí |

Crear oferta:

```json
{
  "name": "Descuento bebidas",
  "description": "Oferta de temporada",
  "discountType": "PORCENTAJE",
  "discountValue": 10,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "endsAt": "2026-06-30T23:59:59.000Z",
  "minimumProductQuantity": 1,
  "maximumProductQuantity": 20,
  "isStackable": false,
  "clientIds": [1],
  "productIds": [1],
  "productTypeIds": [1],
  "tagIds": [1]
}
```

Oferta general sin targets:

```json
{
  "name": "Descuento general",
  "discountType": "MONTO_FIJO",
  "discountValue": 1000
}
```

Consultar aplicables:

```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 1,
      "productPriceId": 1,
      "quantity": 2
    }
  ]
}
```

Reglas:

- `discountType`: `PORCENTAJE` o `MONTO_FIJO`.
- Porcentaje debe ser `> 0` y `<= 100`.
- Monto fijo debe ser `> 0`.
- Si no hay targets, la oferta es general.
- Si se envían arrays en `PATCH`, reemplazan relaciones anteriores.

## Facturas

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/facturas` | Lista facturas con cliente e items | No |
| GET | `/facturas/:id` | Consulta factura | No |
| POST | `/facturas` | Crea factura y congela precios/impuestos en items | Sí |
| PATCH | `/facturas/:id` | Actualiza campos básicos no contables | Sí |
| DELETE | `/facturas/:id` | Anula factura | No |

Crear factura:

```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 1,
      "productPriceId": 1,
      "quantity": 2
    }
  ]
}
```

Notas:

- Si no envías `productPriceId`, usa el precio default activo.
- Las facturas no descuentan stock por bodega; el stock se maneja en `/inventario`.
- `DELETE` cambia `status` a `ANULADA`.

## Domicilios

Los endpoints administrativos de consulta y actualización de domicilios requieren `ADMIN`.

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/domicilios` | Lista domicilios, solo `ADMIN` | No |
| GET | `/domicilios/:id` | Consulta domicilio, solo `ADMIN` | No |
| POST | `/domicilios` | Crea domicilio para factura | Sí |
| PATCH | `/domicilios/:id` | Actualiza domicilio, solo `ADMIN` | Sí |
| PATCH | `/domicilios/:id/estado` | Cambia estado, solo `ADMIN` | Sí |
| DELETE | `/domicilios/:id` | Cancela domicilio | No |

Crear domicilio:

```json
{
  "invoiceId": 1,
  "address": "Calle 123",
  "recipientName": "Juan Perez",
  "recipientPhone": "3001234567",
  "notes": "Entregar en porteria"
}
```

Cambiar estado:

```json
{
  "status": "EN_CAMINO"
}
```

Estados: `PENDIENTE`, `EN_PREPARACION`, `EN_CAMINO`, `ENTREGADO`, `CANCELADO`.

Desde frontend, para consultar o actualizar domicilios administrativos:

```ts
await fetch('http://localhost:3000/domicilios', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

## Referidos

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/referidos` | Lista referidos con referente y referido | No |
| GET | `/referidos/:id` | Consulta referido | No |
| POST | `/referidos` | Registra referido usando código | Sí |
| POST | `/referidos/validar` | Valida código sin registrar referido | Sí |

Registrar referido:

```json
{
  "referredClientId": 2,
  "codeUsed": "JUAN1ABCD"
}
```

Validar código antes de registrar:

```json
{
  "codeUsed": "JUAN1ABCD",
  "referredClientId": 2
}
```

Respuesta válida:

```json
{
  "valid": true,
  "referrerClient": {
    "id": 1,
    "firstName": "Juan",
    "lastName": "Zuluaga"
  }
}
```

Red de referidos:

```http
GET /clientes/1/red-referidos
```

Respuesta:

```json
{
  "clientId": 1,
  "generations": [
    {
      "generation": 1,
      "clients": []
    },
    {
      "generation": 2,
      "clients": []
    }
  ]
}
```

Estadísticas y comisiones:

```http
GET /clientes/1/estadisticas-referidos
```

Respuesta:

```json
{
  "clientId": 1,
  "totalReferidosDirectos": 2,
  "totalReferidosRed": 5,
  "totalCompradoPorReferidos": 600000,
  "ventasPorGeneracion": [
    { "generation": 1, "total": 300000 },
    { "generation": 2, "total": 200000 },
    { "generation": 3, "total": 100000 }
  ],
  "comisionGanada": 22000,
  "comisionPorGeneracion": [
    { "generation": 1, "percentage": 5, "commission": 15000 },
    { "generation": 2, "percentage": 3, "commission": 6000 },
    { "generation": 3, "percentage": 1, "commission": 1000 }
  ]
}
```

Política actual de comisión:

- Generación 1: `5%` sobre facturas activas de referidos directos.
- Generación 2: `3%` sobre facturas activas de esa generación.
- Generación 3: `1%` sobre facturas activas de esa generación.
- Las generaciones no configuradas calculan comisión `0`.
- El cálculo usa `Invoice.total` de facturas con estado `ACTIVA`.

Reglas:

- El código debe existir y pertenecer a un cliente activo.
- Un cliente no puede referirse a sí mismo.
- Un cliente solo puede ser referido una vez.

## Cuentas Bancarias

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/cuentas-bancarias` | Lista cuentas activas | No |
| GET | `/cuentas-bancarias/:id` | Consulta cuenta con movimientos | No |
| POST | `/cuentas-bancarias` | Crea cuenta | Sí |
| PATCH | `/cuentas-bancarias/:id` | Actualiza cuenta | Sí |
| DELETE | `/cuentas-bancarias/:id` | Soft delete | No |
| PATCH | `/cuentas-bancarias/:id/reactivar` | Reactiva cuenta | No |

Crear cuenta:

```json
{
  "name": "Cuenta principal",
  "bankName": "Bancolombia",
  "accountNumber": "123456789",
  "accountType": "AHORROS",
  "currentBalance": 100000
}
```

## Movimientos Bancarios

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/movimientos-bancarios` | Lista movimientos | No |
| GET | `/movimientos-bancarios/:id` | Consulta movimiento | No |
| POST | `/movimientos-bancarios/ingreso` | Suma saldo | Sí |
| POST | `/movimientos-bancarios/egreso` | Resta saldo | Sí |
| POST | `/movimientos-bancarios/transferencia` | Crea salida y entrada entre cuentas | Sí |
| POST | `/movimientos-bancarios/ajuste` | Ajusta saldo exacto | Sí |

Ingreso o egreso:

```json
{
  "bankAccountId": 1,
  "amount": 50000,
  "description": "Pago recibido",
  "invoiceId": 1
}
```

Transferencia:

```json
{
  "fromBankAccountId": 1,
  "toBankAccountId": 2,
  "amount": 10000,
  "description": "Traslado entre cuentas"
}
```

Ajuste:

```json
{
  "bankAccountId": 1,
  "balance": 120000,
  "description": "Conciliacion bancaria"
}
```

No se permiten montos menores o iguales a cero. `EGRESO` y transferencia validan saldo suficiente.

## Créditos

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| POST | `/facturas/:id/credito` | Crea crédito para factura | Sí |
| GET | `/creditos` | Lista créditos | No |
| GET | `/creditos/:id` | Consulta crédito | No |
| GET | `/clientes/:id/creditos` | Lista créditos de cliente | No |
| POST | `/creditos/:id/pagos` | Registra pago | Sí |
| PATCH | `/creditos/:id/estado` | Cambia estado manualmente | Sí |

Crear crédito:

```json
{
  "dueDate": "2030-01-01T00:00:00.000Z"
}
```

Registrar pago:

```json
{
  "amount": 10000,
  "bankAccountId": 1,
  "notes": "Abono parcial"
}
```

Cambiar estado:

```json
{
  "status": "PARCIAL"
}
```

Estados: `PENDIENTE`, `PARCIAL`, `PAGADA`, `VENCIDA`, `CANCELADA`.

## Cotizaciones

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/cotizaciones` | Lista cotizaciones | No |
| GET | `/cotizaciones/:id` | Consulta cotización | No |
| POST | `/cotizaciones` | Crea cotización con items y totales históricos | Sí |
| PATCH | `/cotizaciones/:id` | Actualiza vencimiento | Sí |
| DELETE | `/cotizaciones/:id` | Marca como rechazada | No |
| PATCH | `/cotizaciones/:id/estado` | Cambia estado | Sí |
| POST | `/cotizaciones/:id/convertir-factura` | Convierte a factura y marca como convertida | No |

Crear cotización:

```json
{
  "clientId": 1,
  "expiresAt": "2030-01-01T00:00:00.000Z",
  "items": [
    {
      "productId": 1,
      "productPriceId": 1,
      "quantity": 2
    }
  ]
}
```

Cambiar estado:

```json
{
  "status": "APROBADA"
}
```

Estados: `PENDIENTE`, `APROBADA`, `RECHAZADA`, `CONVERTIDA`, `EXPIRADA`.

## Casos Que Deben Fallar

La API valida y debe responder error para casos como:

- Crear proveedor con `name` duplicado.
- Crear producto con `providerId` inexistente o inactivo.
- Enviar cantidades negativas o cero en inventario.
- Hacer salida/traslado sin stock suficiente.
- Crear oferta `PORCENTAJE` con valor mayor a 100.
- Crear crédito duplicado para la misma factura.
- Registrar pago de crédito mayor al saldo.
- Transferir entre la misma cuenta bancaria.
- Referir un cliente a sí mismo.
- Convertir una cotización vencida.

## Advertencias Del Schema

- `BankAccountMovement.invoiceId` está marcado como `@unique` en `schema.prisma`. Eso permite un solo movimiento bancario por factura. Si se necesitan pagos parciales o varios movimientos por factura, conviene quitar ese `@unique` y ajustar la relación.
- Los endpoints de factura no descuentan inventario por bodega; el inventario se controla con `/inventario`.

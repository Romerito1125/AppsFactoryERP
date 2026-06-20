# API REST Modular ERP

API NestJS + TypeScript ejecutada con Bun, Prisma y PostgreSQL/Supabase. Es un monolito modular: no usa microservicios, NATS, RabbitMQ ni mensajería.

Base local por defecto:

```txt
http://localhost:3000
```

Para enviar bodies usa siempre:

```http
Content-Type: application/json
```

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
| POST | `/productos` | Crea producto con precios, tags y stock inicial opcional | Sí |
| PATCH | `/productos/:id` | Actualiza datos del producto y reemplaza tags si envías `tagIds` | Sí |
| DELETE | `/productos/:id` | Soft delete | No |
| PATCH | `/productos/:id/reactivar` | Reactiva producto | No |

Crear producto:

```json
{
  "productTypeId": 1,
  "providerId": 1,
  "name": "Coca-Cola 1.5L",
  "description": "Gaseosa 1.5 litros",
  "taxRate": 19,
  "brand": "Coca-Cola",
  "minimumStock": 10,
  "maximumStock": 100,
  "tagIds": [1, 2],
  "prices": [
    {
      "name": "Precio normal",
      "price": 5000,
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
  ]
}
```

Reglas:

- `productTypeId`, `providerId`, tags y bodegas deben existir y estar activos.
- `warehouses` crea `ProductWarehouse` y movimientos `ENTRADA` como stock inicial.
- El stock después de creado se mueve por `/inventario`, no por `PATCH /productos/:id`.
- Solo puede haber un precio default activo por producto.

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

`price` debe ser mayor que 0. `endsAt` debe ser mayor que `startsAt`.

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

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/domicilios` | Lista domicilios | No |
| GET | `/domicilios/:id` | Consulta domicilio | No |
| POST | `/domicilios` | Crea domicilio para factura | Sí |
| PATCH | `/domicilios/:id` | Actualiza domicilio | Sí |
| PATCH | `/domicilios/:id/estado` | Cambia estado | Sí |
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

## Referidos

| Método | Ruta | Qué hace | Body |
| --- | --- | --- | --- |
| GET | `/referidos` | Lista referidos con referente y referido | No |
| GET | `/referidos/:id` | Consulta referido | No |
| POST | `/referidos` | Registra referido usando código | Sí |

Registrar referido:

```json
{
  "referredClientId": 2,
  "codeUsed": "JUAN1ABCD"
}
```

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

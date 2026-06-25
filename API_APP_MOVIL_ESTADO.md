# API App Movil

Guia de integracion de la app movil con la API actual del ERP.

Base revisada sobre `main` y ajustada con:

- login real con JWT
- pedidos moviles via `POST /tienda/pedidos`
- listado administrativo de pedidos app via `GET /tienda/pedidos`
- trazabilidad por origen de factura: `ADMIN`, `POS`, `APP_MOVIL`

## Base URL

- Desarrollo web local: `http://localhost:3000`
- Si usas proxy frontend, la web consume `VITE_API_URL` o `/api`
- En la app movil debes apuntar directo al host publicado de la API

## Autenticacion

### Login

- `POST /auth/login`

Request:

```json
{
  "username": "maria.cliente",
  "password": "Clave123*"
}
```

Response esperada:

```json
{
  "accessToken": "jwt_token_aqui",
  "user": {
    "id": 25,
    "clientId": 12,
    "username": "maria.cliente",
    "role": "CLIENTE",
    "isActive": true,
    "deletedAt": null,
    "createdAt": "2026-06-25T10:00:00.000Z",
    "updatedAt": "2026-06-25T10:00:00.000Z"
  },
  "client": {
    "id": 12,
    "identification": "123456789",
    "firstName": "Maria",
    "lastName": "Perez",
    "phone": "3001234567",
    "address": "Calle 10 # 20-30",
    "isActive": true,
    "clientType": "MINORISTA",
    "referralCode": "MARI12ABCD",
    "referralLevel": 0
  },
  "employee": null,
  "role": "CLIENTE"
}
```

### Registro

- `POST /auth/registro`

Request:

```json
{
  "identification": "123456789",
  "firstName": "Maria",
  "lastName": "Perez",
  "phone": "3001234567",
  "address": "Calle 10 # 20-30",
  "username": "maria.cliente",
  "password": "Clave123*"
}
```

### Perfil autenticado

- `GET /auth/perfil`

Header requerido:

```http
Authorization: Bearer <accessToken>
```

Uso recomendado:

- guardar `accessToken` en almacenamiento seguro del dispositivo
- restaurar sesion con `GET /auth/perfil` al abrir la app
- reenviar `Authorization: Bearer <token>` en endpoints protegidos

## Catalogo storefront

### Listar productos

- `GET /tienda/productos`

Query params soportados:

- `q`
- `productTypeId`
- `tagIds`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

Ejemplo:

```http
GET /tienda/productos?q=cafe&page=1&limit=20&sortBy=price&sortOrder=asc
```

Respuesta:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Cafe de Origen Sierra 340 g",
      "description": "...",
      "imageUrl": "https://...",
      "brand": "Monte Claro",
      "productType": {
        "id": 2,
        "name": "Bebidas y Lacteos"
      },
      "tags": [
        {
          "id": 3,
          "name": "Desayuno"
        }
      ],
      "currentPrice": 28900,
      "stock": 52,
      "activeOffer": null,
      "createdAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 35,
  "totalPages": 2
}
```

### Detalle de producto

- `GET /tienda/productos/:id`

### Categorias

- `GET /tienda/categorias`

### Etiquetas

- `GET /tienda/etiquetas`

### Ofertas activas

- `GET /tienda/ofertas`

## Referidos y comisiones

### Validar codigo de referido

- `POST /referidos/validar`

Request:

```json
{
  "codeUsed": "MARI12ABCD"
}
```

### Registrar referido

- `POST /referidos`

Request:

```json
{
  "referredClientId": 18,
  "codeUsed": "MARI12ABCD"
}
```

### Generar codigo de referido

- `POST /clientes/:id/codigo-referido`

### Ver referidos directos

- `GET /clientes/:id/referidos`

### Ver red completa

- `GET /clientes/:id/red-referidos`

Respuesta principal:

- `clientId`
- `generations[]`

### Ver estadisticas de comisiones

- `GET /clientes/:id/estadisticas-referidos`

Campos principales:

- `totalReferidosDirectos`
- `totalReferidosRed`
- `totalCompradoPorReferidos`
- `ventasPorGeneracion`
- `comisionGanada`
- `comisionPorGeneracion`

Nota:

- la ruta real es `estadisticas-referidos` en plural

## Checkout movil

### Crear pedido desde la app

- `POST /tienda/pedidos`

Hoy este endpoint:

- crea una factura con `source = APP_MOVIL`
- crea los items de factura
- crea un domicilio inicial asociado
- deja el domicilio normalmente en estado `PENDIENTE`

Request:

```json
{
  "clientId": 12,
  "items": [
    {
      "productId": 4,
      "productPriceId": 11,
      "quantity": 2
    },
    {
      "productId": 9,
      "productPriceId": 25,
      "quantity": 1
    }
  ],
  "delivery": {
    "address": "Calle 10 # 20-30",
    "recipientName": "Maria Perez",
    "recipientPhone": "3001234567",
    "notes": "Casa azul, tocar dos veces"
  }
}
```

Respuesta:

- factura creada
- `client`
- `items`
- `delivery`
- `credit`

## Domicilios y logistica

### Existe hoy

- `POST /domicilios`
- `GET /domicilios`
- `GET /domicilios/:id`
- `PATCH /domicilios/:id`
- `PATCH /domicilios/:id/estado`
- `DELETE /domicilios/:id`

Importante:

- `GET /domicilios`, `GET /domicilios/:id`, `PATCH /domicilios/:id` y `PATCH /domicilios/:id/estado` requieren JWT
- si no envias token, la API responde `Token requerido`

Header requerido:

```http
Authorization: Bearer <accessToken>
```

### Lo que no existe todavia

- `POST /domicilios/cotizar`
- calculo automatico de tarifa por zona
- costo estimado de envio integrado al checkout

Implicacion real para la app:

- la app ya puede crear pedido + domicilio
- pero todavia no puede calcular envio desde backend antes de confirmar la compra

## Pedidos moviles en administrador

### Endpoint administrativo

- `GET /tienda/pedidos`

Devuelve solo facturas con:

- `source = APP_MOVIL`

Incluye:

- `client`
- `items`
- `delivery`
- `credit`

### Pantalla web nueva

- ruta admin: `/pedidos-app`

Sirve para ver:

- cliente
- direccion de entrega
- estado del domicilio
- total del pedido
- detalle de items

## Origen de facturas

La API ahora distingue el origen de las ventas:

- `ADMIN`
- `POS`
- `APP_MOVIL`

Esto permite:

- separar pedidos de app de ventas internas
- filtrar mejor reportes y vistas administrativas

## Estado actual para conectar la app

### Ya puedes usar

- login
- registro
- restauracion de sesion con perfil
- catalogo de productos
- categorias
- etiquetas
- ofertas activas
- validacion de referidos
- registro de referidos
- red de referidos
- estadisticas de comisiones
- checkout con creacion de pedido

### Todavia falta si quieres un ecommerce completo

- cotizacion de envio
- pago online integrado
- tracking publico del pedido para cliente final
- confirmacion de pago separada del pedido

## Resumen tecnico rapido

- el frontend web ya usa login real con JWT
- el cliente HTTP ya envia `Authorization: Bearer <token>` automaticamente cuando hay sesion
- los pedidos de app se guardan con `source = APP_MOVIL`
- el POS marca sus facturas con `source = POS`
- las ventas administrativas quedan en `source = ADMIN` por defecto

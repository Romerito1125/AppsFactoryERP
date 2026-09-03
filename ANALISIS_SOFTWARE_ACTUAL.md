# Análisis resumido del software actual

## Apps Factory ERP — Mundo Tienda

**Corte del análisis:** 2026-09-02  
**Fuente principal:** código actual de `app/api` y `app/web`. La documentación existente se utilizó únicamente para contrastar contratos y detectar desfases.

## 1. Resumen ejecutivo

Apps Factory ERP es un ERP web para operación comercial, inventario, compras, ventas, créditos, banca, domicilios y tienda móvil. Está dividido en:

- **Backend REST:** NestJS + TypeScript + Prisma + PostgreSQL, ejecutado con Bun.
- **Frontend web:** React + Vite + React Router + TanStack Query.
- **Persistencia:** PostgreSQL con Prisma y 19 migraciones activas.
- **Archivos y correo:** Cloudflare R2 para imágenes y Resend para reportes por correo, ambos opcionales por configuración.
- **Operación:** panel administrativo, POS y API para tienda/pedidos de aplicación móvil.

El código declara **166 operaciones HTTP en 26 controladores**. La funcionalidad de negocio es amplia y está conectada: la venta puede descontar inventario, calcular utilidad, aplicar ofertas y referidos, crear crédito o domicilio, registrar auditoría y generar notificaciones.

El principal hallazgo es de seguridad: **la autorización no está aplicada de forma global ni uniforme**. Hay módulos financieros y operaciones de escritura que actualmente aceptan solicitudes sin guardas JWT/roles. Las restricciones de rutas del frontend son solo una capa de interfaz y no sustituyen la protección del backend.

## 2. Inventario cuantitativo

| Área | Estado actual |
|---|---|
| Controladores REST | 26 |
| Operaciones HTTP | 166 |
| Módulos backend de negocio | 25, más `AppModule`/salud |
| Rutas web administrativas | 23 entradas de navegación |
| POS | Ruta independiente `/pos` |
| Roles | `CLIENTE`, `ADMIN`, `CAJERO`, `VENDEDOR`, `BODEGA`, `CONTADOR` |
| Modelos Prisma | 41 modelos, incluyendo tablas puente |
| Migraciones | 19 |
| Fuentes de datos principales | Usuarios, clientes, productos, inventario, ventas, compras, cartera, banca, referidos y tienda |

## 3. Arquitectura, ejecución y configuración

### Backend

- Entrada: `app/api/src/main.ts`.
- Prefijo de API: no hay prefijo adicional; los controladores exponen rutas como `/productos`, `/facturas` y `/inventario`.
- Puerto configurable por `PORT`; valor predeterminado de desarrollo: `3000`.
- Escucha en `0.0.0.0`.
- CORS habilitado con origen reflejado y credenciales.
- `ValidationPipe` global con `whitelist: true` y `transform: true`; los campos no reconocidos se eliminan, pero no se rechazan explícitamente.
- ORM: Prisma sobre PostgreSQL.
- No se encontró un módulo Swagger/OpenAPI formal; el catálogo de endpoints debe mantenerse desde controladores, DTOs y pruebas.

### Frontend

- Entrada: `app/web/src/App.jsx`.
- URL API: `VITE_API_URL` o `/api`.
- En desarrollo, Vite puede hacer proxy mediante `VITE_API_PROXY_TARGET`.
- En producción, Nginx enruta `/api/` hacia el servicio API.
- Sesión en `localStorage` bajo `mmm-auth-session`.
- El cliente envía `Authorization: Bearer`, refresca el token cuando faltan aproximadamente cinco minutos para expirar y reintenta una petición fallida una vez tras `401`.
- `getAllPages` consume páginas de hasta 200 registros; el backend admite máximo 250.

### Docker y variables relevantes

- `Dockerfile.api`: compilación y ejecución con Bun; expone el puerto interno `7502`.
- `docker-compose.yml`: API, web/Nginx y PostgreSQL externo/configurable.
- Variables principales: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.
- R2 solo queda habilitado si están presentes las cinco variables requeridas.
- El secreto JWT tiene un valor de desarrollo por defecto (`dev-jwt-secret-change-me`) y el refresh puede quedar sin expiración (`never`); ambos deben reemplazarse en producción.

## 4. Módulos funcionales y acciones disponibles en la web

La tabla resume las pantallas implementadas y sus acciones principales. Los roles son los declarados en las rutas de React; la autorización real debe verificarse también en el backend.

| Módulo / ruta | Roles de interfaz | Acciones disponibles |
|---|---|---|
| Login `/login` | Público | Iniciar sesión, mostrar/ocultar contraseña, accesos demo rápidos |
| Dashboard `/dashboard` | `ADMIN` | KPIs, ingresos mensuales, stock por bodega, facturas recientes, distribución de roles |
| Usuarios `/usuarios` | `ADMIN` | Listar, buscar, crear usuario/funcionario, editar, activar/desactivar, asignar bodega y cliente |
| Auditoría `/auditoria` | `ADMIN` | Consultar eventos, buscar y ver detalle |
| Clientes `/clientes` | `ADMIN` | CRUD, estado, datos de contacto, nivel y red de referidos |
| Referidos `/referidos` | `ADMIN` | Crear referido, generar código, consultar red/estadísticas, cambiar nivel, configurar cuatro políticas |
| Productos `/productos` | `ADMIN` | Crear/editar, imagen, proveedores, tipo, etiquetas, precios, empaque, bodegas, stock inicial, códigos, favoritos |
| Códigos `/codigos-barras` | `ADMIN` | Listar, buscar, escanear cámara/imagen, crear/editar, marcar principal, desactivar/reactivar |
| Tipos `/tipos-producto` | `ADMIN` | CRUD, imagen, estado |
| Proveedores `/proveedores` | `ADMIN` | CRUD y activación |
| Etiquetas `/etiquetas` | `ADMIN` | CRUD, estado, asociación a productos/ofertas |
| Precios `/precios-producto` | `ADMIN` | Crear/editar, historial, cambiar precio principal, desactivar/reactivar |
| Inventario `/inventario` | `ADMIN`, `BODEGA` | Consultar existencias, entradas, salidas, traslados, ajustes, movimientos y tickets |
| Bodegas `/bodegas` | `ADMIN` | CRUD y activación |
| Facturas `/facturas` | `ADMIN` | Crear/editar, buscar por producto o código, validar, anular, PDF, cliente, bodega y referidos |
| Compras `/compras` | `ADMIN`, `BODEGA` | Crear/editar borrador, ordenar, recibir, anular, pendientes del día, resumen y PDF |
| Cotizaciones `/cotizaciones` | `ADMIN` | Crear/editar, cambiar estado, ver detalle, PDF, convertir a factura |
| Ofertas `/ofertas` | `ADMIN` | Crear/editar, reglas de descuento, fechas, cantidades, objetivos, archivar/reactivar |
| Domicilios `/domicilios` | `ADMIN` | Crear, editar datos de entrega, cambiar estado, cancelar y filtrar |
| Pedidos app `/pedidos-app` | `ADMIN` | Consultar pedidos móviles, filtrar, ver cliente, domicilio, productos y estado de factura |
| Créditos `/creditos` | `ADMIN`, `CONTADOR` | Crear crédito directo o desde factura, consultar saldo, registrar pagos, actualizar estado |
| Cuentas `/cuentas-bancarias` | `ADMIN`, `CONTADOR` | CRUD, activar/desactivar, consultar saldo consolidado |
| Movimientos `/movimientos-bancarios` | `ADMIN`, `CONTADOR` | Ingreso, egreso, transferencia, ajuste, filtros y GMF |
| Reportes `/reportes` | `ADMIN`, `CONTADOR` | Rango de fechas, filtros, resumen/facturas/IVA/exógenas/GMF/stock/traslados/productos, CSV, PDF y correo |
| POS `/pos` | `ADMIN`, `CAJERO`, `VENDEDOR`, `CONTADOR` | Buscar/escanear, favoritos, cliente, bodega, cantidades, precio manual, ofertas, contado/crédito, recibo/PDF |

### Acciones transversales de la interfaz

La mayoría de módulos CRUD reutilizan una página genérica con listado paginado, búsqueda, filtro de estado, detalle, formulario de creación/edición, archivado/desactivación y reactivación. Productos, facturas, POS, inventario, compras y reportes tienen interfaces especializadas.

La interfaz también incluye lector de códigos con ZXing, generación de imágenes de códigos con `bwip-js`, OCR de facturas/productos mediante Tesseract/PDF.js y generación local de documentos con jsPDF.

## 5. API REST completa

### Convenciones

- Paginación: `page` inicia en 1, `limit` predeterminado 50, máximo 250 y búsqueda opcional `q`.
- Respuesta paginada: `{ data, page, limit, total, totalPages }`.
- Muchos listados soportan `estado=activos|inactivos|todos` o variantes equivalentes del enum de cada módulo.
- JSON es el formato usual. Productos y tipos de producto aceptan `multipart/form-data` cuando se carga `image`.
- Los DTOs validan tipos, rangos, fechas, enums y campos obligatorios. El identificador de producto puede ser `productId` o `barcode`, pero no se permite que ambos apunten a productos distintos.
- `Public` significa que el controlador actual no exige JWT. Las rutas con JWT/roles reflejan los guardas encontrados en código al corte del análisis.

### Núcleo y autenticación

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /` | Estado básico: Hello World | Público |
| `GET /health` | Health check `{ status: "ok" }` | Público |
| `POST /auth/registro` | Registrar cliente y usuario en transacción (`RegisterDto`) | Público |
| `POST /auth/login` | Iniciar sesión (`LoginDto`) | Público |
| `POST /auth/refresh` | Renovar tokens (`RefreshTokenDto`) | Público con refresh token |
| `GET /auth/perfil` | Obtener usuario de la sesión | JWT |

El login actual trabaja con `email` y lo normaliza en minúsculas. El JWT es HMAC-SHA256 propio, con token de acceso y refresh; no hay logout/revocación persistida de tokens.

### Usuarios y clientes

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /usuarios` | Listar usuarios | Público |
| `GET /usuarios/:id` | Ver usuario | Público |
| `POST /usuarios` | Crear usuario | JWT `ADMIN` |
| `POST /usuarios/funcionarios` | Crear funcionario | JWT `ADMIN` |
| `PATCH /usuarios/:id` | Actualizar usuario | JWT `ADMIN` |
| `DELETE /usuarios/:id` | Desactivar/eliminar usuario | JWT `ADMIN` |
| `GET /clientes` | Listar clientes | Público |
| `GET /clientes/:id` | Ver cliente | Público |
| `GET /clientes/:id/referidos` | Referidos directos | JWT; cliente propio |
| `GET /clientes/:id/red-referidos` | Red de referidos | JWT; cliente propio |
| `GET /clientes/:id/estadisticas-referidos` | Estadísticas de referidos | JWT; cliente propio |
| `POST /clientes` | Crear cliente | JWT |
| `POST /clientes/:id/codigo-referido` | Generar código de referido | JWT |
| `PATCH /clientes/:id` | Actualizar cliente | JWT |
| `DELETE /clientes/:id` | Desactivar/eliminar cliente | JWT |
| `PATCH /clientes/:id/reactivar` | Reactivar cliente | Público actualmente |
| `PATCH /clientes/:id/nivel-referido` | Cambiar nivel de referido | JWT `ADMIN` |

### Catálogo: productos, tipos, etiquetas, proveedores y bodegas

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /productos` | Listar productos | Público |
| `GET /productos/utilidades` | Utilidad agregada | JWT `ADMIN`, `CONTADOR` |
| `GET /productos/:id/utilidades` | Utilidad por producto | JWT `ADMIN`, `CONTADOR` |
| `GET /productos/codigo-barras/:code` | Buscar por código | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `GET /productos/:id` | Ver producto | Público |
| `POST /productos` | Crear producto, precios, stock inicial y códigos | JWT `ADMIN` |
| `PATCH /productos/:id` | Actualizar producto | JWT `ADMIN` |
| `PATCH /productos/:id/imagen` | Cargar/reemplazar imagen | Público actualmente |
| `DELETE /productos/:id/imagen` | Eliminar imagen | Público actualmente |
| `DELETE /productos/:id` | Desactivar/eliminar producto | JWT `ADMIN` |
| `PATCH /productos/:id/reactivar` | Reactivar producto | JWT `ADMIN` |
| `GET /tipos-producto` / `GET /tipos-producto/:id` | Listar/ver tipo | Público |
| `POST /tipos-producto` / `PATCH /tipos-producto/:id` | Crear/editar tipo, opcionalmente con imagen | Público actualmente |
| `DELETE /tipos-producto/:id` / `PATCH /tipos-producto/:id/reactivar` | Desactivar/reactivar tipo | Público actualmente |
| `GET /etiquetas` / `GET /etiquetas/:id` | Listar/ver etiqueta | Público |
| `POST /etiquetas` / `PATCH /etiquetas/:id` | Crear/editar etiqueta | Público actualmente |
| `DELETE /etiquetas/:id` / `PATCH /etiquetas/:id/reactivar` | Desactivar/reactivar etiqueta | Público actualmente |
| `GET /proveedores` / `GET /proveedores/:id` | Listar/ver proveedor | Público |
| `POST /proveedores` / `PATCH /proveedores/:id` | Crear/editar proveedor | JWT `ADMIN` |
| `DELETE /proveedores/:id` / `PATCH /proveedores/:id/reactivar` | Desactivar/reactivar proveedor | JWT `ADMIN` |
| `GET /bodegas` / `GET /bodegas/:id` | Listar/ver bodega | Público actualmente |
| `POST /bodegas` / `PATCH /bodegas/:id` | Crear/editar bodega | Público actualmente |
| `DELETE /bodegas/:id` / `PATCH /bodegas/:id/reactivar` | Desactivar/reactivar bodega | Público actualmente |

### Códigos, precios, costos y favoritos

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /codigos-barras` / `GET /codigos-barras/:id` | Listar/ver códigos | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `GET /productos/:id/codigos-barras` | Códigos de un producto | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `POST /productos/:id/codigos-barras` | Crear código | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `PATCH /codigos-barras/:id` | Editar código | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `DELETE /codigos-barras/:id` | Desactivar código | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `PATCH /codigos-barras/:id/reactivar` | Reactivar código | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `PATCH /codigos-barras/:id/principal` | Marcar código principal | JWT `ADMIN`, `BODEGA`, `VENDEDOR` |
| `GET /precios-producto` / `GET /precios-producto/:id` | Listar/ver precios | Público |
| `GET /productos/:id/precios` | Precios de un producto | Público |
| `POST /productos/:id/precios` | Crear precio | JWT `ADMIN` |
| `PATCH /precios-producto/:id` | Editar precio | JWT `ADMIN` |
| `DELETE /precios-producto/:id` | Desactivar precio | JWT `ADMIN` |
| `PATCH /precios-producto/:id/default` | Cambiar precio principal | JWT `ADMIN` |
| `GET /precios-producto/:id/historial` | Historial del precio | Público actualmente |
| `GET /productos/:id/costos` / `POST /productos/:id/costos` | Consultar/crear costo | JWT `ADMIN`, `CONTADOR` |
| `PATCH /costos-producto/:id` / `DELETE /costos-producto/:id` | Editar/desactivar costo | JWT `ADMIN`, `CONTADOR` |
| `GET /productos/favoritos/mios` | Favoritos del usuario | JWT |
| `PUT /productos/:id/favorito` | Agregar favorito | JWT |
| `DELETE /productos/:id/favorito` | Quitar favorito | JWT |

Reglas relevantes: un solo precio activo puede ser principal; el cambio conserva historial y motivo. Los códigos soportan EAN-13, EAN-8, UPC-A, UPC-E, CODE128, QR y otros, con unicidad y principal único por producto.

### Inventario y trazabilidad

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /inventario` | Existencias consolidadas/filtradas | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /inventario/productos/:productId` | Stock por producto | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /inventario/bodegas/:warehouseId` | Stock por bodega | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `POST /inventario/entrada` | Entrada manual | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `POST /inventario/salida` | Salida manual con control de insuficiencia | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `POST /inventario/traslado` | Traslado entre bodegas | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `POST /inventario/ajuste` | Ajuste a cantidad exacta | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /inventario/movimientos` / `GET /inventario/movimientos/:id` | Historial/detalle de movimientos | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /inventario/traslados/tickets` / `GET /inventario/traslados/tickets/:id` | Tickets de traslado | JWT `ADMIN`, `CONTADOR`, `BODEGA` |

Las operaciones de inventario son transaccionales, registran actor y auditoría, manejan unidades de venta/empaque y generan ticket para traslados.

### Facturación, créditos y cotizaciones

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /facturas` / `GET /facturas/:id` | Listar/ver factura | Público actualmente |
| `POST /facturas` | Crear factura/venta | JWT `ADMIN`, `CAJERO`, `VENDEDOR`, `CONTADOR` |
| `PATCH /facturas/:id` | Editar factura | JWT `ADMIN`, `CAJERO`, `VENDEDOR`, `CONTADOR` |
| `PATCH /facturas/:id/validar` | Validar factura pendiente | JWT `ADMIN`, `CONTADOR` |
| `DELETE /facturas/:id` | Anular factura y revertir stock cuando aplica | JWT `ADMIN` |
| `POST /creditos` | Crear crédito directo | Público actualmente |
| `POST /facturas/:id/credito` | Crear crédito desde factura | Público actualmente |
| `GET /creditos` / `GET /creditos/:id` | Listar/ver créditos | Público actualmente |
| `GET /clientes/:id/creditos` | Créditos del cliente | Público actualmente |
| `POST /creditos/:id/pagos` | Registrar abono/pago | Público actualmente |
| `PATCH /creditos/:id/estado` | Cambiar estado de crédito | Público actualmente |
| `GET /cotizaciones` / `GET /cotizaciones/:id` | Listar/ver cotizaciones | Público actualmente |
| `POST /cotizaciones` | Crear cotización | Público actualmente |
| `PATCH /cotizaciones/:id` | Editar cotización | Público actualmente |
| `DELETE /cotizaciones/:id` | Desactivar/eliminar cotización | Público actualmente |
| `PATCH /cotizaciones/:id/estado` | Cambiar estado | Público actualmente |
| `POST /cotizaciones/:id/convertir-factura` | Convertir a factura | Público actualmente |

La factura acepta fuente `ADMIN`, `POS` o `APP_MOVIL` y modalidad `CONTADO` o `CREDITO`. Al crearla puede resolver productos por ID/código, validar precios, aplicar ofertas y referidos, calcular impuestos/utilidad, descontar stock, crear domicilio, registrar beneficios de referidos, notificación y auditoría. Las facturas creadas por `VENDEDOR` quedan inicialmente pendientes de validación.

### Compras y proveedores

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /compras` | Listar órdenes de compra | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /compras/reportes/resumen` | Resumen por proveedor/producto/tiempo | JWT `ADMIN`, `CONTADOR` |
| `GET /compras/pendientes-hoy` | Pendientes del día | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `GET /compras/:id` | Ver orden | JWT `ADMIN`, `CONTADOR`, `BODEGA` |
| `POST /compras` | Crear orden/borrador | JWT `ADMIN`, `CONTADOR` |
| `PATCH /compras/:id` | Editar borrador | JWT `ADMIN`, `CONTADOR` |
| `POST /compras/:id/ordenar` | Pasar a ordenada | JWT `ADMIN`, `CONTADOR` |
| `POST /compras/:id/recibir` | Recibir compra, stock y costo | JWT `ADMIN`, `CONTADOR` |
| `PATCH /compras/:id/anular` | Anular compra | JWT `ADMIN`, `CONTADOR` |

Flujo: `BORRADOR → ORDENADA → RECIBIDA`, con alternativa `ANULADA`. Al recibir se actualiza stock, se registra movimiento, se cierra el costo activo anterior y se crea el nuevo costo unitario.

### Ofertas

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /ofertas` | Listar ofertas | Público actualmente |
| `POST /ofertas/aplicables` | Calcular ofertas aplicables | Público actualmente |
| `GET /ofertas/:id` | Ver oferta | Público actualmente |
| `POST /ofertas` | Crear oferta | Público actualmente |
| `PATCH /ofertas/:id` | Editar oferta | Público actualmente |
| `DELETE /ofertas/:id` | Desactivar oferta | Público actualmente |
| `PATCH /ofertas/:id/reactivar` | Reactivar oferta | Público actualmente |

Tipos de descuento: porcentaje, monto fijo y precio especial. Las reglas pueden incluir vigencia, cantidades mínima/máxima, acumulación y objetivos por cliente, producto, tipo o etiqueta. La venta selecciona la mejor oferta individual o combina ofertas marcadas como acumulables.

### Banca, domicilios y pedidos

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /cuentas-bancarias` / `GET /cuentas-bancarias/:id` | Listar/ver cuentas | Público actualmente |
| `POST /cuentas-bancarias` | Crear cuenta | Público actualmente |
| `PATCH /cuentas-bancarias/:id` | Editar cuenta | Público actualmente |
| `DELETE /cuentas-bancarias/:id` | Desactivar cuenta | Público actualmente |
| `PATCH /cuentas-bancarias/:id/reactivar` | Reactivar cuenta | Público actualmente |
| `GET /movimientos-bancarios` / `GET /movimientos-bancarios/:id` | Listar/ver movimientos | Público actualmente |
| `POST /movimientos-bancarios/ingreso` | Registrar ingreso | Público actualmente |
| `POST /movimientos-bancarios/egreso` | Registrar egreso | Público actualmente |
| `POST /movimientos-bancarios/transferencia` | Transferir entre cuentas | Público actualmente |
| `POST /movimientos-bancarios/ajuste` | Ajustar saldo | Público actualmente |
| `GET /domicilios` / `GET /domicilios/:id` | Listar/ver domicilios | JWT `ADMIN` |
| `POST /domicilios` | Crear domicilio | Público actualmente |
| `PATCH /domicilios/:id` | Editar domicilio | JWT `ADMIN` |
| `PATCH /domicilios/:id/estado` | Cambiar estado | JWT `ADMIN` |
| `DELETE /domicilios/:id` | Cancelar/eliminar domicilio | Público actualmente |
| `GET /tienda/productos` | Catálogo activo para tienda | Público |
| `GET /tienda/productos/:id` | Detalle de producto | Público |
| `GET /tienda/categorias` | Categorías/tipos activos | Público |
| `GET /tienda/etiquetas` | Etiquetas activas | Público |
| `GET /tienda/ofertas` | Ofertas activas | Público |
| `POST /tienda/pedidos` | Crear pedido móvil y factura `APP_MOVIL` | JWT `CLIENTE` |
| `GET /tienda/pedidos` | Listar pedidos móviles | JWT `ADMIN` |
| `GET /tienda/mis-pedidos` | Consultar pedidos propios | JWT `CLIENTE` |

El GMF se calcula al 0,4% para egresos y transferencias salientes cuando `appliesGmf` está activo. El pedido móvil exige que el `clientId` corresponda al token, crea venta de contado y puede generar domicilio.

### Referidos, notificaciones, reportes y auditoría

| Método y ruta | Acción | Acceso |
|---|---|---|
| `GET /referidos` | Listar relaciones/beneficios | JWT `ADMIN` |
| `GET /referidos/resumen-utilidades` | Resumen de utilidades | JWT `ADMIN`, `CONTADOR` |
| `GET /referidos/politicas-utilidad` | Consultar políticas | JWT `ADMIN` |
| `PUT /referidos/politicas-utilidad` | Actualizar políticas | JWT `ADMIN` |
| `PATCH /referidos/politicas-utilidad` | Actualizar políticas, implementación duplicada | JWT `ADMIN` |
| `GET /referidos/:id` | Ver referido | JWT `ADMIN` |
| `POST /referidos` | Crear relación de referido | JWT |
| `POST /referidos/validar` | Validar código/relación | JWT |
| `GET /notificaciones` | Consultar notificaciones recientes | JWT |
| `POST /reportes/email` | Enviar reporte renderizado por correo | JWT `ADMIN`, `CONTADOR` |
| `GET /auditoria` / `GET /auditoria/:id` | Listar/ver auditoría | JWT `ADMIN` |

La configuración predeterminada de referidos es 10%, 10%, 5% y 5% para cuatro generaciones; la cuarta generación se marca como aporte social. El servicio impide ciclos, duplicados y auto-referidos.

## 6. Modelo de datos

### Dominios y modelos principales

| Dominio | Modelos principales |
|---|---|
| Identidad | `User`, `Employee`, `Client` |
| Referidos | `Referral`, `ReferralProfitPolicy`, `ReferralSocialContribution`, `ReferralBenefit`, `ReferralBenefitRedemption` |
| Catálogo | `Product`, `ProductType`, `Provider`, `ProductProvider`, `Tag`, `ProductTag`, `ProductBarcode`, `ProductPackagingProfile` |
| Precios/costos | `ProductPrice`, `ProductPriceHistory`, `ProductCost` |
| Inventario | `Warehouse`, `ProductWarehouse`, `InventoryMovement`, `InventoryTransferTicket` |
| Ventas | `Invoice`, `InvoiceItem`, `Quote`, `QuoteItem`, `Notification`, `Delivery` |
| Créditos | `InvoiceCredit`, `CreditPayment` |
| Compras | `PurchaseOrder`, `PurchaseOrderItem` |
| Promociones | `Offer`, `OfferClient`, `OfferProduct`, `OfferProductType`, `OfferTag` |
| Banca | `BankAccount`, `BankAccountMovement` |
| Control | `AuditLog` |

Relaciones destacadas:

- Un producto puede tener varios proveedores, precios, costos, códigos, etiquetas, favoritos y existencias por bodega.
- Una factura contiene líneas, cliente, usuario autor, bodega, modalidad, origen, crédito, domicilio, cotización y movimientos bancarios relacionados.
- Las compras impactan inventario y costos; las ventas impactan inventario, utilidad, ofertas y referidos.
- Las ofertas se vinculan mediante tablas puente a clientes, productos, tipos y etiquetas.
- Los usuarios pueden ser clientes o funcionarios; el rol `BODEGA` se asocia a una bodega.

### Enums funcionales

`Role`, `QuoteStatus`, `NotificationType`, `ClientType`, `InvoiceStatus`, `InvoiceValidationStatus`, `InvoiceSource`, `DiscountType`, `DeliveryStatus`, `InventoryMovementType`, `BankMovementType`, `UnitType`, `BarcodeType`, `CreditStatus`, `ReferralBenefitStatus`, `PurchaseOrderStatus`, `SaleMode` y `TransferTicketStatus`.

## 7. Flujos integrados principales

### Venta POS o administrativa

1. Se selecciona producto por ID, código o lector; se valida precio, unidad y stock.
2. Se calculan ofertas, descuento de referido, subtotal, impuestos, total y utilidad.
3. Se descuenta inventario en la bodega elegida.
4. Si es crédito, se crea cartera; si corresponde, se registra ingreso bancario.
5. Se registra auditoría, notificación, beneficios de referidos y opcionalmente domicilio.
6. Se genera factura/recibo PDF desde el frontend.

### Pedido de tienda móvil

El cliente autenticado consulta el catálogo público y crea un pedido en `/tienda/pedidos`. El backend crea una factura de origen `APP_MOVIL`, de contado, valida pertenencia del cliente, descuenta stock y puede crear domicilio. El repositorio no contiene un frontend móvil ni integración de pago en línea.

### Compra y recepción

La orden se crea como borrador, se ordena y luego se recibe. La recepción actualiza cantidades por bodega, crea movimientos y actualiza el costo activo del producto. Las bodegas pueden consultar órdenes según la bodega asignada.

### Inventario

Entradas, salidas, ajustes y traslados se ejecutan dentro de transacciones. Se controlan unidades, conversiones compatibles, existencias insuficientes, actor, soporte y auditoría; el traslado genera ticket aprobado.

### Créditos y banca

Los créditos conservan total, pagado, saldo, vencimiento y estado. Un pago puede asociarse a una cuenta bancaria y aumentar su saldo. Los movimientos bancarios soportan ingreso, egreso, transferencia y ajuste, con control de saldo y GMF.

## 8. Capacidades técnicas complementarias

- **Imágenes:** carga de JPG/PNG/WEBP de hasta 5 MB mediante Cloudflare R2; sin R2 configurado, las operaciones de imagen fallan de forma controlada.
- **Correo:** reportes por Resend; requiere `RESEND_API_KEY` y `RESEND_FROM_EMAIL`.
- **Reportes:** la pantalla compone datos desde facturas, créditos, cuentas, movimientos, productos, inventario, clientes, usuarios y bodegas. Exporta CSV/PDF en el navegador y envía una selección por correo.
- **OCR y escaneo:** Tesseract.js, PDF.js, ZXing y `bwip-js` apoyan importación y captura de productos/códigos; no existe un módulo persistente de OCR.
- **Notificaciones:** consulta de las últimas notificaciones, sonido en layout y navegación hacia el módulo relacionado.
- **Unidades y empaque:** `UND`, `KG`, `G`, `LB`, `L`, `ML`, `CAJA`, `PAQUETE`, con perfil de empaque y desglose de cajas/paquetes/unidades.
- **Borrado lógico:** gran parte de catálogos usa estado activo/inactivo y rutas de reactivación.

## 9. Hallazgos, riesgos y brechas

### Prioridad crítica / alta

1. **Autorización de API incompleta.** No existe guard global y varios controladores dejan públicos listados sensibles y operaciones de escritura: créditos, cuentas y movimientos bancarios, cotizaciones, ofertas, tipos, etiquetas, bodegas, creación/cancelación de domicilios, imagen de productos y algunos datos de usuarios/clientes. Debe aplicarse una política explícita por endpoint, con pruebas por rol.
2. **La seguridad del frontend no es suficiente.** `ProtectedRoute` solo controla navegación; un cliente puede llamar directamente a la API. Los roles y ownership deben verificarse en backend para cada lectura y mutación.
3. **Configuración JWT insegura por defecto.** El secreto predeterminado es conocido y el refresh puede no expirar. En producción se requiere secreto obligatorio, expiración corta, revocación o rotación y logout real.
4. **Datos de acceso demo en el frontend.** Los accesos rápidos y credenciales de demostración están compilados en la aplicación; deben eliminarse o aislarse estrictamente del entorno productivo.
5. **Exposición de datos públicos.** Usuarios, clientes, facturas, créditos, precios/historial y datos bancarios tienen lecturas públicas en distintos endpoints. Incluso cuando una respuesta sea “segura”, la superficie debe revisarse campo por campo.

### Prioridad media

6. **Contrato documental desactualizado.** `app/api/README.md` y `API_APP_MOVIL_ESTADO.md` todavía muestran ejemplos con `username`, mientras los DTOs actuales usan `email`; también describen permisos distintos a los guardas actuales en domicilios y otros módulos. Este documento debe tomarse como inventario del código actual hasta sincronizar la documentación.
7. **Pruebas insuficientes para el alcance.** Hay pruebas unitarias y scripts de contrato/endpoints, pero el E2E principal cubre esencialmente salud/Hello World y los scripts existentes contienen supuestos de contratos o autenticación anteriores. Falta una matriz automatizada de permisos, ownership, transacciones y flujos completos.
8. **No hay contrato OpenAPI formal.** La ausencia de Swagger/OpenAPI dificulta generar clientes, validar cambios y mantener alineada la aplicación móvil.
9. **Reportes principalmente en frontend.** La pantalla carga múltiples datasets y calcula agregados en el navegador. Esto puede ser costoso con grandes volúmenes y puede producir inconsistencias entre consultas; conviene mover agregaciones críticas a endpoints backend versionados.
10. **Tienda móvil incompleta como producto integral.** Existe API de catálogo y pedido, pero no se observan cotización de envío, pago en línea, tracking, asignación de repartidor ni frontend móvil dentro de este repositorio.
11. **Ajuste de fecha en dashboard.** El gráfico de ingresos mensuales construye meses usando el año `2026` fijo; debe calcularse a partir de la fecha actual o del rango seleccionado.
12. **Duplicidad de contrato.** `/referidos/politicas-utilidad` tiene métodos `PUT` y `PATCH` con la misma intención; conviene conservar uno y deprecar el otro.
13. **Notificaciones sin destinatario persistente.** El modelo no muestra una relación de usuario destinatario; la consulta de notificaciones recientes puede terminar mostrando eventos a todos los usuarios autenticados, según el uso actual.
14. **Configuraciones externas obligatorias para ciertas funciones.** Imágenes y reportes por correo dependen de R2/Resend; deben validarse en el despliegue y reflejarse en health checks o mensajes operativos.

## 10. Estado de documentación y pruebas

Documentos relevantes encontrados:

- `app/api/README.md`: guía extensa de API, pero con ejemplos y permisos parcialmente desactualizados.
- `API_APP_MOVIL_ESTADO.md`: estado de integración móvil; requiere actualizar contrato de login y permisos.
- `manual_usuario_apps_factory_mundo_tienda.md` y documentos de checklist: describen operación funcional para usuario.
- `app/api/test/app.e2e-spec.ts`, `app/api/src/**/*.spec.ts` y scripts en `app/api/scripts`: base de pruebas existente, todavía sin cobertura integral de seguridad y flujos.

Para mantener el software sincronizado se recomienda que el siguiente contrato oficial se genere desde DTOs/controladores, incluya ejemplos actuales con `email`, enumere roles por operación y se ejecute en CI junto con pruebas de autorización.

## 11. Archivos fuente principales revisados

- `app/api/src/app.module.ts`
- `app/api/src/main.ts`
- `app/api/src/config/envs.ts`
- `app/api/src/modules/*`
- `app/api/prisma/schema.prisma`
- `app/api/prisma/migrations/*`
- `app/web/src/App.jsx`
- `app/web/src/context/AuthContext.jsx`
- `app/web/src/lib/api-client.js`
- `app/web/src/modules/*`
- `docker-compose.yml`, `Dockerfile.api`, `app/api/package.json`, `app/web/package.json`

**Conclusión:** el producto ya tiene una base ERP funcional y bastante integrada para operación interna, POS y pedidos de tienda. Antes de exponerlo ampliamente o conectarlo a una aplicación móvil en producción, la prioridad es cerrar autorización backend, endurecer JWT/configuración, formalizar OpenAPI, actualizar documentación/pruebas y completar los componentes móviles/logísticos que todavía no están implementados.

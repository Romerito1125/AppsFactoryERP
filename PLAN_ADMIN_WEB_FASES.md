# Plan Admin Web Por Fases

## Objetivo

Definir lo que se puede implementar ahora en `app/web` usando el backend actual de `app/api`, para dejar el panel administrativo funcional y alineado con la API ya existente.

## Alcance De Este Documento

Este plan incluye solo funcionalidades que hoy ya tienen base suficiente en el backend actual.

No incluye como cierre total:

- permisos finos por modulo
- auditoria completa de acciones
- reportes contables avanzados
- 4x1000 real
- OCR/scanner
- cron jobs de alertas
- integracion con Saint
- comisiones reales de referidos por utilidad

## Estado Actual

### Frontend admin ya existente

- Dashboard
- Usuarios
- Clientes
- Productos
- Bodegas
- Facturas

### Backend disponible para llevar al frontend admin

- Usuarios
- Clientes
- Productos
- Tipos de producto
- Etiquetas
- Proveedores
- Bodegas
- Inventario
- Facturas
- Precios de producto
- Ofertas
- Cotizaciones
- Creditos
- Domicilios
- Referidos
- Cuentas bancarias
- Movimientos bancarios

## Problemas Criticos A Corregir Primero

Antes de abrir modulos nuevos, hay que corregir estas pantallas porque hoy no estan alineadas con la API:

### Usuarios

- el backend exige `clientId`
- el frontend actual no envia ese campo
- se debe agregar lookup de clientes y asociacion del usuario

### Clientes

- el backend exige `clientType`
- el frontend actual no lo envia
- se deben agregar acciones de referidos ya disponibles en API

### Productos

- el frontend actual usa un contrato viejo
- el backend actual maneja:
  - `productTypeId`
  - `providerId`
  - `brand`
  - `minimumStock`
  - `maximumStock`
  - `tagIds`
  - `prices[]`
  - `warehouses[]`
- este modulo requiere refactor completo

### Facturas

- falta manejo de `productPriceId`
- falta conectar mejor cliente, items y precios
- debe prepararse para enlazar credito y domicilio

### Dashboard

- hoy calcula stock con supuestos viejos
- debe recalcularse con inventario real y estructuras actuales

## Fase 1 - Estabilizacion Base

### Objetivo

Dejar funcionales y compatibles con la API los modulos que ya existen en el admin.

### Modulos

- Dashboard
- Usuarios
- Clientes
- Productos
- Bodegas
- Facturas

### Entregables

#### Dashboard

- KPIs usando datos reales del backend
- resumen de ventas
- resumen de clientes
- resumen de inventario consolidado
- resumen por bodega sin depender de campos obsoletos

#### Usuarios

- crear usuario con `clientId`
- editar usuario
- desactivar/reactivar usuario
- mostrar relacion usuario-cliente

#### Clientes

- crear cliente con `clientType`
- editar cliente
- desactivar/reactivar cliente
- ver nivel de referido
- generar codigo de referido
- consultar referidos por cliente

#### Productos

- crear producto con tipo, proveedor, marca y stock base
- editar producto
- manejar tags
- manejar stock minimo y maximo
- manejar precios iniciales
- manejar asignacion a una o varias bodegas

#### Bodegas

- mantener CRUD actual
- preparar consumo desde inventario y productos

#### Facturas

- crear factura con cliente e items
- seleccionar precio del producto cuando existan multiples precios
- ver detalle completo
- editar consecutivo
- anular factura

### Criterio De Cierre

- los modulos existentes dejan de romper por payload desactualizado
- crear y editar funciona contra la API real
- dashboard muestra datos consistentes con la informacion actual

## Fase 2 - Maestros Necesarios Para Operacion

### Objetivo

Construir catalogos base que el resto de modulos necesita.

### Modulos nuevos

- Tipos de producto
- Proveedores
- Etiquetas

### Entregables

- rutas nuevas en el admin
- navegacion actualizada
- CRUD completo por modulo
- filtros por estado
- vista de detalle
- desactivar/reactivar
- lookups integrados para productos y ofertas

### Criterio De Cierre

- productos puede trabajar contra catalogos reales
- los tres maestros quedan administrables desde el panel

## Fase 3 - Inventario Y Precios

### Objetivo

Cubrir la operacion de stock y precios multiples con lo ya soportado por backend.

### Modulos nuevos

- Inventario
- Precios de producto

### Entregables

#### Inventario

- vista consolidada por producto
- vista por bodega
- historial de movimientos
- formularios para:
  - entrada
  - salida
  - traslado
  - ajuste
- detalle de movimiento con motivo, fecha y cantidades

#### Precios de producto

- listar precios por producto
- crear precio adicional
- editar precio
- marcar precio por defecto
- ver historial de cambios

### Criterio De Cierre

- el administrador puede operar stock desde el frontend
- se puede manejar mas de un precio por producto
- se puede consultar historial de precios y movimientos

## Fase 4 - Ventas Extendidas

### Objetivo

Ampliar la capa comercial sobre facturas con modulos ya soportados por la API.

### Modulos nuevos

- Cotizaciones
- Ofertas

### Entregables

#### Cotizaciones

- crear cotizacion
- listar cotizaciones
- editar vencimiento
- cambiar estado
- convertir cotizacion a factura

#### Ofertas

- crear oferta
- listar ofertas
- editar oferta
- activar/desactivar oferta
- asociar oferta a clientes
- asociar oferta a productos
- asociar oferta a tipos de producto
- asociar oferta a etiquetas

### Criterio De Cierre

- el admin puede crear cotizaciones y convertirlas en factura
- el admin puede administrar ofertas usando la estructura actual del backend

## Fase 5 - Creditos Y Tesoreria Base

### Objetivo

Construir el frente administrativo de cobros y bancos con el backend ya disponible.

### Modulos nuevos

- Creditos
- Cuentas bancarias
- Movimientos bancarios

### Entregables

#### Creditos

- crear credito desde factura
- listar creditos
- ver creditos por cliente
- registrar pagos o abonos
- cambiar estado del credito

#### Cuentas bancarias

- crear cuenta
- editar cuenta
- desactivar/reactivar si aplica por flujo
- listar saldos actuales

#### Movimientos bancarios

- registrar ingreso
- registrar egreso
- registrar transferencia
- registrar ajuste
- ver historial de movimientos

### Criterio De Cierre

- el admin puede administrar cuentas y movimientos
- un credito puede crearse, consultarse y abonarse desde el panel

## Fase 6 - Domicilios Y Operacion De Entrega

### Objetivo

Dar visibilidad y control administrativo a la operacion de domicilios.

### Modulo nuevo

- Domicilios

### Entregables

- listar domicilios
- crear domicilio asociado a factura
- editar datos de entrega
- actualizar estado
- ver detalle del pedido y destinatario

### Criterio De Cierre

- el administrador puede ver y gestionar domicilios desde el panel web

## Fase 7 - Referidos Basicos

### Objetivo

Exponer en el panel la parte de referidos que ya existe en API.

### Modulo nuevo

- Referidos

### Entregables

- listar relaciones de referidos
- consultar referidos por cliente
- visualizar codigo de referido
- visualizar nivel de referido
- conectar acciones desde modulo de clientes

### Criterio De Cierre

- el admin puede consultar y operar la estructura basica de referidos

## Orden Recomendado De Implementacion

1. Estabilizar modulos actuales.
2. Crear maestros base: tipos de producto, proveedores, etiquetas.
3. Construir inventario y precios de producto.
4. Construir cotizaciones y ofertas.
5. Construir creditos, cuentas bancarias y movimientos bancarios.
6. Construir domicilios.
7. Construir referidos.

## Resultado Esperado Al Terminar Este Plan

Si se completa este plan, el admin web quedaria con capacidad real para:

- administrar usuarios y clientes
- administrar catalogo de productos con relaciones reales
- manejar bodegas e inventario
- manejar varios precios por producto
- facturar con mejor alineacion al backend
- manejar cotizaciones
- manejar ofertas
- manejar creditos y abonos
- manejar cuentas bancarias y movimientos
- administrar domicilios
- consultar referidos

## Pendientes Fuera De Este Plan

Estos puntos no se deben marcar como completos solo con este trabajo porque requieren definicion adicional o mas backend:

- permisos detallados por rol y modulo
- auditoria completa
- confirmaciones sensibles respaldadas por reglas de seguridad
- semaforo de stock automatizado
- reportes semanales automaticos
- conversiones complejas de empaque/unidad
- cuentas por cobrar con cierres contables completos
- 4x1000 real y reportable
- exogenas e IVA avanzado
- scanner de codigos y OCR de facturas
- importacion o integracion con Saint

## Nota Final

Este documento esta hecho para ejecutar trabajo real en `app/web` con la API actual, sin prometer funcionalidades que hoy todavia no tienen base completa en backend o definicion funcional cerrada.

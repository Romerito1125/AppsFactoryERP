# Lote 01 — M01: integridad de precios e IVA

**Estado:** correcciones aplicadas; pendiente prueba rápida y verificación final  
**Numerales:** #33, #41 y #42  
**Dependencias:** diagnóstico general completado; se adoptó el contrato neto/bruto descrito abajo para conservar compatibilidad con facturas existentes.  
**Modo actual:** cambios aplicados en backend, Productos, POS y Ventas; falta ejecutar la prueba manual.

## Objetivo

Conseguir que Productos, las dos cajas activas y Facturación utilicen la misma selección de precio, la misma semántica de precio neto/final y la misma fórmula de IVA y redondeo.

## Por qué este lote es el primero

Los importes de precio, IVA y total alimentan ventas, compras, inventario valorizado, cartera, documentos y reportes. Si se corrigen primero devoluciones o reportes, esos módulos pueden terminar usando fórmulas diferentes.

## Superficies actuales que deben quedar cubiertas

El repositorio tiene dos entradas de caja:

1. `app/web/src/modules/pos/pos-window.jsx`, cargada en `/pos` por `PosPage`.
2. `app/web/src/modules/sales/sales-window.jsx`, cargada dentro del escritorio por `App.jsx`.

Corregir únicamente una de ellas dejaría abierto #33 y podría mantener diferencias en #41.

## Estado técnico actual

- `Product.taxRate` contiene la tasa de IVA de venta.
- `ProductPrice.price` se persiste actualmente como precio antes de IVA.
- Productos convierte el precio neto de API a precio con IVA para editarlo y lo convierte otra vez a neto antes de guardar.
- `ProductCost.cost` representa costo de adquisición sin IVA. Las migraciones `20260930110000_remove_purchase_tax_from_product_cost` y `20260930113000_remove_purchase_tax_from_orders` eliminaron el IVA de costo y compra.
- `FacturasService.create()` resuelve precio, ofertas, subtotal, IVA, total y disminución de inventario en una transacción.
- `InvoiceItem.unitPrice`, `subtotal`, `taxAmount` y `total` siguen la lógica actual de precio neto más IVA.
- `CreateInvoiceItemDto.unitPrice` es opcional y no declara si recibe neto o final.
- `sales-window.jsx`, `pos-window.jsx` y `products-window.jsx` contienen cálculos y conversiones duplicadas.
- Las cajas calculan totales en el navegador con sumas de JavaScript; el backend vuelve a calcularlos.
- `ProductPricesService` ya valida niveles 0–3, precio default e historial de cambios.

## Contrato propuesto para compatibilidad

Antes de modificar código se debe aprobar este contrato:

- conservar `ProductPrice.price` e `InvoiceItem.unitPrice` como importes netos antes de IVA;
- mostrar y editar precio final con IVA en la interfaz;
- convertir una sola vez de final a neto antes de enviar el API;
- recalcular base, IVA y total en backend como fuente de verdad;
- devolver importes etiquetados como base, IVA y total;
- mantener las facturas históricas sin recalcularlas.

Si se requiere que el API reciba precio final, agregar un campo explícito como `unitPriceGross`; no cambiar silenciosamente el significado de `unitPrice`.

## Archivos candidatos

### Backend

- `app/api/src/modules/facturas/facturas.service.ts`
- `app/api/src/modules/facturas/dto/create-invoice-item.dto.ts`
- `app/api/src/shared/products/product-resolver.service.ts`
- `app/api/src/modules/product-prices/product-prices.service.ts`
- `app/api/src/modules/productos/product-profit.service.ts`
- `app/api/src/common/utils/` o `app/api/src/shared/products/` para utilidad monetaria común

### Frontend

- `app/web/src/modules/pos/pos-window.jsx`
- `app/web/src/modules/sales/sales-window.jsx`
- `app/web/src/modules/products/products-window.jsx`
- `app/web/src/lib/` para utilidad de conversión y redondeo compartida

### Fuera del lote, pero dependientes

- `app/api/src/modules/compras/compras.service.ts`
- `app/web/src/modules/purchases/purchases-window.jsx`
- `app/api/src/modules/inventario/inventario.service.ts`
- `app/web/src/modules/reports/reports-window.jsx`

Estos archivos se revisan para no romper el contrato, pero #37, #65 y #68 se cierran en el Lote 02.

## Secuencia de trabajo y avance

1. **Aplicado:** contrato neto/bruto, redondeo por dinero y permiso explícito para editar precio final.
2. **Aplicado:** utilidades compartidas de redondeo, conversión neto/final y cálculo de base, IVA y total.
3. **Aplicado:** POS y Ventas conservan la selección por nivel/default y muestran precio final con IVA.
4. **Aplicado:** `FacturasService` recalcula importes, evita doble IVA, registra overrides y mantiene la transacción de inventario.
5. **Aplicado:** `/pos` usa el cálculo central, permite override autorizado y envía `unitPriceGross` explícito.
6. **Aplicado:** `sales-window.jsx` usa el mismo cálculo, conserva crédito, cotizaciones y búsqueda.
7. **Aplicado:** Productos comparte conversiones y muestra el valor final también en el resumen por unidad.
8. **Aplicado:** Productos emite `catalog:changed`; POS y Ventas recargan catálogo y actualizan líneas abiertas.
9. **Corregido:** se conservan decimales en base, IVA y total durante el cálculo de línea; la interfaz muestra dos decimales.
10. **Corregido:** POS emite `sales:invoice-created` y Ventas recarga facturas inmediatamente sin actualizar manualmente la página.
11. **Pendiente:** ejecutar `TEST_RAPIDO.md` y luego las pruebas completas de `TEST_PLAN.md`.
12. **Pendiente:** registrar evidencia y cerrar #33, #41 y #42 después de la prueba.

## Criterio de cierre

- El mismo producto y nivel muestran el mismo precio en Productos, `/pos` y Ventas.
- El backend calcula base, IVA y total una sola vez y con redondeo definido.
- Una edición autorizada del precio final se guarda como neto compatible con el modelo existente.
- Una venta no duplica el IVA.
- Ofertas y descuentos se aplican antes del cálculo final sin volver a gravar un importe final.
- Las dos cajas y el documento impreso coinciden con la factura persistida.
- Los niveles 0, 1, 2 y 3 conservan su identidad y fallback.
- El historial de precios conserva motivo y actor.
- Las facturas históricas no cambian al editar catálogo.
- Inventario y factura siguen dentro de la transacción actual.

## Riesgos

- Hay dos flujos de caja activos.
- Cambiar `unitPrice` puede afectar clientes API existentes.
- Los cambios locales no confirmados en Ventas, POS y CSS deben preservarse.
- La caché comercial puede ocultar precios recién modificados.
- Precio de venta con IVA y costo de compra sin IVA no deben mezclarse.


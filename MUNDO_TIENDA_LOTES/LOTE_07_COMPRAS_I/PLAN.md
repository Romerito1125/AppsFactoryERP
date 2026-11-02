# Lote 07 — Compras I

**Fichas:** #69/#70 Total operación (C26/C29), #63 entrega prevista, #36 proveedor sugerido, #73 borrador de compra, #71 alta de producto.

## Alcance implementado
- **#69/#70** `purchase-total-dialog.jsx`: descuentos 1 y 2, flete, total neto, base imponible, retención, efectivo/cheques, saldo pendiente, orden de compra, tipo de operación, fecha de posteo/factura, días de vencimiento, comentarios, copias y «guardar cambio de precio». Se abre con *Guardar compra*; F3 acepta, Esc cancela. Con pago, la compra se ordena, recibe y paga (`/compras/:id/pagos`).
- **#63** Etiqueta «Entrega prevista del proveedor».
- **#36** `GET /compras/proveedor-sugerido?productId=` (historial → marca → principal) y aviso en la compra.
- **#73** Botones *En espera* y *Borradores* en compras (kind `COMPRA`).
- **#71** Diálogo «INGRESO DE NUEVO PRODUCTO».

## Backend
Campos nuevos en `PurchaseOrder` (descuentos, flete, condición de pago, fechas, tipo de operación, referencia de orden). `commercialTerms` recalcula totales.

## Pendiente
- El número de copias se captura pero la impresión de la compra sigue siendo la vista previa PDF.

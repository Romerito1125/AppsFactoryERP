# Prueba rápida — Lote 07

**Puntos del plan que se prueban:** #69/#70 Total operación de Compras, #63 entrega prevista, #36 proveedor sugerido, #73 borrador de compra y #71 alta de producto. Consulta `PLAN.md`, «Alcance implementado» y «Criterio de cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #69/#70 | **Compras → Nueva compra → Guardar compra** | 1. Agrega productos. 2. Pulsa Guardar compra. 3. Revisa descuentos, flete, IVA, retención, forma de pago y saldo. 4. Confirma con F3. 5. Revisa la compra recibida y pagada. |
| #63 | **Compras → Nueva compra** | 1. Ubica Entrega prevista del proveedor. 2. Selecciona fecha. 3. Guarda. 4. Reabre la compra y confirma la fecha. |
| #36 | **Compras → Nueva compra** | 1. Agrega un producto con historial. 2. Revisa Proveedor sugerido. 3. Confirma que la sugerencia coincide con historial, marca o proveedor principal. |
| #73 | **Compras → En espera / Borradores** | 1. Deja una compra sin terminar. 2. Pulsa En espera. 3. Recupera el borrador. 4. Guarda la compra. 5. Confirma que se elimina de borradores. |
| #71 | **Compras → Nuevo producto** | 1. Pulsa Nuevo producto. 2. Completa los datos mínimos. 3. Guarda. 4. Confirma que el producto aparece para agregarlo a la compra. |

**Antes:** migración aplicada, API reiniciada. Usuario ADMIN/CONTADOR.

- [ ] Compras → agrega 2 productos → *Guardar compra* abre **TOTAL OPERACIÓN**.
- [ ] Primer descuento 10 %: Total neto baja 10 %; flete 5.000 lo sube 5.000.
- [ ] Enter avanza de campo en campo; F3 acepta; Esc cancela.
- [ ] Sin pago: saldo pendiente = total a pagar; la compra queda a crédito con vencimiento = fecha + días.
- [ ] Con efectivo = total y cuenta elegida: la compra queda recibida y pagada; el banco baja ese valor.
- [ ] Pago mayor al total a pagar: error «Lo pagado supera…».
- [ ] Al agregar un producto con historial aparece «Proveedor sugerido…».
- [ ] *En espera* guarda la compra; *Borradores* la recupera; al guardar, el borrador desaparece.
- [ ] La etiqueta dice «Entrega prevista del proveedor».
- [ ] *Nuevo producto* abre «INGRESO DE NUEVO PRODUCTO».

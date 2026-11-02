# Prueba rápida — Lote 06

**Puntos del plan que se prueban:** #43 separación cajero/vendedor, #54 ticket, #50 renglones y contraste, #30 ventanas sin recortes y #73 borradores de venta. Consulta `PLAN.md`, «Alcance implementado» y «Cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #43 | **Ventas → Facturación** | 1. Inicia como CAJERO. 2. Selecciona otro vendedor. 3. Emite. 4. Revisa cajero y vendedor en factura y ticket. |
| #54 | **Ventas → Facturación → Ticket** | 1. Emite una factura. 2. Pulsa Ticket. 3. Revisa IVA, medios de pago, vendedor y cajero. 4. Reimprime desde el documento. |
| #50/#30 | **Ventas → Facturación** | 1. Usa resolución 1366×768. 2. Revisa que haya al menos 14 filas. 3. Abre Total operación, Cobrar y Devoluciones. 4. Confirma que cada ventana tiene scroll y no corta botones. |
| #73 | **Ventas → Facturación → En espera / Borradores** | 1. Agrega productos. 2. Guarda con F8. 3. Recupera desde Borradores. 4. Emite. 5. Confirma que el borrador desaparece. |

**Antes:** migración `20261105100000_roadmap_lotes_06_10` aplicada y API reiniciada. Usuario CAJERO y otro VENDEDOR.

## #43 Cajero y vendedor
- [ ] Factura una venta como cajero eligiendo otro vendedor: el listado muestra Vendedor y Cajero distintos.
- [ ] Sin elegir vendedor: vendedor = cajero.
- [ ] El documento y el ticket muestran ambos.

## #54 Ticket
- [ ] Botón *Ticket* imprime formato angosto (80 mm) con IVA por tarifa y medios de pago.
- [ ] Reimprimir desde el diálogo del documento funciona.

## #50 Renglones y contraste
- [ ] La tabla de facturación muestra al menos 14 renglones en 1366×768 y el texto es legible.

## #30 Ventanas
- [ ] En 1366×768 ningún diálogo (Total operación, Cobrar, Devoluciones) queda recortado; hay scroll interno.

## #73 Borradores
- [ ] F8 deja la venta en espera y limpia la caja.
- [ ] F9 lista el borrador, lo carga y al facturar desaparece.
- [ ] Otro usuario no ve borradores ajenos (ADMIN sí).

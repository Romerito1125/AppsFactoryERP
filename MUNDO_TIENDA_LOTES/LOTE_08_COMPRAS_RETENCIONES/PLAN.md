# Lote 08 — Compras II y retenciones

**Fichas:** #74 PDF, #75 retenciones, #76 base editable con permiso y motivo, #77 reporte de retenciones, #64 compra no cerrable.

## Alcance implementado
- **#74** `lib/simple-pdf.js` (PDF multipágina) y botón *Descargar PDF* en la vista previa de compra, con IVA, retención, forma de pago y saldo.
- **#75** Retención por proveedor (tasa y base mínima) calculada en backend y en el diálogo Total operación.
- **#76** Base editable: solo ADMIN/CONTADOR con motivo (`retentionBaseReason`, `retentionBaseEditedBy`). Una base calculada automáticamente no requiere permiso.
- **#77** Pestaña *Retenciones* en Reportes (base, tasa, retención, neto, base corregida; CSV/PDF).

## Pendiente
- **#64** «Compra no cerrable»: requiere definición de negocio (qué estados bloquean el cierre). No implementado.

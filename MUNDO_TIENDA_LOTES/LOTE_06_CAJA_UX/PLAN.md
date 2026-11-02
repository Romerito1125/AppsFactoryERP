# Lote 06 — Caja rápida y UX

**Fichas:** #43 cajero ≠ vendedor, #54 ticket tipo D1/ARA, #50 más renglones y contraste, #30 ventanas sin recortes, #73 borradores de venta.

## Alcance implementado
- **#43** La factura guarda `createdBy*` (cajero = usuario autenticado) y `sellerUserId/sellerUsername` (vendedor elegido en caja; por defecto el cajero). Se muestran ambos en el listado, el documento y el ticket.
- **#54** `web/src/lib/invoice-ticket.js`: ticket 80 mm con IVA por tarifa, medios de pago, vendedor y cajero. Botón *Ticket* en el último documento y en el diálogo del documento.
- **#50** Más renglones visibles en facturación (14–22) y contraste reforzado (CSS en `returns-panel.css`).
- **#30** Reglas globales en `index.css`: diálogos y ventanas con `max-height` y scroll para 1366×768.
- **#73** Modelo `DocumentDraft` + módulo `borradores` (`GET/POST/DELETE /borradores`) y UI `drafts-dialog` (F8 *En espera*, F9 *Borradores*).

## Migración
`20261105100000_roadmap_lotes_06_10` (aditiva; ROLLBACK.sql incluido).

## Fuera de alcance / pendiente
- Descuento por línea en caja (F3) sigue deshabilitado.

# Pruebas automáticas — Lotes 06 a 10

Separadas de los `TEST_RAPIDO.md` (manuales). Cubren la API real contra la BD configurada.

```bash
cd app/api
API_URL=http://127.0.0.1:7502 node scripts/auto-test-lotes-06-10.js
```

Crea datos `QA-AUTO-<timestamp>` (tipo, 2 bodegas, proveedor, cliente, producto, cuenta) y limpia lo que puede (compras anuladas, borradores borrados). El resultado queda en `RESULTADO_AUTOMATICO.json`.

**Última corrida: 22/22 OK** (API con el código nuevo y la migración `20261105100000` aplicada). También: `tsc` sin errores, jest 37/37, `vite build` OK.

| Lote | Cubre |
|---|---|
| 06 | cajero/vendedor en factura, `bankMovement`/`credit` en GET factura, borradores CRUD, facturar preventa con `quoteId` (conversión única y cliente distinto rechazado) |
| 07 | términos de compra (descuentos, flete, tipo, orden), recálculo al editar, proveedor sugerido |
| 08 | base de retención editada exige motivo, base automática no, campos para reporte |
| 09 | preventa con bodega por línea, ATENDIDO→SURTIDO, aviso BODEGA_TAREA, traslados sugeridos A→B |
| 10 | 4x1000 automático en pago/egreso (incluye saldo justo y apagado), datos de reportes |

**No cubierto automáticamente (queda en el manual):** pantallas web (diálogo Total operación, ticket, F8/F9, PDF, pestañas de reportes), permisos por rol (CONTADOR/BODEGA/VENDEDOR) y el cierre del día.

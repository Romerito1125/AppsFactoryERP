# Prueba rápida — Lote 10

**Puntos del plan que se prueban:** #55 reportes cruzados, #38 cierre del día, #35 4×1000 automático, #52 miembro fiel y #70 integración con Compras. Consulta `PLAN.md`, «Alcance implementado» y «Criterio de cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #35 | **Administrativo → Bancos** y **Compras → Pagos** | 1. Activa 4×1000 automático en una cuenta. 2. Paga una compra. 3. Revisa el egreso y el movimiento GMF separado. 4. Repite con saldo justo y confirma que incluye GMF. |
| #55 | **Reportes → Ventas cruzadas** | 1. Selecciona periodo. 2. Agrupa por barrio, marca, proveedor, vendedor o bodega. 3. Filtra. 4. Haz una devolución y confirma que el neto baja. 5. Descarga CSV/PDF. |
| #38 | **Reportes → Cierre del día** | 1. Selecciona fecha. 2. Revisa contado, crédito, cobros, anticipos, devoluciones, pagos y GMF. 3. Confirma el movimiento neto de caja. |
| #52 | **Ventas → Total operación** y **Cuentas por cobrar** | 1. Usa cliente con saldo de miembro fiel. 2. Aplica el beneficio. 3. Confirma la reducción del saldo y su reflejo en el cierre. |

- [ ] Bancos → editar cuenta → marcar «4x1000 automático» → guardar.
- [ ] Pagar una compra desde esa cuenta: aparece un movimiento «GMF 4x1000 · …» aparte.
- [ ] Con saldo justo, el pago falla por saldo insuficiente (incluye GMF).
- [ ] Reportes → *Ventas cruzadas*: agrupar por Barrio muestra totales; filtrar por marca reduce filas.
- [ ] Hacer una devolución y confirmar que *Neto* baja en el reporte.
- [ ] Reportes → *Cierre del día*: contado y crédito aparecen; crédito y anticipos aplicados marcan «NO SUMA».
- [ ] Movimiento neto de caja = contado + cobros + anticipos − devoluciones − pagos − GMF.
- [ ] CSV y PDF descargan.

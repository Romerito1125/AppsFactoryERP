# Prueba rápida — Lote 05 (devoluciones)

**Puntos del plan que se prueban:** #56 devolución de contado, #58 devolución ligada a crédito y #61 permisos, auditoría e inventario. Las capturas #57, #59 y #60 son referencias visuales. Consulta `PLAN.md` para el alcance y los límites.

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #56 | **Ventas → Facturación → Devoluciones** | 1. Selecciona una factura de contado. 2. Elige las unidades. 3. Indica motivo y cuenta de devolución. 4. Guarda. 5. Revisa que suba el stock y baje el banco. |
| #58 | **Ventas → Facturación → Devoluciones** y **Administrativo → Cuentas por cobrar** | 1. Selecciona una factura a crédito. 2. Devuelve una parte. 3. Confirma que disminuye la deuda o queda saldo a favor según la opción. 4. Revisa Estado de cuenta. |
| #61 | **Ventas → Facturación → Devoluciones** y **Administrativo → Auditoría** | 1. Intenta devolver con un usuario sin permiso. 2. Confirma el rechazo. 3. Ejecuta con ADMIN/CAJERO. 4. Revisa motivo, usuario, fecha y movimiento en auditoría. |

**Antes de empezar:** migración `20261102100000_add_returns_advances_credit_receipts` aplicada. Usuario ADMIN o CAJERO.  
Prepara dos facturas: **F1** de contado (3 unidades de un producto con IVA, pagada con la Cuenta A) y **F2** a crédito (2 unidades).  
Anota: stock del producto ______ · saldo Cuenta A ______ · saldo del crédito F2 ______

## #56 Devolución parcial (contado)
- [ ] Ventas → Facturación → pestaña **Devoluciones**. Elige F1: se ven vendido 3, devuelto 0, disponible 3.
- [ ] Devuelve **1** unidad con motivo «Empaque dañado». Como ya estaba pagada, pide elegir «cómo se devuelve».
- [ ] Elige «Devolver dinero desde una cuenta» → Cuenta A. Registra.
- [ ] Cuenta A bajó exactamente el valor de 1 unidad con IVA (total de la línea ÷ 3).
- [ ] Stock del producto subió +1 en la bodega de la venta.
- [ ] F1 sigue **Activa** (no se anuló); en la pantalla de devolución ahora: devuelto 1, disponible 2.
- [ ] Intenta devolver 3 unidades: se limita a 2 (y si lo fuerzas por API: error «Solo se pueden devolver 2»).
- [ ] Devuelve las 2 restantes: el total acumulado devuelto = total de la línea (sin centavos de diferencia).

## #58 Devolución ligada a crédito
- [ ] Elige F2 (crédito, sin abonos): se muestra «Deuda pendiente». Devuelve 1 unidad.
- [ ] No pide método de reintegro (todo se aplica a la deuda). Registra.
- [ ] El saldo del crédito bajó el valor devuelto; el saldo de la Cuenta A **no** cambió.
- [ ] Haz un abono parcial a otra factura a crédito F3 y devuelve **más** que su saldo: la deuda queda en 0 y el excedente pide «saldo a favor» o «dinero».
- [ ] Con «saldo a favor»: aparece en Cuentas por cobrar → Anticipos con origen «Devolución».
- [ ] La deuda nunca queda negativa.

## #61 Historial
- [ ] En «Historial de devoluciones» aparecen las devoluciones hechas, con factura, cliente, productos, motivo, total, «Reduce deuda», «Dinero», «Saldo a favor» y usuario.
- [ ] Buscar por número de factura, por cliente y por nombre de producto filtra correctamente.
- [ ] El filtro Desde/Hasta funciona.
- [ ] Un usuario con solo `RETURNS_VIEW` ve el historial pero **no** el formulario de nueva devolución.

## Integridad
- [ ] Anula F1 (ADMIN) después de las devoluciones: el stock no sube otra vez por lo ya devuelto.
- [ ] Revisa Auditoría: hay un registro «Registro la devolución DV-…».
- [ ] Sin errores en consola ni en el log de la API.
- [ ] Pendientes anotados: reportes (#55) aún no restan devoluciones; mercancía defectuosa va a la bodega de origen.

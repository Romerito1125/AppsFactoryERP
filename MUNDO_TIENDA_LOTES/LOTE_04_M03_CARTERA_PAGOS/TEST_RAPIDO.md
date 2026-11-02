# Prueba rápida — Lote 04 (cartera y pagos)

**Puntos del plan que se prueban:** #34 Cobrar/Pagar y estado de cuenta, #38 anticipos y saldos a favor, #53 recibos y movimientos bancarios, además de la parte de bonus de #52 y el cierre relacionado de #70. Consulta `PLAN.md`, «Alcance», «Criterio de cierre» y «Pendientes».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #34 | **Administrativo → Cuentas por cobrar** | 1. Selecciona un cliente. 2. Revisa Operaciones, Estado de cuenta, Pendiente y Vencimientos. 3. Filtra movimientos. 4. Selecciona una factura. 5. Registra un pago o abono. 6. Confirma saldo, documento y movimiento bancario. |
| #34 | **Administrativo → Cuentas por pagar** | 1. Selecciona un proveedor. 2. Abre Estado de cuenta y Pendiente. 3. Registra un pago sobre una compra recibida. 4. Selecciona cuenta y medio de pago. 5. Confirma que baja la deuda y sale dinero de Bancos. |
| #38 | **Administrativo → Cuentas por cobrar → Notas crédito / Anticipos** | 1. Registra un anticipo. 2. Confirma aumento de la cuenta bancaria y saldo a favor. 3. Aplica una parte a una factura. 4. Devuelve el saldo restante. 5. Revisa Estado de cuenta y Bancos. |
| #53 | **Administrativo → Cuentas por cobrar/pagar → Pagos y abonos** | 1. Registra número de recibo, detalle, fecha y valores. 2. Distribuye el pago entre efectivo e instrumentos. 3. Guarda. 4. Edita el detalle. 5. Anula con motivo. 6. Confirma reversión de saldos y banco. |
| #52 | **Ventas → Total operación** y **Cuentas por cobrar** | 1. Usa un cliente con saldo Bonus. 2. Aplica Bonus al pago. 3. Confirma que reduce el beneficio y el saldo de la factura. |

> Antes: aplica la migración `20261104100000_add_account_notes` (`npx prisma migrate deploy` en `app/api`) y reinicia la API.

Reinicia la API (cliente Prisma regenerado). Para pagos mixtos necesitas **2 cuentas bancarias activas** (hoy hay 1: crea otra en Bancos).  
Prepara con **PRUEBA-CON-CREDITO**: dos facturas a crédito (ej. $53.084 y $35.000).

Saldos iniciales → Cuenta A: ________  Cuenta B: ________

## Cobrar — Estado de cuenta y Pendiente
- [ ] Cuentas por cobrar tiene **solo 4 pestañas** (Operaciones, Estado de cuenta, Pendiente, Vencimientos); la lista lateral tiene pestañas ID Fiscal / Descripción / Clave y botones Anterior / Próximo / Información; la cabecera muestra Límite de crédito, Saldo anticipos y Saldo.
- [ ] **Operaciones**: 7 tarjetas como Saint (Facturas, Giros o cuotas, Notas de débito, Pagos y abonos, Notas crédito / Anticipos, Notas de crédito, Anular…); las que no tienen flujo están en gris.
- [ ] **Estado de cuenta**: columnas **Número, Emisión, Débitos, Créditos, Saldo** (saldo corrido), filtros Movimientos / Desde / Hasta, pie con Imprime / Editar y Monto / Emisión / Saldo / Vence del documento seleccionado.
- [ ] Filtra Movimientos «Facturas» y «Pagos y abonos»: la tabla cambia; el saldo anterior del periodo aparece al usar «Desde».
- [ ] Pestaña **Pendiente**: Número, Detalle documento, Vence, **Días**, Saldo pendiente; al elegir una fila el pie muestra Monto / Emisión / Saldo / Vencimiento.
- [ ] Pestaña **Vencimientos**: «Análisis de vencimientos» con rangos de días, Total vencido con % y gráfico circular «Vencido».

## Pagos o abonos (captura «PAGOS O ABONOS A CUENTAS»)
- [ ] «Registrar pago» abre el diálogo con los documentos pendientes; el cursor está en «Monto abonado» de la 1.ª fila; **Enter** pasa a Retenciones y luego al siguiente documento.
- [ ] Abona $30.000 a la factura 1 y $20.000 a la 2 con retención $2.000: «Saldo restante» y los totales se recalculan.
- [ ] Un monto + retención mayor al saldo → error claro.
- [ ] **F3 Totalizar** abre «TOTAL PAGOS Y ABONOS» con Total acreditado = $50.000.
- [ ] Número de documento (ticket) **vacío** → no deja aceptar. Con `T-001` y detalle «Abono prueba» sigue.
- [ ] Campos del diálogo en este orden: Número de documento, Detalle, Total acreditado, Fecha posteo, Fecha documento, Efectivo, **Cheques**, Instrumentos de pago, Total desglose, Comentarios, **Tipo de operación**, **Vendedor** (obligatorio), Imprimir recibo / Copias / Impresora.
- [ ] Efectivo $20.000 (caja/cuenta A) + Instrumentos de pago: Cuenta B $30.000 con referencia `CONS-1`. Total desglose = $50.000.
- [ ] Adjunta un soporte (imagen o PDF) y marca «Imprimir recibo» con 2 copias.
- [ ] **F3 Aceptar**: se imprime el recibo (2 copias), el estado de cuenta muestra el abono con su número `T-001` y el **saldo corrido baja**.
- [ ] Cuenta A subió $20.000 y Cuenta B $30.000; en **Bancos** aparecen ambos ingresos «Cobro T-001…».
- [ ] El abono de hoy aparece como fila `PAG T-001 …` con la fecha de hoy y baja el saldo.
- [ ] Repetir el ticket `T-001` → «ya fue usado en otro recibo».
- [ ] Desglose distinto del total (ej. $49.000) → no se guarda nada (saldos sin cambio).

## Editar / anular / comprobantes
- [ ] Selecciona la fila del abono en el estado de cuenta: **Imprime** reimprime el recibo y **Soporte** abre el archivo adjunto.
- [ ] **Editar**: cambia el detalle y el ticket a `T-001B`; los valores no se pueden tocar. En **Auditoría** queda «Edito el recibo» con antes/después.
- [ ] **Anular** con motivo: el recibo queda tachado/«Anulado», las facturas recuperan su saldo, aparece una fila «Anulación» en el estado de cuenta y los bancos bajan lo ingresado (Cuenta A y B vuelven al saldo inicial).
- [ ] Anular dos veces → error. Un recibo anulado no se edita.

## Notas de débito / crédito / anular (Cobrar)
- [ ] Las 7 tarjetas de Operaciones son grandes y **todas abren algo** (ninguna queda inactiva).
- [ ] **Notas de débito**: registra `ND-1` «Intereses» $25.000 con vencimiento: aparece una nueva cuenta por cobrar (Pendiente) y el estado de cuenta muestra `N/D ND-1` en Débitos.
- [ ] **Notas de crédito**: elige una cuenta con saldo y registra `NC-1` $10.000: el saldo de esa cuenta baja $10.000, el banco no cambia y el estado de cuenta muestra `N/C NC-1` en Créditos. Más que el saldo → error. También se ven las devoluciones del cliente.
- [ ] **Anular** `NC-1` con motivo: el saldo de la cuenta se restaura. Anular `ND-1` sin abonos: la cuenta queda cancelada; con abonos → error claro.
- [ ] **Anular** un anticipo sin usar: el dinero sale de la misma cuenta que lo recibió.

## Anticipos (#38)
- [ ] Operaciones → tarjeta **Notas crédito / Anticipos** → «Nuevo anticipo» $50.000 a la Cuenta A: la cuenta sube; «Saldo anticipos» muestra $50.000.
- [ ] «Aplicar» $30.000 a un crédito: baja el saldo del crédito y **la cuenta no cambia**.
- [ ] «Devolver» el saldo restante: la cuenta baja y el anticipo queda «Devuelto».

## Pagar a proveedores
- [ ] Cuentas por pagar tiene las **mismas 4 pestañas y pantallas** que Cobrar (lista con ID Fiscal/Descripción/Clave, cabecera, Operaciones, Estado de cuenta, Pendiente, Vencimientos).
- [ ] Estado de cuenta del proveedor: Número, Emisión, Débitos, Créditos, Saldo (saldo = lo que se debe); los pagos aparecen como `PAG {ticket} …`; Imprime / Editar / Soporte funcionan.
- [ ] «Pagos y abonos» con compras **recibidas** pendientes: mismo diseño «PAGOS O ABONOS A CUENTAS» (sin columna de retenciones, total «Total debitado», sin Vendedor).
- [ ] Abona a 2 compras, F3 Totalizar: «Número de documento» = ticket del pago, Efectivo + cuenta; adjunta soporte.
- [ ] Aceptar: egresos en las cuentas elegidas (Bancos: «Pago compra OC-… - Doc …»), el saldo pendiente de cada compra baja.
- [ ] Pagar más que el saldo de una compra → error; saldo insuficiente en la cuenta → error y no se registra nada.

## Notas y anticipos (Pagar)
- [ ] **Notas de débito**: elige una compra recibida con saldo y registra `ND-P1` $30.000: el saldo de la compra baja $30.000 (también en Compras/Pendiente) y aparece `N/D` en el estado de cuenta.
- [ ] **Notas de crédito**: `NC-P1` $10.000 sobre una compra: el saldo de la compra sube $10.000.
- [ ] **Notas débito / Anticipos**: registra `AN-1` $200.000 desde una cuenta: el banco baja $200.000 y «Saldo anticipos» del encabezado muestra $200.000. «Aplicar a compra» $50.000: el saldo de la compra baja y el anticipo queda en $150.000.
- [ ] **Anular** un anticipo ya aplicado → error; uno sin aplicar → el dinero vuelve a la cuenta.
- [ ] Anular una nota de crédito sobre una compra ya pagada → error.

## Cierre
- [ ] Saldos finales cuadran con los movimientos; sin errores en consola ni en el log de la API.
- [ ] Pendientes anotados: anular pagos a proveedores, bonus en abonos, flujos de las tarjetas en gris (notas débito/crédito).

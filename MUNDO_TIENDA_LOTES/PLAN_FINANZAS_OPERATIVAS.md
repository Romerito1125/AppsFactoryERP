# Plan: Finanzas operativo (y su relación con Ventas, Compras y Administrativo)

Estado: **propuesta para revisión. No se ha modificado código.**
Fuente del diagnóstico: lectura del código (web y API). Los hallazgos marcados como *deducido* no se han reproducido con una prueba; se confirman en la Fase 0 antes de corregir.

---

## 0. Regla transversal: todos los precios en COP

Todo valor monetario del sistema (precios, costos, totales, pagos, saldos, cupos, bases de retención, montos de movimientos) es en pesos colombianos (COP). En COP no hay centavos al capturar ni al mostrar.

**Comportamiento al escribir, en todos los inputs de dinero:**
- Solo se aceptan dígitos. El punto de miles aparece solo mientras se escribe: `1234567` → `1.234.567`.
- Al pegar `$ 1.234.567,00` o `1.234.567` se limpia a `1234567`. Una coma o un punto decimal no se acepta como decimal (ver decisión 8).
- Retroceso y Supr saltan el punto sin romper la posición del cursor. El cursor se conserva al formatear.
- Al entrar al campo el valor queda seleccionado para reemplazarlo. Enter avanza como hoy (`enter-advance`).
- Máximo 12 dígitos enteros (cabe en `Decimal(14,2)`).
- Negativo solo donde aplique (diferencias de arqueo, ajustes), con signo menos al inicio.
- En pantallas, tickets y PDF se muestra `$ 1.234.567`. Dentro del input solo el número; la unidad va en la etiqueta.

**Implementación en un solo lugar:**
- Web: `app/web/src/lib/cop.js` con `formatCop`, `parseCop`, `normalizeCopDraft` y el componente `CopInput` (controlado, `inputMode="numeric"`, sin flechas).
- API: validador `@IsCop()` en `common/` (entero, máximo 12 dígitos, sin decimales), aplicado a DTOs de precio, costo, pagos, saldos, cupos, bases y montos.

**Inventario encontrado (alcance real):**
- **19 formateadores locales** con nombres `money`, `formatCurrency` o similares, uno en cada uno de 19 archivos. Todos se reemplazan por `formatCop`.
- **Parseadores que leen mal el punto de miles:** `parseAmount` (`totalize-dialog.jsx`), `parseDecimal` (`price-update-dialog.jsx`, `inventory-transfers-window.jsx`), `parseMoney` (`allocation-flow.jsx`) y `numberOrValue`. Hoy `1.500` se lee como `1,5`, y con separadores de miles eso daría un precio 1.000 veces menor.
- **Inputs numéricos:** 23 `type="number"` y 32 `inputMode="decimal"` en unos 25 archivos. Los más importantes: Productos (precio y costo, niveles 0 a 3), Compras (costos y Total operación), Ventas y POS (precio unitario y pagos), Cobros y Pagos, Bancos (saldos y montos), Ofertas (precio especial), Referidos (montos), Clientes (cupo), Retenciones (base mínima) y Anticipos.
- **Inconsistencia visible:** el ticket muestra enteros (`lib/invoice-ticket.js` usa `maximumFractionDigits: 0`), mientras pantallas y reportes muestran dos decimales (`$ 4.165,00`).
- **API:** no tiene campo de moneda, y 31 validaciones usan `maxDecimalPlaces: 2`, así que hoy aceptan centavos en precios.

**Impacto por módulo:**

| Módulo | Campos de dinero | Cambio |
|---|---|---|
| **Ventas** | Precio unitario en Facturación y POS; pagos del Total operación; cotizaciones y preventas; devoluciones; notas y anticipos; ticket | `CopInput` en todos; ticket y PDF con `formatCop` |
| **Compras** | Costo unitario; precios de venta 0 a 3 en la línea; descuentos y flete; base, retención y pagos del Total operación; PDF; reporte de retenciones | `CopInput`; costos y precios en pesos enteros |
| **Administrativo** | Productos (precios 0 a 3, costos, utilidades); Clientes (cupo); Proveedores; Retenciones (base mínima); Ofertas y precios especiales; Referidos y utilidades | `CopInput`; validador en la API |
| **Finanzas** | Saldo inicial de cuentas; montos de ingreso, egreso, transferencia y ajuste; GMF; cobros; pagos; cheques; arqueo; gastos; reportes | `CopInput`; reportes con `formatCop` |
| **Inventario** | Valor del inventario; traslados y ajustes (sin precio) | Solo formato de valor |

**Redondeo (propuesta):** precios, costos, pagos y saldos son enteros en COP. El IVA y los totales de factura se redondean al peso. Los centavos intermedios de impuestos se redondean en el total. La base de datos mantiene `Decimal(14,2)` para no perder precisión en cálculos.

---

## 1. Diagnóstico: qué hace hoy Finanzas

El menú Finanzas tiene cinco entradas (`app/web/src/app/desktop-config.js`):

| Entrada | Hoy | Operativo |
|---|---|---|
| Cuentas bancarias | Crear, editar (nombre, banco, GMF, 4x1000 automático), desactivar y reactivar | Parcial. El saldo se muestra solo lectura, pero el API lo acepta (ver §2) |
| Movimientos bancarios | Ingreso, egreso, transferencia y ajuste manuales (`banks-window.jsx`, `BankTransactionsPanel`) | Sí, pero sin reversar, sin categoría, sin contraparte y sin auditoría |
| Cuentas por cobrar | **Solo lectura**: lista créditos con saldo (`BankReceivablesPanel`, ~línea 910) | **No.** Los cobros viven en Administrativo → Cobrar |
| Cuentas por pagar | **Solo lectura**: lista compras recibidas con saldo (`BankPayablesPanel`, ~línea 956) | **No.** Los pagos viven en Administrativo → Pagar |
| Reportes | Resumen por periodo, saldos y exportación (cálculo en el navegador) | Solo informa. No hay flujo de caja, P&L ni antigüedad |

**Causa principal de que "solo sirva para ver":** las operaciones reales de cartera y pagos ya existen (`accounts-receivable-window.jsx`, `accounts-payable-window.jsx`, `notes-center`, `advances-panel`), pero Finanzas muestra versiones de solo lectura de esas pantallas. Desde Administrativo sí se puede cobrar y pagar, así que el usuario recibe dos experiencias distintas para la misma operación.

**Lo que ya funciona bien y se reutiliza:**
- Movimientos con GMF (4x1000) automático por cuenta, con movimiento separado (lote 10).
- Cobros y pagos con asignación a documentos y recibos anulables (`/recibos/cobro`, `/recibos/pago`).
- Anticipos, notas crédito/débito y devoluciones con reintegro a cuenta.
- Cierre del día de reportes basado en movimientos reales.

---

## 2. Defectos de integridad (corregir antes de agregar funciones)

| # | Gravedad | Hallazgo | Evidencia | Corrección propuesta |
|---|---|---|---|---|
| F1 | **Alta** | `PATCH /cuentas-bancarias/:id` acepta `currentBalance` y lo escribe directo, sin movimiento que lo respalde. | `bank-account.dto.ts:18` y `cuentas-bancarias.service.ts` (`update` pasa `dto` tal cual) | Quitar `currentBalance` del DTO de actualización. El saldo solo cambia por movimientos o por un ajuste firmado. |
| F2 | **Alta** | La pantalla de cuenta envía `currentBalance` en cada guardado. Si el saldo cambió en otra ventana (por ejemplo una venta) después de cargar la cuenta, al guardar el nombre se revierte el saldo. | `banks-window.jsx` ~líneas 352-362 (body del guardado) y 322-328 (hidratación del formulario). *Deducido, no reproducido.* | Dejar de enviar el saldo al guardar la cuenta (cubierto por F1). |
| F3 | **Alta** | Los ajustes guardan `amount` sin signo y con tipo `AJUSTE`. Los reportes los agrupan como «Otros», así que no se sabe si subió o bajó el saldo. | `movimientos-bancarios.service.ts` ~127-147; `movementTypeGroup` en `banks-window.jsx` | Guardar la diferencia con signo (o dos tipos: `AJUSTE_ENTRADA` / `AJUSTE_SALIDA`) y motivo obligatorio. |
| F4 | **Alta** | Movimientos bancarios y cuentas **no se auditan**. Recibos, créditos, anticipos y notas sí. | `grep` de `AuditLogService` en `movimientos-bancarios` y `cuentas-bancarias`: sin resultados | Registrar en auditoría cada movimiento manual, ajuste, cambio de cuenta y reversión. |
| F5 | **Media** | El POS crea la factura y, en una segunda petición, el ingreso bancario. Si la segunda falla, la venta queda marcada como contado sin dinero registrado. | `pos-window.jsx` ~líneas 440-450 (ingreso después de `POST /facturas`) | Enviar los pagos dentro de la misma petición de factura y registrarlos en la misma transacción. |
| F6 | **Media** | El API permite una venta de contado **sin pagos**: `registerInvoicePayments` solo valida cuando llegan pagos. | `facturas.service.ts` (`if (createInvoiceDto.payments?.length)`). *Deducido, no reproducido.* | Exigir que los pagos cubran el total en contado (o marcar la venta como crédito). |
| F7 | **Media** | No hay forma de reversar un movimiento manual. Un error solo se corrige con otro movimiento manual, sin vínculo entre ambos. | No existe endpoint de anulación en `movimientos-bancarios` | Anulación con contramovimiento enlazado, motivo y permiso propio. |
| F8 | **Baja** | Los pagos a proveedores tienen dos rutas: `/compras/:id/pagos` y `/recibos/pago`. Hoy ambas usan el mismo prefijo de descripción, pero son dos flujos distintos que pueden divergir. | `compras.controller.ts:109`, `recibos.controller.ts:89` | Un solo servicio de pago a proveedor que usen ambas pantallas. |

---

## 3. Diseño operativo de Finanzas

### 3.1 Cuentas bancarias y caja
- Saldo solo por movimientos. Arqueo de caja por cuenta: saldo esperado (sistema) contra conteo físico, con diferencia registrada.
- **Cierre diario por cuenta** (desde Finanzas, no desde reportes): bloquea movimientos de ese día sin reapertura de un usuario con permiso.
- **Cheques:** estados *recibido → depositado → cobrado / rebotado*, con fecha de cobro. Hoy un cheque es solo un monto dentro de un pago.
- **Conciliación bancaria:** importar el extracto (CSV), emparejar con movimientos por monto y fecha, marcar conciliados y listar diferencias.

### 3.2 Movimientos (la pantalla de operación diaria)
- Categoría obligatoria en egresos (arriendo, servicios, nómina, impuestos, retenciones, otros) y contraparte opcional (cliente, proveedor, empleado).
- Documento soporte adjunto (ya existe el mecanismo en cobros).
- Reversa con contramovimiento enlazado y motivo (F7).
- Filtros por cuenta, categoría, contraparte, fecha y exportación.
- Los campos «Documento» y «Beneficiario» del formulario se guardan como campos reales, no dentro de la descripción.

### 3.3 Cuentas por cobrar (dentro de Finanzas, no solo lectura)
- Reemplazar `BankReceivablesPanel` por la misma ventana operativa que usa Administrativo → Cobrar. Una sola implementación.
- **Antigüedad de cartera:** vigente, 1-30, 31-60, 61-90 y más de 90 días, por cliente.
- Abonos, notas y anticipos desde la misma pantalla.
- Límite de crédito y días de crédito del cliente (Administrativo → Clientes) alimentan la antigüedad.

### 3.4 Cuentas por pagar (dentro de Finanzas, no solo lectura)
- Reemplazar `BankPayablesPanel` por la misma ventana operativa de Administrativo → Pagar.
- **Programación de pagos:** fecha de pago prevista por documento, lista de pagos del día y de la semana.
- Antigüedad de cuentas por pagar usando el vencimiento de cada compra (campo `dueDate` ya existe desde el lote 07).
- Retenciones por pagar a la DIAN: lo retenido en compras (reporte de retenciones) pendiente de declarar.

### 3.5 Gastos operativos (módulo nuevo dentro de Finanzas)
- Registro de gastos pagados desde caja o bancos, con categoría, proveedor opcional, soporte y fecha.
- Hoy los egresos no tienen categoría, así que no es posible un estado de resultados ni un análisis de gastos.

### 3.6 Reportes financieros (nuevos)
- **Flujo de caja real:** ingresos y egresos por día y por categoría.
- **Flujo de caja proyectado:** cobros según vencimiento de cartera, pagos según vencimiento de compras y gastos programados.
- **Estado de resultados simple:** ventas − costo de ventas − gastos − impuestos.
- **Antigüedad** de cartera y de cuentas por pagar.
- Todos los reportes se calculan en el API, no en el navegador (hoy `reports-window.jsx` calcula en el cliente).

### 3.7 Permisos y controles
- `BANKS_VIEW` ver; `BANKS_EDIT` movimientos manuales; nuevo `FINANCE_CLOSE` para cierres de día; nuevo `FINANCE_REVERSE` para reversas.
- Movimientos manuales por encima de un monto configurable requieren aprobación de un segundo usuario (*a definir*).
- Todo queda en auditoría (F4).

---

## 4. Relación con los otros módulos

| Módulo | Qué envía hoy a Finanzas | Qué falta o cambia |
|---|---|---|
| **Ventas** | Pagos de factura → movimientos INGRESO; ventas a crédito → créditos (cartera); devoluciones con reintegro → EGRESO; anticipos y notas | POS en dos pasos (F5); contado sin pago (F6); el POS debe usar el mismo diálogo de cobro (`totalize-dialog`) para cheques, varias cuentas, bono y crédito |
| **Compras** | Pagos → EGRESO «Pago compra …»; retenciones calculadas por proveedor; `dueDate` por compra | Un solo flujo de pago (F8); cuentas por pagar con antigüedad; retenciones por pagar a la DIAN |
| **Administrativo** | Clientes con cupo y días de crédito; proveedores con días de pago y retención; catálogo de retenciones; usuarios y permisos; auditoría | Cupo y días de crédito deben alimentar antigüedad; permisos nuevos (`FINANCE_CLOSE`, `FINANCE_REVERSE`); la auditoría debe cubrir finanzas (F4) |

---

## 5. Fase única de implementación

Todo se implementa en **una sola fase**: COP en todos los módulos, integridad financiera y Finanzas operativo. Los pasos de abajo son el orden interno obligatorio por dependencias. No son fases separadas.

| Paso | Contenido | Por qué en este orden |
|---|---|---|
| **1. Base COP** | `lib/cop.js`, `CopInput`, validador `@IsCop()` y pruebas unitarias | Todo lo demás la usa; así no se migra dos veces |
| **2. Auditoría de datos** | Script que busca precios, costos y saldos con centavos en la BD QA y en producción, y decide el redondeo | Debe hacerse antes de endurecer las validaciones |
| **3. Integridad financiera** | F1 a F8 de la sección 2 | Sin esto, saldos y reportes pueden estar mal |
| **4. Inputs y formatos por módulo** | Reemplazar inputs y formateadores en Productos, Compras, Ventas y POS, Cobros y Pagos, Bancos, Administrativo, reportes, tickets y PDF | Un módulo a la vez, con prueba de navegador en cada uno |
| **5. Operación de Finanzas** | Sección 3: cartera y cuentas por pagar operativas, movimientos con categoría y reversa, cierre diario, cheques, conciliación, gastos y reportes financieros | Depende de los pasos 1 a 4 |
| **6. Control** | Periodos cerrados, aprobaciones de montos altos, permisos `FINANCE_*` | Al final, cuando el flujo ya funciona |
| **7. Verificación completa** | Plan de pruebas (automáticas y de navegador por rol) y conciliación final | Cierre de la fase |

**Riesgo:** es una fase grande. Cada paso debe cerrar con pruebas en verde antes de pasar al siguiente, para poder pausar sin dejar el sistema a medias.

---

## 6. Criterio de cierre
- Todas las pruebas automáticas y de navegador en OK, con evidencia en `RESULTADO_*.md`.
- Conciliación final: saldo de cada cuenta = saldo inicial + movimientos; cartera = créditos − cobros − notas; cuentas por pagar = compras − pagos.
- Sin defectos críticos ni altos abiertos.
- **COP:** cada input de dinero formatea mientras se escribe, verificado en cada módulo. No quedan formateadores ni parseadores locales (búsqueda en el código). La API rechaza precios y montos con decimales.

---

## 7. Decisiones que necesito de ti

1. **Cierre de día:** ¿se bloquean los movimientos de días cerrados (y quién puede reabrir)?
2. **Reversas:** ¿quién puede anular un movimiento manual y necesita aprobación de otra persona? ¿Desde qué monto?
3. **Categorías de gasto:** ¿lista fija (la de arriba) o editable desde Administrativo?
4. **Cheques:** ¿se manejan cheques postfechados? ¿Quién confirma el cobro?
5. **Conciliación:** ¿de qué banco(s) llega el extracto y en qué formato (CSV, Excel, PDF)?
6. **Base de datos:** antes de empezar, ¿la prueba controlada de F2, F5 y F6 se hace en la base QA?
7. **Prioridad:** ¿hay una necesidad inmediata de caja o cartera que deba salir antes del resto de la fase?
8. **Entrada de precios:** ¿un precio con coma (`1,5`) se rechaza o se redondea al peso? Propuesta: se rechaza con un mensaje claro.
9. **Redondeo:** ¿IVA y totales de factura se redondean al peso entero? Propuesta: sí, como en la factura DIAN.
10. **Centavos en costos:** ¿los costos unitarios de compra pueden tener centavos (por ejemplo, un producto por kilo)? Propuesta: no; si se necesitan, solo en el costo y con hasta dos decimales.
11. **Símbolo:** ¿se muestra `$` o `COP` en pantallas, tickets y PDF? Propuesta: `$` en pantalla y `COP` en encabezados de reportes.
12. **Exportaciones:** ¿CSV y Excel llevan números planos (`1234567`) o con separadores? Propuesta: planos, para que Excel los lea como números.
13. **Precios actuales con centavos:** ¿en la migración se redondean al peso o se conservan? La auditoría del paso 2 dirá cuántos hay.

---

## 8. Estado de implementación (fase única)

**Corrección de la sección 2:** al revisar el código, F1 y F2 no son como se describieron.
- **F1:** el `PATCH` no puede cambiar el saldo. La validación global usa `whitelist: true` (`main.ts`), que elimina los campos no declarados en el DTO de actualización. El defecto real estaba en la **creación**: el saldo inicial se escribía sin movimiento.
- **F2:** no existe. Como el servidor ignora `currentBalance` al editar, guardar una cuenta con un saldo viejo no lo revierte.

| Paso | Estado | Qué quedó hecho |
|---|---|---|
| 1. Base COP | **Hecho** (web y API) | `app/web/src/lib/cop.js` (formato, lectura, cursor) con 11 pruebas en `bun test`; `components/money/cop-input.jsx` (formatea mientras se escribe, bloquea la coma con sus cifras, rechaza pegados con centavos); validador `@IsCop()` en `common/validators/` con 5 pruebas en jest |
| 2. Auditoría de datos | **Hecho** (solo lectura) | `app/api/scripts/audit-cop-decimales.js`. Resultado en la base actual: 6 de 34 precios de producto con centavos; 10 totales a pagar de compras con centavos; 2 precios de renglón de factura con centavos. Facturas, costos, saldos y cupos sin centavos. **Falta auditar producción** |
| 3. Integridad | **Parcial** | F1 corregido (saldo inicial como movimiento); F2 eliminado; F3 hecho (ajuste con signo y motivo); F4 hecho (movimientos, ajustes, transferencias y cambios de cuenta en auditoría). **Pendientes:** F5 (POS en dos pasos), F6 (contado sin pago), F7 (reversa de movimientos), F8 (dos rutas de pago a proveedores) |
| 4. Inputs por módulo | **Hecho en lo principal** | 20 archivos usan `formatCop` (se quitaron todos los formateadores locales de dinero). Inputs de dinero migrados a `CopInput`: cobros y pagos (totalize, asignación), precios y costos de Productos, Compras (costo, precio por nivel, alta rápida, Total operación), Bancos (monto y saldo), notas, anticipos, límite de crédito de clientes, base mínima de proveedores y de retenciones, precio final de Ventas y POS, y monto fijo de ofertas. **Pendiente:** formato de CSV y Excel (decisión 12); las cantidades y porcentajes conservan decimales a propósito |
| 4c. API en COP | **Hecho** | `@IsCop()` (entero, sin centavos) en 23 archivos de DTO: precios, costos, pagos, saldos, cupos, bases de retención, freight, base de retención, montos de recibos, notas, anticipos y cuentas. Compras redondea total, retención y total a pagar al peso. `roundMoney` del navegador redondea al peso. **Pendiente:** el descuento de ofertas (validar en el servicio según el tipo) |
| 5. Operación de Finanzas | **No iniciado** | Depende de las decisiones 1 a 7 |
| 6. Control | **No iniciado** | |
| 7. Verificación completa | **Parcial** | `auto-test-finanzas-integridad.js`: 10/10 OK. `auto-test-plan-completo.js`: 126/126 OK (regresión). `tsc`, jest 42/42 y `vite build` OK |

**Cambios sin commit.** Los archivos modificados están en el árbol de trabajo; no se hizo commit ni push.

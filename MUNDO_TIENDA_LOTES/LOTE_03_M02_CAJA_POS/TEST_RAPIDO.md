# Prueba rápida — Lote 03 (caja y POS)

**Puntos del plan que se prueban:** #39 escáner/captura por código, #40 foco y navegación con Enter, #44 crédito por cliente y el total de operación de la captura 17/18. Consulta `PLAN.md`, tablas «Alcance» y «Criterio de cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #39 | **Ventas → Facturación** | 1. Pulsa Emitir factura. 2. Escribe código de barras o código interno en la primera fila vacía. 3. Pulsa Enter. 4. Repite el mismo código y confirma que aumenta cantidad. 5. Prueba un código inexistente y confirma el mensaje. |
| #40 | **Ventas → Facturación** | 1. Cambia Cantidad. 2. Pulsa Enter. 3. Confirma que el foco vuelve a la siguiente fila vacía. 4. Abre y cierra una consulta de productos. 5. Confirma que el foco vuelve a la fila de captura. |
| #44 | **Ventas → Facturación → Total operación** | 1. Selecciona un cliente sin crédito y deja un saldo pendiente. 2. Confirma que el sistema lo rechaza. 3. Selecciona un cliente con crédito. 4. Paga una parte. 5. Confirma que el resto se convierte en crédito dentro del límite. 6. Verifica la factura en Cuentas por cobrar. |

Usuario ADMIN o CAJERO. Clientes de prueba: **PRUEBA-CON-CREDITO** (límite $1.000.000) y **PRUEBA-SIN-CREDITO**.  
Reinicia la API antes de empezar (cliente Prisma regenerado).

## Fila de captura (#39 / #40)
- [x] Ventas → Facturación → «Emitir factura»: el cursor está en la **primera fila vacía de la tabla** (columna Código). No hay un campo de lector aparte. ✅ 2026-11-02
- [x] Escribe el **código de barras** de un producto y Enter: aparece la línea y el cursor sigue en la fila de captura (ahora la de abajo). ✅ 2026-11-02
- [x] Escribe `1` (ID/código interno que se ve en la tabla) y Enter: el producto con ese código se agrega. ✅ 2026-11-02
- [x] Enter con el campo **vacío**: se abre la lista de productos; al agregar uno y cerrar, el cursor vuelve a la fila de captura. ✅ 2026-11-02
- [x] Escribe `0000000000000` + Enter: «El código … no existe en el catálogo»; la factura sigue intacta. ✅ 2026-11-02
- [x] Escanea el mismo código dos veces: la cantidad sube (no hay fila duplicada). ✅ 2026-11-02
- [x] Cambia una cantidad y pulsa Enter: el valor queda y el cursor va a la fila de captura para el siguiente producto. ✅ 2026-11-02

## Total operación (captura 17/18)
- [x] Con **PRUEBA-SIN-CREDITO**: «Emitir factura» abre TOTAL OPERACIÓN; «Límite crédito» dice «Sin crédito» y no hay forma de dejar saldo a crédito (falta dinero ⇒ mensaje «este cliente no tiene crédito»). ✅ 2026-11-02
- [x] Con **PRUEBA-CON-CREDITO**: muestra límite $1.000.000, saldo anterior y crédito disponible. ✅ 2026-11-02
- [x] Efectivo $X + «Instrumentos de pago» (una cuenta) completan el total: Total desglose = Total operación. Emite: la(s) cuenta(s) suben exactamente lo pagado y el efectivo entra a la caja/cuenta elegida. ✅ 2026-11-02
- [x] Paga **menos** que el total con el cliente con crédito: el resto aparece en «Crédito», pide vencimiento y se crea la cuenta por cobrar solo por ese resto. ✅ 2026-11-02
- [x] Paga con **Bonus / miembro fiel** (si el cliente tiene saldo): baja su saldo de beneficios; si no tiene, la fila Bonus no aparece. ✅ 2026-11-02
- [x] Adjunta un soporte (imagen/PDF) y comentarios: la factura se crea; un `.exe` o archivo > 3 MB se rechaza. ✅ 2026-11-02
- [x] Enter avanza entre campos, F3 acepta, Esc sale. ✅ 2026-11-02
- [x] Forzar fallo (monto que no cuadra): no se crea la factura ni movimientos. ✅ 2026-11-02

## Cierre
- [ ] Sin errores en la consola del navegador ni en el log de la API.
- [ ] Anotar fecha, usuario y resultado en `PLAN.md` → «Estado».

# Checklist E2E — Todos los módulos del ERP

> Plantilla de pruebas. El resultado diligenciado está en [CHECKLIST_E2E_TODOS_LOS_MODULOS_RESULTADO.md](./CHECKLIST_E2E_TODOS_LOS_MODULOS_RESULTADO.md).

Fecha de ejecución: 2026-09-14  
Entorno: `http://localhost:5173/` · Chrome · sesión administrativa  
Datos temporales para CRUD: prefijo `QA-E2E-`. No eliminar `admin@mundotienda.com`.

## Criterio de resultado

- `[x]` Prueba ejecutada y correcta.
- `[ ]` Pendiente de ejecutar.
- `[!]` Ejecutada con fallo; documentar la corrección debajo de la prueba.
- En operaciones financieras se verifica el flujo y la validación; la confirmación final de emisión/pago debe hacerse conscientemente para no generar movimientos duplicados.

## 1. Acceso, shell y navegación global

- [ ] `SHELL-01` Iniciar sesión como administrador y conservar la sesión al cambiar de módulo.
- [ ] `SHELL-02` Cargar Administrativo, Ventas, Compras y Bancos sin pantalla en blanco ni errores de consola visibles.
- [ ] `SHELL-03` Confirmar español en títulos, botones, validaciones, loading y errores.
- [ ] `SHELL-04` Abrir y cerrar cada ventana desde menú superior y accesos rápidos.
- [ ] `SHELL-05` Confirmar que cada ventana usa una sola barra de título, sin doble borde.
- [ ] `SHELL-06` Confirmar que Anterior/Próximo solo navega registros dentro de la misma ventana; Bancos no debe usarlos para cambiar de ventana.
- [ ] `SHELL-07` Abrir cada menú superior y confirmar que sus opciones no se repiten.
- [ ] `SHELL-08` Buscar en cada lista y probar el menú de filtros/opciones de búsqueda.
- [ ] `SHELL-09` Confirmar estados de carga, estado vacío, error y reintento/refresco.

## 2. Módulo Administrativo

### Clientes

- [ ] `ADM-CLI-01` Abrir Clientes y cargar la lista completa.
- [ ] `ADM-CLI-02` Crear cliente `QA-E2E-CLI-01` con datos válidos.
- [ ] `ADM-CLI-03` Confirmar generación automática de código y nivel de referido.
- [ ] `ADM-CLI-04` Editar directamente identificación, nombre, tipo, activo y datos de contacto.
- [ ] `ADM-CLI-05` Guardar cambios y confirmar loading, mensaje y persistencia tras recargar.
- [ ] `ADM-CLI-06` Probar obligatorio vacío, identificación corta y correo inválido; campo resaltado y mensaje en español.
- [ ] `ADM-CLI-07` Consultar referidos, red y estadísticas del cliente.
- [ ] `ADM-CLI-08` Eliminar definitivamente el cliente de prueba y confirmar que desaparece.

### Proveedores

- [ ] `ADM-PRO-01` Abrir Proveedores y cargar registros.
- [ ] `ADM-PRO-02` Crear proveedor `QA-E2E-PRO-01` con tipo Jurídico y datos principales.
- [ ] `ADM-PRO-03` Confirmar que Id. fiscal, descripción, tipo, dirección y datos financieros se pueden escribir.
- [ ] `ADM-PRO-04` Confirmar que Fax, fecha de inicio, clase y municipio no aparecen.
- [ ] `ADM-PRO-05` Editar directamente todos los campos permitidos y guardar con loading.
- [ ] `ADM-PRO-06` Probar errores de obligatorios y valores inválidos en español.
- [ ] `ADM-PRO-07` Consultar productos asociados y cambiar pestañas sin perder datos.
- [ ] `ADM-PRO-08` Eliminar definitivamente proveedor de prueba y validar persistencia.

### Catálogos: tipos de producto y bodegas

- [ ] `ADM-CAT-01` Abrir Tipos de producto y cargar registros.
- [ ] `ADM-CAT-02` Crear, editar y eliminar `QA-E2E-TIPO-01`.
- [ ] `ADM-CAT-03` Abrir Bodegas y cargar registros.
- [ ] `ADM-CAT-04` Crear, editar y eliminar `QA-E2E-BOD-01`.
- [ ] `ADM-CAT-05` Confirmar creación rápida de tipo desde el selector de Productos.
- [ ] `ADM-CAT-06` Confirmar creación rápida de bodega desde el selector de Productos.

### Productos

- [ ] `ADM-PRD-01` Abrir Productos y consultar por código, descripción, estado y favoritos.
- [ ] `ADM-PRD-02` Crear producto `QA-E2E-PRD-01` con proveedor, tipo, bodega, imagen y precio.
- [ ] `ADM-PRD-03` Editar directamente código, descripción, nombre, proveedor, tipo, activo y bodega.
- [ ] `ADM-PRD-04` Guardar cambios con loading y confirmar persistencia al recargar.
- [ ] `ADM-PRD-05` Crear, editar, activar/desactivar y eliminar precios; validar costo, ganancia y margen.
- [ ] `ADM-PRD-06` Confirmar que margen = ganancia / costo de adquisición × 100.
- [ ] `ADM-PRD-07` Crear, editar y eliminar unidades por empaque.
- [ ] `ADM-PRD-08` Ajustar inventario, consultar stock por bodega y validar movimientos.
- [ ] `ADM-PRD-09` Crear, editar, marcar principal y eliminar códigos de barras.
- [ ] `ADM-PRD-10` Cargar/cambiar/eliminar imagen y confirmar vista previa.
- [ ] `ADM-PRD-11` Marcar favorito, quitar favorito y confirmar persistencia local/BD.
- [ ] `ADM-PRD-12` Probar validaciones de proveedor, tipo, código, descripción y cantidades.
- [ ] `ADM-PRD-13` Intentar eliminar un producto con relaciones y confirmar mensaje seguro sin pérdida indebida.

### Retenciones

- [ ] `ADM-RET-01` Abrir Retenciones y cargar registros.
- [ ] `ADM-RET-02` Crear `QA-E2E-RET-01` con rangos y porcentajes.
- [ ] `ADM-RET-03` Editar código, descripción, base mínima, aplicación y rangos.
- [ ] `ADM-RET-04` Guardar con loading, recargar y confirmar persistencia.
- [ ] `ADM-RET-05` Probar rangos inválidos y campos vacíos con resaltado en español.
- [ ] `ADM-RET-06` Eliminar definitivamente la retención de prueba.

### Usuarios del sistema

- [ ] `ADM-USR-01` Abrir Usuarios y cargar usuarios existentes.
- [ ] `ADM-USR-02` Crear usuario `qa.e2e@mundotienda.local` con contraseña y rol.
- [ ] `ADM-USR-03` Editar directamente identificación, correo, nombre, rol y contraseña.
- [ ] `ADM-USR-04` Seleccionar accesos por módulos, guardar y confirmar persistencia.
- [ ] `ADM-USR-05` Confirmar loading en actualización, cambio de rol y permisos.
- [ ] `ADM-USR-06` Probar correo, contraseña y campos obligatorios inválidos en español.
- [ ] `ADM-USR-07` Eliminar definitivamente el usuario de prueba y confirmar que no queda archivado.

### Cuentas por cobrar y pagar

- [ ] `ADM-CTA-01` Abrir Cobrar con cliente, saldo anticipos y saldo pendiente visibles.
- [ ] `ADM-CTA-02` Crear cuenta por cobrar con varios productos y vencimiento.
- [ ] `ADM-CTA-03` Seleccionar una fila pendiente y pulsar Abonar; confirmar que el pago no depende del doble clic.
- [ ] `ADM-CTA-04` Probar doble clic como atajo y validar monto máximo, saldo parcial y saldo pagado.
- [ ] `ADM-CTA-05` Abrir Pagar, consultar compras recibidas y saldo por proveedor.
- [ ] `ADM-CTA-06` Registrar pago parcial a proveedor con cuenta bancaria y loading.
- [ ] `ADM-CTA-07` Probar monto superior, cuenta inactiva y saldo insuficiente; mensajes en español.

## 3. Módulo Ventas

### Facturación

- [ ] `VEN-FAC-01` Abrir Facturación y cargar cliente, vendedor, bodega y cuentas.
- [ ] `VEN-FAC-02` Buscar clientes y productos por texto, código e imagen.
- [ ] `VEN-FAC-03` Agregar varios productos, editar cantidades y confirmar subtotal, IVA, total y utilidad.
- [ ] `VEN-FAC-04` Validar stock insuficiente, producto sin precio y campos obligatorios.
- [ ] `VEN-FAC-05` Emitir venta de contado y confirmar factura, inventario y movimiento bancario.
- [ ] `VEN-FAC-06` Emitir venta a crédito y confirmar cuenta por cobrar.
- [ ] `VEN-FAC-07` Cargar una factura existente y consultar su detalle.
- [ ] `VEN-FAC-08` Probar loading, cancelación y limpieza del formulario.

### Presupuestos

- [ ] `VEN-COT-01` Crear presupuesto con varios productos.
- [ ] `VEN-COT-02` Guardar con loading y confirmar registro en la tabla.
- [ ] `VEN-COT-03` Cargar, ver, aprobar y rechazar un presupuesto.
- [ ] `VEN-COT-04` Convertir presupuesto aprobado a factura.
- [ ] `VEN-COT-05` Validar vigencia y errores de cliente/productos.

### Pedidos y notas de entrega

- [ ] `VEN-PED-01` Consultar pedidos con estados Pendiente, En preparación, En camino, Entregado y Cancelado.
- [ ] `VEN-PED-02` Buscar pedido y abrir detalle.
- [ ] `VEN-ENT-01` Consultar notas de entrega con destinatario, dirección y estado.
- [ ] `VEN-ENT-02` Crear entrega y cambiar estados de preparación, camino, entregado y cancelado.
- [ ] `VEN-ENT-03` Confirmar que los cambios de estado se guardan y recargan.

### Devoluciones, reportes y varios

- [ ] `VEN-DEV-01` Consultar factura, procesar devolución/anulación y confirmar inventario/estado.
- [ ] `VEN-REP-01` Abrir Reportes y visualizar métricas, tablas y filtros.
- [ ] `VEN-VAR-01` Abrir Varios y comprobar que sus accesos navegan a ventanas funcionales.

## 4. Módulo Compras

### Compras y órdenes

- [ ] `COM-CPR-01` Abrir Compras y cargar proveedor, bodega y fecha.
- [ ] `COM-CPR-02` Crear compra con varios productos, costos, impuestos y cantidades.
- [ ] `COM-CPR-03` Editar proveedor, bodega, documento, fecha prevista y productos.
- [ ] `COM-CPR-04` Guardar compra con loading y confirmar persistencia.
- [ ] `COM-OC-01` Consultar órdenes con estados Borrador, Ordenada, Recibida y Anulada.
- [ ] `COM-OC-02` Cargar un borrador, editarlo y confirmar cambios.
- [ ] `COM-OC-03` Ordenar un borrador y validar transición.
- [ ] `COM-OC-04` Recibir una orden y confirmar stock, costo e inventario.
- [ ] `COM-OC-05` Anular una orden permitida y confirmar estado.
- [ ] `COM-PAG-01` Registrar pago parcial de compra recibida y confirmar saldo bancario.

### Cotizaciones, devoluciones, entregas, reportes y varios

- [ ] `COM-COT-01` Abrir Cotizaciones y confirmar que no duplica opciones ni presenta un mockup engañoso.
- [ ] `COM-DEV-01` Abrir Devoluciones y validar estado funcional o mensaje de alcance real.
- [ ] `COM-ENT-01` Consultar recepciones pendientes y recibir una orden desde la vista.
- [ ] `COM-REP-01` Abrir Reportes y visualizar conteos, estados y totales.
- [ ] `COM-VAR-01` Abrir Varios y comprobar sus accesos.
- [ ] `COM-MENU-01` Abrir cada menú superior y confirmar una sola acción contextual.

## 5. Módulo Bancos

### Cuentas, bancos y beneficiarios

- [ ] `BAN-CTA-01` Abrir Cuentas y consultar varias cuentas con saldo.
- [ ] `BAN-CTA-02` Crear, editar y eliminar/desactivar cuenta `QA-E2E-BAN-01`.
- [ ] `BAN-CTA-03` Confirmar ajuste de saldo a cero permitido.
- [ ] `BAN-BAN-01` Consultar bancos agrupados y saldo por entidad.
- [ ] `BAN-BEN-01` Consultar beneficiarios clientes/proveedores y búsqueda.

### Transacciones

- [ ] `BAN-TRX-01` Registrar ingreso con loading y confirmar movimiento/saldo.
- [ ] `BAN-TRX-02` Registrar egreso con loading, saldo suficiente y 4×1000.
- [ ] `BAN-TRX-03` Registrar nota de crédito y nota de débito.
- [ ] `BAN-TRX-04` Registrar transferencia entre dos cuentas y confirmar ambos movimientos.
- [ ] `BAN-TRX-05` Registrar ajuste, incluido saldo real cero.
- [ ] `BAN-TRX-06` Validar cuenta, monto, descripción, destino y saldo insuficiente.
- [ ] `BAN-TRX-07` Buscar movimientos y confirmar que la tabla conserva sus encabezados.

### Cuentas, reportes y varios

- [ ] `BAN-CXC-01` Consultar cuentas por cobrar con documento, cliente, total y saldo.
- [ ] `BAN-CXP-01` Consultar cuentas por pagar con proveedor, estado y saldo.
- [ ] `BAN-REP-01` Abrir Reportes y ver saldo, ingresos, egresos y detalle de movimientos.
- [ ] `BAN-REP-02` Filtrar Reportes por cada cuenta y confirmar actualización de totales y tabla.
- [ ] `BAN-VAR-01` Abrir Varios y comprobar accesos funcionales.
- [ ] `BAN-NAV-01` Confirmar que el pie solo muestra Salir y no cambia de ventana con Anterior/Próximo.

## 6. Verificación técnica y cierre

- [ ] `TECH-01` ESLint de los módulos web sin errores.
- [ ] `TECH-02` Build de Vite exitoso.
- [ ] `TECH-03` Build de NestJS exitoso.
- [ ] `TECH-04` `git diff --check` sin errores.
- [ ] `TECH-05` Recargar Chrome y confirmar persistencia de datos demostrativos.
- [ ] `TECH-06` Revisar que no queden registros `QA-E2E-` sin limpiar, excepto los datos demo `DEMO-`.

## Registro de hallazgos y correcciones

| ID | Resultado | Evidencia / corrección |
|---|---|---|
| — | Pendiente | Se completa durante la ejecución. |

## Resumen final

- Total de pruebas: pendiente.
- Correctas: pendiente.
- Con fallo: pendiente.
- Bloqueadas por confirmación financiera o datos: pendiente.

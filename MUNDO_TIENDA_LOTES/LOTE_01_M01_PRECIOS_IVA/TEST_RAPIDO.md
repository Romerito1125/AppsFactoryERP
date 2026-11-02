# Prueba rápida — precios e IVA del Lote 01

**Puntos del plan que se prueban:** #33 sincronización Productos/POS/Ventas, #41 IVA sin duplicar y #42 precio final IVA incluido editable. El detalle del requisito está en `PLAN.md`, secciones «Objetivo», «Contrato propuesto» y «Criterio de cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #33 | **Productos → Datos principales / Precios**; después **Ventas → Facturación** y **POS** | 1. Edita Precio 0 en Productos. 2. Guarda con motivo. 3. Abre el mismo producto en Ventas y POS. 4. Confirma que el precio se actualiza sin recargar manualmente. |
| #41 | **Ventas → Facturación** y **POS → Total operación** | 1. Agrega un producto con IVA 19 %. 2. Confirma base, IVA y total. 3. Verifica que `base + IVA = total` una sola vez. 4. Emite y compara con la factura guardada. |
| #42 | **Productos → Precios** y **Ventas/POS → línea de factura** | 1. Cambia el precio final con IVA. 2. Guarda. 3. Vuelve a facturar. 4. Confirma que el precio aplicado coincide y que el IVA no se duplica. |

Duración estimada: 5 a 10 minutos. Se ejecuta manualmente con un usuario administrador en un ambiente de prueba.

## Preparación

1. Tener disponible un producto activo con existencia en una bodega.
2. Configurarle IVA de venta de **19%** y un **Precio 0**.
3. Abrir simultáneamente Productos, `/pos` y Ventas del escritorio.
4. Anotar el precio que muestra Productos como **precio de venta (IVA incluido)**.

## Paso 1 — precio del catálogo

1. En Productos, guarda el Precio 0 como **119.00** con IVA incluido.
2. Guarda el producto. Si el sistema pide motivo para el cambio, escribe `Prueba Lote 01`.
3. En POS y Ventas, busca el mismo producto.

**Debe ocurrir:** ambas pantallas reciben el cambio sin recargar manualmente la página y muestran `119.00 IVA incluido`.

## Paso 2 — factura sin edición manual

1. Agrega el producto al carrito de `/pos`.
2. Confirma que el resumen muestre aproximadamente:

   - Subtotal/base: **100.00**
   - IVA: **19.00**
   - Total: **119.00**

3. Emite la factura.
4. Abre el detalle de la factura desde Ventas.

**Debe ocurrir:** el detalle persistido conserva subtotal `100.00`, IVA `19.00` y total `119.00`. El IVA no aparece sumado dos veces.

Repite este mismo paso una vez desde **Ventas del escritorio** para confirmar que ambas superficies envían el mismo contrato.

## Paso 3 — precio final editable

1. En el carrito, cambia el campo **Precio final** a **130.00**.
2. Confirma que el carrito muestre aproximadamente:

   - Subtotal/base: **109.24**
   - IVA: **20.76**
   - Total: **130.00**

3. Emite una segunda factura y abre su detalle.

**Debe ocurrir:** la factura conserva esos mismos tres importes. El precio enviado como final se convierte una sola vez a neto.

> La interfaz puede mostrar pesos colombianos sin centavos por el formato visual actual. Si ves valores enteros redondeados, valida los decimales exactos en el detalle de la factura o en la respuesta de `POST /facturas`.

## Paso 4 — control de permiso (opcional)

1. Inicia sesión con un usuario que no tenga `SALES_PRICE_OVERRIDE`.
2. Intenta guardar una venta con precio final editado.

**Debe ocurrir:** la interfaz no ofrece el editor y el API rechaza un intento manual con respuesta `403`.

## Registro rápido

| Verificación                             | Resultado      | Evidencia              |
| ---------------------------------------- | -------------- | ---------------------- |
| Cambio de precio llega a POS y Ventas    | X OK / ☐ Falla | Captura en `evidence/` |
| Factura 119.00 = base 100 + IVA 19       | X OK / ☐ Falla | Consecutivo/captura    |
| Factura 130.00 = base 109.24 + IVA 20.76 | X OK /  Falla  | Consecutivo/captura    |
| Precio editable solo con permiso         | X OK / ☐ Falla | Usuario y respuesta    |

Si alguna cifra difiere por más de `0.01`, detener el cierre del lote y registrar el caso en `EVIDENCE.md`.

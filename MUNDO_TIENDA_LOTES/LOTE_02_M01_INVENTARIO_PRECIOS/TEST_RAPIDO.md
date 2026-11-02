# Prueba rápida — Lote 02

**Puntos del plan que se prueban:** #37 inventario valorizado con IVA, #65 precios de venta visibles en Compras y #68 editor de precios. Las capturas relacionadas son C14, C23, C24 y C25. Consulta el alcance y el criterio de cierre en `PLAN.md`.

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #37 | **Productos → Inventario** y **Reportes → Inventario** | 1. Selecciona un producto con stock e IVA. 2. Revisa la bodega, costo sin IVA, total sin IVA y total con IVA. 3. Abre Reportes → Inventario. 4. Confirma existencia, Sin IVA, IVA y Con IVA. |
| #65 | **Compras → Nueva compra** | 1. Selecciona proveedor y bodega. 2. Agrega un producto. 3. Revisa la línea Código, Descripción, Cantidad, Unidad, Costo, Precio 0–3 y Total. 4. Verifica el panel Compra: número, cantidad, renglones, impuestos y total. |
| #68 | **Compras → Nueva compra → Costo / F2 Precio** | 1. Selecciona una línea. 2. Pulsa Enter en Costo o F2. 3. Cambia utilidad o precio con impuestos. 4. Confirma que los demás valores se recalculan. 5. Acepta, guarda la compra y verifica el precio en Productos, Ventas y POS. |

## #37 Inventario con IVA (C14)
- [X] Productos → un producto con IVA 19% → pestaña Inventario: columnas Bodega, Stock, Mínimo, Máximo, Costo adquisición (sin IVA), Inventario total (sin IVA) e **Inventario total (con IVA)**; con = sin × 1,19.
- [X] Reportes → Inventario: Existencia, Sin IVA, IVA y Con IVA coinciden.

## #65 Compras (C23)
- [x] Panel de totales titulado **«Compra»** con N° (= Documento compra), Total cantidad o pieza, Total renglones, Impuestos y Total. ✅ 2026-11-02
- [x] La grilla tiene Código, **Descripción**, Cantidad, Und, **Costo**, Precio 0–3 y Total. ✅ 2026-11-02
- [x] Barra inferior con **F1 Información · F2 Precio · F3 Descuento** (F3 deshabilitado). ✅ 2026-11-02
- [x] Con el cursor en una fila de la grilla: **F1** abre la información del producto, **F2** abre «PRECIOS DEL PRODUCTO». Con el cursor en Proveedor/Depósito, F1/F2 siguen abriendo sus consultas. ✅ 2026-11-02

## #66–68 Editor de precios (C24/C25)
- [x] Cambia el costo de una línea y pulsa Enter: se abre **«PRECIOS DEL PRODUCTO»** con Costo anterior y Costo nuevo arriba. ✅ 2026-11-02
- [x] Filas Precio 0–3 con: precio anterior y su utilidad en gris, precio sin impuestos, % Utilidad, Precio mas impuestos (en negrita). ✅ 2026-11-02
- [x] Cambia el **% Utilidad** → se recalculan los dos precios; cambia el **Precio mas impuestos** → se recalcula el % y el precio sin impuestos; cambia el **precio sin impuestos** → idem. ✅ 2026-11-02
- [x] Enter avanza de campo; en el último acepta; Esc cancela; botones Aceptar / Cancelar con icono. ✅ 2026-11-02
- [x] Guarda la compra: los precios nuevos aparecen en Productos y, al abrir Ventas/POS, con el mismo valor. ✅ 2026-11-02
- [x] Producto sin un nivel: el campo queda vacío y no rompe la tabla. ✅ 2026-11-02

## Cierre
- [x] Sin errores en consola; resultado anotado en `PLAN.md` → «Estado». ✅ 2026-11-02

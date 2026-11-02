# Lote 10 — Informes y cierre del día

**Fichas:** #55 reportes cruzados, #38 cierre del día, #35 4×1000 automático, #52 miembro fiel, #70.

## Alcance implementado
- **#55** Reportes → *Ventas cruzadas*: agrupar por barrio/marca/proveedor/vendedor/bodega/origen/cliente, filtros, devoluciones restadas (proporcional por renglón), CSV/PDF.
- **#38** Reportes → *Cierre del día*: ventas contado, crédito (no suma), cobros, anticipos recibidos/aplicados, devoluciones, pagos a proveedores y 4×1000, con movimiento neto de caja.
- **#35** `BankAccount.autoGmf`: casilla «4x1000 automático» en Bancos; egresos y traslados generan el movimiento GMF aparte.

## Pendiente / requiere definición
- **#52 miembro fiel:** el beneficio ya funciona como medio de pago; falta la regla de negocio de elegibilidad.
- La *frecuencia* de compra se cubre con el agrupado por cliente; no hay segmentación formal.

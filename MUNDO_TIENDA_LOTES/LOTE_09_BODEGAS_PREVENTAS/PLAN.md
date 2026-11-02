# Lote 09 — Bodegas y preventas

**Fichas:** #31 traslados sugeridos, #32 bodeguero, #45/#46 bodega por línea y disponibilidad, #47 preventa vendedor→caja, #48 avisos por bodega con surtido.

## Alcance implementado
- **#31** `GET /inventario/traslados/sugeridos` + diálogo *Traslados sugeridos* (agrupado por proveedor/marca, cantidad editable, genera traslados múltiples por ruta).
- **#32** Rol BODEGA con acceso a inventario/traslados (limitado a su bodega).
- **#45/#46** Columna Bodega por renglón en caja con disponibilidad y aviso «OTRA BODEGA».
- **#47** Cotización tipo **PREVENTA** (el vendedor la arma, la caja la carga y factura con `quoteId`, conversión única).
- **#48** Notificaciones `BODEGA_TAREA` por bodega (solo sus líneas) y botones *Atendido / Surtido* por línea.

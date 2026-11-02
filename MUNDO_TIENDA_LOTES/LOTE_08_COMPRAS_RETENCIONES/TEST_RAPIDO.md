# Prueba rápida — Lote 08

**Puntos del plan que se prueban:** #74 PDF de compra, #75 retenciones, #76 base editable con permiso y motivo y #77 reporte de retenciones. #64 permanece como pendiente de definición. Consulta `PLAN.md`, «Alcance implementado» y «Pendientes».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #74 | **Compras → Historial/Vista previa → Descargar PDF** | 1. Abre una compra. 2. Pulsa Descargar PDF. 3. Abre el archivo. 4. Confirma productos, IVA, retención, forma de pago y saldo. |
| #75/#76 | **Compras → Total operación** | 1. Usa un proveedor con retención. 2. Revisa tasa y base. 3. Edita la base. 4. Escribe el motivo. 5. Guarda. 6. Repite con un usuario sin permiso y confirma el rechazo. |
| #77 | **Reportes → Retenciones** | 1. Filtra por fecha/proveedor. 2. Confirma base, tasa y valor retenido. 3. Revisa si la base fue corregida y el motivo. 4. Descarga CSV y ábrelo en Excel. |

Proveedor con retención configurada (p. ej. 2,5 %).

- [ ] En Total operación la retención aparece con la tasa del proveedor y resta del total a pagar.
- [ ] Cambiar la base imponible exige «Motivo del cambio de base».
- [ ] Un usuario sin rol ADMIN/CONTADOR recibe error al guardar con base editada.
- [ ] Vista previa PDF → *Descargar PDF* genera un archivo que abre y lista productos, IVA, retención y saldo.
- [ ] Reportes → *Retenciones* lista la compra con base, tasa, retención y «Base corregida: Sí · motivo».
- [ ] El CSV del reporte abre en Excel con tildes correctas.

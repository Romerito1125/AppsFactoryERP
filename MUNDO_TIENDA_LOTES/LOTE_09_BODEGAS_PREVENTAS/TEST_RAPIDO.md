# Prueba rápida — Lote 09

**Puntos del plan que se prueban:** #31 traslados sugeridos, #32 permisos de bodeguero, #45/#46 bodega y disponibilidad por línea, #47 preventa vendedor→caja y #48 avisos y surtido por bodega. Consulta `PLAN.md`, «Alcance implementado» y «Criterio de cierre».

## Ruta por módulo

| Tarea del plan | Ubicación exacta (módulo → ventana → pestaña) | Pasos |
|---|---|---|
| #31 | **Inventario → Traslados sugeridos** | 1. Usa una bodega bajo mínimo y otra con excedente. 2. Abre Traslados sugeridos. 3. Edita cantidad. 4. Genera el traslado. 5. Confirma stock en origen y destino. |
| #32 | **Administrativo → Usuarios/Roles** y **Inventario** | 1. Entra como BODEGA. 2. Confirma acceso limitado a su bodega. 3. Intenta modificar otra bodega. 4. Confirma el rechazo. |
| #45/#46 | **Ventas → Facturación** | 1. Agrega producto. 2. Cambia la bodega de la línea. 3. Revisa disponibilidad. 4. Confirma el aviso OTRA BODEGA. |
| #47/#48 | **Ventas → Cotizaciones/Preventa**, **Inventario → Avisos** y **Ventas → Facturación** | 1. Guarda una preventa con líneas de varias bodegas. 2. Revisa avisos por bodega. 3. Marca Atendido y Surtido como BODEGA. 4. Carga la preventa en caja. 5. Factura y confirma estado CONVERTIDA. |

- [ ] Producto con stock bajo mínimo en bodega A y excedente en B: Inventario → *Traslados sugeridos* lo propone B→A.
- [ ] Editar cantidad y *Generar traslados* crea el traslado; el stock cambia en ambas bodegas.
- [ ] En caja, elegir otra bodega en una línea muestra disponibilidad y badge «OTRA BODEGA».
- [ ] Cotizaciones → tipo *Preventa* → guardar: el usuario BODEGA de cada bodega recibe aviso solo con sus líneas.
- [ ] BODEGA marca *Atendido* y luego *Surtido* en su línea; otra bodega no puede.
- [ ] La caja carga la preventa, factura y la preventa queda CONVERTIDA; no se puede facturar dos veces.

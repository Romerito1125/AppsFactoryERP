# Checklist rápido — Módulo Administrativo

Usar datos de prueba con el prefijo `QA-ADM-`. No eliminar `admin@mundotienda.com`.

## Acceso al módulo Administrativo

- [ ] Iniciar sesión como administrador.
- [ ] Abrir el módulo «Administrativo».
- [ ] Confirmar que las ventanas aparecen en español.
- [ ] Confirmar que «Anterior» y «Próximo» se ven deshabilitados cuando no hay registros en esa dirección.

## Ventana Clientes

- [ ] Crear un cliente válido.
- [ ] Confirmar que el código y nivel de referido se generan automáticamente.
- [ ] Editar directamente un campo, sin botón «Modificar».
- [ ] Confirmar que «Guardar cambios» y «Cancelar» aparecen debajo de los inputs.
- [ ] Guardar, comprobar el loading y recargar para verificar persistencia.
- [ ] Intentar guardar un campo obligatorio vacío: debe resaltarse y mostrar error en español.
- [ ] Eliminar el cliente de prueba y confirmar que desaparece completamente.

## Ventana Usuarios del sistema

- [ ] Crear un usuario con correo, contraseña y rol válidos.
- [ ] Asociarlo al cliente de prueba si el campo está disponible.
- [ ] Editar directamente ID, correo, rol y contraseña.
- [ ] Guardar y confirmar loading, persistencia después de recargar y botones debajo de los inputs.
- [ ] Seleccionar accesos por módulos, guardar y recargar para confirmar que quedan guardados.
- [ ] Probar datos faltantes o correo inválido: error en español y campo resaltado.
- [ ] Eliminar el usuario de prueba y confirmar eliminación total.

## Ventana Proveedores

- [ ] Crear un proveedor válido.
- [ ] Editarlo directamente y guardar con loading.
- [ ] Recargar y confirmar que los cambios permanecen.
- [ ] Probar un campo obligatorio vacío y confirmar error en español.
- [ ] Eliminarlo después de eliminar cualquier producto asociado.

## Ventana Productos

> Probar esta ventana después de crear un proveedor. También debe existir un tipo de producto disponible.

- [ ] Confirmar que el proveedor de prueba aparece en el selector.
- [ ] Crear un producto seleccionando tipo de producto y proveedor.
- [ ] Editar directamente nombre, proveedor, unidades o empaque.
- [ ] Guardar y confirmar loading, botones debajo de los inputs y persistencia al recargar.
- [ ] Intentar guardar sin proveedor o sin tipo: campo resaltado y mensaje en español.
- [ ] Eliminar el producto y confirmar que desaparece completamente.

## Ventana Retenciones

- [ ] Crear una retención válida.
- [ ] Editarla directamente y guardar con loading.
- [ ] Recargar y confirmar persistencia.
- [ ] Probar un valor inválido o un campo vacío: error en español y campo resaltado.
- [ ] Eliminarla y confirmar eliminación total.

## Comprobación final

- [ ] Ninguna ventana exige presionar «Modificar» para editar.
- [ ] Los botones de guardado aparecen solo cuando hay cambios.
- [ ] Todos los guardados muestran estado de carga.
- [ ] Las eliminaciones son permanentes, no archivados.
- [ ] Los datos permanecen después de recargar.
- [ ] Cerrar sesión y volver a entrar como administrador.
- [ ] Limpiar datos de prueba en este orden: usuarios, clientes, productos, proveedores y retenciones.

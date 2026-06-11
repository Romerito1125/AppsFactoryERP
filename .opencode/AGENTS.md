# AGENTS.md

## Objetivo

Este archivo define las normas comunes para todos los agentes que trabajen en este repositorio.
El proyecto se desarrolla como `Turborepo`, con foco en mantenibilidad, modularidad, legibilidad y cambios pequeños pero correctos.

## Reglas Base

1. Antes de editar, revisar la estructura existente y seguir los patrones del repo.
2. Priorizar cambios pequeños, seguros y fáciles de revisar.
3. No introducir soluciones complejas si una solución simple resuelve el problema.
4. No mezclar responsabilidades en un mismo archivo, módulo, componente o servicio.
5. Mantener cada archivo con un máximo de `500` líneas de código.
6. Si un archivo supera `350-400` líneas y sigue creciendo, dividirlo antes de seguir agregando lógica.
7. No duplicar lógica; extraer utilidades, hooks, servicios, helpers, DTOs, mappers o componentes cuando tenga sentido.
8. Usar nombres explícitos, consistentes y orientados al dominio.
9. Evitar comentarios obvios; comentar solo decisiones no triviales o reglas de negocio importantes.
10. Mantener compatibilidad con el código existente salvo que el cambio requiera una refactorización controlada.

## Reglas para Turborepo

1. Respetar la separación entre `apps` y `packages`.
2. Colocar código reutilizable en `packages` y no duplicarlo entre aplicaciones.
3. Mantener cada app enfocada en composición, flujos y casos de uso específicos.
4. Mantener contratos claros entre paquetes: exports explícitos, tipos compartidos y dependencias mínimas.
5. No crear dependencias circulares entre apps, paquetes o módulos internos.
6. Favorecer paquetes pequeños y especializados en lugar de paquetes gigantes con múltiples responsabilidades.
7. Si una pieza puede ser compartida entre frontend y backend, evaluar moverla a un paquete común.

## Diseño de Código

1. Aplicar responsabilidad única por archivo y por función.
2. Las funciones deben hacer una sola cosa y tener entradas/salidas claras.
3. Evitar funciones excesivamente largas; si una función supera ~40-60 líneas, evaluar dividirla.
4. Mantener bajo acoplamiento y alta cohesión.
5. Preferir composición sobre herencia cuando ambas sean viables.
6. Mantener la lógica de negocio fuera de controladores, rutas y componentes de UI.
7. Separar claramente:
   - presentación
   - lógica de negocio
   - acceso a datos
   - validación
   - mapeo/transformación
8. Usar tipos estrictos y evitar `any` salvo necesidad justificada.
9. No filtrar errores silenciosamente; manejar errores con contexto suficiente.

## Convenciones de Archivos

1. Un archivo debe tener una responsabilidad principal.
2. Dividir archivos grandes en piezas como:
   - `component`
   - `hook`
   - `service`
   - `repository`
   - `dto`
   - `schema`
   - `mapper`
   - `utils`
   - `constants`
   - `types`
3. Evitar archivos tipo `helpers.ts` o `utils.ts` gigantes sin criterio de dominio.
4. Agrupar por dominio o feature cuando sea posible, no solo por tipo técnico.
5. Mantener imports ordenados y eliminar código muerto.

## Frontend React + Vite

Estas reglas aplican a las apps frontend construidas con `React` y `Vite`.

1. Mantener componentes pequeños, enfocados y reutilizables.
2. Separar componentes de presentación de componentes contenedores o con lógica de datos.
3. Extraer hooks cuando la lógica de estado, efectos o coordinación crezca demasiado.
4. No colocar lógica de negocio compleja directamente en componentes visuales.
5. Mantener JSX limpio; si el render se vuelve difícil de leer, dividir subcomponentes.
6. Validar siempre estados de carga, error, vacío y éxito.
7. Evitar páginas monolíticas; la página debe orquestar secciones, no implementar toda la lógica.
8. Evitar props excesivas; si un componente recibe demasiadas dependencias, rediseñar su API.
9. Mantener la lógica de acceso a APIs fuera de componentes visuales; usar hooks, clientes o servicios dedicados.
10. Extraer `types`, `schemas`, `constants`, `mappers` y `hooks` cuando una feature empiece a crecer.
11. Priorizar composición de componentes sobre condicionales complejas dentro de un solo render.
12. Cuidar accesibilidad básica: labels, roles correctos, foco, navegación por teclado y textos claros.
13. Mantener estilos, variantes y patrones visuales alineados con el sistema existente.
14. No mezclar routing, fetching, transformación de datos y render complejo en un mismo archivo.
15. En `Vite`, mantener la configuración mínima y clara; evitar complejidad innecesaria en el bundler.

## Backend NestJS

Estas reglas aplican a las apps backend construidas con `NestJS`.

1. Mantener controladores delgados.
2. Colocar la lógica de negocio en servicios o casos de uso.
3. Separar acceso a datos en repositorios o capas equivalentes.
4. Validar entradas en el borde del sistema con `DTOs`, `pipes`, `schemas` o validadores.
5. No mezclar validación, persistencia y reglas de negocio en un mismo método.
6. Diseñar respuestas consistentes y predecibles.
7. Manejar errores con excepciones y códigos adecuados al contexto.
8. Evitar consultas, transacciones o transformaciones complejas incrustadas en controladores.
9. Centralizar configuración, variables de entorno y clientes externos.
10. Respetar la separación por `modules`, `controllers`, `providers`, `services`, `dto` y dominios.
11. Mantener los módulos enfocados por feature o dominio, no por archivos genéricos sin contexto.
12. No acceder directamente a la base de datos desde controladores.
13. No devolver entidades internas sin revisar qué campos deben exponerse.
14. Usar mappers o serializers cuando el contrato HTTP deba diferir del modelo interno.
15. Mantener `guards`, `interceptors`, `filters` y `pipes` con responsabilidades claras y reutilizables.

## Datos y Contratos

1. Definir tipos, DTOs o schemas cerca del dominio al que pertenecen.
2. No propagar entidades de base de datos directamente a la UI si existe riesgo de acoplamiento.
3. Usar mappers cuando el modelo interno y el modelo expuesto deban diferir.
4. Mantener contratos estables entre capas.
5. Validar y sanear datos externos antes de usarlos.

## Testing

1. Todo cambio relevante debe considerar pruebas.
2. Priorizar pruebas del comportamiento observable.
3. Agregar unit tests para lógica de negocio no trivial.
4. Agregar integration tests para flujos entre capas cuando aplique.
5. En frontend, probar estados y comportamiento; no solo snapshots.
6. No introducir código difícil de probar por acoplamiento innecesario.

## Rendimiento y Mantenibilidad

1. No optimizar prematuramente, pero evitar patrones evidentemente costosos.
2. Reducir renders, consultas y trabajo repetido innecesario.
3. Mantener APIs internas simples y predecibles.
4. Cuando una feature crezca, dividir por submódulos antes de que sea difícil de mantener.
5. Cada cambio debe dejar el código igual o mejor que antes.

## Cuándo Refactorizar

Refactorizar obligatoriamente si ocurre cualquiera de estos casos:

1. Un archivo supera `500` líneas.
2. Un componente o servicio mezcla varias responsabilidades.
3. Hay lógica duplicada en dos o más lugares.
4. El flujo principal cuesta entenderse a simple vista.
5. La lógica de negocio está incrustada en UI, controladores o handlers.
6. Agregar una nueva feature requiere tocar demasiadas partes no relacionadas.

## Forma de Trabajar de los Agentes

1. Inspeccionar primero, editar después.
2. Seguir la arquitectura y estilo del repo antes de proponer nuevas convenciones.
3. Si faltan patrones, aplicar estas normas con criterio conservador.
4. Preferir varias piezas pequeñas y cohesivas antes que una implementación centralizada y extensa.
5. Si una decisión arquitectónica afecta varias apps o packages, elegir la opción más modular y reutilizable.
6. Al crear código nuevo, dejar lista la estructura para crecimiento sin sobrediseñar.
7. Si un cambio grande puede dividirse en pasos seguros, hacerlo por etapas.

## Criterio Final

Todo agente debe producir código:

1. legible
2. modular
3. fácil de testear
4. fácil de extender
5. coherente con Turborepo
6. con archivos pequenos
7. con responsabilidades claras

Si hay duda entre rapidez y mantenibilidad, priorizar mantenibilidad sin caer en sobrediseño.

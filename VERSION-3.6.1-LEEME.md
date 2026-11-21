# V3.6.1 · Rediseño de Participación de mi clase

Se actualiza exclusivamente esta sección:
- Encabezado por clase y navegación diferenciada entre encuentros y seguimiento.
- Encuentros en tarjetas, con estado por punto de predicación y servicio de la tarde.
- Asistencia con fichas amplias, búsqueda, contador, selección visual y barra de guardado fija al desplazarse.
- Seguimiento con filtros, indicadores, tabla en PC y tarjetas en celular, búsqueda y detalle desplegable por actividad.
- Diseño adaptable a 320 px, 390 px y escritorio, con comprobación de ampliación al 150 %.

No requiere SQL ni actualizar la Edge Function. Conserva los permisos y el registro independiente de Secretaría de V3.6 (esa migración debe estar aplicada).

Publicar: subir src/class-participation.jsx y src/class-participation.css junto con estas notas a GitHub; esperar el despliegue de Cloudflare.

Verificado: compilación; búsqueda de participantes; guardar asistencia ficticia; vista de seguimiento; ausencia de desbordamiento del componente a 320/390 px y con ampliación.

Título del commit: v3.6.1: Mejora el diseño adaptable de participación por clase
Descripción: Reorganiza encuentros, asistencia y seguimiento con tarjetas, filtros e indicadores. Presenta una tabla en computador y fichas en celular; añade búsqueda en seguimiento y una barra visible de guardado. Conserva permisos, datos y separación de los totales de Secretaría.

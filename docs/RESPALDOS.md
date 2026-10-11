# Respaldos y recuperación

Las exportaciones Excel/PDF son informes: **no sustituyen un respaldo** de la base de datos, usuarios y fotografías.

## Qué conservar

1. Código y migraciones: ZIP de código y repositorio privado bajo control del propietario.
2. Tablas `profiles`, `classes`, `people`, `visits`, `attendance`, `responsibilities` y `audit_log`.
3. Usuarios y configuración de Auth necesarios para mantener los UUID asociados a perfiles.
4. Archivos privados del bucket `portraits`, con sus nombres y rutas originales. Los respaldos SQL de Supabase no contienen el contenido de Storage.
5. Configuración de URLs, correo, dominio y función `manage-users`. Guardar secretos en un gestor de contraseñas, nunca en el ZIP web.

## Procedimiento recomendado

- Al menos semanalmente después de registrar la visita: exportar datos con Supabase CLI/pg_dump conforme a la guía de backup/restore del proveedor y descargar los objetos de `portraits` con acceso autenticado.
- Antes de una actualización de esquema o traslado de hosting: generar otro respaldo completo.
- Guardar copias fechadas, cifradas y accesibles solo al responsable; conservar al menos cuatro semanales y una mensual.
- El plan gratuito no ofrece el mismo respaldo administrado del plan Pro. No asumir que una exportación de las tablas públicas conserva Auth ni archivos.
- Este proyecto entrega el procedimiento; **no se ha configurado un proceso automático de respaldo en la cuenta del propietario**. Puede configurarse una vez exista esa infraestructura, con credenciales exclusivamente de servidor.

## Restauración de prueba

1. Crear un proyecto de prueba separado, con registro público desactivado.
2. Restaurar esquema y datos siguiendo la guía oficial de Supabase, preservando los UUID de Auth y las relaciones. No ejecutar de nuevo la migración inicial sobre tablas restauradas.
3. Restaurar el bucket privado y cada foto en su ruta original.
4. Desplegar `manage-users` y configurar el frontend con la URL/clave pública del proyecto de prueba.
5. Comparar número de visitas, participantes y presentes, entrar con una cuenta autorizada y comprobar una fotografía.
6. Solo después de esta verificación, planificar el cambio del dominio de producción.

Guía oficial: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

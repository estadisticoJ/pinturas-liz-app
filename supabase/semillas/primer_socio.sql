-- Pinturas Liz · Convierte en socio a la primera cuenta.
-- 1. Crea tu cuenta desde la aplicación (pestaña "Crear cuenta") y confirma el correo.
-- 2. Cambia el correo de abajo por el tuyo y ejecuta este archivo en el SQL Editor.
-- Desde ahí, los demás perfiles se asignan en el módulo Usuarios de la aplicación.
update public.perfiles
   set rol = 'socio', activo = true
 where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');

-- Pinturas Liz · Poner una contraseña nueva a una persona que la olvidó.
-- Cambia el correo y la contraseña de abajo y ejecútalo en Supabase > SQL Editor.
-- Luego esa persona entra con la nueva y la cambia en Mi cuenta > Cambiar contraseña.
update auth.users
   set encrypted_password = extensions.crypt('ClaveNueva2026', extensions.gen_salt('bf')), updated_at = now()
 where email = 'correo-de-la-persona@gmail.com';
select email, updated_at from auth.users where email = 'correo-de-la-persona@gmail.com';

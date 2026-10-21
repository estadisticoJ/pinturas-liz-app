-- Pinturas Liz · 0009 · Perfil Desarrollador (versión 0.7.0)
-- Ejecutar una sola vez, ANTES de 0010. Va aparte porque Postgres no permite usar un valor nuevo
-- en la misma ejecución en que se crea.
alter type public.rol_app add value if not exists 'desarrollador' after 'socio';

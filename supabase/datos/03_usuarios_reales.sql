-- Pinturas Liz · Usuarios reales (versión 0.7.0)
-- Ejecutar UNA vez en Supabase > SQL Editor, DESPUÉS de las migraciones 0009 y 0010.
--
-- Qué hace:
--   1. Borra los datos de PRUEBA de operación: pedidos, cobros, órdenes, lotes, envasados, movimientos de almacén,
--      alertas de pedidos y novedades. Conserva productos, colores, clientes, precios y las alertas del Excel.
--   2. Borra TODOS los usuarios existentes (incluida tu cuenta de prueba).
--   3. Crea las 10 cuentas reales con su perfil y una contraseña temporal igual para todos.
--   4. Vincula a cada vendedor con su nombre de la lista de clientes (Lily, Jorge, Giovanni y Liz).
--
-- ATENCIÓN: no se puede deshacer. Si ya registraste pedidos REALES, no lo ejecutes y avísame.
-- Después de ejecutarlo se cierra tu sesión: entra con sistemas.pinturasliz@gmail.com y la contraseña temporal.
--
-- Contraseña temporal (cámbiala aquí si quieres otra; mínimo 8 caracteres):
--   PinturasLiz2026
-- Cada persona debe cambiarla al entrar: Mi cuenta > Cambiar contraseña.

begin;

-- ---------------------------------------------------------------------
-- 1. Datos de prueba de operación
-- ---------------------------------------------------------------------
delete from public.cobros;
delete from public.movimientos;
delete from public.envasados;
delete from public.lote_insumos;
delete from public.lotes;
delete from public.ordenes_produccion;
delete from public.alertas where pedido_id is not null or tipo in ('aviso','mejora','pedido_revision','pedido_corregido');
delete from public.pedidos;            -- borra también sus líneas e historial
delete from public.novedades;
alter sequence public.pedido_numero_seq restart with 1;
alter sequence public.recibo_numero_seq restart with 1;
alter sequence public.lote_numero_seq restart with 1;
alter sequence public.orden_numero_seq restart with 1;
alter sequence public.envasado_numero_seq restart with 1;

-- Lo que registraron las cuentas de prueba queda sin autor (no se borra)
update public.precios set registrado_por = null where registrado_por is not null;
update public.vendedores set perfil_id = null;

-- ---------------------------------------------------------------------
-- 2. Usuarios existentes (sus perfiles se borran solos)
-- ---------------------------------------------------------------------
delete from auth.users;

-- ---------------------------------------------------------------------
-- 3. Usuarios reales
-- ---------------------------------------------------------------------
create temp table nuevos (nombre text, correo text, rol public.rol_app, vendedor text) on commit drop;
insert into nuevos values
  ('Jordan Roldan',      'sistemas.pinturasliz@gmail.com',       'desarrollador',  null),
  ('Giovanni Escobedo',  'sociogiovanni.pinturasliz@gmail.com',  'socio',          'GIOVANNI'),
  ('Liz Escobedo',       'socioliz.pinturasliz@gmail.com',       'socio',          'LIZ'),
  ('Bryan Roldan',       'sociobryan.pinturasliz@gmail.com',     'socio',          null),
  ('Angelina Rodas',     'administracion.pinturasliz@gmail.com', 'administrativo', null),
  ('Lily De La Cruz',    'ventas1.pinturasliz@gmail.com',        'vendedor',       'LILY'),
  ('Jorge Ruiz',         'ventas2.pinturasliz@gmail.com',        'vendedor',       'JORGE'),
  ('Encargado Taller',   'taller.pinturasliz@gmail.com',         'taller',         null),
  ('Encargado Despacho', 'despacho.pinturasliz@gmail.com',       'despacho',       null),
  ('Bryan Roldan',       'laboratorio.pinturasliz@gmail.com',    'laboratorio',    null);

do $$
declare n record; v_id uuid; v_clave text := 'PinturasLiz2026';
begin
  for n in select * from nuevos loop
    v_id := gen_random_uuid();
    -- Cuenta de acceso (correo ya confirmado, para que pueda entrar de inmediato)
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', n.correo,
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', n.nombre), now(), now(),
            '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', n.correo, 'email_verified', true), 'email', now(), now(), now());
    -- El perfil se crea solo al crear la cuenta; aquí se le asigna su rol
    update public.perfiles set nombre = n.nombre, rol = n.rol, activo = true where id = v_id;
    if n.vendedor is not null then
      update public.vendedores set perfil_id = v_id where codigo = n.vendedor;
    end if;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------
-- 4. Comprobación: deben salir 10 personas con su perfil
-- ---------------------------------------------------------------------
select p.nombre, u.email as correo, p.rol as perfil, v.codigo as vende_como
  from public.perfiles p join auth.users u on u.id = p.id
  left join public.vendedores v on v.perfil_id = p.id
 order by array_position(array['desarrollador','socio','administrativo','vendedor','taller','despacho','laboratorio']::public.rol_app[], p.rol), p.nombre;

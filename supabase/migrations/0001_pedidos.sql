-- Pinturas Liz · Esquema inicial para Supabase (módulo Pedidos)
-- Ejecutar una vez en el SQL Editor del proyecto. Requiere Postgres 15 o superior.

-- 1. Tipos ---------------------------------------------------------------
create type public.rol_app as enum
  ('pendiente','socio','administrativo','vendedor','taller','despacho','laboratorio');
create type public.estado_pedido as enum
  ('recibido','en_taller','listo','despachado','entregado','anulado');
create type public.condicion_pago as enum ('contado','credito');
create type public.tipo_entrega as enum ('local','agencia','oficina');

-- 2. Perfiles (uno por usuario de Supabase Auth) ---------------------------
create table public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  nombre  text not null,
  rol     public.rol_app not null default 'pendiente',
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

-- Cada usuario nuevo recibe un perfil 'pendiente' hasta que un socio le asigne rol.
create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- Rol del usuario conectado; se usa en todas las reglas de acceso.
create function public.rol_actual() returns public.rol_app
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

-- 3. Catálogo --------------------------------------------------------------
create table public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,          -- Acrílico Brillo, Alto Relieve, Témpera...
  linea       text not null,
  descripcion text,
  activo      boolean not null default true
);
create table public.colores (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  nombre      text not null,
  hex         text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  activo      boolean not null default true,
  unique (producto_id, nombre)
);
create table public.presentaciones (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  medida_ml   integer not null check (medida_ml > 0),      -- 30, 50, 60...
  unidades    integer not null check (unidades > 0),       -- frascos por bolsa: 12, 6...
  precio      numeric(10,2) not null check (precio >= 0),  -- precio por bolsa, en soles
  activo      boolean not null default true,
  unique (producto_id, medida_ml, unidades)
);
create table public.clientes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  zona      text,
  telefono  text,
  vendedor_id uuid references public.perfiles (id),
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);

-- 4. Pedidos ---------------------------------------------------------------
create sequence public.pedido_numero_seq;
create table public.pedidos (
  id             uuid primary key default gen_random_uuid(),
  numero         integer not null unique default nextval('public.pedido_numero_seq'),
  cliente_id     uuid not null references public.clientes (id),
  creado_por     uuid not null default auth.uid() references public.perfiles (id),
  canal          text not null,
  condicion      public.condicion_pago not null default 'contado',
  dias_credito   integer check (dias_credito is null or dias_credito > 0),
  entrega        public.tipo_entrega not null default 'local',
  agencia        text,
  fecha_entrega  date not null,
  notas          text,
  estado         public.estado_pedido not null default 'recibido',
  total          numeric(12,2) not null default 0,
  creado         timestamptz not null default now()
);
create table public.pedido_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  producto_id     uuid not null references public.productos (id),
  color_id        uuid not null references public.colores (id),
  presentacion_id uuid not null references public.presentaciones (id),
  bolsas          integer not null check (bolsas > 0),
  precio          numeric(10,2) not null       -- precio por bolsa al momento del pedido
);
create table public.pedido_historial (
  id        bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  estado    public.estado_pedido not null,
  por       uuid references public.perfiles (id),
  cuando    timestamptz not null default now()
);
create index on public.pedidos (estado);
create index on public.pedidos (creado_por);
create index on public.pedido_items (pedido_id);
create index on public.pedido_historial (pedido_id);

-- El total del pedido se recalcula solo cuando cambian sus líneas.
create function public.recalcular_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set total = coalesce((select sum(bolsas * precio) from public.pedido_items where pedido_id = v_pedido), 0)
   where id = v_pedido;
  return null;
end $$;
create trigger items_total after insert or update or delete on public.pedido_items
  for each row execute function public.recalcular_total();

-- Cada cambio de estado valida quién puede hacerlo y queda en el historial.
create function public.controlar_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_app := public.rol_actual();
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_historial (pedido_id, estado, por) values (new.id, new.estado, auth.uid());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if not (
         v_rol = 'socio'
      or (old.estado = 'recibido'   and new.estado = 'en_taller'  and v_rol = 'administrativo')
      or (old.estado = 'en_taller'  and new.estado = 'listo'      and v_rol = 'taller')
      or (old.estado = 'listo'      and new.estado = 'despachado' and v_rol in ('taller','despacho'))
      or (old.estado = 'despachado' and new.estado = 'entregado'  and v_rol in ('administrativo','despacho'))
      or (old.estado in ('recibido','en_taller') and new.estado = 'anulado' and v_rol = 'administrativo')
    ) then
      raise exception 'Tu perfil no puede pasar un pedido de % a %', old.estado, new.estado;
    end if;
    insert into public.pedido_historial (pedido_id, estado, por) values (new.id, new.estado, auth.uid());
  end if;
  return new;
end $$;
create trigger pedidos_estado_ins after insert on public.pedidos
  for each row execute function public.controlar_estado();
create trigger pedidos_estado_upd before update on public.pedidos
  for each row execute function public.controlar_estado();

-- Registra el pedido y sus líneas en una sola operación. El precio se toma del catálogo.
-- items: [{ "producto_id": "...", "color_id": "...", "presentacion_id": "...", "bolsas": 2 }, ...]
create function public.crear_pedido(pedido jsonb, items jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_array_length(items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  insert into public.pedidos (cliente_id, canal, condicion, dias_credito, entrega, agencia, fecha_entrega, notas)
  values ((pedido ->> 'cliente_id')::uuid, pedido ->> 'canal',
          coalesce(pedido ->> 'condicion', 'contado')::public.condicion_pago,
          (pedido ->> 'dias_credito')::integer,
          coalesce(pedido ->> 'entrega', 'local')::public.tipo_entrega,
          pedido ->> 'agencia', (pedido ->> 'fecha_entrega')::date, pedido ->> 'notas')
  returning id into v_id;
  insert into public.pedido_items (pedido_id, producto_id, color_id, presentacion_id, bolsas, precio)
  select v_id, pr.producto_id, (i ->> 'color_id')::uuid, pr.id, (i ->> 'bolsas')::integer, pr.precio
    from jsonb_array_elements(items) as i
    join public.presentaciones pr on pr.id = (i ->> 'presentacion_id')::uuid;
  return v_id;
end $$;

-- Lo pendiente de envasar, sumado por producto, color y presentación.
create view public.consolidado_pendiente with (security_invoker = true) as
select p.nombre as producto, c.nombre as color, c.hex, pr.medida_ml, pr.unidades,
       sum(i.bolsas) as bolsas, sum(i.bolsas * pr.unidades) as frascos,
       count(distinct i.pedido_id) as pedidos
  from public.pedido_items i
  join public.pedidos pe on pe.id = i.pedido_id and pe.estado in ('recibido','en_taller')
  join public.productos p on p.id = i.producto_id
  join public.colores c on c.id = i.color_id
  join public.presentaciones pr on pr.id = i.presentacion_id
 group by p.nombre, c.nombre, c.hex, pr.medida_ml, pr.unidades;

-- 5. Reglas de acceso por perfil (RLS) ---------------------------------------
alter table public.perfiles         enable row level security;
alter table public.productos        enable row level security;
alter table public.colores          enable row level security;
alter table public.presentaciones   enable row level security;
alter table public.clientes         enable row level security;
alter table public.pedidos          enable row level security;
alter table public.pedido_items     enable row level security;
alter table public.pedido_historial enable row level security;

-- Perfiles: cada quien ve el suyo; socios y administración ven todos; solo socios asignan roles.
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.rol_actual() in ('socio','administrativo'));
create policy perfiles_editar on public.perfiles for update to authenticated
  using (public.rol_actual() = 'socio') with check (public.rol_actual() = 'socio');

-- Catálogo: lo lee cualquier perfil con rol asignado; lo editan socios y administración.
create policy productos_ver on public.productos for select to authenticated
  using (public.rol_actual() <> 'pendiente');
create policy productos_editar on public.productos for all to authenticated
  using (public.rol_actual() in ('socio','administrativo'))
  with check (public.rol_actual() in ('socio','administrativo'));
create policy colores_ver on public.colores for select to authenticated
  using (public.rol_actual() <> 'pendiente');
create policy colores_editar on public.colores for all to authenticated
  using (public.rol_actual() in ('socio','administrativo'))
  with check (public.rol_actual() in ('socio','administrativo'));
create policy presentaciones_ver on public.presentaciones for select to authenticated
  using (public.rol_actual() <> 'pendiente');
create policy presentaciones_editar on public.presentaciones for all to authenticated
  using (public.rol_actual() in ('socio','administrativo'))
  with check (public.rol_actual() in ('socio','administrativo'));

-- Clientes: ventas, administración, taller y despacho los ven; ventas y administración los crean.
create policy clientes_ver on public.clientes for select to authenticated
  using (public.rol_actual() in ('socio','administrativo','vendedor','taller','despacho'));
create policy clientes_crear on public.clientes for insert to authenticated
  with check (public.rol_actual() in ('socio','administrativo','vendedor'));
create policy clientes_editar on public.clientes for update to authenticated
  using (public.rol_actual() in ('socio','administrativo'))
  with check (public.rol_actual() in ('socio','administrativo'));

-- Pedidos: el vendedor ve solo los suyos; el resto de perfiles con acceso ve todos.
create policy pedidos_ver on public.pedidos for select to authenticated
  using (public.rol_actual() in ('socio','administrativo','taller','despacho')
         or (public.rol_actual() = 'vendedor' and creado_por = auth.uid()));
create policy pedidos_crear on public.pedidos for insert to authenticated
  with check (public.rol_actual() in ('socio','administrativo','vendedor') and creado_por = auth.uid());
create policy pedidos_cambiar on public.pedidos for update to authenticated
  using (public.rol_actual() in ('socio','administrativo','taller','despacho'))
  with check (public.rol_actual() in ('socio','administrativo','taller','despacho'));

-- Líneas e historial: visibles para quien puede ver el pedido.
create policy items_ver on public.pedido_items for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id));
create policy items_crear on public.pedido_items for insert to authenticated
  with check (exists (select 1 from public.pedidos p
                       where p.id = pedido_id and p.creado_por = auth.uid() and p.estado = 'recibido'));
create policy historial_ver on public.pedido_historial for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id));

-- 6. Cambios en vivo para la lista de pedidos --------------------------------
alter publication supabase_realtime add table public.pedidos;

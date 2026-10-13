-- Pinturas Liz · 0003 · Módulos Almacén, Producción, Taller y Cobranzas
-- Ejecutar una sola vez, después de 0002. Si falla, nada queda a medias: corrige y vuelve a ejecutarlo completo.

-- =====================================================================
-- Ayudas de permisos
-- =====================================================================
create function public.tiene_rol(variadic roles public.rol_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = any(roles), false)
$$;

-- =====================================================================
-- ALMACÉN: cinco almacenes, un libro de movimientos y existencias calculadas
-- =====================================================================
create type public.almacen as enum ('insumos','granel_lab','granel_taller','materiales','envasado');
create type public.tipo_articulo as enum ('insumo','material','granel','envasado');

-- Qué almacén mueve cada perfil
create function public.puede_mover(a public.almacen) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.rol_actual()
    when 'socio'          then true
    when 'administrativo' then a in ('insumos','materiales')
    when 'laboratorio'    then a in ('insumos','granel_lab')
    when 'taller'         then a in ('granel_taller','materiales','envasado')
    when 'despacho'       then a in ('granel_taller','materiales','envasado')
    else false end
$$;

create table public.articulos (
  id              uuid primary key default gen_random_uuid(),
  tipo            public.tipo_articulo not null,
  nombre          text not null,
  unidad          text not null,                 -- kg, L, und, millar, bolsa...
  color_id        uuid references public.colores (id),
  presentacion_id uuid references public.presentaciones (id),
  activo          boolean not null default true,
  creado          timestamptz not null default now()
);
create unique index articulos_nombre_unico on public.articulos (tipo, lower(nombre)) where tipo in ('insumo','material');
create unique index articulos_granel_unico on public.articulos (color_id) where tipo = 'granel';
create unique index articulos_envasado_unico on public.articulos (color_id, presentacion_id) where tipo = 'envasado';

-- En qué almacén vive cada tipo de artículo
create table public.almacen_tipos (almacen public.almacen not null, tipo public.tipo_articulo not null, primary key (almacen, tipo));
insert into public.almacen_tipos values
  ('insumos','insumo'), ('granel_lab','granel'), ('granel_taller','granel'), ('materiales','material'), ('envasado','envasado');

create table public.stock_minimos (
  almacen     public.almacen not null,
  articulo_id uuid not null references public.articulos (id) on delete cascade,
  minimo      numeric(14,3) not null check (minimo >= 0),
  primary key (almacen, articulo_id)
);

create table public.movimientos (
  id          bigint generated always as identity primary key,
  almacen     public.almacen not null,
  articulo_id uuid not null references public.articulos (id),
  cantidad    numeric(14,3) not null check (cantidad <> 0),   -- positiva entra, negativa sale
  motivo      text not null,     -- compra, ajuste, consumo_lote, produccion, entrega_taller, recepcion_lab, envasado, consumo_envasado, pedido
  referencia  text,              -- proveedor, número de lote, de pedido...
  pedido_id   uuid references public.pedidos (id),
  por         uuid default auth.uid() references public.perfiles (id),
  creado      timestamptz not null default now()
);
create index on public.movimientos (almacen, articulo_id);
create index on public.movimientos (creado desc);

-- El artículo debe corresponder al almacén (no se guardan frascos en el almacén de insumos)
create function public.validar_movimiento() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.almacen_tipos t join public.articulos a on a.tipo = t.tipo
                  where a.id = new.articulo_id and t.almacen = new.almacen) then
    raise exception 'Ese artículo no se guarda en el almacén %', new.almacen;
  end if;
  return new;
end $$;
create trigger movimientos_validar before insert on public.movimientos
  for each row execute function public.validar_movimiento();

-- Artículos de granel y de envasado se crean solos la primera vez que se usan
create function public.articulo_granel(p_color uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.articulos where tipo = 'granel' and color_id = p_color;
  if v is null then
    insert into public.articulos (tipo, nombre, unidad, color_id)
    select 'granel', p.nombre || ' · ' || c.nombre, 'L', c.id
      from public.colores c join public.productos p on p.id = c.producto_id where c.id = p_color
    on conflict do nothing;
    select id into v from public.articulos where tipo = 'granel' and color_id = p_color;
  end if;
  if v is null then raise exception 'Color no encontrado'; end if;
  return v;
end $$;

create function public.articulo_envasado(p_color uuid, p_presentacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.articulos where tipo = 'envasado' and color_id = p_color and presentacion_id = p_presentacion;
  if v is null then
    insert into public.articulos (tipo, nombre, unidad, color_id, presentacion_id)
    select 'envasado', p.nombre || ' · ' || c.nombre || ' · ' || pr.medida_ml || ' ml x' || pr.unidades, 'bolsa', c.id, pr.id
      from public.colores c join public.productos p on p.id = c.producto_id
      join public.presentaciones pr on pr.id = p_presentacion and pr.producto_id = p.id
     where c.id = p_color
    on conflict do nothing;
    select id into v from public.articulos where tipo = 'envasado' and color_id = p_color and presentacion_id = p_presentacion;
  end if;
  if v is null then raise exception 'La presentación no corresponde al producto de ese color'; end if;
  return v;
end $$;

-- Existencias de cada artículo en cada almacén, con su mínimo
create view public.stock with (security_invoker = true) as
select t.almacen, a.id as articulo_id, a.tipo, a.nombre, a.unidad, a.color_id, a.presentacion_id,
       coalesce(sum(m.cantidad), 0) as existencia, sm.minimo
  from public.articulos a
  join public.almacen_tipos t on t.tipo = a.tipo
  left join public.movimientos m on m.articulo_id = a.id and m.almacen = t.almacen
  left join public.stock_minimos sm on sm.articulo_id = a.id and sm.almacen = t.almacen
 where a.activo
 group by t.almacen, a.id, sm.minimo;

-- =====================================================================
-- PRODUCCIÓN: órdenes del Taller al Laboratorio y lotes fabricados
-- =====================================================================
create type public.estado_orden as enum ('pendiente','en_proceso','atendida','anulada');
create type public.estado_lote as enum ('en_validacion','aprobado','rechazado','entregado');
create sequence public.orden_numero_seq;
create sequence public.lote_numero_seq;

create table public.ordenes_produccion (
  id              uuid primary key default gen_random_uuid(),
  numero          integer not null unique default nextval('public.orden_numero_seq'),
  color_id        uuid not null references public.colores (id),
  litros          numeric(10,2) not null check (litros > 0),
  fecha_requerida date,
  notas           text,
  estado          public.estado_orden not null default 'pendiente',
  solicitada_por  uuid not null default auth.uid() references public.perfiles (id),
  creado          timestamptz not null default now()
);

create table public.lotes (
  id            uuid primary key default gen_random_uuid(),
  numero        integer not null unique default nextval('public.lote_numero_seq'),
  orden_id      uuid references public.ordenes_produccion (id),
  color_id      uuid not null references public.colores (id),
  litros        numeric(10,2) not null check (litros > 0),
  fecha         date not null default current_date,
  estado        public.estado_lote not null default 'en_validacion',
  viscosidad    text,
  transparencia text,
  color_ok      boolean,
  notas         text,
  registrado_por uuid default auth.uid() references public.perfiles (id),
  validado_por  uuid references public.perfiles (id),
  validado_en   timestamptz,
  entregado_en  timestamptz,
  creado        timestamptz not null default now()
);
create table public.lote_insumos (
  lote_id     uuid not null references public.lotes (id) on delete cascade,
  articulo_id uuid not null references public.articulos (id),
  cantidad    numeric(14,3) not null check (cantidad > 0),
  primary key (lote_id, articulo_id)
);

-- Cambios de estado permitidos en una orden de producción
create function public.controlar_orden() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.rol_app := public.rol_actual();
begin
  if new.estado is distinct from old.estado and not (
       r = 'socio'
    or (old.estado = 'pendiente'  and new.estado = 'en_proceso' and r = 'laboratorio')
    or (old.estado = 'en_proceso' and new.estado = 'atendida'   and r = 'laboratorio')
    or (old.estado = 'pendiente'  and new.estado = 'anulada'    and r in ('administrativo','taller','despacho','laboratorio'))
    or auth.uid() is null                                  -- cambios internos de las funciones de lote
  ) then
    raise exception 'Tu perfil no puede pasar la orden de % a %', old.estado, new.estado;
  end if;
  return new;
end $$;
create trigger ordenes_controlar before update on public.ordenes_produccion
  for each row execute function public.controlar_orden();

-- Registra un lote y descuenta los insumos usados.
-- p_insumos: [{"articulo_id": "...", "cantidad": 1.5}, ...]
create function public.registrar_lote(p_color uuid, p_litros numeric, p_orden uuid, p_insumos jsonb, p_notas text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num integer; x jsonb;
begin
  if not public.tiene_rol('socio','laboratorio') then raise exception 'Solo el Laboratorio registra lotes'; end if;
  insert into public.lotes (orden_id, color_id, litros, notas, registrado_por)
  values (p_orden, p_color, p_litros, nullif(p_notas, ''), auth.uid()) returning id, numero into v_id, v_num;
  for x in select * from jsonb_array_elements(coalesce(p_insumos, '[]'::jsonb)) loop
    insert into public.lote_insumos (lote_id, articulo_id, cantidad)
    values (v_id, (x ->> 'articulo_id')::uuid, (x ->> 'cantidad')::numeric);
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por)
    values ('insumos', (x ->> 'articulo_id')::uuid, -(x ->> 'cantidad')::numeric, 'consumo_lote', 'L-' || lpad(v_num::text, 5, '0'), auth.uid());
  end loop;
  if p_orden is not null then
    update public.ordenes_produccion set estado = 'en_proceso' where id = p_orden and estado = 'pendiente';
  end if;
  return v_id;
end $$;

-- El químico aprueba o rechaza. Al aprobar, el lote entra a la reserva de granel del Laboratorio.
create function public.validar_lote(p_lote uuid, p_aprobado boolean, p_viscosidad text, p_transparencia text, p_color_ok boolean, p_notas text)
returns void language plpgsql security definer set search_path = public as $$
declare l public.lotes;
begin
  if not public.tiene_rol('socio','laboratorio') then raise exception 'Solo el Laboratorio valida lotes'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or l.estado <> 'en_validacion' then raise exception 'El lote no está en validación'; end if;
  update public.lotes set estado = case when p_aprobado then 'aprobado'::public.estado_lote else 'rechazado'::public.estado_lote end,
         viscosidad = nullif(p_viscosidad, ''), transparencia = nullif(p_transparencia, ''), color_ok = p_color_ok,
         notas = coalesce(nullif(p_notas, ''), notas), validado_por = auth.uid(), validado_en = now()
   where id = p_lote;
  if p_aprobado then
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por)
    values ('granel_lab', public.articulo_granel(l.color_id), l.litros, 'produccion', 'L-' || lpad(l.numero::text, 5, '0'), auth.uid());
  end if;
end $$;

-- Pasa el lote aprobado del granel del Laboratorio al granel del Taller y cierra la orden.
create function public.entregar_lote(p_lote uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lotes; v_art uuid; v_ref text;
begin
  if not public.tiene_rol('socio','laboratorio') then raise exception 'Solo el Laboratorio entrega lotes'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or l.estado <> 'aprobado' then raise exception 'Solo se entregan lotes aprobados'; end if;
  v_art := public.articulo_granel(l.color_id); v_ref := 'L-' || lpad(l.numero::text, 5, '0');
  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por) values
    ('granel_lab',    v_art, -l.litros, 'entrega_taller', v_ref, auth.uid()),
    ('granel_taller', v_art,  l.litros, 'recepcion_lab',  v_ref, auth.uid());
  update public.lotes set estado = 'entregado', entregado_en = now() where id = p_lote;
  if l.orden_id is not null then
    update public.ordenes_produccion set estado = 'atendida' where id = l.orden_id and estado in ('pendiente','en_proceso');
  end if;
end $$;

-- =====================================================================
-- TALLER: envasado del granel en frascos y bolsas
-- =====================================================================
-- Materiales que consume cada bolsa de una presentación (frascos, tapas, etiquetas, bolsa)
create table public.presentacion_materiales (
  presentacion_id uuid not null references public.presentaciones (id) on delete cascade,
  articulo_id     uuid not null references public.articulos (id),
  por_bolsa       numeric(10,3) not null check (por_bolsa > 0),
  primary key (presentacion_id, articulo_id)
);

create sequence public.envasado_numero_seq;
create table public.envasados (
  id              uuid primary key default gen_random_uuid(),
  numero          integer not null unique default nextval('public.envasado_numero_seq'),
  color_id        uuid not null references public.colores (id),
  presentacion_id uuid not null references public.presentaciones (id),
  bolsas          integer not null check (bolsas > 0),
  litros          numeric(10,3) not null,       -- granel usado: bolsas x frascos x ml / 1000
  lote_id         uuid references public.lotes (id),
  fecha           date not null default current_date,
  notas           text,
  por             uuid default auth.uid() references public.perfiles (id),
  creado          timestamptz not null default now()
);

-- Registra un envasado: sale granel del Taller y materiales, entra producto envasado.
create function public.registrar_envasado(p_color uuid, p_presentacion uuid, p_bolsas integer, p_lote uuid, p_notas text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num integer; v_litros numeric; v_ref text; pr public.presentaciones; mat record;
begin
  if not public.tiene_rol('socio','taller','despacho') then raise exception 'Solo el Taller registra envasados'; end if;
  select * into pr from public.presentaciones where id = p_presentacion;
  v_litros := round(p_bolsas * pr.unidades * pr.medida_ml / 1000.0, 3);
  insert into public.envasados (color_id, presentacion_id, bolsas, litros, lote_id, notas, por)
  values (p_color, p_presentacion, p_bolsas, v_litros, p_lote, nullif(p_notas, ''), auth.uid()) returning id, numero into v_id, v_num;
  v_ref := 'E-' || lpad(v_num::text, 5, '0');
  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por) values
    ('granel_taller', public.articulo_granel(p_color), -v_litros, 'envasado', v_ref, auth.uid()),
    ('envasado', public.articulo_envasado(p_color, p_presentacion), p_bolsas, 'envasado', v_ref, auth.uid());
  for mat in select articulo_id, por_bolsa from public.presentacion_materiales where presentacion_id = p_presentacion loop
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por)
    values ('materiales', mat.articulo_id, -(mat.por_bolsa * p_bolsas), 'consumo_envasado', v_ref, auth.uid());
  end loop;
  return v_id;
end $$;

-- Cuando un pedido queda listo, sus bolsas salen del almacén de producto envasado.
create function public.descontar_pedido_listo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'listo' and old.estado is distinct from 'listo' then
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, pedido_id, por)
    select 'envasado', public.articulo_envasado(i.color_id, i.presentacion_id), -i.bolsas, 'pedido',
           'P-' || lpad(new.numero::text, 5, '0'), new.id, auth.uid()
      from public.pedido_items i where i.pedido_id = new.id;
  end if;
  return null;
end $$;
create trigger pedidos_descontar_listo after update on public.pedidos
  for each row execute function public.descontar_pedido_listo();

-- Lo que falta envasar para atender los pedidos pendientes, frente a lo que ya hay
create view public.por_envasar with (security_invoker = true) as
with pendiente as (
  select i.color_id, i.presentacion_id, sum(i.bolsas) as bolsas, count(distinct i.pedido_id) as pedidos
    from public.pedido_items i
    join public.pedidos p on p.id = i.pedido_id and p.estado in ('recibido','en_taller')
   group by i.color_id, i.presentacion_id
), env as (
  select color_id, presentacion_id, existencia from public.stock where almacen = 'envasado'
), gra as (
  select color_id, existencia from public.stock where almacen = 'granel_taller'
)
select pe.color_id, pe.presentacion_id, pr.nombre as producto, c.nombre as color, c.hex,
       x.medida_ml, x.unidades, pe.bolsas, pe.pedidos,
       coalesce(env.existencia, 0) as envasado_disponible,
       greatest(pe.bolsas - coalesce(env.existencia, 0), 0) as faltan_bolsas,
       round(greatest(pe.bolsas - coalesce(env.existencia, 0), 0) * x.unidades * x.medida_ml / 1000.0, 3) as litros_necesarios,
       coalesce(gra.existencia, 0) as granel_disponible
  from pendiente pe
  join public.colores c on c.id = pe.color_id
  join public.productos pr on pr.id = c.producto_id
  join public.presentaciones x on x.id = pe.presentacion_id
  left join env on env.color_id = pe.color_id and env.presentacion_id = pe.presentacion_id
  left join gra on gra.color_id = pe.color_id;

-- =====================================================================
-- COBRANZAS: cobros con recibo numerado y saldo por pedido
-- =====================================================================
alter table public.clientes add column limite_credito numeric(12,2) check (limite_credito is null or limite_credito >= 0);

create type public.medio_pago as enum ('efectivo','transferencia','yape','plin','deposito');
create type public.estado_cobro as enum ('por_entregar','recibido','anulado');
create sequence public.recibo_numero_seq;

create table public.cobros (
  id           uuid primary key default gen_random_uuid(),
  recibo       integer not null unique default nextval('public.recibo_numero_seq'),
  pedido_id    uuid not null references public.pedidos (id),
  monto        numeric(12,2) not null check (monto > 0),
  medio        public.medio_pago not null default 'efectivo',
  fecha        date not null default current_date,
  notas        text,
  estado       public.estado_cobro not null default 'por_entregar',
  cobrado_por  uuid not null default auth.uid() references public.perfiles (id),
  recibido_por uuid references public.perfiles (id),
  recibido_en  timestamptz,
  creado       timestamptz not null default now()
);
create index on public.cobros (pedido_id);
create index on public.cobros (estado);

-- No se cobra más que el saldo ni sobre pedidos anulados; quien recibe queda registrado.
create function public.controlar_cobro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_cobrado numeric; v_estado public.estado_pedido;
begin
  if tg_op = 'INSERT' then
    select total, estado into v_total, v_estado from public.pedidos where id = new.pedido_id;
    if v_estado = 'anulado' then raise exception 'El pedido está anulado'; end if;
    select coalesce(sum(monto), 0) into v_cobrado from public.cobros where pedido_id = new.pedido_id and estado <> 'anulado';
    if new.monto > v_total - v_cobrado + 0.001 then
      raise exception 'El monto supera el saldo del pedido (S/ %)', to_char(v_total - v_cobrado, 'FM999999990.00');
    end if;
    new.estado := 'por_entregar'; new.recibido_por := null; new.recibido_en := null;
  elsif new.estado is distinct from old.estado then
    if old.estado <> 'por_entregar' then raise exception 'Ese cobro ya fue cerrado'; end if;
    if new.estado = 'recibido' then new.recibido_por := auth.uid(); new.recibido_en := now(); end if;
  end if;
  return new;
end $$;
create trigger cobros_controlar before insert or update on public.cobros
  for each row execute function public.controlar_cobro();

-- Saldo de cada pedido (excepto anulados)
create view public.saldos_pedidos with (security_invoker = true) as
select p.id as pedido_id, p.numero, p.cliente_id, c.nombre as cliente, c.limite_credito, p.creado_por,
       pf.nombre as vendedor, p.estado, p.condicion, p.fecha_entrega,
       (p.fecha_entrega + coalesce(p.dias_credito, 0)) as vence,
       p.total,
       coalesce(sum(co.monto) filter (where co.estado <> 'anulado'), 0) as cobrado,
       p.total - coalesce(sum(co.monto) filter (where co.estado <> 'anulado'), 0) as saldo
  from public.pedidos p
  join public.clientes c on c.id = p.cliente_id
  left join public.perfiles pf on pf.id = p.creado_por
  left join public.cobros co on co.pedido_id = p.id
 where p.estado <> 'anulado'
 group by p.id, c.nombre, c.limite_credito, pf.nombre;

-- =====================================================================
-- Reglas de acceso (RLS)
-- =====================================================================
alter table public.articulos              enable row level security;
alter table public.almacen_tipos          enable row level security;
alter table public.stock_minimos          enable row level security;
alter table public.movimientos            enable row level security;
alter table public.ordenes_produccion     enable row level security;
alter table public.lotes                  enable row level security;
alter table public.lote_insumos           enable row level security;
alter table public.presentacion_materiales enable row level security;
alter table public.envasados              enable row level security;
alter table public.cobros                 enable row level security;

-- Almacén: lo leen los perfiles de operación; cada uno mueve solo sus almacenes.
create policy articulos_ver on public.articulos for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy articulos_crear on public.articulos for insert to authenticated
  with check ((tipo = 'insumo' and public.tiene_rol('socio','administrativo','laboratorio'))
           or (tipo = 'material' and public.tiene_rol('socio','administrativo','taller','despacho')));
create policy articulos_editar on public.articulos for update to authenticated
  using (public.tiene_rol('socio','administrativo')) with check (public.tiene_rol('socio','administrativo'));
create policy almacen_tipos_ver on public.almacen_tipos for select to authenticated using (true);
create policy minimos_ver on public.stock_minimos for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy minimos_crear on public.stock_minimos for insert to authenticated with check (public.puede_mover(almacen));
create policy minimos_editar on public.stock_minimos for update to authenticated
  using (public.puede_mover(almacen)) with check (public.puede_mover(almacen));
create policy movimientos_ver on public.movimientos for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy movimientos_crear on public.movimientos for insert to authenticated
  with check (public.puede_mover(almacen) and por = auth.uid() and motivo in ('compra','ajuste','salida'));
-- Los movimientos no se editan ni se borran: un error se corrige con un ajuste.

-- Producción
create policy ordenes_ver on public.ordenes_produccion for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy ordenes_crear on public.ordenes_produccion for insert to authenticated
  with check (public.tiene_rol('socio','administrativo','taller','despacho') and solicitada_por = auth.uid());
create policy ordenes_cambiar on public.ordenes_produccion for update to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'))
  with check (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy lotes_ver on public.lotes for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));
create policy lote_insumos_ver on public.lote_insumos for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio'));

-- Taller
create policy materiales_presentacion_ver on public.presentacion_materiales for select to authenticated
  using (public.tiene_rol('socio','administrativo','taller','despacho'));
create policy materiales_presentacion_editar on public.presentacion_materiales for all to authenticated
  using (public.tiene_rol('socio','administrativo','taller')) with check (public.tiene_rol('socio','administrativo','taller'));
create policy envasados_ver on public.envasados for select to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller','despacho'));

-- Cobranzas: el vendedor ve y registra cobros de sus pedidos; Administración confirma lo recibido.
create policy cobros_ver on public.cobros for select to authenticated
  using (public.tiene_rol('socio','administrativo')
         or (public.tiene_rol('vendedor') and exists (select 1 from public.pedidos p where p.id = pedido_id and p.creado_por = auth.uid())));
create policy cobros_crear on public.cobros for insert to authenticated
  with check (cobrado_por = auth.uid() and (public.tiene_rol('socio','administrativo')
         or (public.tiene_rol('vendedor') and exists (select 1 from public.pedidos p where p.id = pedido_id and p.creado_por = auth.uid()))));
create policy cobros_cerrar on public.cobros for update to authenticated
  using (public.tiene_rol('socio','administrativo')) with check (public.tiene_rol('socio','administrativo'));

-- Límite de crédito: solo socios lo cambian (además de lo que ya permitía 0001 a Administración).
create function public.proteger_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.limite_credito is distinct from old.limite_credito and not public.tiene_rol('socio') then
    raise exception 'Solo un socio cambia el límite de crédito';
  end if;
  return new;
end $$;
create trigger clientes_proteger_limite before update on public.clientes
  for each row execute function public.proteger_limite();

-- Cambios en vivo
alter publication supabase_realtime add table public.cobros, public.ordenes_produccion, public.lotes;

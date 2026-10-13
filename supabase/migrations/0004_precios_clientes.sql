-- Pinturas Liz · 0004 · Precios por cliente con vigencia, vendedores y más datos de cliente
-- Ejecutar una sola vez, después de 0003. Luego: datos/01_limpiar_pruebas.sql y datos/02_carga_metadatos.sql.

-- =====================================================================
-- Vendedores: los nombres de tu Excel (Jorge, Lily, Giovanni, Liz, Oficina),
-- cada uno vinculable a un usuario del sistema
-- =====================================================================
create table public.vendedores (
  codigo    text primary key,                      -- JORGE, LILY...
  nombre    text not null,
  perfil_id uuid unique references public.perfiles (id) on delete set null,
  activo    boolean not null default true
);
alter table public.vendedores enable row level security;
create policy vendedores_ver on public.vendedores for select to authenticated using (public.rol_actual() <> 'pendiente');
create policy vendedores_editar on public.vendedores for all to authenticated
  using (public.tiene_rol('socio')) with check (public.tiene_rol('socio'));

-- Código del vendedor del usuario conectado (null si no está vinculado)
create function public.mi_vendedor() returns text
language sql stable security definer set search_path = public as $$
  select codigo from public.vendedores where perfil_id = auth.uid()
$$;

-- =====================================================================
-- Clientes: datos que faltaban para facturar, entregar y vender
-- =====================================================================
alter table public.clientes
  add column codigo               text unique,
  add column vendedor_codigo      text references public.vendedores (codigo) on update cascade,
  add column lugar                text,                -- Lima, Provincia, Oficina
  add column correo               text,
  add column direccion            text,
  add column documento_tipo       text check (documento_tipo in ('DNI','RUC','CE')),
  add column documento            text,
  add column agencia_habitual     text,
  add column condicion_habitual   public.condicion_pago not null default 'contado',
  add column dias_credito_habitual integer check (dias_credito_habitual is null or dias_credito_habitual > 0),
  add column notas                text;
-- (la columna "zona" existente guarda el LOCAL del Excel: Centro de Lima, Dorado, Arequipa...)

-- Código de cliente automático (C0001, C0002...) cuando no se indica
create function public.codigo_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.codigo is null or new.codigo = '' then
    select coalesce(max(substring(codigo from '^C(\d+)$')::integer), 0) + 1 into n from public.clientes;
    new.codigo := 'C' || lpad(n::text, 4, '0');
  end if;
  if new.vendedor_codigo is null then new.vendedor_codigo := public.mi_vendedor(); end if;
  return new;
end $$;
create trigger clientes_codigo before insert on public.clientes for each row execute function public.codigo_cliente();

-- =====================================================================
-- Productos: código por color
-- =====================================================================
alter table public.colores add column codigo text unique;
-- El precio ahora vive en la tabla precios (por docena). Esta columna queda sin uso.
alter table public.presentaciones alter column precio set default 0;
comment on column public.presentaciones.precio is 'Sin uso desde 0004: ver tabla precios';
comment on column public.presentaciones.unidades is 'Frascos por paquete que se vende y se envasa (12 = docena)';

-- =====================================================================
-- Precios con vigencia: un precio nunca se sobrescribe, se cierra y se abre uno nuevo
-- =====================================================================
create type public.tipo_venta as enum ('menor','mayor');

create table public.precios (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references public.clientes (id) on delete cascade,   -- null = precio de lista
  producto_id    uuid not null references public.productos (id) on delete cascade,
  medida_ml      integer not null check (medida_ml > 0),
  tipo_venta     public.tipo_venta not null default 'menor',
  precio_docena  numeric(10,2) not null check (precio_docena >= 0),
  vigente_desde  date not null default current_date,
  vigente_hasta  date,                                                     -- null = sigue vigente
  nota           text,
  registrado_por uuid default auth.uid() references public.perfiles (id),
  creado         timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create unique index precios_abierto_unico on public.precios
  (coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), producto_id, medida_ml, tipo_venta) where vigente_hasta is null;
create index on public.precios (cliente_id);
create index on public.precios (producto_id, medida_ml);

-- Precio por docena que corresponde a un cliente en una fecha: el suyo, o si no tiene, el de lista
create function public.precio_docena(p_cliente uuid, p_producto uuid, p_medida integer, p_fecha date default current_date, p_tipo public.tipo_venta default 'menor')
returns numeric language sql stable security definer set search_path = public as $$
  select precio_docena from public.precios
   where producto_id = p_producto and medida_ml = p_medida and tipo_venta = p_tipo
     and (cliente_id = p_cliente or cliente_id is null)
     and vigente_desde <= p_fecha and (vigente_hasta is null or vigente_hasta >= p_fecha)
   order by (cliente_id is null), vigente_desde desc
   limit 1
$$;

-- Fija un precio nuevo desde una fecha. El anterior queda en el historial con fecha de cierre.
create function public.fijar_precio(p_cliente uuid, p_producto uuid, p_medida integer, p_precio numeric,
  p_desde date default current_date, p_nota text default null, p_tipo public.tipo_venta default 'menor')
returns uuid language plpgsql security definer set search_path = public as $$
declare actual public.precios; v_id uuid;
begin
  if auth.uid() is not null and not public.tiene_rol('socio','administrativo') then
    raise exception 'Solo socios y Administración cambian precios';
  end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio debe ser cero o mayor'; end if;
  select * into actual from public.precios
   where cliente_id is not distinct from p_cliente and producto_id = p_producto and medida_ml = p_medida
     and tipo_venta = p_tipo and vigente_hasta is null for update;
  if actual.id is not null then
    if p_desde < actual.vigente_desde then
      raise exception 'La fecha es anterior al precio vigente (desde %)', to_char(actual.vigente_desde, 'DD/MM/YYYY');
    elsif p_desde = actual.vigente_desde then
      update public.precios set precio_docena = p_precio, nota = coalesce(p_nota, nota), registrado_por = auth.uid(), creado = now()
       where id = actual.id;                                -- corrección el mismo día
      return actual.id;
    end if;
    update public.precios set vigente_hasta = p_desde - 1 where id = actual.id;
  end if;
  insert into public.precios (cliente_id, producto_id, medida_ml, tipo_venta, precio_docena, vigente_desde, nota, registrado_por)
  values (p_cliente, p_producto, p_medida, p_tipo, p_precio, p_desde, p_nota, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Quita el precio propio de un cliente: desde mañana paga el precio de lista
create function public.quitar_precio(p_precio uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.precios;
begin
  if auth.uid() is not null and not public.tiene_rol('socio','administrativo') then
    raise exception 'Solo socios y Administración cambian precios';
  end if;
  select * into pr from public.precios where id = p_precio and vigente_hasta is null;
  if pr.id is null then raise exception 'Ese precio ya no está vigente'; end if;
  if pr.vigente_desde >= current_date then delete from public.precios where id = pr.id;
  else update public.precios set vigente_hasta = current_date where id = pr.id; end if;
end $$;

-- Precio vigente de cada producto y medida para un cliente (el suyo o el de lista). Con null: solo la lista.
create function public.precios_vigentes(p_cliente uuid, p_fecha date default current_date)
returns table (producto_id uuid, medida_ml integer, precio_docena numeric, propio boolean, precio_id uuid, vigente_desde date, nota text)
language sql stable security invoker set search_path = public as $$
  select distinct on (producto_id, medida_ml) producto_id, medida_ml, precio_docena, cliente_id is not null, id, vigente_desde, nota
    from public.precios
   where tipo_venta = 'menor' and (cliente_id = p_cliente or cliente_id is null)
     and vigente_desde <= p_fecha and (vigente_hasta is null or vigente_hasta >= p_fecha)
   order by producto_id, medida_ml, (cliente_id is null), vigente_desde desc
$$;

alter table public.precios enable row level security;
create policy precios_ver on public.precios for select to authenticated
  using (public.tiene_rol('socio','administrativo','vendedor'));
-- Los precios solo se escriben con fijar_precio() y quitar_precio()

-- =====================================================================
-- El pedido toma el precio del cliente (o el de lista) al momento de registrarse
-- =====================================================================
create or replace function public.crear_pedido(pedido jsonb, items jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_cliente uuid := (pedido ->> 'cliente_id')::uuid; i jsonb; pr public.presentaciones; v_precio numeric; v_prod text;
begin
  if jsonb_array_length(items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  insert into public.pedidos (cliente_id, canal, condicion, dias_credito, entrega, agencia, fecha_entrega, notas)
  values (v_cliente, pedido ->> 'canal',
          coalesce(pedido ->> 'condicion', 'contado')::public.condicion_pago,
          (pedido ->> 'dias_credito')::integer,
          coalesce(pedido ->> 'entrega', 'local')::public.tipo_entrega,
          pedido ->> 'agencia', (pedido ->> 'fecha_entrega')::date, pedido ->> 'notas')
  returning id into v_id;
  for i in select * from jsonb_array_elements(items) loop
    select * into pr from public.presentaciones where id = (i ->> 'presentacion_id')::uuid;
    if not exists (select 1 from public.colores where id = (i ->> 'color_id')::uuid and producto_id = pr.producto_id) then
      raise exception 'El color elegido no corresponde al producto';
    end if;
    v_precio := public.precio_docena(v_cliente, pr.producto_id, pr.medida_ml);
    if v_precio is null then
      select nombre into v_prod from public.productos where id = pr.producto_id;
      raise exception 'No hay precio para % de % ml. Pide a Administración que lo registre.', v_prod, pr.medida_ml;
    end if;
    insert into public.pedido_items (pedido_id, producto_id, color_id, presentacion_id, bolsas, precio)
    values (v_id, pr.producto_id, (i ->> 'color_id')::uuid, pr.id, (i ->> 'bolsas')::integer, round(v_precio * pr.unidades / 12.0, 2));
  end loop;
  return v_id;
end $$;

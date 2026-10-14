-- Pinturas Liz · 0006 · Precio sugerido, medida habitual y novedades para socios y Administración
-- Ejecutar una sola vez, después de 0005. No borra precios, clientes ni pedidos.
--
-- Qué cambia:
--   1. Precio sugerido de cada producto y medida: el que más clientes pagan (la moda). También el máximo y el mínimo,
--      y la medida habitual de cada producto (la que más clientes compran). Guían al escribir un precio.
--   2. Ventas, Administración y socios registran el primer precio de un cliente sin pedir permiso.
--   3. Novedades: cuando alguien crea un cliente o registra o cambia un precio, socios y Administración
--      reciben un aviso en la campana. Solo informa; no hay que aprobar nada.

-- =====================================================================
-- 1. Precio sugerido (moda), máximo y mínimo: solo precios vigentes hoy, por docena
-- =====================================================================
create function public.precios_referencia()
returns table (producto_id uuid, medida_ml integer, comun numeric, maximo numeric, minimo numeric, clientes integer)
language sql stable security definer set search_path = public as $$
  select producto_id, medida_ml,
         mode() within group (order by precio_docena desc),   -- si hay empate, el más alto
         max(precio_docena), min(precio_docena), count(distinct cliente_id)::integer
    from public.precios
   where tipo_venta = 'menor' and cliente_id is not null
     and vigente_desde <= current_date and (vigente_hasta is null or vigente_hasta >= current_date)
   group by producto_id, medida_ml
$$;
revoke execute on function public.precios_referencia() from public, anon;
grant execute on function public.precios_referencia() to authenticated;

-- Medida habitual de cada producto: la que tiene más clientes con precio
create function public.medidas_habituales()
returns table (producto_id uuid, medida_ml integer, clientes integer)
language sql stable security definer set search_path = public as $$
  select distinct on (producto_id) producto_id, medida_ml, clientes
    from public.precios_referencia()
   order by producto_id, clientes desc, medida_ml
$$;
revoke execute on function public.medidas_habituales() from public, anon;
grant execute on function public.medidas_habituales() to authenticated;

-- =====================================================================
-- 2. Fijar precio: igual que en 0005, pero sin crear alerta (ahora llega como novedad)
--    · Primer precio de un cliente: socio, Administración o Ventas.
--    · Cambiar un precio que ya existe: socio o Administración.
--    · Medida que el producto no tiene: un socio la agrega primero.
-- =====================================================================
create or replace function public.fijar_precio(p_cliente uuid, p_producto uuid, p_medida integer, p_precio numeric,
  p_desde date default current_date, p_nota text default null, p_tipo public.tipo_venta default 'menor')
returns uuid language plpgsql security definer set search_path = public as $$
declare actual public.precios; v_id uuid;
begin
  if p_cliente is null then raise exception 'Elige el cliente: cada precio es de un cliente'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'El precio por docena debe ser mayor que cero'; end if;
  if not exists (select 1 from public.presentaciones where producto_id = p_producto and medida_ml = p_medida and activo) then
    raise exception 'El producto no tiene la medida de % ml. Un socio debe agregarla primero.', p_medida;
  end if;
  select * into actual from public.precios
   where cliente_id = p_cliente and producto_id = p_producto and medida_ml = p_medida
     and tipo_venta = p_tipo and vigente_hasta is null for update;

  if auth.uid() is not null then
    if actual.id is null and not public.tiene_rol('socio','administrativo','vendedor') then
      raise exception 'Tu perfil no registra precios';
    elsif actual.id is not null and not public.tiene_rol('socio','administrativo') then
      raise exception 'Este cliente ya tiene precio. Solo socios y Administración lo cambian.';
    end if;
  end if;

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

-- =====================================================================
-- 3. Novedades para socios y Administración (solo para enterarse; no piden aprobación)
--    Se registran solas cuando alguien crea un cliente o registra o cambia un precio desde la app.
-- =====================================================================
create table public.novedades (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('cliente_nuevo','precio_nuevo','precio_cambio')),
  titulo      text not null,
  detalle     text,
  cliente_id  uuid references public.clientes (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete cascade,
  medida_ml   integer,
  por         uuid references public.perfiles (id) on delete set null,
  creado      timestamptz not null default now()
);
create index on public.novedades (creado desc);
alter table public.novedades enable row level security;
create policy novedades_ver on public.novedades for select to authenticated
  using (public.tiene_rol('socio','administrativo'));
-- Nadie las escribe a mano: las crean los avisos de abajo

create function public.novedad_precio() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prod text; v_cli text; v_ant numeric;
begin
  if auth.uid() is null or new.cliente_id is null then return new; end if;   -- cargas desde el SQL Editor no avisan
  select nombre into v_prod from public.productos where id = new.producto_id;
  select nombre into v_cli from public.clientes where id = new.cliente_id;
  select precio_docena into v_ant from public.precios
   where cliente_id = new.cliente_id and producto_id = new.producto_id and medida_ml = new.medida_ml
     and tipo_venta = new.tipo_venta and id <> new.id and vigente_hasta is not null
   order by vigente_hasta desc limit 1;
  if tg_op = 'UPDATE' then v_ant := old.precio_docena; end if;               -- corrección del mismo día
  insert into public.novedades (tipo, titulo, detalle, cliente_id, producto_id, medida_ml, por)
  values (case when v_ant is null then 'precio_nuevo' else 'precio_cambio' end,
          v_cli || ': ' || v_prod || ' ' || new.medida_ml || ' ml a S/ ' || to_char(new.precio_docena, 'FM999990.00') || ' la docena',
          case when v_ant is null then 'Precio nuevo' else 'Antes S/ ' || to_char(v_ant, 'FM999990.00') end
          || case when new.vigente_desde > current_date then ', rige desde el ' || to_char(new.vigente_desde, 'DD/MM/YYYY') else '' end
          || coalesce('. ' || new.nota, '') || '.',
          new.cliente_id, new.producto_id, new.medida_ml, auth.uid());
  return new;
end $$;
create trigger precios_novedad after insert on public.precios for each row execute function public.novedad_precio();
create trigger precios_novedad_correccion after update of precio_docena on public.precios
  for each row when (old.precio_docena is distinct from new.precio_docena and new.vigente_hasta is null)
  execute function public.novedad_precio();

-- Cliente nuevo: antes era una alerta; ahora es una novedad que dice qué datos le faltan
drop trigger if exists clientes_avisar_nuevo on public.clientes;
drop function if exists public.avisar_cliente_nuevo();
create function public.novedad_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare faltan text[] := '{}';
begin
  if auth.uid() is null then return new; end if;
  if new.telefono is null then faltan := faltan || 'teléfono'::text; end if;
  if new.documento is null then faltan := faltan || 'DNI o RUC'::text; end if;
  if new.direccion is null then faltan := faltan || 'dirección'::text; end if;
  insert into public.novedades (tipo, titulo, detalle, cliente_id, por)
  values ('cliente_nuevo', 'Cliente nuevo: ' || new.nombre || ' (' || new.codigo || ')',
          coalesce('Vendedor: ' || (select nombre from public.vendedores where codigo = new.vendedor_codigo) || '. ', '')
          || case when cardinality(faltan) > 0 then 'Faltan: ' || array_to_string(faltan, ', ') || '.' else 'Datos completos.' end,
          new.id, auth.uid());
  return new;
end $$;
create trigger clientes_novedad after insert on public.clientes for each row execute function public.novedad_cliente();

-- Las alertas abiertas de "precio escrito a mano" y "cliente nuevo" pasan a ser novedades
insert into public.alerta_comentarios (alerta_id, autor, texto)
select id, null, 'Cerrada sola: desde la versión 0.4.2 los precios y clientes nuevos se ven en Novedades.'
  from public.alertas where tipo in ('precio_manual','cliente_nuevo') and estado = 'abierta';
update public.alertas set estado = 'resuelta', resuelta_en = now() where tipo in ('precio_manual','cliente_nuevo') and estado = 'abierta';

-- Las novedades llegan en vivo a la campana
alter publication supabase_realtime add table public.novedades;

-- Pinturas Liz · 0008 · Pedidos por unidades o docenas, revisión, modificación, adelantos (versión 0.6.0)
-- Ejecutar una sola vez, DESPUÉS de 0007. No borra pedidos: los convierte.
--
-- Qué cambia:
--   1. Cada línea del pedido guarda FRASCOS (unidades). Pedir 2 docenas = 24 frascos.
--      El importe = precio por docena × frascos ÷ 12. El Taller junta en bolsas: 12 frascos hasta 120 ml, 6 en 250 ml.
--      El almacén de producto envasado pasa a contar frascos.
--   2. Fecha de vencimiento del crédito escrita a mano (además de 7, 15 y 30 días).
--   3. Modificar un pedido antes del Taller: socios y Administración; quien lo registró, mientras esté Recibido
--      o cuando se lo devuelvan a revisión.
--   4. Estado "En revisión" con motivo y alerta de alta prioridad para quien debe corregir.
--      El Taller también puede pedir revisión: primero pasa a Administración.
--   5. Cobros: contado y crédito se cobran al estar Entregado; el adelanto, desde que el pedido pasa al Taller.

-- =====================================================================
-- 1. Bolsas de 6 para 250 ml y almacén de producto envasado en frascos
-- =====================================================================
-- El almacén de envasado contaba bolsas: se convierten a frascos con el tamaño de bolsa ACTUAL
update public.movimientos m set cantidad = m.cantidad * pr.unidades
  from public.articulos a join public.presentaciones pr on pr.id = a.presentacion_id
 where m.articulo_id = a.id and m.almacen = 'envasado' and a.tipo = 'envasado';
update public.stock_minimos s set minimo = s.minimo * pr.unidades
  from public.articulos a join public.presentaciones pr on pr.id = a.presentacion_id
 where s.articulo_id = a.id and a.tipo = 'envasado';
update public.articulos set unidad = 'frasco', nombre = regexp_replace(nombre, ' x\d+$', '') where tipo = 'envasado';

-- Las presentaciones de 250 ml se juntan en bolsas de 6 (las demás siguen en 12)
update public.presentaciones x set unidades = 6
 where medida_ml = 250 and unidades = 12
   and not exists (select 1 from public.presentaciones y where y.producto_id = x.producto_id and y.medida_ml = 250 and y.unidades = 6);
comment on column public.presentaciones.unidades is 'Frascos por bolsa al envasar: 12 hasta 120 ml, 6 en 250 ml';

create or replace function public.articulo_envasado(p_color uuid, p_presentacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.articulos where tipo = 'envasado' and color_id = p_color and presentacion_id = p_presentacion;
  if v is null then
    insert into public.articulos (tipo, nombre, unidad, color_id, presentacion_id)
    select 'envasado', p.nombre || ' · ' || c.nombre || ' · ' || pr.medida_ml || ' ml', 'frasco', c.id, pr.id
      from public.colores c join public.productos p on p.id = c.producto_id
      join public.presentaciones pr on pr.id = p_presentacion and pr.producto_id = p.id
     where c.id = p_color
    on conflict do nothing;
    select id into v from public.articulos where tipo = 'envasado' and color_id = p_color and presentacion_id = p_presentacion;
  end if;
  if v is null then raise exception 'La presentación no corresponde al producto de ese color'; end if;
  return v;
end $$;

-- El Taller sigue registrando bolsas llenas; al almacén entran sus frascos
create or replace function public.registrar_envasado(p_color uuid, p_presentacion uuid, p_bolsas integer, p_lote uuid, p_notas text)
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
    ('envasado', public.articulo_envasado(p_color, p_presentacion), p_bolsas * pr.unidades, 'envasado', v_ref, auth.uid());
  for mat in select articulo_id, por_bolsa from public.presentacion_materiales where presentacion_id = p_presentacion loop
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por)
    values ('materiales', mat.articulo_id, -(mat.por_bolsa * p_bolsas), 'consumo_envasado', v_ref, auth.uid());
  end loop;
  return v_id;
end $$;

-- =====================================================================
-- 2. Líneas del pedido en frascos, con su precio por docena e importe
-- =====================================================================
alter table public.pedido_items
  add column frascos       integer,
  add column precio_docena numeric(10,2),
  add column importe       numeric(12,2);
update public.pedido_items i
   set frascos = i.bolsas * pr.unidades,
       precio_docena = round(i.precio * 12.0 / pr.unidades, 2),
       importe = i.bolsas * i.precio
  from public.presentaciones pr where pr.id = i.presentacion_id;
alter table public.pedido_items
  alter column frascos set not null, add constraint items_frascos_positivo check (frascos > 0),
  alter column precio_docena set not null,
  alter column importe set not null,
  alter column bolsas drop not null,
  alter column precio drop not null;
comment on column public.pedido_items.bolsas is 'Sin uso desde 0.6.0: ver frascos';
comment on column public.pedido_items.precio is 'Sin uso desde 0.6.0: ver precio_docena e importe';

create or replace function public.recalcular_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set total = coalesce((select sum(importe) from public.pedido_items where pedido_id = v_pedido), 0)
   where id = v_pedido;
  return null;
end $$;

-- =====================================================================
-- 3. Pedido: vencimiento manual, revisión e historial con notas
-- =====================================================================
alter table public.pedidos
  add column fecha_vence     date,
  add column revision_motivo text,
  add column revision_para   text check (revision_para in ('creador','administracion')),
  add column revision_por    uuid references public.perfiles (id),
  add column revision_en     timestamptz;
alter table public.pedido_historial add column nota text;

-- Agrega una línea al pedido con su precio. p_previo: precio por docena que ya tenía el pedido (al modificar).
create function public.agregar_item(p_pedido uuid, p_cliente uuid, i jsonb, p_previo numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.presentaciones; v_frascos integer; v_precio numeric; v_manual numeric; v_prod text;
begin
  select * into pr from public.presentaciones where id = (i ->> 'presentacion_id')::uuid;
  if pr.id is null then raise exception 'Presentación no encontrada'; end if;
  if not exists (select 1 from public.colores where id = (i ->> 'color_id')::uuid and producto_id = pr.producto_id) then
    raise exception 'El color elegido no corresponde al producto';
  end if;
  v_frascos := coalesce((i ->> 'frascos')::integer, (i ->> 'bolsas')::integer * pr.unidades);
  if coalesce(v_frascos, 0) <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  v_precio := coalesce(p_previo, public.precio_docena(p_cliente, pr.producto_id, pr.medida_ml));
  if v_precio is null then
    v_manual := nullif(i ->> 'precio_docena', '')::numeric;
    select nombre into v_prod from public.productos where id = pr.producto_id;
    if v_manual is null then
      raise exception 'El cliente no tiene precio para % de % ml. Escríbelo en el producto.', v_prod, pr.medida_ml;
    end if;
    perform public.fijar_precio(p_cliente, pr.producto_id, pr.medida_ml, v_manual, current_date, 'Escrito a mano al registrar un pedido');
    v_precio := v_manual;
  end if;
  insert into public.pedido_items (pedido_id, producto_id, color_id, presentacion_id, frascos, precio_docena, importe)
  values (p_pedido, pr.producto_id, (i ->> 'color_id')::uuid, pr.id, v_frascos, v_precio, round(v_precio * v_frascos / 12.0, 2));
end $$;
revoke execute on function public.agregar_item(uuid, uuid, jsonb, numeric) from public, anon, authenticated;

create or replace function public.crear_pedido(pedido jsonb, items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cliente uuid := (pedido ->> 'cliente_id')::uuid; i jsonb;
begin
  if not public.tiene_rol('socio','administrativo','vendedor') then raise exception 'Tu perfil no registra pedidos'; end if;
  if v_cliente is null then raise exception 'Elige el cliente del pedido'; end if;
  if jsonb_array_length(items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  insert into public.pedidos (creado_por, cliente_id, canal, condicion, dias_credito, fecha_vence, entrega, agencia, fecha_entrega, notas)
  values (auth.uid(), v_cliente, pedido ->> 'canal',
          coalesce(pedido ->> 'condicion', 'contado')::public.condicion_pago,
          (pedido ->> 'dias_credito')::integer, (pedido ->> 'fecha_vence')::date,
          coalesce(pedido ->> 'entrega', 'local')::public.tipo_entrega,
          pedido ->> 'agencia', (pedido ->> 'fecha_entrega')::date, pedido ->> 'notas')
  returning id into v_id;
  for i in select * from jsonb_array_elements(items) loop
    perform public.agregar_item(v_id, v_cliente, i);
  end loop;
  return v_id;
end $$;

-- Quién puede modificar el pedido ahora
create function public.puede_modificar(p public.pedidos) returns boolean
language sql stable security definer set search_path = public as $$
  select p.estado in ('recibido','en_revision') and (
         public.tiene_rol('socio','administrativo')
      or (p.creado_por = auth.uid() and (p.estado = 'recibido' or p.revision_para = 'creador')))
$$;

-- Modifica un pedido: datos y líneas. Las líneas que siguen conservan su precio; el cambio queda en el seguimiento.
create function public.editar_pedido(p_pedido uuid, pedido jsonb, items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pedidos; v_cliente uuid := (pedido ->> 'cliente_id')::uuid; i jsonb; v_previo numeric;
        v_cambios text[] := '{}'; r record; v_mismo boolean;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'El pedido no existe'; end if;
  if not public.puede_modificar(p) then
    raise exception 'Este pedido ya no se puede modificar (está %)', replace(p.estado::text, '_', ' ');
  end if;
  if v_cliente is null then raise exception 'Elige el cliente del pedido'; end if;
  if jsonb_array_length(items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  v_mismo := v_cliente = p.cliente_id;
  if not v_mismo then
    v_cambios := v_cambios || ('Cliente: ' || (select nombre from public.clientes where id = p.cliente_id)
                               || ' → ' || (select nombre from public.clientes where id = v_cliente));
  end if;

  -- Antes y después, por color y presentación, para el seguimiento
  create temp table _antes on commit drop as
    select color_id, presentacion_id, frascos, precio_docena from public.pedido_items where pedido_id = p_pedido;
  create temp table _despues (color_id uuid, presentacion_id uuid, frascos integer) on commit drop;
  insert into _despues
    select (x ->> 'color_id')::uuid, (x ->> 'presentacion_id')::uuid,
           coalesce((x ->> 'frascos')::integer, (x ->> 'bolsas')::integer * (select unidades from public.presentaciones where id = (x ->> 'presentacion_id')::uuid))
      from jsonb_array_elements(items) x;

  update public.pedidos set cliente_id = v_cliente, canal = pedido ->> 'canal',
         condicion = coalesce(pedido ->> 'condicion', 'contado')::public.condicion_pago,
         dias_credito = (pedido ->> 'dias_credito')::integer, fecha_vence = (pedido ->> 'fecha_vence')::date,
         entrega = coalesce(pedido ->> 'entrega', 'local')::public.tipo_entrega, agencia = pedido ->> 'agencia',
         fecha_entrega = (pedido ->> 'fecha_entrega')::date, notas = pedido ->> 'notas'
   where id = p_pedido;
  delete from public.pedido_items where pedido_id = p_pedido;
  for i in select * from jsonb_array_elements(items) loop
    -- Se conserva el precio que el pedido ya tenía para esa presentación (si el cliente no cambió)
    v_previo := case when v_mismo then (select max(precio_docena) from _antes where presentacion_id = (i ->> 'presentacion_id')::uuid) end;
    perform public.agregar_item(p_pedido, v_cliente, i, v_previo);
  end loop;

  for r in
    select coalesce(a.color_id, d.color_id) as color_id, coalesce(a.presentacion_id, d.presentacion_id) as presentacion_id,
           coalesce(a.frascos, 0) as antes, coalesce(d.frascos, 0) as despues
      from (select color_id, presentacion_id, sum(frascos) frascos from _antes group by 1, 2) a
      full join (select color_id, presentacion_id, sum(frascos) frascos from _despues group by 1, 2) d
        on d.color_id = a.color_id and d.presentacion_id = a.presentacion_id
  loop
    if r.antes <> r.despues then
      v_cambios := v_cambios || ((select pr.nombre || ' ' || c.nombre || ' ' || x.medida_ml || ' ml'
                                    from public.colores c join public.productos pr on pr.id = c.producto_id, public.presentaciones x
                                   where c.id = r.color_id and x.id = r.presentacion_id)
                    || ': ' || case when r.antes = 0 then 'nuevo, ' || r.despues || ' u'
                                    when r.despues = 0 then 'quitado'
                                    else r.antes || ' → ' || r.despues || ' u' end);
    end if;
  end loop;
  insert into public.pedido_historial (pedido_id, estado, por, nota)
  values (p_pedido, p.estado, auth.uid(),
          'Modificado' || case when cardinality(v_cambios) > 0 then ': ' || array_to_string(v_cambios, '; ') else ' (datos del pedido)' end);
end $$;

-- =====================================================================
-- 4. Estados: reglas con la revisión
-- =====================================================================
create or replace function public.controlar_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_app := public.rol_actual(); v_flujo boolean := coalesce(current_setting('pinturas.revision', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_historial (pedido_id, estado, por) values (new.id, new.estado, auth.uid());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_revision' or (old.estado = 'en_revision' and new.estado = 'recibido' and v_rol not in ('socio','administrativo')) then
      if not v_flujo then raise exception 'Usa el botón "Enviar a revisión" o "Corregido, reenviar"'; end if;
    elsif not (
         v_rol = 'socio'
      or (old.estado in ('recibido','en_revision') and new.estado = 'en_taller' and v_rol = 'administrativo')
      or (old.estado = 'en_revision' and new.estado = 'recibido' and v_rol = 'administrativo')
      or (old.estado = 'en_taller'  and new.estado = 'listo'      and v_rol = 'taller')
      or (old.estado = 'listo'      and new.estado = 'despachado' and v_rol in ('taller','despacho'))
      or (old.estado = 'despachado' and new.estado = 'entregado'  and v_rol in ('administrativo','despacho'))
      or (old.estado in ('recibido','en_revision','en_taller') and new.estado = 'anulado' and v_rol = 'administrativo')
    ) then
      raise exception 'Tu perfil no puede pasar un pedido de % a %', replace(old.estado::text, '_', ' '), replace(new.estado::text, '_', ' ');
    end if;
    if old.estado = 'en_revision' then
      new.revision_motivo := null; new.revision_para := null; new.revision_por := null; new.revision_en := null;
    end if;
    insert into public.pedido_historial (pedido_id, estado, por, nota)
    values (new.id, new.estado, auth.uid(), nullif(current_setting('pinturas.nota', true), ''));
  end if;
  return new;
end $$;

-- Alertas: ahora pueden ir dirigidas a una persona o a un perfil, con prioridad y pedido
alter table public.alertas
  add column prioridad text not null default 'normal' check (prioridad in ('normal','alta')),
  add column para      uuid references public.perfiles (id) on delete cascade,
  add column para_rol  text,
  add column pedido_id uuid references public.pedidos (id) on delete cascade;
create index on public.alertas (pedido_id) where estado = 'abierta';
drop policy alertas_ver on public.alertas;
create policy alertas_ver on public.alertas for select to authenticated
  using (public.tiene_rol('socio') or creado_por = auth.uid() or para = auth.uid()
         or (para_rol is not null and public.rol_actual()::text = para_rol));

-- Cierra las alertas abiertas de un pedido, con un comentario
create function public.cerrar_alertas_pedido(p_pedido uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from public.alertas where pedido_id = p_pedido and estado = 'abierta' loop
    update public.alertas set estado = 'resuelta', resuelta_por = auth.uid(), resuelta_en = now() where id = a.id;
    insert into public.alerta_comentarios (alerta_id, autor, texto) values (a.id, auth.uid(), p_texto);
  end loop;
end $$;
revoke execute on function public.cerrar_alertas_pedido(uuid, text) from public, anon, authenticated;

-- Al salir de revisión o pasar al Taller, las alertas del pedido se cierran solas
create function public.alertas_al_cambiar_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado and new.estado in ('en_taller','anulado') then
    perform public.cerrar_alertas_pedido(new.id, 'Cerrada sola: el pedido pasó a ' || replace(new.estado::text, '_', ' ') || '.');
  end if;
  return null;
end $$;
create trigger pedidos_cerrar_alertas after update on public.pedidos
  for each row execute function public.alertas_al_cambiar_pedido();

-- Enviar a revisión con motivo.
--   Recibido → En revisión: socio o Administración; corrige quien lo registró.
--   En taller → En revisión: el Taller la pide y la ve primero Administración; socio o Administración la envían a quien lo registró.
--   En revisión (en Administración) → devolver a quien lo registró: socio o Administración.
create function public.enviar_revision(p_pedido uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pedidos; v_para text; v_quien text; v_cod text; v_admin boolean := public.tiene_rol('socio','administrativo');
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo de la revisión'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'El pedido no existe'; end if;
  if p.estado = 'recibido' and v_admin then v_para := 'creador';
  elsif p.estado = 'en_taller' and public.tiene_rol('taller','despacho') then v_para := 'administracion';
  elsif p.estado = 'en_taller' and v_admin then v_para := 'creador';
  elsif p.estado = 'en_revision' and p.revision_para = 'administracion' and v_admin then v_para := 'creador';
  else raise exception 'Tu perfil no puede enviar a revisión este pedido';
  end if;
  select nombre into v_quien from public.perfiles where id = auth.uid();
  v_cod := 'P-' || lpad(p.numero::text, 5, '0');

  perform set_config('pinturas.revision', 'si', true);
  perform set_config('pinturas.nota', 'Motivo: ' || trim(p_motivo) || case when v_para = 'administracion' then ' (para Administración)' else '' end, true);
  if p.estado = 'en_revision' then
    insert into public.pedido_historial (pedido_id, estado, por, nota)
    values (p.id, p.estado, auth.uid(), 'Devuelto a quien lo registró. Motivo: ' || trim(p_motivo));
  end if;
  update public.pedidos set estado = 'en_revision', revision_motivo = trim(p_motivo), revision_para = v_para,
         revision_por = auth.uid(), revision_en = now() where id = p.id;
  perform set_config('pinturas.revision', '', true); perform set_config('pinturas.nota', '', true);

  perform public.cerrar_alertas_pedido(p.id, 'Reemplazada por una nueva revisión.');
  insert into public.alertas (tipo, titulo, detalle, cliente_id, pedido_id, origen, prioridad, para, para_rol, creado_por)
  values ('pedido_revision',
          v_cod || ' necesita revisión' || case when v_para = 'administracion' then ' (lo pide el Taller)' else '' end,
          trim(p_motivo) || ' — ' || coalesce(v_quien, '') ,
          p.cliente_id, p.id, 'sistema', 'alta',
          case when v_para = 'creador' then p.creado_por end,
          case when v_para = 'administracion' then 'administrativo' end,
          auth.uid());
end $$;

-- Quien debía corregir lo reenvía: vuelve a Recibido y Administración lo ve para enviarlo al Taller.
create function public.reenviar_pedido(p_pedido uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pedidos; v_quien text;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if p.id is null or p.estado <> 'en_revision' then raise exception 'El pedido no está en revisión'; end if;
  if not (public.tiene_rol('socio','administrativo') or (p.creado_por = auth.uid() and p.revision_para = 'creador')) then
    raise exception 'Este pedido lo debe corregir otra persona';
  end if;
  select nombre into v_quien from public.perfiles where id = auth.uid();
  perform set_config('pinturas.revision', 'si', true);
  perform set_config('pinturas.nota', 'Corregido' || coalesce(': ' || nullif(trim(p_nota), ''), ''), true);
  update public.pedidos set estado = 'recibido' where id = p.id;
  perform set_config('pinturas.revision', '', true); perform set_config('pinturas.nota', '', true);
  perform public.cerrar_alertas_pedido(p.id, 'Corregido por ' || coalesce(v_quien, '—') || coalesce('. ' || nullif(trim(p_nota), ''), '') || '.');
  insert into public.alertas (tipo, titulo, detalle, cliente_id, pedido_id, origen, prioridad, para_rol, creado_por)
  values ('pedido_corregido', 'P-' || lpad(p.numero::text, 5, '0') || ' corregido: listo para el Taller',
          coalesce(v_quien, '—') || ' lo corrigió' || coalesce(': ' || nullif(trim(p_nota), ''), '') || '.',
          p.cliente_id, p.id, 'sistema', 'normal', 'administrativo', auth.uid());
end $$;

-- =====================================================================
-- 5. Cobros: cuándo se puede cobrar según la forma de pago
-- =====================================================================
create or replace function public.controlar_cobro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_cobrado numeric; v_estado public.estado_pedido; v_cond public.condicion_pago;
begin
  if tg_op = 'INSERT' then
    select total, estado, condicion into v_total, v_estado, v_cond from public.pedidos where id = new.pedido_id;
    if v_estado = 'anulado' then raise exception 'El pedido está anulado'; end if;
    if v_cond = 'adelanto' and v_estado in ('recibido','en_revision') then
      raise exception 'El adelanto se registra cuando el pedido pasa al Taller';
    elsif v_cond <> 'adelanto' and v_estado <> 'entregado' then
      raise exception 'Este pedido se cobra al entregarlo: primero márcalo como Entregado';
    end if;
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

create or replace view public.saldos_pedidos with (security_invoker = true) as
select p.id as pedido_id, p.numero, p.cliente_id, c.nombre as cliente, c.limite_credito, p.creado_por,
       pf.nombre as vendedor, p.estado, p.condicion, p.fecha_entrega,
       coalesce(p.fecha_vence, p.fecha_entrega + coalesce(p.dias_credito, 0)) as vence,
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
-- 6. Taller: pendiente en frascos; las bolsas se calculan con su tamaño (12 o 6)
-- =====================================================================
create or replace function public.descontar_pedido_listo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'listo' and old.estado is distinct from 'listo' then
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, pedido_id, por)
    select 'envasado', public.articulo_envasado(i.color_id, i.presentacion_id), -sum(i.frascos), 'pedido',
           'P-' || lpad(new.numero::text, 5, '0'), new.id, auth.uid()
      from public.pedido_items i where i.pedido_id = new.id
     group by i.color_id, i.presentacion_id;
  end if;
  return null;
end $$;

drop view public.por_envasar;
create view public.por_envasar with (security_invoker = true) as
with pendiente as (
  select i.color_id, i.presentacion_id, sum(i.frascos) as frascos, count(distinct i.pedido_id) as pedidos
    from public.pedido_items i
    join public.pedidos p on p.id = i.pedido_id and p.estado in ('recibido','en_taller')
   group by i.color_id, i.presentacion_id
), env as (
  select color_id, presentacion_id, existencia from public.stock where almacen = 'envasado'
), gra as (
  select color_id, existencia from public.stock where almacen = 'granel_taller'
)
select pe.color_id, pe.presentacion_id, pr.nombre as producto, c.nombre as color, c.hex,
       x.medida_ml, x.unidades, pe.frascos, pe.pedidos,
       coalesce(env.existencia, 0) as envasado_disponible,
       greatest(pe.frascos - coalesce(env.existencia, 0), 0) as faltan_frascos,
       ceil(greatest(pe.frascos - coalesce(env.existencia, 0), 0) / x.unidades::numeric)::integer as faltan_bolsas,
       round(ceil(greatest(pe.frascos - coalesce(env.existencia, 0), 0) / x.unidades::numeric) * x.unidades * x.medida_ml / 1000.0, 3) as litros_necesarios,
       coalesce(gra.existencia, 0) as granel_disponible
  from pendiente pe
  join public.colores c on c.id = pe.color_id
  join public.productos pr on pr.id = c.producto_id
  join public.presentaciones x on x.id = pe.presentacion_id
  left join env on env.color_id = pe.color_id and env.presentacion_id = pe.presentacion_id
  left join gra on gra.color_id = pe.color_id;

drop view if exists public.consolidado_pendiente;
create view public.consolidado_pendiente with (security_invoker = true) as
select p.nombre as producto, c.nombre as color, c.hex, pr.medida_ml, pr.unidades,
       sum(i.frascos) as frascos, count(distinct i.pedido_id) as pedidos
  from public.pedido_items i
  join public.pedidos pe on pe.id = i.pedido_id and pe.estado in ('recibido','en_taller')
  join public.productos p on p.id = i.producto_id
  join public.colores c on c.id = i.color_id
  join public.presentaciones pr on pr.id = i.presentacion_id
 group by p.nombre, c.nombre, c.hex, pr.medida_ml, pr.unidades;

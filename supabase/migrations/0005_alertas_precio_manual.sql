-- Pinturas Liz · 0005 · Alertas para socios, precio manual y licencia de socio para medidas nuevas
-- Ejecutar una sola vez, después de 0004. Luego: datos/01_limpiar_pruebas.sql y datos/02_carga_metadatos.sql.
--
-- Qué cambia:
--   1. Alertas: los datos faltantes o con error quedan como avisos con comentarios para los socios.
--   2. Ya no hay precios de lista. Cada precio es de un cliente.
--   3. Si el cliente no tiene precio para un producto (o es nuevo), quien registra el pedido
--      escribe el precio a mano. Queda como precio propio del cliente y avisa a los socios.
--   4. Solo un socio agrega medidas nuevas (por ejemplo, el primer precio de Pegatransfer).

-- =====================================================================
-- 1. Alertas con comentarios
-- =====================================================================
create table public.alertas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,          -- precio_faltante, precio_revisar, producto_sin_precio, producto_incompleto,
                                      -- cliente_incompleto, cliente_nuevo, precio_manual, dato_excel, aviso
  titulo      text not null,
  detalle     text,
  cliente_id  uuid references public.clientes (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete cascade,
  medida_ml   integer,
  origen      text not null default 'usuario' check (origen in ('carga','sistema','usuario')),
  estado      text not null default 'abierta' check (estado in ('abierta','resuelta')),
  creado_por  uuid default auth.uid() references public.perfiles (id) on delete set null,
  creado      timestamptz not null default now(),
  resuelta_por uuid references public.perfiles (id) on delete set null,
  resuelta_en timestamptz
);
create index on public.alertas (estado, creado desc);
create index on public.alertas (cliente_id, producto_id, medida_ml) where estado = 'abierta';

create table public.alerta_comentarios (
  id        uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas (id) on delete cascade,
  autor     uuid default auth.uid() references public.perfiles (id) on delete set null,
  texto     text not null check (length(trim(texto)) > 0),
  creado    timestamptz not null default now()
);
create index on public.alerta_comentarios (alerta_id, creado);

alter table public.alertas enable row level security;
alter table public.alerta_comentarios enable row level security;

-- Los socios ven todas; cada persona ve las que ella misma reportó.
create policy alertas_ver on public.alertas for select to authenticated
  using (public.tiene_rol('socio') or creado_por = auth.uid());
-- Cualquier perfil activo puede avisar un dato faltante o errado.
create policy alertas_crear on public.alertas for insert to authenticated
  with check (public.rol_actual() <> 'pendiente' and creado_por = auth.uid() and origen = 'usuario' and estado = 'abierta');
-- Resolver o reabrir: solo con resolver_alerta() (socios)

create policy comentarios_ver on public.alerta_comentarios for select to authenticated
  using (exists (select 1 from public.alertas a where a.id = alerta_id));          -- las reglas de alertas filtran
create policy comentarios_crear on public.alerta_comentarios for insert to authenticated
  with check (autor = auth.uid() and exists (select 1 from public.alertas a where a.id = alerta_id));

-- Crea una alerta desde las reglas del sistema (sin depender de quién esté conectado)
create function public.alertar(p_tipo text, p_titulo text, p_detalle text, p_cliente uuid default null,
  p_producto uuid default null, p_medida integer default null) returns uuid
language sql security definer set search_path = public as $$
  insert into public.alertas (tipo, titulo, detalle, cliente_id, producto_id, medida_ml, origen, creado_por)
  values (p_tipo, p_titulo, p_detalle, p_cliente, p_producto, p_medida, 'sistema', auth.uid()) returning id
$$;
revoke execute on function public.alertar(text, text, text, uuid, uuid, integer) from public, anon, authenticated;

-- Marcar resuelta (o reabrir) con un comentario opcional. Solo socios.
create function public.resolver_alerta(p_alerta uuid, p_resuelta boolean default true, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_rol('socio') then raise exception 'Solo un socio resuelve alertas'; end if;
  update public.alertas set estado = case when p_resuelta then 'resuelta' else 'abierta' end,
         resuelta_por = case when p_resuelta then auth.uid() end, resuelta_en = case when p_resuelta then now() end
   where id = p_alerta;
  if not found then raise exception 'La alerta no existe'; end if;
  if nullif(trim(p_comentario), '') is not null then
    insert into public.alerta_comentarios (alerta_id, autor, texto) values (p_alerta, auth.uid(), trim(p_comentario));
  end if;
end $$;

-- =====================================================================
-- 2. Sin precios de lista: el precio es siempre del cliente
-- =====================================================================
delete from public.precios where cliente_id is null;
alter table public.precios add constraint precios_de_cliente check (cliente_id is not null) not valid;
alter table public.precios validate constraint precios_de_cliente;

create or replace function public.precio_docena(p_cliente uuid, p_producto uuid, p_medida integer, p_fecha date default current_date, p_tipo public.tipo_venta default 'menor')
returns numeric language sql stable security definer set search_path = public as $$
  select precio_docena from public.precios
   where cliente_id = p_cliente and producto_id = p_producto and medida_ml = p_medida and tipo_venta = p_tipo
     and vigente_desde <= p_fecha and (vigente_hasta is null or vigente_hasta >= p_fecha)
   order by vigente_desde desc
   limit 1
$$;

create or replace function public.precios_vigentes(p_cliente uuid, p_fecha date default current_date)
returns table (producto_id uuid, medida_ml integer, precio_docena numeric, propio boolean, precio_id uuid, vigente_desde date, nota text)
language sql stable security invoker set search_path = public as $$
  select distinct on (producto_id, medida_ml) producto_id, medida_ml, precio_docena, true, id, vigente_desde, nota
    from public.precios
   where tipo_venta = 'menor' and cliente_id = p_cliente
     and vigente_desde <= p_fecha and (vigente_hasta is null or vigente_hasta >= p_fecha)
   order by producto_id, medida_ml, vigente_desde desc
$$;

-- =====================================================================
-- 3. Medidas nuevas: solo socios (licencia de socio)
-- =====================================================================
drop policy presentaciones_editar on public.presentaciones;
create policy presentaciones_editar on public.presentaciones for all to authenticated
  using (public.tiene_rol('socio')) with check (public.tiene_rol('socio'));

create function public.crear_presentacion(p_producto uuid, p_medida integer, p_unidades integer default 12)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null and not public.tiene_rol('socio') then
    raise exception 'Solo un socio agrega medidas nuevas a un producto';
  end if;
  if p_medida is null or p_medida <= 0 then raise exception 'La medida debe ser mayor que cero'; end if;
  if coalesce(p_unidades, 0) <= 0 then raise exception 'Los frascos por paquete deben ser mayor que cero'; end if;
  select id into v_id from public.presentaciones where producto_id = p_producto and medida_ml = p_medida and unidades = p_unidades;
  if v_id is not null then
    update public.presentaciones set activo = true where id = v_id;
    return v_id;
  end if;
  insert into public.presentaciones (producto_id, medida_ml, unidades, precio) values (p_producto, p_medida, p_unidades, 0) returning id into v_id;
  -- Si el producto no tenía colores, se le da "Único" para que se pueda vender
  insert into public.colores (producto_id, nombre, hex)
  select p_producto, 'Único', '#D9DCE3' where not exists (select 1 from public.colores where producto_id = p_producto);
  return v_id;
end $$;

-- =====================================================================
-- 4. Fijar precio: quién puede hacer qué
--    · Primer precio de un cliente para una medida existente: socio, Administración o vendedor.
--      Si no lo registra un socio, se avisa a los socios para que lo revisen.
--    · Cambiar un precio que ya existe: socio o Administración.
--    · Medida que el producto aún no tiene: antes un socio debe agregarla (crear_presentacion).
-- =====================================================================
drop function if exists public.fijar_precio(uuid, uuid, integer, numeric, date, text, public.tipo_venta);
create function public.fijar_precio(p_cliente uuid, p_producto uuid, p_medida integer, p_precio numeric,
  p_desde date default current_date, p_nota text default null, p_tipo public.tipo_venta default 'menor')
returns uuid language plpgsql security definer set search_path = public as $$
declare actual public.precios; v_id uuid; v_prod text; v_cli text; v_quien text;
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

  -- Precio nuevo puesto por alguien que no es socio: aviso para revisar
  if actual.id is null and auth.uid() is not null and not public.tiene_rol('socio') then
    select nombre into v_prod from public.productos where id = p_producto;
    select nombre into v_cli from public.clientes where id = p_cliente;
    select nombre into v_quien from public.perfiles where id = auth.uid();
    perform public.alertar('precio_manual', 'Precio nuevo: ' || v_prod || ' ' || p_medida || ' ml',
      v_quien || ' registró S/ ' || to_char(p_precio, 'FM999990.00') || ' la docena para ' || v_cli
      || coalesce(' (' || p_nota || ')', '') || '. Revisa que sea correcto.', p_cliente, p_producto, p_medida);
  end if;
  return v_id;
end $$;

-- Quitar el precio de un cliente: desde mañana ese producto pide precio a mano
create or replace function public.quitar_precio(p_precio uuid) returns void
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

-- Al registrar un precio, se cierran solas las alertas de ese precio faltante
create function public.cerrar_alertas_de_precio() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from public.alertas
            where estado = 'abierta' and (
              (tipo = 'precio_faltante' and cliente_id = new.cliente_id and producto_id = new.producto_id and medida_ml = new.medida_ml)
              or (tipo = 'producto_sin_precio' and producto_id = new.producto_id)) loop
    update public.alertas set estado = 'resuelta', resuelta_por = auth.uid(), resuelta_en = now() where id = a.id;
    insert into public.alerta_comentarios (alerta_id, autor, texto)
    values (a.id, auth.uid(), 'Resuelta sola: se registró S/ ' || to_char(new.precio_docena, 'FM999990.00') || ' la docena.');
  end loop;
  return new;
end $$;
create trigger precios_cierran_alertas after insert on public.precios for each row execute function public.cerrar_alertas_de_precio();

-- Cliente creado desde la aplicación sin datos completos: aviso a los socios
create function public.avisar_cliente_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare faltan text[] := '{}'; v_quien text;
begin
  if auth.uid() is null or public.tiene_rol('socio') then return new; end if;
  if new.telefono is null then faltan := faltan || 'teléfono'::text; end if;
  if new.documento is null then faltan := faltan || 'DNI o RUC'::text; end if;
  if new.direccion is null then faltan := faltan || 'dirección'::text; end if;
  select nombre into v_quien from public.perfiles where id = auth.uid();
  perform public.alertar('cliente_nuevo', 'Cliente nuevo: ' || new.nombre || ' (' || new.codigo || ')',
    'Lo creó ' || coalesce(v_quien, '—') || '. Aún no tiene precios: se registran a mano en su primer pedido.'
    || case when cardinality(faltan) > 0 then ' Faltan: ' || array_to_string(faltan, ', ') || '.' else '' end, new.id);
  return new;
end $$;
create trigger clientes_avisar_nuevo after insert on public.clientes for each row execute function public.avisar_cliente_nuevo();

-- =====================================================================
-- 5. Pedido: si el cliente no tiene precio, se usa el que se escribió a mano en el pedido
--    (cada línea puede traer "precio_docena"; solo se usa cuando el cliente no tiene precio)
-- =====================================================================
create or replace function public.crear_pedido(pedido jsonb, items jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_cliente uuid := (pedido ->> 'cliente_id')::uuid; i jsonb; pr public.presentaciones;
        v_precio numeric; v_manual numeric; v_prod text;
begin
  if v_cliente is null then raise exception 'Elige el cliente del pedido'; end if;
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
      v_manual := nullif(i ->> 'precio_docena', '')::numeric;
      select nombre into v_prod from public.productos where id = pr.producto_id;
      if v_manual is null then
        raise exception 'El cliente no tiene precio para % de % ml. Escríbelo en el producto.', v_prod, pr.medida_ml;
      end if;
      perform public.fijar_precio(v_cliente, pr.producto_id, pr.medida_ml, v_manual, current_date, 'Escrito a mano al registrar un pedido');
      v_precio := v_manual;
    end if;
    insert into public.pedido_items (pedido_id, producto_id, color_id, presentacion_id, bolsas, precio)
    values (v_id, pr.producto_id, (i ->> 'color_id')::uuid, pr.id, (i ->> 'bolsas')::integer, round(v_precio * pr.unidades / 12.0, 2));
  end loop;
  return v_id;
end $$;

-- =====================================================================
-- 6. Cambios en vivo: el contador de alertas se actualiza solo
-- =====================================================================
alter publication supabase_realtime add table public.alertas, public.alerta_comentarios;

-- Pinturas Liz · 0010 · Permisos de la versión 0.7.0
-- Ejecutar una sola vez, DESPUÉS de 0009. No borra datos.
--
-- Qué cambia:
--   1. Desarrollador: puede todo lo que puede un socio (y recibe las sugerencias de mejora).
--   2. Administración también marca Listo y Despacha.
--   3. Taller hace el trabajo de taller y de despacho: también marca Entregado.
--   4. Despacho solo despacha y marca Entregado: ya no pide producción, no envasa ni mueve almacenes.
--   5. El vendedor marca Entregado sus propios pedidos despachados (para cobrar contra entrega).
--   6. El vendedor edita los datos de SUS clientes (no los precios, ni el vendedor, ni el límite).
--   7. Todo cambio en clientes (alta o datos) y en precios llega como Novedad a Socio, Administración y Desarrollador.
--   8. "Sugerir una mejora": cualquier perfil la envía; la ven Desarrollador y socios.

-- =====================================================================
-- 1. Desarrollador = socio para todas las reglas
-- =====================================================================
-- Todas las reglas preguntan por rol_actual(); para el desarrollador responde 'socio'.
create or replace function public.rol_actual() returns public.rol_app
language sql stable security definer set search_path = public as $$
  select case when rol = 'desarrollador' then 'socio'::public.rol_app else rol end
    from public.perfiles where id = auth.uid() and activo
$$;
create function public.es_desarrollador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol = 'desarrollador')
$$;

-- Nadie puede quitarse a sí mismo el perfil de socio o desarrollador
create or replace function public.proteger_socio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id = auth.uid() and old.rol in ('socio','desarrollador') and (new.rol <> old.rol or not new.activo) then
    raise exception 'No puedes quitarte tu propio perfil de %', old.rol;
  end if;
  return new;
end $$;

-- =====================================================================
-- 2, 3 y 5. Cambios de estado del pedido
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
      or (old.estado in ('recibido','en_revision') and new.estado = 'en_taller'  and v_rol = 'administrativo')
      or (old.estado = 'en_revision' and new.estado = 'recibido'                  and v_rol = 'administrativo')
      or (old.estado = 'en_taller'  and new.estado = 'listo'      and v_rol in ('administrativo','taller'))
      or (old.estado = 'listo'      and new.estado = 'despachado' and v_rol in ('administrativo','taller','despacho'))
      or (old.estado = 'despachado' and new.estado = 'entregado'  and v_rol in ('administrativo','taller','despacho'))
      or (old.estado = 'despachado' and new.estado = 'entregado'  and v_rol = 'vendedor' and old.creado_por = auth.uid())
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

-- El vendedor no tiene permiso general para cambiar pedidos: marca Entregado con esta función
create function public.marcar_entregado(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pedidos;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'El pedido no existe'; end if;
  if p.estado <> 'despachado' then raise exception 'Solo se marca Entregado un pedido Despachado'; end if;
  update public.pedidos set estado = 'entregado' where id = p_pedido;   -- controlar_estado revisa el perfil
end $$;

-- Despacho ya no pide revisión desde el Taller (solo el Taller y Administración)
create or replace function public.enviar_revision(p_pedido uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pedidos; v_para text; v_quien text; v_cod text; v_admin boolean := public.tiene_rol('socio','administrativo');
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo de la revisión'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'El pedido no existe'; end if;
  if p.estado = 'recibido' and v_admin then v_para := 'creador';
  elsif p.estado = 'en_taller' and public.tiene_rol('taller') then v_para := 'administracion';
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
          trim(p_motivo) || ' — ' || coalesce(v_quien, ''),
          p.cliente_id, p.id, 'sistema', 'alta',
          case when v_para = 'creador' then p.creado_por end,
          case when v_para = 'administracion' then 'administrativo' end,
          auth.uid());
end $$;

-- =====================================================================
-- 4. Despacho: sin producción, envasado ni movimientos de almacén
-- =====================================================================
create or replace function public.puede_mover(a public.almacen) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.rol_actual()
    when 'socio'          then true
    when 'administrativo' then a in ('insumos','materiales')
    when 'laboratorio'    then a in ('insumos','granel_lab')
    when 'taller'         then a in ('granel_taller','materiales','envasado')
    else false end
$$;

drop policy articulos_crear on public.articulos;
create policy articulos_crear on public.articulos for insert to authenticated
  with check ((tipo = 'insumo' and public.tiene_rol('socio','administrativo','laboratorio'))
           or (tipo = 'material' and public.tiene_rol('socio','administrativo','taller')));

drop policy ordenes_crear on public.ordenes_produccion;
create policy ordenes_crear on public.ordenes_produccion for insert to authenticated
  with check (public.tiene_rol('socio','administrativo','taller') and solicitada_por = auth.uid());
drop policy ordenes_cambiar on public.ordenes_produccion;
create policy ordenes_cambiar on public.ordenes_produccion for update to authenticated
  using (public.tiene_rol('socio','administrativo','laboratorio','taller'))
  with check (public.tiene_rol('socio','administrativo','laboratorio','taller'));

create or replace function public.registrar_envasado(p_color uuid, p_presentacion uuid, p_bolsas integer, p_lote uuid, p_notas text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num integer; v_litros numeric; v_ref text; pr public.presentaciones; mat record;
begin
  if not public.tiene_rol('socio','taller') then raise exception 'Solo el Taller registra envasados'; end if;
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
-- 6. El vendedor edita los datos de sus clientes
-- =====================================================================
drop policy clientes_editar on public.clientes;
create policy clientes_editar on public.clientes for update to authenticated
  using (public.tiene_rol('socio','administrativo') or (public.tiene_rol('vendedor') and vendedor_codigo = public.mi_vendedor()))
  with check (public.tiene_rol('socio','administrativo') or (public.tiene_rol('vendedor') and vendedor_codigo = public.mi_vendedor()));

-- Lo que el vendedor no puede cambiar de su cliente
create function public.proteger_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.tiene_rol('vendedor') then
    if new.vendedor_codigo is distinct from old.vendedor_codigo then raise exception 'Solo socios y Administración cambian el vendedor de un cliente'; end if;
    if new.activo is distinct from old.activo then raise exception 'Solo socios y Administración desactivan clientes'; end if;
    if new.codigo is distinct from old.codigo then raise exception 'El código del cliente no se cambia'; end if;
  end if;
  return new;
end $$;
create trigger clientes_proteger before update on public.clientes for each row execute function public.proteger_cliente();

-- =====================================================================
-- 7. Novedades: también los cambios de datos de clientes
-- =====================================================================
alter table public.novedades drop constraint novedades_tipo_check;
alter table public.novedades add constraint novedades_tipo_check
  check (tipo in ('cliente_nuevo','cliente_cambio','precio_nuevo','precio_cambio'));

create function public.novedad_cliente_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare cambios text[] := '{}'; r record; v_ant text; v_nue text;
begin
  if auth.uid() is null then return new; end if;                 -- cargas desde el SQL Editor no avisan
  for r in select * from (values
      ('nombre','Nombre'), ('telefono','Teléfono'), ('correo','Correo'), ('direccion','Dirección'), ('zona','Zona'),
      ('lugar','Lugar'), ('documento_tipo','Tipo de documento'), ('documento','Documento'), ('agencia_habitual','Agencia'),
      ('condicion_habitual','Pago habitual'), ('dias_credito_habitual','Días de crédito'), ('notas','Notas'),
      ('vendedor_codigo','Vendedor'), ('limite_credito','Límite de crédito'), ('activo','Activo')) as c(col, etiqueta)
  loop
    execute format('select ($1).%I::text, ($2).%I::text', r.col, r.col) into v_ant, v_nue using old, new;
    if v_ant is distinct from v_nue then
      cambios := cambios || (r.etiqueta || ': ' || coalesce(v_ant, '—') || ' → ' || coalesce(v_nue, '—'));
    end if;
  end loop;
  if cardinality(cambios) > 0 then
    insert into public.novedades (tipo, titulo, detalle, cliente_id, por)
    values ('cliente_cambio', 'Datos cambiados: ' || new.nombre || ' (' || new.codigo || ')', array_to_string(cambios, '; ') || '.', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger clientes_novedad_cambio after update on public.clientes for each row execute function public.novedad_cliente_cambio();

-- Quitar un precio también es un cambio de precio
create or replace function public.quitar_precio(p_precio uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.precios; v_cli text; v_prod text;
begin
  if auth.uid() is not null and not public.tiene_rol('socio','administrativo') then
    raise exception 'Solo socios y Administración cambian precios';
  end if;
  select * into pr from public.precios where id = p_precio and vigente_hasta is null;
  if pr.id is null then raise exception 'Ese precio ya no está vigente'; end if;
  if pr.vigente_desde >= current_date then delete from public.precios where id = pr.id;
  else update public.precios set vigente_hasta = current_date where id = pr.id; end if;
  select nombre into v_cli from public.clientes where id = pr.cliente_id;
  select nombre into v_prod from public.productos where id = pr.producto_id;
  insert into public.novedades (tipo, titulo, detalle, cliente_id, producto_id, medida_ml, por)
  values ('precio_cambio', v_cli || ': ' || v_prod || ' ' || pr.medida_ml || ' ml sin precio',
          'Se quitó el precio de S/ ' || to_char(pr.precio_docena, 'FM999990.00') || ' la docena; el próximo pedido lo pedirá a mano.',
          pr.cliente_id, pr.producto_id, pr.medida_ml, auth.uid());
end $$;

-- =====================================================================
-- 8. Sugerencias de mejora (para el Desarrollador)
-- =====================================================================
drop policy alertas_crear on public.alertas;
create policy alertas_crear on public.alertas for insert to authenticated
  with check (public.rol_actual() <> 'pendiente' and creado_por = auth.uid() and origen = 'usuario' and estado = 'abierta'
              and tipo in ('aviso','mejora') and prioridad = 'normal'
              and (para_rol is null or (tipo = 'mejora' and para_rol = 'desarrollador')) and para is null);
-- El desarrollador ve las sugerencias (como socio ya ve todas las alertas)

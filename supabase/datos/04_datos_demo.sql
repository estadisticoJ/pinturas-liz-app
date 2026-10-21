-- Pinturas Liz · Datos de DEMOSTRACIÓN para probar el módulo Análisis (versión 0.8.0)
-- Ejecutar en Supabase > SQL Editor, después de 0011 y de 03_usuarios_reales.sql.
--
-- Crea, en los últimos 4 meses y con los clientes, productos y precios REALES:
--   · unos 220 pedidos en todos los estados, de los vendedores, socios y Administración
--   · sus cobros (contado, crédito con saldos y vencidos, adelantos)
--   · órdenes de producción y lotes del Laboratorio
--   · envasados del Taller y movimientos de almacén (insumos y materiales de demostración)
--
-- TODO lo creado queda marcado para poder borrarlo sin tocar lo real:
--   notas que empiezan con "[DEMO]", referencias de almacén que empiezan con "DEMO" y artículos "(demo)".
-- Para borrarlo: datos/05_borrar_datos_demo.sql
--
-- Los vendedores verán estos pedidos como suyos. Bórralos antes de empezar a trabajar con datos reales.

do $$
declare
  u_adm uuid := (select id from auth.users where email = 'administracion.pinturasliz@gmail.com');
  u_taller uuid := (select id from auth.users where email = 'taller.pinturasliz@gmail.com');
  u_desp uuid := (select id from auth.users where email = 'despacho.pinturasliz@gmail.com');
  u_lab uuid := (select id from auth.users where email = 'laboratorio.pinturasliz@gmail.com');
  vend record; cli record; pre record; col uuid; ped uuid; d timestamptz; edad integer; est public.estado_pedido;
  cond public.condicion_pago; n_items integer; i integer; k integer; v_rec integer; v_total numeric; pago numeric; r numeric;
  estados text[]; e text; t timestamptz; quien uuid; ord uuid; lot uuid; v_num integer; litros numeric; art uuid;
  x record;
begin
  if u_adm is null or u_lab is null then raise exception 'Primero ejecuta 03_usuarios_reales.sql'; end if;
  if exists (select 1 from public.pedidos where notas like '[DEMO]%') then
    raise exception 'Ya hay datos de demostración. Bórralos antes con 05_borrar_datos_demo.sql';
  end if;
  perform setseed(0.42);

  -- ---------------------------------------------------------------
  -- Pedidos: vendedor → sus clientes con precio → productos con precio
  -- ---------------------------------------------------------------
  for vend in
    select v.codigo, coalesce(v.perfil_id, u_adm) as perfil, n
      from (values ('JORGE', 70), ('LILY', 60), ('GIOVANNI', 30), ('LIZ', 25), ('OFICINA', 35)) as q(codigo, n)
      join public.vendedores v on v.codigo = q.codigo
  loop
    for k in 1 .. vend.n loop
      select c.* into cli from public.clientes c
       where c.vendedor_codigo = vend.codigo and c.activo
         and exists (select 1 from public.precios p where p.cliente_id = c.id and p.vigente_hasta is null)
       order by random() limit 1;
      exit when cli.id is null;
      edad := floor(random() ^ 1.4 * 120)::integer;                  -- más pedidos recientes que antiguos
      d := date_trunc('day', now()) - (edad || ' days')::interval + ((8 + floor(random() * 10)) || ' hours')::interval;
      r := random();
      est := case
        when edad > 12 then (case when r < 0.88 then 'entregado' when r < 0.94 then 'anulado' else 'despachado' end)::public.estado_pedido
        when edad > 5  then (case when r < 0.45 then 'entregado' when r < 0.7 then 'despachado' when r < 0.85 then 'listo' else 'en_taller' end)::public.estado_pedido
        else (case when r < 0.35 then 'recibido' when r < 0.45 then 'en_revision' when r < 0.75 then 'en_taller' when r < 0.9 then 'listo' else 'despachado' end)::public.estado_pedido
      end;
      r := random();
      cond := (case when r < 0.6 then 'contado' when r < 0.88 then 'credito' else 'adelanto' end)::public.condicion_pago;
      insert into public.pedidos (cliente_id, canal, condicion, dias_credito, entrega, fecha_entrega, notas, estado, creado_por, creado,
                                  revision_motivo, revision_para, revision_por, revision_en)
      values (cli.id, (array['Visita de vendedor','WhatsApp','Llamada','Facebook','Oficina','Feria'])[1 + floor(random() * 6)::integer],
              cond, case when cond = 'credito' then (array[15, 15, 30, 7])[1 + floor(random() * 4)::integer] end,
              (array['local','local','agencia','oficina'])[1 + floor(random() * 4)::integer]::public.tipo_entrega,
              (d + ((2 + floor(random() * 4)) || ' days')::interval)::date,
              '[DEMO] Pedido de prueba', est, vend.perfil, d,
              case when est = 'en_revision' then 'Confirmar colores con el cliente (demo)' end,
              case when est = 'en_revision' then 'creador' end,
              case when est = 'en_revision' then u_adm end,
              case when est = 'en_revision' then d + interval '3 hours' end)
      returning id into ped;

      -- Líneas: productos que el cliente tiene con precio
      n_items := 1 + floor(random() * 4)::integer;
      for pre in
        select p.producto_id, p.medida_ml, p.precio_docena, pz.id as pres
          from public.precios p join public.presentaciones pz on pz.producto_id = p.producto_id and pz.medida_ml = p.medida_ml and pz.activo
         where p.cliente_id = cli.id and p.vigente_hasta is null
         order by random() limit n_items
      loop
        -- 8 de cada 10 veces, uno de los 4 colores principales del producto
        col := null;
        if random() < 0.8 then
          select id into col from public.colores where producto_id = pre.producto_id and activo
           order by codigo nulls last, nombre offset floor(random() * 4)::integer limit 1;
        end if;
        if col is null then select id into col from public.colores where producto_id = pre.producto_id and activo order by random() limit 1; end if;
        continue when col is null;
        i := (array[6, 12, 12, 12, 18, 24, 24, 36, 48])[1 + floor(random() * 9)::integer];
        insert into public.pedido_items (pedido_id, producto_id, color_id, presentacion_id, frascos, precio_docena, importe)
        values (ped, pre.producto_id, col, pre.pres, i, pre.precio_docena, round(pre.precio_docena * i / 12.0, 2))
        on conflict do nothing;
      end loop;
      if not exists (select 1 from public.pedido_items where pedido_id = ped) then
        delete from public.pedidos where id = ped; continue;
      end if;

      -- Seguimiento con fechas y personas
      delete from public.pedido_historial where pedido_id = ped;
      estados := case est
        when 'recibido' then array['recibido'] when 'en_revision' then array['recibido','en_revision']
        when 'en_taller' then array['recibido','en_taller'] when 'listo' then array['recibido','en_taller','listo']
        when 'despachado' then array['recibido','en_taller','listo','despachado']
        when 'entregado' then array['recibido','en_taller','listo','despachado','entregado']
        else array['recibido','anulado'] end;
      t := d;
      foreach e in array estados loop
        quien := case e when 'recibido' then vend.perfil when 'en_taller' then u_adm when 'en_revision' then u_adm when 'anulado' then u_adm
                        when 'listo' then u_taller when 'despachado' then u_desp else coalesce(u_desp, u_taller) end;
        insert into public.pedido_historial (pedido_id, estado, por, cuando, nota)
        values (ped, e::public.estado_pedido, quien, t, case when e = 'en_revision' then 'Motivo: Confirmar colores con el cliente (demo)' end);
        t := t + ((6 + floor(random() * 30)) || ' hours')::interval;
      end loop;

      -- Salida del almacén de envasado cuando el pedido quedó listo
      if est in ('listo','despachado','entregado') then
        insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, pedido_id, por, creado)
        select 'envasado', public.articulo_envasado(it.color_id, it.presentacion_id), -sum(it.frascos), 'pedido',
               'DEMO P-' || lpad(p.numero::text, 5, '0'), ped, u_taller, d + interval '1 day'
          from public.pedido_items it join public.pedidos p on p.id = it.pedido_id
         where it.pedido_id = ped group by it.color_id, it.presentacion_id, p.numero;
      end if;

      -- Cobros
      select total into v_total from public.pedidos where id = ped;
      pago := null;
      if est = 'entregado' then
        r := random();
        pago := case when cond = 'contado' then (case when r < 0.92 then v_total else round(v_total * 0.5, 2) end)
                     when cond = 'credito' then (case when r < 0.55 then v_total when r < 0.75 then round(v_total * 0.4, 2) else 0 end)
                     else v_total end;
      elsif cond = 'adelanto' and est in ('en_taller','listo','despachado') then
        pago := case when random() < 0.7 then v_total else round(v_total * 0.5, 2) end;
      end if;
      if coalesce(pago, 0) > 0 then
        insert into public.cobros (pedido_id, monto, medio, fecha, notas, cobrado_por)
        values (ped, pago, (array['efectivo','yape','yape','transferencia','plin','deposito'])[1 + floor(random() * 6)::integer]::public.medio_pago,
                least(current_date, (d + interval '4 days')::date), '[DEMO] Cobro de prueba', vend.perfil)
        returning recibo into v_rec;
        if edad > 3 then
          update public.cobros set estado = 'recibido' where recibo = v_rec;
          update public.cobros set recibido_por = u_adm, recibido_en = d + interval '5 days' where recibo = v_rec;
        end if;
      end if;
    end loop;
  end loop;

  -- ---------------------------------------------------------------
  -- Almacén: insumos y materiales de demostración con compras y mínimos
  -- ---------------------------------------------------------------
  insert into public.articulos (tipo, nombre, unidad) values
    ('insumo','Resina acrílica (demo)','kg'), ('insumo','Pigmento rojo (demo)','kg'), ('insumo','Pigmento azul (demo)','kg'),
    ('insumo','Carbonato de calcio (demo)','kg'), ('material','Frasco 120 ml (demo)','und'), ('material','Tapa (demo)','und'),
    ('material','Etiqueta (demo)','und'), ('material','Bolsa (demo)','und');
  insert into public.stock_minimos (almacen, articulo_id, minimo)
  select case tipo when 'insumo' then 'insumos' else 'materiales' end::public.almacen, id, 0 from public.articulos where nombre like '%(demo)';

  -- ---------------------------------------------------------------
  -- Producción y Taller: lo que pidieron los pedidos (que ya pasaron por el Taller)
  -- ---------------------------------------------------------------
  -- El Laboratorio fabrica por color: una orden y un lote por color y por mes; el Taller envasa cada medida
  for x in
    select it.color_id, date_trunc('month', p.creado) as mes, min(p.creado) as desde,
           sum(it.frascos * pz.medida_ml) / 1000.0 as litros_ped
      from public.pedido_items it join public.pedidos p on p.id = it.pedido_id
      join public.presentaciones pz on pz.id = it.presentacion_id
     where p.notas like '[DEMO]%' and p.estado in ('en_taller','listo','despachado','entregado')
     group by it.color_id, date_trunc('month', p.creado)
  loop
    litros := round(x.litros_ped * 1.25, 1) + 3;
    insert into public.ordenes_produccion (color_id, litros, fecha_requerida, notas, estado, solicitada_por, creado)
    values (x.color_id, litros, (x.desde + interval '2 days')::date, '[DEMO] Orden de prueba', 'atendida', u_taller, x.desde)
    returning id into ord;
    insert into public.lotes (orden_id, color_id, litros, fecha, estado, viscosidad, transparencia, color_ok, notas, registrado_por, validado_por, validado_en)
    values (ord, x.color_id, litros, (x.desde + interval '1 day')::date, 'entregado', 'Normal', 'Buena', true, '[DEMO] Lote de prueba', u_lab, u_lab, x.desde + interval '1 day')
    returning id, numero into lot, v_num;
    select id into art from public.articulos where nombre = 'Resina acrílica (demo)';
    insert into public.lote_insumos (lote_id, articulo_id, cantidad) values (lot, art, round(litros * 0.3, 2));
    insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por, creado) values
      ('insumos', art, -round(litros * 0.3, 2), 'consumo_lote', 'DEMO L-' || lpad(v_num::text, 5, '0'), u_lab, x.desde + interval '1 day'),
      ('granel_lab', public.articulo_granel(x.color_id), litros, 'produccion', 'DEMO L-' || lpad(v_num::text, 5, '0'), u_lab, x.desde + interval '1 day'),
      ('granel_lab', public.articulo_granel(x.color_id), -litros, 'entrega_taller', 'DEMO L-' || lpad(v_num::text, 5, '0'), u_lab, x.desde + interval '1 day'),
      ('granel_taller', public.articulo_granel(x.color_id), litros, 'recepcion_lab', 'DEMO L-' || lpad(v_num::text, 5, '0'), u_taller, x.desde + interval '1 day');
    -- Envasados de ese color en el mes, por medida
    for pre in
      select it.presentacion_id, pz.unidades, pz.medida_ml, sum(it.frascos) as frascos
        from public.pedido_items it join public.pedidos p on p.id = it.pedido_id
        join public.presentaciones pz on pz.id = it.presentacion_id
       where p.notas like '[DEMO]%' and p.estado in ('en_taller','listo','despachado','entregado')
         and it.color_id = x.color_id and date_trunc('month', p.creado) = x.mes
       group by it.presentacion_id, pz.unidades, pz.medida_ml
    loop
      i := ceil(pre.frascos::numeric / pre.unidades)::integer;          -- bolsas a envasar
      insert into public.envasados (color_id, presentacion_id, bolsas, litros, lote_id, fecha, notas, por, creado)
      values (x.color_id, pre.presentacion_id, i, round(i * pre.unidades * pre.medida_ml / 1000.0, 3), lot, (x.desde + interval '1 day')::date,
              '[DEMO] Envasado de prueba', u_taller, x.desde + interval '1 day')
      returning numero into v_num;
      insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por, creado) values
        ('granel_taller', public.articulo_granel(x.color_id), -round(i * pre.unidades * pre.medida_ml / 1000.0, 3), 'envasado', 'DEMO E-' || lpad(v_num::text, 5, '0'), u_taller, x.desde + interval '1 day'),
        ('envasado', public.articulo_envasado(x.color_id, pre.presentacion_id), i * pre.unidades, 'envasado', 'DEMO E-' || lpad(v_num::text, 5, '0'), u_taller, x.desde + interval '1 day');
      insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por, creado)
      select 'materiales', a.id, -(case when a.nombre like 'Bolsa%' then i else i * pre.unidades end), 'consumo_envasado',
             'DEMO E-' || lpad(v_num::text, 5, '0'), u_taller, x.desde + interval '1 day'
        from public.articulos a where a.nombre in ('Frasco 120 ml (demo)','Tapa (demo)','Etiqueta (demo)','Bolsa (demo)');
    end loop;
  end loop;

  -- Compras de insumos y materiales: cubren lo consumido y dejan existencia; dos quedan bajo su mínimo
  for x in select a.id, a.tipo, a.nombre, coalesce(-sum(m.cantidad), 0) as consumo
             from public.articulos a left join public.movimientos m on m.articulo_id = a.id
            where a.nombre like '%(demo)' group by a.id, a.tipo, a.nombre loop
    for k in 0 .. 3 loop
      insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia, por, creado)
      values (case x.tipo when 'insumo' then 'insumos' else 'materiales' end::public.almacen, x.id,
              round(x.consumo * 1.25 / 4 + case x.tipo when 'insumo' then 25 else 300 end, 0),
              'compra', 'DEMO Factura ' || (100 + k), u_adm, now() - ((115 - k * 30) || ' days')::interval);
    end loop;
    update public.stock_minimos set minimo = case
        when x.nombre like 'Pigmento azul%' or x.nombre like 'Etiqueta%' then round(x.consumo * 1.25 + 2000, 0)
        when x.tipo = 'insumo' then 20 else 500 end
     where articulo_id = x.id;
  end loop;

  -- Algunas órdenes y lotes recientes aún en curso, y un lote rechazado
  for k in 1 .. 6 loop
    select c.id into col from public.colores c join public.productos p on p.id = c.producto_id where p.nombre in ('Mate','Brillo','Country') order by random() limit 1;
    insert into public.ordenes_produccion (color_id, litros, fecha_requerida, notas, estado, solicitada_por, creado)
    values (col, 10 + floor(random() * 25), current_date + k, '[DEMO] Orden de prueba',
            (case when k <= 3 then 'pendiente' else 'en_proceso' end)::public.estado_orden, u_taller, now() - (k || ' days')::interval)
    returning id into ord;
    if k > 3 then
      insert into public.lotes (orden_id, color_id, litros, fecha, estado, notas, registrado_por)
      values (ord, col, 15, current_date - 1, (case when k = 6 then 'rechazado' else 'en_validacion' end)::public.estado_lote,
              '[DEMO] Lote de prueba', u_lab);
    end if;
  end loop;
end $$;

-- Resumen de lo creado
select 'pedidos' as dato, count(*) from public.pedidos where notas like '[DEMO]%'
union all select 'cobros', count(*) from public.cobros where notas like '[DEMO]%'
union all select 'órdenes de producción', count(*) from public.ordenes_produccion where notas like '[DEMO]%'
union all select 'lotes', count(*) from public.lotes where notas like '[DEMO]%'
union all select 'envasados', count(*) from public.envasados where notas like '[DEMO]%'
union all select 'movimientos de almacén', count(*) from public.movimientos where referencia like 'DEMO%';

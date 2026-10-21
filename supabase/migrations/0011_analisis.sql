-- Pinturas Liz · 0011 · Módulo Análisis (versión 0.8.0)
-- Ejecutar una sola vez, después de 0010. No cambia ni borra datos.
--
-- Una sola función devuelve todas las métricas del módulo Análisis para un período:
-- pedidos, cobranzas, producción, taller y almacén. Solo la usan socios, Desarrollador y Administración.
-- Lo que es "foto de hoy" (saldos, vencidos, pendientes, existencias) no depende del período.

create function public.analisis(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.tiene_rol('socio','administrativo') then
    raise exception 'Solo socios, Desarrollador y Administración ven el Análisis';
  end if;

  with
  ped as (                                            -- pedidos del período, sin anulados
    select p.*, c.nombre as cliente, pf.nombre as vendedor
      from public.pedidos p
      join public.clientes c on c.id = p.cliente_id
      left join public.perfiles pf on pf.id = p.creado_por
     where p.creado::date between p_desde and p_hasta
  ),
  validos as (select * from ped where estado <> 'anulado'),
  meses as (
    select to_char(m, 'YYYY-MM') as mes
      from generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp), interval '1 month') m
  ),
  saldos as (
    select s.*, (s.estado = 'entregado' or (s.condicion = 'adelanto' and s.estado in ('en_taller','listo','despachado'))) as cobrable
      from public.saldos_pedidos s
  ),
  cob as (
    select co.*, p.creado_por from public.cobros co join public.pedidos p on p.id = co.pedido_id
     where co.fecha between p_desde and p_hasta and co.estado <> 'anulado'
  ),
  lot as (select * from public.lotes where fecha between p_desde and p_hasta),
  env as (select * from public.envasados where fecha between p_desde and p_hasta)
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'pedidos', jsonb_build_object(
      'cantidad',  (select count(*) from validos),
      'monto',     (select coalesce(sum(total), 0) from validos),
      'anulados',  (select count(*) from ped where estado = 'anulado'),
      'frascos',   (select coalesce(sum(i.frascos), 0) from public.pedido_items i join validos v on v.id = i.pedido_id),
      'por_estado', (select coalesce(jsonb_agg(x order by x.orden), '[]') from (
          select e.estado, e.orden, count(p.id) as cantidad, coalesce(sum(p.total), 0) as monto
            from (values ('recibido',1),('en_revision',2),('en_taller',3),('listo',4),('despachado',5),('entregado',6),('anulado',7)) e(estado, orden)
            left join ped p on p.estado::text = e.estado
           group by e.estado, e.orden) x),
      'por_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (
          select m.mes, count(v.id) as cantidad, coalesce(sum(v.total), 0) as monto
            from meses m left join validos v on to_char(v.creado, 'YYYY-MM') = m.mes group by m.mes) x),
      'por_vendedor', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select coalesce(vendedor, '—') as nombre, count(*) as cantidad, sum(total) as monto from validos group by 1) x),
      'por_canal', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select coalesce(canal, '—') as nombre, count(*) as cantidad, sum(total) as monto from validos group by 1) x),
      'top_clientes', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select cliente as nombre, count(*) as cantidad, sum(total) as monto from validos group by 1 order by 3 desc limit 10) x),
      'top_productos', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select pr.nombre || ' ' || x.medida_ml || ' ml' as nombre, sum(i.frascos) as frascos, sum(i.importe) as monto
            from public.pedido_items i join validos v on v.id = i.pedido_id
            join public.productos pr on pr.id = i.producto_id join public.presentaciones x on x.id = i.presentacion_id
           group by 1 order by 3 desc limit 10) x)
    ),
    'cobranzas', jsonb_build_object(
      'cobrado',      (select coalesce(sum(monto), 0) from cob),
      'cobros',       (select count(*) from cob),
      'por_entregar', (select coalesce(sum(monto), 0) from public.cobros where estado = 'por_entregar'),
      'por_cobrar',   (select coalesce(sum(saldo), 0) from saldos where cobrable and saldo > 0.005),
      'vencido',      (select coalesce(sum(saldo), 0) from saldos where cobrable and saldo > 0.005 and vence < current_date),
      'en_curso',     (select coalesce(sum(saldo), 0) from saldos where not cobrable and saldo > 0.005),
      'por_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (
          select m.mes, coalesce(sum(c.monto), 0) as monto from meses m left join cob c on to_char(c.fecha, 'YYYY-MM') = m.mes group by m.mes) x),
      'por_medio', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select medio::text as nombre, count(*) as cantidad, sum(monto) as monto from cob group by 1) x),
      'por_vendedor', (select coalesce(jsonb_agg(x order by x.monto desc), '[]') from (
          select coalesce(pf.nombre, '—') as nombre, count(*) as cantidad, sum(c.monto) as monto
            from cob c left join public.perfiles pf on pf.id = c.cobrado_por group by 1) x),
      'clientes', (select coalesce(jsonb_agg(x order by x.deuda desc), '[]') from (
          select cliente as nombre, sum(saldo) as deuda,
                 sum(saldo) filter (where vence < current_date) as vencido, max(limite_credito) as limite, count(*) as pedidos
            from saldos where cobrable and saldo > 0.005 group by cliente order by 2 desc limit 15) x)
    ),
    'produccion', jsonb_build_object(
      'litros_aprobados', (select coalesce(sum(litros), 0) from lot where estado in ('aprobado','entregado')),
      'lotes', (select count(*) from lot),
      'rechazados', (select count(*) from lot where estado = 'rechazado'),
      'por_estado', (select coalesce(jsonb_agg(x), '[]') from (select estado::text as nombre, count(*) as cantidad, sum(litros) as litros from lot group by 1) x),
      'ordenes', (select coalesce(jsonb_agg(x), '[]') from (
          select estado::text as nombre, count(*) as cantidad, sum(litros) as litros from public.ordenes_produccion
           where creado::date between p_desde and p_hasta group by 1) x),
      'ordenes_pendientes', (select count(*) from public.ordenes_produccion where estado in ('pendiente','en_proceso')),
      'por_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (
          select m.mes, coalesce(sum(l.litros) filter (where l.estado in ('aprobado','entregado')), 0) as litros
            from meses m left join lot l on to_char(l.fecha, 'YYYY-MM') = m.mes group by m.mes) x),
      'top_colores', (select coalesce(jsonb_agg(x order by x.litros desc), '[]') from (
          select pr.nombre || ' · ' || c.nombre as nombre, sum(l.litros) as litros
            from lot l join public.colores c on c.id = l.color_id join public.productos pr on pr.id = c.producto_id
           where l.estado in ('aprobado','entregado') group by 1 order by 2 desc limit 10) x)
    ),
    'taller', jsonb_build_object(
      'bolsas',  (select coalesce(sum(bolsas), 0) from env),
      'litros',  (select coalesce(sum(litros), 0) from env),
      'frascos', (select coalesce(sum(e.bolsas * x.unidades), 0) from env e join public.presentaciones x on x.id = e.presentacion_id),
      'envasados', (select count(*) from env),
      'pendiente_frascos', (select coalesce(sum(faltan_frascos), 0) from public.por_envasar),
      'pendiente_bolsas',  (select coalesce(sum(faltan_bolsas), 0) from public.por_envasar),
      'por_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (
          select m.mes, coalesce(sum(e.bolsas), 0) as bolsas, coalesce(sum(e.litros), 0) as litros
            from meses m left join env e on to_char(e.fecha, 'YYYY-MM') = m.mes group by m.mes) x),
      'top_productos', (select coalesce(jsonb_agg(x order by x.frascos desc), '[]') from (
          select pr.nombre || ' ' || x.medida_ml || ' ml' as nombre, sum(e.bolsas * x.unidades) as frascos
            from env e join public.presentaciones x on x.id = e.presentacion_id join public.productos pr on pr.id = x.producto_id
           group by 1 order by 2 desc limit 8) x)
    ),
    'almacen', jsonb_build_object(
      'por_almacen', (select coalesce(jsonb_agg(x order by x.orden), '[]') from (
          select t.almacen::text as nombre, t.orden, count(s.articulo_id) filter (where s.existencia <> 0) as articulos,
                 count(s.articulo_id) filter (where s.minimo is not null and s.existencia < s.minimo) as bajo_minimo,
                 count(s.articulo_id) filter (where s.existencia < 0) as negativos
            from (values ('insumos'::public.almacen,1),('granel_lab',2),('granel_taller',3),('materiales',4),('envasado',5)) t(almacen, orden)
            left join public.stock s on s.almacen = t.almacen group by t.almacen, t.orden) x),
      'bajo_minimo', (select coalesce(jsonb_agg(x order by x.almacen, x.nombre), '[]') from (
          select almacen::text as almacen, nombre, unidad, existencia, minimo from public.stock
           where minimo is not null and existencia < minimo limit 30) x),
      'granel', (select coalesce(jsonb_agg(x order by x.litros desc), '[]') from (
          select nombre, almacen::text as almacen, existencia as litros from public.stock
           where almacen in ('granel_lab','granel_taller') and existencia > 0 order by existencia desc limit 10) x)
    )
  ) into r;
  return r;
end $$;
revoke execute on function public.analisis(date, date) from public, anon;
grant execute on function public.analisis(date, date) to authenticated;

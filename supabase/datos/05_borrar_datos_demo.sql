-- Pinturas Liz · Borra los datos de DEMOSTRACIÓN creados por 04_datos_demo.sql
-- Ejecutar en Supabase > SQL Editor cuando quieras quitarlos (por ejemplo, antes de empezar con datos reales).
-- Solo borra lo marcado como demostración:
--   notas que empiezan con "[DEMO]", movimientos con referencia "DEMO…" y artículos "(demo)".
-- No toca clientes, productos, precios, usuarios ni pedidos reales.

begin;

-- Pedidos de demostración (sus líneas, seguimiento y alertas se borran con ellos)
create temp table demo_pedidos on commit drop as select id from public.pedidos where notas like '[DEMO]%';

delete from public.movimientos where referencia like 'DEMO%' or pedido_id in (select id from demo_pedidos);
delete from public.cobros where notas like '[DEMO]%' or pedido_id in (select id from demo_pedidos);
delete from public.envasados where notas like '[DEMO]%';
delete from public.lotes where notas like '[DEMO]%';
delete from public.ordenes_produccion where notas like '[DEMO]%';
delete from public.pedidos where id in (select id from demo_pedidos);

-- Artículos de demostración (y sus mínimos y materiales por bolsa)
delete from public.presentacion_materiales where articulo_id in (select id from public.articulos where nombre like '%(demo)');
delete from public.articulos where nombre like '%(demo)'
  and not exists (select 1 from public.movimientos m where m.articulo_id = articulos.id)
  and not exists (select 1 from public.lote_insumos li where li.articulo_id = articulos.id);
-- Artículos de granel y envasado que quedaron sin ningún movimiento
delete from public.articulos a where a.tipo in ('granel','envasado')
  and not exists (select 1 from public.movimientos m where m.articulo_id = a.id)
  and not exists (select 1 from public.stock_minimos s where s.articulo_id = a.id);

-- Los números de pedido, recibo, orden, lote y envasado siguen desde el último real (o desde 1 si no hay)
select setval('public.pedido_numero_seq',   coalesce((select max(numero) from public.pedidos), 0) + 1, false);
select setval('public.recibo_numero_seq',   coalesce((select max(recibo) from public.cobros), 0) + 1, false);
select setval('public.orden_numero_seq',    coalesce((select max(numero) from public.ordenes_produccion), 0) + 1, false);
select setval('public.lote_numero_seq',     coalesce((select max(numero) from public.lotes), 0) + 1, false);
select setval('public.envasado_numero_seq', coalesce((select max(numero) from public.envasados), 0) + 1, false);

commit;

-- Comprobación: todo debe quedar en 0
select 'pedidos demo' as dato, count(*) from public.pedidos where notas like '[DEMO]%'
union all select 'cobros demo', count(*) from public.cobros where notas like '[DEMO]%'
union all select 'lotes demo', count(*) from public.lotes where notas like '[DEMO]%'
union all select 'envasados demo', count(*) from public.envasados where notas like '[DEMO]%'
union all select 'movimientos demo', count(*) from public.movimientos where referencia like 'DEMO%'
union all select 'artículos demo', count(*) from public.articulos where nombre like '%(demo)';

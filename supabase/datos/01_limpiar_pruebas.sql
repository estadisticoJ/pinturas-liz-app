-- Pinturas Liz · Borra TODOS los datos de prueba para empezar con los datos reales.
-- Ejecutar DESPUÉS de las migraciones 0004 y 0005 y ANTES de 02_carga_metadatos.sql.
-- Se puede ejecutar de nuevo si ya cargaste la versión 0.4.0: borra esa carga para cargar la nueva.
-- Borra: pedidos, cobros, lotes, órdenes, envasados, movimientos y artículos de almacén,
--        clientes, precios, alertas, productos, colores y presentaciones.
-- Conserva: usuarios y perfiles, vendedores (y su vínculo con cada usuario), y la estructura de tablas y reglas.
-- Los números de pedido, recibo, lote, orden y envasado vuelven a empezar en 1.
-- ATENCIÓN: no se puede deshacer. Úsalo solo ahora, antes de empezar a trabajar con datos reales.

delete from public.alertas;
delete from public.cobros;
delete from public.movimientos;
delete from public.envasados;
delete from public.lote_insumos;
delete from public.lotes;
delete from public.ordenes_produccion;
delete from public.pedido_historial;
delete from public.pedido_items;
delete from public.pedidos;
delete from public.presentacion_materiales;
delete from public.stock_minimos;
delete from public.articulos;
delete from public.precios;
delete from public.clientes;
delete from public.presentaciones;
delete from public.colores;
delete from public.productos;

alter sequence public.pedido_numero_seq restart with 1;
alter sequence public.recibo_numero_seq restart with 1;
alter sequence public.lote_numero_seq restart with 1;
alter sequence public.orden_numero_seq restart with 1;
alter sequence public.envasado_numero_seq restart with 1;

select 'Datos de prueba eliminados' as resultado;

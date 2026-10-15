-- Pinturas Liz · 0007 · Valores nuevos (versión 0.6.0)
-- Ejecutar una sola vez, ANTES de 0008. Va aparte porque Postgres no permite usar un valor nuevo
-- en la misma ejecución en que se crea.

-- Pedido devuelto para corregir algo antes de seguir al Taller
alter type public.estado_pedido add value if not exists 'en_revision' after 'recibido';

-- Tercera forma de pago: el cliente paga por adelantado (antes de la entrega)
alter type public.condicion_pago add value if not exists 'adelanto';

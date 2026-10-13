-- Pinturas Liz · Quita la carga de ejemplo de los almacenes (almacen_ejemplo.sql).
-- Borra solo lo marcado como "Carga de ejemplo" y los artículos de ejemplo que no se usaron en nada más.
-- Lo que registraron después las personas (lotes, envasados, pedidos, compras reales) no se toca.

delete from public.movimientos where referencia = 'Carga de ejemplo';

with ejemplo(tipo, nombre) as (values
  ('insumo','Resina acrílica'), ('insumo','Dióxido de titanio'), ('insumo','Carbonato de calcio'), ('insumo','Espesante'),
  ('insumo','Preservante'), ('insumo','Pigmento rojo'), ('insumo','Pigmento azul'), ('insumo','Pigmento amarillo'),
  ('insumo','Pigmento negro'), ('insumo','Pigmento verde'),
  ('material','Frasco 30 ml'), ('material','Frasco 50 ml'), ('material','Frasco 60 ml'), ('material','Tapa'),
  ('material','Etiqueta Acrílico Brillo'), ('material','Etiqueta Acrílico Mate'), ('material','Etiqueta Alto Relieve'),
  ('material','Etiqueta Craquelador'), ('material','Etiqueta Témpera'), ('material','Bolsa docena'), ('material','Bolsa media docena')
), libres as (
  select a.id from public.articulos a join ejemplo e on e.tipo::public.tipo_articulo = a.tipo and e.nombre = a.nombre
   where not exists (select 1 from public.movimientos m where m.articulo_id = a.id)
     and not exists (select 1 from public.lote_insumos li where li.articulo_id = a.id)
), sin_bom as (
  delete from public.presentacion_materiales where articulo_id in (select id from libres) returning articulo_id
)
delete from public.articulos where id in (select id from libres);

select 'Carga de ejemplo eliminada' as resultado;

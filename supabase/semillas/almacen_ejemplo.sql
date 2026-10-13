-- Pinturas Liz · Datos DE EJEMPLO para probar los almacenes (requiere 0003 y catalogo_ejemplo.sql).
-- Crea insumos y materiales, sus mínimos, los materiales por bolsa de cada presentación,
-- y existencias iniciales en los almacenes. Todo queda marcado con la referencia "Carga de ejemplo".
-- Si se ejecuta dos veces, la segunda no hace nada. Para quitarlo: limpiar_almacen_ejemplo.sql

do $$
declare
  ref constant text := 'Carga de ejemplo';
begin
  if exists (select 1 from public.movimientos where referencia = ref) then
    raise notice 'La carga de ejemplo ya existe; no se hizo nada.';
    return;
  end if;

  -- 1. Insumos (Laboratorio): nombre, unidad, existencia inicial, mínimo
  insert into public.articulos (tipo, nombre, unidad)
  select 'insumo', x.nombre, x.unidad
    from (values ('Resina acrílica','kg'), ('Dióxido de titanio','kg'), ('Carbonato de calcio','kg'),
                 ('Espesante','kg'), ('Preservante','L'), ('Pigmento rojo','kg'), ('Pigmento azul','kg'),
                 ('Pigmento amarillo','kg'), ('Pigmento negro','kg'), ('Pigmento verde','kg')) as x(nombre, unidad)
   where not exists (select 1 from public.articulos a where a.tipo = 'insumo' and lower(a.nombre) = lower(x.nombre));

  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia)
  select 'insumos', a.id, x.cant, 'compra', ref
    from (values ('Resina acrílica',120), ('Dióxido de titanio',40), ('Carbonato de calcio',60), ('Espesante',15),
                 ('Preservante',8), ('Pigmento rojo',6), ('Pigmento azul',5), ('Pigmento amarillo',1.5),
                 ('Pigmento negro',4), ('Pigmento verde',3)) as x(nombre, cant)
    join public.articulos a on a.tipo = 'insumo' and a.nombre = x.nombre;

  insert into public.stock_minimos (almacen, articulo_id, minimo)
  select 'insumos', a.id, x.minimo
    from (values ('Resina acrílica',50), ('Dióxido de titanio',15), ('Carbonato de calcio',20), ('Espesante',5),
                 ('Preservante',2), ('Pigmento rojo',2), ('Pigmento azul',2), ('Pigmento amarillo',2),
                 ('Pigmento negro',2), ('Pigmento verde',2)) as x(nombre, minimo)
    join public.articulos a on a.tipo = 'insumo' and a.nombre = x.nombre
  on conflict (almacen, articulo_id) do nothing;

  -- 2. Materiales (Taller)
  insert into public.articulos (tipo, nombre, unidad)
  select 'material', x.nombre, 'und'
    from (values ('Frasco 30 ml'), ('Frasco 50 ml'), ('Frasco 60 ml'), ('Tapa'),
                 ('Etiqueta Acrílico Brillo'), ('Etiqueta Acrílico Mate'), ('Etiqueta Alto Relieve'),
                 ('Etiqueta Craquelador'), ('Etiqueta Témpera'), ('Bolsa docena'), ('Bolsa media docena')) as x(nombre)
   where not exists (select 1 from public.articulos a where a.tipo = 'material' and lower(a.nombre) = lower(x.nombre));

  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia)
  select 'materiales', a.id, x.cant, 'compra', ref
    from (values ('Frasco 30 ml',3000), ('Frasco 50 ml',1200), ('Frasco 60 ml',2000), ('Tapa',6000),
                 ('Etiqueta Acrílico Brillo',2500), ('Etiqueta Acrílico Mate',2500), ('Etiqueta Alto Relieve',800),
                 ('Etiqueta Craquelador',400), ('Etiqueta Témpera',1500), ('Bolsa docena',500), ('Bolsa media docena',150)) as x(nombre, cant)
    join public.articulos a on a.tipo = 'material' and a.nombre = x.nombre;

  insert into public.stock_minimos (almacen, articulo_id, minimo)
  select 'materiales', a.id, x.minimo
    from (values ('Frasco 30 ml',1000), ('Frasco 50 ml',500), ('Frasco 60 ml',800), ('Tapa',2000),
                 ('Etiqueta Acrílico Brillo',800), ('Etiqueta Acrílico Mate',800), ('Etiqueta Alto Relieve',300),
                 ('Etiqueta Craquelador',150), ('Etiqueta Témpera',500), ('Bolsa docena',200), ('Bolsa media docena',200)) as x(nombre, minimo)
    join public.articulos a on a.tipo = 'material' and a.nombre = x.nombre
  on conflict (almacen, articulo_id) do nothing;

  -- 3. Materiales por bolsa: un frasco, una tapa y una etiqueta por frasco, y una bolsa
  insert into public.presentacion_materiales (presentacion_id, articulo_id, por_bolsa)
  select pr.id, a.id, case when a.nombre like 'Bolsa%' then 1 else pr.unidades end
    from public.presentaciones pr
    join public.productos p on p.id = pr.producto_id
    join public.articulos a on a.tipo = 'material' and a.nombre in (
      'Frasco ' || pr.medida_ml || ' ml', 'Tapa', 'Etiqueta ' || p.nombre,
      case when pr.unidades = 12 then 'Bolsa docena' else 'Bolsa media docena' end)
  on conflict (presentacion_id, articulo_id) do nothing;

  -- 4. Granel en el Taller (litros), como si se hubiera contado lo que hay en baldes
  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia)
  select 'granel_taller', public.articulo_granel(c.id), x.litros, 'ajuste', ref
    from (values ('Acrílico Brillo','Rojo',3), ('Acrílico Brillo','Azul',2), ('Acrílico Brillo','Blanco',4),
                 ('Acrílico Mate','Negro',2.5), ('Acrílico Mate','Blanco',3), ('Témpera','Amarillo',3),
                 ('Alto Relieve','Dorado',1.2)) as x(producto, color, litros)
    join public.productos p on p.nombre = x.producto
    join public.colores c on c.producto_id = p.id and c.nombre = x.color;

  -- 5. Producto ya envasado (bolsas)
  insert into public.movimientos (almacen, articulo_id, cantidad, motivo, referencia)
  select 'envasado', public.articulo_envasado(c.id, pr.id), x.bolsas, 'ajuste', ref
    from (values ('Acrílico Brillo','Rojo',30,12,3), ('Acrílico Brillo','Azul',30,12,2),
                 ('Acrílico Mate','Blanco',60,12,2), ('Témpera','Azul',30,12,4)) as x(producto, color, ml, und, bolsas)
    join public.productos p on p.nombre = x.producto
    join public.colores c on c.producto_id = p.id and c.nombre = x.color
    join public.presentaciones pr on pr.producto_id = p.id and pr.medida_ml = x.ml and pr.unidades = x.und;

  raise notice 'Carga de ejemplo lista.';
end $$;

-- Resumen de lo cargado
select almacen, count(*) as articulos, sum(existencia) as total
  from public.stock where existencia <> 0 group by almacen order by almacen;

-- Pinturas Liz · Catálogo DE EJEMPLO para probar la aplicación.
-- Colores, medidas, unidades por bolsa y precios son inventados: reemplázalos por los reales.
-- Se puede ejecutar más de una vez; no duplica lo que ya existe.

insert into public.productos (nombre, linea, descripcion) values
  ('Acrílico Brillo', 'Acrílico', 'Acabado brillante para madera, cerámica y yeso.'),
  ('Acrílico Mate',   'Acrílico', 'Acabado mate de alto cubrimiento.'),
  ('Alto Relieve',    'Relieve',  'Pintura con volumen para delinear y decorar.'),
  ('Craquelador',     'Efectos',  'Barniz que agrieta la capa superior de pintura.'),
  ('Témpera',         'Témpera',  'Témpera escolar lavable.')
on conflict (nombre) do nothing;

-- Colores por producto
insert into public.colores (producto_id, nombre, hex)
select p.id, c.nombre, c.hex
  from public.productos p
  join (values
    ('Acrílico Brillo','Blanco','#F7F7F2'),('Acrílico Brillo','Negro','#1C1C1E'),('Acrílico Brillo','Rojo','#D62828'),
    ('Acrílico Brillo','Amarillo','#F6C900'),('Acrílico Brillo','Azul','#1F4FBF'),('Acrílico Brillo','Verde','#2E9E4F'),
    ('Acrílico Brillo','Naranja','#F27C1E'),('Acrílico Brillo','Violeta','#7B3FA3'),('Acrílico Brillo','Rosado','#F08DB4'),
    ('Acrílico Brillo','Marrón','#7A4A2B'),('Acrílico Brillo','Celeste','#69BFE8'),('Acrílico Brillo','Piel','#F1C6A7'),
    ('Acrílico Mate','Blanco','#F7F7F2'),('Acrílico Mate','Negro','#1C1C1E'),('Acrílico Mate','Rojo','#D62828'),
    ('Acrílico Mate','Amarillo','#F6C900'),('Acrílico Mate','Azul','#1F4FBF'),('Acrílico Mate','Verde','#2E9E4F'),
    ('Acrílico Mate','Naranja','#F27C1E'),('Acrílico Mate','Violeta','#7B3FA3'),('Acrílico Mate','Rosado','#F08DB4'),
    ('Acrílico Mate','Marrón','#7A4A2B'),('Acrílico Mate','Celeste','#69BFE8'),('Acrílico Mate','Piel','#F1C6A7'),
    ('Alto Relieve','Blanco','#F7F7F2'),('Alto Relieve','Negro','#1C1C1E'),('Alto Relieve','Rojo','#D62828'),
    ('Alto Relieve','Azul','#1F4FBF'),('Alto Relieve','Dorado','#C9A227'),('Alto Relieve','Plateado','#B5B9C2'),
    ('Craquelador','Transparente','#E8EEF2'),
    ('Témpera','Blanco','#F7F7F2'),('Témpera','Negro','#1C1C1E'),('Témpera','Rojo','#D62828'),('Témpera','Amarillo','#F6C900'),
    ('Témpera','Azul','#1F4FBF'),('Témpera','Verde','#2E9E4F'),('Témpera','Naranja','#F27C1E'),('Témpera','Violeta','#7B3FA3'),
    ('Témpera','Rosado','#F08DB4'),('Témpera','Marrón','#7A4A2B')
  ) as c(producto, nombre, hex) on c.producto = p.nombre
on conflict (producto_id, nombre) do nothing;

-- Presentaciones: medida del frasco, frascos por bolsa y precio por bolsa (soles)
insert into public.presentaciones (producto_id, medida_ml, unidades, precio)
select p.id, x.ml, x.und, x.precio
  from public.productos p
  join (values
    ('Acrílico Brillo',30,12,18.00),('Acrílico Brillo',60,12,30.00),('Acrílico Brillo',60,6,16.00),
    ('Acrílico Mate',30,12,18.00),('Acrílico Mate',60,12,30.00),('Acrílico Mate',60,6,16.00),
    ('Alto Relieve',30,12,24.00),('Alto Relieve',30,6,13.00),
    ('Craquelador',50,12,28.00),('Craquelador',60,6,16.00),
    ('Témpera',30,12,12.00),('Témpera',50,12,18.00)
  ) as x(producto, ml, und, precio) on x.producto = p.nombre
on conflict (producto_id, medida_ml, unidades) do nothing;

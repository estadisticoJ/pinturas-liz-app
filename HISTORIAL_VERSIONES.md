# Historial de versiones · Sistema Pinturas Liz

Este documento cuenta cómo ha crecido el sistema. Se actualiza con cada versión nueva: la más reciente va arriba.

## Cómo se numeran las versiones

El número tiene tres partes: **MAYOR.MENOR.CORRECCIÓN** (por ejemplo, 0.5.0).

| Parte | Cuándo sube | Ejemplo |
| --- | --- | --- |
| **Mayor** | Cuando el sistema pasa a otra etapa. Mientras sea **0**, está en desarrollo (beta). Será **1.0.0** cuando toda la empresa lo use a diario. | 0.x.x → 1.0.0 |
| **Menor** | Cuando se agrega un módulo o una función nueva. La corrección vuelve a 0. | 0.4.2 → 0.5.0 (fotos del catálogo) |
| **Corrección** | Cuando se ajusta o corrige algo que ya existe, sin agregar funciones nuevas. | 0.5.0 → 0.5.1 |

Dónde se ve la versión:
- En la app, en **Mi cuenta** y en la pantalla de entrada.
- En `package.json`.
- En el mensaje del commit y en la etiqueta (tag) de GitHub, por ejemplo `v0.5.0`.

La carpeta del proyecto se llama siempre `pinturas-liz-app`, sin número. Solo el .zip de cada entrega lleva el número.

Cada versión indica qué hay que ejecutar en Supabase. Las migraciones se ejecutan **una sola vez**, en orden.

---

## 0.6.0 · Pedidos por unidades, modificación y revisión · 16/10/2026

**Tipo:** menor (funciones nuevas).
**Supabase:** `0007_estados_nuevos.sql` y luego `0008_unidades_revision.sql` (en ese orden, cada uno por separado).

- **Docenas o unidades.** Al elegir un producto se elige la medida (con su precio por docena), luego *Docenas* o *Unidades* y después los colores.
  - El precio se calcula por frasco: docena ÷ 12. Por ejemplo, 6 u de Mate 120 ml a S/ 34 la docena = S/ 17.
  - Las líneas guardan frascos y se muestran como «1 docena + 8 u».
- **Empaque.** Cada pedido muestra cómo lo arma el Taller: los colores de un mismo producto y medida se juntan en bolsas llenas y una bolsa con el resto. Las bolsas son de 12 hasta 120 ml y de 6 en 250 ml.
- **Taller y almacén en frascos.** «Por envasar» muestra frascos pendientes y bolsas a envasar. El almacén de producto envasado cuenta frascos; lo anterior se convirtió solo.
- **Fecha de vencimiento manual.** Además de 7, 15 y 30 días, el crédito acepta «Otra fecha».
- **Modificar pedidos** antes del Taller:
  - Socios y Administración siempre.
  - Quien lo registró, mientras esté *Recibido* o cuando se lo devuelvan a revisión.
  - Las líneas que siguen conservan su precio, y cada cambio queda en el seguimiento.
- **Revisión.** Nuevo estado *En revisión*, con motivo escrito a mano.
  - Socios y Administración la piden en *Recibido*.
  - El Taller la pide en *En taller*, y primero la ve Administración.
  - Quien debe corregir recibe una **alerta urgente** (franja roja arriba). Corrige y pulsa «Corregido, reenviar».
  - Los pedidos en revisión no se suman al consolidado del Taller.
- **Forma de pago «Adelanto».**
  - Contado y crédito se cobran cuando el pedido está *Entregado*.
  - El adelanto se registra desde que el pedido pasa al Taller; también lo registran los vendedores.
  - Un pedido recién registrado solo muestra Repetir, Modificar, Anular y Enviar a revisión.

## 0.5.0 · Fotos de productos en el catálogo · 15/10/2026

**Tipo:** menor (función nueva).
**Supabase:** nada que ejecutar.

- El catálogo y la hoja de cada producto muestran la foto del producto. Si un producto no tiene foto, se ven los frascos de colores como antes.
- Nueva carpeta `src/productos/` para las fotos. Cada archivo lleva el nombre del producto (Mate FLT → `mate-flt.webp`). Su guía `LEEME.md` lista el nombre de archivo de los 42 productos y cuáles ya tienen foto.
- Fotos de prueba cargadas (9): Barniz, Brillo, Country, Craquelador, Envejecedor, Mate, Mate FLT, Nieve y Perlado.
- Las fotos se guardan en el celular la primera vez que se ven, así el catálogo carga rápido después y la instalación de la app sigue siendo liviana.
- Nuevo este documento, `HISTORIAL_VERSIONES.md`.

## 0.4.2 · Precio sugerido, novedades y colores de la marca · 13/10/2026

**Tipo:** corrección. Por las funciones que agregó (novedades, precio sugerido) debió ser 0.5.0; se mantiene el número porque ya está publicado.
**Supabase:** `0006_precio_sugerido_novedades.sql`.

- **Precio sugerido:** el precio por docena que más clientes pagan (la moda). **Medida habitual:** la medida más comprada de cada producto. Hay botones para usar ambos al escribir un precio.
- **Novedades** para socios y Administración: clientes creados y precios registrados o cambiados, con quién lo hizo y el precio anterior. Solo informan; no piden aprobación.
- El vendedor registra el primer precio de un cliente sin pedir permiso.
- El carrito se recalcula al cambiar de cliente. Las líneas sin precio se completan en el mismo carrito.
- Colores y logo de Pinturas Liz: cabecera azul, botones rojos, contadores amarillos y franja arcoíris. El ícono de la app es el logo.
- La app se actualiza sola en cada celular y muestra su versión en *Mi cuenta*.

## 0.4.1 · Carga corregida, precio a mano y alertas · 13/10/2026

**Tipo:** corrección (también agregó alertas).
**Supabase:** `0005_alertas_precio_manual.sql`, luego `datos/01_limpiar_pruebas.sql` y `datos/02_carga_metadatos.sql` nuevos.

- **Carga del Excel corregido:**
  - Precios repetidos con distinto valor guardados como historial: el de 2025 cerrado y el vigente desde 2026.
  - Productos nuevos sin código cargados con el color "Único".
  - Precios en cero no se cargan.
- **Sin precios de lista:** si el cliente no tiene precio, se escribe a mano en el pedido y queda como su precio.
- **Solo un socio agrega medidas nuevas** a un producto.
- **Alertas para socios** con comentarios. Hubo 58 iniciales, por los datos faltantes o dudosos del Excel. Las de precio se cierran solas al registrar el precio.

## 0.4.0 · Datos reales y precios por cliente · 12/10/2026

**Tipo:** menor.
**Supabase:** `0004_precios_clientes.sql`, luego los datos.

- Primera carga de datos reales desde `Metadatos.xlsx`: 302 clientes, 42 productos, 423 colores y unos 2.000 precios.
- Precios **por docena**, por cliente, producto y medida, con fecha de vigencia e historial (un precio nunca se borra).
- Módulo **Clientes**: ficha con datos para facturar y entregar, y sus precios.
- Vendedores (Jorge, Lily, Giovanni, Liz, Oficina) vinculados a su usuario.

## 0.3.0 · Cobranzas, Producción, Taller y Almacén

**Tipo:** menor.
**Supabase:** `0003_modulos.sql`.

- **Cobranzas:** saldos por cobrar, cobros con recibo numerado, cuadre del dinero y límite de crédito.
- **Producción:** órdenes del Taller al Laboratorio, lotes, validación del químico y entrega.
- **Taller:** qué falta envasar, envasados y materiales por bolsa.
- **Almacén:** cinco almacenes con existencias, movimientos y mínimos. Los movimientos se registran solos con cada lote, envasado y pedido listo.
- Flujo que mantiene activo Supabase (evita la pausa por inactividad).

## 0.2.0 · Pedidos con usuarios reales

**Tipo:** menor.
**Supabase:** `0001_pedidos.sql` y `0002_ajustes_app.sql`.

- Primera versión publicada en GitHub Pages y conectada a Supabase.
- Inicio de sesión, perfiles (Socio, Administrativo, Vendedor, Taller, Despacho, Laboratorio) y reglas de quién ve y cambia qué.
- **Pedidos:** catálogo, carrito, registro y avance Recibido → En taller → Listo → Despachado → Entregado, y consolidado para el Taller.

## 0.1.0 · Prototipo

**Tipo:** inicial.

- Diseño de pantallas del módulo Pedidos, inspirado en una tienda en línea, sin base de datos.
- Antes de eso se definió la estructura organizacional de la empresa: direcciones, áreas y flujos de cada área.

# Pinturas Liz · Sistema

Aplicación web instalable (PWA) para celular y computadora, con usuarios y base de datos en Supabase.

| Módulo | Para qué sirve | Quién lo usa |
| --- | --- | --- |
| **Pedidos** | Se elige el cliente, el catálogo muestra sus precios por docena, carrito, registro del pedido y su avance: Recibido → En taller → Listo → Despachado → Entregado | Ventas, Administración, Taller, Despacho, Socios |
| **Clientes** | Ficha de cada cliente y sus precios por docena con fecha de vigencia e historial | Administración y Socios editan; Ventas consulta y agrega el primer precio |
| **Cobranzas** | Saldos por cobrar, cobros con recibo numerado, cuadre del dinero que llega a Administración, límite de crédito por cliente | Ventas, Administración, Socios |
| **Producción** | Órdenes que llegan del Taller, lotes fabricados, validación del químico y entrega del lote al Taller | Laboratorio, Socios |
| **Taller** | Qué falta envasar, registro de envasados, órdenes al Laboratorio y materiales que consume cada bolsa | Taller, Despacho, Administración, Socios |
| **Almacén** | Existencias y movimientos de los cinco almacenes, mínimos y alertas | Cada área ve sus almacenes |
| **Alertas y Novedades** (campana) | Alertas: datos que faltan o están mal, con comentarios. Novedades: clientes creados y precios registrados o cambiados por el equipo | Socios: alertas y novedades. Administración: novedades. Todos pueden avisar un error |
| **Usuarios** | Asignar el perfil de cada persona (desde *Mi cuenta*) | Socios |

---

## 1. Cómo funciona el sistema

El sistema tiene tres piezas. Cada una hace una sola cosa:

```
  Tu computadora (VS Code)          GitHub                          Supabase
  ────────────────────────          ──────────────────────          ──────────────────────────
  Editas el código        ──push──▶ Guarda el código
                                    Actions compila la app
                                    Pages la publica en ───────────▶ (la app ya publicada habla
                                    estadisticoj.github.io           directo con Supabase)
                                                                     · Usuarios y contraseñas
  Celulares y computadoras ◀──── abren la dirección web ──────────▶ · Base de datos
  de la empresa                                                      · Reglas de quién ve qué
                                                                     · Cambios en vivo
```

- **GitHub guarda el código y publica la aplicación.** Cada vez que subes cambios a la rama `main`,
  el flujo `desplegar.yml` la compila y la publica en GitHub Pages. Tarda unos 2 minutos.
  Ver el avance en la pestaña **Actions** del repositorio.
- **Supabase guarda los datos y controla el acceso.** La aplicación publicada se conecta directo a Supabase
  con la URL y la clave *publishable* (los secretos de GitHub). Supabase verifica quién entra
  y aplica las reglas: por ejemplo, un vendedor solo ve sus pedidos, aunque intente ver los demás.
- **La base de datos no se actualiza sola con GitHub.** Los cambios de tablas y reglas (archivos en
  `supabase/migrations/`) se ejecutan a mano en el **SQL Editor** de Supabase, una vez cada uno y en orden.
  Por eso la opción *Deploy to production* de la integración con GitHub debe quedar **apagada**:
  si estuviera encendida, intentaría ejecutarlos otra vez y fallaría.

### Cómo se mantiene encendido

| Pieza | ¿Se apaga sola? | Qué hacemos |
| --- | --- | --- |
| GitHub Pages | No. La página queda publicada siempre | Nada |
| Supabase (plan gratuito) | Sí: pausa el proyecto si pasa **7 días** con poca actividad. Los datos no se pierden | El flujo `mantener-activo.yml` consulta la base cada dos días. El uso diario de la app también cuenta como actividad |
| Flujo `mantener-activo.yml` | GitHub desactiva los flujos programados si el repositorio pasa **60 días sin cambios** | Te llegará un correo de GitHub; entra a **Actions** y pulsa *Enable workflow* |

Si un día el proyecto aparece pausado: en Supabase, abre el proyecto y pulsa **Resume project**.
Vuelve con todos sus datos en unos minutos. Para no depender de esto, el plan Pro de Supabase no se pausa.

### Dónde mirar si algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| La página no cambió después de subir código | GitHub > **Actions**: el último flujo debe estar en verde |
| "Falta conectar Supabase" | GitHub > Settings > Secrets: nombres `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` |
| "Tu perfil no tiene permiso…" | Supabase > SQL Editor: revisa que todas las migraciones estén ejecutadas |
| Nadie puede entrar | Supabase > página del proyecto: ¿está pausado? |

---

## 2. Contenido del proyecto

| Carpeta / archivo | Para qué sirve |
| --- | --- |
| `src/main.js` | Arranque, inicio de sesión y eventos |
| `src/nucleo.js` | Estado compartido, perfiles y utilidades |
| `src/datos.js` | Todas las llamadas a Supabase |
| `src/modulos/` | Un archivo por módulo: `pedidos`, `clientes`, `cobranzas`, `produccion`, `taller`, `almacen`, `alertas`, `usuarios` |
| `src/estilos.css` | Estilos |
| `src/productos/` | Fotos de los productos para el catálogo. Su `LEEME.md` dice cómo nombrar cada archivo |
| `HISTORIAL_VERSIONES.md` | Qué trajo cada versión y cómo se numeran |
| `public/` | Íconos de la aplicación instalable |
| `supabase/migrations/` | Cambios de base de datos, numerados. Se ejecutan en orden y una sola vez cada uno |
| `supabase/semillas/` | Datos de ejemplo para pruebas y el script del primer socio |
| `supabase/datos/` | Datos reales: limpieza de pruebas, carga desde tu Excel y observaciones del archivo |
| `scripts/metadatos_a_sql.py` | Convierte el Excel de metadatos en `supabase/datos/02_carga_metadatos.sql` |
| `.github/workflows/desplegar.yml` | Publica la app en GitHub Pages al subir cambios a `main` |
| `.github/workflows/mantener-activo.yml` | Evita que Supabase pause el proyecto |

---

## 3. Cómo actualizar a una versión nueva

Cada versión llega como un .zip con la carpeta `pinturas-liz-app` completa. Sigue siempre este orden:
**primero Supabase, después GitHub**, para que la app nueva encuentre las tablas que necesita.

### 3.1 Supabase: ejecutar solo las migraciones nuevas

1. Mira la tabla de versiones al final de este archivo: dice qué migraciones trae cada versión.
2. En Supabase > **SQL Editor** > **New query**, pega el contenido de cada migración nueva, en orden, y pulsa **Run**.
3. Debe decir *Success. No rows returned*. Si aparece un aviso de operaciones destructivas, revisa que sea
   la migración correcta y confirma.
4. Si sale "already exists", esa migración ya estaba ejecutada: no la repitas y sigue con la siguiente.

### 3.2 VS Code: reemplazar los archivos

1. Descomprime el .zip nuevo en una carpeta temporal (por ejemplo, el Escritorio).
2. Copia **todo el contenido** de la carpeta `pinturas-liz-app` nueva y pégalo dentro de tu carpeta de trabajo
   (`D:\Proyectos\pinturas-liz-app`). Cuando Windows pregunte, elige **Reemplazar los archivos**.
   - No borres tu carpeta: dentro está la carpeta oculta `.git`, que conecta con GitHub.
   - El .zip no trae `.env` ni `node_modules`, así que no los toca.
3. Abre esa carpeta en VS Code. En el panel **Source Control** (ícono de ramas, a la izquierda) verás los archivos cambiados.

### 3.3 GitHub: subir los cambios

En la terminal de VS Code (**Terminal > New Terminal**):

```bash
git add .
git commit -m "Versión 0.5.0: fotos de productos en el catálogo"
git push
git tag v0.5.0
git push --tags
```

La etiqueta (`git tag`) marca la versión en GitHub (pestaña *Tags*), para poder volver a ella si hace falta.

O sin terminal: en **Source Control** escribe el mensaje, pulsa **Commit** y luego **Sync Changes**.

### 3.4 Comprobar

1. GitHub > **Actions**: espera a que el flujo *Desplegar en GitHub Pages* quede en verde (unos 2 minutos).
2. Abre la app y recarga la página. Si sigue viéndose la versión anterior, cierra la pestaña y vuelve a abrirla:
   la aplicación instalada se actualiza sola en la siguiente apertura.

---

## 4. Instalación desde cero (solo la primera vez)

Ya lo hiciste; queda aquí como referencia.

1. Supabase: crear el proyecto y ejecutar todas las migraciones en orden; opcionalmente `semillas/catalogo_ejemplo.sql`.
2. GitHub: subir el proyecto, crear los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (la clave *publishable*, `sb_publishable_...`) y elegir **GitHub Actions** en Settings > Pages.
3. Supabase > Authentication > URL Configuration: *Site URL* y *Redirect URLs* con la dirección de la app.
4. Crear tu cuenta en la app y ejecutar `semillas/primer_socio.sql` con tu correo.

Para probar en tu computadora antes de subir (opcional, requiere [Node.js](https://nodejs.org) 20+):

```bash
npm install
copy .env.example .env    # y completa la URL y la clave
npm run dev
```

---

## 5. Primeros pasos con los módulos nuevos (v0.3.0)

Para probar sin cargar datos reales: ejecuta `supabase/semillas/almacen_ejemplo.sql` en el SQL Editor
(requiere el catálogo de ejemplo). Para quitarlo después: `supabase/semillas/limpiar_almacen_ejemplo.sql`.

Para que el Taller y el Almacén calculen bien con datos reales, carga esto una vez:

1. **Almacén > Insumos** (Administración o Laboratorio): crea los insumos (pigmentos, espesantes…) con su unidad
   y registra la compra inicial con la cantidad que hay hoy.
2. **Almacén > Materiales** (Administración o Taller): crea frascos de cada medida, tapas, etiquetas y bolsas,
   y registra lo que hay hoy.
3. **Taller > Materiales por bolsa**: para cada presentación, indica cuántos frascos, tapas, etiquetas y bolsas
   consume una bolsa (por ejemplo, 30 ml × 12: 12 frascos, 12 tapas, 12 etiquetas y 1 bolsa).
4. **Almacén > Granel Taller y Producto envasado**: si hoy ya hay baldes o bolsas, usa *Ajustar por conteo*
   para registrar lo que existe.

Cómo se mueven solos los almacenes:

| Acción | Efecto en el almacén |
| --- | --- |
| El Laboratorio registra un lote | Salen los insumos usados |
| El químico aprueba el lote | Entra a **Granel Laboratorio** (la reserva) |
| El Laboratorio entrega el lote | Pasa de **Granel Laboratorio** a **Granel Taller** y la orden queda atendida |
| El Taller registra un envasado | Sale granel y materiales, entra **Producto envasado** |
| Un pedido pasa a **Listo** | Sus bolsas salen de **Producto envasado** |
| Administración confirma un cobro | Deja de figurar como dinero por entregar |

Si el Taller marca pedidos como listos sin haber registrado los envasados, el producto envasado quedará en
negativo. Es una señal para registrar los envasados o ajustar por conteo, no un error del sistema.

Las cantidades de granel se manejan en **litros**, calculados como bolsas × frascos × ml.

---

## 6. Precios

- Los precios se guardan **por docena**, por cliente, producto y medida. Un paquete de 6 cuesta la mitad.
- **No hay precios de lista.** Cada precio es de un cliente.
- Si el cliente es nuevo o no tiene precio para esa medida, al hacer el pedido la app pide **escribir el precio
  por docena acordado** o usar el **precio sugerido**. Ese precio queda guardado como precio del cliente.
- **Precio sugerido**: el precio por docena que más clientes pagan hoy por ese producto y medida (la moda).
  **Medida habitual**: la medida de cada producto que más clientes compran. El catálogo muestra el sugerido de la
  medida habitual, la hoja del producto la elige por defecto y hay botones para usar ambos.
- Si cambias el cliente de un pedido, el carrito se recalcula con los precios del nuevo cliente; lo que no tenga
  precio queda marcado en el carrito para escribirlo ahí mismo.
- Quién puede hacer qué:

  | Acción | Socio | Administración | Ventas |
  | --- | --- | --- | --- |
  | Escribir el primer precio de un cliente (en el pedido o con *Agregar precio*) | Sí | Sí | Sí |
  | Cambiar un precio que ya existe | Sí | Sí | No: avisa a los socios |
  | Agregar una medida nueva a un producto (por ejemplo, la primera de Pegatransfer) | Sí | No | No |

- Un precio nunca se borra: al cambiarlo se elige desde qué fecha rige, y el anterior queda en el historial
  hasta el día antes. Se puede programar un alza con fecha futura.
- El pedido guarda el precio del día en que se registró; cambios posteriores no lo alteran.
- Los precios del Excel rigen desde el **01/01/2026**. Cuando un cliente tenía dos precios distintos para lo mismo,
  el de arriba quedó como precio de 2025 (en el historial) y el de abajo como el vigente.
- Cada vendedor se vincula con su nombre de la lista (Jorge, Lily…) en **Mi cuenta > Administrar usuarios**.
  Así ve primero sus clientes y los clientes que crea quedan a su nombre.

Desde ahora los clientes y precios se mantienen en la aplicación. El Excel ya no es la fuente: no vuelvas a
ejecutar la carga, porque duplicaría clientes.

### Novedades (campana de la barra superior)

- Cuando alguien crea un cliente o registra o cambia un precio, socios y Administración lo ven en **Novedades**,
  con quién lo hizo y el precio anterior. Es solo informativo: no hay que aprobar nada.
- El número amarillo de la campana suma las alertas abiertas y las novedades que aún no viste.

### Alertas (campana de la barra superior)

- La carga del Excel dejó una alerta por cada dato faltante o dudoso: precios en cero, precios repetidos,
  productos sin precio o sin código y clientes sin teléfono, dirección o documento.
- Cualquier persona puede usar **Avisar un error** (en la campana, en *Mi cuenta* o en la ficha del cliente).
- En cada alerta se conversa con comentarios. Solo un socio la marca como **resuelta** (o la reabre).
  Las de *Falta precio* y *Producto sin precio* se resuelven solas al registrar el precio.

## 7. Fotos de productos

Las fotos van en `src/productos/`, una por producto, con el nombre del producto en minúsculas, sin tildes y con
guiones: *Mate FLT* → `mate-flt.webp`. La lista completa de nombres está en `src/productos/LEEME.md`.
Al subir los cambios a GitHub, la app las muestra sola en el catálogo y en la hoja del producto.

## 8. Seguridad

- La clave *publishable* es pública por diseño; lo que protege los datos son las reglas de las migraciones.
- Nunca pongas la clave **secret** (`sb_secret_...`) en GitHub ni en la aplicación.
- Los movimientos de almacén y los cobros no se borran: se corrigen con un ajuste o se anulan, y queda registrado quién lo hizo.

---

## 9. Versiones

La historia detallada está en `HISTORIAL_VERSIONES.md`.

| Versión | Migraciones a ejecutar | Cambios |
| --- | --- | --- |
| 0.2.0 | 0001, 0002 | Pedidos con usuarios reales, perfiles, catálogo, consolidado y Usuarios |
| 0.3.0 | 0003 | Cobranzas, Producción, Taller y Almacén. Saldo y cobro en el detalle del pedido. Usuarios pasa a *Mi cuenta*. Flujo que mantiene activo Supabase |
| 0.4.0 | 0004, luego `datos/01_limpiar_pruebas.sql` y `datos/02_carga_metadatos.sql` | Datos reales: 302 clientes, 42 productos, 423 colores y 2.079 precios. Precios por docena con vigencia e historial. Módulo Clientes. Vendedores vinculados a usuarios |
| 0.4.1 | (0004 si no la ejecutaste) 0005, luego `datos/01_limpiar_pruebas.sql` y `datos/02_carga_metadatos.sql` nuevos | Carga desde el Excel corregido: precios repetidos como historial 2025 → 2026, productos nuevos sin código, sin precios en cero. Sin precios de lista: precio escrito a mano para clientes nuevos o sin precio. Solo socios agregan medidas. Alertas con comentarios para socios |
| 0.4.2 | **0006** | Precio sugerido (moda) y medida habitual con botones para usarlos. Novedades para socios y Administración (clientes y precios nuevos). El carrito se recalcula al cambiar de cliente. Colores y logo de la marca. La app se actualiza sola en cada celular y muestra su versión en *Mi cuenta* |
| 0.5.0 | — | Fotos de productos en el catálogo (carpeta `src/productos`). Historial de versiones |

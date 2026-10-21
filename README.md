# Pinturas Liz · Sistema

Aplicación web instalable (PWA) para celular y computadora, con usuarios y base de datos en Supabase.
Cubre pedidos, clientes y precios, cobranzas, producción, taller y almacén de Pinturas Liz.

**Este archivo es para quien mantiene el sistema** (instalar, publicar, actualizar). Hay dos documentos más:

| Documento | Para quién | Qué contiene |
| --- | --- | --- |
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Las personas que usan la app | Perfiles, módulos, qué puede hacer cada perfil y cómo hacerlo. Su PDF se abre desde la app (*Mi cuenta → Manual de usuario*) |
| [`HISTORIAL_VERSIONES.md`](HISTORIAL_VERSIONES.md) | Todos | **Única** historia de versiones: qué cambió en cada una y qué ejecutar en Supabase |

Versión actual: **0.8.0** · Dirección: https://estadisticoj.github.io/pinturas-liz-app/

---

## 1. Cómo funciona

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

- **GitHub guarda el código y publica la aplicación.** Cada vez que subes cambios a `main`, el flujo
  `desplegar.yml` la compila y la publica en GitHub Pages (unos 2 minutos; el avance se ve en **Actions**).
- **Supabase guarda los datos y controla el acceso.** Las reglas de permisos viven en la base de datos
  (RLS y funciones), no en la app: un vendedor solo ve sus pedidos aunque intente ver los demás.
- **La base de datos no se actualiza sola.** Los archivos de `supabase/migrations/` se ejecutan a mano en el
  **SQL Editor**, una vez cada uno y en orden. Por eso *Deploy to production* de la integración de Supabase con
  GitHub debe estar **apagado**.
- **La app se actualiza sola en cada celular**: al abrirla, al volver a ella y cada 30 minutos busca la versión
  nueva. La versión instalada se ve en *Mi cuenta*.

### Cómo se mantiene encendido

| Pieza | ¿Se apaga sola? | Qué hacemos |
| --- | --- | --- |
| GitHub Pages | No | Nada |
| Supabase (plan gratuito) | Pausa el proyecto tras **7 días** sin actividad (los datos no se pierden) | `mantener-activo.yml` consulta la base cada dos días; el uso diario también cuenta |
| Flujo `mantener-activo.yml` | GitHub lo desactiva si el repositorio pasa **60 días** sin cambios | Llega un correo de GitHub: **Actions → Enable workflow** |

Si el proyecto aparece pausado: en Supabase pulsa **Resume project**.

### Dónde mirar si algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| La página no cambió después de subir código | GitHub → **Actions**: el último flujo debe estar en verde |
| «Falta conectar Supabase» | GitHub → Settings → Secrets: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` |
| «Tu perfil no tiene permiso…» | Supabase → SQL Editor: ¿están ejecutadas todas las migraciones? |
| Nadie puede entrar | Supabase: ¿el proyecto está pausado? |
| Alguien olvidó su contraseña | `supabase/semillas/cambiar_clave.sql` |

---

## 2. Contenido del proyecto

| Carpeta / archivo | Para qué sirve |
| --- | --- |
| `src/main.js` | Arranque, inicio de sesión, *Mi cuenta* y cambios en vivo |
| `src/nucleo.js` | Estado compartido, perfiles (`ROLES`) y utilidades |
| `src/datos.js` | Todas las llamadas a Supabase |
| `src/modulos/` | Un archivo por módulo: `pedidos`, `clientes`, `cobranzas`, `produccion`, `taller`, `almacen`, `analisis`, `alertas`, `usuarios` |
| `src/productos/` | Fotos de productos (una por producto). Su `LEEME.md` dice cómo nombrarlas |
| `src/estilos.css` | Estilos (colores de la marca en `:root`) |
| `public/` | Logo, íconos de la app instalable y `docs/` (manual y guías en PDF que abre la app). El *service worker* no atiende `docs/` ni los `.pdf` (`navigateFallbackDenylist` en `vite.config.js`): así el botón abre el PDF y no la app |
| `docs/` | Manual de usuario (fuente en Markdown) y material de capacitación (PowerPoint y PDF) |
| `supabase/migrations/` | Cambios de base de datos, numerados. Se ejecutan en orden y una sola vez |
| `supabase/datos/` | Carga de datos reales (Excel), limpieza de pruebas y usuarios reales |
| `supabase/semillas/` | Datos de ejemplo y utilidades (primer socio, cambiar contraseña) |
| `scripts/` | `metadatos_a_sql.py` (Excel → SQL) y `generar_docs.sh` (manual Markdown → PDF) |
| `.github/workflows/` | `desplegar.yml` (publica la app) y `mantener-activo.yml` (evita la pausa de Supabase) |

---

## 3. Cómo publicar una versión nueva

Cada versión llega como un .zip con la carpeta `pinturas-liz-app` completa. Orden: **primero Supabase, después GitHub**.

1. **Supabase**: en **SQL Editor → New query**, ejecuta solo las migraciones nuevas que indica
   `HISTORIAL_VERSIONES.md`, en orden y **una por consulta**. Si sale «already exists», ya estaba ejecutada.
2. **VS Code**: descomprime el .zip y copia el contenido de `pinturas-liz-app` dentro de
   `D:\Proyectos\pinturas-liz-app` → **Reemplazar los archivos**. No borres la carpeta (dentro está `.git`).
3. **GitHub**, en la terminal de VS Code:
   ```bash
   git add .
   git commit -m "Versión X.Y.Z: resumen"
   git push
   git tag vX.Y.Z
   git push --tags
   ```
4. **Comprobar**: Actions en verde → abrir la app → *Mi cuenta* muestra la versión nueva.

### Lista de cierre de cada versión (siempre, en el mismo commit)

- [ ] `package.json`: número de versión (MAYOR.MENOR.CORRECCIÓN; ver `HISTORIAL_VERSIONES.md`).
- [ ] `HISTORIAL_VERSIONES.md`: entrada nueva con fecha, tipo, cambios y qué ejecutar en Supabase.
- [ ] `docs/MANUAL_USUARIO.md`: lo que cambió para el usuario + sección *Novedades de esta versión*.
- [ ] PDF del manual regenerado (`scripts/generar_docs.sh`) en `public/docs/`.
- [ ] Material de capacitación actualizado si cambió un flujo que se enseña.
- [ ] Etiqueta `vX.Y.Z` en GitHub.

---

## 4. Base de datos

### Migraciones (`supabase/migrations/`)

| Archivo | Versión | Contenido |
| --- | --- | --- |
| `0001_pedidos.sql` | 0.2.0 | Perfiles, catálogo, clientes, pedidos, historial y reglas base |
| `0002_ajustes_app.sql` | 0.2.0 | Nombres visibles y protección del perfil de socio |
| `0003_modulos.sql` | 0.3.0 | Almacén, producción, taller y cobranzas |
| `0004_precios_clientes.sql` | 0.4.0 | Vendedores, datos de cliente y precios por docena con vigencia |
| `0005_alertas_precio_manual.sql` | 0.4.1 | Alertas con comentarios, precio a mano, medidas solo por socios |
| `0006_precio_sugerido_novedades.sql` | 0.4.2 | Precio sugerido, medida habitual y novedades |
| `0007_estados_nuevos.sql` | 0.6.0 | Estado *En revisión* y pago *Adelanto* (va solo) |
| `0008_unidades_revision.sql` | 0.6.0 | Frascos y unidades, modificación, revisión, reglas de cobro |
| `0009_perfil_desarrollador.sql` | 0.7.0 | Perfil *Desarrollador* (va solo) |
| `0010_permisos_v07.sql` | 0.7.0 | Permisos por perfil de la 0.7.0 y novedades de clientes |
| `0011_analisis.sql` | 0.8.0 | Función `analisis(desde, hasta)` del módulo Análisis (solo socio, desarrollador y administrativo). No cambia datos |

### Datos (`supabase/datos/`)

| Archivo | Cuándo |
| --- | --- |
| `01_limpiar_pruebas.sql` | Antes de cargar el Excel (borra datos de prueba, no usuarios) |
| `02_carga_metadatos.sql` | Carga de productos, clientes y precios del Excel (generado por `scripts/metadatos_a_sql.py`) |
| `03_usuarios_reales.sql` | Borra cuentas y operaciones de prueba y crea las 10 cuentas reales |
| `04_datos_demo.sql` | **Opcional, solo para pruebas.** Carga ~220 pedidos, cobros, órdenes, lotes, envasados y compras de ejemplo de los últimos meses (notas `[DEMO]`, referencias `DEMO…`, artículos `(demo)`). Se niega a correr dos veces |
| `05_borrar_datos_demo.sql` | Borra **solo** lo que cargó `04` y termina mostrando una verificación (todo en 0). Ejecutar antes de empezar a usar la app de verdad |

### Reglas importantes

- Los permisos se definen en la base de datos: `rol_actual()`, `tiene_rol()`, políticas RLS y funciones
  `security definer`. La app solo decide qué botones mostrar. El detalle por perfil está en el manual.
- El perfil **Desarrollador** cuenta como **Socio** en todas las reglas (`rol_actual()` responde `socio`);
  `es_desarrollador()` lo distingue.
- Movimientos de almacén, cobros, precios e historial de pedidos no se borran: se corrigen o anulan.
  La única excepción es `05_borrar_datos_demo.sql`, que borra los datos de demostración.

---

## 5. Instalación desde cero (referencia)

1. Supabase: crear el proyecto y ejecutar todas las migraciones en orden (0007 y 0009 cada una sola).
2. GitHub: subir el proyecto, crear los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave *publishable*)
   y elegir **GitHub Actions** en Settings → Pages.
3. Supabase → Authentication → URL Configuration: *Site URL* y *Redirect URLs* con la dirección de la app.
4. Datos: `datos/01`, `datos/02` y `datos/03_usuarios_reales.sql`.

Para probar en la computadora (opcional, requiere Node.js 20+):

```bash
npm install
copy .env.example .env    # y completa la URL y la clave
npm run dev
```

Para regenerar los PDF del manual (requiere `pandoc` y `wkhtmltopdf`): `bash scripts/generar_docs.sh`.

---

## 6. Seguridad

- La clave *publishable* es pública por diseño; lo que protege los datos son las reglas de las migraciones.
- Nunca pongas la clave **secret** (`sb_secret_...`) en GitHub ni en la aplicación.
- `.env` no se sube a GitHub (está en `.gitignore`).
- Las contraseñas temporales de `03_usuarios_reales.sql` deben cambiarse en el primer ingreso (*Mi cuenta → Cambiar contraseña*).

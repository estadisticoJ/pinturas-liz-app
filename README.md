# Pinturas Liz · Sistema

Aplicación web instalable (PWA) para móvil y escritorio, con base de datos y usuarios en Supabase.
Módulo listo: **Pedidos** (catálogo, carrito, registro, seguimiento por estados y consolidado para el Taller).
Próximos: Cobranzas, Producción y Almacén.

## Contenido

| Carpeta / archivo | Para qué sirve |
| --- | --- |
| `src/` | Código de la aplicación (`main.js` pantallas, `datos.js` llamadas a Supabase, `estilos.css`) |
| `public/` | Íconos de la aplicación instalable |
| `supabase/migrations/` | Cambios de base de datos, numerados. Se ejecutan en orden y una sola vez cada uno |
| `supabase/semillas/` | Datos iniciales: catálogo de ejemplo y primer socio |
| `.github/workflows/desplegar.yml` | Publica la aplicación en GitHub Pages cada vez que subes cambios a `main` |
| `.env.example` | Plantilla de la conexión a Supabase |

## 1. Preparar Supabase (una vez)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y ejecuta, en este orden, el contenido de:
   1. `supabase/migrations/0001_pedidos.sql`
   2. `supabase/migrations/0002_ajustes_app.sql`
   3. `supabase/semillas/catalogo_ejemplo.sql` (opcional: catálogo de prueba, con precios inventados)
3. En **Project Settings > API** copia la *Project URL* y la clave *anon public*.

Si ya ejecutaste `esquema_pedidos.sql` antes, es el mismo contenido que `0001`: empieza desde `0002`.

## 2. Probar en tu computadora (VS Code)

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
# edita .env con la URL y la clave anon de tu proyecto
npm run dev
```

Abre la dirección que muestra la terminal (normalmente `http://localhost:5173`).

## 3. Crear el primer socio

1. En la aplicación, pestaña **Crear cuenta**, regístrate con tu correo y confirma el correo que te llega.
2. En el SQL Editor ejecuta `supabase/semillas/primer_socio.sql`, cambiando el correo por el tuyo.
3. Entra de nuevo: ya verás el módulo **Usuarios**, donde asignas el perfil de cada persona que cree su cuenta.

Perfiles: Socio, Administrativo, Vendedor, Encargado de pedidos (Taller), Despacho y Laboratorio.
Quien crea una cuenta queda **sin perfil** y no ve nada hasta que un socio se lo asigne.

## 4. Publicar con GitHub

1. Crea un repositorio en GitHub y sube el proyecto desde VS Code (*Source Control > Publish to GitHub*).
2. En el repositorio: **Settings > Secrets and variables > Actions > New repository secret**, crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En **Settings > Pages**, en *Source* elige **GitHub Actions**.
4. Sube cualquier cambio a `main` (o ejecuta el flujo desde la pestaña **Actions**). Al terminar, la dirección
   aparece en **Settings > Pages**, por ejemplo `https://tu-usuario.github.io/pinturas-liz-app/`.
5. En Supabase, **Authentication > URL Configuration**: pon esa dirección como *Site URL* y agrégala en
   *Redirect URLs*, para que los correos de confirmación lleven a la aplicación publicada.

Para instalarla en el celular: abre la dirección en Chrome (Android) o Safari (iPhone) y elige
*Agregar a pantalla de inicio*.

## Seguridad

- La clave *anon* es pública por diseño; lo que protege los datos son las reglas RLS de las migraciones.
- Quién ve qué pedidos y quién puede pasar un pedido de un estado a otro lo decide la base de datos,
  no la pantalla. Por ejemplo, un vendedor solo ve sus pedidos y solo el Taller (o un socio) puede marcarlos como listos.
- Nunca subas el archivo `.env` ni la clave *service_role* al repositorio.

## Cómo se entregan los cambios

Cada refinamiento trae:
- el código actualizado de la aplicación (reemplaza los archivos y sube a GitHub), y
- una migración nueva en `supabase/migrations/` con el siguiente número. Ejecuta solo las que aún no ejecutaste.

| Versión | Migraciones | Cambios |
| --- | --- | --- |
| 0.2.0 | 0001, 0002 | Pedidos con usuarios reales, perfiles, catálogo, consolidado y módulo Usuarios |

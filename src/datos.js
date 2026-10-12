// Acceso a Supabase. Todas las reglas de quién puede ver o cambiar qué viven en la base (RLS),
// así que estas funciones solo piden datos y devuelven errores legibles.
import { supabase } from './supabase.js';

function revisar({ data, error }) {
  if (error) throw new Error(traducir(error));
  return data;
}
function traducir(error) {
  const m = error.message || '';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar; revisa tu bandeja de entrada.';
  if (/User already registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Entra con tu contraseña.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/row-level security|permission denied/i.test(m)) return 'Tu perfil no tiene permiso para esta acción.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet.';
  return m;
}

/* ---------- Sesión y perfil ---------- */
export async function sesionActual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function alCambiarSesion(cb) {
  return supabase.auth.onAuthStateChange((_evento, sesion) => cb(sesion));
}
export async function entrar(email, password) {
  return revisar(await supabase.auth.signInWithPassword({ email, password }));
}
export async function registrarse(nombre, email, password) {
  const r = revisar(await supabase.auth.signUp({
    email, password, options: { data: { nombre }, emailRedirectTo: location.href.split('#')[0] }
  }));
  return { requiereConfirmar: !r.session };
}
export async function salir() {
  await supabase.auth.signOut();
}
export async function miPerfil(id) {
  return revisar(await supabase.from('perfiles').select('id, nombre, rol, activo').eq('id', id).maybeSingle());
}

/* ---------- Catálogo y clientes ---------- */
export async function catalogo() {
  const filas = revisar(await supabase.from('productos')
    .select(`id, nombre, linea, descripcion,
      colores:colores!colores_producto_id_fkey(id, nombre, hex, activo),
      presentaciones:presentaciones!presentaciones_producto_id_fkey(id, medida_ml, unidades, precio, activo)`)
    .eq('activo', true).order('nombre'));
  return filas.map(p => ({
    ...p,
    colores: p.colores.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    presentaciones: p.presentaciones.filter(x => x.activo).map(x => ({ ...x, precio: Number(x.precio) }))
      .sort((a, b) => a.medida_ml - b.medida_ml || b.unidades - a.unidades)
  })).filter(p => p.colores.length && p.presentaciones.length);
}
export async function clientes() {
  return revisar(await supabase.from('clientes').select('id, nombre, zona, telefono').eq('activo', true).order('nombre'));
}
export async function crearCliente({ nombre, telefono, vendedorId }) {
  return revisar(await supabase.from('clientes')
    .insert({ nombre, telefono: telefono || null, vendedor_id: vendedorId }).select('id, nombre, zona, telefono').single());
}

/* ---------- Pedidos ---------- */
const SELECT_PEDIDO = `id, numero, canal, condicion, dias_credito, entrega, agencia, fecha_entrega, notas, estado, total, creado, creado_por,
  cliente:clientes!pedidos_cliente_id_fkey(nombre, telefono),
  creador:perfiles!pedidos_creado_por_fkey(nombre),
  items:pedido_items!pedido_items_pedido_id_fkey(bolsas, precio,
    producto:productos!pedido_items_producto_id_fkey(nombre),
    color:colores!pedido_items_color_id_fkey(nombre, hex),
    presentacion:presentaciones!pedido_items_presentacion_id_fkey(medida_ml, unidades)),
  historial:pedido_historial!pedido_historial_pedido_id_fkey(estado, cuando,
    por:perfiles!pedido_historial_por_fkey(nombre))`;

export const codigo = numero => 'P-' + String(numero).padStart(5, '0');

function normalizar(p) {
  return {
    id: p.id, numero: p.numero, codigo: codigo(p.numero), creado: p.creado, creadoPor: p.creado_por,
    creadoPorNombre: p.creador?.nombre || '—',
    cliente: { nombre: p.cliente?.nombre || '—', telefono: p.cliente?.telefono || '' },
    canal: p.canal, condicion: p.condicion, diasCredito: p.dias_credito, entrega: p.entrega, agencia: p.agencia || '',
    fechaEntrega: p.fecha_entrega, notas: p.notas || '', estado: p.estado, total: Number(p.total),
    items: (p.items || []).map(i => ({
      nombre: i.producto?.nombre || '', color: i.color?.nombre || '', hex: i.color?.hex || '#CCCCCC',
      ml: i.presentacion?.medida_ml, und: i.presentacion?.unidades, precio: Number(i.precio), cant: i.bolsas
    })),
    historial: (p.historial || []).sort((a, b) => a.cuando.localeCompare(b.cuando))
      .map(h => ({ estado: h.estado, cuando: h.cuando, por: h.por?.nombre || '—' }))
  };
}
export async function pedidos() {
  const filas = revisar(await supabase.from('pedidos').select(SELECT_PEDIDO).order('creado', { ascending: false }).limit(300));
  return filas.map(normalizar);
}
export async function crearPedido(pedido, items) {
  return revisar(await supabase.rpc('crear_pedido', { pedido, items }));
}
export async function cambiarEstado(id, estado) {
  revisar(await supabase.from('pedidos').update({ estado }).eq('id', id).select('id').single());
}
export function escucharPedidos(cb) {
  const canal = supabase.channel('pedidos-en-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => cb())
    .subscribe();
  return () => supabase.removeChannel(canal);
}

/* ---------- Usuarios (solo socios) ---------- */
export async function perfiles() {
  return revisar(await supabase.from('perfiles').select('id, nombre, rol, activo').order('nombre'));
}
export async function cambiarPerfil(id, cambios) {
  revisar(await supabase.from('perfiles').update(cambios).eq('id', id).select('id').single());
}

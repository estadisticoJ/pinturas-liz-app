// Acceso a Supabase. Las reglas de quién puede ver o cambiar qué viven en la base (RLS y funciones),
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
  if (/JSON object requested|0 rows|no rows/i.test(m)) return 'Tu perfil no tiene permiso para esta acción.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (/articulos_nombre_unico|duplicate key/i.test(m)) return 'Ya existe un registro con ese nombre.';
  return m;
}

/* ---------- Sesión y perfil ---------- */
export function alCambiarSesion(cb) { return supabase.auth.onAuthStateChange((_e, sesion) => cb(sesion)); }
export async function entrar(email, password) { return revisar(await supabase.auth.signInWithPassword({ email, password })); }
export async function registrarse(nombre, email, password) {
  const r = revisar(await supabase.auth.signUp({ email, password, options: { data: { nombre }, emailRedirectTo: location.href.split('#')[0] } }));
  return { requiereConfirmar: !r.session };
}
export async function cambiarClave(clave) { revisar(await supabase.auth.updateUser({ password: clave })); }
export async function salir() { await supabase.auth.signOut(); }
export async function miPerfil(id) {
  return revisar(await supabase.from('perfiles').select('id, nombre, rol, activo').eq('id', id).maybeSingle());
}

/* ---------- Catálogo y clientes ---------- */
export async function catalogo() {
  const filas = revisar(await supabase.from('productos')
    .select(`id, nombre, linea, descripcion,
      colores:colores!colores_producto_id_fkey(id, codigo, nombre, hex, activo),
      presentaciones:presentaciones!presentaciones_producto_id_fkey(id, medida_ml, unidades, activo)`)
    .eq('activo', true).order('nombre'));
  return filas.map(p => ({
    ...p,
    colores: p.colores.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    presentaciones: p.presentaciones.filter(x => x.activo)
      .sort((a, b) => a.medida_ml - b.medida_ml || b.unidades - a.unidades)
  })).filter(p => p.colores.length);
}
const CAMPOS_CLIENTE = 'id, codigo, nombre, zona, lugar, telefono, correo, direccion, documento_tipo, documento, agencia_habitual, condicion_habitual, dias_credito_habitual, notas, limite_credito, vendedor_codigo';
export async function clientes() {
  return revisar(await supabase.from('clientes').select(CAMPOS_CLIENTE).eq('activo', true).order('nombre'));
}
export async function crearCliente({ nombre, telefono }) {
  return revisar(await supabase.from('clientes').insert({ nombre, telefono: telefono || null }).select(CAMPOS_CLIENTE).single());
}
export async function guardarCliente(id, campos) {
  return revisar(await supabase.from('clientes').update(campos).eq('id', id).select(CAMPOS_CLIENTE).single());
}
export async function cambiarLimite(id, limite) {
  revisar(await supabase.from('clientes').update({ limite_credito: limite }).eq('id', id).select('id').single());
}
export async function vendedores() {
  return revisar(await supabase.from('vendedores').select('codigo, nombre, perfil_id, activo').order('nombre'));
}
export async function vincularVendedor(perfilId, codigo) {
  revisar(await supabase.from('vendedores').update({ perfil_id: null }).eq('perfil_id', perfilId).select('codigo'));
  if (codigo) revisar(await supabase.from('vendedores').update({ perfil_id: perfilId }).eq('codigo', codigo).select('codigo').single());
}

/* ---------- Precios (por docena, con vigencia) ---------- */
export async function preciosVigentes(clienteId) {
  if (!clienteId) return [];                               // desde 0.4.1 no hay precios de lista
  return revisar(await supabase.rpc('precios_vigentes', { p_cliente: clienteId || null }))
    .map(p => ({ ...p, precio_docena: Number(p.precio_docena) }));
}
export async function historialPrecios(clienteId) {
  let q = supabase.from('precios').select('id, cliente_id, producto_id, medida_ml, precio_docena, vigente_desde, vigente_hasta, nota, creado, persona:perfiles!precios_registrado_por_fkey(nombre)');
  q = q.eq('cliente_id', clienteId);
  return revisar(await q.order('vigente_desde', { ascending: false }).limit(500)).map(p => ({ ...p, precio_docena: Number(p.precio_docena) }));
}
export async function fijarPrecio({ cliente, producto, medida, precio, desde, nota }) {
  return revisar(await supabase.rpc('fijar_precio', { p_cliente: cliente || null, p_producto: producto, p_medida: medida, p_precio: precio, p_desde: desde, p_nota: nota || null }));
}
export async function quitarPrecio(id) { revisar(await supabase.rpc('quitar_precio', { p_precio: id })); }
// Precio común (el que más clientes pagan), máximo y mínimo por producto y medida, y medida habitual por producto
export async function referenciasPrecio() {
  const [ref, hab] = await Promise.all([supabase.rpc('precios_referencia'), supabase.rpc('medidas_habituales')]);
  const r = revisar(ref), h = revisar(hab);
  return {
    precios: Object.fromEntries(r.map(x => [x.producto_id + '|' + x.medida_ml, { comun: Number(x.comun), maximo: Number(x.maximo), minimo: Number(x.minimo), clientes: x.clientes }])),
    habitual: Object.fromEntries(h.map(x => [x.producto_id, x.medida_ml]))
  };
}
// Novedades para socios y Administración: clientes nuevos y precios registrados o cambiados desde la app
export async function novedades() {
  return revisar(await supabase.from('novedades').select('id, tipo, titulo, detalle, cliente_id, creado, por, persona:perfiles!novedades_por_fkey(nombre)')
    .order('creado', { ascending: false }).limit(300));
}
export async function contarNovedades(desde, yo) {
  const { count, error } = await supabase.from('novedades').select('id', { count: 'exact', head: true }).gt('creado', desde).neq('por', yo);
  if (error) throw new Error(traducir(error));
  return count || 0;
}
// Medida nueva de un producto (solo socios)
export async function crearPresentacion(producto, medida, unidades = 12) {
  return revisar(await supabase.rpc('crear_presentacion', { p_producto: producto, p_medida: medida, p_unidades: unidades }));
}

/* ---------- Alertas para socios ---------- */
const SELECT_ALERTA = `id, tipo, titulo, detalle, cliente_id, producto_id, medida_ml, pedido_id, prioridad, origen, estado, creado, resuelta_en,
  cliente:clientes!alertas_cliente_id_fkey(nombre, codigo),
  producto:productos!alertas_producto_id_fkey(nombre),
  autor:perfiles!alertas_creado_por_fkey(nombre),
  resolvio:perfiles!alertas_resuelta_por_fkey(nombre),
  comentarios:alerta_comentarios!alerta_comentarios_alerta_id_fkey(count)`;
export async function alertas(estado) {
  const filas = revisar(await supabase.from('alertas').select(SELECT_ALERTA).eq('estado', estado)
    .order('creado', { ascending: false }).limit(500));
  return filas.map(a => ({ ...a, nComentarios: a.comentarios?.[0]?.count || 0 }));
}
// Alertas urgentes dirigidas a mí o a mi perfil (por ejemplo, un pedido devuelto a revisión)
export async function alertasUrgentes() {
  return revisar(await supabase.from('alertas').select('id, titulo, detalle, pedido_id, para, para_rol, creado')
    .eq('estado', 'abierta').eq('prioridad', 'alta').order('creado', { ascending: false }).limit(20));
}
export async function contarAlertas() {
  const { count, error } = await supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('estado', 'abierta');
  if (error) throw new Error(traducir(error));
  return count || 0;
}
export async function comentariosDe(alertaId) {
  return revisar(await supabase.from('alerta_comentarios').select('id, texto, creado, autor:perfiles!alerta_comentarios_autor_fkey(nombre)')
    .eq('alerta_id', alertaId).order('creado'));
}
export async function comentar(alertaId, texto) {
  revisar(await supabase.from('alerta_comentarios').insert({ alerta_id: alertaId, texto }).select('id').single());
}
export async function crearAlerta({ tipo = 'aviso', titulo, detalle, cliente, producto }) {
  return revisar(await supabase.from('alertas').insert({ tipo, titulo, detalle: detalle || null, cliente_id: cliente || null,
    producto_id: producto || null, para_rol: tipo === 'mejora' ? 'desarrollador' : null }).select('id').single());
}
export async function resolverAlerta(id, resuelta, comentario) {
  revisar(await supabase.rpc('resolver_alerta', { p_alerta: id, p_resuelta: resuelta, p_comentario: comentario || null }));
}

/* ---------- Pedidos ---------- */
const SELECT_PEDIDO = `id, numero, canal, condicion, dias_credito, fecha_vence, entrega, agencia, fecha_entrega, notas, estado, total, creado, creado_por,
  cliente_id, revision_motivo, revision_para, revision_en, revisor:perfiles!pedidos_revision_por_fkey(nombre),
  cliente:clientes!pedidos_cliente_id_fkey(nombre, telefono),
  creador:perfiles!pedidos_creado_por_fkey(nombre),
  items:pedido_items!pedido_items_pedido_id_fkey(frascos, precio_docena, importe, producto_id, color_id, presentacion_id,
    producto:productos!pedido_items_producto_id_fkey(nombre),
    color:colores!pedido_items_color_id_fkey(nombre, hex),
    presentacion:presentaciones!pedido_items_presentacion_id_fkey(medida_ml, unidades)),
  historial:pedido_historial!pedido_historial_pedido_id_fkey(estado, cuando, nota,
    por:perfiles!pedido_historial_por_fkey(nombre))`;

function normalizar(p) {
  return {
    id: p.id, numero: p.numero, codigo: 'P-' + String(p.numero).padStart(5, '0'), creado: p.creado, creadoPor: p.creado_por,
    creadoPorNombre: p.creador?.nombre || '—',
    cliente: { id: p.cliente_id, nombre: p.cliente?.nombre || '—', telefono: p.cliente?.telefono || '' },
    canal: p.canal, condicion: p.condicion, diasCredito: p.dias_credito, fechaVence: p.fecha_vence, entrega: p.entrega, agencia: p.agencia || '',
    revision: p.estado === 'en_revision' ? { motivo: p.revision_motivo, para: p.revision_para, en: p.revision_en, por: p.revisor?.nombre || '—' } : null,
    fechaEntrega: p.fecha_entrega, notas: p.notas || '', estado: p.estado, total: Number(p.total),
    items: (p.items || []).map(i => ({
      nombre: i.producto?.nombre || '', color: i.color?.nombre || '', hex: i.color?.hex || '#CCCCCC',
      color_id: i.color_id, presentacion_id: i.presentacion_id,
      producto_id: i.producto_id, ml: i.presentacion?.medida_ml, und: i.presentacion?.unidades,
      frascos: i.frascos, docena: Number(i.precio_docena), importe: Number(i.importe)
    })),
    historial: (p.historial || []).sort((a, b) => a.cuando.localeCompare(b.cuando))
      .map(h => ({ estado: h.estado, cuando: h.cuando, nota: h.nota || '', por: h.por?.nombre || '—' }))
  };
}
export async function pedidos() {
  const filas = revisar(await supabase.from('pedidos').select(SELECT_PEDIDO).order('creado', { ascending: false }).limit(300));
  return filas.map(normalizar);
}
export async function crearPedido(pedido, items) { return revisar(await supabase.rpc('crear_pedido', { pedido, items })); }
export async function editarPedido(id, pedido, items) { revisar(await supabase.rpc('editar_pedido', { p_pedido: id, pedido, items })); }
export async function marcarEntregado(id) { revisar(await supabase.rpc('marcar_entregado', { p_pedido: id })); }
export async function enviarRevision(id, motivo) { revisar(await supabase.rpc('enviar_revision', { p_pedido: id, p_motivo: motivo })); }
export async function reenviarPedido(id, nota) { revisar(await supabase.rpc('reenviar_pedido', { p_pedido: id, p_nota: nota || null })); }
export async function cambiarEstado(id, estado) {
  revisar(await supabase.from('pedidos').update({ estado }).eq('id', id).select('id').single());
}
export function escuchar(tablas, cb) {
  let canal = supabase.channel('cambios-en-vivo');
  tablas.forEach(t => { canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => cb(t)); });
  canal.subscribe();
  return () => supabase.removeChannel(canal);
}

/* ---------- Cobranzas ---------- */
export async function saldos() {
  const filas = revisar(await supabase.from('saldos_pedidos').select('*').order('vence'));
  return filas.map(s => ({ ...s, total: Number(s.total), cobrado: Number(s.cobrado), saldo: Number(s.saldo),
    limite_credito: s.limite_credito == null ? null : Number(s.limite_credito) }));
}
const SELECT_COBRO = `id, recibo, monto, medio, fecha, notas, estado, creado, recibido_en, pedido_id, cobrado_por,
  pedido:pedidos!cobros_pedido_id_fkey(numero, cliente:clientes!pedidos_cliente_id_fkey(nombre)),
  cobrador:perfiles!cobros_cobrado_por_fkey(nombre), receptor:perfiles!cobros_recibido_por_fkey(nombre)`;
const normCobro = c => ({ ...c, monto: Number(c.monto) });
export async function cobros() {
  return revisar(await supabase.from('cobros').select(SELECT_COBRO).order('creado', { ascending: false }).limit(300)).map(normCobro);
}
export async function cobrosDePedido(pedidoId) {
  return revisar(await supabase.from('cobros').select(SELECT_COBRO).eq('pedido_id', pedidoId).order('creado')).map(normCobro);
}
export async function registrarCobro(cobro) {
  return revisar(await supabase.from('cobros').insert(cobro).select('recibo').single());
}
export async function cerrarCobro(id, estado) {
  revisar(await supabase.from('cobros').update({ estado }).eq('id', id).select('id').single());
}

/* ---------- Producción ---------- */
const COLOR = `color:colores!COLFK(nombre, hex, producto:productos!colores_producto_id_fkey(nombre))`;
export async function ordenes() {
  return revisar(await supabase.from('ordenes_produccion')
    .select(`id, numero, color_id, litros, fecha_requerida, notas, estado, creado,
      ${COLOR.replace('COLFK', 'ordenes_produccion_color_id_fkey')},
      solicitante:perfiles!ordenes_produccion_solicitada_por_fkey(nombre)`)
    .order('creado', { ascending: false }).limit(200)).map(o => ({ ...o, litros: Number(o.litros) }));
}
export async function crearOrden(orden) { return revisar(await supabase.from('ordenes_produccion').insert(orden).select('numero').single()); }
export async function cambiarOrden(id, estado) {
  revisar(await supabase.from('ordenes_produccion').update({ estado }).eq('id', id).select('id').single());
}
export async function lotes() {
  return revisar(await supabase.from('lotes')
    .select(`id, numero, orden_id, color_id, litros, fecha, estado, viscosidad, transparencia, color_ok, notas, validado_en, entregado_en,
      ${COLOR.replace('COLFK', 'lotes_color_id_fkey')},
      orden:ordenes_produccion!lotes_orden_id_fkey(numero),
      registrador:perfiles!lotes_registrado_por_fkey(nombre), validador:perfiles!lotes_validado_por_fkey(nombre),
      insumos:lote_insumos!lote_insumos_lote_id_fkey(cantidad, articulo:articulos!lote_insumos_articulo_id_fkey(nombre, unidad))`)
    .order('creado', { ascending: false }).limit(200)).map(l => ({ ...l, litros: Number(l.litros) }));
}
export async function registrarLote(a) {
  return revisar(await supabase.rpc('registrar_lote', { p_color: a.color, p_litros: a.litros, p_orden: a.orden || null, p_insumos: a.insumos, p_notas: a.notas || '' }));
}
export async function validarLote(a) {
  revisar(await supabase.rpc('validar_lote', { p_lote: a.lote, p_aprobado: a.aprobado, p_viscosidad: a.viscosidad || '',
    p_transparencia: a.transparencia || '', p_color_ok: a.colorOk, p_notas: a.notas || '' }));
}
export async function entregarLote(id) { revisar(await supabase.rpc('entregar_lote', { p_lote: id })); }

/* ---------- Taller ---------- */
export async function porEnvasar() {
  return revisar(await supabase.from('por_envasar').select('*').order('producto')).map(f => ({ ...f,
    frascos: Number(f.frascos), envasado_disponible: Number(f.envasado_disponible), faltan_frascos: Number(f.faltan_frascos), faltan_bolsas: Number(f.faltan_bolsas),
    litros_necesarios: Number(f.litros_necesarios), granel_disponible: Number(f.granel_disponible) }));
}
export async function envasados() {
  return revisar(await supabase.from('envasados')
    .select(`id, numero, color_id, presentacion_id, bolsas, litros, fecha, notas, creado,
      ${COLOR.replace('COLFK', 'envasados_color_id_fkey')},
      presentacion:presentaciones!envasados_presentacion_id_fkey(medida_ml, unidades),
      lote:lotes!envasados_lote_id_fkey(numero), persona:perfiles!envasados_por_fkey(nombre)`)
    .order('creado', { ascending: false }).limit(200)).map(e => ({ ...e, litros: Number(e.litros) }));
}
export async function registrarEnvasado(a) {
  return revisar(await supabase.rpc('registrar_envasado', { p_color: a.color, p_presentacion: a.presentacion, p_bolsas: a.bolsas, p_lote: a.lote || null, p_notas: a.notas || '' }));
}
export async function materialesPorBolsa() {
  return revisar(await supabase.from('presentacion_materiales')
    .select(`presentacion_id, articulo_id, por_bolsa, articulo:articulos!presentacion_materiales_articulo_id_fkey(nombre, unidad)`))
    .map(m => ({ ...m, por_bolsa: Number(m.por_bolsa) }));
}
export async function guardarMaterialPorBolsa(presentacionId, articuloId, porBolsa) {
  revisar(await supabase.from('presentacion_materiales').upsert({ presentacion_id: presentacionId, articulo_id: articuloId, por_bolsa: porBolsa }));
}
export async function quitarMaterialPorBolsa(presentacionId, articuloId) {
  revisar(await supabase.from('presentacion_materiales').delete().eq('presentacion_id', presentacionId).eq('articulo_id', articuloId));
}

/* ---------- Almacén ---------- */
export async function stock(almacenes) {
  return revisar(await supabase.from('stock').select('*').in('almacen', almacenes).order('nombre'))
    .map(s => ({ ...s, existencia: Number(s.existencia), minimo: s.minimo == null ? null : Number(s.minimo) }));
}
export async function movimientos(almacen) {
  return revisar(await supabase.from('movimientos')
    .select(`id, cantidad, motivo, referencia, creado, articulo:articulos!movimientos_articulo_id_fkey(nombre, unidad), persona:perfiles!movimientos_por_fkey(nombre)`)
    .eq('almacen', almacen).order('creado', { ascending: false }).limit(40)).map(m => ({ ...m, cantidad: Number(m.cantidad) }));
}
export async function crearArticulo(a) { return revisar(await supabase.from('articulos').insert(a).select('id').single()); }
export async function registrarMovimiento(m) { revisar(await supabase.from('movimientos').insert(m)); }
export async function fijarMinimo(almacen, articuloId, minimo) {
  revisar(await supabase.from('stock_minimos').upsert({ almacen, articulo_id: articuloId, minimo }));
}

/* ---------- Usuarios (solo socios) ---------- */
export async function perfiles() { return revisar(await supabase.from('perfiles').select('id, nombre, rol, activo').order('nombre')); }
export async function cambiarPerfil(id, cambios) {
  revisar(await supabase.from('perfiles').update(cambios).eq('id', id).select('id').single());
}

// Análisis (0.8.0): todas las métricas del período en una sola llamada. Solo socios, Desarrollador y Administración.
export async function analisis(desde, hasta) {
  const { data, error } = await supabase.rpc('analisis', { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  return data;
}

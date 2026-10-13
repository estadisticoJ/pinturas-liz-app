// Alertas de datos: lo que falta o está mal en los datos (precios en cero, productos sin precio, clientes
// incompletos, precios escritos a mano) llega a los socios como un aviso con comentarios.
// Cualquier perfil puede avisar un error; solo un socio marca la alerta como resuelta.
// Se abre con la campana de la barra superior.
import * as D from '../datos.js';
import { S, R, esc, horaCorta, fechaCorta, esRol, vacio, op, campo, toast, renderTodo, renderNav, renderMain, renderHoja,
  abrirHoja, cab, errorHoja, botonEnviar, busqueda, sinAcentos } from '../nucleo.js';
import { abrirCliente } from './clientes.js';

export const TIPOS = {
  precio_faltante:     'Falta precio',
  precio_revisar:      'Precio por confirmar',
  precio_manual:       'Precio escrito a mano',
  producto_sin_precio: 'Producto sin precio',
  producto_incompleto: 'Producto incompleto',
  cliente_incompleto:  'Clientes incompletos',
  cliente_nuevo:       'Cliente nuevo',
  dato_excel:          'Dato del Excel',
  aviso:               'Aviso de un usuario'
};
const nombreTipo = t => TIPOS[t] || t;
const origen = a => a.origen === 'carga' ? 'Carga del Excel' : a.autor?.nombre || 'Sistema';

export async function refrescarContador(){
  try { S.alertasN = await D.contarAlertas(); } catch (e) { /* sin conexión: se intenta luego */ }
  renderNav();
}

R.modulos.alertas = {
  nombre:'Alertas', oculto:true,
  ico:'<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  tabs: () => [['abiertas', 'Abiertas · ' + S.alertasN], ['resueltas', 'Resueltas']],
  barra: () => ({ linea:false, placeholder:'Buscar por cliente, producto o texto' }),
  porTab: true,
  async cargar(tab){
    const d = S.datos.alertas || (S.datos.alertas = { tipo:'todos' });
    d.lista = null;
    d.lista = await D.alertas(tab === 'resueltas' ? 'resuelta' : 'abierta');
    if (tab !== 'resueltas') S.alertasN = d.lista.length;
  },
  vista(tab){
    const d = S.datos.alertas; if (!d?.lista) return '<p class="cargando">Cargando alertas…</p>';
    const q = sinAcentos(busqueda().trim());
    const conteo = new Map(); d.lista.forEach(a => conteo.set(a.tipo, (conteo.get(a.tipo) || 0) + 1));
    if (d.tipo !== 'todos' && !conteo.has(d.tipo)) d.tipo = 'todos';
    const lista = d.lista.filter(a => (d.tipo === 'todos' || a.tipo === d.tipo) &&
      (!q || sinAcentos([a.titulo, a.detalle, a.cliente?.nombre, a.cliente?.codigo, a.producto?.nombre].join(' ')).includes(q)));
    const chips = [['todos', 'Todas', d.lista.length], ...[...conteo].map(([t, n]) => [t, nombreTipo(t), n])];
    const intro = esRol('socio')
      ? (tab === 'resueltas' ? 'Alertas ya revisadas, con sus comentarios.' : 'Datos que faltan o que hay que revisar. Ábrelas para comentar, corregir el dato y marcarlas como resueltas. Las de precio se cierran solas al registrar el precio.')
      : 'Aquí ves los avisos que enviaste a los socios y sus respuestas. Si notas un dato faltante o errado, avísalo.';
    return `<div class="bloque">
      <div class="cab-modulo"><p class="muted">${intro}</p><button class="btn btn-p btn-s" data-a="aviso-nuevo">Avisar un error</button></div>
      ${d.lista.length > 1 ? `<div class="tabs" aria-label="Filtrar por tipo">${chips.map(([id, n, k]) => `<button data-a="al-tipo" data-id="${esc(id)}" aria-selected="${id === d.tipo}">${esc(n)} · ${k}</button>`).join('')}</div>` : ''}
      ${!lista.length ? vacio(tab === 'resueltas' ? 'Sin alertas resueltas' : 'No hay alertas abiertas', d.lista.length ? 'Cambia la búsqueda o el filtro.' : 'Cuando falte un dato o alguien avise un error, aparecerá aquí.') : `
      <div class="lista">${lista.slice(0, 200).map(a => `<article class="fila">
        <div><button class="link" data-a="al-ver" data-id="${a.id}">${esc(a.titulo)}</button></div>
        <span class="pill st-${a.estado === 'resuelta' ? 'entregado' : a.tipo === 'aviso' || a.tipo === 'precio_manual' ? 'en_taller' : 'recibido'}">${esc(nombreTipo(a.tipo))}</span>
        <div class="meta">${a.cliente ? `<span>${esc(a.cliente.nombre)}</span>` : ''}<span>${esc(origen(a))}</span><span>${esc(fechaCorta(a.creado))}</span>${a.nComentarios ? `<span>${a.nComentarios} comentario${a.nComentarios > 1 ? 's' : ''}</span>` : ''}</div>
      </article>`).join('')}</div>${lista.length > 200 ? `<p class="muted">Se muestran 200 de ${lista.length}. Escribe para filtrar.</p>` : ''}`}
    </div>`;
  }
};

/* ---------- Detalle con comentarios ---------- */
R.hojas.alerta = () => {
  const a = S.hoja.alerta, socio = esRol('socio'), coms = S.hoja.comentarios;
  const precioDe = a.cliente_id && a.producto_id && a.medida_ml && ['precio_faltante','precio_revisar','precio_manual'].includes(a.tipo);
  const acciones = [
    a.cliente_id && esRol('socio','administrativo','vendedor') ? `<button class="btn btn-s" data-a="al-cliente" data-id="${a.cliente_id}">Ver cliente</button>` : '',
    precioDe && esRol('socio','administrativo') ? `<button class="btn btn-s" data-a="al-precio">Registrar precio</button>` : '',
    a.tipo === 'producto_sin_precio' && socio && a.producto_id ? `<button class="btn btn-s" data-a="medida-nueva" data-producto="${a.producto_id}">Agregar medida</button>` : ''
  ].filter(Boolean).join('');
  return cab(esc(a.titulo), esc(nombreTipo(a.tipo) + ' · ' + (a.estado === 'resuelta' ? 'Resuelta' : 'Abierta'))) + `<div class="hoja-body">
    ${a.detalle ? `<p>${esc(a.detalle)}</p>` : ''}
    <dl class="dl">${a.cliente ? `<dt>Cliente</dt><dd>${esc(a.cliente.nombre)} · ${esc(a.cliente.codigo || '')}</dd>` : ''}
      ${a.producto ? `<dt>Producto</dt><dd>${esc(a.producto.nombre)}${a.medida_ml ? ' · ' + a.medida_ml + ' ml' : ''}</dd>` : ''}
      <dt>Origen</dt><dd>${esc(origen(a))} · ${esc(horaCorta(a.creado))}</dd>
      ${a.estado === 'resuelta' ? `<dt>Resuelta</dt><dd>${esc(a.resolvio?.nombre || 'Sistema')} · ${esc(horaCorta(a.resuelta_en))}</dd>` : ''}</dl>
    ${acciones ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${acciones}</div>` : ''}
    <p class="sub">Comentarios</p>
    ${!coms ? '<p class="muted">Cargando…</p>' : coms.length ? `<ul class="comentarios">${coms.map(c => `<li><div><strong>${esc(c.autor?.nombre || 'Sistema')}</strong> <span class="muted">${esc(horaCorta(c.creado))}</span></div><p>${esc(c.texto)}</p></li>`).join('')}</ul>` : '<p class="muted">Aún no hay comentarios.</p>'}
    ${campo('al-com', socio && a.estado === 'abierta' ? 'Comentario (se guarda también al marcar resuelta)' : 'Comentario', `<textarea id="al-com" data-g="comentario" rows="2" maxlength="500">${esc(S.g.comentario || '')}</textarea>`, true)}
    ${errorHoja()}</div>
    <div class="hoja-pie"><button class="btn" data-a="al-comentar" ${S.enviando ? 'disabled' : ''}>Comentar</button>
      ${socio ? botonEnviar('al-resolver', a.estado === 'resuelta' ? 'Reabrir' : 'Marcar resuelta') : ''}</div>`;
};

/* ---------- Avisar un error ---------- */
R.hojas.aviso = () => {
  const g = S.g, puedeCli = S.clientes.length > 0;
  return cab('Avisar un error de datos', 'Llega a los socios como alerta') + `<div class="hoja-body"><div class="campos">
    ${campo('av-titulo', 'Qué está mal o falta', `<input id="av-titulo" data-g="titulo" maxlength="100" value="${esc(g.titulo)}" placeholder="Teléfono errado, precio distinto al acordado…">`, true)}
    ${campo('av-detalle', 'Detalle (opcional)', `<textarea id="av-detalle" data-g="detalle" rows="3" maxlength="500">${esc(g.detalle)}</textarea>`, true)}
    ${puedeCli ? campo('av-cli', 'Cliente (opcional)', `<select id="av-cli" data-g="cliente">${op('', 'Ninguno', g.cliente)}${S.clientes.map(c => op(c.id, c.nombre + (c.codigo ? ' · ' + c.codigo : ''), g.cliente)).join('')}</select>`, true) : ''}
    ${campo('av-prod', 'Producto (opcional)', `<select id="av-prod" data-g="producto">${op('', 'Ninguno', g.producto)}${S.catalogo.map(p => op(p.id, p.nombre, g.producto)).join('')}</select>`, true)}
  </div>${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('aviso-enviar', 'Enviar aviso')}</div>`;
};

export function abrirAviso(datos = {}){ abrirHoja({ tipo:'aviso' }, { titulo:'', detalle:'', cliente:'', producto:'', ...datos }); }

async function abrirAlerta(id){
  const a = S.datos.alertas?.lista?.find(x => x.id === id); if (!a) return;
  abrirHoja({ tipo:'alerta', id, alerta:a }, { comentario:'' });
  await cargarComentarios(id);
}
export async function cargarComentarios(id){
  try {
    const c = await D.comentariosDe(id);
    if (S.hoja?.tipo === 'alerta' && S.hoja.id === id) { S.hoja.comentarios = c; renderHoja(); }
  } catch (e) { toast(e.message); }
}
async function recargarLista(){
  await R.modulos.alertas.cargar(S.tab.alertas); await refrescarContador(); renderTodo();
}

Object.assign(R.acciones, {
  'al-tipo': d => { S.datos.alertas.tipo = d.id; renderMain(); },
  'al-ver': d => abrirAlerta(d.id),
  'al-cliente': async d => { await R.acciones.mod({ id:'clientes' }); abrirCliente(d.id); },
  'al-precio': () => {
    const a = S.hoja.alerta;
    R.acciones['precio-cambiar']({ cliente:a.cliente_id, producto:a.producto_id, ml:String(a.medida_ml) });
  },
  'aviso-nuevo': () => abrirAviso(),
  'aviso-enviar': async () => {
    const g = S.g; if (S.enviando) return;
    if (!g.titulo.trim()) { S.error = 'Escribe qué está mal o qué falta.'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try {
      await D.crearAlerta({ titulo:g.titulo.trim(), detalle:g.detalle.trim(), cliente:g.cliente, producto:g.producto });
      S.enviando = false; S.hoja = null; renderHoja(); toast('Aviso enviado a los socios');
      if (S.modulo === 'alertas') await recargarLista(); else await refrescarContador();
    } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  },
  'al-comentar': async () => {
    const texto = (S.g.comentario || '').trim(), id = S.hoja.id; if (S.enviando) return;
    if (!texto) { S.error = 'Escribe el comentario.'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try { await D.comentar(id, texto); S.g.comentario = ''; S.enviando = false; await cargarComentarios(id); toast('Comentario guardado'); }
    catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  },
  'al-resolver': async () => {
    const a = S.hoja.alerta, resolver = a.estado !== 'resuelta'; if (S.enviando) return;
    S.enviando = true; S.error = ''; renderHoja();
    try {
      await D.resolverAlerta(a.id, resolver, (S.g.comentario || '').trim());
      S.enviando = false; S.hoja = null; renderHoja();
      toast(resolver ? 'Alerta resuelta' : 'Alerta reabierta');
      await recargarLista();
    } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  }
});

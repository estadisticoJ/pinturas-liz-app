// Módulo Pedidos: catálogo, carrito, lista con estados y consolidado.
import * as D from '../datos.js';
import { S, R, $, esc, soles, hoyISO, fechaCorta, horaCorta, rol, miRol, esRol, guarda, lee, sw, vacio, op,
  toast, renderTodo, renderNav, renderMain, renderHoja, abrirHoja, cab, errorHoja } from '../nucleo.js';

export const ESTADOS = [
  { id:'recibido', nombre:'Recibido', sig:'en_taller', accion:'Enviar al taller', roles:['socio','administrativo'] },
  { id:'en_taller', nombre:'En taller', sig:'listo', accion:'Marcar listo', roles:['socio','taller'] },
  { id:'listo', nombre:'Listo', sig:'despachado', accion:'Despachar', roles:['socio','taller','despacho'] },
  { id:'despachado', nombre:'Despachado', sig:'entregado', accion:'Marcar entregado', roles:['socio','administrativo','despacho'] },
  { id:'entregado', nombre:'Entregado' },
  { id:'anulado', nombre:'Anulado' }
];
const CANALES = ['Visita de vendedor','WhatsApp','Facebook','Instagram','Llamada','Oficina','Feria'];
const estado = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
export const pill = id => `<span class="pill st-${id}">${esc(estado(id).nombre)}</span>`;
const prod = id => S.catalogo.find(p => p.id === id);
const clave = i => i.color_id + '|' + i.presentacion_id;
const totalDe = items => items.reduce((t, i) => t + i.cant * i.precio, 0);
export const bolsasDe = items => items.reduce((t, i) => t + i.cant, 0);
const visibles = () => rol().ve === 'ninguno' ? [] : S.pedidos;
const guardaCarrito = () => guarda('pl_carrito', S.carrito);

S.carrito = lee('pl_carrito', []);
S.form = { cliente:'', clienteNombre:'', telefono:'', canal:'WhatsApp', condicion:'contado', dias:'15', entrega:'local', agencia:'', fecha:hoyISO(), notas:'' };
S.cobrosPedido = {};

function frascos(hexes){
  const hs = hexes.slice(0, 3); while (hs.length < 3) hs.push(hs[0] || '#CCCCCC');
  const uno = (h, x) => `<g transform="translate(${x} 0)"><rect x="7" y="2" width="18" height="9" rx="2" fill="var(--tapa)"/><rect x="2" y="11" width="28" height="35" rx="5" fill="${esc(h)}" stroke="var(--line)"/><rect x="6" y="22" width="20" height="12" rx="2" fill="var(--surface)" fill-opacity=".88"/></g>`;
  return `<svg viewBox="0 0 112 48" role="img" aria-label="Frascos de pintura">${uno(hs[0], 4)}${uno(hs[1], 40)}${uno(hs[2], 76)}</svg>`;
}
function consolidar(lista){
  const m = new Map();
  lista.filter(p => p.estado === 'recibido' || p.estado === 'en_taller').forEach(p => p.items.forEach(i => {
    const k = clave(i), r = m.get(k) || { nombre:i.nombre, color:i.color, hex:i.hex, ml:i.ml, und:i.und, bolsas:0, pedidos:new Set() };
    r.bolsas += i.cant; r.pedidos.add(p.id); m.set(k, r);
  }));
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.ml - b.ml || a.color.localeCompare(b.color));
}

/* ---------- Módulo ---------- */
R.modulos.pedidos = {
  nombre:'Pedidos',
  ico:'<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
  tabs(){
    const r = rol(), t = [];
    if (r.crea) t.push(['catalogo', 'Catálogo']);
    t.push(['pedidos', (r.ve === 'propios' ? 'Mis pedidos' : 'Pedidos') + ' · ' + visibles().length]);
    if (esRol('socio','administrativo','taller')) t.push(['consolidado', 'Consolidado']);
    return t;
  },
  barra(tab){
    if (tab === 'catalogo') return { linea:true, placeholder:'Buscar producto o color' };
    if (tab === 'pedidos') return { linea:false, placeholder:'Buscar por cliente o número de pedido' };
    return null;
  },
  async cargar(){ await recargarPedidos(); },
  vista(tab){ return tab === 'catalogo' ? vistaCatalogo() : tab === 'consolidado' ? vistaConsolidado() : vistaPedidos(); }
};

export async function recargarPedidos(){
  if (rol().ve === 'ninguno') return;
  S.pedidos = await D.pedidos();
}

function vistaCatalogo(){
  if (!S.catalogo.length) return vacio('El catálogo está vacío', 'Carga productos, colores y presentaciones en Supabase (archivo <code>supabase/semillas/catalogo_ejemplo.sql</code>).');
  const q = S.q.catalogo.trim().toLowerCase();
  const lista = S.catalogo.filter(p => (S.linea === 'todas' || p.linea === S.linea) &&
    (!q || (p.nombre + ' ' + p.linea + ' ' + p.colores.map(c => c.nombre).join(' ')).toLowerCase().includes(q)));
  if (!lista.length) return vacio('Ningún producto coincide', 'Prueba con otra palabra o cambia la línea de producto.');
  return `<div class="grid">${lista.map(p => {
    const desde = Math.min(...p.presentaciones.map(x => x.precio)), ml = [...new Set(p.presentaciones.map(x => x.medida_ml))].join(' · ');
    const enCar = S.carrito.filter(i => i.producto_id === p.id).reduce((t, i) => t + i.cant, 0);
    const sws = p.colores.slice(0, 8).map(c => `<span class="sw" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`).join('') + (p.colores.length > 8 ? `<span class="muted" style="font-size:12px">+${p.colores.length - 8}</span>` : '');
    return `<article class="card"><div class="card-img">${frascos(p.colores.map(c => c.hex))}</div><div class="card-body">
      <span class="eyebrow">${esc(p.linea)}</span><h3>${esc(p.nombre)}</h3>${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}
      <div class="sw-row">${sws}</div>
      <p class="price num">Desde ${soles(desde)} <small>por bolsa · ${ml} ml</small></p>
      ${enCar ? `<span><span class="chip num">${enCar} en el carrito</span></span>` : ''}
      <button class="btn btn-p" data-a="abrir-prod" data-id="${p.id}">Elegir colores</button></div></article>`;
  }).join('')}</div>`;
}

function vistaPedidos(){
  const r = rol(), base = visibles(), q = S.q.pedidos.trim().toLowerCase();
  const cuenta = id => base.filter(p => p.estado === id).length;
  const chips = [['todos', 'Todos', base.length], ...ESTADOS.map(e => [e.id, e.nombre, cuenta(e.id)])].filter(c => c[0] === 'todos' || c[2] > 0 || c[0] === S.filtro);
  const lista = base.filter(p => (S.filtro === 'todos' || p.estado === S.filtro) && (!q || (p.codigo + ' ' + p.cliente.nombre).toLowerCase().includes(q)));
  const cabF = `<div class="tabs" style="margin-bottom:12px" aria-label="Filtrar por estado">${chips.map(c => `<button data-a="filtro" data-id="${c[0]}" aria-selected="${c[0] === S.filtro}">${c[1]} · ${c[2]}</button>`).join('')}</div>`;
  if (!base.length) return vacio('Aún no hay pedidos', r.crea ? 'Elige productos en el catálogo y confirma el primer pedido.' : 'Aquí aparecerán los pedidos cuando Ventas o Administración los registren.', r.crea ? '<button class="btn btn-p" data-a="tab" data-id="catalogo">Ir al catálogo</button>' : '');
  if (!lista.length) return cabF + vacio('Ningún pedido en esta vista', 'Cambia el filtro de estado o la búsqueda.');
  return cabF + `<div class="lista">${lista.map(p => {
    const e = estado(p.estado), puede = e.sig && e.roles.includes(miRol());
    return `<article class="fila"><div><button class="link num" data-a="ver-pedido" data-id="${p.id}">${p.codigo}</button> <span class="cli">· ${esc(p.cliente.nombre)}</span></div>${pill(p.estado)}
      <div class="meta"><span>Entrega ${esc(fechaCorta(p.fechaEntrega))}</span><span>${esc(p.canal)}</span><span>${esc(p.creadoPorNombre)}</span><span class="num">${bolsasDe(p.items)} bolsas</span></div>
      <div class="pie"><strong class="num">${soles(p.total)}</strong>${puede ? `<button class="btn btn-s" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''}</div></article>`;
  }).join('')}</div>`;
}

function vistaConsolidado(){
  const pend = visibles().filter(p => p.estado === 'recibido' || p.estado === 'en_taller'), filas = consolidar(pend);
  if (!filas.length) return vacio('Nada pendiente de envasar', 'Aquí se suman los pedidos en Recibido y En taller, por producto, color y presentación.');
  const bolsas = filas.reduce((t, f) => t + f.bolsas, 0), frascosN = filas.reduce((t, f) => t + f.bolsas * f.und, 0);
  return `<div class="bloque"><p class="resumen num"><span>${pend.length} pedidos pendientes</span><span>${bolsas} bolsas</span><span>${frascosN} frascos</span></p>
    <p class="muted">Suma lo que el Taller debe envasar: pedidos en Recibido y En taller. En el módulo Taller lo verás descontando lo que ya está envasado.</p>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th>Color</th><th>Presentación</th><th class="r">Bolsas</th><th class="r">Frascos</th><th class="r">Pedidos</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${esc(f.nombre)}</td><td>${sw(f.hex)} ${esc(f.color)}</td><td class="num">${f.ml} ml · bolsa de ${f.und}</td><td class="r num">${f.bolsas}</td><td class="r num">${f.bolsas * f.und}</td><td class="r num">${f.pedidos.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

/* ---------- Hojas ---------- */
R.hojas.producto = () => {
  const p = prod(S.sel.prod); if (!p) return cab('Producto') + '<div class="hoja-body"><p class="muted">Este producto ya no está en el catálogo.</p></div>';
  const pr = p.presentaciones[S.sel.pres], n = Object.values(S.sel.cant).reduce((t, v) => t + v, 0);
  return cab(esc(p.nombre), esc(p.descripcion || '')) + `<div class="hoja-body">
    <div><p class="sub">Presentación</p><div class="pres">${p.presentaciones.map((x, i) => `<button data-a="pres" data-i="${i}" aria-pressed="${i === S.sel.pres}"><span>${x.medida_ml} ml · bolsa de ${x.unidades}</span><span class="num">${soles(x.precio)}</span></button>`).join('')}</div></div>
    <div><p class="sub">Bolsas por color</p><div class="colores">${p.colores.map(c => { const v = S.sel.cant[c.id] || 0; return `<div class="color"><span class="sw" style="background:${esc(c.hex)}"></span><span class="n">${esc(c.nombre)}</span>
      <div class="step"><button data-a="menos-color" data-c="${c.id}" aria-label="Quitar una bolsa de ${esc(c.nombre)}" ${v ? '' : 'disabled'}>−</button><output class="num">${v}</output><button data-a="mas-color" data-c="${c.id}" aria-label="Agregar una bolsa de ${esc(c.nombre)}">+</button></div></div>`; }).join('')}</div></div>
    </div><div class="hoja-pie"><div><div class="total num">${soles(n * pr.precio)}</div><div class="muted num">${n} bolsas · ${n * pr.unidades} frascos</div></div><button class="btn btn-p" data-a="agregar" ${n ? '' : 'disabled'}>Agregar al carrito</button></div>`;
};

R.hojas.carrito = () => {
  const f = S.form, items = S.carrito;
  if (!items.length) return cab('Carrito') + `<div class="hoja-body">${vacio('El carrito está vacío', 'Abre un producto del catálogo y elige las bolsas por color.', '<button class="btn btn-p" data-a="cerrar">Ver catálogo</button>')}</div>`;
  const cli = S.clientes.find(c => c.id === f.cliente);
  return cab('Carrito', `${bolsasDe(items)} bolsas en ${items.length} líneas`) + `<div class="hoja-body">
    <div>${items.map(i => `<div class="linea"><div class="t"><span class="sw" style="background:${esc(i.hex)}"></span><span>${esc(i.nombre)} · ${esc(i.color)}</span></div>
      <div class="step"><button data-a="linea-menos" data-k="${esc(clave(i))}" aria-label="Quitar una bolsa">−</button><output class="num">${i.cant}</output><button data-a="linea-mas" data-k="${esc(clave(i))}" aria-label="Agregar una bolsa">+</button></div>
      <div class="s num">${i.ml} ml · bolsa de ${i.und} · ${soles(i.precio)}</div><div class="num" style="text-align:right;font-weight:700">${soles(i.cant * i.precio)}</div></div>`).join('')}</div>
    <p class="sub">Datos del pedido</p>
    <div class="campos">
      <div class="campo full"><label for="f-cliente">Cliente</label><select id="f-cliente" data-f="cliente" data-r="1">${S.clientes.map(c => op(c.id, c.nombre + (c.zona ? ' · ' + c.zona : ''), f.cliente)).join('')}${op('nuevo', 'Cliente nuevo…', f.cliente)}</select>
        ${cli?.limite_credito != null ? `<span class="muted" style="font-size:13px">Límite de crédito: ${soles(cli.limite_credito)}</span>` : ''}</div>
      ${f.cliente === 'nuevo' ? `<div class="campo"><label for="f-nombre">Nombre del cliente</label><input id="f-nombre" data-f="clienteNombre" value="${esc(f.clienteNombre)}" maxlength="80"></div><div class="campo"><label for="f-tel">Teléfono (opcional)</label><input id="f-tel" data-f="telefono" inputmode="tel" value="${esc(f.telefono)}" maxlength="20"></div>` : ''}
      <div class="campo"><label for="f-canal">Canal</label><select id="f-canal" data-f="canal">${CANALES.map(c => op(c, c, f.canal)).join('')}</select></div>
      <div class="campo"><label for="f-fecha">Fecha de entrega</label><input id="f-fecha" type="date" data-f="fecha" value="${esc(f.fecha)}"></div>
      <div class="campo"><label for="f-cond">Pago</label><select id="f-cond" data-f="condicion" data-r="1">${op('contado', 'Contado, contra entrega', f.condicion)}${op('credito', 'Crédito', f.condicion)}</select></div>
      ${f.condicion === 'credito' ? `<div class="campo"><label for="f-dias">Plazo del crédito</label><select id="f-dias" data-f="dias">${['7','15','30'].map(d => op(d, d + ' días', f.dias)).join('')}</select></div>` : ''}
      <div class="campo"><label for="f-entrega">Entrega</label><select id="f-entrega" data-f="entrega" data-r="1">${op('local', 'En el local del cliente', f.entrega)}${op('agencia', 'Agencia de envíos', f.entrega)}${op('oficina', 'Recoge en la oficina', f.entrega)}</select></div>
      ${f.entrega === 'agencia' ? `<div class="campo"><label for="f-agencia">Agencia y destino</label><input id="f-agencia" data-f="agencia" value="${esc(f.agencia)}" maxlength="80"></div>` : ''}
      <div class="campo full"><label for="f-notas">Notas (opcional)</label><textarea id="f-notas" data-f="notas" rows="2" maxlength="300">${esc(f.notas)}</textarea></div>
    </div>
    ${errorHoja()}
    </div><div class="hoja-pie"><div><div class="muted">Total</div><div class="total num">${soles(totalDe(items))}</div></div><button class="btn btn-p" data-a="confirmar" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Registrando…' : 'Confirmar pedido'}</button></div>`;
};

R.hojas.pedido = () => {
  const p = S.pedidos.find(x => x.id === S.hoja.id);
  if (!p) return cab('Pedido') + `<div class="hoja-body"><p class="muted">Cargando el pedido…</p></div>`;
  const e = estado(p.estado), puede = e.sig && e.roles.includes(miRol());
  const anulable = esRol('socio','administrativo') && ['recibido','en_taller'].includes(p.estado);
  const entrega = p.entrega === 'agencia' ? 'Agencia de envíos' + (p.agencia ? ' · ' + p.agencia : '') : p.entrega === 'oficina' ? 'Recoge en la oficina' : 'En el local del cliente';
  const cobros = S.cobrosPedido[p.id], verCobros = esRol('socio','administrativo','vendedor');
  const cobrado = (cobros || []).filter(c => c.estado !== 'anulado').reduce((t, c) => t + c.monto, 0), saldo = p.total - cobrado;
  const puedeCobrar = verCobros && cobros && p.estado !== 'anulado' && saldo > 0.005;
  return cab(`<span class="num">${p.codigo}</span>`, S.hoja.recien ? 'Pedido registrado' : '') + `<div class="hoja-body">
    <div>${pill(p.estado)}</div>
    <dl class="dl"><dt>Cliente</dt><dd>${esc(p.cliente.nombre)}${p.cliente.telefono ? ' · ' + esc(p.cliente.telefono) : ''}</dd><dt>Entrega</dt><dd>${esc(fechaCorta(p.fechaEntrega))} · ${esc(entrega)}</dd>
      <dt>Pago</dt><dd>${p.condicion === 'credito' ? 'Crédito a ' + esc(p.diasCredito) + ' días' : 'Contado, contra entrega'}</dd><dt>Canal</dt><dd>${esc(p.canal)}</dd><dt>Registró</dt><dd>${esc(p.creadoPorNombre)}</dd>${p.notas ? `<dt>Notas</dt><dd>${esc(p.notas)}</dd>` : ''}</dl>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th class="r">Bolsas</th><th class="r">Importe</th></tr></thead><tbody>
      ${p.items.map(i => `<tr><td style="white-space:normal">${sw(i.hex)} ${esc(i.nombre)} · ${esc(i.color)}<br><span class="muted num">${i.ml} ml · bolsa de ${i.und}</span></td><td class="r num">${i.cant}</td><td class="r num">${soles(i.cant * i.precio)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td class="r num"><strong>${bolsasDe(p.items)}</strong></td><td class="r num"><strong>${soles(p.total)}</strong></td></tr></tbody></table></div>
    ${verCobros ? `<div><p class="sub">Cobranza</p>${!cobros ? '<p class="muted">Cargando cobros…</p>' : `
      <p class="resumen num"><span>Cobrado ${soles(cobrado)}</span><span>Saldo ${soles(saldo)}</span></p>
      ${cobros.length ? `<ul class="hist">${cobros.map(c => `<li><span class="num"><strong>R-${String(c.recibo).padStart(5,'0')}</strong></span><span class="num">${soles(c.monto)}</span><span>${esc(c.medio)}</span><span class="muted">${esc(fechaCorta(c.fecha))}</span>${etiquetaCobro(c.estado)}</li>`).join('')}</ul>` : '<p class="muted">Sin cobros registrados.</p>'}`}</div>` : ''}
    <div><p class="sub">Seguimiento</p><ul class="hist">${p.historial.map(h => `<li>${pill(h.estado)}<span>${esc(h.por)}</span><span class="muted">${esc(horaCorta(h.cuando))}</span></li>`).join('')}</ul></div>
    </div><div class="hoja-pie"><div style="display:flex;gap:8px;flex-wrap:wrap">${rol().crea ? `<button class="btn" data-a="repetir" data-id="${p.id}">Repetir pedido</button>` : ''}${anulable ? `<button class="btn btn-danger" data-a="anular" data-id="${p.id}">${S.hoja.anular ? 'Confirmar anulación' : 'Anular'}</button>` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${puedeCobrar ? `<button class="btn" data-a="cobrar-pedido" data-id="${p.id}">Registrar cobro</button>` : ''}${puede ? `<button class="btn btn-p" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''}</div></div>`;
};
export const etiquetaCobro = est => est === 'recibido' ? '<span class="pill st-entregado">Recibido</span>' : est === 'anulado' ? '<span class="pill st-anulado">Anulado</span>' : '<span class="pill st-en_taller">Por entregar</span>';

export async function abrirPedido(id, extra = {}){
  abrirHoja({ tipo:'pedido', id, ...extra });
  if (esRol('socio','administrativo','vendedor')) {
    try { S.cobrosPedido[id] = await D.cobrosDePedido(id); } catch (e) { S.cobrosPedido[id] = []; toast(e.message); }
    if (S.hoja?.tipo === 'pedido' && S.hoja.id === id) renderHoja();
  }
}

/* ---------- Acciones ---------- */
export function sincronizarCarrito(){
  S.carrito = S.carrito.flatMap(i => {
    const p = prod(i.producto_id), c = p?.colores.find(x => x.id === i.color_id), pr = p?.presentaciones.find(x => x.id === i.presentacion_id);
    return p && c && pr ? [{ ...i, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades, precio:pr.precio }] : [];
  });
  guardaCarrito();
}
function agregarAlCarrito(){
  const p = prod(S.sel.prod), pr = p.presentaciones[S.sel.pres]; let n = 0;
  Object.entries(S.sel.cant).forEach(([colorId, cant]) => { if (!cant) return;
    const c = p.colores.find(x => x.id === colorId);
    const item = { producto_id:p.id, color_id:c.id, presentacion_id:pr.id, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades, precio:pr.precio, cant };
    const ya = S.carrito.find(i => clave(i) === clave(item)); if (ya) ya.cant += cant; else S.carrito.push(item); n += cant; });
  guardaCarrito(); S.hoja = null; renderTodo(); toast(n + ' bolsas agregadas al carrito');
}
async function confirmarPedido(){
  const f = S.form;
  if (!S.carrito.length || S.enviando) return;
  if (f.cliente === 'nuevo' && !f.clienteNombre.trim()) { S.error = 'Escribe el nombre del cliente nuevo.'; return renderHoja(); }
  if (!f.cliente) { S.error = 'Elige un cliente.'; return renderHoja(); }
  if (!f.fecha) { S.error = 'Elige la fecha de entrega.'; return renderHoja(); }
  S.enviando = true; S.error = ''; renderHoja();
  try {
    let clienteId = f.cliente;
    if (clienteId === 'nuevo') {
      const c = await D.crearCliente({ nombre:f.clienteNombre.trim(), telefono:f.telefono.trim(), vendedorId:S.perfil.id });
      S.clientes.push(c); S.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre)); clienteId = c.id; f.cliente = c.id;
    }
    const id = await D.crearPedido({
      cliente_id:clienteId, canal:f.canal, condicion:f.condicion, dias_credito: f.condicion === 'credito' ? Number(f.dias) : null,
      entrega:f.entrega, agencia: f.entrega === 'agencia' ? f.agencia.trim() : null, fecha_entrega:f.fecha, notas:f.notas.trim() || null
    }, S.carrito.map(i => ({ producto_id:i.producto_id, color_id:i.color_id, presentacion_id:i.presentacion_id, bolsas:i.cant })));
    S.carrito = []; guardaCarrito(); Object.assign(f, { notas:'', clienteNombre:'', telefono:'', agencia:'' });
    await recargarPedidos();
    const p = S.pedidos.find(x => x.id === id);
    S.tab.pedidos = 'pedidos'; S.filtro = 'todos'; $('#buscar').value = S.q.pedidos;
    S.enviando = false; renderTodo(); abrirPedido(id, { recien:true });
    toast('Pedido ' + (p ? p.codigo : '') + ' registrado');
    return;
  } catch (e) { S.error = e.message; }
  S.enviando = false; renderTodo();
}
async function cambiar(id, nuevo, texto){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  try { await D.cambiarEstado(id, nuevo); await recargarPedidos(); toast(p.codigo + ' ' + texto); }
  catch (e) { toast(e.message); }
  if (S.hoja?.anular) S.hoja.anular = false;
  renderTodo();
}
function repetir(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  let faltan = 0;
  p.items.forEach(i => {
    const pr = S.catalogo.find(x => x.colores.some(c => c.id === i.color_id)), c = pr?.colores.find(x => x.id === i.color_id), pre = pr?.presentaciones.find(x => x.id === i.presentacion_id);
    if (!pr || !c || !pre) { faltan++; return; }
    const item = { producto_id:pr.id, color_id:c.id, presentacion_id:pre.id, nombre:pr.nombre, color:c.nombre, hex:c.hex, ml:pre.medida_ml, und:pre.unidades, precio:pre.precio, cant:i.cant };
    const ya = S.carrito.find(x => clave(x) === clave(item)); if (ya) ya.cant += i.cant; else S.carrito.push(item);
  });
  guardaCarrito(); abrirHoja({ tipo:'carrito' }); renderNav(); renderMain();
  toast(faltan ? `${faltan} líneas ya no están en el catálogo; se copió el resto` : 'Productos de ' + p.codigo + ' copiados al carrito');
}
function linea(k, d){
  const i = S.carrito.find(x => clave(x) === k); if (!i) return;
  i.cant += d; if (i.cant <= 0) S.carrito = S.carrito.filter(x => x !== i);
  guardaCarrito(); renderNav(); renderMain(); renderHoja();
}

Object.assign(R.acciones, {
  'filtro': d => { S.filtro = d.id; renderMain(); },
  'abrir-prod': d => { S.sel = { prod:d.id, pres:0, cant:{} }; abrirHoja({ tipo:'producto' }); },
  'pres': d => { S.sel.pres = +d.i; renderHoja(); },
  'mas-color': d => { S.sel.cant[d.c] = (S.sel.cant[d.c] || 0) + 1; renderHoja(); },
  'menos-color': d => { S.sel.cant[d.c] = Math.max(0, (S.sel.cant[d.c] || 0) - 1); renderHoja(); },
  'agregar': agregarAlCarrito,
  'carrito': () => abrirHoja({ tipo:'carrito' }),
  'linea-mas': d => linea(d.k, 1),
  'linea-menos': d => linea(d.k, -1),
  'confirmar': confirmarPedido,
  'ver-pedido': d => abrirPedido(d.id),
  'avanzar': d => {
    const p = S.pedidos.find(x => x.id === d.id), e = p && estado(p.estado);
    if (e?.sig && e.roles.includes(miRol())) cambiar(d.id, e.sig, 'pasó a ' + estado(e.sig).nombre);
  },
  'anular': d => { if (!S.hoja.anular) { S.hoja.anular = true; return renderHoja(); } cambiar(d.id, 'anulado', 'anulado'); },
  'repetir': d => repetir(d.id)
});

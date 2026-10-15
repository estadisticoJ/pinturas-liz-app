// Módulo Pedidos: catálogo, carrito, lista con estados, consolidado, modificación y revisión.
// Las cantidades se guardan en FRASCOS (unidades). Se piden por docenas o por unidades; el precio es por docena
// y cada línea cuesta precio docena × frascos ÷ 12.
import * as D from '../datos.js';
import { fotoDe, cantidad } from '../nucleo.js';
import { S, R, $, esc, soles, hoyISO, fechaCorta, horaCorta, rol, miRol, esRol, guarda, lee, sw, vacio, op, campo,
  toast, renderTodo, renderNav, renderMain, renderHoja, abrirHoja, cab, errorHoja, botonEnviar, busqueda, sinAcentos, cargarModulo } from '../nucleo.js';

export const ESTADOS = [
  { id:'recibido', nombre:'Recibido', sig:'en_taller', accion:'Enviar al taller', roles:['socio','administrativo'] },
  { id:'en_revision', nombre:'En revisión', sig:'en_taller', accion:'Enviar al taller', roles:['socio','administrativo'] },
  { id:'en_taller', nombre:'En taller', sig:'listo', accion:'Marcar listo', roles:['socio','taller'] },
  { id:'listo', nombre:'Listo', sig:'despachado', accion:'Despachar', roles:['socio','taller','despacho'] },
  { id:'despachado', nombre:'Despachado', sig:'entregado', accion:'Marcar entregado', roles:['socio','administrativo','despacho'] },
  { id:'entregado', nombre:'Entregado' },
  { id:'anulado', nombre:'Anulado' }
];
const CANALES = ['Visita de vendedor','WhatsApp','Facebook','Instagram','Llamada','Oficina','Feria'];
const CONDICIONES = [['contado','Contado, contra entrega'], ['credito','Crédito'], ['adelanto','Adelanto (paga antes de la entrega)']];
const estado = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
export const pill = id => `<span class="pill st-${id}">${esc(estado(id).nombre)}</span>`;
const prod = id => S.catalogo.find(p => p.id === id);
const clave = i => i.color_id + '|' + i.presentacion_id;
const totalDe = items => items.reduce((t, i) => t + (i.importe || 0), 0);
export const frascosDe = items => items.reduce((t, i) => t + i.frascos, 0);
const visibles = () => rol().ve === 'ninguno' ? [] : S.pedidos;
const guardaCarrito = () => { guarda('pl_carrito', S.carrito); guarda('pl_edicion', S.edicion); };
const redondea = n => Math.round(n * 100) / 100;
const importe = (docena, frascos) => docena == null ? null : redondea(docena * frascos / 12);

S.carrito = lee('pl_carrito', []);
S.form = { cliente: lee('pl_cliente', ''), canal:'WhatsApp', condicion:'contado', dias:'15', vence:'', entrega:'local', agencia:'', fecha:hoyISO(), notas:'' };
// Pedido que se está modificando: { id, codigo, cliente, fijos:{presentacion:precio_docena}, antes:{carrito, form} }
S.edicion = lee('pl_edicion', null);
S.cobrosPedido = {};
S.preciosCli = {};            // 'producto|ml' -> { precio_docena } del cliente elegido
S.ref = { precios:{}, habitual:{} };   // precio sugerido (moda), máximo y mínimo por 'producto|ml' y medida habitual por producto
S.miVendedor = null;          // código de vendedor del usuario (JORGE, LILY…) si está vinculado
S.modoPref = lee('pl_modo', 'docena');  // última forma de pedir: docenas o unidades
// Precios escritos a mano para el cliente elegido, por presentación (se olvidan al cambiar de cliente)
S.manuales = lee('pl_manuales', { cliente:'', m:{} });
const guardaManuales = () => guarda('pl_manuales', S.manuales);

/* ---------- Precios del cliente elegido ---------- */
const precioDocena = (productoId, ml) => S.preciosCli[productoId + '|' + ml]?.precio_docena;
const clienteActual = () => S.clientes.find(c => c.id === S.form.cliente);
export const refDe = (productoId, ml) => S.ref.precios[productoId + '|' + ml];
export const habitualDe = productoId => S.ref.habitual[productoId];
const manualDe = pr => {
  if (S.manuales.cliente !== S.form.cliente) return null;
  const v = Number(String(S.manuales.m[pr.id] ?? '').replace(',', '.'));
  return v > 0 ? v : null;
};
// Al modificar un pedido, las presentaciones que ya tenía conservan su precio (si no cambia el cliente)
const fijoDe = pr => S.edicion && S.edicion.cliente === S.form.cliente ? S.edicion.fijos?.[pr.id] ?? null : null;
const tienePrecio = (productoId, pr) => fijoDe(pr) != null || precioDocena(productoId, pr.medida_ml) != null;
// Docena que se cobrará: la que ya tenía el pedido, la del cliente o, si no tiene, la escrita a mano
const docenaDe = (productoId, pr) => fijoDe(pr) ?? precioDocena(productoId, pr.medida_ml) ?? manualDe(pr);
const escribePrecio = () => rol().crea && !!clienteActual();
const presDe = i => prod(i.producto_id)?.presentaciones.find(x => x.id === i.presentacion_id);

export async function cargarReferencias(){
  try { S.ref = await D.referenciasPrecio(); } catch (e) { /* sin referencias: solo no se muestran */ }
}

export async function elegirCliente(id, { silencio = false, conservarCondiciones = false } = {}){
  const cambio = (id || '') !== S.form.cliente;
  S.form.cliente = id || ''; guarda('pl_cliente', S.form.cliente);
  if (S.manuales.cliente !== S.form.cliente) { S.manuales = { cliente:S.form.cliente, m:{} }; guardaManuales(); }
  const c = clienteActual();
  if (c && cambio && !conservarCondiciones) Object.assign(S.form, { condicion: c.condicion_habitual || 'contado', dias: String(c.dias_credito_habitual || 15), vence:'',
    entrega: c.agencia_habitual ? 'agencia' : S.form.entrega, agencia: c.agencia_habitual || S.form.agencia });
  try {
    const lista = c ? await D.preciosVigentes(c.id) : [];
    S.preciosCli = Object.fromEntries(lista.map(p => [p.producto_id + '|' + p.medida_ml, p]));
  } catch (e) { S.preciosCli = {}; toast(e.message); }
  sincronizarCarrito();
  const faltan = S.carrito.filter(i => i.importe == null).length;
  if (!silencio && c) toast(`Precios de ${c.nombre}` + (faltan ? ` · ${faltan} línea${faltan > 1 ? 's' : ''} sin precio: escríbelo en el carrito` : ''));
}

// Caja para escribir el precio de una presentación que el cliente no tiene, con el precio sugerido como guía
// (sugerido = el precio por docena que más clientes pagan hoy por ese producto y medida)
function cajaPrecio(p, pr, conTitulo){
  const ref = refDe(p.id, pr.medida_ml), v = S.manuales.cliente === S.form.cliente ? (S.manuales.m[pr.id] ?? '') : '';
  return `<div class="precio-caja">
    ${conTitulo ? `<strong>${esc(p.nombre)} · ${pr.medida_ml} ml</strong>` : ''}
    <div class="precio-fila"><label class="sr" for="pm-${pr.id}">Precio por docena de ${esc(p.nombre)} ${pr.medida_ml} ml</label>
      <span class="prefijo">S/</span><input id="pm-${pr.id}" class="precio-input num" data-pm="${pr.id}" type="text" inputmode="decimal" autocomplete="off" value="${esc(v)}" placeholder="por docena">
      ${ref ? `<button class="btn btn-s btn-sug" data-a="usar-ref" data-pres="${pr.id}" data-v="${ref.comun}">Usar sugerido ${soles(ref.comun)}</button>` : ''}</div>
    <span class="muted">${ref ? `Sugerido: lo que más clientes pagan (${ref.clientes} con precio; van de ${soles(ref.minimo)} a ${soles(ref.maximo)} la docena).` : 'Aún no hay precio sugerido: ningún cliente tiene precio para esta medida.'}</span>
  </div>`;
}

function frascos(hexes){
  const hs = hexes.slice(0, 3); while (hs.length < 3) hs.push(hs[0] || '#CCCCCC');
  const uno = (h, x) => `<g transform="translate(${x} 0)"><rect x="7" y="2" width="18" height="9" rx="2" fill="var(--tapa)"/><rect x="2" y="11" width="28" height="35" rx="5" fill="${esc(h)}" stroke="var(--line)"/><rect x="6" y="22" width="20" height="12" rx="2" fill="var(--surface)" fill-opacity=".88"/></g>`;
  return `<svg viewBox="0 0 112 48" role="img" aria-label="Frascos de pintura">${uno(hs[0], 4)}${uno(hs[1], 40)}${uno(hs[2], 76)}</svg>`;
}

// Bolsas con que el Taller arma el pedido: por producto y medida se juntan los colores;
// bolsas llenas del tamaño de la presentación (12 o 6) y una bolsa más con el resto.
export function empaque(items){
  const m = new Map();
  items.forEach(i => { const k = i.nombre + '|' + i.ml, r = m.get(k) || { nombre:i.nombre, ml:i.ml, und:i.und || 12, frascos:0 }; r.frascos += i.frascos; m.set(k, r); });
  return [...m.values()].map(r => {
    const llenas = Math.floor(r.frascos / r.und), resto = r.frascos % r.und;
    return { ...r, texto: [llenas ? `${llenas} bolsa${llenas > 1 ? 's' : ''} de ${r.und}` : '', resto ? `1 bolsa con ${resto}` : ''].filter(Boolean).join(' + ') };
  });
}

function consolidar(lista){
  const m = new Map();
  lista.filter(p => p.estado === 'recibido' || p.estado === 'en_taller').forEach(p => p.items.forEach(i => {
    const k = clave(i), r = m.get(k) || { nombre:i.nombre, color:i.color, hex:i.hex, ml:i.ml, und:i.und, frascos:0, pedidos:new Set() };
    r.frascos += i.frascos; r.pedidos.add(p.id); m.set(k, r);
  }));
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.ml - b.ml || a.color.localeCompare(b.color));
}

/* ---------- Permisos sobre un pedido (la base de datos los vuelve a revisar) ---------- */
const esAdmin = () => esRol('socio','administrativo');
export const puedeModificar = p => ['recibido','en_revision'].includes(p.estado) &&
  (esAdmin() || (p.creadoPor === S.perfil?.id && (p.estado === 'recibido' || p.revision?.para === 'creador')));
const puedeRevision = p => (p.estado === 'recibido' && esAdmin()) || (p.estado === 'en_taller' && (esAdmin() || esRol('taller','despacho')))
  || (p.estado === 'en_revision' && p.revision?.para === 'administracion' && esAdmin());
const puedeReenviar = p => p.estado === 'en_revision' && p.creadoPor === S.perfil?.id && p.revision?.para === 'creador';
const cobrable = p => p.estado === 'entregado' || (p.condicion === 'adelanto' && ['en_taller','listo','despachado'].includes(p.estado));
// Pedidos que me toca corregir (aparecen primero)
const meToca = p => p.estado === 'en_revision' && ((p.revision?.para === 'creador' && p.creadoPor === S.perfil?.id) || (p.revision?.para === 'administracion' && esAdmin()));

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

const barraEdicion = () => S.edicion ? `<div class="edicion-bar"><div><strong>Modificando ${esc(S.edicion.codigo)}</strong><br><span class="muted">Agrega o quita productos y guarda los cambios desde el carrito.</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-s" data-a="edicion-cancelar">Cancelar cambios</button><button class="btn btn-p btn-s" data-a="carrito">Ver carrito</button></div></div>` : '';

function vistaCatalogo(){
  if (!S.catalogo.length) return vacio('El catálogo está vacío', 'Carga productos, colores y presentaciones en Supabase (archivo <code>supabase/datos/02_carga_metadatos.sql</code>).');
  const c = clienteActual();
  const barraCliente = barraEdicion() + `<div class="cliente-bar">${c
    ? `<div><span class="eyebrow">Pedido para</span><strong>${esc(c.nombre)}</strong><span class="muted">${esc([c.codigo, c.zona, c.lugar].filter(Boolean).join(' · '))}</span></div>`
    : '<div><span class="eyebrow">Pedido para</span><strong>Elige un cliente</strong><span class="muted">Cada cliente tiene sus precios. Si no tiene precio para un producto, lo escribes a mano.</span></div>'}
    <button class="btn ${c ? '' : 'btn-p'}" data-a="elegir-cliente">${c ? 'Cambiar' : 'Elegir cliente'}</button></div>`;
  const q = sinAcentos(busqueda().trim());
  const lista = S.catalogo.filter(p => (S.linea === 'todas' || p.linea === S.linea) &&
    (!q || sinAcentos(p.nombre + ' ' + p.linea + ' ' + p.colores.map(x => x.nombre + ' ' + (x.codigo || '')).join(' ')).includes(q)));
  if (!lista.length) return barraCliente + vacio('Ningún producto coincide', 'Prueba con otra palabra o cambia la línea de producto.');
  return barraCliente + `<div class="grid">${lista.map(p => {
    const docenas = p.presentaciones.map(x => precioDocena(p.id, x.medida_ml)).filter(v => v != null);
    const desde = docenas.length ? Math.min(...docenas) : null, ml = [...new Set(p.presentaciones.map(x => x.medida_ml))].join(' · ');
    const hab = habitualDe(p.id), ref = hab ? refDe(p.id, hab) : null;
    const guia = ref ? `Sugerido ${soles(ref.comun)} <small>la docena · ${hab} ml</small>` : '';
    const enCar = S.carrito.filter(i => i.producto_id === p.id).reduce((t, i) => t + i.frascos, 0);
    const sws = p.colores.slice(0, 8).map(c => `<span class="sw" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`).join('') + (p.colores.length > 8 ? `<span class="muted" style="font-size:12px">+${p.colores.length - 8}</span>` : '');
    const sinMedidas = !p.presentaciones.length;
    if (sinMedidas && !esRol('socio')) return '';
    const foto = fotoDe(p.nombre);
    return `<article class="card"><div class="card-img${foto ? ' con-foto' : ''}">${foto ? `<img src="${foto}" alt="${esc(p.nombre)}" loading="lazy" decoding="async">` : frascos(p.colores.map(c => c.hex))}</div><div class="card-body">
      <span class="eyebrow">${esc(p.linea)}</span><h3>${esc(p.nombre)}</h3>${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}
      <div class="sw-row">${sws}</div>
      <p class="price num">${sinMedidas ? '<small>Sin medidas ni precio</small>' : desde != null ? `Desde ${soles(desde)} <small>la docena · ${ml} ml</small>` : guia || `<small>Sin precio · ${ml} ml</small>`}</p>
      ${!sinMedidas && desde == null && c ? '<span class="muted" style="font-size:12px">Sin precio para este cliente: se escribe al pedir</span>' : ''}
      ${enCar ? `<span><span class="chip num">${cantidad(enCar)} en el carrito</span></span>` : ''}
      ${sinMedidas ? `<button class="btn" data-a="medida-nueva" data-producto="${p.id}">Agregar medida</button>` : `<button class="btn btn-p" data-a="abrir-prod" data-id="${p.id}">Elegir colores</button>`}</div></article>`;
  }).join('')}</div>`;
}

function vistaPedidos(){
  const r = rol(), base = visibles(), q = sinAcentos(busqueda().trim());
  const cuenta = id => base.filter(p => p.estado === id).length;
  const chips = [['todos', 'Todos', base.length], ...ESTADOS.map(e => [e.id, e.nombre, cuenta(e.id)])].filter(c => c[0] === 'todos' || c[2] > 0 || c[0] === S.filtro);
  const lista = base.filter(p => (S.filtro === 'todos' || p.estado === S.filtro) && (!q || sinAcentos(p.codigo + ' ' + p.cliente.nombre).includes(q)))
    .sort((a, b) => (meToca(b) - meToca(a)) || (b.estado === 'en_revision') - (a.estado === 'en_revision'));
  const cabF = `<div class="tabs" style="margin-bottom:12px" aria-label="Filtrar por estado">${chips.map(c => `<button data-a="filtro" data-id="${c[0]}" aria-selected="${c[0] === S.filtro}">${c[1]} · ${c[2]}</button>`).join('')}</div>`;
  if (!base.length) return vacio('Aún no hay pedidos', r.crea ? 'Elige productos en el catálogo y confirma el primer pedido.' : 'Aquí aparecerán los pedidos cuando Ventas o Administración los registren.', r.crea ? '<button class="btn btn-p" data-a="tab" data-id="catalogo">Ir al catálogo</button>' : '');
  if (!lista.length) return cabF + vacio('Ningún pedido en esta vista', 'Cambia el filtro de estado o la búsqueda.');
  return barraEdicion() + cabF + `<div class="lista">${lista.map(p => {
    const e = estado(p.estado), puede = e.sig && e.roles.includes(miRol());
    return `<article class="fila${meToca(p) ? ' nueva' : ''}"><div><button class="link num" data-a="ver-pedido" data-id="${p.id}">${p.codigo}</button> <span class="cli">· ${esc(p.cliente.nombre)}</span></div>${pill(p.estado)}
      <div class="meta"><span>Entrega ${esc(fechaCorta(p.fechaEntrega))}</span><span>${esc(p.canal)}</span><span>${esc(p.creadoPorNombre)}</span><span class="num">${cantidad(frascosDe(p.items))}</span>${p.revision ? `<span class="txt-alerta">Revisión: ${esc(p.revision.motivo)}</span>` : ''}</div>
      <div class="pie"><strong class="num">${soles(p.total)}</strong>${meToca(p) && p.revision?.para === 'creador' ? `<button class="btn btn-s btn-p" data-a="ver-pedido" data-id="${p.id}">Corregir</button>` : puede ? `<button class="btn btn-s" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''}</div></article>`;
  }).join('')}</div>`;
}

function vistaConsolidado(){
  const pend = visibles().filter(p => p.estado === 'recibido' || p.estado === 'en_taller'), filas = consolidar(pend);
  const enRev = visibles().filter(p => p.estado === 'en_revision').length;
  if (!filas.length) return vacio('Nada pendiente de envasar', 'Aquí se suman los pedidos en Recibido y En taller, por producto, color y presentación.');
  const frascosN = filas.reduce((t, f) => t + f.frascos, 0);
  return `<div class="bloque"><p class="resumen num"><span>${pend.length} pedidos pendientes</span><span>${frascosN} frascos</span>${enRev ? `<span class="txt-alerta">${enRev} en revisión (no se suman)</span>` : ''}</p>
    <p class="muted">Suma lo que el Taller debe envasar: pedidos en Recibido y En taller. Los pedidos en revisión no se suman hasta que se corrijan.</p>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th>Color</th><th>Medida</th><th class="r">Cantidad</th><th class="r">Frascos</th><th class="r">Pedidos</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${esc(f.nombre)}</td><td>${sw(f.hex)} ${esc(f.color)}</td><td class="num">${f.ml} ml</td><td class="r num">${cantidad(f.frascos)}</td><td class="r num">${f.frascos}</td><td class="r num">${f.pedidos.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

/* ---------- Hojas ---------- */
R.hojas.producto = () => {
  const p = prod(S.sel.prod); if (!p) return cab('Producto') + '<div class="hoja-body"><p class="muted">Este producto ya no está en el catálogo.</p></div>';
  const pr = p.presentaciones[S.sel.pres], docena = pr ? docenaDe(p.id, pr) : null, modo = S.sel.modo, paso = modo === 'docena' ? 12 : 1;
  const n = Object.values(S.sel.cant).reduce((t, v) => t + v, 0);
  const q = sinAcentos(S.sel.q || ''), colores = p.colores.filter(c => !q || sinAcentos(c.nombre + ' ' + (c.codigo || '')).includes(q));
  const c = clienteActual(), hab = habitualDe(p.id), sinPrecio = pr && !tienePrecio(p.id, pr);
  const manual = sinPrecio && c ? (escribePrecio() ? `<div class="aviso-caja">
      <p><strong>${esc(c.nombre)} no tiene precio para ${pr.medida_ml} ml.</strong> Escribe el precio por docena acordado o usa el sugerido. Quedará como su precio para los próximos pedidos.</p>
      ${cajaPrecio(p, pr, false)}
      ${hab && hab !== pr.medida_ml && refDe(p.id, hab) && p.presentaciones.some(x => x.medida_ml === hab) ? `<button class="btn btn-s btn-sug" data-a="usar-habitual" data-producto="${p.id}">Usar la medida habitual: ${hab} ml · sugerido ${soles(refDe(p.id, hab).comun)}</button>` : ''}</div>` : '<p class="muted">Este cliente no tiene precio para esta medida.</p>') : '';
  const foto = fotoDe(p.nombre);
  return cab(esc(p.nombre), c ? `Precios de ${esc(c.nombre)}` : 'Elige un cliente para ver precios') + `<div class="hoja-body">
    ${foto ? `<div class="foto-producto"><img src="${foto}" alt="${esc(p.nombre)}"></div>` : ''}
    ${!c ? `<div class="cliente-bar compacto"><div><strong>Sin cliente</strong><span class="muted">Elige a quién le vendes para ver sus precios.</span></div><button class="btn btn-p btn-s" data-a="elegir-cliente">Elegir cliente</button></div>` : ''}
    <div><p class="sub">1. Medida y precio por docena</p><div class="pres" data-vivo="pres">${p.presentaciones.map((x, i) => { const d = docenaDe(p.id, x), propio = tienePrecio(p.id, x), ref = refDe(p.id, x.medida_ml);
      return `<button data-a="pres" data-i="${i}" aria-pressed="${i === S.sel.pres}"><span>${x.medida_ml} ml${x.medida_ml === hab ? ' <small class="chip">habitual</small>' : ''}</span><span class="num">${d != null ? soles(d) + ` <small class="muted">docena · ${soles(d / 12)} c/u${propio ? '' : ' · a mano'}</small>` : `<small class="muted">${ref ? 'Sugerido ' + soles(ref.comun) : 'Sin precio'}</small>`}</span></button>`; }).join('')}</div>
      ${esRol('socio') ? `<button class="btn btn-s" data-a="medida-nueva" data-producto="${p.id}" style="margin-top:8px">Agregar medida</button>` : ''}</div>
    ${manual}
    <div><p class="sub">2. ¿Por docenas o por unidades?</p>
      <div class="modo" role="group" aria-label="Forma de pedir"><button data-a="modo" data-v="docena" aria-pressed="${modo === 'docena'}">Docenas</button><button data-a="modo" data-v="unidad" aria-pressed="${modo === 'unidad'}">Unidades</button></div>
      <p class="muted" style="margin-top:6px">${modo === 'docena' ? 'Cada + suma una docena (12 frascos).' : 'Cada + suma un frasco. Puedes mezclar colores: 6 de un color y 6 de otro.'}</p></div>
    <div><p class="sub">3. Colores</p>
      ${p.colores.length > 10 ? `<input id="buscar-color" class="buscador" type="search" placeholder="Buscar color o código" value="${esc(S.sel.q || '')}" aria-label="Buscar color" autocomplete="off">` : ''}
      <div class="colores">${colores.map(c => { const v = S.sel.cant[c.id] || 0; return `<div class="color"><span class="sw" style="background:${esc(c.hex)}"></span><span class="n">${esc(c.nombre)}${c.codigo ? ` <small class="muted">${esc(c.codigo)}</small>` : ''}</span>
      <div class="step"><button data-a="menos-color" data-c="${c.id}" aria-label="Quitar ${modo === 'docena' ? 'una docena' : 'un frasco'} de ${esc(c.nombre)}" ${v ? '' : 'disabled'}>−</button><output class="num">${v ? cantidad(v) : 0}</output><button data-a="mas-color" data-c="${c.id}" aria-label="Agregar ${modo === 'docena' ? 'una docena' : 'un frasco'} de ${esc(c.nombre)}">+</button></div></div>`; }).join('') || '<p class="muted">Ningún color coincide.</p>'}</div></div>
    ${errorHoja()}</div><div class="hoja-pie" data-vivo="pie"><div><div class="total num">${docena == null ? (n ? 'Falta el precio' : 'Elige colores') : soles(importe(docena, n))}</div><div class="muted num">${cantidad(n)} · ${n} frascos</div></div><button class="btn btn-p" data-a="agregar" ${n && c ? '' : 'disabled'}>Agregar al carrito</button></div>`;
};

// Medida nueva para un producto (solo socios): por ejemplo, la primera medida de Pegatransfer
R.hojas.medida = () => {
  const g = S.g, p = S.catalogo.find(x => x.id === g.producto);
  return cab('Agregar medida', esc(p?.nombre || '')) + `<div class="hoja-body">
    <p class="muted">Medidas actuales: ${p?.presentaciones.length ? p.presentaciones.map(x => `${x.medida_ml} ml (bolsa de ${x.unidades})`).join(', ') : 'ninguna'}.</p>
    <div class="campos">
      ${campo('m-ml', 'Medida (ml)', `<input id="m-ml" data-g="ml" type="number" min="1" step="1" inputmode="numeric" value="${esc(g.ml)}" placeholder="250">`)}
      ${campo('m-und', 'Frascos por bolsa al envasar', `<select id="m-und" data-g="und">${[[12,'12 (hasta 120 ml)'],[6,'6 (250 ml y más)']].map(([v, t]) => op(v, t, g.und)).join('')}</select>`)}
    </div>
    <p class="muted">La medida queda en el catálogo para todos. El precio es de cada cliente: se escribe en su primer pedido o en su ficha.</p>
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('medida-guardar', 'Agregar medida')}</div>`;
};

R.hojas.clientes = () => {
  const q = sinAcentos(S.g.q || ''), propios = S.g.propios && S.miVendedor;
  const lista = S.clientes.filter(c => (!propios || c.vendedor_codigo === S.miVendedor) && (!q || sinAcentos(c.nombre + ' ' + (c.codigo || '') + ' ' + (c.zona || '')).includes(q)));
  return cab('Elegir cliente', `${S.clientes.length} clientes`) + `<div class="hoja-body">
    <input id="buscar-cliente" class="buscador" type="search" placeholder="Nombre, código o zona" value="${esc(S.g.q || '')}" aria-label="Buscar cliente" autocomplete="off">
    ${S.miVendedor ? `<div class="tabs"><button data-a="cli-propios" data-v="1" aria-selected="${!!S.g.propios}">Mis clientes</button><button data-a="cli-propios" data-v="0" aria-selected="${!S.g.propios}">Todos</button></div>` : ''}
    <div class="lista-sel">${lista.slice(0, 60).map(c => `<button data-a="usar-cliente" data-id="${c.id}" ${c.id === S.form.cliente ? 'aria-pressed="true"' : ''}><strong>${esc(c.nombre)}</strong><span class="muted">${esc([c.codigo, c.zona, c.lugar, c.vendedor_codigo].filter(Boolean).join(' · '))}</span></button>`).join('')
      || '<p class="muted">Ningún cliente coincide.</p>'}${lista.length > 60 ? `<p class="muted">Hay ${lista.length - 60} más; escribe para filtrar.</p>` : ''}</div>
    <p class="sub">Cliente nuevo</p>
    <div class="campos"><div class="campo"><label for="g-nuevo">Nombre</label><input id="g-nuevo" data-g="nuevo" maxlength="80" value="${esc(S.g.nuevo || '')}"></div>
      <div class="campo"><label for="g-tel">Teléfono (opcional)</label><input id="g-tel" data-g="tel" inputmode="tel" maxlength="20" value="${esc(S.g.tel || '')}"></div></div>
    <p class="muted">El cliente nuevo aún no tiene precios: los escribirás a mano en su primer pedido. Los socios recibirán un aviso para completar sus datos.</p>
    ${errorHoja()}</div><div class="hoja-pie"><span></span><button class="btn" data-a="crear-cliente" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Creando…' : 'Crear y elegir'}</button></div>`;
};

R.hojas.carrito = () => {
  const f = S.form, items = S.carrito, ed = S.edicion;
  const titulo = ed ? `Modificando ${esc(ed.codigo)}` : 'Carrito';
  if (!items.length) return cab(titulo) + `<div class="hoja-body">${vacio('El carrito está vacío', 'Abre un producto del catálogo y elige los colores.', '<button class="btn btn-p" data-a="cerrar">Ver catálogo</button>')}
    ${ed ? '<button class="btn" data-a="edicion-cancelar">Cancelar cambios</button>' : ''}</div>`;
  const cli = clienteActual();
  // Presentaciones del carrito sin precio para este cliente: se escriben aquí
  const faltan = [...new Map(items.filter(i => { const pr = presDe(i); return pr && !tienePrecio(i.producto_id, pr); }).map(i => [i.presentacion_id, i])).values()]
    .map(i => ({ p: prod(i.producto_id), pr: presDe(i) })).filter(x => x.p && x.pr);
  const sinPrecio = items.some(i => i.importe == null);
  return cab(titulo, `${cantidad(frascosDe(items))} en ${items.length} línea${items.length > 1 ? 's' : ''} · ${frascosDe(items)} frascos`) + `<div class="hoja-body">
    ${cli && faltan.length ? `<div class="aviso-caja"><p><strong>${esc(cli.nombre)} no tiene precio para ${faltan.length === 1 ? 'este producto' : 'estos productos'}.</strong> Escribe el precio por docena o usa el sugerido; quedará como su precio.</p>
      ${faltan.map(({ p, pr }) => cajaPrecio(p, pr, true)).join('')}</div>` : ''}
    <div data-vivo="lineas">${items.map(i => `<div class="linea"><div class="t"><span class="sw" style="background:${esc(i.hex)}"></span><span>${esc(i.nombre)} · ${esc(i.color)}</span></div>
      <div class="step"><button data-a="linea-menos" data-k="${esc(clave(i))}" aria-label="Quitar ${i.modo === 'unidad' ? 'un frasco' : 'una docena'}">−</button><output class="num">${cantidad(i.frascos)}</output><button data-a="linea-mas" data-k="${esc(clave(i))}" aria-label="Agregar ${i.modo === 'unidad' ? 'un frasco' : 'una docena'}">+</button></div>
      <div class="s num">${i.ml} ml · ${i.docena == null ? '<span class="txt-alerta">sin precio</span>' : soles(i.docena) + ' la docena' + (tienePrecio(i.producto_id, presDe(i) || {}) ? '' : ' <span class="chip">a mano</span>')}</div><div class="num" style="text-align:right;font-weight:700">${i.importe == null ? '—' : soles(i.importe)}</div></div>`).join('')}</div>
    <p class="sub">Datos del pedido</p>
    <div class="campos">
      <div class="campo full"><label>Cliente</label><div class="cliente-bar compacto"><div><strong>${cli ? esc(cli.nombre) : 'Sin elegir'}</strong>${cli ? `<span class="muted">${esc([cli.codigo, cli.zona].filter(Boolean).join(' · '))}${cli.limite_credito != null ? ' · límite ' + soles(cli.limite_credito) : ''}</span>` : ''}</div><button class="btn btn-s" data-a="elegir-cliente">${cli ? 'Cambiar' : 'Elegir'}</button></div></div>
      <div class="campo"><label for="f-canal">Canal</label><select id="f-canal" data-f="canal">${CANALES.map(c => op(c, c, f.canal)).join('')}</select></div>
      <div class="campo"><label for="f-fecha">Fecha de entrega</label><input id="f-fecha" type="date" data-f="fecha" value="${esc(f.fecha)}"></div>
      <div class="campo"><label for="f-cond">Pago</label><select id="f-cond" data-f="condicion" data-r="1">${CONDICIONES.map(([v, t]) => op(v, t, f.condicion)).join('')}</select></div>
      ${f.condicion === 'credito' ? `<div class="campo"><label for="f-dias">Plazo del crédito</label><select id="f-dias" data-f="dias" data-r="1">${['7','15','30'].map(d => op(d, d + ' días', f.dias)).join('')}${op('otra', 'Otra fecha…', f.dias)}</select></div>
        ${f.dias === 'otra' ? `<div class="campo"><label for="f-vence">Vence el</label><input id="f-vence" type="date" data-f="vence" min="${esc(f.fecha || hoyISO())}" value="${esc(f.vence)}"></div>` : ''}` : ''}
      ${f.condicion === 'adelanto' ? '<div class="campo full"><span class="muted">El adelanto se registra en Cobranzas cuando el pedido pasa al Taller (no antes de la revisión).</span></div>' : ''}
      <div class="campo"><label for="f-entrega">Entrega</label><select id="f-entrega" data-f="entrega" data-r="1">${op('local', 'En el local del cliente', f.entrega)}${op('agencia', 'Agencia de envíos', f.entrega)}${op('oficina', 'Recoge en la oficina', f.entrega)}</select></div>
      ${f.entrega === 'agencia' ? `<div class="campo"><label for="f-agencia">Agencia y destino</label><input id="f-agencia" data-f="agencia" value="${esc(f.agencia)}" maxlength="80"></div>` : ''}
      <div class="campo full"><label for="f-notas">Notas (opcional)</label><textarea id="f-notas" data-f="notas" rows="2" maxlength="300">${esc(f.notas)}</textarea></div>
    </div>
    ${errorHoja()}
    </div><div class="hoja-pie" data-vivo="pie"><div><div class="muted">Total${sinPrecio ? ' (faltan precios)' : ''}</div><div class="total num">${soles(totalDe(items))}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${ed ? '<button class="btn" data-a="edicion-cancelar">Cancelar</button>' : ''}<button class="btn btn-p" data-a="confirmar" ${S.enviando ? 'disabled' : ''}>${S.enviando ? (ed ? 'Guardando…' : 'Registrando…') : ed ? 'Guardar cambios' : 'Confirmar pedido'}</button></div></div>`;
};

const textoPago = p => p.condicion === 'credito' ? (p.fechaVence ? 'Crédito, vence el ' + fechaCorta(p.fechaVence) : 'Crédito a ' + p.diasCredito + ' días')
  : p.condicion === 'adelanto' ? 'Adelanto (paga antes de la entrega)' : 'Contado, contra entrega';

R.hojas.pedido = () => {
  const p = S.pedidos.find(x => x.id === S.hoja.id);
  if (!p) return cab('Pedido') + `<div class="hoja-body"><p class="muted">Cargando el pedido…</p></div>`;
  const e = estado(p.estado), puede = e.sig && e.roles.includes(miRol());
  const anulable = esAdmin() && ['recibido','en_revision','en_taller'].includes(p.estado);
  const entrega = p.entrega === 'agencia' ? 'Agencia de envíos' + (p.agencia ? ' · ' + p.agencia : '') : p.entrega === 'oficina' ? 'Recoge en la oficina' : 'En el local del cliente';
  const cobros = S.cobrosPedido[p.id], verCobros = esRol('socio','administrativo','vendedor');
  const cobrado = (cobros || []).filter(c => c.estado !== 'anulado').reduce((t, c) => t + c.monto, 0), saldo = p.total - cobrado;
  const mostrarCobros = verCobros && p.estado !== 'anulado' && (cobrable(p) || (cobros || []).length);
  const puedeCobrar = mostrarCobros && cobros && cobrable(p) && saldo > 0.005;
  const rev = p.revision;
  const avisoRev = rev ? `<div class="revision-caja"><strong>En revisión${rev.para === 'administracion' ? ' · la ve Administración' : ' · corrige ' + (p.creadoPor === S.perfil?.id ? 'tú' : esc(p.creadoPorNombre))}</strong>
    <span>Motivo: ${esc(rev.motivo)}</span><span class="muted">Lo pidió ${esc(rev.por)} · ${esc(horaCorta(rev.en))}</span>
    ${puedeReenviar(p) ? '<span class="muted">Modifica lo necesario y luego pulsa «Corregido, reenviar».</span>' : ''}</div>` : '';
  const botonesIzq = [
    rol().crea ? `<button class="btn" data-a="repetir" data-id="${p.id}">Repetir</button>` : '',
    puedeModificar(p) ? `<button class="btn" data-a="modificar" data-id="${p.id}">Modificar</button>` : '',
    puedeRevision(p) ? `<button class="btn" data-a="revision" data-id="${p.id}">${p.estado === 'en_revision' ? 'Devolver a quien lo registró' : 'Enviar a revisión'}</button>` : '',
    anulable ? `<button class="btn btn-danger" data-a="anular" data-id="${p.id}">${S.hoja.anular ? 'Confirmar anulación' : 'Anular'}</button>` : ''
  ].join('');
  const botonesDer = [
    puedeCobrar ? `<button class="btn" data-a="cobrar-pedido" data-id="${p.id}">Registrar ${p.condicion === 'adelanto' && p.estado !== 'entregado' ? 'adelanto' : 'cobro'}</button>` : '',
    puedeReenviar(p) ? `<button class="btn btn-p" data-a="reenviar" data-id="${p.id}">Corregido, reenviar</button>` : '',
    puede && !(p.estado === 'en_revision' && !esAdmin()) ? `<button class="btn btn-p" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''
  ].join('');
  return cab(`<span class="num">${p.codigo}</span>`, S.hoja.recien ? 'Pedido registrado' : '') + `<div class="hoja-body">
    <div>${pill(p.estado)}</div>
    ${avisoRev}
    <dl class="dl"><dt>Cliente</dt><dd>${esc(p.cliente.nombre)}${p.cliente.telefono ? ' · ' + esc(p.cliente.telefono) : ''}</dd><dt>Entrega</dt><dd>${esc(fechaCorta(p.fechaEntrega))} · ${esc(entrega)}</dd>
      <dt>Pago</dt><dd>${esc(textoPago(p))}</dd><dt>Canal</dt><dd>${esc(p.canal)}</dd><dt>Registró</dt><dd>${esc(p.creadoPorNombre)}</dd>${p.notas ? `<dt>Notas</dt><dd>${esc(p.notas)}</dd>` : ''}</dl>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Importe</th></tr></thead><tbody>
      ${p.items.map(i => `<tr><td style="white-space:normal">${sw(i.hex)} ${esc(i.nombre)} · ${esc(i.color)}<br><span class="muted num">${i.ml} ml · ${soles(i.docena)} la docena</span></td><td class="r num">${cantidad(i.frascos)}</td><td class="r num">${soles(i.importe)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td class="r num"><strong>${frascosDe(p.items)} frascos</strong></td><td class="r num"><strong>${soles(p.total)}</strong></td></tr></tbody></table></div>
    <div><p class="sub">Empaque para el Taller</p><ul class="hist empaque">${empaque(p.items).map(b => `<li><span>${esc(b.nombre)} ${b.ml} ml · ${b.frascos} frascos</span><strong class="num">${esc(b.texto)}</strong></li>`).join('')}</ul></div>
    ${mostrarCobros ? `<div><p class="sub">Cobranza</p>${!cobros ? '<p class="muted">Cargando cobros…</p>' : `
      <p class="resumen num"><span>Cobrado ${soles(cobrado)}</span><span>Saldo ${soles(saldo)}</span></p>
      ${cobros.length ? `<ul class="hist">${cobros.map(c => `<li><span class="num"><strong>R-${String(c.recibo).padStart(5,'0')}</strong></span><span class="num">${soles(c.monto)}</span><span>${esc(c.medio)}</span><span class="muted">${esc(fechaCorta(c.fecha))}</span>${etiquetaCobro(c.estado)}</li>`).join('')}</ul>` : '<p class="muted">Sin cobros registrados.</p>'}`}</div>`
      : verCobros && p.estado !== 'anulado' ? `<p class="muted">${p.condicion === 'adelanto' ? 'El adelanto se podrá registrar cuando el pedido pase al Taller.' : 'El cobro se registra cuando el pedido esté Entregado.'}</p>` : ''}
    <div><p class="sub">Seguimiento</p><ul class="hist">${p.historial.map(h => `<li>${pill(h.estado)}<span>${esc(h.por)}</span><span class="muted">${esc(horaCorta(h.cuando))}</span>${h.nota ? `<span class="nota">${esc(h.nota)}</span>` : ''}</li>`).join('')}</ul></div>
    </div><div class="hoja-pie"><div style="display:flex;gap:8px;flex-wrap:wrap">${botonesIzq}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${botonesDer}</div></div>`;
};

// Enviar a revisión (motivo obligatorio) o reenviar corregido (nota opcional)
R.hojas.revision = () => {
  const p = S.pedidos.find(x => x.id === S.hoja.id), reenviar = S.hoja.reenviar;
  const para = !p ? '' : reenviar ? 'Vuelve a Recibido y Administración lo envía al Taller.'
    : p.estado === 'en_taller' && esRol('taller','despacho') ? 'Lo verá primero Administración, que decide si lo corrige o lo devuelve a quien lo registró.'
    : `Le llegará una alerta urgente a ${p.creadoPor === S.perfil?.id ? 'ti (lo registraste tú)' : esc(p.creadoPorNombre)} para que lo corrija.`;
  return cab(reenviar ? 'Corregido, reenviar' : p?.estado === 'en_revision' ? 'Devolver a quien lo registró' : 'Enviar a revisión', p ? p.codigo + ' · ' + esc(p.cliente.nombre) : '') + `<div class="hoja-body">
    ${campo('rv-texto', reenviar ? 'Qué corregiste (opcional)' : 'Motivo de la revisión', `<textarea id="rv-texto" data-g="texto" rows="3" maxlength="300" placeholder="${reenviar ? 'Agregué el color negro…' : 'El cliente pidió 120 ml, no 60…'}">${esc(S.g.texto || '')}</textarea>`, true)}
    <p class="muted">${para}</p>${errorHoja()}</div>
    <div class="hoja-pie"><button class="btn" data-a="ver-pedido" data-id="${S.hoja.id}">Volver</button>${botonEnviar('revision-guardar', reenviar ? 'Reenviar' : 'Enviar a revisión')}</div>`;
};

// Guarda un precio escrito a mano para una presentación del cliente elegido y recalcula el carrito
export function fijarManual(presId, valor){
  if (S.manuales.cliente !== S.form.cliente) S.manuales = { cliente:S.form.cliente, m:{} };
  S.manuales.m[presId] = valor; guardaManuales(); S.error = '';
  sincronizarCarrito();
}
export const etiquetaCobro = est => est === 'recibido' ? '<span class="pill st-entregado">Recibido</span>' : est === 'anulado' ? '<span class="pill st-anulado">Anulado</span>' : '<span class="pill st-en_taller">Por entregar</span>';

export async function abrirPedido(id, extra = {}){
  abrirHoja({ tipo:'pedido', id, ...extra });
  if (esRol('socio','administrativo','vendedor')) {
    try { S.cobrosPedido[id] = await D.cobrosDePedido(id); } catch (e) { S.cobrosPedido[id] = []; toast(e.message); }
    if (S.hoja?.tipo === 'pedido' && S.hoja.id === id) renderHoja();
  }
}

/* ---------- Carrito ---------- */
// Recalcula el precio de cada línea con el cliente elegido. Las líneas sin precio se quedan y piden el precio.
export function sincronizarCarrito(){
  S.carrito = S.carrito.flatMap(i => {
    const p = prod(i.producto_id), c = p?.colores.find(x => x.id === i.color_id), pr = p?.presentaciones.find(x => x.id === i.presentacion_id);
    if (!p || !c || !pr) return [];
    const fr = i.frascos ?? (i.cant || 0) * (i.und || 12);         // carritos guardados antes de 0.6.0 contaban bolsas
    if (!(fr > 0)) return [];
    const docena = docenaDe(p.id, pr);
    return [{ producto_id:p.id, color_id:c.id, presentacion_id:pr.id, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades,
      frascos:fr, modo: i.modo || (fr % 12 ? 'unidad' : 'docena'), docena, importe: importe(docena, fr) }];
  });
  guardaCarrito();
}
function agregarAlCarrito(){
  const p = prod(S.sel.prod), pr = p.presentaciones[S.sel.pres]; let n = 0;
  if (!clienteActual()) { S.error = 'Elige primero el cliente.'; return renderHoja(); }
  if (docenaDe(p.id, pr) == null) { S.error = escribePrecio() ? 'Escribe el precio por docena para este cliente (o usa el sugerido).' : 'Esta presentación no tiene precio para este cliente.'; renderHoja(); $('#pm-' + pr.id)?.focus(); return; }
  Object.entries(S.sel.cant).forEach(([colorId, fr]) => { if (!fr) return;
    const item = { producto_id:p.id, color_id:colorId, presentacion_id:pr.id, frascos:fr, modo:S.sel.modo };
    const ya = S.carrito.find(i => clave(i) === clave(item));
    if (ya) { ya.frascos += fr; if (fr % 12) ya.modo = 'unidad'; } else S.carrito.push(item);
    n += fr; });
  sincronizarCarrito();
  S.hoja = S.edicion ? { tipo:'carrito' } : null; renderTodo(); toast(cantidad(n) + ' agregado' + (n === 1 ? '' : 's') + ' al carrito');
}
const datosPedido = f => ({
  cliente_id:f.cliente, canal:f.canal, condicion:f.condicion,
  dias_credito: f.condicion === 'credito' && f.dias !== 'otra' ? Number(f.dias) : null,
  fecha_vence: f.condicion === 'credito' && f.dias === 'otra' ? f.vence : null,
  entrega:f.entrega, agencia: f.entrega === 'agencia' ? f.agencia.trim() : null, fecha_entrega:f.fecha, notas:f.notas.trim() || null
});
const lineasPedido = () => S.carrito.map(i => {
  const pr = presDe(i);
  return { producto_id:i.producto_id, color_id:i.color_id, presentacion_id:i.presentacion_id, frascos:i.frascos,
    ...(tienePrecio(i.producto_id, pr) ? {} : { precio_docena: manualDe(pr) }) };
});
async function confirmarPedido(){
  const f = S.form, ed = S.edicion;
  if (!S.carrito.length || S.enviando) return;
  if (!clienteActual()) { S.error = 'Elige el cliente del pedido.'; return renderHoja(); }
  if (!f.fecha) { S.error = 'Elige la fecha de entrega.'; return renderHoja(); }
  if (f.condicion === 'credito' && f.dias === 'otra' && (!f.vence || f.vence < f.fecha)) { S.error = 'Elige la fecha de vencimiento del crédito (igual o posterior a la entrega).'; return renderHoja(); }
  sincronizarCarrito();
  const falta = S.carrito.find(i => i.importe == null);
  if (falta) { S.error = `Escribe el precio por docena de ${falta.nombre} ${falta.ml} ml.`; renderHoja(); $('#pm-' + falta.presentacion_id)?.focus(); return; }
  S.enviando = true; S.error = ''; renderHoja();
  try {
    const clienteId = f.cliente, habiaManual = S.carrito.some(i => !tienePrecio(i.producto_id, presDe(i)));
    let id;
    if (ed) { await D.editarPedido(ed.id, datosPedido(f), lineasPedido()); id = ed.id; }
    else id = await D.crearPedido(datosPedido(f), lineasPedido());
    if (ed) await terminarEdicion(); else { S.carrito = []; Object.assign(f, { notas:'' }); guardaCarrito(); }
    await recargarPedidos();
    if (habiaManual) { S.manuales = { cliente:'', m:{} }; await elegirCliente(ed ? S.form.cliente : clienteId, { silencio:true }); cargarReferencias(); }
    const p = S.pedidos.find(x => x.id === id);
    S.tab.pedidos = 'pedidos'; S.filtro = 'todos'; $('#buscar').value = S.q.pedidos || '';
    S.enviando = false; renderTodo(); abrirPedido(id, { recien:!ed });
    toast('Pedido ' + (p ? p.codigo : '') + (ed ? ' modificado' : ' registrado'));
    return;
  } catch (e) { S.error = e.message; }
  S.enviando = false; renderTodo();
}

/* ---------- Modificar un pedido ---------- */
// El carrito y los datos actuales se guardan aparte y vuelven al terminar.
async function empezarEdicion(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  if (S.edicion && S.edicion.id !== id) await terminarEdicion();
  const fijos = {}; p.items.forEach(i => { fijos[i.presentacion_id] = i.docena; });
  S.edicion = { id:p.id, codigo:p.codigo, cliente:p.cliente.id, fijos, antes:{ carrito:S.carrito, form:{ ...S.form } } };
  S.carrito = p.items.map(i => ({ producto_id:i.producto_id, color_id:i.color_id, presentacion_id:i.presentacion_id, frascos:i.frascos, modo: i.frascos % 12 ? 'unidad' : 'docena' }));
  Object.assign(S.form, { canal:p.canal, condicion:p.condicion, dias: p.fechaVence ? 'otra' : String(p.diasCredito || 15), vence:p.fechaVence || '',
    entrega:p.entrega, agencia:p.agencia || '', fecha:p.fechaEntrega, notas:p.notas || '' });
  await elegirCliente(p.cliente.id, { silencio:true, conservarCondiciones:true });
  S.modulo = 'pedidos'; S.tab.pedidos = rol().crea ? 'catalogo' : 'pedidos';
  abrirHoja({ tipo:'carrito' }); renderTodo();
  toast(`Modificando ${p.codigo}: cambia cantidades aquí o agrega productos desde el catálogo`);
}
async function terminarEdicion(){
  const ed = S.edicion; if (!ed) return;
  S.carrito = ed.antes?.carrito || []; Object.assign(S.form, ed.antes?.form || {});
  S.edicion = null; guardaCarrito();
  await elegirCliente(S.form.cliente, { silencio:true, conservarCondiciones:true });
}

async function cambiar(id, nuevo, texto){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  try { await D.cambiarEstado(id, nuevo); await recargarPedidos(); toast(p.codigo + ' ' + texto); R.acciones['contar-alertas']?.(); }
  catch (e) { toast(e.message); }
  if (S.hoja?.anular) S.hoja.anular = false;
  renderTodo();
}
async function repetir(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  if (S.edicion) await terminarEdicion();
  if (p.cliente.id && p.cliente.id !== S.form.cliente && S.clientes.some(c => c.id === p.cliente.id)) await elegirCliente(p.cliente.id, { silencio:true });
  let faltan = 0;
  p.items.forEach(i => {
    if (!presDe(i) || !prod(i.producto_id)?.colores.some(c => c.id === i.color_id)) { faltan++; return; }
    const ya = S.carrito.find(x => clave(x) === clave(i));
    if (ya) ya.frascos += i.frascos; else S.carrito.push({ producto_id:i.producto_id, color_id:i.color_id, presentacion_id:i.presentacion_id, frascos:i.frascos });
  });
  sincronizarCarrito(); abrirHoja({ tipo:'carrito' }); renderNav(); renderMain();
  toast(faltan ? `${faltan} líneas ya no están en el catálogo; se copió el resto` : 'Productos de ' + p.codigo + ' copiados al carrito');
}
function linea(k, signo){
  const i = S.carrito.find(x => clave(x) === k); if (!i) return;
  i.frascos += signo * (i.modo === 'unidad' ? 1 : 12);
  if (i.frascos <= 0) S.carrito = S.carrito.filter(x => x !== i);
  sincronizarCarrito(); renderNav(); renderMain(); renderHoja();
}

Object.assign(R.acciones, {
  'filtro': d => { S.filtro = d.id; renderMain(); },
  'abrir-prod': d => {
    // Presentación por defecto: la medida habitual si el cliente tiene precio en ella; si no, la primera con su precio; si no, la habitual
    const p = prod(d.id), hab = habitualDe(p.id), idx = f => p.presentaciones.findIndex(f);
    let i = idx(x => x.medida_ml === hab && tienePrecio(p.id, x));
    if (i < 0) i = idx(x => tienePrecio(p.id, x));
    if (i < 0) i = idx(x => x.medida_ml === hab);
    S.sel = { prod:d.id, pres:Math.max(0, i), cant:{}, q:'', modo:S.modoPref };
    // Sin cliente no hay precios: primero se elige el cliente y luego se abre el producto
    if (!clienteActual()) return abrirHoja({ tipo:'clientes', volver:'producto' }, { q:'', propios: !!S.miVendedor, nuevo:'', tel:'' });
    abrirHoja({ tipo:'producto' });
  },
  'modo': d => { S.sel.modo = d.v; S.modoPref = d.v; guarda('pl_modo', d.v); renderHoja(); },
  'medida-nueva': d => abrirHoja({ tipo:'medida', volver: S.hoja?.tipo || null }, { producto:d.producto, ml:'', und:'12' }),
  'medida-guardar': async () => {
    const g = S.g, ml = Number(g.ml), volver = S.hoja.volver; if (S.enviando) return;
    if (!(ml > 0) || !Number.isInteger(ml)) { S.error = 'Escribe la medida en ml (número entero).'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try {
      await D.crearPresentacion(g.producto, ml, Number(g.und) || 12);
      S.catalogo = await D.catalogo(); S.enviando = false;
      const p = prod(g.producto);
      if (volver === 'producto' && S.sel?.prod === g.producto) { S.sel.pres = Math.max(0, p.presentaciones.findIndex(x => x.medida_ml === ml)); S.hoja = { tipo:'producto' }; }
      else S.hoja = null;
      if (S.modulo === 'alertas') await cargarModulo();
      renderTodo(); toast(`Medida de ${ml} ml agregada a ${p?.nombre || 'el producto'}`);
    } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  },
  'pres': d => { S.sel.pres = +d.i; S.error = ''; renderHoja(); },
  'usar-ref': d => { fijarManual(d.pres, String(d.v)); renderHoja(); },
  'usar-habitual': d => {
    const p = prod(d.producto), hab = habitualDe(p.id), i = p.presentaciones.findIndex(x => x.medida_ml === hab);
    if (i < 0) return;
    S.sel.pres = i;
    if (!tienePrecio(p.id, p.presentaciones[i])) fijarManual(p.presentaciones[i].id, String(refDe(p.id, hab).comun));
    renderHoja();
  },
  'mas-color': d => { S.sel.cant[d.c] = (S.sel.cant[d.c] || 0) + (S.sel.modo === 'docena' ? 12 : 1); S.error = ''; renderHoja(); },
  'menos-color': d => { S.sel.cant[d.c] = Math.max(0, (S.sel.cant[d.c] || 0) - (S.sel.modo === 'docena' ? 12 : 1)); renderHoja(); },
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
  'repetir': d => repetir(d.id),
  'modificar': d => empezarEdicion(d.id),
  'edicion-cancelar': async () => { const id = S.edicion?.id; await terminarEdicion(); renderTodo(); if (id) abrirPedido(id); toast('Cambios descartados'); },
  'revision': d => abrirHoja({ tipo:'revision', id:d.id }, { texto:'' }),
  'reenviar': d => abrirHoja({ tipo:'revision', id:d.id, reenviar:true }, { texto:'' }),
  'revision-guardar': async () => {
    const id = S.hoja.id, reenviar = S.hoja.reenviar, texto = (S.g.texto || '').trim(); if (S.enviando) return;
    if (!reenviar && !texto) { S.error = 'Escribe el motivo de la revisión.'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try {
      if (reenviar) await D.reenviarPedido(id, texto); else await D.enviarRevision(id, texto);
      S.enviando = false; await recargarPedidos(); R.acciones['contar-alertas']?.();
      renderTodo(); abrirPedido(id); toast(reenviar ? 'Pedido reenviado a Administración' : 'Pedido enviado a revisión');
    } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  },
  'elegir-cliente': () => abrirHoja({ tipo:'clientes', volver: S.hoja?.tipo }, { q:'', propios: !!S.miVendedor, nuevo:'', tel:'' }),
  'cli-propios': d => { S.g.propios = d.v === '1'; renderHoja(); },
  'usar-cliente': async d => {
    const volver = S.hoja?.volver; await elegirCliente(d.id);
    S.hoja = volver === 'carrito' ? { tipo:'carrito' } : null; renderTodo();
    if (volver === 'producto' && S.sel?.prod) R.acciones['abrir-prod']({ id:S.sel.prod });
  },
  'crear-cliente': async () => {
    const nombre = (S.g.nuevo || '').trim(); if (!nombre) { S.error = 'Escribe el nombre del cliente nuevo.'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try {
      const c = await D.crearCliente({ nombre, telefono:(S.g.tel || '').trim() });
      S.clientes.push(c); S.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
      const volver = S.hoja?.volver; S.enviando = false; await elegirCliente(c.id, { silencio:true });
      S.hoja = volver === 'carrito' ? { tipo:'carrito' } : null; renderTodo(); toast(`Cliente ${c.codigo} creado`);
      if (volver === 'producto' && S.sel?.prod) R.acciones['abrir-prod']({ id:S.sel.prod });
    } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  }
});

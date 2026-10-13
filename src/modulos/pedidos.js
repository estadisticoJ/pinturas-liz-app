// Módulo Pedidos: catálogo, carrito, lista con estados y consolidado.
import * as D from '../datos.js';
import { S, R, $, esc, soles, hoyISO, fechaCorta, horaCorta, rol, miRol, esRol, guarda, lee, sw, vacio, op, campo,
  toast, renderTodo, renderNav, renderMain, renderHoja, abrirHoja, cab, errorHoja, botonEnviar, busqueda, sinAcentos, cargarModulo } from '../nucleo.js';

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
S.form = { cliente: lee('pl_cliente', ''), canal:'WhatsApp', condicion:'contado', dias:'15', entrega:'local', agencia:'', fecha:hoyISO(), notas:'' };
S.cobrosPedido = {};
S.preciosCli = {};            // 'producto|ml' -> { precio_docena, propio } del cliente elegido
S.miVendedor = null;          // código de vendedor del usuario (JORGE, LILY…) si está vinculado

/* ---------- Precios del cliente elegido ---------- */
const precioDocena = (productoId, ml) => S.preciosCli[productoId + '|' + ml]?.precio_docena;
const precioPaquete = (productoId, pr) => { const d = precioDocena(productoId, pr.medida_ml); return d == null ? null : Math.round(d * pr.unidades / 12 * 100) / 100; };
const clienteActual = () => S.clientes.find(c => c.id === S.form.cliente);
const paquete = und => und === 12 ? 'docena' : und === 6 ? 'media docena' : `paquete de ${und}`;
const redondea = n => Math.round(n * 100) / 100;
// Precio escrito a mano en la hoja del producto (cuando el cliente no tiene precio para esa medida)
const manualDe = pr => { const v = Number(String(S.sel?.manual?.[pr.id] ?? '').replace(',', '.')); return v > 0 ? v : null; };
const precioSel = (p, pr) => { const v = precioPaquete(p.id, pr); if (v != null) return v; const m = manualDe(pr); return m == null ? null : redondea(m * pr.unidades / 12); };
const escribePrecio = () => rol().crea && !!clienteActual();

export async function elegirCliente(id, { silencio = false } = {}){
  S.form.cliente = id || ''; guarda('pl_cliente', S.form.cliente);
  const c = clienteActual();
  if (c) Object.assign(S.form, { condicion: c.condicion_habitual || 'contado', dias: String(c.dias_credito_habitual || 15),
    entrega: c.agencia_habitual ? 'agencia' : S.form.entrega, agencia: c.agencia_habitual || S.form.agencia });
  try {
    const lista = c ? await D.preciosVigentes(c.id) : [];
    S.preciosCli = Object.fromEntries(lista.map(p => [p.producto_id + '|' + p.medida_ml, p]));
  } catch (e) { S.preciosCli = {}; toast(e.message); }
  const antes = S.carrito.length; sincronizarCarrito();
  if (!silencio && c) toast(`Precios de ${c.nombre}` + (S.carrito.length < antes ? ' · se quitaron productos sin precio para este cliente' : ''));
}

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
  if (!S.catalogo.length) return vacio('El catálogo está vacío', 'Carga productos, colores y presentaciones en Supabase (archivo <code>supabase/datos/02_carga_metadatos.sql</code>).');
  const c = clienteActual();
  const barraCliente = `<div class="cliente-bar">${c
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
    const enCar = S.carrito.filter(i => i.producto_id === p.id).reduce((t, i) => t + i.cant, 0);
    const sws = p.colores.slice(0, 8).map(c => `<span class="sw" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`).join('') + (p.colores.length > 8 ? `<span class="muted" style="font-size:12px">+${p.colores.length - 8}</span>` : '');
    const sinMedidas = !p.presentaciones.length;
    if (sinMedidas && !esRol('socio')) return '';
    return `<article class="card"><div class="card-img">${frascos(p.colores.map(c => c.hex))}</div><div class="card-body">
      <span class="eyebrow">${esc(p.linea)}</span><h3>${esc(p.nombre)}</h3>${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}
      <div class="sw-row">${sws}</div>
      <p class="price num">${sinMedidas ? '<small>Sin medidas ni precio</small>' : desde != null ? `Desde ${soles(desde)} <small>la docena · ${ml} ml</small>` : `<small>${c ? 'Sin precio para este cliente' : 'Elige un cliente para ver precios'} · ${ml} ml</small>`}</p>
      ${enCar ? `<span><span class="chip num">${enCar} en el carrito</span></span>` : ''}
      ${sinMedidas ? `<button class="btn" data-a="medida-nueva" data-producto="${p.id}">Agregar medida</button>` : `<button class="btn btn-p" data-a="abrir-prod" data-id="${p.id}">Elegir colores</button>`}</div></article>`;
  }).join('')}</div>`;
}

function vistaPedidos(){
  const r = rol(), base = visibles(), q = sinAcentos(busqueda().trim());
  const cuenta = id => base.filter(p => p.estado === id).length;
  const chips = [['todos', 'Todos', base.length], ...ESTADOS.map(e => [e.id, e.nombre, cuenta(e.id)])].filter(c => c[0] === 'todos' || c[2] > 0 || c[0] === S.filtro);
  const lista = base.filter(p => (S.filtro === 'todos' || p.estado === S.filtro) && (!q || sinAcentos(p.codigo + ' ' + p.cliente.nombre).includes(q)));
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
  const pr = p.presentaciones[S.sel.pres], precio = pr ? precioSel(p, pr) : null, n = Object.values(S.sel.cant).reduce((t, v) => t + v, 0);
  const q = sinAcentos(S.sel.q || ''), colores = p.colores.filter(c => !q || sinAcentos(c.nombre + ' ' + (c.codigo || '')).includes(q));
  const c = clienteActual(), sinPrecio = pr && precioPaquete(p.id, pr) == null;
  const manual = sinPrecio && c ? (escribePrecio() ? `<div class="aviso-caja">
      <p><strong>${esc(c.nombre)} no tiene precio para ${pr.medida_ml} ml.</strong> Escribe el precio por docena acordado. Quedará como su precio${esRol('socio') ? '' : ' y los socios recibirán un aviso para revisarlo'}.</p>
      ${campo('precio-manual', 'Precio por docena (S/)', `<input id="precio-manual" type="text" inputmode="decimal" autocomplete="off" value="${esc(S.sel.manual[pr.id] || '')}" placeholder="0.00">`)}
    </div>` : '<p class="muted">Este cliente no tiene precio para esta medida.</p>') : '';
  return cab(esc(p.nombre), c ? `Precios de ${esc(c.nombre)}` : 'Elige un cliente para ver precios') + `<div class="hoja-body">
    ${!c ? `<div class="cliente-bar compacto"><div><strong>Sin cliente</strong><span class="muted">Elige a quién le vendes para ver sus precios.</span></div><button class="btn btn-p btn-s" data-a="elegir-cliente">Elegir cliente</button></div>` : ''}
    <div><p class="sub">Presentación</p><div class="pres">${p.presentaciones.map((x, i) => { const v = precioPaquete(p.id, x), d = precioDocena(p.id, x.medida_ml), m = manualDe(x);
      return `<button data-a="pres" data-i="${i}" aria-pressed="${i === S.sel.pres}"><span>${x.medida_ml} ml · ${paquete(x.unidades)}</span><span class="num">${v != null ? soles(v) + (x.unidades !== 12 ? ` <small class="muted">(${soles(d)} docena)</small>` : '') : m != null ? soles(precioSel(p, x)) + ' <small class="muted">a mano</small>' : '<small class="muted">Sin precio</small>'}</span></button>`; }).join('')}</div>
      ${esRol('socio') ? `<button class="btn btn-s" data-a="medida-nueva" data-producto="${p.id}" style="margin-top:8px">Agregar medida</button>` : ''}</div>
    ${manual}
    <div><p class="sub">Paquetes por color</p>
      ${p.colores.length > 10 ? `<input id="buscar-color" class="buscador" type="search" placeholder="Buscar color o código" value="${esc(S.sel.q || '')}" aria-label="Buscar color" autocomplete="off">` : ''}
      <div class="colores">${colores.map(c => { const v = S.sel.cant[c.id] || 0; return `<div class="color"><span class="sw" style="background:${esc(c.hex)}"></span><span class="n">${esc(c.nombre)}${c.codigo ? ` <small class="muted">${esc(c.codigo)}</small>` : ''}</span>
      <div class="step"><button data-a="menos-color" data-c="${c.id}" aria-label="Quitar un paquete de ${esc(c.nombre)}" ${v ? '' : 'disabled'}>−</button><output class="num">${v}</output><button data-a="mas-color" data-c="${c.id}" aria-label="Agregar un paquete de ${esc(c.nombre)}">+</button></div></div>`; }).join('') || '<p class="muted">Ningún color coincide.</p>'}</div></div>
    ${errorHoja()}</div><div class="hoja-pie"><div><div class="total num">${precio == null ? 'Sin precio' : soles(n * precio)}</div><div class="muted num">${n} ${pr ? paquete(pr.unidades) + (n === 1 ? '' : 's') : ''} · ${pr ? n * pr.unidades : 0} frascos</div></div><button class="btn btn-p" data-a="agregar" ${n && c ? '' : 'disabled'}>Agregar al carrito</button></div>`;
};

// Medida nueva para un producto (solo socios): por ejemplo, la primera medida de Pegatransfer
R.hojas.medida = () => {
  const g = S.g, p = S.catalogo.find(x => x.id === g.producto);
  return cab('Agregar medida', esc(p?.nombre || '')) + `<div class="hoja-body">
    <p class="muted">Medidas actuales: ${p?.presentaciones.length ? p.presentaciones.map(x => `${x.medida_ml} ml (${paquete(x.unidades)})`).join(', ') : 'ninguna'}.</p>
    <div class="campos">
      ${campo('m-ml', 'Medida (ml)', `<input id="m-ml" data-g="ml" type="number" min="1" step="1" inputmode="numeric" value="${esc(g.ml)}" placeholder="250">`)}
      ${campo('m-und', 'Frascos por paquete', `<select id="m-und" data-g="und">${[[12,'12 (docena)'],[6,'6 (media docena)'],[24,'24 (dos docenas)']].map(([v, t]) => op(v, t, g.und)).join('')}</select>`)}
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
  const f = S.form, items = S.carrito;
  if (!items.length) return cab('Carrito') + `<div class="hoja-body">${vacio('El carrito está vacío', 'Abre un producto del catálogo y elige las bolsas por color.', '<button class="btn btn-p" data-a="cerrar">Ver catálogo</button>')}</div>`;
  const cli = clienteActual();
  return cab('Carrito', `${bolsasDe(items)} paquetes en ${items.length} líneas`) + `<div class="hoja-body">
    <div>${items.map(i => `<div class="linea"><div class="t"><span class="sw" style="background:${esc(i.hex)}"></span><span>${esc(i.nombre)} · ${esc(i.color)}</span></div>
      <div class="step"><button data-a="linea-menos" data-k="${esc(clave(i))}" aria-label="Quitar una bolsa">−</button><output class="num">${i.cant}</output><button data-a="linea-mas" data-k="${esc(clave(i))}" aria-label="Agregar una bolsa">+</button></div>
      <div class="s num">${i.ml} ml · ${paquete(i.und)} · ${soles(i.precio)}${i.manual ? ' <span class="chip">precio a mano</span>' : ''}</div><div class="num" style="text-align:right;font-weight:700">${soles(i.cant * i.precio)}</div></div>`).join('')}</div>
    <p class="sub">Datos del pedido</p>
    <div class="campos">
      <div class="campo full"><label>Cliente</label><div class="cliente-bar compacto"><div><strong>${cli ? esc(cli.nombre) : 'Sin elegir'}</strong>${cli ? `<span class="muted">${esc([cli.codigo, cli.zona].filter(Boolean).join(' · '))}${cli.limite_credito != null ? ' · límite ' + soles(cli.limite_credito) : ''}</span>` : ''}</div><button class="btn btn-s" data-a="elegir-cliente">${cli ? 'Cambiar' : 'Elegir'}</button></div></div>
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
    if (!p || !c || !pr) return [];
    const precio = precioPaquete(p.id, pr);
    if (precio != null) { const { manual, manualCliente, ...resto } = i; return [{ ...resto, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades, precio }]; }
    // Precio escrito a mano: vale solo para el cliente con el que se escribió
    if (i.manual && i.manualCliente === S.form.cliente) return [{ ...i, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades, precio: redondea(i.manual * pr.unidades / 12) }];
    return [];
  });
  guardaCarrito();
}
function agregarAlCarrito(){
  const p = prod(S.sel.prod), pr = p.presentaciones[S.sel.pres], precio = precioSel(p, pr); let n = 0;
  if (!clienteActual()) { S.error = 'Elige primero el cliente.'; return renderHoja(); }
  if (precio == null) { S.error = escribePrecio() ? 'Escribe el precio por docena para este cliente.' : 'Esta presentación no tiene precio para este cliente.'; renderHoja(); $('#precio-manual')?.focus(); return; }
  const manual = precioPaquete(p.id, pr) == null ? manualDe(pr) : null;
  // Todas las líneas de la misma medida usan el mismo precio escrito a mano
  if (manual) S.carrito.forEach(i => { if (i.presentacion_id === pr.id && i.manual) { i.manual = manual; i.precio = precio; } });
  Object.entries(S.sel.cant).forEach(([colorId, cant]) => { if (!cant) return;
    const c = p.colores.find(x => x.id === colorId);
    const item = { producto_id:p.id, color_id:c.id, presentacion_id:pr.id, nombre:p.nombre, color:c.nombre, hex:c.hex, ml:pr.medida_ml, und:pr.unidades, precio, cant,
      ...(manual ? { manual, manualCliente: S.form.cliente } : {}) };
    const ya = S.carrito.find(i => clave(i) === clave(item)); if (ya) ya.cant += cant; else S.carrito.push(item); n += cant; });
  guardaCarrito(); S.hoja = null; renderTodo(); toast(n + ' paquetes agregados al carrito');
}
async function confirmarPedido(){
  const f = S.form;
  if (!S.carrito.length || S.enviando) return;
  if (!clienteActual()) { S.error = 'Elige el cliente del pedido.'; return renderHoja(); }
  if (!f.fecha) { S.error = 'Elige la fecha de entrega.'; return renderHoja(); }
  S.enviando = true; S.error = ''; renderHoja();
  try {
    const clienteId = f.cliente;
    const id = await D.crearPedido({
      cliente_id:clienteId, canal:f.canal, condicion:f.condicion, dias_credito: f.condicion === 'credito' ? Number(f.dias) : null,
      entrega:f.entrega, agencia: f.entrega === 'agencia' ? f.agencia.trim() : null, fecha_entrega:f.fecha, notas:f.notas.trim() || null
    }, S.carrito.map(i => ({ producto_id:i.producto_id, color_id:i.color_id, presentacion_id:i.presentacion_id, bolsas:i.cant,
      ...(i.manual ? { precio_docena:i.manual } : {}) })));
    const habiaManual = S.carrito.some(i => i.manual);
    S.carrito = []; guardaCarrito(); Object.assign(f, { notas:'' });
    await recargarPedidos();
    if (habiaManual) { await elegirCliente(clienteId, { silencio:true }); R.acciones['contar-alertas']?.(); }
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
async function repetir(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  const cli = S.clientes.find(c => c.nombre === p.cliente.nombre);
  if (cli && cli.id !== S.form.cliente) await elegirCliente(cli.id, { silencio:true });
  let faltan = 0;
  p.items.forEach(i => {
    const pr = S.catalogo.find(x => x.colores.some(c => c.id === i.color_id)), c = pr?.colores.find(x => x.id === i.color_id), pre = pr?.presentaciones.find(x => x.id === i.presentacion_id);
    if (!pr || !c || !pre) { faltan++; return; }
    const precio = precioPaquete(pr.id, pre);
    if (precio == null) { faltan++; return; }
    const item = { producto_id:pr.id, color_id:c.id, presentacion_id:pre.id, nombre:pr.nombre, color:c.nombre, hex:c.hex, ml:pre.medida_ml, und:pre.unidades, precio, cant:i.cant };
    const ya = S.carrito.find(x => clave(x) === clave(item)); if (ya) ya.cant += i.cant; else S.carrito.push(item);
  });
  guardaCarrito(); abrirHoja({ tipo:'carrito' }); renderNav(); renderMain();
  toast(faltan ? `${faltan} líneas ya no están en el catálogo o no tienen precio; se copió el resto` : 'Productos de ' + p.codigo + ' copiados al carrito');
}
function linea(k, d){
  const i = S.carrito.find(x => clave(x) === k); if (!i) return;
  i.cant += d; if (i.cant <= 0) S.carrito = S.carrito.filter(x => x !== i);
  guardaCarrito(); renderNav(); renderMain(); renderHoja();
}

Object.assign(R.acciones, {
  'filtro': d => { S.filtro = d.id; renderMain(); },
  'abrir-prod': d => {
    const p = prod(d.id), i = Math.max(0, p.presentaciones.findIndex(x => precioPaquete(p.id, x) != null));
    S.sel = { prod:d.id, pres:i, cant:{}, q:'', manual:{} };
    // Sin cliente no hay precios: primero se elige el cliente y luego se abre el producto
    if (!clienteActual()) return abrirHoja({ tipo:'clientes', volver:'producto' }, { q:'', propios: !!S.miVendedor, nuevo:'', tel:'' });
    abrirHoja({ tipo:'producto' });
  },
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
  'mas-color': d => { S.sel.cant[d.c] = (S.sel.cant[d.c] || 0) + 1; S.error = ''; renderHoja(); },
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
  'repetir': d => repetir(d.id),
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

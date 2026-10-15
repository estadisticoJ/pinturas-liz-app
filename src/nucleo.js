// Núcleo compartido: estado, utilidades, perfiles y el registro donde cada módulo declara
// sus vistas, hojas y acciones. main.js arranca la aplicación; cada archivo de src/modulos agrega un módulo.

/* ============ Perfiles ============
   La base de datos decide qué se permite (RLS y funciones). Esto solo decide qué se muestra. */
export const ROLES = {
  socio:          { mod:['pedidos','clientes','cobranzas','produccion','taller','almacen'], crea:true,  ve:'todos',    filtro:'todos' },
  administrativo: { mod:['pedidos','clientes','cobranzas','taller','almacen'],   crea:true,  ve:'todos',    filtro:'todos' },
  vendedor:       { mod:['pedidos','clientes','cobranzas'],                     crea:true,  ve:'propios',  filtro:'todos' },
  taller:         { mod:['taller','pedidos','almacen'],                         crea:false, ve:'todos',    filtro:'en_taller' },
  despacho:       { mod:['pedidos','taller','almacen'],                         crea:false, ve:'todos',    filtro:'listo' },
  laboratorio:    { mod:['produccion','almacen'],                               crea:false, ve:'ninguno',  filtro:'todos' }
};
export const NOMBRE_ROL = { pendiente:'Sin perfil asignado', socio:'Socio', administrativo:'Administrativo', vendedor:'Vendedor',
  taller:'Encargado de pedidos (Taller)', despacho:'Despacho', laboratorio:'Laboratorio' };

/* ============ Estado ============ */
export const S = {
  uid:undefined, sesion:null, perfil:null, cargando:true,
  catalogo:[], clientes:[], pedidos:[], usuarios:[], carrito:[],
  modulo:'pedidos', tab:{}, q:{}, linea:'todas', filtro:'todos',
  hoja:null, error:'', enviando:false, g:{},                 // g: campos del formulario de la hoja abierta
  datos:{},                                                  // datos cargados por cada módulo
  alertasN:0,                                                // alertas abiertas (socios: todas; otros: las suyas)
  novedadesN:0                                               // novedades no vistas (socios y Administración)
};

/* ============ Registro de módulos ============ */
export const R = { modulos:{}, hojas:{}, acciones:{} };

/* ============ Utilidades ============ */
export const $ = s => document.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const soles = n => 'S/ ' + (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const num = (n, d = 2) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''); };
export const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
export const fechaCorta = iso => { if (!iso) return ''; const [y,m,d] = iso.slice(0,10).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('es-PE', { day:'numeric', month:'short' }); };
export const horaCorta = iso => new Date(iso).toLocaleString('es-PE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
export const diasDesde = iso => { const [y,m,d] = iso.slice(0,10).split('-').map(Number); return Math.floor((Date.now() - new Date(y, m-1, d).getTime()) / 864e5); };
export const codigo = (letra, n) => letra + '-' + String(n).padStart(5, '0');
export const rol = () => ROLES[S.perfil?.rol] || ROLES.vendedor;
export const miRol = () => S.perfil?.rol;
export const esRol = (...rs) => rs.includes(miRol());
export const guarda = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
export const lee = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
export const svgIco = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const sw = hex => `<span class="sw" style="background:${esc(hex)};vertical-align:-2px"></span>`;
export const etiqueta = (texto, tono) => `<span class="pill st-${tono}">${esc(texto)}</span>`;
export const vacio = (titulo, texto, boton = '') => `<div class="vacio"><h3>${titulo}</h3><p>${texto}</p>${boton}</div>`;
export const op = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
export const campo = (id, label, control, full = false) => `<div class="campo${full ? ' full' : ''}"><label for="${id}">${label}</label>${control}</div>`;

// Selectores de producto, color y presentación reutilizados por Taller y Producción
export function selectorProducto(g, conPresentacion){
  const p = S.catalogo.find(x => x.id === g.producto) || S.catalogo[0];
  if (p && g.producto !== p.id) g.producto = p.id;
  if (p && !p.colores.some(c => c.id === g.color)) g.color = p.colores[0]?.id;
  if (p && conPresentacion && !p.presentaciones.some(x => x.id === g.presentacion)) g.presentacion = p.presentaciones[0]?.id;
  if (!p) return '<p class="muted">El catálogo está vacío.</p>';
  return campo('g-producto', 'Producto', `<select id="g-producto" data-g="producto" data-gr="1">${S.catalogo.map(x => op(x.id, x.nombre, g.producto)).join('')}</select>`)
    + campo('g-color', 'Color', `<select id="g-color" data-g="color" data-gr="1">${p.colores.map(c => op(c.id, c.nombre, g.color)).join('')}</select>`)
    + (conPresentacion ? campo('g-pres', 'Presentación', `<select id="g-pres" data-g="presentacion" data-gr="1">${p.presentaciones.map(x => op(x.id, `${x.medida_ml} ml · bolsa de ${x.unidades}`, g.presentacion)).join('')}</select>`) : '');
}
// Fotos de productos: archivos en src/productos/ con el nombre del producto en minúsculas, sin tildes
// y con guiones en vez de espacios (Mate FLT -> mate-flt.webp). Al publicar se incluyen solas.
const FOTOS = Object.fromEntries(Object.entries(import.meta.glob('./productos/*.{webp,png,jpg,jpeg}', { eager:true, query:'?url', import:'default' }))
  .map(([ruta, url]) => [ruta.split('/').pop().replace(/\.[a-z]+$/i, '').toLowerCase(), url]));
export const nombreArchivo = nombre => sinAcentos(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const fotoDe = nombre => FOTOS[nombreArchivo(nombre)] || null;
export function nombreColor(colorId){
  for (const p of S.catalogo) { const c = p.colores.find(x => x.id === colorId); if (c) return { producto:p.nombre, color:c.nombre, hex:c.hex }; }
  return { producto:'', color:'', hex:'#CCCCCC' };
}

/* ============ Mensajes ============ */
let tToast;
export function toast(t){ const el = $('#toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { el.hidden = true; }, 3800); }

/* ============ Dibujo general ============ */
const marca = '<div class="brand"><img class="logo" src="./logo.png" alt="Logo de Pinturas Liz" width="54" height="40"><span class="nombre-marca">Pinturas Liz</span></div>';
export { marca };

export function pintarShell(){
  $('#app').innerHTML = `
  <header class="top"><div class="wrap top-in">${marca}
    <nav class="nav-top" id="nav-top" aria-label="Módulos"></nav><div class="spacer"></div>
    <button class="icon-btn" id="btn-alertas" data-a="mod" data-id="alertas" aria-label="Alertas y novedades"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/></svg><span class="badge num" id="alertas-n" hidden>0</span></button>
    <button class="icon-btn" data-a="perfil" aria-label="Mi cuenta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span class="lbl" id="perfil-nombre"></span></button>
    <button class="icon-btn" id="btn-carrito" data-a="carrito" aria-label="Abrir carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg><span class="badge num" id="carrito-n">0</span></button>
  </div></header>
  <div class="wrap page">
    <div class="tabs" id="subnav" role="tablist" aria-label="Vistas del módulo"></div>
    <div class="search" id="barra"><select id="linea" aria-label="Línea de producto"></select><input id="buscar" type="search" autocomplete="off" aria-label="Buscar"></div>
    <main id="main"></main>
  </div>
  <nav class="bottom" id="nav-bottom" aria-label="Módulos"></nav>
  <div class="velo" id="velo" data-a="cerrar" hidden></div>
  <aside class="hoja" id="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" hidden></aside>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

export const tabActual = () => {
  const m = R.modulos[S.modulo], tabs = m.tabs ? m.tabs() : [];
  if (!tabs.some(t => t[0] === S.tab[S.modulo])) S.tab[S.modulo] = tabs[0]?.[0];
  return S.tab[S.modulo];
};

// Texto del buscador de la vista abierta
export const busqueda = () => S.q[S.modulo + ':' + tabActual()] || '';
export const fijarBusqueda = v => { S.q[S.modulo + ':' + tabActual()] = v; };
export const sinAcentos = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function renderNav(){
  const r = rol();
  if (!r.mod.includes(S.modulo) && !(S.modulo === 'usuarios' && esRol('socio')) && S.modulo !== 'alertas') S.modulo = r.mod[0];
  const mods = r.mod.map(id => [id, R.modulos[id]]);
  $('#nav-top').innerHTML = mods.map(([id, m]) => `<button data-a="mod" data-id="${id}" ${id === S.modulo ? 'aria-current="page"' : ''}>${m.nombre}</button>`).join('');
  $('#nav-bottom').innerHTML = mods.map(([id, m]) => `<button data-a="mod" data-id="${id}" ${id === S.modulo ? 'aria-current="page"' : ''}>${svgIco(m.ico)}${m.corto || m.nombre}</button>`).join('');
  $('#perfil-nombre').textContent = S.perfil.nombre;
  const m = R.modulos[S.modulo], tabs = m.tabs ? m.tabs() : [], t = tabActual();
  $('#subnav').hidden = tabs.length < 2;
  $('#subnav').innerHTML = tabs.map(([id, n]) => `<button role="tab" data-a="tab" data-id="${id}" aria-selected="${id === t}">${esc(n)}</button>`).join('');
  const barra = m.barra ? m.barra(t) : null;
  $('#barra').hidden = !barra;
  if (barra) { $('#linea').hidden = !barra.linea; $('#buscar').placeholder = barra.placeholder; if (document.activeElement !== $('#buscar')) $('#buscar').value = busqueda(); }
  $('#btn-carrito').hidden = !r.crea;
  $('#carrito-n').textContent = S.carrito.reduce((t, i) => t + i.cant, 0);
  const nAv = S.alertasN + S.novedadesN;
  $('#alertas-n').hidden = !nAv; $('#alertas-n').textContent = nAv > 99 ? '99+' : nAv;
  $('#btn-alertas').setAttribute('aria-label', `Alertas y novedades${S.alertasN ? ` · ${S.alertasN} alertas abiertas` : ''}${S.novedadesN ? ` · ${S.novedadesN} novedades` : ''}`);
  if (S.modulo === 'alertas') $('#btn-alertas').setAttribute('aria-current', 'page'); else $('#btn-alertas').removeAttribute('aria-current');
}
export function renderMain(){
  const m = R.modulos[S.modulo];
  if (S.cargando) { $('#main').innerHTML = '<p class="cargando">Cargando datos…</p>'; return; }
  $('#main').innerHTML = m.vista(tabActual());
}
export function renderHoja(){
  const h = $('#hoja'), abierta = !!S.hoja;
  h.hidden = !abierta; $('#velo').hidden = !abierta;
  if (!abierta) { h.innerHTML = ''; return; }
  // Se conserva la posición solo si sigue abierta la misma hoja (al pasar a otra, empieza arriba)
  const cuerpo = h.querySelector('.hoja-body'), y = cuerpo && h.dataset.tipo === S.hoja.tipo ? cuerpo.scrollTop : 0;
  h.dataset.tipo = S.hoja.tipo;
  h.innerHTML = R.hojas[S.hoja.tipo]();
  const nuevo = h.querySelector('.hoja-body'); if (nuevo) nuevo.scrollTop = y;
}
// Actualiza solo las partes marcadas con data-vivo de la hoja abierta (totales, precios), sin tocar el
// campo en el que se está escribiendo: así no se pierde el foco ni se cierra el teclado del celular.
export function refrescarVivo(){
  const h = $('#hoja'); if (!S.hoja || h.hidden) return;
  const t = document.createElement('div'); t.innerHTML = R.hojas[S.hoja.tipo]();
  h.querySelectorAll('[data-vivo]').forEach(el => { const n = t.querySelector(`[data-vivo="${el.dataset.vivo}"]`); if (n) el.replaceWith(n); });
}
export function renderTodo(){ renderNav(); renderMain(); renderHoja(); }
export function abrirHoja(h, g = {}){ S.hoja = h; S.g = g; S.error = ''; S.enviando = false; renderHoja(); const x = $('#hoja .x'); if (x) x.focus(); }
export function cerrarHoja(){ S.hoja = null; S.g = {}; renderHoja(); }
export const cab = (titulo, sub) => `<div class="hoja-cab"><div><h2 id="hoja-titulo">${titulo}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><button class="x" data-a="cerrar" aria-label="Cerrar">✕</button></div>`;
export const errorHoja = () => S.error ? `<p class="error" role="alert">${esc(S.error)}</p>` : '';
export const botonEnviar = (accion, texto, extra = '') => `<button class="btn btn-p" data-a="${accion}" ${extra} ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Guardando…' : texto}</button>`;

// Ejecuta una acción que guarda en la base, con estado "Guardando…" y error dentro de la hoja.
export async function guardar(fn, { ok, recargar = true, cerrar = true } = {}){
  if (S.enviando) return;
  S.enviando = true; S.error = ''; renderHoja();
  try {
    const r = await fn();
    if (cerrar) { S.hoja = null; S.g = {}; }
    if (recargar) await cargarModulo();
    if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
  } catch (e) { S.error = e.message; if (!S.hoja) toast(e.message); }
  S.enviando = false; renderTodo();
}

// Carga los datos del módulo abierto
export async function cargarModulo(){
  const m = R.modulos[S.modulo];
  if (!m.cargar) return;
  try { await m.cargar(tabActual()); } catch (e) { toast(e.message); }
}

import './estilos.css';
import { configurado } from './supabase.js';
import * as D from './datos.js';

/* ============ Reglas de la interfaz por perfil ============
   La base de datos es quien realmente permite o bloquea cada acción (RLS y disparadores);
   esta tabla solo decide qué botones y módulos mostrar. */
const ROLES = {
  socio:{ nombre:'Socio', mod:['pedidos','cobranzas','produccion','almacen','usuarios'], crea:true, ve:'todos', consolidado:true, filtro:'todos' },
  administrativo:{ nombre:'Administración', mod:['pedidos','cobranzas','almacen'], crea:true, ve:'todos', consolidado:true, filtro:'todos' },
  vendedor:{ nombre:'Ventas', mod:['pedidos','cobranzas'], crea:true, ve:'propios', consolidado:false, filtro:'todos' },
  taller:{ nombre:'Taller de Envasado', mod:['pedidos','produccion','almacen'], crea:false, ve:'todos', consolidado:true, filtro:'en_taller' },
  despacho:{ nombre:'Taller · Despacho', mod:['pedidos'], crea:false, ve:'todos', consolidado:false, filtro:'listo' },
  laboratorio:{ nombre:'Laboratorio', mod:['produccion','almacen'], crea:false, ve:'ninguno', consolidado:false, filtro:'todos' }
};
const NOMBRE_ROL = { pendiente:'Sin perfil asignado', socio:'Socio', administrativo:'Administrativo', vendedor:'Vendedor',
  taller:'Encargado de pedidos (Taller)', despacho:'Despacho', laboratorio:'Laboratorio' };
const MODULOS = [
  { id:'pedidos', nombre:'Pedidos', ico:'<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>' },
  { id:'cobranzas', nombre:'Cobranzas', ico:'<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h3.7a1.8 1.8 0 010 3.6h-2.4a1.8 1.8 0 000 3.6h3.7" transform="translate(0 -1.4)"/>' },
  { id:'produccion', nombre:'Producción', ico:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>' },
  { id:'almacen', nombre:'Almacén', ico:'<path d="M3 8l9-5 9 5v11H3z"/><path d="M8 19v-7h8v7"/>' },
  { id:'usuarios', nombre:'Usuarios', ico:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2.2.6 3.5 2.4 3.5 5.2"/>' }
];
const ESTADOS = [
  { id:'recibido', nombre:'Recibido', sig:'en_taller', accion:'Enviar al taller', roles:['socio','administrativo'] },
  { id:'en_taller', nombre:'En taller', sig:'listo', accion:'Marcar listo', roles:['socio','taller'] },
  { id:'listo', nombre:'Listo', sig:'despachado', accion:'Despachar', roles:['socio','taller','despacho'] },
  { id:'despachado', nombre:'Despachado', sig:'entregado', accion:'Marcar entregado', roles:['socio','administrativo','despacho'] },
  { id:'entregado', nombre:'Entregado' },
  { id:'anulado', nombre:'Anulado' }
];
const CANALES = ['Visita de vendedor','WhatsApp','Facebook','Instagram','Llamada','Oficina','Feria'];
const PROXIMOS = {
  cobranzas:{ titulo:'Cobranzas', texto:'Registrará lo cobrado por cada vendedor y la deuda de cada cliente.',
    puntos:['Recibo numerado por cada cobro, en efectivo o digital','Deuda por cliente y días de atraso','Límite de crédito fijado por los socios','Cuadre diario entre lo cobrado y lo entregado a Administración'] },
  produccion:{ titulo:'Producción', texto:'Registrará la orden que el Taller envía al Laboratorio y cada lote fabricado.',
    puntos:['Orden de producción generada desde los pedidos pendientes','Hoja de lote: fórmula, pesadas y cantidad producida','Validación del químico: viscosidad, transparencia y color','Lote y fecha en cada envase de producto a granel'] },
  almacen:{ titulo:'Almacén', texto:'Registrará entradas, salidas y mínimos de los cinco almacenes.',
    puntos:['Insumos (Laboratorio)','Producto a granel (Laboratorio y Taller)','Materiales: frascos, tapas, etiquetas y bolsas (Taller)','Producto envasado (Taller)','Aviso a Compras cuando algo baja de su mínimo'] }
};

/* ============ Utilidades ============ */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const soles = n => 'S/ ' + (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const fechaCorta = iso => { if (!iso) return ''; const [y,m,d] = iso.slice(0,10).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('es-PE', { day:'numeric', month:'short' }); };
const horaCorta = iso => new Date(iso).toLocaleString('es-PE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const estado = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
const rol = () => ROLES[S.perfil?.rol] || ROLES.vendedor;
const miRol = () => S.perfil?.rol;
const prod = id => S.catalogo.find(p => p.id === id);
const clave = i => i.color_id + '|' + i.presentacion_id;
const claveVista = i => [i.nombre, i.color, i.ml, i.und].join('|');
const totalDe = items => items.reduce((t, i) => t + i.cant * i.precio, 0);
const bolsasDe = items => items.reduce((t, i) => t + i.cant, 0);
const guarda = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
const lee = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };

function consolidar(lista){
  const m = new Map();
  lista.filter(p => p.estado === 'recibido' || p.estado === 'en_taller').forEach(p => p.items.forEach(i => {
    const k = claveVista(i), r = m.get(k) || { nombre:i.nombre, color:i.color, hex:i.hex, ml:i.ml, und:i.und, bolsas:0, pedidos:new Set() };
    r.bolsas += i.cant; r.pedidos.add(p.id); m.set(k, r);
  }));
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.ml - b.ml || a.color.localeCompare(b.color));
}

/* ============ Estado ============ */
const S = {
  uid:undefined, sesion:null, perfil:null, cargando:true,
  catalogo:[], clientes:[], pedidos:[], usuarios:[],
  modulo:'pedidos', vista:'catalogo', q:{ catalogo:'', pedidos:'' }, linea:'todas', filtro:'todos',
  carrito: lee('pl_carrito', []), hoja:null, sel:null, error:'', anular:null, recien:null, enviando:false,
  entrada:{ modo:'entrar', error:'', aviso:'', enviando:false },
  form:{ cliente:'', clienteNombre:'', telefono:'', canal:'WhatsApp', condicion:'contado', dias:'15', entrega:'local', agencia:'', fecha:hoyISO(), notas:'' }
};
const visibles = () => rol().ve === 'ninguno' ? [] : S.pedidos;

/* ============ Pantallas fuera de la aplicación ============ */
const marca = '<div class="brand"><span class="gotas" aria-hidden="true"><i style="background:#F6C900"></i><i style="background:#FF62A6"></i><i style="background:#69BFE8"></i></span>Pinturas Liz</div>';
function pintarSinConfig(){
  $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<h1 style="font-size:20px">Falta conectar Supabase</h1>
    <p>Crea el archivo <code>.env</code> a partir de <code>.env.example</code> con la URL y la clave anon de tu proyecto, y vuelve a iniciar la aplicación.</p></div></div>`;
}
function pintarCargando(texto){ $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<p class="muted">${esc(texto || 'Cargando…')}</p></div></div>`; }
function pintarEntrada(){
  const e = S.entrada, nuevo = e.modo === 'registro';
  $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}
    <div class="tabs" role="tablist"><button role="tab" data-a="modo-entrada" data-id="entrar" aria-selected="${!nuevo}">Entrar</button><button role="tab" data-a="modo-entrada" data-id="registro" aria-selected="${nuevo}">Crear cuenta</button></div>
    <form id="f-entrada" novalidate>
      ${nuevo ? '<div class="campo"><label for="e-nombre">Nombre y apellido</label><input id="e-nombre" autocomplete="name" required maxlength="80"></div>' : ''}
      <div class="campo"><label for="e-email">Correo</label><input id="e-email" type="email" autocomplete="email" required></div>
      <div class="campo"><label for="e-pass">Contraseña</label><input id="e-pass" type="password" autocomplete="${nuevo ? 'new-password' : 'current-password'}" required minlength="6"></div>
      ${e.error ? `<p class="error" role="alert">${esc(e.error)}</p>` : ''}${e.aviso ? `<p role="status">${esc(e.aviso)}</p>` : ''}
      <button class="btn btn-p" ${e.enviando ? 'disabled' : ''}>${e.enviando ? 'Un momento…' : nuevo ? 'Crear cuenta' : 'Entrar'}</button>
    </form>
    ${nuevo ? '<p class="muted" style="font-size:13px">Al crear tu cuenta, un socio debe asignarte un perfil antes de que puedas usar el sistema.</p>' : ''}
  </div></div>`;
}
function pintarEspera(){
  $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<h1 style="font-size:20px">Tu cuenta está creada</h1>
    <p>${S.perfil && !S.perfil.activo ? 'Tu acceso está desactivado. Habla con un socio para reactivarlo.' : 'Un socio debe asignarte un perfil (Ventas, Administración, Taller, etc.) para que puedas entrar.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-p" data-a="reintentar">Volver a revisar</button><button class="btn" data-a="salir">Cerrar sesión</button></div></div></div>`;
}

/* ============ Esqueleto de la aplicación ============ */
function pintarShell(){
  $('#app').innerHTML = `
  <header class="top"><div class="wrap top-in">${marca}
    <nav class="nav-top" id="nav-top" aria-label="Módulos"></nav><div class="spacer"></div>
    <button class="icon-btn" data-a="perfil" aria-label="Mi cuenta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span class="lbl" id="perfil-nombre"></span></button>
    <button class="icon-btn" id="btn-carrito" data-a="carrito" aria-label="Abrir carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg><span class="badge num" id="carrito-n">0</span></button>
  </div></header>
  <div class="wrap page">
    <div class="tabs" id="subnav" role="tablist" aria-label="Vistas de Pedidos"></div>
    <div class="search" id="barra"><select id="linea" aria-label="Línea de producto"></select><input id="buscar" type="search" autocomplete="off" aria-label="Buscar"></div>
    <main id="main"></main>
  </div>
  <nav class="bottom" id="nav-bottom" aria-label="Módulos"></nav>
  <div class="velo" id="velo" data-a="cerrar" hidden></div>
  <aside class="hoja" id="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" hidden></aside>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

/* ============ Dibujo ============ */
function frascos(hexes){
  const hs = hexes.slice(0, 3); while (hs.length < 3) hs.push(hs[0] || '#CCCCCC');
  const uno = (h, x) => `<g transform="translate(${x} 0)"><rect x="7" y="2" width="18" height="9" rx="2" fill="var(--tapa)"/><rect x="2" y="11" width="28" height="35" rx="5" fill="${esc(h)}" stroke="var(--line)"/><rect x="6" y="22" width="20" height="12" rx="2" fill="var(--surface)" fill-opacity=".88"/></g>`;
  return `<svg viewBox="0 0 112 48" role="img" aria-label="Frascos de pintura">${uno(hs[0], 4)}${uno(hs[1], 40)}${uno(hs[2], 76)}</svg>`;
}
const svgIco = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const pill = id => `<span class="pill st-${id}">${esc(estado(id).nombre)}</span>`;

function renderNav(){
  const r = rol(), mods = MODULOS.filter(m => r.mod.includes(m.id));
  if (!r.mod.includes(S.modulo)) S.modulo = r.mod[0];
  $('#nav-top').innerHTML = mods.map(m => `<button data-a="mod" data-id="${m.id}" ${m.id === S.modulo ? 'aria-current="page"' : ''}>${m.nombre}</button>`).join('');
  $('#nav-bottom').innerHTML = mods.map(m => `<button data-a="mod" data-id="${m.id}" ${m.id === S.modulo ? 'aria-current="page"' : ''}>${svgIco(m.ico)}${m.nombre}</button>`).join('');
  $('#perfil-nombre').textContent = S.perfil.nombre;
  $('#btn-carrito').hidden = !r.crea;
  $('#carrito-n').textContent = bolsasDe(S.carrito);
  const enPedidos = S.modulo === 'pedidos', vistas = [];
  if (r.crea) vistas.push(['catalogo', 'Catálogo']);
  vistas.push(['pedidos', (r.ve === 'propios' ? 'Mis pedidos' : 'Pedidos') + ' · ' + visibles().length]);
  if (r.consolidado) vistas.push(['consolidado', 'Consolidado']);
  if (enPedidos && !vistas.some(v => v[0] === S.vista)) S.vista = vistas[0][0];
  $('#subnav').hidden = !enPedidos;
  $('#subnav').innerHTML = vistas.map(v => `<button role="tab" data-a="vista" data-id="${v[0]}" aria-selected="${v[0] === S.vista}">${esc(v[1])}</button>`).join('');
  $('#barra').hidden = !(enPedidos && S.vista !== 'consolidado');
  $('#linea').hidden = S.vista !== 'catalogo';
  $('#buscar').placeholder = S.vista === 'catalogo' ? 'Buscar producto o color' : 'Buscar por cliente o número de pedido';
}

function renderMain(){
  const m = $('#main');
  if (S.cargando) { m.innerHTML = '<p class="cargando">Cargando datos…</p>'; return; }
  if (S.modulo === 'usuarios') { m.innerHTML = vistaUsuarios(); return; }
  if (S.modulo !== 'pedidos') {
    const p = PROXIMOS[S.modulo];
    m.innerHTML = `<section class="prox"><span class="eyebrow">Próximo módulo</span><h2>${p.titulo}</h2><p>${p.texto}</p><ul>${p.puntos.map(x => `<li>${x}</li>`).join('')}</ul></section>`;
    return;
  }
  m.innerHTML = S.vista === 'catalogo' ? vistaCatalogo() : S.vista === 'consolidado' ? vistaConsolidado() : vistaPedidos();
}

function vistaCatalogo(){
  if (!S.catalogo.length) return `<div class="vacio"><h3>El catálogo está vacío</h3><p>Carga productos, colores y presentaciones en Supabase (archivo <code>supabase/semillas/catalogo_ejemplo.sql</code>).</p></div>`;
  const q = S.q.catalogo.trim().toLowerCase();
  const lista = S.catalogo.filter(p => (S.linea === 'todas' || p.linea === S.linea) &&
    (!q || (p.nombre + ' ' + p.linea + ' ' + p.colores.map(c => c.nombre).join(' ')).toLowerCase().includes(q)));
  if (!lista.length) return `<div class="vacio"><h3>Ningún producto coincide</h3><p>Prueba con otra palabra o cambia la línea de producto.</p></div>`;
  return `<div class="grid">${lista.map(p => {
    const desde = Math.min(...p.presentaciones.map(x => x.precio)), ml = [...new Set(p.presentaciones.map(x => x.medida_ml))].join(' · ');
    const enCar = S.carrito.filter(i => i.producto_id === p.id).reduce((t, i) => t + i.cant, 0);
    const sw = p.colores.slice(0, 8).map(c => `<span class="sw" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`).join('') + (p.colores.length > 8 ? `<span class="muted" style="font-size:12px">+${p.colores.length - 8}</span>` : '');
    return `<article class="card"><div class="card-img">${frascos(p.colores.map(c => c.hex))}</div><div class="card-body">
      <span class="eyebrow">${esc(p.linea)}</span><h3>${esc(p.nombre)}</h3>${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}
      <div class="sw-row">${sw}</div>
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
  const cab = `<div class="tabs" style="margin-bottom:12px" aria-label="Filtrar por estado">${chips.map(c => `<button data-a="filtro" data-id="${c[0]}" aria-selected="${c[0] === S.filtro}">${c[1]} · ${c[2]}</button>`).join('')}</div>`;
  if (!base.length) return `<div class="vacio"><h3>Aún no hay pedidos</h3><p>${r.crea ? 'Elige productos en el catálogo y confirma el primer pedido.' : 'Aquí aparecerán los pedidos cuando Ventas o Administración los registren.'}</p>${r.crea ? '<button class="btn btn-p" data-a="vista" data-id="catalogo">Ir al catálogo</button>' : ''}</div>`;
  if (!lista.length) return cab + `<div class="vacio"><h3>Ningún pedido en esta vista</h3><p>Cambia el filtro de estado o la búsqueda.</p></div>`;
  return cab + `<div class="lista">${lista.map(p => {
    const e = estado(p.estado), puede = e.sig && e.roles.includes(miRol());
    return `<article class="fila"><div><button class="link num" data-a="ver-pedido" data-id="${p.id}">${p.codigo}</button> <span class="cli">· ${esc(p.cliente.nombre)}</span></div>${pill(p.estado)}
      <div class="meta"><span>Entrega ${esc(fechaCorta(p.fechaEntrega))}</span><span>${esc(p.canal)}</span><span>${esc(p.creadoPorNombre)}</span><span class="num">${bolsasDe(p.items)} bolsas</span></div>
      <div class="pie"><strong class="num">${soles(p.total)}</strong>${puede ? `<button class="btn btn-s" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''}</div></article>`;
  }).join('')}</div>`;
}

function vistaConsolidado(){
  const pend = visibles().filter(p => p.estado === 'recibido' || p.estado === 'en_taller'), filas = consolidar(pend);
  if (!filas.length) return `<div class="vacio"><h3>Nada pendiente de envasar</h3><p>Aquí se suman los pedidos en Recibido y En taller, por producto, color y presentación.</p></div>`;
  const bolsas = filas.reduce((t, f) => t + f.bolsas, 0), frascosN = filas.reduce((t, f) => t + f.bolsas * f.und, 0);
  return `<div class="page" style="padding-block:0"><p class="resumen num"><span>${pend.length} pedidos pendientes</span><span>${bolsas} bolsas</span><span>${frascosN} frascos</span></p>
    <p class="muted">Suma lo que el Taller debe envasar: pedidos en Recibido y En taller.</p>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th>Color</th><th>Presentación</th><th class="r">Bolsas</th><th class="r">Frascos</th><th class="r">Pedidos</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${esc(f.nombre)}</td><td><span class="sw" style="background:${esc(f.hex)};vertical-align:-2px"></span> ${esc(f.color)}</td><td class="num">${f.ml} ml · bolsa de ${f.und}</td><td class="r num">${f.bolsas}</td><td class="r num">${f.bolsas * f.und}</td><td class="r num">${f.pedidos.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function vistaUsuarios(){
  if (!S.usuarios.length) return '<p class="cargando">Cargando usuarios…</p>';
  const opciones = sel => Object.entries(NOMBRE_ROL).map(([id, n]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${n}</option>`).join('');
  const pendientes = S.usuarios.filter(u => u.rol === 'pendiente').length;
  return `<div class="page" style="padding-block:0">
    <p class="muted">${pendientes ? `${pendientes} persona${pendientes > 1 ? 's esperan' : ' espera'} que le asignes un perfil.` : 'Asigna el perfil de cada persona. Quien crea una cuenta queda sin perfil hasta que lo asignes.'}</p>
    <div class="lista">${S.usuarios.map(u => { const yo = u.id === S.perfil.id; return `<div class="usuario">
      <span class="n">${esc(u.nombre)}${yo ? ' <span class="chip">Tú</span>' : ''}</span>
      <select data-u="rol" data-id="${u.id}" aria-label="Perfil de ${esc(u.nombre)}" ${yo ? 'disabled' : ''}>${opciones(u.rol)}</select>
      <label><input type="checkbox" data-u="activo" data-id="${u.id}" ${u.activo ? 'checked' : ''} ${yo ? 'disabled' : ''}> Activo</label></div>`; }).join('')}</div></div>`;
}

/* ---- Hojas ---- */
const cab = (titulo, sub) => `<div class="hoja-cab"><div><h2 id="hoja-titulo">${titulo}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><button class="x" data-a="cerrar" aria-label="Cerrar">✕</button></div>`;
function renderHoja(){
  const h = $('#hoja'), abierta = !!S.hoja;
  h.hidden = !abierta; $('#velo').hidden = !abierta;
  if (!abierta) { h.innerHTML = ''; return; }
  const cuerpo = h.querySelector('.hoja-body'), y = cuerpo ? cuerpo.scrollTop : 0;
  h.innerHTML = S.hoja.tipo === 'producto' ? hojaProducto() : S.hoja.tipo === 'carrito' ? hojaCarrito() : S.hoja.tipo === 'pedido' ? hojaPedido() : hojaPerfil();
  const nuevo = h.querySelector('.hoja-body'); if (nuevo) nuevo.scrollTop = y;
}
function hojaProducto(){
  const p = prod(S.sel.prod); if (!p) return cab('Producto') + '<div class="hoja-body"><p class="muted">Este producto ya no está en el catálogo.</p></div>';
  const pr = p.presentaciones[S.sel.pres], n = Object.values(S.sel.cant).reduce((t, v) => t + v, 0);
  return cab(esc(p.nombre), esc(p.descripcion || '')) + `<div class="hoja-body">
    <div><p class="sub">Presentación</p><div class="pres">${p.presentaciones.map((x, i) => `<button data-a="pres" data-i="${i}" aria-pressed="${i === S.sel.pres}"><span>${x.medida_ml} ml · bolsa de ${x.unidades}</span><span class="num">${soles(x.precio)}</span></button>`).join('')}</div></div>
    <div><p class="sub">Bolsas por color</p><div class="colores">${p.colores.map(c => { const v = S.sel.cant[c.id] || 0; return `<div class="color"><span class="sw" style="background:${esc(c.hex)}"></span><span class="n">${esc(c.nombre)}</span>
      <div class="step"><button data-a="menos-color" data-c="${c.id}" aria-label="Quitar una bolsa de ${esc(c.nombre)}" ${v ? '' : 'disabled'}>−</button><output class="num">${v}</output><button data-a="mas-color" data-c="${c.id}" aria-label="Agregar una bolsa de ${esc(c.nombre)}">+</button></div></div>`; }).join('')}</div></div>
    </div><div class="hoja-pie"><div><div class="total num">${soles(n * pr.precio)}</div><div class="muted num">${n} bolsas · ${n * pr.unidades} frascos</div></div><button class="btn btn-p" data-a="agregar" ${n ? '' : 'disabled'}>Agregar al carrito</button></div>`;
}
function hojaCarrito(){
  const f = S.form, items = S.carrito;
  if (!items.length) return cab('Carrito') + `<div class="hoja-body"><div class="vacio"><h3>El carrito está vacío</h3><p>Abre un producto del catálogo y elige las bolsas por color.</p><button class="btn btn-p" data-a="cerrar">Ver catálogo</button></div></div>`;
  const op = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
  return cab('Carrito', `${bolsasDe(items)} bolsas en ${items.length} líneas`) + `<div class="hoja-body">
    <div>${items.map(i => `<div class="linea"><div class="t"><span class="sw" style="background:${esc(i.hex)}"></span><span>${esc(i.nombre)} · ${esc(i.color)}</span></div>
      <div class="step"><button data-a="linea-menos" data-k="${esc(clave(i))}" aria-label="Quitar una bolsa">−</button><output class="num">${i.cant}</output><button data-a="linea-mas" data-k="${esc(clave(i))}" aria-label="Agregar una bolsa">+</button></div>
      <div class="s num">${i.ml} ml · bolsa de ${i.und} · ${soles(i.precio)}</div><div class="num" style="text-align:right;font-weight:700">${soles(i.cant * i.precio)}</div></div>`).join('')}</div>
    <p class="sub">Datos del pedido</p>
    <div class="campos">
      <div class="campo full"><label for="f-cliente">Cliente</label><select id="f-cliente" data-f="cliente" data-r="1">${S.clientes.map(c => op(c.id, c.nombre + (c.zona ? ' · ' + c.zona : ''), f.cliente)).join('')}${op('nuevo', 'Cliente nuevo…', f.cliente)}</select></div>
      ${f.cliente === 'nuevo' ? `<div class="campo"><label for="f-nombre">Nombre del cliente</label><input id="f-nombre" data-f="clienteNombre" value="${esc(f.clienteNombre)}" maxlength="80"></div><div class="campo"><label for="f-tel">Teléfono (opcional)</label><input id="f-tel" data-f="telefono" inputmode="tel" value="${esc(f.telefono)}" maxlength="20"></div>` : ''}
      <div class="campo"><label for="f-canal">Canal</label><select id="f-canal" data-f="canal">${CANALES.map(c => op(c, c, f.canal)).join('')}</select></div>
      <div class="campo"><label for="f-fecha">Fecha de entrega</label><input id="f-fecha" type="date" data-f="fecha" value="${esc(f.fecha)}"></div>
      <div class="campo"><label for="f-cond">Pago</label><select id="f-cond" data-f="condicion" data-r="1">${op('contado', 'Contado, contra entrega', f.condicion)}${op('credito', 'Crédito', f.condicion)}</select></div>
      ${f.condicion === 'credito' ? `<div class="campo"><label for="f-dias">Plazo del crédito</label><select id="f-dias" data-f="dias">${['7','15','30'].map(d => op(d, d + ' días', f.dias)).join('')}</select></div>` : ''}
      <div class="campo"><label for="f-entrega">Entrega</label><select id="f-entrega" data-f="entrega" data-r="1">${op('local', 'En el local del cliente', f.entrega)}${op('agencia', 'Agencia de envíos', f.entrega)}${op('oficina', 'Recoge en la oficina', f.entrega)}</select></div>
      ${f.entrega === 'agencia' ? `<div class="campo"><label for="f-agencia">Agencia y destino</label><input id="f-agencia" data-f="agencia" value="${esc(f.agencia)}" maxlength="80"></div>` : ''}
      <div class="campo full"><label for="f-notas">Notas (opcional)</label><textarea id="f-notas" data-f="notas" rows="2" maxlength="300">${esc(f.notas)}</textarea></div>
    </div>
    ${S.error ? `<p class="error" role="alert">${esc(S.error)}</p>` : ''}
    </div><div class="hoja-pie"><div><div class="muted">Total</div><div class="total num">${soles(totalDe(items))}</div></div><button class="btn btn-p" data-a="confirmar" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Registrando…' : 'Confirmar pedido'}</button></div>`;
}
function hojaPedido(){
  const p = S.pedidos.find(x => x.id === S.hoja.id);
  if (!p) return cab('Pedido') + `<div class="hoja-body"><p class="muted">Cargando el pedido…</p></div>`;
  const e = estado(p.estado), r = miRol(), puede = e.sig && e.roles.includes(r);
  const anulable = ['socio','administrativo'].includes(r) && ['recibido','en_taller'].includes(p.estado);
  const entrega = p.entrega === 'agencia' ? 'Agencia de envíos' + (p.agencia ? ' · ' + p.agencia : '') : p.entrega === 'oficina' ? 'Recoge en la oficina' : 'En el local del cliente';
  return cab(`<span class="num">${p.codigo}</span>`, S.recien === p.id ? 'Pedido registrado' : '') + `<div class="hoja-body">
    <div>${pill(p.estado)}</div>
    <dl class="dl"><dt>Cliente</dt><dd>${esc(p.cliente.nombre)}${p.cliente.telefono ? ' · ' + esc(p.cliente.telefono) : ''}</dd><dt>Entrega</dt><dd>${esc(fechaCorta(p.fechaEntrega))} · ${esc(entrega)}</dd>
      <dt>Pago</dt><dd>${p.condicion === 'credito' ? 'Crédito a ' + esc(p.diasCredito) + ' días' : 'Contado, contra entrega'}</dd><dt>Canal</dt><dd>${esc(p.canal)}</dd><dt>Registró</dt><dd>${esc(p.creadoPorNombre)}</dd>${p.notas ? `<dt>Notas</dt><dd>${esc(p.notas)}</dd>` : ''}</dl>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th class="r">Bolsas</th><th class="r">Importe</th></tr></thead><tbody>
      ${p.items.map(i => `<tr><td style="white-space:normal"><span class="sw" style="background:${esc(i.hex)};vertical-align:-2px"></span> ${esc(i.nombre)} · ${esc(i.color)}<br><span class="muted num">${i.ml} ml · bolsa de ${i.und}</span></td><td class="r num">${i.cant}</td><td class="r num">${soles(i.cant * i.precio)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td class="r num"><strong>${bolsasDe(p.items)}</strong></td><td class="r num"><strong>${soles(p.total)}</strong></td></tr></tbody></table></div>
    <div><p class="sub">Seguimiento</p><ul class="hist">${p.historial.map(h => `<li>${pill(h.estado)}<span>${esc(h.por)}</span><span class="muted">${esc(horaCorta(h.cuando))}</span></li>`).join('')}</ul></div>
    </div><div class="hoja-pie"><div style="display:flex;gap:8px;flex-wrap:wrap">${rol().crea ? `<button class="btn" data-a="repetir" data-id="${p.id}">Repetir pedido</button>` : ''}${anulable ? `<button class="btn btn-danger" data-a="anular" data-id="${p.id}">${S.anular === p.id ? 'Confirmar anulación' : 'Anular'}</button>` : ''}</div>
    ${puede ? `<button class="btn btn-p" data-a="avanzar" data-id="${p.id}">${e.accion}</button>` : ''}</div>`;
}
function hojaPerfil(){
  return cab(esc(S.perfil.nombre), esc(NOMBRE_ROL[S.perfil.rol] || '')) + `<div class="hoja-body">
    <dl class="dl"><dt>Correo</dt><dd>${esc(S.sesion?.user?.email)}</dd><dt>Perfil</dt><dd>${esc(NOMBRE_ROL[S.perfil.rol])}</dd></dl>
    <p class="muted">Tu perfil define qué módulos ves y qué puedes cambiar. Solo un socio puede modificarlo.</p></div>
    <div class="hoja-pie"><span></span><button class="btn" data-a="salir">Cerrar sesión</button></div>`;
}

/* ============ Acciones ============ */
let tToast;
function toast(t){ const el = $('#toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { el.hidden = true; }, 3600); }
function renderTodo(){ renderNav(); renderMain(); renderHoja(); }
function abrirHoja(h){ S.hoja = h; S.error = ''; S.anular = null; renderHoja(); const x = $('#hoja .x'); if (x) x.focus(); }
function cerrarHoja(){ S.hoja = null; S.recien = null; renderHoja(); }
const guardaCarrito = () => guarda('pl_carrito', S.carrito);

function sincronizarCarrito(){
  // Quita del carrito lo que ya no existe en el catálogo y actualiza los precios.
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
    S.vista = 'pedidos'; S.filtro = 'todos'; S.recien = id; S.hoja = { tipo:'pedido', id };
    $('#buscar').value = S.q.pedidos; toast('Pedido ' + (p ? p.codigo : '') + ' registrado');
  } catch (e) { S.error = e.message; }
  S.enviando = false; renderTodo();
}
async function cambiar(id, nuevo, texto){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  try { await D.cambiarEstado(id, nuevo); await recargarPedidos(); toast(p.codigo + ' ' + texto); }
  catch (e) { toast(/rows returned|0 rows/i.test(e.message) ? 'Tu perfil no puede cambiar este pedido.' : e.message); }
  S.anular = null; renderTodo();
}
function avanzar(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  const e = estado(p.estado); if (e.sig && e.roles.includes(miRol())) cambiar(id, e.sig, 'pasó a ' + estado(e.sig).nombre);
}
function anular(id){
  if (S.anular !== id) { S.anular = id; return renderHoja(); }
  cambiar(id, 'anulado', 'anulado');
}
function repetir(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  let faltan = 0;
  p.items.forEach(i => {
    const pr = S.catalogo.find(x => x.nombre === i.nombre), c = pr?.colores.find(x => x.nombre === i.color), pre = pr?.presentaciones.find(x => x.medida_ml === i.ml && x.unidades === i.und);
    if (!pr || !c || !pre) { faltan++; return; }
    const item = { producto_id:pr.id, color_id:c.id, presentacion_id:pre.id, nombre:pr.nombre, color:c.nombre, hex:c.hex, ml:pre.medida_ml, und:pre.unidades, precio:pre.precio, cant:i.cant };
    const ya = S.carrito.find(x => clave(x) === clave(item)); if (ya) ya.cant += i.cant; else S.carrito.push(item);
  });
  guardaCarrito(); S.hoja = { tipo:'carrito' }; renderTodo();
  toast(faltan ? `${faltan} líneas ya no están en el catálogo; se copió el resto` : 'Productos de ' + p.codigo + ' copiados al carrito');
}
function linea(k, d){
  const i = S.carrito.find(x => clave(x) === k); if (!i) return;
  i.cant += d; if (i.cant <= 0) S.carrito = S.carrito.filter(x => x !== i);
  guardaCarrito(); renderNav(); renderMain(); renderHoja();
}
async function cargarUsuarios(){
  try { S.usuarios = await D.perfiles(); } catch (e) { toast(e.message); }
  if (S.modulo === 'usuarios') renderMain();
}

/* ============ Carga y cambios en vivo ============ */
let pararEscucha = null, tRecarga;
async function recargarPedidos(){
  if (rol().ve === 'ninguno') return;
  try { S.pedidos = await D.pedidos(); } catch (e) { toast(e.message); }
}
function escuchar(){
  if (pararEscucha) pararEscucha();
  pararEscucha = D.escucharPedidos(() => {
    clearTimeout(tRecarga);
    tRecarga = setTimeout(async () => { await recargarPedidos(); renderNav(); renderMain(); if (S.hoja?.tipo === 'pedido') renderHoja(); }, 400);
  });
}
async function cargarTodo(){
  if (pararEscucha) { pararEscucha(); pararEscucha = null; }
  if (!S.sesion) { S.perfil = null; return pintarEntrada(); }
  pintarCargando();
  try { S.perfil = await D.miPerfil(S.sesion.user.id); }
  catch (e) { return pintarCargando(e.message); }
  if (!S.perfil || S.perfil.rol === 'pendiente' || !S.perfil.activo) return pintarEspera();
  const r = rol();
  S.modulo = r.mod[0]; S.vista = r.crea ? 'catalogo' : 'pedidos'; S.filtro = r.filtro;
  S.form.canal = S.perfil.rol === 'vendedor' ? 'Visita de vendedor' : 'WhatsApp';
  S.cargando = true; pintarShell(); renderTodo();
  try {
    const [cat, cli] = await Promise.all([r.crea ? D.catalogo() : [], r.crea ? D.clientes() : [], recargarPedidos()]);
    S.catalogo = cat; S.clientes = cli;
    if (!S.form.cliente || !cli.some(c => c.id === S.form.cliente)) S.form.cliente = cli[0]?.id || 'nuevo';
    sincronizarCarrito();
  } catch (e) { toast(e.message); }
  $('#linea').innerHTML = '<option value="todas">Todas</option>' + [...new Set(S.catalogo.map(p => p.linea))].map(l => `<option>${esc(l)}</option>`).join('');
  S.cargando = false; renderTodo();
  if (r.ve !== 'ninguno') escuchar();
}

/* ============ Eventos ============ */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const d = el.dataset;
  switch (d.a) {
    case 'modo-entrada': S.entrada = { modo:d.id, error:'', aviso:'', enviando:false }; pintarEntrada(); break;
    case 'reintentar': cargarTodo(); break;
    case 'salir': D.salir(); break;
    case 'mod': S.modulo = d.id; S.hoja = null; renderTodo(); window.scrollTo(0, 0); if (d.id === 'usuarios') cargarUsuarios(); break;
    case 'vista': S.vista = d.id; $('#buscar').value = S.q[S.vista] || ''; renderTodo(); break;
    case 'filtro': S.filtro = d.id; renderMain(); break;
    case 'abrir-prod': S.sel = { prod:d.id, pres:0, cant:{} }; abrirHoja({ tipo:'producto' }); break;
    case 'pres': S.sel.pres = +d.i; renderHoja(); break;
    case 'mas-color': S.sel.cant[d.c] = (S.sel.cant[d.c] || 0) + 1; renderHoja(); break;
    case 'menos-color': S.sel.cant[d.c] = Math.max(0, (S.sel.cant[d.c] || 0) - 1); renderHoja(); break;
    case 'agregar': agregarAlCarrito(); break;
    case 'carrito': abrirHoja({ tipo:'carrito' }); break;
    case 'linea-mas': linea(d.k, 1); break;
    case 'linea-menos': linea(d.k, -1); break;
    case 'confirmar': confirmarPedido(); break;
    case 'ver-pedido': abrirHoja({ tipo:'pedido', id:d.id }); break;
    case 'avanzar': avanzar(d.id); break;
    case 'anular': anular(d.id); break;
    case 'repetir': repetir(d.id); break;
    case 'perfil': abrirHoja({ tipo:'perfil' }); break;
    case 'cerrar': cerrarHoja(); break;
  }
});
document.addEventListener('submit', async ev => {
  if (ev.target.id !== 'f-entrada') return;
  ev.preventDefault();
  const e = S.entrada, email = $('#e-email').value.trim(), pass = $('#e-pass').value, nombre = $('#e-nombre')?.value.trim();
  if (!email || !pass || (e.modo === 'registro' && !nombre)) { e.error = 'Completa todos los campos.'; return pintarEntrada(); }
  e.enviando = true; e.error = ''; e.aviso = ''; pintarEntrada(); $('#e-email').value = email;
  try {
    if (e.modo === 'registro') {
      const r = await D.registrarse(nombre, email, pass);
      if (r.requiereConfirmar) { S.entrada = { modo:'entrar', error:'', aviso:'Te enviamos un correo para confirmar tu cuenta. Luego entra con tu contraseña.', enviando:false }; return pintarEntrada(); }
    } else await D.entrar(email, pass);
  } catch (err) { e.error = err.message; e.enviando = false; pintarEntrada(); $('#e-email').value = email; }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'buscar') { S.q[S.vista] = t.value; renderMain(); }
  else if (t.dataset?.f) { S.form[t.dataset.f] = t.value; if (S.error) S.error = ''; }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'linea') { S.linea = t.value; renderMain(); }
  else if (t.dataset?.f) { S.form[t.dataset.f] = t.value; if (t.dataset.r) renderHoja(); }
  else if (t.dataset?.u) {
    const cambio = t.dataset.u === 'rol' ? { rol:t.value } : { activo:t.checked };
    try { await D.cambiarPerfil(t.dataset.id, cambio); toast('Perfil actualizado'); }
    catch (e) { toast(e.message); }
    cargarUsuarios();
  }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.hoja) cerrarHoja(); });

/* ============ Arranque ============ */
if (!configurado) pintarSinConfig();
else {
  pintarCargando();
  D.alCambiarSesion(sesion => {
    const id = sesion?.user?.id ?? null;
    S.sesion = sesion;
    if (id === S.uid) return;            // renovación de sesión: nada que recargar
    S.uid = id;
    setTimeout(cargarTodo, 0);           // fuera del aviso de Supabase, como recomienda su documentación
  });
}

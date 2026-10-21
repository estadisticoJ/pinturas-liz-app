import './estilos.css';
import { registerSW } from 'virtual:pwa-register';
import { configurado } from './supabase.js';
import * as D from './datos.js';
import { S, R, $, esc, rol, esRol, NOMBRE_ROL, marca, toast, campo, errorHoja, botonEnviar, pintarShell, renderTodo, renderNav, renderMain, renderHoja,
  abrirHoja, cerrarHoja, cab, cargarModulo, fijarBusqueda, refrescarVivo } from './nucleo.js';
import { recargarPedidos, elegirCliente, cargarReferencias, fijarManual } from './modulos/pedidos.js';
import './modulos/clientes.js';
import './modulos/cobranzas.js';
import './modulos/produccion.js';
import './modulos/taller.js';
import './modulos/almacen.js';
import './modulos/analisis.js';
import './modulos/usuarios.js';
import { refrescarContador, cargarComentarios } from './modulos/alertas.js';

/* ============ Pantallas fuera de la aplicación ============ */
const entrada = { modo:'entrar', error:'', aviso:'', enviando:false };
function pintarSinConfig(){
  $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<h1 style="font-size:20px">Falta conectar Supabase</h1>
    <p>Crea el archivo <code>.env</code> a partir de <code>.env.example</code> con la URL y la clave de tu proyecto, y vuelve a iniciar la aplicación.
    En GitHub, revisa los secretos <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</p></div></div>`;
}
function pintarCargando(texto){ $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<p class="muted">${esc(texto || 'Cargando…')}</p></div></div>`; }
function pintarEntrada(){
  const e = entrada, nuevo = e.modo === 'registro';
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
    <p class="muted" style="font-size:12px;text-align:center">Versión ${__VERSION__}</p>
  </div></div>`;
}
function pintarEspera(){
  $('#app').innerHTML = `<div class="entrada"><div class="caja">${marca}<h1 style="font-size:20px">Tu cuenta está creada</h1>
    <p>${S.perfil && !S.perfil.activo ? 'Tu acceso está desactivado. Habla con un socio para reactivarlo.' : 'Un socio debe asignarte un perfil (Ventas, Administración, Taller, etc.) para que puedas entrar.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-p" data-a="reintentar">Volver a revisar</button><button class="btn" data-a="salir">Cerrar sesión</button></div></div></div>`;
}

// Guía rápida de cada perfil (PDF dentro de la app, carpeta public/docs)
const GUIA = { desarrollador:'socio', socio:'socio', administrativo:'administracion', vendedor:'vendedor', taller:'taller', despacho:'despacho', laboratorio:'laboratorio' };
R.hojas.perfil = () => cab(esc(S.perfil.nombre), esc(NOMBRE_ROL[S.perfil.rol] || '')) + `<div class="hoja-body">
  <dl class="dl"><dt>Correo</dt><dd>${esc(S.sesion?.user?.email)}</dd><dt>Perfil</dt><dd>${esc(NOMBRE_ROL[S.perfil.rol])}</dd><dt>Versión</dt><dd>${__VERSION__}</dd></dl>
  <p class="muted">Tu perfil define qué módulos ves y qué puedes cambiar. Solo un socio puede modificarlo.</p>
  <p class="sub">Ayuda</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <a class="btn" href="./docs/manual-usuario.pdf" target="_blank" rel="noopener">Manual de usuario (PDF)</a>
    ${GUIA[S.perfil.rol] ? `<a class="btn" href="./docs/guia-${GUIA[S.perfil.rol]}.pdf" target="_blank" rel="noopener">Guía rápida de mi perfil (PDF)</a>` : ''}
    <button class="btn" data-a="aviso-nuevo" data-v="aviso">Avisar un error de datos</button>
    <button class="btn" data-a="aviso-nuevo" data-v="mejora">Sugerir una mejora</button></div>
  <p class="sub">Cuenta</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" data-a="clave">Cambiar contraseña</button>
    ${esRol('socio') ? '<button class="btn" data-a="ir-usuarios">Administrar usuarios</button>' : ''}</div></div>
  <div class="hoja-pie"><span></span><button class="btn" data-a="salir">Cerrar sesión</button></div>`;

R.hojas.clave = () => cab('Cambiar contraseña', esc(S.sesion?.user?.email || '')) + `<div class="hoja-body"><div class="campos">
    ${campo('k-1', 'Contraseña nueva', `<input id="k-1" data-g="c1" type="password" autocomplete="new-password" minlength="8" value="${esc(S.g.c1 || '')}">`)}
    ${campo('k-2', 'Repite la contraseña', `<input id="k-2" data-g="c2" type="password" autocomplete="new-password" minlength="8" value="${esc(S.g.c2 || '')}">`)}
  </div><p class="muted">Mínimo 8 caracteres. Si la olvidas, un socio o el Desarrollador te pone una nueva.</p>${errorHoja()}</div>
  <div class="hoja-pie"><button class="btn" data-a="perfil">Volver</button>${botonEnviar('clave-guardar', 'Guardar contraseña')}</div>`;

/* ============ Carga y cambios en vivo ============ */
let pararEscucha = null, tRecarga, cambios = new Set();
function escuchar(){
  if (pararEscucha) pararEscucha();
  const tablas = ['pedidos','cobros','ordenes_produccion','lotes','alertas','alerta_comentarios'];
  if (esRol('socio','administrativo')) tablas.push('novedades');
  pararEscucha = D.escuchar(tablas, tabla => {
    cambios.add(tabla);
    clearTimeout(tRecarga);
    tRecarga = setTimeout(async () => {
      const t = cambios; cambios = new Set();
      const deAlertas = t.has('alertas') || t.has('alerta_comentarios') || t.has('novedades'), deOtros = [...t].some(x => !x.startsWith('alerta') && x !== 'novedades');
      if (deAlertas) {
        await refrescarContador();
        if (S.hoja?.tipo === 'alerta') await cargarComentarios(S.hoja.id);
      }
      if (deOtros) { try { await recargarPedidos(); } catch (e) { /* se reintenta en el próximo cambio */ } }
      if (deOtros || S.modulo === 'alertas') { await cargarModulo(); renderNav(); renderMain(); }
      if (S.hoja?.tipo === 'pedido') renderHoja();
    }, 600);
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
  S.modulo = r.mod[0]; S.tab = {}; S.filtro = r.filtro; S.datos = {};
  S.form.canal = S.perfil.rol === 'vendedor' ? 'Visita de vendedor' : 'WhatsApp';
  S.cargando = true; pintarShell(); renderTodo();
  try {
    const vende = r.crea || esRol('socio','administrativo');
    const [cat, cli, vend] = await Promise.all([D.catalogo(), vende ? D.clientes() : [], D.vendedores(), recargarPedidos(), vende ? cargarReferencias() : null]);
    S.catalogo = cat; S.clientes = cli; S.vendedores = vend;
    S.miVendedor = vend.find(v => v.perfil_id === S.perfil.id)?.codigo || null;
    if (vende) await elegirCliente(cli.some(c => c.id === S.form.cliente) ? S.form.cliente : '', { silencio:true });
    await Promise.all([cargarModulo(), refrescarContador()]);
  } catch (e) { toast(e.message); }
  $('#linea').innerHTML = '<option value="todas">Todas</option>' + [...new Set(S.catalogo.map(p => p.linea))].map(l => `<option>${esc(l)}</option>`).join('');
  S.cargando = false; renderTodo();
  escuchar();
}

/* ============ Eventos ============ */
Object.assign(R.acciones, {
  'modo-entrada': d => { Object.assign(entrada, { modo:d.id, error:'', aviso:'', enviando:false }); pintarEntrada(); },
  'reintentar': () => cargarTodo(),
  'salir': () => D.salir(),
  'perfil': () => abrirHoja({ tipo:'perfil' }),
  'clave': () => abrirHoja({ tipo:'clave' }, { c1:'', c2:'' }),
  'clave-guardar': async () => {
    const { c1, c2 } = S.g; if (S.enviando) return;
    if (!c1 || c1.length < 8) { S.error = 'La contraseña debe tener al menos 8 caracteres.'; return renderHoja(); }
    if (c1 !== c2) { S.error = 'Las dos contraseñas no coinciden.'; return renderHoja(); }
    S.enviando = true; S.error = ''; renderHoja();
    try { await D.cambiarClave(c1); S.enviando = false; S.hoja = null; S.g = {}; renderHoja(); toast('Contraseña cambiada'); }
    catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
  },
  'cerrar': () => cerrarHoja(),
  'contar-alertas': () => refrescarContador(),
  'mod': async d => {
    S.modulo = d.id; S.hoja = null; renderTodo(); window.scrollTo(0, 0);
    await cargarModulo(); renderTodo();
  },
  'ir-usuarios': async () => { S.modulo = 'usuarios'; S.hoja = null; S.usuarios = []; renderTodo(); await cargarModulo(); renderTodo(); },
  'tab': async d => {
    S.tab[S.modulo] = d.id;
    renderTodo();
    if (R.modulos[S.modulo].porTab) { await cargarModulo(); renderTodo(); }
  }
});

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const fn = R.acciones[el.dataset.a];
  if (fn) fn(el.dataset, el);
});
document.addEventListener('submit', async ev => {
  if (ev.target.id !== 'f-entrada') return;
  ev.preventDefault();
  const e = entrada, email = $('#e-email').value.trim(), pass = $('#e-pass').value, nombre = $('#e-nombre')?.value.trim();
  if (!email || !pass || (e.modo === 'registro' && !nombre)) { e.error = 'Completa todos los campos.'; return pintarEntrada(); }
  e.enviando = true; e.error = ''; e.aviso = ''; pintarEntrada(); $('#e-email').value = email;
  try {
    if (e.modo === 'registro') {
      const r = await D.registrarse(nombre, email, pass);
      if (r.requiereConfirmar) { Object.assign(entrada, { modo:'entrar', error:'', aviso:'Te enviamos un correo para confirmar tu cuenta. Luego entra con tu contraseña.', enviando:false }); return pintarEntrada(); }
    } else await D.entrar(email, pass);
  } catch (err) { e.error = err.message; e.enviando = false; pintarEntrada(); $('#e-email').value = email; }
});
document.addEventListener('input', ev => {
  const t = ev.target, d = t.dataset || {};
  if (t.id === 'buscar') { fijarBusqueda(t.value); renderMain(); }
  else if (d.pm) { fijarManual(d.pm, t.value); refrescarVivo(); }
  else if (t.id === 'buscar-color' || t.id === 'buscar-cliente') {
    if (t.id === 'buscar-color') S.sel.q = t.value; else S.g.q = t.value;
    const pos = t.selectionStart; renderHoja();
    const n = $('#' + t.id); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  }
  else if (d.f) { S.form[d.f] = t.value; if (S.error) S.error = ''; }
  else if (d.g && t.type !== 'checkbox') { S.g[d.g] = t.value; }
  else if (d.gi != null && d.gk) { S.g[d.gl || 'insumos'][+d.gi][d.gk] = t.value; }
});
document.addEventListener('change', async ev => {
  const t = ev.target, d = t.dataset || {};
  if (t.id === 'linea') { S.linea = t.value; renderMain(); }
  else if (d.f) { S.form[d.f] = t.value; if (d.r) renderHoja(); }
  else if (d.g) { S.g[d.g] = t.type === 'checkbox' ? t.checked : t.value; if (d.gr) renderHoja(); }
  else if (d.gi != null && d.gk) { S.g[d.gl || 'insumos'][+d.gi][d.gk] = t.value; }
  else if (d.m) { S.datos.matSel[d.m] = t.value; renderMain(); }
  else if (d.u) {
    const cambio = d.u === 'rol' ? { rol:t.value } : { activo:t.checked };
    try {
      if (d.u === 'vendedor') await D.vincularVendedor(d.id, t.value || null); else await D.cambiarPerfil(d.id, cambio);
      toast('Perfil actualizado');
    }
    catch (e) { toast(e.message); }
    await cargarModulo(); renderMain();
  }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.hoja) cerrarHoja(); });

/* ============ Actualización automática ============
   Al publicar una versión nueva en GitHub, cada celular o computadora la instala sola:
   se revisa al abrir la app, al volver a ella y cada 30 minutos; al instalarla, la página se recarga
   (el carrito queda guardado). */
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg){
    if (!reg) return;
    const revisar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(revisar, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
  }
});

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

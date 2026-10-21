// Módulo Análisis: resumen con métricas de pedidos, cobranzas, producción, taller y almacén.
// Solo socios, Desarrollador y Administración. Los datos vienen de la función analisis() de la base de datos.
// Gráficos simples en HTML/SVG: una sola serie por gráfico (el título dice qué se mide), valores visibles y
// detalle al pasar el dedo o el mouse.
import * as D from '../datos.js';
import { S, R, esc, soles, toast, renderMain, hoyISO } from '../nucleo.js';

const PERIODOS = [['mes', 'Este mes'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['anio', 'Este año'], ['todo', 'Todo']];
const ESTADO = { recibido:'Recibido', en_revision:'En revisión', en_taller:'En taller', listo:'Listo', despachado:'Despachado', entregado:'Entregado', anulado:'Anulado',
  pendiente:'Pendiente', en_proceso:'En proceso', atendida:'Atendida', anulada:'Anulada', en_validacion:'En validación', aprobado:'Aprobado', rechazado:'Rechazado' };
const ALMACEN = { insumos:'Insumos', granel_lab:'Granel Laboratorio', granel_taller:'Granel Taller', materiales:'Materiales', envasado:'Producto envasado' };
const MEDIO = { efectivo:'Efectivo', transferencia:'Transferencia', yape:'Yape', plin:'Plin', deposito:'Depósito' };

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function rango(p){
  const hoy = new Date(), h = hoyISO();
  if (p === 'mes') return [iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), h];
  if (p === 'anio') return [iso(new Date(hoy.getFullYear(), 0, 1)), h];
  if (p === 'todo') return ['2020-01-01', h];
  const d = new Date(hoy); d.setDate(d.getDate() - Number(p) + 1); return [iso(d), h];
}
const entero = n => Math.round(Number(n) || 0).toLocaleString('es-PE');
const corto = n => { const v = Number(n) || 0; return v >= 10000 ? (v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' mil' : entero(v); };
const solesCorto = n => 'S/ ' + corto(n);
const mesCorto = m => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString('es-PE', { month:'short' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const mesTexto = m => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString('es-PE', { month:'long', year:'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const dec = v => (Number(v) || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const litros = v => (Number(v) || 0).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' L';
const plural = (n, uno, varios) => entero(n) + ' ' + (Number(n) === 1 ? uno : varios);
const porCantidad = l => [...l].sort((a, b) => b.cantidad - a.cantidad);

/* ---------- Piezas visuales ---------- */
// Número destacado
const tile = (titulo, valor, nota = '', tono = '') => `<div class="kpi${tono ? ' kpi-' + tono : ''}"><span class="kpi-t">${esc(titulo)}</span><strong class="kpi-v num">${valor}</strong>${nota ? `<span class="kpi-n">${nota}</span>` : ''}</div>`;

// Barras horizontales (ranking o reparto); una sola serie, valor al final de cada barra
function barras(titulo, filas, { valor = 'monto', fmt = soles, etiqueta = f => f.nombre, extra = () => '', vacioTxt = 'Sin datos en este período' } = {}){
  const max = Math.max(0, ...filas.map(f => Number(f[valor]) || 0));
  return `<section class="graf"><h3>${esc(titulo)}</h3>${!filas.length || !max ? `<p class="muted">${vacioTxt}</p>` : `<div class="barras">${filas.map(f => {
    const v = Number(f[valor]) || 0, w = max ? Math.max(v / max * 100, v ? 1.5 : 0) : 0, eti = etiqueta(f);
    return `<div class="barra" tabindex="0" data-tip="${esc(eti)}: ${esc(fmt(v))}${esc(extra(f) ? ' · ' + extra(f) : '')}"><span class="barra-l">${esc(eti)}</span>
      <span class="barra-t"><span class="barra-f" style="width:${w.toFixed(1)}%"></span></span><span class="barra-v num">${esc(fmt(v))}</span></div>`; }).join('')}</div>`}</section>`;
}

// Columnas por mes (SVG); una sola serie, valor sobre cada columna
function columnas(titulo, filas, { valor = 'monto', fmt = solesCorto, fmtTip = soles } = {}){
  const datos = filas.map(f => ({ mes: f.mes, v: Number(f[valor]) || 0 }));
  const max = Math.max(0, ...datos.map(d => d.v));
  if (!datos.length || !max) return `<section class="graf"><h3>${esc(titulo)}</h3><p class="muted">Sin datos en este período</p></section>`;
  const W = 640, H = 220, base = 182, alto = 150, paso = W / datos.length, ancho = Math.min(24, paso * 0.5);
  const lineas = [0.5, 1].map(f => `<line x1="0" x2="${W}" y1="${base - alto * f}" y2="${base - alto * f}" class="grid"/>`).join('');
  const cols = datos.map((d, i) => {
    const h = Math.max(d.v / max * alto, d.v ? 2 : 0), x = i * paso + (paso - ancho) / 2, y = base - h, r = Math.min(4, h);
    const path = h ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${base} Z` : '';
    return `<g class="col" tabindex="0" data-tip="${esc(mesTexto(d.mes))}: ${esc(fmtTip(d.v))}"><rect x="${i * paso}" y="0" width="${paso}" height="${H}" fill="transparent"/>
      ${path ? `<path d="${path}"/>` : ''}<text x="${x + ancho / 2}" y="${y - 6}" class="v">${esc(datos.length <= 8 || d.v === max ? fmt(d.v) : '')}</text>
      <text x="${x + ancho / 2}" y="${base + 18}" class="m">${esc(mesCorto(d.mes) + (i === 0 || d.mes.endsWith('-01') ? ' ' + d.mes.slice(0, 4) : ''))}</text></g>`;
  }).join('');
  return `<section class="graf"><h3>${esc(titulo)}</h3><svg class="columnas" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">${lineas}<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="eje"/>${cols}</svg></section>`;
}

const tabla = (titulo, cab, filas, vacioTxt = 'Sin datos') => `<section class="graf"><h3>${esc(titulo)}</h3>${!filas.length ? `<p class="muted">${vacioTxt}</p>` : `
  <div class="tabla-w"><table class="compacta"><thead><tr>${cab.map(([t, r]) => `<th${r ? ' class="r"' : ''}>${esc(t)}</th>`).join('')}</tr></thead>
  <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td${cab[i][1] ? ' class="r num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}</section>`;

/* ---------- Módulo ---------- */
R.modulos.analisis = {
  nombre:'Análisis',
  ico:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tabs: () => [['resumen','Resumen'], ['pedidos','Pedidos'], ['cobranzas','Cobranzas'], ['produccion','Producción y Taller'], ['almacen','Almacén']],
  async cargar(){
    const a = S.datos.analisis || (S.datos.analisis = { periodo:'90' });
    const [desde, hasta] = rango(a.periodo);
    a.datos = null; a.cargando = true;
    try { a.datos = await D.analisis(desde, hasta); } catch (e) { toast(e.message); }
    a.cargando = false;
  },
  vista(tab){
    const a = S.datos.analisis || {}, d = a.datos;
    const filtro = `<div class="tabs periodo" aria-label="Período">${PERIODOS.map(([id, n]) => `<button data-a="an-periodo" data-id="${id}" aria-selected="${id === a.periodo}">${n}</button>`).join('')}</div>`;
    if (a.cargando || !d) return filtro + '<p class="cargando">Calculando…</p>';
    const cuerpo = tab === 'pedidos' ? vPedidos(d) : tab === 'cobranzas' ? vCobranzas(d) : tab === 'produccion' ? vProduccion(d) : tab === 'almacen' ? vAlmacen(d) : vResumen(d);
    return `<div class="bloque analisis">${filtro}<p class="muted">Del ${esc(fechaLarga(d.periodo.desde))} al ${esc(fechaLarga(d.periodo.hasta))}. Saldos, vencidos, pendientes y existencias son de hoy.</p>${cuerpo}</div>`;
  }
};
const fechaLarga = s => { if (s <= '2020-01-01') return 'inicio'; const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es-PE', { day:'numeric', month:'short', year:'numeric' }); };

function vResumen(d){
  const p = d.pedidos, c = d.cobranzas, pr = d.produccion, t = d.taller;
  const ticket = p.cantidad ? p.monto / p.cantidad : 0;
  const bajo = d.almacen.bajo_minimo.length;
  return `<div class="kpis">
      ${tile('Ventas del período', soles(p.monto), `${entero(p.cantidad)} pedidos · ticket ${soles(ticket)}`)}
      ${tile('Cobrado en el período', soles(c.cobrado), `${entero(c.cobros)} cobros`)}
      ${tile('Por cobrar hoy', soles(c.por_cobrar), c.vencido > 0 ? `<span class="aviso-ic" aria-hidden="true">!</span> ${soles(c.vencido)} vencido` : 'Nada vencido', c.vencido > 0 ? 'alerta' : '')}
      ${tile('Producción aprobada', litros(pr.litros_aprobados), `${plural(pr.lotes, 'lote', 'lotes')} · ${plural(pr.ordenes_pendientes, 'orden pendiente', 'órdenes pendientes')}`)}
      ${tile('Envasado', entero(t.bolsas) + ' bolsas', `${entero(t.frascos)} frascos · faltan ${entero(t.pendiente_bolsas)} bolsas`)}
      ${tile('Almacén', bajo ? bajo + ' bajo mínimo' : 'Todo sobre el mínimo', bajo ? 'Revisa la pestaña Almacén' : '', bajo ? 'alerta' : '')}
    </div>
    <div class="graf-grid">
      ${columnas('Ventas por mes (S/)', p.por_mes)}
      ${barras('Pedidos por estado', p.por_estado.filter(e => e.cantidad), { valor:'cantidad', fmt: entero, etiqueta: f => ESTADO[f.estado] || f.estado, extra: f => soles(f.monto) })}
    </div>`;
}

function vPedidos(d){
  const p = d.pedidos;
  return `<div class="kpis">${tile('Pedidos', entero(p.cantidad), p.anulados ? `${entero(p.anulados)} anulados aparte` : '')}${tile('Ventas', soles(p.monto))}
      ${tile('Ticket promedio', soles(p.cantidad ? p.monto / p.cantidad : 0))}${tile('Frascos vendidos', entero(p.frascos), `${entero(p.frascos / 12)} docenas`)}</div>
    <div class="graf-grid">
      ${columnas('Ventas por mes (S/)', p.por_mes)}
      ${columnas('Pedidos por mes', p.por_mes, { valor:'cantidad', fmt: entero, fmtTip: v => entero(v) + ' pedidos' })}
      ${barras('Pedidos por estado', p.por_estado.filter(e => e.cantidad), { valor:'cantidad', fmt: entero, etiqueta: f => ESTADO[f.estado] || f.estado, extra: f => soles(f.monto) })}
      ${barras('Ventas por vendedor', p.por_vendedor, { extra: f => entero(f.cantidad) + ' pedidos' })}
      ${barras('Ventas por canal', p.por_canal, { extra: f => entero(f.cantidad) + ' pedidos' })}
      ${barras('Productos más vendidos (S/)', p.top_productos, { extra: f => entero(f.frascos) + ' frascos' })}
    </div>
    ${tabla('Mejores clientes del período', [['Cliente'], ['Pedidos', 1], ['Ventas', 1]], p.top_clientes.map(f => [esc(f.nombre), entero(f.cantidad), soles(f.monto)]))}`;
}

function vCobranzas(d){
  const c = d.cobranzas;
  return `<div class="kpis">${tile('Cobrado en el período', soles(c.cobrado), `${entero(c.cobros)} cobros`)}
      ${tile('Por cobrar hoy', soles(c.por_cobrar), 'Pedidos entregados y adelantos')}
      ${tile('Vencido', soles(c.vencido), c.vencido > 0 ? '<span class="aviso-ic" aria-hidden="true">!</span> Pasó la fecha de pago' : 'Nada vencido', c.vencido > 0 ? 'alerta' : '')}
      ${tile('Pedidos en curso', soles(c.en_curso), 'Se cobran al entregar')}
      ${tile('Por entregar a Administración', soles(c.por_entregar), 'Cobrado por vendedores')}</div>
    <div class="graf-grid">
      ${columnas('Cobrado por mes (S/)', c.por_mes)}
      ${barras('Cobrado por medio de pago', c.por_medio, { etiqueta: f => MEDIO[f.nombre] || f.nombre, extra: f => entero(f.cantidad) + ' cobros' })}
      ${barras('Cobrado por persona', c.por_vendedor, { extra: f => entero(f.cantidad) + ' cobros' })}
      ${barras('Clientes con más deuda (S/)', c.clientes.slice(0, 8), { valor:'deuda', extra: f => f.vencido ? soles(f.vencido) + ' vencido' : '' })}
    </div>
    ${tabla('Deuda por cliente (hoy)', [['Cliente'], ['Pedidos', 1], ['Deuda', 1], ['Vencido', 1], ['Límite', 1]],
      c.clientes.map(f => [esc(f.nombre), entero(f.pedidos), soles(f.deuda), f.vencido ? `<span class="txt-alerta">${soles(f.vencido)}</span>` : '—',
        f.limite != null ? soles(f.limite) + (f.deuda > f.limite ? ' <span class="pill alerta st-anulado">Excedido</span>' : '') : '—']), 'Ningún cliente con deuda')}`;
}

function vProduccion(d){
  const pr = d.produccion, t = d.taller;
  return `<div class="kpis">${tile('Producción aprobada', litros(pr.litros_aprobados), `${plural(pr.lotes, 'lote', 'lotes')}${pr.rechazados ? ' · ' + plural(pr.rechazados, 'rechazado', 'rechazados') : ''}`)}
      ${tile('Órdenes pendientes hoy', entero(pr.ordenes_pendientes), 'Pendientes o en proceso')}
      ${tile('Envasado', entero(t.bolsas) + ' bolsas', `${entero(t.frascos)} frascos · ${litros(t.litros)}`)}
      ${tile('Falta envasar hoy', entero(t.pendiente_bolsas) + ' bolsas', `${entero(t.pendiente_frascos)} frascos para pedidos`)}</div>
    <div class="graf-grid">
      ${columnas('Litros producidos por mes', pr.por_mes, { valor:'litros', fmt: v => corto(v), fmtTip: litros })}
      ${columnas('Bolsas envasadas por mes', t.por_mes, { valor:'bolsas', fmt: entero, fmtTip: v => entero(v) + ' bolsas' })}
      ${barras('Colores más producidos (L)', pr.top_colores, { valor:'litros', fmt: litros })}
      ${barras('Productos más envasados (frascos)', t.top_productos, { valor:'frascos', fmt: entero })}
      ${barras('Órdenes de producción por estado', porCantidad(pr.ordenes), { valor:'cantidad', fmt: entero, etiqueta: f => ESTADO[f.nombre] || f.nombre, extra: f => litros(f.litros) })}
      ${barras('Lotes por estado', porCantidad(pr.por_estado), { valor:'cantidad', fmt: entero, etiqueta: f => ESTADO[f.nombre] || f.nombre, extra: f => litros(f.litros) })}
    </div>`;
}

function vAlmacen(d){
  const a = d.almacen;
  return `${tabla('Almacenes (hoy)', [['Almacén'], ['Artículos con existencia', 1], ['Bajo mínimo', 1], ['En negativo', 1]],
      a.por_almacen.map(f => [esc(ALMACEN[f.nombre] || f.nombre), entero(f.articulos),
        f.bajo_minimo ? `<span class="txt-alerta">${entero(f.bajo_minimo)}</span>` : '0', f.negativos ? `<span class="txt-alerta">${entero(f.negativos)}</span>` : '0']))}
    ${tabla('Bajo el mínimo (hoy)', [['Estado'], ['Almacén'], ['Artículo'], ['Existencia', 1], ['Mínimo', 1]],
      a.bajo_minimo.map(f => ['<span class="pill alerta st-anulado">Reponer</span>', esc(ALMACEN[f.almacen] || f.almacen), esc(f.nombre), dec(f.existencia) + ' ' + esc(f.unidad), dec(f.minimo)]),
      'Todos los artículos con mínimo están por encima')}
    <div class="graf-grid">${barras('Granel disponible (L)', a.granel, { valor:'litros', fmt: litros, etiqueta: f => f.nombre + (f.almacen === 'granel_lab' ? ' (Lab.)' : '') })}</div>`;
}

/* ---------- Detalle al pasar el dedo o el mouse ---------- */
let tip;
function mostrarTip(el){
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8) + 'px';
  tip.style.top = (r.top + scrollY - tip.offsetHeight - 8) + 'px';
}
const ocultarTip = () => { if (tip) tip.hidden = true; };
document.addEventListener('pointerover', e => { const el = e.target.closest?.('.analisis [data-tip]'); if (el) mostrarTip(el); else ocultarTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest?.('.analisis [data-tip]'); if (el) mostrarTip(el); });
document.addEventListener('scroll', ocultarTip, { passive: true });

Object.assign(R.acciones, {
  'an-periodo': async d => { S.datos.analisis.periodo = d.id; S.datos.analisis.cargando = true; renderMain(); await R.modulos.analisis.cargar(); renderMain(); }
});

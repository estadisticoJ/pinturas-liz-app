// Módulo Producción (Laboratorio): órdenes que llegan del Taller y lotes fabricados, validados y entregados.
import * as D from '../datos.js';
import { S, R, esc, num, fechaCorta, codigo, esRol, sw, vacio, op, campo, renderTodo, renderHoja, abrirHoja, cab,
  errorHoja, botonEnviar, guardar, selectorProducto } from '../nucleo.js';

const EST_ORDEN = { pendiente:['Pendiente','recibido'], en_proceso:['En proceso','en_taller'], atendida:['Atendida','entregado'], anulada:['Anulada','anulado'] };
const EST_LOTE = { en_validacion:['En validación','en_taller'], aprobado:['Aprobado · en reserva','listo'], rechazado:['Rechazado','anulado'], entregado:['Entregado al Taller','entregado'] };
export const pillOrden = e => `<span class="pill st-${EST_ORDEN[e][1]}">${EST_ORDEN[e][0]}</span>`;
const pillLote = e => `<span class="pill st-${EST_LOTE[e][1]}">${EST_LOTE[e][0]}</span>`;
const producto = x => `${sw(x.color?.hex)} ${esc(x.color?.producto?.nombre)} · ${esc(x.color?.nombre)}`;
const lab = () => esRol('socio','laboratorio');

R.modulos.produccion = {
  nombre:'Producción', corto:'Producción',
  ico:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>',
  tabs: () => [['ordenes','Órdenes del Taller'], ['lotes','Lotes']],
  async cargar(){
    const [ordenes, lotes, insumos] = await Promise.all([D.ordenes(), D.lotes(), D.stock(['insumos'])]);
    S.datos.produccion = { ordenes, lotes, insumos, filtroLote: S.datos.produccion?.filtroLote || 'activos' };
  },
  vista(tab){
    const d = S.datos.produccion; if (!d) return '<p class="cargando">Cargando producción…</p>';
    return tab === 'lotes' ? vistaLotes(d) : vistaOrdenes(d);
  }
};

function vistaOrdenes(d){
  const abiertas = d.ordenes.filter(o => ['pendiente','en_proceso'].includes(o.estado)).sort((a, b) => String(a.fecha_requerida || '9').localeCompare(String(b.fecha_requerida || '9')));
  const cerradas = d.ordenes.filter(o => !['pendiente','en_proceso'].includes(o.estado)).slice(0, 20);
  const fila = o => `<article class="fila"><div><strong class="num">${codigo('O', o.numero)}</strong> <span class="cli">· ${producto(o)}</span></div>${pillOrden(o.estado)}
    <div class="meta"><span class="num">${num(o.litros)} L</span>${o.fecha_requerida ? `<span>Para el ${esc(fechaCorta(o.fecha_requerida))}</span>` : ''}<span>Pidió ${esc(o.solicitante?.nombre || '')}</span>${o.notas ? `<span>${esc(o.notas)}</span>` : ''}</div>
    ${lab() && ['pendiente','en_proceso'].includes(o.estado) ? `<div class="pie"><span></span><span style="display:flex;gap:8px;flex-wrap:wrap">
      ${o.estado === 'pendiente' ? `<button class="btn btn-s" data-a="prod-empezar" data-id="${o.id}">Empezar</button>` : ''}
      <button class="btn btn-s btn-p" data-a="prod-nuevo-lote" data-orden="${o.id}">Registrar lote</button></span></div>` : ''}</article>`;
  return `<div class="bloque">
    ${lab() ? '<div><button class="btn btn-p" data-a="prod-nuevo-lote">Registrar lote sin orden</button></div>' : ''}
    ${abiertas.length ? `<div class="lista">${abiertas.map(fila).join('')}</div>` : vacio('No hay órdenes pendientes', 'Las órdenes las envía el Taller cuando le falta producto a granel.')}
    ${cerradas.length ? `<p class="sub">Últimas órdenes cerradas</p><div class="lista">${cerradas.map(fila).join('')}</div>` : ''}</div>`;
}

function vistaLotes(d){
  const reserva = d.lotes.filter(l => l.estado === 'aprobado');
  const filtros = [['activos','En curso'], ['entregado','Entregados'], ['rechazado','Rechazados'], ['todos','Todos']];
  const lista = d.lotes.filter(l => d.filtroLote === 'todos' || (d.filtroLote === 'activos' ? ['en_validacion','aprobado'].includes(l.estado) : l.estado === d.filtroLote));
  return `<div class="bloque">
    <p class="resumen num"><span>Reserva de granel del Laboratorio: ${num(reserva.reduce((t, l) => t + l.litros, 0))} L en ${reserva.length} lotes aprobados</span></p>
    <div class="tabs" aria-label="Filtrar lotes">${filtros.map(([id, n]) => `<button data-a="prod-filtro" data-id="${id}" aria-selected="${id === d.filtroLote}">${n}</button>`).join('')}</div>
    ${!lista.length ? vacio('No hay lotes en esta vista', lab() ? 'Registra un lote desde una orden del Taller o sin orden.' : 'Aquí aparecen los lotes del Laboratorio.') : `<div class="lista">${lista.map(l => `
      <article class="fila"><div><strong class="num">${codigo('L', l.numero)}</strong> <span class="cli">· ${producto(l)}</span></div>${pillLote(l.estado)}
        <div class="meta"><span class="num">${num(l.litros)} L</span><span>${esc(fechaCorta(l.fecha))}</span>${l.orden ? `<span class="num">${codigo('O', l.orden.numero)}</span>` : ''}<span>Fabricó ${esc(l.registrador?.nombre || '')}</span>
          ${l.viscosidad ? `<span>Viscosidad ${esc(l.viscosidad)}</span>` : ''}${l.transparencia ? `<span>Transparencia ${esc(l.transparencia)}</span>` : ''}${l.color_ok != null ? `<span>Color ${l.color_ok ? 'conforme' : 'no conforme'}</span>` : ''}
          ${l.insumos?.length ? `<span>Insumos: ${l.insumos.map(i => `${esc(i.articulo?.nombre)} ${num(i.cantidad, 3)} ${esc(i.articulo?.unidad)}`).join(', ')}</span>` : ''}${l.notas ? `<span>${esc(l.notas)}</span>` : ''}</div>
        ${lab() && ['en_validacion','aprobado'].includes(l.estado) ? `<div class="pie"><span></span>${l.estado === 'en_validacion'
          ? `<button class="btn btn-s btn-p" data-a="prod-validar" data-id="${l.id}">Validar</button>`
          : `<button class="btn btn-s btn-p" data-a="prod-entregar" data-id="${l.id}">${S.datos.entregar === l.id ? 'Confirmar entrega' : 'Entregar al Taller'}</button>`}</div>` : ''}</article>`).join('')}</div>`}</div>`;
}

/* ---------- Hojas ---------- */
R.hojas.lote = () => {
  const g = S.g, d = S.datos.produccion;
  const ordenes = d.ordenes.filter(o => ['pendiente','en_proceso'].includes(o.estado) && o.color_id === g.color);
  return cab('Registrar lote', 'Lo fabricado queda en validación hasta que el químico lo apruebe') + `<div class="hoja-body"><div class="campos">
    ${selectorProducto(g, false)}
    ${campo('g-litros', 'Cantidad fabricada (litros)', `<input id="g-litros" data-g="litros" type="number" inputmode="decimal" min="0.1" step="0.1" value="${esc(g.litros)}">`)}
    ${campo('g-orden', 'Orden del Taller', `<select id="g-orden" data-g="orden">${op('', 'Sin orden (para reserva)', g.orden)}${ordenes.map(o => op(o.id, `${codigo('O', o.numero)} · ${num(o.litros)} L`, g.orden)).join('')}</select>`)}
    </div>
    <div><p class="sub">Insumos usados</p>
      ${g.insumos.map((x, i) => `<div class="fila-form"><select data-gi="${i}" data-gk="articulo_id" aria-label="Insumo">${op('', 'Elige un insumo', x.articulo_id)}${d.insumos.map(s => op(s.articulo_id, `${s.nombre} (hay ${num(s.existencia, 3)} ${s.unidad})`, x.articulo_id)).join('')}</select>
        <input data-gi="${i}" data-gk="cantidad" type="number" min="0" step="0.001" inputmode="decimal" placeholder="Cantidad" aria-label="Cantidad" value="${esc(x.cantidad)}">
        <button class="x" data-a="prod-quitar-insumo" data-i="${i}" aria-label="Quitar insumo">✕</button></div>`).join('')}
      ${d.insumos.length ? '<button class="btn btn-s" data-a="prod-agregar-insumo">Agregar insumo</button>' : '<p class="muted">Aún no hay insumos registrados. Créalos en Almacén &gt; Insumos.</p>'}
    </div>
    ${campo('g-notas', 'Notas (opcional)', `<textarea id="g-notas" data-g="notas" rows="2" maxlength="300">${esc(g.notas)}</textarea>`, true)}
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('prod-guardar-lote', 'Registrar lote')}</div>`;
};
R.hojas.validar = () => {
  const g = S.g, l = S.datos.produccion.lotes.find(x => x.id === g.id);
  return cab('Validar ' + codigo('L', l.numero), `${esc(l.color?.producto?.nombre)} · ${esc(l.color?.nombre)} · ${num(l.litros)} L`) + `<div class="hoja-body"><div class="campos">
    ${campo('g-visc', 'Viscosidad', `<input id="g-visc" data-g="viscosidad" maxlength="40" value="${esc(g.viscosidad)}" placeholder="Ej.: 85 KU">`)}
    ${campo('g-transp', 'Transparencia', `<input id="g-transp" data-g="transparencia" maxlength="40" value="${esc(g.transparencia)}" placeholder="Ej.: conforme">`)}
    <div class="campo full"><label class="check"><input type="checkbox" data-g="colorOk" ${g.colorOk ? 'checked' : ''}> El color coincide con el patrón en la paleta</label></div>
    ${campo('g-notas', 'Notas (opcional)', `<textarea id="g-notas" data-g="notas" rows="2" maxlength="300">${esc(g.notas)}</textarea>`, true)}
    </div><p class="muted">Al aprobar, el lote entra a la reserva de granel del Laboratorio. Al rechazar, no entra a ningún almacén.</p>${errorHoja()}</div>
    <div class="hoja-pie"><button class="btn btn-danger" data-a="prod-guardar-validacion" data-ok="0" ${S.enviando ? 'disabled' : ''}>Rechazar</button>${botonEnviar('prod-guardar-validacion', 'Aprobar lote', 'data-ok="1"')}</div>`;
};

Object.assign(R.acciones, {
  'prod-filtro': d => { S.datos.produccion.filtroLote = d.id; renderTodo(); },
  'prod-empezar': d => guardar(() => D.cambiarOrden(d.id, 'en_proceso'), { ok:'Orden en proceso', cerrar:false }),
  'prod-nuevo-lote': d => {
    const o = S.datos.produccion.ordenes.find(x => x.id === d.orden);
    const p = o && S.catalogo.find(x => x.colores.some(c => c.id === o.color_id));
    abrirHoja({ tipo:'lote' }, { producto:p?.id, color:o?.color_id, litros:o ? String(o.litros) : '', orden:o?.id || '', insumos:[{ articulo_id:'', cantidad:'' }], notas:'' });
  },
  'prod-agregar-insumo': () => { S.g.insumos.push({ articulo_id:'', cantidad:'' }); renderHoja(); },
  'prod-quitar-insumo': d => { S.g.insumos.splice(+d.i, 1); renderHoja(); },
  'prod-guardar-lote': () => {
    const g = S.g, litros = Number(g.litros);
    if (!(litros > 0)) { S.error = 'Escribe la cantidad fabricada en litros.'; return renderHoja(); }
    const insumos = g.insumos.filter(x => x.articulo_id || x.cantidad);
    if (insumos.some(x => !x.articulo_id || !(Number(x.cantidad) > 0))) { S.error = 'Cada insumo necesita nombre y una cantidad mayor que cero.'; return renderHoja(); }
    if (new Set(insumos.map(x => x.articulo_id)).size !== insumos.length) { S.error = 'Un insumo aparece dos veces; súmalo en una sola línea.'; return renderHoja(); }
    guardar(() => D.registrarLote({ color:g.color, litros, orden:g.orden, notas:g.notas, insumos:insumos.map(x => ({ articulo_id:x.articulo_id, cantidad:Number(x.cantidad) })) }),
      { ok:'Lote registrado; queda en validación' });
  },
  'prod-validar': d => abrirHoja({ tipo:'validar' }, { id:d.id, viscosidad:'', transparencia:'', colorOk:true, notas:'' }),
  'prod-guardar-validacion': d => {
    const g = S.g, aprobado = d.ok === '1';
    guardar(() => D.validarLote({ lote:g.id, aprobado, viscosidad:g.viscosidad, transparencia:g.transparencia, colorOk:!!g.colorOk, notas:g.notas }),
      { ok: aprobado ? 'Lote aprobado; entró a la reserva del Laboratorio' : 'Lote rechazado' });
  },
  'prod-entregar': d => {
    if (S.datos.entregar !== d.id) { S.datos.entregar = d.id; return renderTodo(); }
    S.datos.entregar = null;
    guardar(() => D.entregarLote(d.id), { ok:'Lote entregado al Taller', cerrar:false });
  }
});

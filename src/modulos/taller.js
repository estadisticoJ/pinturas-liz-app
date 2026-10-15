// Módulo Taller de Envasado: qué falta envasar, registro de envasados, órdenes al Laboratorio
// y materiales que consume cada bolsa.
import * as D from '../datos.js';
import { cantidad } from '../nucleo.js';
import { S, R, esc, num, fechaCorta, toast, codigo, esRol, sw, vacio, op, campo, renderTodo, renderHoja, abrirHoja, cab,
  errorHoja, botonEnviar, guardar, selectorProducto, nombreColor } from '../nucleo.js';
import { pillOrden } from './produccion.js';

const producto = x => `${sw(x.color?.hex)} ${esc(x.color?.producto?.nombre)} · ${esc(x.color?.nombre)}`;
const presentacion = id => { for (const p of S.catalogo) { const x = p.presentaciones.find(y => y.id === id); if (x) return x; } return null; };

R.modulos.taller = {
  nombre:'Taller',
  ico:'<path d="M4 20h16"/><path d="M6 20V10l3-3h6l3 3v10"/><path d="M10 7V4h4v3"/><path d="M9 14h6"/>',
  tabs(){
    const t = [['porenvasar','Por envasar'], ['envasados','Envasados'], ['ordenes','Pedidos al Laboratorio']];
    if (esRol('socio','administrativo','taller')) t.push(['materiales','Materiales por bolsa']);
    return t;
  },
  async cargar(){
    const [porEnvasar, envasados, ordenes, materiales, stock, lotes] = await Promise.all([
      D.porEnvasar(), D.envasados(), D.ordenes(), D.materialesPorBolsa(), D.stock(['granel_taller','envasado','materiales']), D.lotes()]);
    S.datos.taller = { porEnvasar, envasados, ordenes, materiales, stock, lotes };
  },
  vista(tab){
    const d = S.datos.taller; if (!d) return '<p class="cargando">Cargando taller…</p>';
    return tab === 'envasados' ? vistaEnvasados(d) : tab === 'ordenes' ? vistaOrdenes(d) : tab === 'materiales' ? vistaMateriales(d) : vistaPorEnvasar(d);
  }
};
const puedeEnvasar = () => esRol('socio','taller','despacho');
const puedePedir = () => esRol('socio','administrativo','taller','despacho');

function vistaPorEnvasar(d){
  if (!d.porEnvasar.length) return vacio('No hay pedidos pendientes de envasar', 'Aquí aparecen los pedidos en Recibido y En taller, descontando lo que ya está envasado.', puedeEnvasar() ? '<button class="btn btn-p" data-a="tal-envasar">Registrar envasado para stock</button>' : '');
  const falta = d.porEnvasar.filter(f => f.faltan_bolsas > 0);
  return `<div class="bloque">
    <p class="resumen num"><span>${falta.length} de ${d.porEnvasar.length} líneas por envasar</span><span>Envasar ${falta.reduce((t, f) => t + f.faltan_bolsas, 0)} bolsas</span><span>Granel necesario ${num(falta.reduce((t, f) => t + f.litros_necesarios, 0), 3)} L</span></p>
    <p class="muted">Pedidos en Recibido y En taller, comparados con el producto ya envasado y el granel que hay en el Taller.</p>
    <div class="tabla-w"><table><thead><tr><th>Producto</th><th>Presentación</th><th class="r">Pedido</th><th class="r">Envasado</th><th class="r">Faltan</th><th class="r">Bolsas a envasar</th><th class="r">Granel necesario</th><th class="r">Granel en Taller</th><th></th></tr></thead><tbody>
    ${d.porEnvasar.map(f => { const corto = f.faltan_bolsas > 0 && f.granel_disponible < f.litros_necesarios;
      return `<tr><td>${sw(f.hex)} ${esc(f.producto)} · ${esc(f.color)}</td><td class="num">${f.medida_ml} ml · bolsa de ${f.unidades}</td><td class="r num">${cantidad(f.frascos)}</td><td class="r num">${num(f.envasado_disponible)} u</td>
        <td class="r num">${cantidad(f.faltan_frascos)}</td><td class="r num"><strong>${num(f.faltan_bolsas)}</strong></td><td class="r num">${num(f.litros_necesarios, 3)} L</td><td class="r num ${corto ? 'txt-alerta' : ''}">${num(f.granel_disponible, 3)} L</td>
        <td><span style="display:flex;gap:6px">${f.faltan_bolsas > 0 && puedeEnvasar() && !corto ? `<button class="btn btn-s btn-p" data-a="tal-envasar" data-color="${f.color_id}" data-pres="${f.presentacion_id}" data-bolsas="${f.faltan_bolsas}">Envasar</button>` : ''}
          ${corto && puedePedir() ? `<button class="btn btn-s" data-a="tal-orden" data-color="${f.color_id}" data-litros="${Math.ceil((f.litros_necesarios - f.granel_disponible) * 10) / 10}">Pedir granel</button>` : ''}</span></td></tr>`; }).join('')}
    </tbody></table></div>
    ${puedeEnvasar() ? '<div><button class="btn" data-a="tal-envasar">Registrar envasado para stock</button></div>' : ''}</div>`;
}

function vistaEnvasados(d){
  return `<div class="bloque">${puedeEnvasar() ? '<div><button class="btn btn-p" data-a="tal-envasar">Registrar envasado</button></div>' : ''}
    ${!d.envasados.length ? vacio('Aún no hay envasados', 'Cada envasado descuenta granel y materiales, y suma bolsas al almacén de producto envasado.') : `<div class="lista">${d.envasados.map(e => `
      <article class="fila"><div><strong class="num">${codigo('E', e.numero)}</strong> <span class="cli">· ${producto(e)}</span></div><span class="chip num">${e.bolsas} bolsas</span>
        <div class="meta"><span class="num">${e.presentacion?.medida_ml} ml · bolsa de ${e.presentacion?.unidades}</span><span class="num">${num(e.litros, 3)} L de granel</span>${e.lote ? `<span class="num">${codigo('L', e.lote.numero)}</span>` : ''}<span>${esc(e.persona?.nombre || '')}</span><span>${esc(fechaCorta(e.fecha))}</span>${e.notas ? `<span>${esc(e.notas)}</span>` : ''}</div></article>`).join('')}</div>`}</div>`;
}

function vistaOrdenes(d){
  const fila = o => `<article class="fila"><div><strong class="num">${codigo('O', o.numero)}</strong> <span class="cli">· ${producto(o)}</span></div>${pillOrden(o.estado)}
    <div class="meta"><span class="num">${num(o.litros)} L</span>${o.fecha_requerida ? `<span>Para el ${esc(fechaCorta(o.fecha_requerida))}</span>` : ''}<span>Pidió ${esc(o.solicitante?.nombre || '')}</span>${o.notas ? `<span>${esc(o.notas)}</span>` : ''}</div>
    ${o.estado === 'pendiente' && puedePedir() ? `<div class="pie"><span></span><button class="btn btn-s btn-danger" data-a="tal-anular-orden" data-id="${o.id}">${S.datos.anularOrden === o.id ? 'Confirmar anulación' : 'Anular'}</button></div>` : ''}</article>`;
  return `<div class="bloque">${puedePedir() ? '<div><button class="btn btn-p" data-a="tal-orden">Nueva orden al Laboratorio</button></div>' : ''}
    <p class="muted">Reemplaza la orden en papel: el Laboratorio la ve al instante y la marca como atendida al entregar el lote.</p>
    ${d.ordenes.length ? `<div class="lista">${d.ordenes.slice(0, 60).map(fila).join('')}</div>` : vacio('Aún no hay órdenes', 'Pide granel al Laboratorio cuando no alcance para envasar.')}</div>`;
}

function vistaMateriales(d){
  const g = S.datos.matSel || (S.datos.matSel = {});
  const sel = selectorProducto(g, true).replace(/data-g=/g, 'data-m=');
  const lista = d.materiales.filter(m => m.presentacion_id === g.presentacion);
  const mats = d.stock.filter(s => s.almacen === 'materiales');
  return `<div class="bloque"><p class="muted">Indica cuántos frascos, tapas, etiquetas y bolsas consume cada bolsa envasada. Así cada envasado descuenta los materiales solo.</p>
    <div class="campos">${sel}</div>
    ${lista.length ? `<div class="tabla-w"><table><thead><tr><th>Material</th><th class="r">Por bolsa</th><th></th></tr></thead><tbody>
      ${lista.map(m => `<tr><td>${esc(m.articulo?.nombre)}</td><td class="r num">${num(m.por_bolsa, 3)} ${esc(m.articulo?.unidad)}</td><td><button class="btn btn-s btn-danger" data-a="tal-quitar-mat" data-art="${m.articulo_id}">Quitar</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Esta presentación aún no tiene materiales definidos.</p>'}
    ${mats.length ? `<div class="fila-form"><select id="m-art" aria-label="Material">${mats.filter(s => !lista.some(m => m.articulo_id === s.articulo_id)).map(s => op(s.articulo_id, `${s.nombre} (${s.unidad})`, '')).join('')}</select>
      <input id="m-cant" type="number" min="0" step="0.001" inputmode="decimal" placeholder="Por bolsa" aria-label="Cantidad por bolsa"><button class="btn btn-s btn-p" data-a="tal-agregar-mat">Agregar</button></div>`
      : '<p class="muted">Primero crea los materiales en Almacén &gt; Materiales.</p>'}</div>`;
}

/* ---------- Hojas ---------- */
R.hojas.envasado = () => {
  const g = S.g, d = S.datos.taller;
  const campos = selectorProducto(g, true), pr = presentacion(g.presentacion), bolsas = Math.max(0, Math.floor(Number(g.bolsas) || 0));
  const litros = pr ? bolsas * pr.unidades * pr.medida_ml / 1000 : 0;
  const granel = d.stock.find(s => s.almacen === 'granel_taller' && s.color_id === g.color)?.existencia || 0;
  const lotes = d.lotes.filter(l => l.color_id === g.color && l.estado === 'entregado').slice(0, 10);
  const bom = d.materiales.filter(m => m.presentacion_id === g.presentacion);
  return cab('Registrar envasado', 'Descuenta granel y materiales, y suma bolsas al producto envasado') + `<div class="hoja-body"><div class="campos">
    ${campos}
    ${campo('g-bolsas', 'Bolsas envasadas', `<input id="g-bolsas" data-g="bolsas" data-gr="1" type="number" min="1" step="1" inputmode="numeric" value="${esc(g.bolsas)}">`)}
    ${campo('g-lote', 'Lote de granel usado (opcional)', `<select id="g-lote" data-g="lote">${op('', 'Sin indicar', g.lote)}${lotes.map(l => op(l.id, `${codigo('L', l.numero)} · ${fechaCorta(l.fecha)}`, g.lote)).join('')}</select>`)}
    ${campo('g-notas', 'Notas (opcional)', `<input id="g-notas" data-g="notas" maxlength="200" value="${esc(g.notas)}">`, true)}
    </div>
    <dl class="dl"><dt>Granel a usar</dt><dd class="num">${num(litros, 3)} L ${granel < litros ? `<span class="txt-alerta">· en el Taller hay ${num(granel, 3)} L</span>` : `<span class="muted">· hay ${num(granel, 3)} L</span>`}</dd>
      <dt>Materiales</dt><dd>${bom.length ? bom.map(m => `${esc(m.articulo?.nombre)} ${num(m.por_bolsa * bolsas, 3)}`).join(', ') : '<span class="muted">Sin definir para esta presentación</span>'}</dd></dl>
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('tal-guardar-envasado', 'Registrar envasado')}</div>`;
};
R.hojas.orden = () => {
  const g = S.g;
  return cab('Nueva orden al Laboratorio', 'Producto a granel que necesita el Taller') + `<div class="hoja-body"><div class="campos">
    ${selectorProducto(g, false)}
    ${campo('g-litros', 'Litros', `<input id="g-litros" data-g="litros" type="number" min="0.1" step="0.1" inputmode="decimal" value="${esc(g.litros)}">`)}
    ${campo('g-fecha', 'Para cuándo (opcional)', `<input id="g-fecha" data-g="fecha" type="date" value="${esc(g.fecha)}">`)}
    ${campo('g-notas', 'Notas (opcional)', `<input id="g-notas" data-g="notas" maxlength="200" value="${esc(g.notas)}">`, true)}
    </div>${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('tal-guardar-orden', 'Enviar orden')}</div>`;
};

function productoDeColor(colorId){ return S.catalogo.find(p => p.colores.some(c => c.id === colorId))?.id; }

Object.assign(R.acciones, {
  'tal-envasar': d => abrirHoja({ tipo:'envasado' }, { producto:productoDeColor(d.color), color:d.color, presentacion:d.pres, bolsas:d.bolsas || '', lote:'', notas:'' }),
  'tal-guardar-envasado': () => {
    const g = S.g, bolsas = Number(g.bolsas);
    if (!Number.isInteger(bolsas) || bolsas <= 0) { S.error = 'Escribe un número entero de bolsas.'; return renderHoja(); }
    const n = nombreColor(g.color);
    guardar(() => D.registrarEnvasado({ color:g.color, presentacion:g.presentacion, bolsas, lote:g.lote, notas:g.notas }),
      { ok:`${bolsas} bolsas de ${n.producto} · ${n.color} envasadas` });
  },
  'tal-orden': d => abrirHoja({ tipo:'orden' }, { producto:productoDeColor(d.color), color:d.color, litros:d.litros || '', fecha:'', notas:'' }),
  'tal-guardar-orden': () => {
    const g = S.g, litros = Number(g.litros);
    if (!(litros > 0)) { S.error = 'Escribe cuántos litros necesitas.'; return renderHoja(); }
    guardar(() => D.crearOrden({ color_id:g.color, litros, fecha_requerida:g.fecha || null, notas:g.notas.trim() || null, solicitada_por:S.perfil.id }),
      { ok: r => `Orden ${codigo('O', r.numero)} enviada al Laboratorio` });
  },
  'tal-anular-orden': d => {
    if (S.datos.anularOrden !== d.id) { S.datos.anularOrden = d.id; return renderTodo(); }
    S.datos.anularOrden = null;
    guardar(() => D.cambiarOrden(d.id, 'anulada'), { ok:'Orden anulada', cerrar:false });
  },
  'tal-agregar-mat': () => {
    const art = document.querySelector('#m-art')?.value, cant = Number(document.querySelector('#m-cant')?.value);
    if (!art || !(cant > 0)) return toast('Elige un material y una cantidad mayor que cero.');
    guardar(() => D.guardarMaterialPorBolsa(S.datos.matSel.presentacion, art, cant), { ok:'Material agregado', cerrar:false });
  },
  'tal-quitar-mat': d => guardar(() => D.quitarMaterialPorBolsa(S.datos.matSel.presentacion, d.art), { ok:'Material quitado', cerrar:false })
});

// Módulo Almacén: existencias y movimientos de los cinco almacenes.
import * as D from '../datos.js';
import { S, R, esc, num, horaCorta, esRol, miRol, vacio, op, campo, renderHoja, abrirHoja, cab, errorHoja, botonEnviar, guardar } from '../nucleo.js';

const ALMACENES = {
  insumos:       { nombre:'Insumos', area:'Laboratorio', texto:'Pigmentos, espesantes, resinas y demás insumos para fabricar.' },
  granel_lab:    { nombre:'Granel Laboratorio', area:'Laboratorio', texto:'Producción aprobada que aún no se entrega al Taller. Se mueve sola con los lotes.' },
  granel_taller: { nombre:'Granel Taller', area:'Taller', texto:'Producto a granel recibido del Laboratorio, listo para envasar. Se mueve solo con lotes y envasados.' },
  materiales:    { nombre:'Materiales', area:'Taller', texto:'Frascos, tapas, etiquetas y bolsas.' },
  envasado:      { nombre:'Producto envasado', area:'Taller', texto:'Bolsas listas. Suben al envasar y bajan cuando un pedido queda listo.' }
};
const MOTIVOS = { compra:'Compra', ajuste:'Ajuste por conteo', salida:'Salida o merma', consumo_lote:'Consumo en lote', produccion:'Lote aprobado',
  entrega_taller:'Entregado al Taller', recepcion_lab:'Recibido del Laboratorio', envasado:'Envasado', consumo_envasado:'Consumo en envasado', pedido:'Pedido listo' };
const UNIDADES = ['kg','g','L','ml','und','millar','rollo','caja'];

// Igual que la función puede_mover() de la base de datos
const MUEVE = { socio:Object.keys(ALMACENES), administrativo:['insumos','materiales'], laboratorio:['insumos','granel_lab'],
  taller:['granel_taller','materiales','envasado'] };
const puedeMover = a => (MUEVE[miRol()] || []).includes(a);
const visibles = () => esRol('socio','administrativo') ? Object.keys(ALMACENES) : esRol('laboratorio') ? ['insumos','granel_lab'] : esRol('despacho') ? ['envasado'] : ['granel_taller','materiales','envasado'];

R.modulos.almacen = {
  nombre:'Almacén',
  ico:'<path d="M3 8l9-5 9 5v11H3z"/><path d="M8 19v-7h8v7"/>',
  tabs: () => visibles().map(a => [a, ALMACENES[a].nombre]),
  porTab: true,
  async cargar(tab){
    const [stock, movs] = await Promise.all([D.stock([tab]), D.movimientos(tab)]);
    S.datos.almacen = { tab, stock, movs };
  },
  vista(tab){
    const d = S.datos.almacen; if (!d || d.tab !== tab) return '<p class="cargando">Cargando almacén…</p>';
    const a = ALMACENES[tab], mueve = puedeMover(tab), compra = ['insumos','materiales'].includes(tab);
    const bajos = d.stock.filter(s => s.minimo != null && s.existencia < s.minimo);
    const estadoDe = s => s.existencia < 0 ? '<span class="pill st-anulado alerta">Negativo</span>'
      : s.minimo != null && s.existencia < s.minimo ? '<span class="pill st-en_taller">Bajo mínimo</span>'
      : s.existencia === 0 ? '<span class="pill st-anulado">Sin stock</span>' : '<span class="pill st-entregado">Disponible</span>';
    const lista = d.stock.filter(s => s.existencia !== 0 || s.minimo != null || compra);
    return `<div class="bloque">
      <p class="muted">${esc(a.area)} · ${esc(a.texto)}</p>
      ${bajos.length ? `<p class="resumen"><span class="txt-alerta">${bajos.length} artículo${bajos.length > 1 ? 's' : ''} bajo su mínimo: ${bajos.map(s => esc(s.nombre)).join(', ')}</span></p>` : ''}
      ${mueve ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        ${compra ? `<button class="btn btn-p" data-a="alm-mov" data-tipo="compra">Registrar compra</button><button class="btn" data-a="alm-articulo">Nuevo artículo</button>` : ''}
        ${lista.length ? `<button class="btn" data-a="alm-mov" data-tipo="salida">Registrar salida</button><button class="btn" data-a="alm-mov" data-tipo="ajuste">Ajustar por conteo</button>` : ''}</div>` : ''}
      ${!lista.length ? vacio('Sin existencias', compra ? 'Crea los artículos y registra la primera compra.' : 'Este almacén se llena con los movimientos de Producción y Taller.') : `
      <div class="tabla-w"><table><thead><tr><th>Artículo</th><th class="r">Existencia</th><th class="r">Mínimo</th><th>Estado</th>${mueve ? '<th></th>' : ''}</tr></thead><tbody>
        ${lista.map(s => `<tr><td>${esc(s.nombre)}</td><td class="r num ${s.existencia < 0 ? 'txt-alerta' : ''}">${num(s.existencia, 3)} ${esc(s.unidad)}</td>
          <td class="r num">${s.minimo != null ? num(s.minimo, 3) : '<span class="muted">—</span>'}</td><td>${estadoDe(s)}</td>
          ${mueve ? `<td><button class="btn btn-s" data-a="alm-minimo" data-id="${s.articulo_id}">Mínimo</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div>`}
      <p class="sub">Últimos movimientos</p>
      ${!d.movs.length ? '<p class="muted">Sin movimientos todavía.</p>' : `<div class="tabla-w"><table><thead><tr><th>Fecha</th><th>Artículo</th><th class="r">Cantidad</th><th>Motivo</th><th>Referencia</th><th>Por</th></tr></thead><tbody>
        ${d.movs.map(m => `<tr><td class="num">${esc(horaCorta(m.creado))}</td><td>${esc(m.articulo?.nombre)}</td><td class="r num ${m.cantidad < 0 ? 'txt-alerta' : ''}">${m.cantidad > 0 ? '+' : ''}${num(m.cantidad, 3)} ${esc(m.articulo?.unidad)}</td>
          <td>${esc(MOTIVOS[m.motivo] || m.motivo)}</td><td>${esc(m.referencia || '')}</td><td>${esc(m.persona?.nombre || '')}</td></tr>`).join('')}
      </tbody></table></div>`}</div>`;
  }
};

/* ---------- Hojas ---------- */
const TITULOS = { compra:'Registrar compra', salida:'Registrar salida o merma', ajuste:'Ajustar por conteo' };
R.hojas.movimiento = () => {
  const g = S.g, d = S.datos.almacen, art = d.stock.find(s => s.articulo_id === g.articulo);
  const dif = g.tipo === 'ajuste' && art && g.cantidad !== '' ? Number(g.cantidad) - art.existencia : null;
  return cab(TITULOS[g.tipo], esc(ALMACENES[d.tab].nombre)) + `<div class="hoja-body"><div class="campos">
    ${campo('g-art', 'Artículo', `<select id="g-art" data-g="articulo" data-gr="1">${d.stock.map(s => op(s.articulo_id, `${s.nombre} (hay ${num(s.existencia, 3)} ${s.unidad})`, g.articulo)).join('')}</select>`, true)}
    ${campo('g-cant', g.tipo === 'ajuste' ? `Cantidad contada (${esc(art?.unidad || '')})` : `Cantidad (${esc(art?.unidad || '')})`,
      `<input id="g-cant" data-g="cantidad" ${g.tipo === 'ajuste' ? 'data-gr="1"' : ''} type="number" min="0" step="0.001" inputmode="decimal" value="${esc(g.cantidad)}">`)}
    ${campo('g-ref', g.tipo === 'compra' ? 'Proveedor o comprobante' : 'Motivo', `<input id="g-ref" data-g="referencia" maxlength="120" value="${esc(g.referencia)}">`)}
    </div>
    ${dif != null ? `<p class="${dif ? '' : 'muted'}">${dif ? `Se registrará una diferencia de <strong class="num">${dif > 0 ? '+' : ''}${num(dif, 3)} ${esc(art.unidad)}</strong>.` : 'El conteo coincide con el sistema; no hay nada que ajustar.'}</p>` : ''}
    <p class="muted">Los movimientos no se borran. Si te equivocas, corrige con un ajuste por conteo.</p>
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('alm-guardar-mov', 'Guardar')}</div>`;
};
R.hojas.articulo = () => {
  const g = S.g, d = S.datos.almacen;
  return cab('Nuevo artículo', esc(ALMACENES[d.tab].nombre)) + `<div class="hoja-body"><div class="campos">
    ${campo('g-nombre', 'Nombre', `<input id="g-nombre" data-g="nombre" maxlength="80" value="${esc(g.nombre)}" placeholder="${d.tab === 'insumos' ? 'Ej.: Pigmento rojo óxido' : 'Ej.: Frasco 30 ml'}">`, true)}
    ${campo('g-unidad', 'Unidad', `<select id="g-unidad" data-g="unidad">${UNIDADES.map(u => op(u, u, g.unidad)).join('')}</select>`)}
    ${campo('g-min', 'Mínimo (opcional)', `<input id="g-min" data-g="minimo" type="number" min="0" step="0.001" inputmode="decimal" value="${esc(g.minimo)}">`)}
    </div>${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('alm-guardar-articulo', 'Crear artículo')}</div>`;
};
R.hojas.minimo = () => {
  const g = S.g, s = S.datos.almacen.stock.find(x => x.articulo_id === g.articulo);
  return cab('Stock mínimo', esc(s?.nombre)) + `<div class="hoja-body">
    ${campo('g-min', `Mínimo (${esc(s?.unidad)})`, `<input id="g-min" data-g="minimo" type="number" min="0" step="0.001" inputmode="decimal" value="${esc(g.minimo)}">`)}
    <p class="muted">Cuando la existencia baje de este número, el artículo aparecerá como "Bajo mínimo".</p>
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('alm-guardar-minimo', 'Guardar mínimo')}</div>`;
};

Object.assign(R.acciones, {
  'alm-mov': d => { const s = S.datos.almacen.stock[0]; abrirHoja({ tipo:'movimiento' }, { tipo:d.tipo, articulo:s?.articulo_id, cantidad:'', referencia:'' }); },
  'alm-guardar-mov': () => {
    const g = S.g, d = S.datos.almacen, art = d.stock.find(s => s.articulo_id === g.articulo), n = Number(g.cantidad);
    if (!art) { S.error = 'Elige un artículo.'; return renderHoja(); }
    if (g.cantidad === '' || !(n >= 0) || (g.tipo !== 'ajuste' && n === 0)) { S.error = 'Escribe una cantidad válida.'; return renderHoja(); }
    const cantidad = g.tipo === 'compra' ? n : g.tipo === 'salida' ? -n : Math.round((n - art.existencia) * 1000) / 1000;
    if (cantidad === 0) { S.error = 'El conteo coincide con el sistema; no hay nada que ajustar.'; return renderHoja(); }
    guardar(() => D.registrarMovimiento({ almacen:d.tab, articulo_id:art.articulo_id, cantidad, motivo:g.tipo, referencia:g.referencia.trim() || null }),
      { ok:'Movimiento registrado' });
  },
  'alm-articulo': () => abrirHoja({ tipo:'articulo' }, { nombre:'', unidad: S.datos.almacen.tab === 'insumos' ? 'kg' : 'und', minimo:'' }),
  'alm-guardar-articulo': () => {
    const g = S.g, d = S.datos.almacen;
    if (!g.nombre.trim()) { S.error = 'Escribe el nombre del artículo.'; return renderHoja(); }
    guardar(async () => {
      const a = await D.crearArticulo({ tipo: d.tab === 'insumos' ? 'insumo' : 'material', nombre:g.nombre.trim(), unidad:g.unidad });
      if (String(g.minimo).trim() !== '') await D.fijarMinimo(d.tab, a.id, Number(g.minimo));
    }, { ok:'Artículo creado' });
  },
  'alm-minimo': d => { const s = S.datos.almacen.stock.find(x => x.articulo_id === d.id); abrirHoja({ tipo:'minimo' }, { articulo:d.id, minimo: s?.minimo ?? '' }); },
  'alm-guardar-minimo': () => {
    const n = Number(S.g.minimo);
    if (String(S.g.minimo).trim() === '' || !(n >= 0)) { S.error = 'Escribe un número mayor o igual a cero.'; return renderHoja(); }
    guardar(() => D.fijarMinimo(S.datos.almacen.tab, S.g.articulo, n), { ok:'Mínimo guardado' });
  }
});

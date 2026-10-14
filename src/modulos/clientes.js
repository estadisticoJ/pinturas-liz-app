// Módulo Clientes y precios: ficha de cada cliente y sus precios por docena con vigencia e historial.
// Desde 0.4.1 no hay precios de lista: si el cliente no tiene precio, se escribe a mano (primer pedido o "Agregar precio").
import * as D from '../datos.js';
import { S, R, esc, soles, hoyISO, fechaCorta, esRol, vacio, op, campo, toast, renderTodo, renderHoja, renderMain,
  abrirHoja, cab, errorHoja, botonEnviar, guardar, busqueda, sinAcentos, cargarModulo } from '../nucleo.js';
import { elegirCliente, refDe, habitualDe } from './pedidos.js';
import { abrirAviso } from './alertas.js';

const editaDatos = () => esRol('socio','administrativo');
const editaPrecios = () => esRol('socio','administrativo');            // cambiar un precio que ya existe
const agregaPrecios = () => esRol('socio','administrativo','vendedor');  // primer precio de un cliente para una medida
const nombreProducto = id => S.catalogo.find(p => p.id === id)?.nombre || '—';
const medidasDe = productoId => [...new Set((S.catalogo.find(p => p.id === productoId)?.presentaciones || []).map(x => x.medida_ml))].sort((a, b) => a - b);
const vendedorNombre = cod => (S.vendedores || []).find(v => v.codigo === cod)?.nombre || cod || '—';

R.modulos.clientes = {
  nombre:'Clientes',
  ico:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M15 11h6M18 8v6"/>',
  tabs: () => [['clientes', 'Clientes · ' + S.clientes.length]],
  barra: () => ({ linea:false, placeholder:'Buscar por nombre, código o zona' }),
  async cargar(){
    if (!S.datos.clientes) S.datos.clientes = { vendedor: S.miVendedor || 'todos' };
    const [clientes, vendedores] = await Promise.all([D.clientes(), D.vendedores()]);
    S.clientes = clientes; S.vendedores = vendedores;
  },
  vista(){ return vistaClientes(); }
};

function vistaClientes(){
  const d = S.datos.clientes || { vendedor:'todos' }, q = sinAcentos(busqueda().trim());
  const conteo = new Map(); S.clientes.forEach(c => conteo.set(c.vendedor_codigo || '', (conteo.get(c.vendedor_codigo || '') || 0) + 1));
  const lista = S.clientes.filter(c => (d.vendedor === 'todos' || (c.vendedor_codigo || '') === d.vendedor) &&
    (!q || sinAcentos([c.nombre, c.codigo, c.zona, c.lugar, c.telefono].join(' ')).includes(q)));
  const chips = [['todos', 'Todos', S.clientes.length], ...(S.vendedores || []).map(v => [v.codigo, v.nombre, conteo.get(v.codigo) || 0])];
  return `<div class="bloque">
    <div class="tabs" aria-label="Filtrar por vendedor">${chips.map(([id, n, k]) => `<button data-a="cli-vend" data-id="${esc(id)}" aria-selected="${id === d.vendedor}">${esc(n)} · ${k}</button>`).join('')}</div>
    ${!lista.length ? vacio('Ningún cliente coincide', 'Cambia la búsqueda o el vendedor.') : `
    <div class="tabla-w"><table><thead><tr><th>Código</th><th>Cliente</th><th>Zona</th><th>Vendedor</th><th>Teléfono</th><th>Pago habitual</th></tr></thead><tbody>
      ${lista.slice(0, 200).map(c => `<tr><td class="num">${esc(c.codigo || '')}</td><td><button class="link" data-a="cli-ver" data-id="${c.id}">${esc(c.nombre)}</button></td>
        <td>${esc([c.zona, c.lugar].filter(Boolean).join(' · '))}</td><td>${esc(vendedorNombre(c.vendedor_codigo))}</td><td>${esc(c.telefono || '')}</td>
        <td>${c.condicion_habitual === 'credito' ? `Crédito ${c.dias_credito_habitual || ''} d` : 'Contado'}</td></tr>`).join('')}
    </tbody></table></div>${lista.length > 200 ? `<p class="muted">Se muestran 200 de ${lista.length}. Escribe para filtrar.</p>` : ''}`}</div>`;
}

/* ---------- Ficha del cliente ---------- */
R.hojas.cliente = () => {
  const c = S.clientes.find(x => x.id === S.hoja.id); if (!c) return cab('Cliente') + '<div class="hoja-body"><p class="muted">No se encontró el cliente.</p></div>';
  const g = S.g, ed = editaDatos(), info = S.hoja.precios, hist = S.hoja.historial;
  const ro = ed ? '' : 'disabled';
  const datos = `<div class="campos">
    ${campo('c-nombre', 'Nombre', `<input id="c-nombre" data-g="nombre" maxlength="80" value="${esc(g.nombre)}" ${ro}>`, true)}
    ${campo('c-vend', 'Vendedor', `<select id="c-vend" data-g="vendedor_codigo" ${ro}>${op('', 'Sin vendedor', g.vendedor_codigo)}${(S.vendedores || []).map(v => op(v.codigo, v.nombre, g.vendedor_codigo)).join('')}</select>`)}
    ${campo('c-lugar', 'Lugar', `<select id="c-lugar" data-g="lugar" ${ro}>${['', 'Lima', 'Provincia', 'Oficina'].map(v => op(v, v || '—', g.lugar)).join('')}</select>`)}
    ${campo('c-zona', 'Zona o local', `<input id="c-zona" data-g="zona" maxlength="60" value="${esc(g.zona)}" placeholder="Centro de Lima, Dorado, Arequipa…" ${ro}>`)}
    ${campo('c-tel', 'Teléfono / WhatsApp', `<input id="c-tel" data-g="telefono" inputmode="tel" maxlength="20" value="${esc(g.telefono)}" ${ro}>`)}
    ${campo('c-doc-t', 'Documento', `<select id="c-doc-t" data-g="documento_tipo" ${ro}>${op('', '—', g.documento_tipo)}${['DNI','RUC','CE'].map(v => op(v, v, g.documento_tipo)).join('')}</select>`)}
    ${campo('c-doc', 'Número de documento', `<input id="c-doc" data-g="documento" inputmode="numeric" maxlength="15" value="${esc(g.documento)}" ${ro}>`)}
    ${campo('c-correo', 'Correo', `<input id="c-correo" data-g="correo" type="email" maxlength="80" value="${esc(g.correo)}" ${ro}>`)}
    ${campo('c-dir', 'Dirección de entrega', `<input id="c-dir" data-g="direccion" maxlength="150" value="${esc(g.direccion)}" ${ro}>`, true)}
    ${campo('c-agencia', 'Agencia de envíos habitual', `<input id="c-agencia" data-g="agencia_habitual" maxlength="80" value="${esc(g.agencia_habitual)}" placeholder="Solo para provincia" ${ro}>`)}
    ${campo('c-cond', 'Pago habitual', `<select id="c-cond" data-g="condicion_habitual" ${ro}>${op('contado', 'Contado', g.condicion_habitual)}${op('credito', 'Crédito', g.condicion_habitual)}</select>`)}
    ${campo('c-dias', 'Días de crédito habituales', `<input id="c-dias" data-g="dias_credito_habitual" type="number" min="1" step="1" value="${esc(g.dias_credito_habitual)}" ${ro}>`)}
    ${campo('c-notas', 'Notas', `<textarea id="c-notas" data-g="notas" rows="2" maxlength="300" ${ro}>${esc(g.notas)}</textarea>`, true)}
  </div>`;
  const filas = (info || []).map(p => ({ ...p, producto: nombreProducto(p.producto_id) }))
    .sort((a, b) => a.producto.localeCompare(b.producto) || a.medida_ml - b.medida_ml);
  const tabla = !info ? '<p class="muted">Cargando precios…</p>' : `
    ${filas.length ? `<div class="tabla-w"><table class="compacta"><thead><tr><th>Producto y medida</th><th class="r">Docena</th>${editaPrecios() ? '<th></th>' : ''}</tr></thead><tbody>
      ${filas.map(p => `<tr>
        <td>${esc(p.producto)} · ${p.medida_ml} ml<br><span class="muted">desde ${esc(fechaCorta(p.vigente_desde))}${p.nota && /mano/i.test(p.nota) ? ' · escrito a mano' : ''}</span></td>
        <td class="r num"><strong>${soles(p.precio_docena)}</strong></td>
        ${editaPrecios() ? `<td class="r"><button class="btn btn-s" data-a="precio-cambiar" data-cliente="${c.id}" data-producto="${p.producto_id}" data-ml="${p.medida_ml}">Cambiar</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Este cliente aún no tiene precios. Se escriben a mano en su primer pedido o con "Agregar precio".</p>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${agregaPrecios() ? `<button class="btn btn-s" data-a="precio-cambiar" data-cliente="${c.id}" data-nuevo="1">Agregar precio</button>` : ''}
      <button class="btn btn-s" data-a="cli-avisar" data-id="${c.id}">Avisar un error a los socios</button></div>`;
  const futuros = (hist || []).filter(h => h.vigente_desde > hoyISO());
  const cerrados = (hist || []).filter(h => h.vigente_hasta);
  return cab(esc(c.nombre), esc([c.codigo, vendedorNombre(c.vendedor_codigo)].filter(Boolean).join(' · '))) + `<div class="hoja-body">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${esRol('socio','administrativo','vendedor') ? `<button class="btn btn-p btn-s" data-a="cli-pedido" data-id="${c.id}">Nuevo pedido para este cliente</button>` : ''}</div>
    <p class="sub">Precios por docena</p>${tabla}
    ${futuros.length ? `<p class="sub">Precios programados</p><ul class="hist">${futuros.map(h => `<li><span>${esc(nombreProducto(h.producto_id))} ${h.medida_ml} ml</span><strong class="num">${soles(h.precio_docena)}</strong><span class="muted">desde ${esc(fechaCorta(h.vigente_desde))}</span></li>`).join('')}</ul>` : ''}
    ${cerrados.length ? `<details><summary class="sub">Historial de precios (${cerrados.length})</summary><ul class="hist">${cerrados.map(h => `<li><span>${esc(nombreProducto(h.producto_id))} ${h.medida_ml} ml</span><strong class="num">${soles(h.precio_docena)}</strong><span class="muted">${esc(fechaCorta(h.vigente_desde))} al ${esc(fechaCorta(h.vigente_hasta))}${h.persona ? ' · ' + esc(h.persona.nombre) : ''}${h.nota ? ' · ' + esc(h.nota) : ''}</span></li>`).join('')}</ul></details>` : ''}
    <p class="sub">Datos del cliente</p>${datos}${errorHoja()}</div>
    ${ed ? `<div class="hoja-pie"><span></span>${botonEnviar('cli-guardar', 'Guardar datos')}</div>` : ''}`;
};

/* ---------- Registrar o cambiar un precio (siempre de un cliente) ---------- */
R.hojas.precio = () => {
  const g = S.g, c = S.clientes.find(x => x.id === g.cliente), socio = esRol('socio');
  const medidas = medidasDe(g.producto), hab = habitualDe(g.producto);
  // Al cambiar de producto se propone su medida habitual
  if (g.prodPrevio !== g.producto) { g.prodPrevio = g.producto; if (hab && medidas.includes(hab)) g.ml = hab; }
  if (g.ml !== 'otra' && !medidas.includes(Number(g.ml))) g.ml = medidas[0] ?? (socio ? 'otra' : '');
  const ref = g.ml !== 'otra' ? refDe(g.producto, Number(g.ml)) : null, refHab = hab ? refDe(g.producto, hab) : null;
  const actual = g.ml !== 'otra' && g.vigentes?.find(p => p.producto_id === g.producto && p.medida_ml === Number(g.ml));
  const bloqueado = actual && !editaPrecios();
  return cab('Precio para ' + esc(c?.nombre || 'cliente'), 'Precio por docena') + `<div class="hoja-body"><div class="campos">
    ${campo('p-prod', 'Producto', `<select id="p-prod" data-g="producto" data-gr="1">${S.catalogo.map(p => op(p.id, p.nombre + (p.presentaciones.length ? '' : ' (sin medidas)'), g.producto)).join('')}</select>`)}
    ${campo('p-ml', 'Medida', `<select id="p-ml" data-g="ml" data-gr="1">${medidas.map(m => op(m, m + ' ml' + (m === hab ? ' (habitual)' : ''), g.ml)).join('')}${socio ? op('otra', 'Otra medida…', g.ml) : ''}${!medidas.length && !socio ? '<option value="">Sin medidas</option>' : ''}</select>`)}
    ${g.ml === 'otra' ? campo('p-ml-nueva', 'Medida nueva (ml)', `<input id="p-ml-nueva" data-g="mlNueva" type="number" min="1" step="1" inputmode="numeric" value="${esc(g.mlNueva)}" placeholder="250">`) : ''}
    ${campo('p-precio', actual ? 'Precio nuevo por docena (S/)' : 'Precio por docena (S/)', `<input id="p-precio" data-g="precio" type="number" min="0.5" step="0.5" inputmode="decimal" value="${esc(g.precio)}" ${bloqueado ? 'disabled' : ''}>`)}
    ${!bloqueado && (ref || refHab) ? `<div class="campo full"><span class="muted">${ref ? `Precio sugerido ${soles(ref.comun)}: es el que más clientes pagan (${ref.clientes} con precio; van de ${soles(ref.minimo)} a ${soles(ref.maximo)}).` : 'Esta medida aún no tiene precio sugerido.'}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        ${ref ? `<button class="btn btn-s btn-sug" data-a="precio-ref" data-v="${ref.comun}">Usar sugerido ${soles(ref.comun)}</button>` : ''}
        ${refHab && Number(g.ml) !== hab ? `<button class="btn btn-s btn-sug" data-a="precio-ref" data-ml="${hab}" data-v="${refHab.comun}">Medida habitual ${hab} ml · sugerido ${soles(refHab.comun)}</button>` : ''}
      </div></div>` : ''}
    ${campo('p-desde', 'Rige desde', `<input id="p-desde" data-g="desde" type="date" min="${hoyISO()}" value="${esc(g.desde)}" ${bloqueado ? 'disabled' : ''}>`)}
    ${campo('p-nota', 'Motivo (opcional)', `<input id="p-nota" data-g="nota" maxlength="120" value="${esc(g.nota)}" placeholder="Acuerdo con el cliente, alza de insumos…" ${bloqueado ? 'disabled' : ''}>`, true)}
    </div>
    <p class="muted">${g.ml === 'otra' ? 'Solo un socio agrega medidas. La medida nueva queda disponible en el catálogo para todos los clientes; cada cliente tendrá su propio precio.'
      : actual ? `Hoy paga ${soles(actual.precio_docena)} la docena (desde ${fechaCorta(actual.vigente_desde)}). ${bloqueado ? 'Solo socios y Administración cambian un precio que ya existe. Si está mal, avisa a los socios.' : 'El precio anterior queda en el historial hasta el día antes de la fecha elegida. Los pedidos ya registrados no cambian.'}`
      : `Este cliente aún no tiene precio para esta medida.${socio ? '' : ' Los socios recibirán un aviso para revisarlo.'}`}</p>
    ${errorHoja()}</div>
    <div class="hoja-pie">${actual && editaPrecios() ? `<button class="btn btn-danger" data-a="precio-quitar" data-id="${actual.precio_id}" ${S.enviando ? 'disabled' : ''}>${g.confirmaQuitar ? 'Confirmar: quitar precio' : 'Quitar precio'}</button>` : '<span></span>'}${bloqueado ? '' : botonEnviar('precio-guardar', 'Guardar precio')}</div>`;
};

export async function abrirCliente(id){
  const c = S.clientes.find(x => x.id === id); if (!c) return;
  const g = {}; ['nombre','vendedor_codigo','lugar','zona','telefono','documento_tipo','documento','correo','direccion','agencia_habitual','condicion_habitual','dias_credito_habitual','notas']
    .forEach(k => { g[k] = c[k] ?? ''; });
  abrirHoja({ tipo:'cliente', id }, g);
  try {
    const [precios, historial] = await Promise.all([D.preciosVigentes(id), D.historialPrecios(id)]);
    if (S.hoja?.tipo === 'cliente' && S.hoja.id === id) { S.hoja.precios = precios; S.hoja.historial = historial; renderHoja(); }
  } catch (e) { toast(e.message); }
}
async function recargarCliente(id){
  const [precios, historial] = await Promise.all([D.preciosVigentes(id), D.historialPrecios(id)]);
  return { precios, historial };
}

Object.assign(R.acciones, {
  'cli-vend': d => { S.datos.clientes.vendedor = d.id; renderMain(); },
  'cli-ver': d => abrirCliente(d.id),
  'cli-avisar': d => { const c = S.clientes.find(x => x.id === d.id); abrirAviso({ cliente:d.id, titulo: c ? 'Dato errado de ' + c.nombre : '' }); },
  'cli-pedido': async d => { await elegirCliente(d.id); S.modulo = 'pedidos'; S.tab.pedidos = 'catalogo'; S.hoja = null; renderTodo(); },
  'cli-guardar': () => {
    const g = S.g, id = S.hoja.id;
    if (!g.nombre.trim()) { S.error = 'El nombre no puede quedar vacío.'; return renderHoja(); }
    const dias = String(g.dias_credito_habitual).trim();
    if (dias && !(Number(dias) > 0)) { S.error = 'Los días de crédito deben ser un número mayor que cero.'; return renderHoja(); }
    const campos = { nombre:g.nombre.trim() };
    ['vendedor_codigo','lugar','zona','telefono','documento_tipo','documento','correo','direccion','agencia_habitual','notas'].forEach(k => { campos[k] = String(g[k] || '').trim() || null; });
    campos.condicion_habitual = g.condicion_habitual || 'contado'; campos.dias_credito_habitual = dias ? Number(dias) : null;
    guardar(async () => { const c = await D.guardarCliente(id, campos); Object.assign(S.clientes.find(x => x.id === id), c); }, { ok:'Datos del cliente guardados', cerrar:false, recargar:false });
  },
  'precio-cambiar': async d => {
    const cliente = d.cliente || (S.hoja?.tipo === 'cliente' ? S.hoja.id : null); if (!cliente) return;
    const volver = S.hoja?.tipo === 'cliente' ? cliente : null;
    let vigentes = S.hoja?.tipo === 'cliente' ? S.hoja.precios : null;
    if (!vigentes) { try { vigentes = await D.preciosVigentes(cliente); } catch (e) { return toast(e.message); } }
    // "Agregar precio": propone el primer producto y medida que el cliente aún no tiene
    let producto = d.producto, ml = d.ml ? Number(d.ml) : null;
    const libre = (pid, m) => m && !vigentes.some(v => v.producto_id === pid && v.medida_ml === m);
    if (!producto && d.nuevo) {
      for (const p of S.catalogo) { const h = habitualDe(p.id), m = libre(p.id, h) ? h : medidasDe(p.id).find(x => libre(p.id, x)); if (m) { producto = p.id; ml = m; break; } }
    }
    producto = producto || S.catalogo[0]?.id; if (ml == null) ml = habitualDe(producto) ?? medidasDe(producto)[0];
    const actual = vigentes.find(p => p.producto_id === producto && p.medida_ml === ml);
    abrirHoja({ tipo:'precio', volver }, { cliente, producto, prodPrevio: producto, ml, mlNueva:'', precio: actual ? String(actual.precio_docena) : '', desde: hoyISO(), nota:'', vigentes });
  },
  'precio-ref': d => { if (d.ml) S.g.ml = d.ml; S.g.precio = String(d.v); S.error = ''; renderHoja(); },
  'precio-guardar': () => {
    const g = S.g, precio = Number(g.precio), nueva = g.ml === 'otra', ml = nueva ? Number(g.mlNueva) : Number(g.ml);
    if (!(ml > 0) || !Number.isInteger(ml)) { S.error = nueva ? 'Escribe la medida nueva en ml (número entero).' : 'Este producto no tiene medidas registradas.'; return renderHoja(); }
    if (g.precio === '' || !(precio > 0)) { S.error = 'Escribe un precio mayor que cero.'; return renderHoja(); }
    if (!g.desde || g.desde < hoyISO()) { S.error = 'La fecha debe ser hoy o posterior.'; return renderHoja(); }
    if (nueva && medidasDe(g.producto).includes(ml)) { S.error = 'Esa medida ya existe; elígela en la lista.'; return renderHoja(); }
    volverTrasPrecio(async () => {
      if (nueva) { await D.crearPresentacion(g.producto, ml); S.catalogo = await D.catalogo(); }
      await D.fijarPrecio({ cliente:g.cliente, producto:g.producto, medida:ml, precio, desde:g.desde, nota:g.nota.trim() });
    }, nueva ? `Medida de ${ml} ml agregada con su precio` : g.desde > hoyISO() ? `Precio programado desde el ${fechaCorta(g.desde)}` : 'Precio guardado');
  },
  'precio-quitar': d => {
    if (!S.g.confirmaQuitar) { S.g.confirmaQuitar = true; return renderHoja(); }
    volverTrasPrecio(() => D.quitarPrecio(d.id), 'Precio quitado; desde mañana se escribe a mano en el pedido');
  }
});

// Guarda el precio y vuelve a la ficha del cliente (o a la vista abierta), con los precios ya actualizados
async function volverTrasPrecio(fn, mensaje){
  if (S.enviando) return;
  S.enviando = true; S.error = ''; renderHoja();
  const volver = S.hoja.volver, clienteElegido = S.g.cliente && S.g.cliente === S.form.cliente;
  try {
    await fn();
    if (volver) {
      const datos = await recargarCliente(volver);
      S.enviando = false; abrirCliente(volver); Object.assign(S.hoja, datos); renderHoja();
    } else { S.enviando = false; S.hoja = null; await cargarModulo(); renderTodo(); }
    if (clienteElegido) await elegirCliente(S.form.cliente, { silencio:true });
    toast(mensaje);
  } catch (e) { S.enviando = false; S.error = e.message; renderHoja(); }
}

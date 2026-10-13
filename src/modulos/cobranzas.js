// Módulo Cobranzas: saldos por cobrar, cobros con recibo numerado, cuadre y crédito por cliente.
import * as D from '../datos.js';
import { S, R, esc, soles, hoyISO, fechaCorta, diasDesde, esRol, vacio, op, campo, toast, renderTodo, renderHoja,
  abrirHoja, cab, errorHoja, botonEnviar, guardar } from '../nucleo.js';
import { etiquetaCobro } from './pedidos.js';

const MEDIOS = [['efectivo','Efectivo'],['transferencia','Transferencia'],['yape','Yape'],['plin','Plin'],['deposito','Depósito']];
const nombreMedio = m => (MEDIOS.find(x => x[0] === m) || [m, m])[1];
const recibo = n => 'R-' + String(n).padStart(5, '0');
const pedidoCod = n => 'P-' + String(n).padStart(5, '0');

R.modulos.cobranzas = {
  nombre:'Cobranzas',
  ico:'<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h3.7a1.8 1.8 0 010 3.6h-2.4a1.8 1.8 0 000 3.6h3.7" transform="translate(0 -1.4)"/>',
  tabs(){
    const t = [['porcobrar','Por cobrar'], ['cobros','Cobros']];
    if (esRol('socio','administrativo')) t.push(['clientes','Clientes']);
    return t;
  },
  async cargar(){
    const [saldos, cobros, clientes] = await Promise.all([D.saldos(), D.cobros(), esRol('socio','administrativo') ? D.clientes() : Promise.resolve(S.clientes)]);
    S.datos.cobranzas = { saldos, cobros, filtro: S.datos.cobranzas?.filtro || 'por_entregar' };
    S.clientes = clientes;
  },
  vista(tab){
    const d = S.datos.cobranzas; if (!d) return '<p class="cargando">Cargando cobranzas…</p>';
    return tab === 'cobros' ? vistaCobros(d) : tab === 'clientes' ? vistaClientes(d) : vistaPorCobrar(d);
  }
};

function vistaPorCobrar(d){
  const hoy = hoyISO();
  const lista = d.saldos.filter(s => s.saldo > 0.005 && ['despachado','entregado'].includes(s.estado));
  if (!lista.length) return vacio('No hay saldos pendientes', 'Aquí aparecen los pedidos despachados o entregados que aún tienen saldo por cobrar.');
  const total = lista.reduce((t, s) => t + s.saldo, 0), vencidos = lista.filter(s => s.vence < hoy);
  return `<div class="bloque"><p class="resumen num"><span>${lista.length} pedidos con saldo</span><span>Por cobrar ${soles(total)}</span>${vencidos.length ? `<span class="txt-alerta">Vencido ${soles(vencidos.reduce((t, s) => t + s.saldo, 0))}</span>` : ''}</p>
    <div class="lista">${lista.map(s => {
      const atraso = s.vence < hoy ? diasDesde(s.vence) : 0;
      return `<article class="fila"><div><button class="link num" data-a="ver-pedido" data-id="${s.pedido_id}">${pedidoCod(s.numero)}</button> <span class="cli">· ${esc(s.cliente)}</span></div>
        ${atraso ? `<span class="pill st-anulado alerta">Vencido hace ${atraso} d</span>` : `<span class="pill st-recibido">Vence ${esc(fechaCorta(s.vence))}</span>`}
        <div class="meta"><span>Total ${soles(s.total)}</span><span>Cobrado ${soles(s.cobrado)}</span><span>${s.condicion === 'credito' ? 'Crédito' : 'Contado'}</span><span>${esc(s.vendedor || '')}</span></div>
        <div class="pie"><strong class="num">Saldo ${soles(s.saldo)}</strong><button class="btn btn-s" data-a="cobrar" data-id="${s.pedido_id}">Registrar cobro</button></div></article>`;
    }).join('')}</div></div>`;
}

function vistaCobros(d){
  const admin = esRol('socio','administrativo');
  const lista = d.cobros.filter(c => d.filtro === 'todos' || c.estado === d.filtro);
  const porEntregar = d.cobros.filter(c => c.estado === 'por_entregar');
  const porPersona = new Map(); porEntregar.forEach(c => { const n = c.cobrador?.nombre || '—'; porPersona.set(n, (porPersona.get(n) || 0) + c.monto); });
  const chips = [['por_entregar','Por entregar'],['recibido','Recibidos'],['anulado','Anulados'],['todos','Todos']];
  return `<div class="bloque">
    ${porEntregar.length ? `<div class="aviso-caja"><p class="sub">${admin ? 'Cuadre: dinero que aún no llega a Administración' : 'Dinero que debes entregar a Administración'}</p>
      <p class="resumen num">${[...porPersona].map(([n, m]) => `<span>${esc(n)}: ${soles(m)}</span>`).join('')}</p></div>` : ''}
    <div class="tabs" aria-label="Filtrar cobros">${chips.map(([id, n]) => `<button data-a="cob-filtro" data-id="${id}" aria-selected="${id === d.filtro}">${n}</button>`).join('')}</div>
    ${!lista.length ? vacio('No hay cobros en esta vista', 'Los cobros se registran desde Por cobrar o desde el detalle de un pedido.') : `<div class="lista">${lista.map(c => `
      <article class="fila"><div><strong class="num">${recibo(c.recibo)}</strong> <span class="cli">· ${esc(c.pedido?.cliente?.nombre || '')}</span></div>${etiquetaCobro(c.estado)}
        <div class="meta"><span class="num">${c.pedido ? pedidoCod(c.pedido.numero) : ''}</span><span>${esc(nombreMedio(c.medio))}</span><span>${esc(fechaCorta(c.fecha))}</span><span>Cobró ${esc(c.cobrador?.nombre || '')}</span>${c.receptor ? `<span>Recibió ${esc(c.receptor.nombre)}</span>` : ''}</div>
        <div class="pie"><strong class="num">${soles(c.monto)}</strong>${admin && c.estado === 'por_entregar' ? `<span style="display:flex;gap:8px"><button class="btn btn-s btn-danger" data-a="cob-anular" data-id="${c.id}">${S.datos.cobAnular === c.id ? 'Confirmar anulación' : 'Anular'}</button><button class="btn btn-s btn-p" data-a="cob-recibir" data-id="${c.id}">Confirmar recibido</button></span>` : ''}</div></article>`).join('')}</div>`}
  </div>`;
}

function vistaClientes(d){
  const deuda = new Map(), vencida = new Map(), hoy = hoyISO();
  d.saldos.filter(s => s.saldo > 0.005).forEach(s => {
    deuda.set(s.cliente_id, (deuda.get(s.cliente_id) || 0) + s.saldo);
    if (s.vence < hoy && ['despachado','entregado'].includes(s.estado)) vencida.set(s.cliente_id, (vencida.get(s.cliente_id) || 0) + s.saldo);
  });
  const lista = [...S.clientes].sort((a, b) => (deuda.get(b.id) || 0) - (deuda.get(a.id) || 0) || a.nombre.localeCompare(b.nombre));
  if (!lista.length) return vacio('Aún no hay clientes', 'Los clientes se crean al registrar un pedido.');
  const socio = esRol('socio');
  return `<div class="bloque"><p class="muted">La deuda incluye pedidos aún no entregados. ${socio ? 'Como socio puedes fijar el límite de crédito de cada cliente.' : 'Solo un socio puede cambiar el límite de crédito.'}</p>
    <div class="tabla-w"><table><thead><tr><th>Cliente</th><th class="r">Deuda</th><th class="r">Vencido</th><th class="r">Límite</th><th></th></tr></thead><tbody>
    ${lista.map(c => { const deb = deuda.get(c.id) || 0, ven = vencida.get(c.id) || 0, excede = c.limite_credito != null && deb > c.limite_credito;
      return `<tr><td>${esc(c.nombre)}${c.zona ? `<br><span class="muted">${esc(c.zona)}</span>` : ''}</td><td class="r num ${excede ? 'txt-alerta' : ''}">${soles(deb)}</td><td class="r num ${ven ? 'txt-alerta' : ''}">${soles(ven)}</td>
        <td class="r num">${c.limite_credito != null ? soles(c.limite_credito) : '<span class="muted">Sin límite</span>'}</td>
        <td>${socio ? `<button class="btn btn-s" data-a="cob-limite" data-id="${c.id}">Límite</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}

/* ---------- Hojas ---------- */
R.hojas.cobro = () => {
  const g = S.g;
  return cab('Registrar cobro', `${esc(g.etiqueta)} · saldo ${soles(g.saldo)}`) + `<div class="hoja-body">
    <div class="campos">
      ${campo('g-monto', 'Monto (S/)', `<input id="g-monto" data-g="monto" type="number" inputmode="decimal" min="0.01" step="0.01" value="${esc(g.monto)}">`)}
      ${campo('g-medio', 'Medio de pago', `<select id="g-medio" data-g="medio">${MEDIOS.map(([v, n]) => op(v, n, g.medio)).join('')}</select>`)}
      ${campo('g-fecha', 'Fecha', `<input id="g-fecha" data-g="fecha" type="date" value="${esc(g.fecha)}">`)}
      ${campo('g-notas', 'Nota (opcional)', `<input id="g-notas" data-g="notas" maxlength="200" value="${esc(g.notas)}" placeholder="N.º de operación, banco…">`, true)}
    </div>
    <p class="muted">Se genera un recibo numerado. Queda "por entregar" hasta que Administración confirme que recibió el dinero.</p>
    ${errorHoja()}</div>
    <div class="hoja-pie"><span></span>${botonEnviar('cob-guardar', 'Registrar cobro')}</div>`;
};
R.hojas.limite = () => {
  const c = S.clientes.find(x => x.id === S.g.id);
  return cab('Límite de crédito', esc(c?.nombre || '')) + `<div class="hoja-body">
    ${campo('g-limite', 'Límite (S/). Déjalo vacío para no poner límite.', `<input id="g-limite" data-g="limite" type="number" min="0" step="10" value="${esc(S.g.limite)}">`)}
    ${errorHoja()}</div><div class="hoja-pie"><span></span>${botonEnviar('cob-guardar-limite', 'Guardar límite')}</div>`;
};

function abrirCobro(pedidoId){
  const s = S.datos.cobranzas?.saldos.find(x => x.pedido_id === pedidoId);
  const p = S.pedidos.find(x => x.id === pedidoId);
  let saldo = s?.saldo, etiqueta = s ? pedidoCod(s.numero) + ' · ' + s.cliente : '';
  if (p && S.cobrosPedido[pedidoId]) {
    saldo = p.total - S.cobrosPedido[pedidoId].filter(c => c.estado !== 'anulado').reduce((t, c) => t + c.monto, 0);
    etiqueta = p.codigo + ' · ' + p.cliente.nombre;
  }
  if (saldo == null) return toast('No se encontró el saldo del pedido.');
  abrirHoja({ tipo:'cobro' }, { pedido:pedidoId, saldo, etiqueta, monto:(Math.round(saldo * 100) / 100).toFixed(2), medio:'efectivo', fecha:hoyISO(), notas:'' });
}

Object.assign(R.acciones, {
  'cobrar': d => abrirCobro(d.id),
  'cobrar-pedido': d => abrirCobro(d.id),
  'cob-filtro': d => { S.datos.cobranzas.filtro = d.id; renderTodo(); },
  'cob-guardar': () => {
    const g = S.g, monto = Number(g.monto);
    if (!(monto > 0)) { S.error = 'Escribe un monto mayor que cero.'; return renderHoja(); }
    if (monto > g.saldo + 0.005) { S.error = `El monto supera el saldo (${soles(g.saldo)}).`; return renderHoja(); }
    const pedidoId = g.pedido;
    guardar(async () => {
      const r = await D.registrarCobro({ pedido_id:pedidoId, monto, medio:g.medio, fecha:g.fecha || hoyISO(), notas:g.notas.trim() || null });
      if (S.cobrosPedido[pedidoId]) S.cobrosPedido[pedidoId] = await D.cobrosDePedido(pedidoId);
      return r;
    }, { ok: r => 'Cobro registrado con recibo ' + recibo(r.recibo) });
  },
  'cob-recibir': d => guardar(() => D.cerrarCobro(d.id, 'recibido'), { ok:'Cobro confirmado como recibido', cerrar:false }),
  'cob-anular': d => {
    if (S.datos.cobAnular !== d.id) { S.datos.cobAnular = d.id; return renderTodo(); }
    S.datos.cobAnular = null;
    guardar(() => D.cerrarCobro(d.id, 'anulado'), { ok:'Cobro anulado', cerrar:false });
  },
  'cob-limite': d => { const c = S.clientes.find(x => x.id === d.id); abrirHoja({ tipo:'limite' }, { id:d.id, limite: c?.limite_credito ?? '' }); },
  'cob-guardar-limite': () => {
    const v = String(S.g.limite).trim(), limite = v === '' ? null : Number(v);
    if (limite != null && !(limite >= 0)) { S.error = 'Escribe un número válido o déjalo vacío.'; return renderHoja(); }
    guardar(() => D.cambiarLimite(S.g.id, limite), { ok:'Límite actualizado' });
  }
});


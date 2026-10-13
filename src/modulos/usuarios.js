// Usuarios (solo socios): asignar perfil y activar o desactivar cuentas. Se abre desde "Mi cuenta".
import * as D from '../datos.js';
import { S, R, esc, NOMBRE_ROL } from '../nucleo.js';

R.modulos.usuarios = {
  nombre:'Usuarios', oculto:true,
  ico:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/>',
  async cargar(){ [S.usuarios, S.vendedores] = await Promise.all([D.perfiles(), D.vendedores()]); },
  vista(){
    if (!S.usuarios.length) return '<p class="cargando">Cargando usuarios…</p>';
    const opciones = sel => Object.entries(NOMBRE_ROL).map(([id, n]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${n}</option>`).join('');
    const pendientes = S.usuarios.filter(u => u.rol === 'pendiente').length;
    return `<div class="bloque"><h2 style="font-size:20px">Usuarios</h2>
      <p class="muted">${pendientes ? `${pendientes} persona${pendientes > 1 ? 's esperan' : ' espera'} que le asignes un perfil.` : 'Quien crea una cuenta queda sin perfil hasta que se lo asignes.'}</p>
      <div class="lista">${S.usuarios.map(u => { const yo = u.id === S.perfil.id; return `<div class="usuario">
        <span class="n">${esc(u.nombre)}${yo ? ' <span class="chip">Tú</span>' : ''}</span>
        <select data-u="rol" data-id="${u.id}" aria-label="Perfil de ${esc(u.nombre)}" ${yo ? 'disabled' : ''}>${opciones(u.rol)}</select>
        <select data-u="vendedor" data-id="${u.id}" aria-label="Vendedor de ${esc(u.nombre)} en la lista de clientes"><option value="">No es vendedor</option>${(S.vendedores || []).map(v => `<option value="${esc(v.codigo)}" ${v.perfil_id === u.id ? 'selected' : ''} ${v.perfil_id && v.perfil_id !== u.id ? 'disabled' : ''}>Vende como ${esc(v.nombre)}</option>`).join('')}</select>
        <label><input type="checkbox" data-u="activo" data-id="${u.id}" ${u.activo ? 'checked' : ''} ${yo ? 'disabled' : ''}> Activo</label></div>`; }).join('')}</div>
      <p class="muted">"Vende como" une la cuenta con el nombre de vendedor de la lista de clientes (Jorge, Lily, Giovanni, Liz, Oficina). Así cada vendedor ve primero sus clientes y los clientes que cree quedan a su nombre.</p></div>`;
  }
};

// Usuarios (solo socios): asignar perfil y activar o desactivar cuentas. Se abre desde "Mi cuenta".
import * as D from '../datos.js';
import { S, R, esc, NOMBRE_ROL } from '../nucleo.js';

R.modulos.usuarios = {
  nombre:'Usuarios', oculto:true,
  ico:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/>',
  async cargar(){ S.usuarios = await D.perfiles(); },
  vista(){
    if (!S.usuarios.length) return '<p class="cargando">Cargando usuarios…</p>';
    const opciones = sel => Object.entries(NOMBRE_ROL).map(([id, n]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${n}</option>`).join('');
    const pendientes = S.usuarios.filter(u => u.rol === 'pendiente').length;
    return `<div class="bloque"><h2 style="font-size:20px">Usuarios</h2>
      <p class="muted">${pendientes ? `${pendientes} persona${pendientes > 1 ? 's esperan' : ' espera'} que le asignes un perfil.` : 'Quien crea una cuenta queda sin perfil hasta que se lo asignes.'}</p>
      <div class="lista">${S.usuarios.map(u => { const yo = u.id === S.perfil.id; return `<div class="usuario">
        <span class="n">${esc(u.nombre)}${yo ? ' <span class="chip">Tú</span>' : ''}</span>
        <select data-u="rol" data-id="${u.id}" aria-label="Perfil de ${esc(u.nombre)}" ${yo ? 'disabled' : ''}>${opciones(u.rol)}</select>
        <label><input type="checkbox" data-u="activo" data-id="${u.id}" ${u.activo ? 'checked' : ''} ${yo ? 'disabled' : ''}> Activo</label></div>`; }).join('')}</div></div>`;
  }
};

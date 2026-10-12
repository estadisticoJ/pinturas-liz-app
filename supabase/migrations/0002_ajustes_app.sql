-- Pinturas Liz · 0002 · Ajustes para la aplicación desplegada
-- Ejecutar después de 0001_pedidos.sql.

-- Los nombres de las personas deben verse en los pedidos (quién registró, quién despachó)
-- para todos los perfiles con acceso, no solo para socios y administración.
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.rol_actual() <> 'pendiente');

-- Un socio no puede quitarse a sí mismo el perfil de socio ni desactivarse,
-- para que la empresa nunca se quede sin nadie que asigne perfiles.
create function public.proteger_socio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id = auth.uid() and old.rol = 'socio' and (new.rol <> 'socio' or not new.activo) then
    raise exception 'No puedes quitarte tu propio perfil de socio';
  end if;
  return new;
end $$;
create trigger perfiles_proteger_socio before update on public.perfiles
  for each row execute function public.proteger_socio();

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && clave);
export const supabase = configurado ? createClient(url, clave) : null;

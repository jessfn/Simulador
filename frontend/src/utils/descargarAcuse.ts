const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/** Descarga el acuse de registro en PDF del usuario autenticado (productor o bodega). */
export async function descargarAcuseRegistro(): Promise<void> {
  const token = localStorage.getItem('simac_token');
  const res = await fetch(`${BASE}/auth/perfil/acuse`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo generar el acuse de registro');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'acuse_registro_simac.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Deja solo los dígitos del teléfono; devuelve null si no quedan exactamente 10. */
export function normalizarTelefono(valor: unknown): string | null {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos.length === 10 ? digitos : null;
}

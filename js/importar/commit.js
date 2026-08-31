/* ========================================
   IMPORTAR — Alta de las filas aprobadas
   commit.js — Nada llega acá sin pasar por la revisión
======================================== */
import { S, sb } from '../state.js';
import { aprender } from './clasificar.js';

/* Da de alta en el catálogo los métodos de pago que todavía no estén.
   No pisa los existentes: el importador mapea a los nombres en uso. */
async function asegurarMetodos(nombres) {
  const faltantes = [...new Set(nombres)].filter(n => n && !S.dbMetodos.includes(n));
  if (!faltantes.length) return;
  try {
    await sb.from('metodos_pago').insert(faltantes.map(nombre => ({ user_id: S.currentUserId, nombre })));
  } catch { /* si ya existe por otra vía, no interesa */ }
}

/* Inserta las filas marcadas. Devuelve { insertados, error }. */
export async function commitImportacion(movs) {
  const aprobados = movs.filter(m => m.incluir && m.centro && m.concepto && Number.isFinite(m.importe) && m.importe !== 0);
  if (!aprobados.length) return { insertados: 0, error: 'No hay filas para importar' };
  if (!S.currentUserId) return { insertados: 0, error: 'Sesión no iniciada' };
  if (!navigator.onLine) return { insertados: 0, error: 'Necesitás conexión para importar' };

  await asegurarMetodos(aprobados.map(m => m.metodo));

  const filas = aprobados.map(m => ({
    user_id: S.currentUserId,
    fecha: m.fecha,
    centro: m.centro.trim(),
    tipo: m.tipo === 'F' ? 'F' : 'V',
    concepto: m.concepto.trim(),
    metodo: m.metodo,
    importe: m.importe,
    moneda: m.moneda === 'USD' ? 'USD' : 'ARS'
  }));

  /* En tandas para no pasarse del límite de la request. */
  let insertados = 0;
  for (let i = 0; i < filas.length; i += 100) {
    const tanda = filas.slice(i, i + 100);
    const { error } = await sb.from('gastos').insert(tanda);
    if (error) return { insertados, error: error.message };
    insertados += tanda.length;
  }

  aprender(aprobados);
  return { insertados, error: null };
}

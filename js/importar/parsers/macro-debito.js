/* ========================================
   IMPORTAR — Parser débito Macro (Últimos movimientos, .xls)
   parsers/macro-debito.js — Puro: recibe filas, devuelve movimientos
======================================== */
import { normalizarTexto, toISO } from '../normalizar.js';

export const METODO = 'Macro Manual';

/* Pagos de tarjeta: el detalle ya viene en el resumen de VISA/Master,
   importarlos acá sumaría el gasto dos veces. */
const RE_PAGO_TARJETA = /DB\.?\s*TARJETA DE CREDITO|PAGO TARJETA/;

/* Movimientos que no representan un gasto real. */
const RE_NO_GASTO = /CAPITALIZACION|SOL\.?RESC|RESCATE|CTO CV ME|ACREDITACION|DEPOSITO/;

function esFecha(v) {
  return v instanceof Date || (typeof v === 'number' && v > 20000 && v < 80000);
}

/* Las celdas de fecha llegan como Date (SheetJS con cellDates) o como
   serial de Excel si la planilla no trae formato. */
function aISO(v) {
  if (v instanceof Date) return toISO(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

/* Ubica la fila de encabezados y mapea las columnas por nombre, así el
   parser sobrevive si Macro reordena o agrega columnas. */
function detectarColumnas(filas) {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const fila = (filas[i] || []).map(c => normalizarTexto(c));
    const iFecha = fila.findIndex(c => c === 'FECHA');
    const iDesc = fila.findIndex(c => c.startsWith('DESCRIPCION') || c === 'DETALLE');
    const iImp = fila.findIndex(c => c.startsWith('IMPORTE') || c === 'MONTO');
    if (iFecha >= 0 && iDesc >= 0 && iImp >= 0) {
      return { header: i, fecha: iFecha, desc: iDesc, importe: iImp };
    }
  }
  return null;
}

export function parseMacroDebito(filas, opts = {}) {
  const cols = detectarColumnas(filas);
  if (!cols) throw new Error('No se encontraron las columnas Fecha / Descripción / Importe');

  const titulo = normalizarTexto((filas[0] || []).join(' '));
  const moneda = /DOLAR|DOLARES|USD/.test(titulo) ? 'USD' : 'ARS';

  const movs = [];
  for (let i = cols.header + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    if (!esFecha(fila[cols.fecha])) continue;
    const fecha = aISO(fila[cols.fecha]);
    const bruto = Number(fila[cols.importe]);
    if (!fecha || !Number.isFinite(bruto) || bruto === 0) continue;

    const desc = String(fila[cols.desc] ?? '').trim();
    const descN = normalizarTexto(desc);

    let estado = 'nuevo', motivo = null;
    if (bruto > 0) {
      estado = 'descartado';
      motivo = RE_NO_GASTO.test(descN) ? 'Ingreso de la cuenta' : 'Crédito, no es un gasto';
    } else if (RE_PAGO_TARJETA.test(descN)) {
      estado = 'descartado';
      motivo = 'Pago de tarjeta — el detalle viene en el resumen de la tarjeta';
    }

    movs.push({
      fecha,
      importe: Math.abs(bruto),
      moneda,
      metodo: METODO,
      /* Sin limpiar: en el débito el CUIT es lo que identifica a cada
         transferencia, así que la memoria aprende por CUIT. */
      conceptoOrigen: desc.replace(/\s+/g, ' ').trim(),
      origen: 'macro-debito',
      estado,
      motivoDescarte: motivo,
      centroSugerido: '',
      _lineas: [desc]
    });
  }

  const fechas = movs.map(m => m.fecha).sort();
  return { cierre: fechas[fechas.length - 1] || opts.cierre || null, movimientos: movs };
}

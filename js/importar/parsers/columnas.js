/* ========================================
   IMPORTAR — Asignación de moneda por columna
   parsers/columnas.js — Los resúmenes de Macro separan pesos de dólares
   por posición horizontal, no por texto. Como llegan por OCR, hay que
   decidir la moneda de cada importe por dónde cae en la página.
======================================== */
import { RE_IMPORTE, parseImporteAR } from '../normalizar.js';

/* Importes de una fila con su posición. Si la fila no trae palabras
   posicionadas (PDF con texto), devuelve los importes sin coordenadas. */
export function importesPosicionados(fila) {
  const out = [];
  for (const p of fila.palabras || []) {
    const limpio = String(p.texto).replace(/^[(]|[)]$/g, '');
    if (!new RegExp(`^${RE_IMPORTE.source}$`).test(limpio)) continue;
    const valor = parseImporteAR(limpio);
    if (!Number.isFinite(valor)) continue;
    out.push({ valor, texto: p.texto, x1: p.x1, centro: p.centro });
  }
  return out;
}

/* Agrupa los bordes derechos en columnas separadas por al menos `gap` px. */
export function detectarColumnas(bordes, gap = 120) {
  const orden = [...bordes].sort((a, b) => a - b);
  const cols = [];
  for (const b of orden) {
    const ult = cols[cols.length - 1];
    if (ult && b - ult.max <= gap) { ult.max = b; ult.vals.push(b); }
    else cols.push({ max: b, vals: [b] });
  }
  return cols.map(c => c.vals.reduce((a, b) => a + b, 0) / c.vals.length);
}

/* Devuelve una función que asigna moneda a un importe según su posición.
   `anclas` es { ARS: x, USD: x } con el borde derecho típico de cada
   columna. Si falta alguna, todo cae en la moneda por defecto. */
export function clasificadorMoneda(anclas, porDefecto = 'ARS') {
  const pares = Object.entries(anclas).filter(([, x]) => Number.isFinite(x));
  if (pares.length < 2) return () => porDefecto;
  return (imp) => {
    let mejor = porDefecto, dist = Infinity;
    for (const [moneda, x] of pares) {
      const d = Math.abs(imp.x1 - x);
      if (d < dist) { dist = d; mejor = moneda; }
    }
    return mejor;
  };
}

/* Elige el importe facturado de una fila: el que cae dentro de alguna
   columna de moneda. Descarta los que aparecen en el detalle (por ejemplo
   el monto de origen entre paréntesis de Macro Master). */
export function elegirImporte(fila, anclas, tol = 150) {
  const cands = importesPosicionados(fila);
  if (!cands.length) return null;
  const pares = Object.entries(anclas).filter(([, x]) => Number.isFinite(x));
  if (!pares.length) {
    const u = cands[cands.length - 1];
    return { ...u, moneda: 'ARS' };
  }
  let mejor = null;
  for (const c of cands) {
    for (const [moneda, x] of pares) {
      const d = Math.abs(c.x1 - x);
      if (d <= tol && (!mejor || d <= mejor.dist)) mejor = { ...c, moneda, dist: d };
    }
  }
  return mejor;
}

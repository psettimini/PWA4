/* ========================================
   IMPORTAR — Clasificación automática (centro / tipo / concepto)
   clasificar.js — Reusa los patrones que ya calcula carga.js
======================================== */
import { normalizarTexto, limpiarComercio } from './normalizar.js';

export const MEMORIA_KEY = 'gastos_import_memoria_v1';

/* Impuestos, percepciones y retenciones de cualquiera de los tres orígenes.
   Van siempre a Gastos Bancarios como fijos, igual que venías cargándolos. */
const RE_IMPUESTO = /\b(IMPUESTO|IMP\.?\s*SELLOS|SELLOS|PERCEP\w*|PERC\b|RETENC\w*|IIBB|INGRESOS BRUTOS|DB\.?RG|RG\s*\d|IVA\b)/;

/* ── Memoria de clasificaciones aprendidas ──
   Cada vez que aprobás filas, se guarda cómo clasificaste cada comercio.
   La próxima importación lo resuelve solo. */
export function getMemoria() {
  try { return JSON.parse(localStorage.getItem(MEMORIA_KEY) || '{}') || {}; }
  catch { return {}; }
}

export function setMemoria(mem) {
  try { localStorage.setItem(MEMORIA_KEY, JSON.stringify(mem)); } catch {}
}

/* Clave estable del comercio: sin acentos, sin números de referencia. */
export function claveComercio(textoOrigen) {
  const base = normalizarTexto(limpiarComercio(textoOrigen))
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.slice(0, 60);
}

export function aprender(movs) {
  const mem = getMemoria();
  let n = 0;
  for (const m of movs) {
    const k = claveComercio(m.conceptoOrigen);
    if (!k || !m.centro || !m.concepto) continue;
    mem[k] = { centro: m.centro, tipo: m.tipo, concepto: m.concepto };
    n++;
  }
  setMemoria(mem);
  return n;
}

/* Busca un centro que coincida con alguno de los nombres del socio del
   cargo. AMEX escribe "JUANA SETTIMINI" y Macro "SETTIMINI JUANA", así que
   se prueban todas las palabras. */
export function sugerirCentroPorSocio(socio, centros = []) {
  const partes = normalizarTexto(socio).split(' ').filter(Boolean);
  for (const parte of partes) {
    for (const c of centros) {
      const cn = normalizarTexto(c);
      if (!cn || cn.length < 3) continue;
      if (cn === parte || parte.startsWith(cn) || cn.startsWith(parte)) return c;
    }
  }
  return '';
}

/* ── Matching contra patrones existentes ── */
function tokens(s) {
  return normalizarTexto(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 4);
}

function puntajePatron(origen, patron) {
  const a = normalizarTexto(limpiarComercio(origen));
  const b = normalizarTexto(patron.concepto);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 60 + Math.round(ratio * 30);
  }
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const comunes = ta.filter(t => setB.has(t)).length;
  if (!comunes) return 0;
  return Math.round((comunes / Math.min(ta.length, tb.length)) * 55);
}

/* Devuelve la clasificación propuesta para un movimiento.
   Orden: memoria aprendida → impuestos → patrones existentes → fallback. */
export function clasificar(mov, patrones = [], opts = {}) {
  const origen = mov.conceptoOrigen || '';
  const conceptoLimpio = limpiarComercio(origen) || origen;

  const mem = opts.memoria || getMemoria();
  const k = claveComercio(origen);
  if (k && mem[k]) {
    return { ...mem[k], confianza: 'alta', fuente: 'memoria' };
  }

  if (RE_IMPUESTO.test(normalizarTexto(origen))) {
    return {
      centro: 'Gastos Bancarios', tipo: 'F',
      concepto: conceptoLimpio, confianza: 'alta', fuente: 'regla'
    };
  }

  let mejor = null, mejorP = 0;
  for (const p of patrones) {
    if (!p.concepto) continue;
    const score = puntajePatron(origen, p) + Math.min(p.frecuencia || 0, 10);
    if (score > mejorP) { mejorP = score; mejor = p; }
  }
  if (mejor && mejorP >= 55) {
    return {
      centro: mejor.centro, tipo: mejor.tipo, concepto: mejor.concepto,
      confianza: mejorP >= 80 ? 'alta' : 'media', fuente: 'patron'
    };
  }

  return {
    centro: opts.centroSugerido || '', tipo: 'V',
    concepto: conceptoLimpio, confianza: 'baja', fuente: 'sin-match'
  };
}

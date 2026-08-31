/* ========================================
   IMPORTAR — Normalización de fechas, importes y textos
   normalizar.js — Funciones puras, sin dependencias internas
======================================== */

/* Meses en español, ya normalizados (sin acentos, mayúsculas). */
const MESES = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
  NOVIEMBRE: 11, DICIEMBRE: 12
};

/* Importes es-AR: punto separa miles, coma separa decimales.
   Acepta con y sin separador de miles porque Macro imprime "574498,54"
   y AMEX imprime "25.524,00". */
export const RE_IMPORTE = /(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}-?/g;

/* Quita acentos, colapsa espacios y pasa a mayúsculas.
   Se usa para comparar textos de extractos contra patrones guardados. */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/* Convierte un importe impreso en formato es-AR a número.
   Reconoce el signo por menos adelante, menos atrás (Macro: "4,40-")
   o paréntesis. Devuelve NaN si no hay número. */
export function parseImporteAR(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1).trim(); }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith('-')) { negativo = true; s = s.slice(1).trim(); }
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
}

/* Devuelve todos los importes es-AR presentes en una línea, en orden. */
/* Parseo tolerante para lo que se escribe a mano en la revisión, donde
   conviven el formato es-AR ("294.742,14") y el que muestra el campo
   ("294742.14"). Regla: manda el último separador, y solo es decimal si lo
   siguen una o dos cifras — en es-AR los miles siempre van de a tres. */
export function parseImporteFlexible(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1).trim(); }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith('-')) { negativo = true; s = s.slice(1).trim(); }
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return NaN;

  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let entero = s, decimales = '';
  if (ultimo >= 0) {
    const cola = s.slice(ultimo + 1);
    if (/^\d{1,2}$/.test(cola)) { entero = s.slice(0, ultimo); decimales = cola; }
  }
  entero = entero.replace(/[.,]/g, '');
  if (!entero && !decimales) return NaN;

  const n = parseFloat(`${entero || '0'}.${decimales || '0'}`);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
}

export function importesEnLinea(linea) {
  const out = [];
  for (const m of String(linea ?? '').matchAll(RE_IMPORTE)) {
    const n = parseImporteAR(m[0]);
    if (Number.isFinite(n)) out.push({ texto: m[0], valor: n, indice: m.index });
  }
  return out;
}

/* Acepta el mes completo o abreviado ("Agosto", "Ago", "Set."). */
function numeroDeMes(nombre) {
  const n = String(nombre || '').replace(/\.$/, '');
  if (MESES[n]) return MESES[n];
  if (n.length >= 3) {
    for (const k of Object.keys(MESES)) if (k.startsWith(n)) return MESES[k];
  }
  return 0;
}

export function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* Los resúmenes imprimen el día y el mes pero no el año. Se deduce del
   cierre: si la fecha cayera después del cierre, pertenece al año anterior
   (es el caso del cruce diciembre→enero). */
export function resolverAnio(mes, dia, refISO) {
  const [ry, rm, rd] = String(refISO).split('-').map(Number);
  if (!Number.isFinite(ry)) return new Date().getFullYear();
  if (mes > rm || (mes === rm && dia > rd)) return ry - 1;
  return ry;
}

/* Parsea las tres formas que aparecen en los extractos:
   "14 Julio" / "20 de Julio" (Macro VISA, AMEX), "07/08" (Macro Master,
   Ualá) y "11/08/26". refISO es la fecha de cierre del resumen. */
export function parseFecha(raw, refISO) {
  const s = normalizarTexto(raw).replace(/\bDE\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return toISO(y, Number(m[2]), Number(m[1]));
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const dia = Number(m[1]), mes = Number(m[2]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return toISO(resolverAnio(mes, dia, refISO), mes, dia);
  }

  /* Macro VISA imprime el año junto a la fecha: "14 JULIO 26". */
  m = s.match(/^(\d{1,2})\s+([A-ZN]+)\.?\s+(\d{2,4})$/);
  if (m) {
    const dia = Number(m[1]), mes = numeroDeMes(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mes && dia >= 1 && dia <= 31) return toISO(y, mes, dia);
  }

  m = s.match(/^(\d{1,2})\s+([A-ZN]+)\.?$/);
  if (m) {
    const dia = Number(m[1]), mes = numeroDeMes(m[2]);
    if (!mes || dia < 1 || dia > 31) return null;
    return toISO(resolverAnio(mes, dia, refISO), mes, dia);
  }

  return null;
}

/* Limpia el texto de un comercio para usarlo como concepto propuesto:
   saca códigos de referencia largos, asteriscos de pasarela y relleno. */
export function limpiarComercio(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b\d{8,}\b/g, ' ');            // números de referencia
  s = s.replace(/\b[\d.,]+\s*(US DOLLAR?S?|USD|EURO?S?)\b/gi, ' ');
  s = s.replace(/[*]+/g, ' ');
  s = s.replace(/\s*(?:\d{1,3}(?:\.\d{3})*[.,]\d{2})\s*$/, ' '); // importe de origen al final
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/\s+[$]$/, '');                 // signo de moneda suelto
  s = s.replace(/^[-\s.]+|[-\s.]+$/g, '');
  return s;
}

/* Diferencia en días entre dos fechas ISO. null si alguna es inválida. */
export function diffDias(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`), b = Date.parse(`${isoB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/* Importe en es-AR con centavos, para mostrar en la revisión: así se
   compara de un vistazo contra el resumen impreso. */
export function formatImporteEdit(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

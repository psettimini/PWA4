/* ========================================
   IMPORTAR — Parser AMEX (Estado de Cuenta)
   parsers/amex.js — Puro: recibe líneas de texto, devuelve movimientos.
   El PDF de AMEX trae capa de texto, así que no necesita OCR.
======================================== */
import { parseFecha, importesEnLinea, normalizarTexto, limpiarComercio } from '../normalizar.js';
import { sugerirCentroPorSocio } from '../clasificar.js';

export const METODO = 'AMEX';

const RE_SECCION = /Nuevos Cargos en (PESOS|DOLARES) para (.+?)(?:\s+Continuaci[oó]n)?\s*$/i;
const RE_FECHA_INICIO = /^(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+)\b\s*(.*)$/;
const RE_CUOTA = /Cuota\s+(\d+)\s+de\s+(\d+)/i;
const RE_FACTURACION = /Facturaci[oó]n\s+(\d{2}\/\d{2}\/\d{2})/i;

/* Líneas que nunca son un movimiento. */
const RE_RUIDO = /^(Total de Cargos|Saldo|N[uú]mero de [Cc]uenta|Fecha y detalle|Nuevos Cargos|Estado de Cuenta|The Platinum|www\.|P[aá]gina|Importe en)/i;

/* Pagos del resumen: no son gastos, sumarían al doble con el débito. */
const RE_PAGO = /Gracias por su pago|SU PAGO\b/i;

/* Fecha de cierre del resumen, usada para deducir el año de cada consumo. */
export function detectarCierre(lineas) {
  for (const l of lineas) {
    const m = l.match(RE_FACTURACION);
    if (m) {
      const [d, mes, y] = m[1].split('/').map(Number);
      return `${2000 + y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

export function parseAmex(lineas, opts = {}) {
  const centros = opts.centros || [];
  const cierre = detectarCierre(lineas) || opts.cierre || new Date().toISOString().slice(0, 10);

  const movs = [];
  let moneda = 'ARS';
  let socio = '';
  let actual = null;

  const cerrar = () => {
    if (actual) movs.push(actual);
    actual = null;
  };

  for (const rawLinea of lineas) {
    const linea = String(rawLinea).replace(/\s+/g, ' ').trim();
    if (!linea) continue;

    const sec = linea.match(RE_SECCION);
    if (sec) {
      cerrar();
      moneda = /DOLARES/i.test(sec[1]) ? 'USD' : 'ARS';
      socio = sec[2].trim();
      continue;
    }

    const ini = linea.match(RE_FECHA_INICIO);
    if (ini) {
      const fecha = parseFecha(ini[1], cierre);
      const resto = ini[2];
      const importes = importesEnLinea(resto);
      if (fecha && importes.length) {
        cerrar();
        /* En cargos en euros la línea trae dos importes: el de origen y el
           convertido a dólares. El que se carga es el último. */
        const imp = importes[importes.length - 1];
        const descripcion = resto.slice(0, imp.indice).trim();
        actual = {
          fecha,
          importe: Math.abs(imp.valor),
          moneda,
          metodo: METODO,
          conceptoOrigen: limpiarComercio(descripcion) || descripcion,
          socio,
          origen: 'amex',
          estado: RE_PAGO.test(descripcion) ? 'descartado' : 'nuevo',
          motivoDescarte: RE_PAGO.test(descripcion) ? 'Pago del resumen' : null,
          centroSugerido: sugerirCentroPorSocio(socio, centros),
          _lineas: [linea]
        };
        continue;
      }
    }

    if (!actual || RE_RUIDO.test(linea)) { if (RE_RUIDO.test(linea)) cerrar(); continue; }

    /* Líneas de continuación del cargo en curso. */
    actual._lineas.push(linea);

    if (/^CR$/i.test(linea) || /\bCR$/.test(linea)) actual.importe = -Math.abs(actual.importe);

    const cuota = linea.match(RE_CUOTA);
    if (cuota) {
      actual.cuota = { nro: Number(cuota[1]), total: Number(cuota[2]) };
      actual.conceptoOrigen = `${actual.conceptoOrigen} (${cuota[1]}/${cuota[2]})`;
    }
  }
  cerrar();

  return { cierre, movimientos: movs.filter(m => Number.isFinite(m.importe) && m.importe !== 0) };
}

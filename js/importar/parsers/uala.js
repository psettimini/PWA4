/* ========================================
   IMPORTAR — Parser Ualá (capturas de "Últimos movimientos")
   parsers/uala.js — Cada movimiento ocupa dos renglones en la app:
   arriba el título y el importe, abajo la categoría y la fecha.
======================================== */
import { parseFecha, importesEnLinea, normalizarTexto } from '../normalizar.js';

export const METODO = 'Ualá';

const RE_FECHA_FIN = /(\d{1,2}\/\d{1,2})\s*$/;
const RE_RUIDO = /^(ULTIMOS MOVIMIENTOS|MOVIMIENTOS|BUSCAR|HOY|AYER|\W*)$/;

/* Los ingresos se muestran con un "+" delante del importe. No son gastos. */
const RE_INGRESO = /\+\s*\$/;
const RE_NO_GASTO = /RENDIMIENTO|TRANSFERENCIA RECIBIDA|INGRESO|DEVOLUCION|REINTEGRO|COBRO/;

/* La app trunca los títulos largos con puntos suspensivos. */
const RE_TRUNCADO = /(\.\.\.|…)\s*$/;

function limpiarTitulo(s) {
  return String(s)
    .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, '')   // ruido del ícono
    .replace(/^\(?[A-Za-z0-9]{1,2}\)\s*/, '')     // ícono leído como "7)" o "Y)"
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseUala(lineas, opts = {}) {
  const ref = opts.cierre || new Date().toISOString().slice(0, 10);
  const movs = [];
  const sinImporte = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = String(lineas[i]).replace(/\s+/g, ' ').trim();
    if (!linea || RE_RUIDO.test(normalizarTexto(linea))) continue;

    const importes = importesEnLinea(linea);
    if (!importes.length) continue;

    const imp = importes[importes.length - 1];
    const titulo = limpiarTitulo(linea.slice(0, imp.indice).replace(/\+?\s*\$\s*$/, ''));
    if (!titulo) continue;

    /* La fecha y la categoría están en el renglón siguiente. */
    const sig = String(lineas[i + 1] || '').replace(/\s+/g, ' ').trim();
    const mf = sig.match(RE_FECHA_FIN);
    if (!mf) { sinImporte.push(linea); continue; }
    const fecha = parseFecha(mf[1], ref);
    if (!fecha) { sinImporte.push(linea); continue; }

    const categoria = sig.slice(0, mf.index).trim();
    const esIngreso = RE_INGRESO.test(linea) || RE_NO_GASTO.test(normalizarTexto(categoria));

    movs.push({
      fecha,
      importe: Math.abs(imp.valor),
      moneda: 'ARS',
      metodo: METODO,
      conceptoOrigen: titulo.replace(RE_TRUNCADO, '').trim(),
      categoriaOrigen: categoria,
      truncado: RE_TRUNCADO.test(titulo),
      origen: 'uala',
      estado: esIngreso ? 'descartado' : 'nuevo',
      motivoDescarte: esIngreso ? 'Ingreso, no es un gasto' : null,
      centroSugerido: '',
      _lineas: [linea, sig]
    });
    i++;
  }

  return { cierre: ref, movimientos: movs, sinImporte };
}

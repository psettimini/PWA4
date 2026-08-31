/* ========================================
   IMPORTAR — Parser caja de ahorros BBVA
   parsers/bbva-cuenta.js — El detalle trae conceptos genéricos
   ("DEBITO DIRECTO", "TRANSFERENCIA") que se completan con los anexos del
   propio resumen, donde figuran la empresa y el CUIT destino.
======================================== */
import { parseFecha, normalizarTexto, parseImporteAR } from '../normalizar.js';
import { importesPosicionados, detectarColumnas } from './columnas.js';
import { CUIT_PROPIOS } from './macro-debito.js';

export const METODO = 'Debito CA BBVA';

const RE_MOV = /(\d{2}\/\d{2})\s+(.*)$/;
const RE_INFO_AL = /informaci[oó]n al:\s*(\d{2}\/\d{2}\/\d{4})/i;

/* Filas que cierran o resumen el bloque, nunca movimientos. */
const RE_DESCARTE = /SALDO ANTERIOR|SALDO AL|TOTAL MOVIMIENTOS|^FECHA\b|CONSUMIDOR FINAL|VER LEGALES/;

/* El pago de la tarjeta ya viene detallado en el resumen de esa tarjeta. */
const RE_PAGO_TARJETA = /CUENTA (VISA|MASTERCARD) NRO/;

/* El detalle de la cuenta y los anexos usan el mismo formato de fila, así
   que hay que acotar la lectura al bloque de movimientos. */
const RE_INICIO_DETALLE = /^Movimientos en cuentas/i;
const RE_FIN_DETALLE = /Ver Legales|^Transferencias\b|^D[ée]bitos autom[aá]ticos|^Legales y avisos/i;

const RE_DEBITO_AUTOMATICO = /^DEBITO DIRECTO/;
const RE_TRANSFERENCIA = /^TRANSFERENCIA/;

const clave = (fecha, importe) => `${fecha}|${Math.abs(importe).toFixed(2)}`;

/* Anexo "Débitos automáticos": aporta empresa y servicio de cada débito. */
function leerDebitosAutomaticos(filas) {
  const mapa = new Map();
  let dentro = false;
  for (const f of filas) {
    const t = f.texto.replace(/\s+/g, ' ').trim();
    if (/^D[ée]bitos autom[aá]ticos/i.test(t)) { dentro = true; continue; }
    if (dentro && /^(Transferencias|Legales|Cuentas|Movimientos)/i.test(t)) { dentro = false; continue; }
    if (!dentro) continue;
    const m = t.match(/^(\d{2}\/\d{2})\s+(.*)$/);
    if (!m) continue;
    const imps = importesPosicionados(f);
    if (!imps.length) continue;
    /* La última columna es la cuenta; el importe es el número anterior. */
    const imp = imps[imps.length - 1];
    /* Se parte por las columnas del original, no por el texto colapsado:
       interesan sólo empresa y servicio. */
    const crudo = f.texto.replace(/^\s*\d{2}\/\d{2}\s*/, '');
    const partes = crudo.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
    const k = clave(m[1], imp.valor);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(partes.slice(0, 2).join(' '));
  }
  return mapa;
}

/* Anexo "Transferencias enviadas": aporta el CUIT o apellido del destino. */
function leerTransferencias(filas) {
  const mapa = new Map();
  let dentro = false;
  for (const f of filas) {
    const t = f.texto.replace(/\s+/g, ' ').trim();
    if (/^Transferencias\b/i.test(t)) { dentro = true; continue; }
    if (dentro && /^(D[ée]bitos|Legales|Cuentas|Movimientos)/i.test(t)) { dentro = false; continue; }
    if (!dentro) continue;
    const m = t.match(/^(\d{2}\/\d{2})\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const imps = importesPosicionados(f);
    if (!imps.length) continue;
    const imp = imps[imps.length - 1];
    const k = clave(m[1], imp.valor);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push({ destino: m[2], detalle: m[3] });
  }
  return mapa;
}

export function detectarCierre(filas) {
  for (const f of filas) {
    const m = f.texto.match(RE_INFO_AL);
    if (m) {
      const [d, mes, y] = m[1].split('/');
      return `${y}-${mes}-${d}`;
    }
  }
  return null;
}

/* La columna del saldo es la de más a la derecha y aparece en todas las
   filas: si se tomara "el último importe de la línea" se cargaría el saldo
   en vez del movimiento. */
function anclasSinSaldo(filas) {
  const bordes = [];
  for (const f of soloDetalle(filas)) {
    if (!RE_MOV.test(f.texto)) continue;
    for (const i of importesPosicionados(f)) bordes.push(i.x1);
  }
  if (!bordes.length) return [];
  const cols = detectarColumnas(bordes, 30);
  return cols.slice(0, -1);   // fuera el saldo
}

/* Filas del bloque de movimientos, sin los anexos del final. */
function soloDetalle(filas) {
  const out = [];
  let dentro = false;
  for (const f of filas) {
    const t = f.texto.replace(/\s+/g, ' ').trim();
    if (RE_INICIO_DETALLE.test(t)) { dentro = true; continue; }
    if (dentro && RE_FIN_DETALLE.test(t)) { dentro = false; continue; }
    if (dentro) out.push(f);
  }
  return out;
}

export function parseBbvaCuenta(filas, opts = {}) {
  const cierre = detectarCierre(filas) || opts.cierre || null;
  const anclas = anclasSinSaldo(filas);
  const debitos = leerDebitosAutomaticos(filas);
  const transferencias = leerTransferencias(filas);
  const movs = [];
  const sinImporte = [];

  for (const fila of soloDetalle(filas)) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const textoN = normalizarTexto(texto);
    if (RE_DESCARTE.test(textoN)) continue;

    const m = texto.match(RE_MOV);
    if (!m || m.index > 8) continue;
    const fecha = parseFecha(m[1], cierre);
    if (!fecha) continue;

    /* Se ignoran los importes que caen en la columna del saldo. */
    const cands = importesPosicionados(fila)
      .filter(i => anclas.some(x => Math.abs(i.x1 - x) <= 30));
    if (!cands.length) continue;
    const imp = cands[0];
    if (!Number.isFinite(imp.valor) || imp.valor === 0) continue;

    let desc = m[2];
    const corte = desc.lastIndexOf(imp.texto);
    if (corte > 0) desc = desc.slice(0, corte);
    desc = desc.replace(/^\d{3}\s+/, '').replace(/\s+/g, ' ').trim();   // código de origen
    const descN = normalizarTexto(desc);
    if (!desc) continue;

    let estado = 'nuevo', motivo = null;
    let concepto = desc;

    /* Los anexos del propio resumen completan los conceptos genéricos. */
    if (RE_DEBITO_AUTOMATICO.test(descN)) {
      const cola = debitos.get(clave(m[1], imp.valor));
      const detalle = cola?.shift();
      if (detalle) concepto = `${desc} - ${detalle}`;
    } else if (RE_TRANSFERENCIA.test(descN)) {
      const t = transferencias.get(clave(m[1], imp.valor))?.shift();
      if (t) {
        concepto = `${desc} ${t.destino}`;
        if (CUIT_PROPIOS.includes(t.destino)) {
          estado = 'descartado';
          motivo = 'Transferencia a una cuenta propia, no es un gasto';
        }
      }
    }

    if (imp.valor > 0) {
      estado = 'descartado';
      motivo = 'Crédito de la cuenta, no es un gasto';
    } else if (RE_PAGO_TARJETA.test(descN)) {
      estado = 'descartado';
      motivo = 'Pago de tarjeta — el detalle viene en el resumen de la tarjeta';
    }

    movs.push({
      fecha,
      importe: Math.abs(imp.valor),
      moneda: 'ARS',
      metodo: METODO,
      conceptoOrigen: concepto,
      origen: 'bbva-cuenta',
      estado,
      motivoDescarte: motivo,
      centroSugerido: '',
      _lineas: [texto]
    });
  }

  return { cierre, movimientos: movs, sinImporte };
}

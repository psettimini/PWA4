/* ========================================
   IMPORTAR — Orquestador
   index.js — Archivo → parser → clasificación → dedup → revisión → alta
======================================== */
import { $, S, STORAGE_KEYS, registry } from '../state.js';
import { safeNumber, evalExpresion, showLoading } from '../utils.js';
import { toast, toastError, toastWarn, modalConfirm } from '../ui.js';
import { leerArchivo } from './parsers/fuentes.js';
import { cargarXlsx } from './parsers/libs.js';
import { parseAmex } from './parsers/amex.js';
import { parseMacroVisa } from './parsers/macro-visa.js';
import { parseMacroMaster } from './parsers/macro-master.js';
import { parseMacroDebito } from './parsers/macro-debito.js';
import { parseUala } from './parsers/uala.js';
import { clasificar, getMemoria, claveComercio } from './clasificar.js';
import { anotarDuplicados, cruzarTransferencias } from './dedup.js';
import { commitImportacion } from './commit.js';
import { renderRevision, renderResumen } from './revision.js';

const E = { movs: [], filtro: 'todos', trabajando: false };
let seq = 0;

export const ORIGENES = {
  amex: 'AMEX',
  'macro-visa': 'VISA Macro',
  'macro-master': 'Master Macro',
  'macro-debito': 'Débito Macro',
  uala: 'Ualá'
};

/* ── Detección de origen ── */
export function detectarOrigen(nombre, lineas) {
  const n = (nombre || '').toLowerCase();
  if (/\.xlsx?$/.test(n)) return 'macro-debito';

  const txt = lineas.slice(0, 60).join(' ').toUpperCase();
  if (/AMERICAN EXPRESS|PLATINUM CARD|ESTADO DE CUENTA/.test(txt)) return 'amex';
  if (/MASTERCARD|MARCA TARJETA/.test(txt)) return 'macro-master';
  if (/SALDO ANTERIOR|TOTAL CONSUMOS|SIGNATURE|MONSERRAT/.test(txt)) return 'macro-visa';
  if (/ULTIMOS MOVIMIENTOS|RENDIMIENTOS|OPERACI[OÓ]N EXITOSA/.test(txt)) return 'uala';
  if (/\.(png|jpe?g|webp|heic)$/.test(n)) return 'uala';
  return null;
}

function ejecutarParser(origen, lineas, filas, opts) {
  switch (origen) {
    case 'amex': return parseAmex(lineas, opts);
    case 'macro-visa': return parseMacroVisa(filas, opts);
    case 'macro-master': return parseMacroMaster(filas, opts);
    case 'uala': return parseUala(lineas, opts);
    default: throw new Error(`Origen no soportado: ${origen}`);
  }
}

/* ── Lectura de un archivo ── */
async function procesarArchivo(file, origenForzado, onEstado) {
  const nombre = (file.name || '').toLowerCase();
  const centros = [...new Set(S.allData.map(g => g.Centro).filter(Boolean))];

  if (/\.xlsx?$/.test(nombre) || origenForzado === 'macro-debito') {
    onEstado?.('Leyendo planilla…', 0);
    const XLSX = await cargarXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
    return { origen: 'macro-debito', ...parseMacroDebito(filas, { centros }) };
  }

  const { lineas, filas } = await leerArchivo(file, onEstado);
  const origen = origenForzado || detectarOrigen(file.name, lineas);
  if (!origen) throw new Error(`No pude reconocer el origen de "${file.name}". Elegilo a mano y volvé a intentar.`);
  return { origen, ...ejecutarParser(origen, lineas, filas, { centros }) };
}

/* ── Clasificación + dedup ── */
function preparar(movs) {
  const memoria = getMemoria();
  const centros = [...new Set(S.allData.map(g => g.Centro).filter(Boolean))];
  for (const m of movs) {
    m.id = `imp-${++seq}`;
    const c = clasificar(m, S.patrones, { memoria, centroSugerido: m.centroSugerido });
    m.centro = c.centro || m.centroSugerido || '';
    m.tipo = c.tipo || 'V';
    m.concepto = c.concepto || m.conceptoOrigen;
    m.confianza = c.confianza;
    m.fuente = c.fuente;
    if (!m.centro && m.centroSugerido && centros.includes(m.centroSugerido)) m.centro = m.centroSugerido;
  }
  anotarDuplicados(movs, S.allData);

  /* Si el movimiento matchea uno ya cargado, esa fila es la mejor fuente de
     clasificación que hay: ya la corregiste vos. Se adopta cuando el
     clasificador no encontró nada mejor. */
  for (const m of movs) {
    const top = m.duplicados?.[0]?.gasto;
    if (!top || m.confianza === 'alta') continue;
    m.centro = top.Centro || m.centro;
    m.tipo = top.Tipo || m.tipo;
    m.concepto = top.Concepto || m.concepto;
    m.confianza = 'media';
    m.fuente = 'duplicado';
  }

  /* Lo resuelto por CUIT se propaga dentro del lote: si una transferencia
     matcheó un gasto ya cargado, las demás al mismo CUIT heredan esa
     clasificación aunque no tengan duplicado propio. */
  const porCuit = new Map();
  for (const m of movs) {
    if (m.fuente !== 'duplicado' && m.fuente !== 'memoria') continue;
    const k = claveComercio(m.conceptoOrigen);
    if (k && !porCuit.has(k)) porCuit.set(k, { centro: m.centro, tipo: m.tipo, concepto: m.concepto });
  }
  for (const m of movs) {
    if (m.estado === 'descartado' || m.fuente === 'duplicado' || m.confianza === 'alta') continue;
    const c = porCuit.get(claveComercio(m.conceptoOrigen));
    if (!c || !c.centro) continue;
    m.centro = c.centro;
    m.tipo = c.tipo;
    m.concepto = c.concepto;
    m.confianza = 'media';
    m.fuente = 'cuit';
  }

  return cruzarTransferencias(movs);
}

/* ── Borrador ── */
function guardarBorrador() {
  try {
    const plano = E.movs.map(({ duplicados, _lineas, duplicadoInterno, ...resto }) => resto);
    localStorage.setItem(STORAGE_KEYS.importDraft, JSON.stringify({ ts: Date.now(), movs: plano }));
  } catch {}
}

function limpiarBorrador() {
  try { localStorage.removeItem(STORAGE_KEYS.importDraft); } catch {}
}

export function hayBorrador() {
  try { return !!JSON.parse(localStorage.getItem(STORAGE_KEYS.importDraft) || 'null')?.movs?.length; }
  catch { return false; }
}

function restaurarBorrador() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.importDraft) || 'null');
    if (!d?.movs?.length) return false;
    E.movs = anotarDuplicadosPreservando(d.movs);
    seq = Math.max(seq, d.movs.length);
    return true;
  } catch { return false; }
}

/* Al restaurar, se recalculan los duplicados contra los datos actuales pero
   se respeta lo que ya habías marcado. */
function anotarDuplicadosPreservando(movs) {
  const marcas = new Map(movs.map(m => [m.id, m.incluir]));
  anotarDuplicados(movs, S.allData);
  for (const m of movs) if (marcas.has(m.id)) m.incluir = marcas.get(m.id);
  return movs;
}

/* ── UI ── */
function mostrarPaso(paso) {
  for (const p of ['archivo', 'progreso', 'revision']) {
    $(`import-paso-${p}`)?.classList.toggle('hidden', p !== paso);
  }
  $('import-footer')?.classList.toggle('hidden', paso !== 'revision');
}

function progreso(texto, valor) {
  const t = $('import-progreso-texto'); if (t) t.textContent = texto;
  const b = $('import-progreso-barra');
  if (b) b.style.width = `${Math.round(Math.max(0, Math.min(1, valor ?? 0)) * 100)}%`;
}

export function abrirImportador() {
  if (S.userRole === 'viewer') return;
  $('import-overlay')?.classList.remove('hidden');
  document.body.classList.add('import-abierto');
  if (E.movs.length) { mostrarPaso('revision'); renderRevision(E.movs, E.filtro); }
  else if (restaurarBorrador()) { mostrarPaso('revision'); renderRevision(E.movs, E.filtro); toast('Retomé la importación pendiente'); }
  else mostrarPaso('archivo');
}

export async function cerrarImportador() {
  if (E.movs.some(m => m.incluir) && !await modalConfirm('Tenés filas marcadas sin importar. El borrador queda guardado. ¿Cerrar igual?')) return;
  $('import-overlay')?.classList.add('hidden');
  document.body.classList.remove('import-abierto');
}

export async function importarArchivos(files) {
  if (!files?.length || E.trabajando) return;
  E.trabajando = true;
  mostrarPaso('progreso');
  const forzado = $('import-origen')?.value || '';
  const nuevos = [];
  const origenes = new Set();

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pref = files.length > 1 ? `(${i + 1}/${files.length}) ` : '';
      const r = await procesarArchivo(file, forzado || null,
        (txt, v) => progreso(pref + txt, ((i + (v ?? 0)) / files.length)));
      origenes.add(r.origen);
      nuevos.push(...r.movimientos);
    }

    if (!nuevos.length) {
      toastWarn('No encontré movimientos en el archivo');
      mostrarPaso('archivo');
      return;
    }

    E.movs = preparar([...E.movs, ...nuevos]);
    E.filtro = 'todos';
    guardarBorrador();
    mostrarPaso('revision');
    renderRevision(E.movs, E.filtro);
    const nombres = [...origenes].map(o => ORIGENES[o] || o).join(', ');
    toast(`${nuevos.length} movimientos leídos de ${nombres}`);
  } catch (e) {
    toastError(e.message || 'No pude leer el archivo');
    mostrarPaso(E.movs.length ? 'revision' : 'archivo');
    if (E.movs.length) renderRevision(E.movs, E.filtro);
  } finally {
    E.trabajando = false;
    const inp = $('import-file'); if (inp) inp.value = '';
  }
}

/* ── Acciones de la revisión ── */
const buscar = id => E.movs.find(m => m.id === id);

export function setFiltro(f) { E.filtro = f; renderRevision(E.movs, E.filtro); }

export function toggleFila(id, valor) {
  const m = buscar(id); if (!m) return;
  m.incluir = valor;
  guardarBorrador();
  renderResumen(E.movs, E.filtro);
  document.querySelector(`.imp-fila[data-fid="${id}"]`)?.classList.toggle('imp-fila-on', valor);
}

export function editarCampo(id, campo, valor) {
  const m = buscar(id); if (!m) return;
  if (campo === 'importe') {
    const v = evalExpresion(valor);
    m.importe = Number.isFinite(v) ? v : safeNumber(valor);
  } else {
    m[campo] = valor;
  }
  if (campo === 'centro' && valor) m.confianza = 'alta';
  guardarBorrador();
  renderResumen(E.movs, E.filtro);
}

export function descartarFila(id) {
  const m = buscar(id); if (!m) return;
  m.estado = 'descartado';
  m.motivoDescarte = 'Descartado a mano';
  m.incluir = false;
  guardarBorrador();
  renderRevision(E.movs, E.filtro);
}

export function restaurarFila(id) {
  const m = buscar(id); if (!m) return;
  m.estado = m.duplicados?.length ? 'duplicado' : 'nuevo';
  m.motivoDescarte = null;
  m.incluir = true;
  guardarBorrador();
  renderRevision(E.movs, E.filtro);
}

export async function aprobarImportacion() {
  const marcados = E.movs.filter(m => m.incluir);
  if (!marcados.length) { toastWarn('No hay filas marcadas'); return; }
  const dups = marcados.filter(m => m.estado === 'duplicado').length;
  const aviso = dups
    ? `Vas a importar ${marcados.length} gastos, ${dups} marcados como posible duplicado. ¿Confirmás?`
    : `Vas a importar ${marcados.length} gastos. ¿Confirmás?`;
  if (!await modalConfirm(aviso)) return;

  showLoading(true);
  const btn = $('import-aprobar'); if (btn) btn.disabled = true;
  try {
    const { insertados, error } = await commitImportacion(E.movs);
    if (error) { toastError(error); return; }
    E.movs = E.movs.filter(m => !m.incluir);
    limpiarBorrador();
    if (E.movs.length) { guardarBorrador(); renderRevision(E.movs, E.filtro); }
    else { mostrarPaso('archivo'); $('import-overlay')?.classList.add('hidden'); document.body.classList.remove('import-abierto'); }
    toast(`${insertados} gasto${insertados === 1 ? '' : 's'} importado${insertados === 1 ? '' : 's'}`);
    await registry.cargarDatos?.();
  } catch (e) {
    toastError(e.message || 'Error al importar');
  } finally {
    showLoading(false);
    const b = $('import-aprobar'); if (b) b.disabled = false;
  }
}

export async function descartarTodo() {
  if (!await modalConfirm('¿Descartar toda la importación en curso?')) return;
  E.movs = [];
  limpiarBorrador();
  mostrarPaso('archivo');
  toast('Importación descartada');
}

/* Listener local del contenedor: edición inline de las filas. */
export function initImportador() {
  const cont = $('import-lista');
  if (!cont) return;
  const onEdit = (e) => {
    const el = e.target.closest('[data-imp]');
    if (!el) return;
    const { imp, fid } = el.dataset;
    if (imp === 'incluir') toggleFila(fid, el.checked);
    else editarCampo(fid, imp, el.value);
  };
  cont.addEventListener('change', onEdit);
  cont.addEventListener('input', (e) => {
    const el = e.target.closest('[data-imp]');
    if (el && el.tagName === 'INPUT' && el.type === 'text') onEdit(e);
  });

  $('import-file')?.addEventListener('change', (e) => importarArchivos(e.target.files));
}

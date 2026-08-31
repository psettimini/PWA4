/* ========================================
   IMPORTAR — Extracción de líneas de texto desde archivos
   parsers/fuentes.js — PDF con texto, PDF-imagen (OCR), imágenes y XLS
======================================== */
import { cargarPdfJs, cargarTesseract } from './libs.js';

/* Reconstruye líneas a partir de los ítems de texto de pdf.js:
   agrupa por coordenada Y y ordena por X, insertando espacios donde el
   salto horizontal es grande (así se preservan las columnas). */
function itemsALineas(items) {
  const filas = new Map();
  for (const it of items) {
    const txt = it.str;
    if (!txt || !txt.trim()) continue;
    const y = Math.round(it.transform[5]);
    const x = it.transform[4];
    const clave = Math.round(y / 3) * 3;
    if (!filas.has(clave)) filas.set(clave, []);
    filas.get(clave).push({ x, txt, w: it.width || 0 });
  }
  const ordenadas = [...filas.entries()].sort((a, b) => b[0] - a[0]);
  return ordenadas.map(([, cols]) => {
    cols.sort((a, b) => a.x - b.x);
    let linea = '', finAnterior = null;
    for (const c of cols) {
      if (finAnterior !== null) {
        const hueco = c.x - finAnterior;
        linea += hueco > 8 ? '   ' : (hueco > 1 ? ' ' : '');
      }
      linea += c.txt;
      finAnterior = c.x + c.w;
    }
    return linea.trim();
  }).filter(Boolean);
}

/* Devuelve { lineas, paginas, tieneTexto }. Si el PDF no trae capa de texto
   (los resúmenes de Macro son capturas envueltas en PDF) tieneTexto es false
   y hay que pasar por OCR. */
export async function leerPdf(arrayBuffer) {
  const pdfjsLib = await cargarPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const lineas = [];
  let chars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const ls = itemsALineas(content.items);
    for (const l of ls) chars += l.length;
    lineas.push(...ls);
  }
  return { doc, lineas, paginas: doc.numPages, tieneTexto: chars > 200 };
}

/* Renderiza una página del PDF a canvas. La escala apunta a ~400 dpi
   equivalentes, que es donde el OCR de estos resúmenes deja de fallar. */
export async function renderizarPagina(doc, nro, escala = 3.4) {
  const page = await doc.getPage(nro);
  const viewport = page.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  /* intent 'print' evita que pdf.js encadene el render con
     requestAnimationFrame: así no se frena cuando la pestaña queda en
     segundo plano, que es lo habitual mientras corre el OCR. */
  await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
  return canvas;
}

/* Parsea el TSV de tesseract a filas con palabras posicionadas.
   Las coordenadas son imprescindibles para los resúmenes de Macro, que
   separan pesos de dólares por columna y no por texto. */
function parsearTsv(tsv) {
  const filas = new Map();
  const lineas = String(tsv || '').split('\n');
  for (let i = 1; i < lineas.length; i++) {
    const c = lineas[i].split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const texto = c[11];
    if (!texto || !texto.trim()) continue;
    const x0 = Number(c[6]), ancho = Number(c[8]);
    const clave = `${c[2]}|${c[3]}|${c[4]}`;
    if (!filas.has(clave)) filas.set(clave, { texto: '', palabras: [], y: Number(c[7]) });
    const fila = filas.get(clave);
    fila.palabras.push({ texto, x0, x1: x0 + ancho, centro: x0 + ancho / 2 });
  }
  const out = [];
  for (const f of filas.values()) {
    f.palabras.sort((a, b) => a.x0 - b.x0);
    f.texto = f.palabras.map(p => p.texto).join(' ').replace(/\s+/g, ' ').trim();
    if (f.texto) out.push(f);
  }
  return out.sort((a, b) => a.y - b.y);
}

/* OCR sobre un canvas o un File de imagen.
   Devuelve { lineas, filas }: filas incluye la posición de cada palabra.
   onProgreso recibe 0..1. */
export async function ocr(fuente, onProgreso) {
  const Tesseract = await cargarTesseract();
  const { data } = await Tesseract.recognize(fuente, 'spa', {
    logger: m => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgreso?.(m.progress);
    }
  }, { text: true, tsv: true });

  const filas = data?.tsv ? parsearTsv(data.tsv) : [];
  if (filas.length) return { lineas: filas.map(f => f.texto), filas };

  const lineas = String(data?.text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return { lineas, filas: lineas.map(t => ({ texto: t, palabras: [] })) };
}

/* Extrae líneas de cualquier archivo soportado.
   onEstado(texto, progreso) informa el avance para la UI. */
export async function leerArchivo(file, onEstado) {
  const nombre = (file.name || '').toLowerCase();

  if (nombre.endsWith('.pdf')) {
    onEstado?.('Leyendo PDF…', 0);
    const buf = await file.arrayBuffer();
    const { doc, lineas, paginas, tieneTexto } = await leerPdf(buf);
    if (tieneTexto) return { lineas, filas: lineas.map(t => ({ texto: t, palabras: [] })), via: 'texto' };

    const todas = [];
    for (let i = 1; i <= paginas; i++) {
      onEstado?.(`Reconociendo texto (página ${i} de ${paginas})…`, (i - 1) / paginas);
      const canvas = await renderizarPagina(doc, i);
      const r = await ocr(canvas, p => onEstado?.(
        `Reconociendo texto (página ${i} de ${paginas})…`, (i - 1 + p) / paginas));
      todas.push(...r.filas);
    }
    return { lineas: todas.map(f => f.texto), filas: todas, via: 'ocr' };
  }

  if (/\.(png|jpe?g|webp|heic)$/.test(nombre)) {
    onEstado?.('Reconociendo texto de la imagen…', 0);
    const r = await ocr(file, p => onEstado?.('Reconociendo texto de la imagen…', p));
    return { lineas: r.lineas, filas: r.filas, via: 'ocr' };
  }

  throw new Error('Formato no soportado para lectura de texto');
}

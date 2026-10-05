/* ========================================
   STATE — Estado compartido, constantes, cliente Supabase
   state.js — Módulo base sin dependencias internas
======================================== */
export const SUPABASE_URL = 'https://vljwkvtivthwwerqxisc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsandrdnRpdnRod3dlcnF4aXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzIzNDMsImV4cCI6MjA4OTAwODM0M30.ETQt8mP2qeqWOUWSgqQc4t1DGP908ufTP-vZhaXHKy4';
/* Si se llega desde el link del mail de recuperación, hay que pedir la contraseña
   nueva antes de entrar. Se lee antes de crear el cliente, que limpia el hash. */
export const RECUPERACION = { activa: /type=recovery/.test(location.hash) };
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const S = {
  allData: [],        // vista: gastos aprobados del libro activo
  gastosTodos: [],     // todos los gastos visibles (todos los libros y estados)
  ingresosTodos: [],
  ingresos: [],        // vista: ingresos aprobados del libro activo
  libros: [],
  miembros: {},
  libroActivo: null,   // id de libro, 'hogar' o null (usuario sin hogar)
  modoCarga: 'gasto',  // 'gasto' | 'ingreso'
  editingTabla: 'gastos',
  charts: {},
  suggestionIndex: -1,
  patrones: [],
  editingId: null,
  currentTab: localStorage.getItem('gastos_tab') || 'carga',
  syncInProgress: false,
  dbCentros: [],
  dbMetodos: [],
  currentUserId: null,
  userRole: 'owner',
  viewerOf: null,
  formDirty: false,
  historialPage: 0,
  lastWindowWidth: window.innerWidth,
  dashboardMoneda: 'ARS',
  compararMoneda: 'ARS',
  presupuesto: [],
};

export const HISTORIAL_PAGE_SIZE = 50;
export const APP_VERSION = '3.2.3';
export const MONEDAS = ['ARS', 'USD'];
export const MONEDA_DEFAULT = 'ARS';
export const STORAGE_KEYS = {
  dark: 'gastos_dark',
  dataCache: 'gastos_data_cache_v5',
  cacheMeta: 'gastos_data_cache_meta_v5',
  ingresosCache: 'gastos_ingresos_cache_v1',
  hogarCache: 'gastos_hogar_cache_v1',
  libroActivo: 'gastos_libro_activo_v1',
  pendingQueue: 'gastos_pending_queue_v3',
  historyFilters: 'gastos_historial_filters_v2',
  dismissals: 'gastos_fijos_dismissed_v1',
  importDraft: 'gastos_import_draft_v1',
  presupuestoCache: 'gastos_presupuesto_cache_v1'
};

export const $ = id => document.getElementById(id);

/* Registry: resuelve dependencias circulares entre módulos.
   app.js popula estas funciones después de importar todos los módulos. */
export const registry = {
  cargarDatos: null,
  refreshUI: null,
  renderHistorial: null,
  onTabChange: null,
  showTab: null,
  renderPresupuesto: null,
  renderBandeja: null,
};

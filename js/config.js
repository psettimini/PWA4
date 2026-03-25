/* ========================================
   CONFIGURACIÓN Y ESTADO GLOBAL
   config.js — Se carga primero
======================================== */
const SUPABASE_URL = 'https://vljwkvtivthwwerqxisc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsandrdnRpdnRod3dlcnF4aXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzIzNDMsImV4cCI6MjA4OTAwODM0M30.ETQt8mP2qeqWOUWSgqQc4t1DGP908ufTP-vZhaXHKy4';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* Estado global mutable */
let allData = [];
let charts = {};
let suggestionIndex = -1;
let patrones = [];
let editingId = null;
let currentTab = localStorage.getItem('gastos_tab') || 'carga';
let syncInProgress = false;
let dbCentros = [];
let dbMetodos = [];
let currentUserId = null;

const STORAGE_KEYS = {
  dark: 'gastos_dark',
  dataCache: 'gastos_data_cache_v3',
  cacheMeta: 'gastos_data_cache_meta_v3',
  pendingQueue: 'gastos_pending_queue_v2',
  historyFilters: 'gastos_historial_filters_v1'
};

const APP_VERSION = '2.1.0';
const $ = id => document.getElementById(id);

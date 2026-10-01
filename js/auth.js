/* ========================================
   AUTH — Login, Registro, Reset, Logout, Perfil
   auth.js
======================================== */
import { $, S, sb, STORAGE_KEYS, registry } from './state.js';
import { modalConfirm } from './ui.js';
import { resetHogar } from './hogar.js';

/* ── Captcha (Cloudflare Turnstile) ──
   Supabase Auth lo exige en login, registro y reset cuando está activado en el
   proyecto. Un solo widget abajo de los tres formularios; cada token sirve una vez,
   así que se pide uno nuevo después de cada intento. */
const TURNSTILE_SITEKEY = '0x4AAAAAAFLIXghjiBqpw4gR';
let captchaToken = '';
let captchaWidget = null;

function renderCaptcha() {
  if (captchaWidget !== null) return;
  const draw = () => {
    if (captchaWidget !== null || !window.turnstile) return;
    const box = document.createElement('div');
    box.id = 'auth-captcha';
    box.className = 'flex justify-center mt-4';
    $('auth-error').before(box);
    captchaWidget = window.turnstile.render(box, {
      sitekey: TURNSTILE_SITEKEY,
      language: 'es',
      callback: (t) => { captchaToken = t; },
      'expired-callback': () => { captchaToken = ''; },
      'error-callback': () => { captchaToken = ''; },
    });
  };
  if (window.turnstile) { draw(); return; }
  if (document.getElementById('turnstile-script')) return;
  const s = document.createElement('script');
  s.id = 'turnstile-script';
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = draw;
  document.head.appendChild(s);
}

function resetCaptcha() {
  captchaToken = '';
  if (captchaWidget !== null && window.turnstile) window.turnstile.reset(captchaWidget);
}

/** Token para Supabase, o null (con el error ya mostrado) si todavía no se verificó. */
function takeCaptcha() {
  if (!captchaToken) { showAuthError('Esperá a que termine la verificación de seguridad'); return null; }
  return captchaToken;
}

const CAPTCHA_ERROR = 'No se pudo verificar que seas una persona. Probá de nuevo.';
const isCaptchaError = (e) => /captcha/i.test(e?.message || '');

export function showAuth() { $('auth-overlay').classList.remove('hidden'); showAuthMode('login'); renderCaptcha(); }
export function hideAuth() { $('auth-overlay').classList.add('hidden'); $('auth-error').classList.add('hidden'); $('auth-success').classList.add('hidden'); }

export function showAuthMode(mode) {
  $('auth-form-login').classList.toggle('hidden', mode !== 'login');
  $('auth-form-register').classList.toggle('hidden', mode !== 'register');
  $('auth-form-reset').classList.toggle('hidden', mode !== 'reset');
  $('auth-error').classList.add('hidden'); $('auth-success').classList.add('hidden');
  const subtitles = { login: 'Iniciá sesión para continuar', register: 'Creá tu cuenta gratis', reset: 'Recuperá tu contraseña' };
  $('auth-subtitle').textContent = subtitles[mode] || '';
}

function showAuthError(msg) { const el = $('auth-error'); el.textContent = msg; el.classList.remove('hidden'); $('auth-success').classList.add('hidden'); }
function showAuthSuccess(msg) { const el = $('auth-success'); el.textContent = msg; el.classList.remove('hidden'); $('auth-error').classList.add('hidden'); }

export async function doLogin() {
  const email = $('auth-email').value.trim(), password = $('auth-password').value;
  if (!email || !password) { showAuthError('Completá email y contraseña'); return; }
  const token = takeCaptcha(); if (!token) return;
  const btn = $('btn-login');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Ingresando...';
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken: token } });
    if (error) throw error;
  } catch (e) {
    const msgs = { 'Invalid login credentials': 'Email o contraseña incorrectos', 'Email not confirmed': 'Revisá tu email para confirmar la cuenta' };
    showAuthError(isCaptchaError(e) ? CAPTCHA_ERROR : msgs[e.message] || e.message);
  } finally { resetCaptcha(); btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Iniciar sesión'; }
}

export async function doRegister() {
  const email = $('auth-reg-email').value.trim(), password = $('auth-reg-password').value;
  if (!email || !password) { showAuthError('Completá email y contraseña'); return; }
  if (password.length < 6) { showAuthError('La contraseña debe tener al menos 6 caracteres'); return; }
  const token = takeCaptcha(); if (!token) return;
  const btn = $('btn-register');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Creando cuenta...';
  try {
    const { error } = await sb.auth.signUp({ email, password, options: { captchaToken: token } });
    if (error) throw error;
    showAuthMode('login'); showAuthSuccess('¡Cuenta creada! Revisá tu email para confirmar.');
  } catch (e) {
    const msgs = { 'User already registered': 'Ya existe una cuenta con ese email' };
    showAuthError(isCaptchaError(e) ? CAPTCHA_ERROR : msgs[e.message] || e.message);
  } finally { resetCaptcha(); btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Crear cuenta gratis'; }
}

export async function doResetPassword() {
  const email = $('auth-reset-email').value.trim();
  if (!email) { showAuthError('Ingresá tu email'); return; }
  const token = takeCaptcha(); if (!token) return;
  try { const { error } = await sb.auth.resetPasswordForEmail(email, { captchaToken: token }); if (error) throw error; showAuthSuccess('¡Listo! Revisá tu email para restablecer tu contraseña.'); }
  catch (e) { showAuthError(isCaptchaError(e) ? CAPTCHA_ERROR : e.message); }
  finally { resetCaptcha(); }
}

export async function doLogout() {
  if (!await modalConfirm('¿Cerrar sesión?')) return;
  await sb.auth.signOut();
  S.allData = []; S.dbCentros = []; S.dbMetodos = []; S.currentUserId = null;
  S.userRole = 'owner'; S.viewerOf = null;
  document.body.classList.remove('is-viewer');
  localStorage.removeItem(STORAGE_KEYS.dataCache);
  localStorage.removeItem(STORAGE_KEYS.cacheMeta);
  localStorage.removeItem(STORAGE_KEYS.pendingQueue);
  localStorage.removeItem(STORAGE_KEYS.ingresosCache);
  resetHogar();
  showAuth();
}

/* ── Perfil del usuario actual ──
   Determina si el usuario es 'owner' o 'viewer' (consulta).
   Los 'viewer' ven los datos del owner referenciado por viewer_of, sin poder modificar nada. */
export async function loadUserProfile() {
  if (!S.currentUserId) return;
  try {
    const { data, error } = await sb.from('profiles')
      .select('role, viewer_of')
      .eq('id', S.currentUserId)
      .single();
    if (error || !data) {
      S.userRole = 'owner';
      S.viewerOf = null;
      return;
    }
    S.userRole = data.role || 'owner';
    S.viewerOf = data.viewer_of || null;
  } catch {
    S.userRole = 'owner';
    S.viewerOf = null;
  }
}

/* ── Aplica el modo viewer en la UI ──
   Agrega/quita la clase 'is-viewer' al body. El CSS oculta todo lo marcado .owner-only.
   Si la tab actual era 'carga', redirige a 'historial'. */
export function applyRoleUI() {
  const isViewer = S.userRole === 'viewer';
  document.body.classList.toggle('is-viewer', isViewer);
  if (isViewer && S.currentTab === 'carga') {
    registry.showTab?.('historial');
  }
}

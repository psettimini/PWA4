/* ========================================
   AUTH — Login, Registro, Reset, Logout
   auth.js
======================================== */
import { $, S, sb, STORAGE_KEYS } from './state.js';
import { modalConfirm } from './ui.js';

export function showAuth() { $('auth-overlay').classList.remove('hidden'); showAuthMode('login'); }
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
  const btn = $('btn-login');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Ingresando...';
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (e) {
    const msgs = { 'Invalid login credentials': 'Email o contraseña incorrectos', 'Email not confirmed': 'Revisá tu email para confirmar la cuenta' };
    showAuthError(msgs[e.message] || e.message);
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Iniciar sesión'; }
}

export async function doRegister() {
  const email = $('auth-reg-email').value.trim(), password = $('auth-reg-password').value;
  if (!email || !password) { showAuthError('Completá email y contraseña'); return; }
  if (password.length < 6) { showAuthError('La contraseña debe tener al menos 6 caracteres'); return; }
  const btn = $('btn-register');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Creando cuenta...';
  try {
    const { error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    showAuthSuccess('¡Cuenta creada! Revisá tu email para confirmar.'); showAuthMode('login');
  } catch (e) {
    const msgs = { 'User already registered': 'Ya existe una cuenta con ese email' };
    showAuthError(msgs[e.message] || e.message);
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Crear cuenta gratis'; }
}

export async function doResetPassword() {
  const email = $('auth-reset-email').value.trim();
  if (!email) { showAuthError('Ingresá tu email'); return; }
  try { const { error } = await sb.auth.resetPasswordForEmail(email); if (error) throw error; showAuthSuccess('¡Listo! Revisá tu email para restablecer tu contraseña.'); }
  catch (e) { showAuthError(e.message); }
}

export async function doLogout() {
  if (!await modalConfirm('¿Cerrar sesión?')) return;
  await sb.auth.signOut();
  S.allData = []; S.dbCentros = []; S.dbMetodos = []; S.currentUserId = null;
  localStorage.removeItem(STORAGE_KEYS.dataCache);
  localStorage.removeItem(STORAGE_KEYS.cacheMeta);
  localStorage.removeItem(STORAGE_KEYS.pendingQueue);
  showAuth();
}

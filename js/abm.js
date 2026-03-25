/* ========================================
   ABM — Centros de Gasto y Métodos de Pago
   abm.js
======================================== */

function getAllValuesForField(field) {
  const fromData = uniqueSorted(allData.map(g => g[field]).filter(Boolean));
  if (field === 'Centro') return uniqueSorted([...new Set([...fromData, ...dbCentros])]);
  if (field === 'Metodo') return uniqueSorted([...new Set([...fromData, ...dbMetodos])]);
  return fromData;
}

function getStatsForField(field) {
  const st = Object.create(null);
  for (const g of allData) {
    const v = g[field] || ''; if (!v) continue;
    if (!st[v]) st[v] = { n: 0, t: 0 };
    st[v].n++; st[v].t += safeNumber(g.Importe);
  }
  return st;
}

function renderABM() { renderABMList('Centro'); renderABMList('Metodo'); }

function renderABMList(field) {
  const containerId = field === 'Centro' ? 'abm-centros-list' : 'abm-metodos-list';
  const container = $(containerId); if (!container) return;
  const values = getAllValuesForField(field), stats = getStatsForField(field);
  if (!values.length) { container.innerHTML = '<p class="text-sm italic" style="color:var(--text4)">Sin datos aún</p>'; return; }

  container.innerHTML = values.map(v => {
    const s = stats[v];
    const countText = s ? `${s.n} reg. · $${formatearNumero(s.t)}` : 'Sin registros';
    return `<div class="flex items-center gap-2 p-3 rounded-lg border" style="border-color:var(--border-solid);background:var(--kpi-bg)">
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate" style="color:var(--text)">${escapeHtml(v)}</div>
        <div class="text-xs ${s?'':'italic'}" style="color:var(--text3)">${countText}</div>
      </div>
      <button onclick="abmRename('${field}','${escapeAttr(v)}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50" title="Renombrar"><i class="fas fa-pen text-xs"></i></button>
      <button onclick="abmMerge('${field}','${escapeAttr(v)}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50" title="Fusionar"><i class="fas fa-compress-alt text-xs"></i></button>
      ${!s ? `<button onclick="abmRemoveCustom('${field}','${escapeAttr(v)}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Eliminar"><i class="fas fa-trash text-xs"></i></button>` : ''}
    </div>`;
  }).join('');
  if (field === 'Metodo') updateMetodoSelect();
}

function updateMetodoSelect() {
  const sel = $('metodo'); if (!sel) return;
  const current = sel.value, values = getAllValuesForField('Metodo');
  sel.innerHTML = values.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
  if (current && values.includes(current)) sel.value = current;
}

async function abmAdd(field) {
  const inputId = field === 'Centro' ? 'abm-centro-nuevo' : 'abm-metodo-nuevo';
  const input = $(inputId), name = (input?.value || '').trim();
  if (!name) { toastWarn('Ingresá un nombre'); return; }
  if (getAllValuesForField(field).some(v => v.toLowerCase() === name.toLowerCase())) { toastWarn('Ya existe'); return; }
  const table = field === 'Centro' ? 'centros' : 'metodos_pago';
  showLoading(true);
  try {
    const { error } = await sb.from(table).insert({ user_id: currentUserId, nombre: name });
    if (error) throw error;
    input.value = '';
    if (field === 'Centro') await loadCentrosFromDB(); else await loadMetodosFromDB();
    toast(`${field === 'Centro' ? 'Centro' : 'Método'} agregado`);
    renderABMList(field);
    if (field === 'Centro') $('centros-list').innerHTML = getAllValuesForField('Centro').map(c=>`<option value="${escapeAttr(c)}">`).join('');
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

async function abmRemoveCustom(field, value) {
  const table = field === 'Centro' ? 'centros' : 'metodos_pago';
  showLoading(true);
  try {
    const { error } = await sb.from(table).delete().eq('nombre', value);
    if (error) throw error;
    if (field === 'Centro') await loadCentrosFromDB(); else await loadMetodosFromDB();
    toast('Eliminado'); renderABMList(field);
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

async function abmRename(field, oldValue) {
  const label = field === 'Centro' ? 'centro' : 'método';
  const newValue = prompt(`Renombrar "${oldValue}"\nNuevo nombre para este ${label}:`, oldValue);
  if (!newValue || !newValue.trim() || newValue.trim() === oldValue) return;
  const stats = getStatsForField(field), count = stats[oldValue]?.n || 0;
  if (count > 0 && !await modalConfirm(`Se van a actualizar ${count} registros de "${oldValue}" a "${newValue.trim()}". ¿Continuar?`)) return;
  showLoading(true);
  try {
    if (count > 0) {
      const p_field = field === 'Centro' ? 'centro' : 'metodo';
      const { data, error } = await sb.rpc('bulk_rename', { p_field, p_old_value: oldValue, p_new_value: newValue.trim() });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast(`${data?.count || count} registros actualizados`);
    }
    const table = field === 'Centro' ? 'centros' : 'metodos_pago';
    await sb.from(table).update({ nombre: newValue.trim() }).eq('nombre', oldValue);
    if (field === 'Centro') await loadCentrosFromDB(); else await loadMetodosFromDB();
    await cargarDatos();
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

async function abmMerge(field, sourceValue) {
  const label = field === 'Centro' ? 'centro' : 'método';
  const values = getAllValuesForField(field).filter(v => v !== sourceValue);
  if (!values.length) { toastWarn('No hay otro valor para fusionar'); return; }
  const targetValue = prompt(`Fusionar "${sourceValue}" → ¿a cuál ${label}?\n\nOpciones existentes:\n${values.join('\n')}\n\nEscribí el nombre exacto del destino:`);
  if (!targetValue || !targetValue.trim()) return;
  const stats = getStatsForField(field), count = stats[sourceValue]?.n || 0;
  if (count === 0) { toastWarn('No hay registros para fusionar'); return; }
  if (!await modalConfirm(`Fusionar ${count} registros de "${sourceValue}" → "${targetValue.trim()}". ¿Continuar?`)) return;
  showLoading(true);
  try {
    const p_field = field === 'Centro' ? 'centro' : 'metodo';
    const { data, error } = await sb.rpc('bulk_rename', { p_field, p_old_value: sourceValue, p_new_value: targetValue.trim() });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast(`${data?.count || count} registros fusionados`);
    const table = field === 'Centro' ? 'centros' : 'metodos_pago';
    await sb.from(table).delete().eq('nombre', sourceValue);
    if (field === 'Centro') await loadCentrosFromDB(); else await loadMetodosFromDB();
    await cargarDatos();
  } catch (e) { toastError(e.message); }
  finally { showLoading(false); }
}

/* CWBridge console: pages/domain-detail. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, fetchState, state } from '../core.js';
import { checkBox, confirmDialog, customSelect, emptyState, h, icon, openDialog, setPopText, toast, actionMenu } from '../ui.js';
import { handleUnauthorized } from '../auth.js';
import { renderApp, updateBridgeButtons } from '../shell.js';
import { newOverviewState } from './overview.js';
import { newUsageState } from './usage.js';
import { backupPolicyCopy } from './settings.js';
import { navigate, readRoute } from '../router.js';
import { applyLive, applySaved, confirmApply, diagnose, diagnosisButton, liveApply } from '../operations.js';
import { renderDomainWizard, wizardSteps, reviewChanges, openPlayground, errorHelp, serviceIcon, SERVICE_NAMES, statusBadge } from '../workflows.js';

async function submitDomain({ domain, owners, services, storage_mb, max_requests_per_day, max_output_tokens, allowed_models, system_prompt, service_limits, isEdit, err, limitsOnly = false, editDraft = null, apply = false }) {
  const value = String(domain || '').trim();
  if (!value) { if (err) err.textContent = 'Enter a domain name.'; return; }
  const body = { domain: value, owner_ids: (owners || []).map(part => String(part).trim()).filter(Boolean), services: services || [], storage_mb,
    max_requests_per_day, max_output_tokens, allowed_models, system_prompt: system_prompt || '',
    service_limits: service_limits || null };
  try {
    const baseline = state.domains.find(d => d.domain === value) || {};
    const previous = { ...baseline, service_limits: Object.fromEntries(Object.keys(service_limits || {}).map(k => [k, baseline[k] ?? null])) };
    if (!(await reviewChanges(previous, body, apply))) return;
    await api(isEdit ? API.domainUpd : API.domainAdd, { method: 'POST', body });
    // A running bridge with live reload takes the change at once (applyLive
    // says what it did); otherwise the save waits for the next apply.
    const live = !apply && liveApply();
    if (!live) toast(limitsOnly ? 'Domain limits saved. Apply to activate them.' : isEdit ? 'Domain updated' : 'Domain added');
    if (limitsOnly) {
      if (state.limitsEdit === editDraft) state.limitsEdit = null;
      if (state.domainEdit?.domain === value) state.domainEdit = null;
    } else {
      state.domainEdit = null;
      if (state.limitsEdit?.domain === value) state.limitsEdit = null;
    }
    await fetchState();
    if (apply) await applySaved(true);
    else if (live) await applyLive();
    const route = readRoute();
    if (!limitsOnly && state.view === 'app' && route?.tab === 'domains'
        && (route.domain === value || route.addDomain)) navigate('domains', { replace: true });
    else if (state.view === 'app') renderApp();
  } catch (e) {
    if (e instanceof UnauthorizedError) handleUnauthorized();
    else {
      if (editDraft) editDraft.saveError = e.message;
      if (err) err.textContent = e.message;
    }
  }
}

function resetDomainDatastore(domain) {
  return confirmDialog({
    title: 'Delete datastore contents',
    message: 'This permanently deletes every key stored in the domain\u2019s datastore. Domain settings, limits and the GenAI counter are kept. This cannot be undone.',
    confirmLabel: 'Delete all data',
    destructive: true,
    requireText: domain,
  });
}

function resetDomainGenai(domain) {
  return confirmDialog({
    title: 'Reset GenAI daily counter',
    message: 'This clears today\u2019s used/reserved GenAI request count for this domain. The configured limits themselves are not changed. This cannot be undone.',
    confirmLabel: 'Reset counter',
    destructive: true,
    requireText: domain,
  });
}

async function runDomainReset(route, domain, confirm, errEl) {
  try {
    await api(route, { method: 'POST', body: { domain, confirmation: domain } });
    toast('Done');
    await fetchState();
    renderApp();
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) handleUnauthorized();
    else if (errEl) errEl.textContent = err.message;
    return false;
  }
}

const DOMAIN_DELETE_WARNING = 'Permanently deletes this domain’s registration, owners, services, settings and limits, every stored key and document (including GenAI counters and activity), all backups, and all usage history. No recovery backup is kept. This cannot be undone.';

/* A running bridge can only let go of a domain when it reloads live: it closes
 * the tab and stops serving the domain before the data is deleted. */
function domainDeleteBlocked() {
  return state.busy.bridge || (state.status?.running && !liveApply());
}

function domainDeleteNote() {
  return state.status?.running
    ? (liveApply() ? ' The running bridge closes its tab first.' : ' Stop the bridge first; it will not be stopped automatically.')
    : '';
}

async function removeDomain(domain, errEl) {
  if (state.busy.domainRemove) return;
  const showError = message => { if (errEl?.isConnected) errEl.textContent = message; else toast(message, 'err'); };
  if (domainDeleteBlocked()) { showError('Stop the bridge before permanently deleting a domain.'); return; }
  state.busy.domainRemove = true;
  if (errEl) errEl.textContent = '';
  try {
    const ok = await confirmDialog({
      title: 'Delete domain permanently', message: DOMAIN_DELETE_WARNING + domainDeleteNote(),
      confirmLabel: 'Delete domain permanently', destructive: true, requireText: domain,
    });
    if (!ok) return;
    if (domainDeleteBlocked()) { showError('Stop the bridge before permanently deleting a domain.'); return; }
    updateBridgeButtons();
    await api(API.domainRem, { method: 'POST', body: { domain, confirmation: domain } });
    // Replace cache identities too: pre-delete requests must never repopulate them.
    if (state.domainEdit?.domain === domain) state.domainEdit = null;
    if (state.limitsEdit?.domain === domain) state.limitsEdit = null;
    if (state.limitsDomain === domain) state.limitsDomain = '';
    state.domains = state.domains.filter(entry => entry.domain !== domain);
    state.usage = newUsageState();
    state.overview = newOverviewState();
    toast('Domain permanently deleted');
    if (readRoute()?.domain === domain) navigate('domains', { replace: true });
    else renderApp();
    document.querySelector('.main')?.focus({ preventScroll: true });
    await fetchState();
    if (state.view === 'app') renderApp();
  } catch (err) {
    if (err instanceof UnauthorizedError) handleUnauthorized();
    else showError(err.message);
  } finally {
    state.busy.domainRemove = false;
    updateBridgeButtons();
  }
}

/* ---- Domain edit page ------------------------------------------------- */
/* A domain is edited through sub-pages, not one long frame: the shell shows
 * this list in the sidebar and renders exactly one section into <main>. The
 * draft itself is one object (state.domainEdit / state.limitsEdit), so moving
 * between sections never loses an edit. */
/* Every entry is a real, routable sub-page. Nothing here may be decoration:
 * a decorative entry would be drawn in the sidebar without being reachable. */
const DOMAIN_SECTIONS = [
  { id: 'services', label: 'Services & limits' },
  { id: 'activity', label: 'Activity' },
  { id: 'backups', label: 'Backups' },
  { id: 'danger', label: 'Danger zone' },
];
const DOMAIN_SECTIONS_NEW = [{ id: 'services', label: 'Services & limits' }];

function domainSections(mode = 'edit') {
  return mode === 'add' ? DOMAIN_SECTIONS_NEW : DOMAIN_SECTIONS;
}

/* Unsaved state of a domain draft. Kept as text-vs-server comparison because
 * the form fields are raw strings until submit. */
function domainEditDirty(d) {
  if (!d) return false;
  if (d.mode === 'add') return true;
  const entry = state.domains.find(row => row.domain === d.domain);
  if (!entry) return false;
  const original = domainEditFromEntry('edit', entry);
  return ['ownerText', 'storageText', 'quotaText', 'tokensText', 'modelsText', 'systemPromptText']
    .some(key => d[key] !== original[key])
    || JSON.stringify(d.serviceLimitText) !== JSON.stringify(original.serviceLimitText)
    || [...d.services].sort().join(',') !== [...original.services].sort().join(',');
}

/* A service row in Settings points at the domain that owns the limits. */
function openDomainService(service) {
  state.settingsService = service;
  const draft = state.domainEdit?.mode === 'edit' ? state.domainEdit : null;
  const domain = draft && draft.domain === state.limitsDomain ? draft.domain : state.limitsDomain;
  navigate('domains', { domain: domain || state.limitsDomain, section: 'services' });
}

const SERVICE_LIMIT_LABELS = {
  webhook_requests_per_day: 'Webhook requests per day',
  fetch_requests_per_day: 'Fetch requests per day',
  weather_requests_per_day: 'Weather requests per day',
  translate_requests_per_day: 'Translate requests per day',
  qr_requests_per_day: 'QR code requests per day',
  playerinfo_requests_per_day: 'Player info requests per day',
  datastore_requests_per_day: 'Datastore requests per day',
};

function domainEditFromEntry(mode, entry = {}) {
  return {
    mode, domain: entry.domain || '',
    activity: { items: null, loading: false, error: null, request: 0, service: '' },
    backups: { items: null, loading: false, error: null, request: 0, busy: false, actionError: null },
    ownerText: (entry.owner_ids || []).join(', '),
    services: new Set(entry.services === 'all' ? state.services : Array.isArray(entry.services) ? entry.services : String(entry.services || '').split(',').map(s => s.trim()).filter(Boolean)),
    storageText: String(entry.storage_mb ?? 1024),
    quotaText: String(entry.max_requests_per_day ?? ''),
    tokensText: String(entry.max_output_tokens ?? ''),
    modelsText: (entry.allowed_models || []).join(', '),
    systemPromptText: String(entry.system_prompt || ''),
    serviceLimitText: Object.fromEntries(Object.keys(SERVICE_LIMIT_LABELS).map(key => [key, entry[key] == null ? '' : String(entry[key])])),
    saving: false,
    saveError: '',
  };
}

// Decimal arithmetic is exact: never round a fractional MB into a valid limit.
function parseStorageMB(text) {
  const match = String(text).trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(MB|GB|TB)?$/i);
  if (!match) return NaN;
  const [whole, fraction = ''] = match[1].split('.');
  const scale = 10n ** BigInt(fraction.length);
  const units = { MB: 1n, GB: 1024n, TB: 1048576n };
  const mb = BigInt((whole || '0') + fraction) * units[(match[2] || 'MB').toUpperCase()];
  if (mb % scale !== 0n) return NaN;
  const value = Number(mb / scale);
  return value >= 1 && value <= 1048576 ? value : NaN;
}

// Global limits draft: blank means unlimited (null); valid numbers pass through.
function parseGlobalLimit(text, maximum) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  return /^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= maximum ? Number(raw) : NaN;
}

function parseDomainLimit(text) {
  const value = text.trim();
  if (!value) return null;
  const n = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(n) && n >= 1 && n <= 1000000 ? n : NaN;
}

function closeDomainEdit() {
  state.domainEdit = null;
  state.domainSection = 'services';
  state.settingsService = null;
  navigate('domains');
}

// History belongs to this edit draft, never to a global domain-name cache. A
// response from a closed/reopened edit page cannot replace the new page's data.
function currentDomainEdit(d) {
  return state.view === 'app' && state.domainEdit === d;
}

async function loadDomainHistory(d, kind) {
  if (!currentDomainEdit(d)) return;
  const data = d[kind];
  const request = ++data.request;
  data.loading = true;
  data.error = null;
  refreshDomainHistory(d, kind);
  try {
    const response = await api(kind === 'activity' ? API.domainActivity : API.domainBackups, {
      method: 'POST', body: kind === 'activity' ? { domain: d.domain, limit: 100 } : { domain: d.domain },
    });
    if (!currentDomainEdit(d) || request !== data.request) return;
    if (!Array.isArray(response.items)) throw new Error('The server returned an invalid list. Refresh to try again.');
    data.items = response.items.filter(item => item && typeof item === 'object');
  } catch (err) {
    if (!currentDomainEdit(d) || request !== data.request) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    data.error = err.message;
  } finally {
    if (request === data.request) data.loading = false;
    if (currentDomainEdit(d)) refreshDomainHistory(d, kind);
  }
}

function refreshDomainHistory(d, kind) {
  if (!currentDomainEdit(d) || state.tab !== 'domains') return;
  const panel = document.getElementById('de-' + kind);
  if (panel) panel.replaceWith(domainHistoryPanel(d, kind));
}

function historyTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function backupSize(value) {
  const bytes = Number(value);
  if (value == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renameBackupDialog(backup) {
  return new Promise(resolve => {
    let input;
    const dlg = openDialog({
      title: 'Rename backup', iconName: 'pencil',
      onClose() { resolve(null); },
      buildBody(body) {
        input = h('input', { class: 'input', id: 'backup-name', value: backup.name || '', autocomplete: 'off', maxlength: '100' });
        body.append(h('div', { class: 'field' }, h('label', { for: 'backup-name', text: 'Backup name' }), input));
        input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
      },
      actions: [{ label: 'Cancel' }, { label: 'Rename backup', kind: 'primary', onClick(close) {
        if (!input.value.trim()) return;
        resolve(input.value.trim()); close();
      } }],
    });
    const save = dlg.dialog.querySelector('.dialog-actions .btn:last-child');
    save.disabled = !input.value.trim();
    input.focus(); input.select();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!save.disabled) save.click(); } });
  });
}

async function backupAction(d, action, backup) {
  const data = d.backups;
  if (!currentDomainEdit(d) || data.busy) return;
  data.busy = true;
  data.actionError = null;
  // Keep the trigger mounted while the dialog is open so Cancel restores focus.
  const body = { domain: d.domain };
  let submitted = false;
  try {
    if (backup) body.backup_id = backup.id;
    if (action === 'retain') {
      if (backup.retained && !(await confirmDialog({ title: 'Release permanent backup',
        message: 'This backup will be subject to the count cap and its original 72-hour expiry. It may be removed immediately.', confirmLabel: 'Release' }))) return;
      body.retained = !backup.retained;
    }
    if (action === 'rename') {
      const name = await renameBackupDialog(backup);
      if (name === null) return;
      body.name = name;
    } else if (action === 'restore' || action === 'delete') {
      const restore = action === 'restore';
      const confirmed = await confirmDialog({
        title: restore ? 'Restore backup' : 'Delete backup',
        message: restore
          ? 'Restore “' + backup.name + '” for ' + d.domain + '? This replaces the saved domain data. The bridge must be stopped first; it will not be stopped automatically. Unsaved form changes are not saved.'
          : 'Permanently delete “' + backup.name + '” for ' + d.domain + '? This backup cannot be recovered.',
        confirmLabel: restore ? 'Restore backup' : 'Delete backup', destructive: true, requireText: d.domain,
      });
      if (!confirmed) return;
      body.confirmation = d.domain;
    }
    if (!currentDomainEdit(d)) return;
    submitted = true;
    refreshDomainHistory(d, 'backups');
    const routes = { retain: API.domainBackupRetain, create: API.domainBackupCreate, rename: API.domainBackupRename, restore: API.domainBackupRestore, delete: API.domainBackupDelete };
    await api(routes[action], { method: 'POST', body });
    if (!currentDomainEdit(d)) return;
    toast({ retain: body.retained ? 'Backup kept permanently' : 'Backup retention released', create: 'Backup created', rename: 'Backup renamed', restore: 'Backup restored. Unsaved form changes are kept.', delete: 'Backup deleted' }[action]);
    await Promise.all([loadDomainHistory(d, 'backups'), loadDomainHistory(d, 'activity')]);
  } catch (err) {
    if (!currentDomainEdit(d)) return;
    if (err instanceof UnauthorizedError) handleUnauthorized();
    else data.actionError = err.message;
  } finally {
    data.busy = false;
    if (submitted && currentDomainEdit(d)) refreshDomainHistory(d, 'backups');
  }
}

function domainHistoryPanel(d, kind) {
  const activity = kind === 'activity';
  const data = d[kind];
  const title = activity ? 'Activity' : 'Backups';
  const refresh = h('button', { class: 'btn sm', type: 'button', disabled: data.loading || data.busy,
    'aria-busy': String(data.loading), 'aria-label': 'Refresh ' + kind }, icon('refresh-cw'), 'Refresh');
  refresh.addEventListener('click', () => loadDomainHistory(d, kind));
  const head = h('div', { class: 'panel-head' }, h('h3', { id: 'de-' + kind + '-title', text: title }), h('span', { class: 'grow' }));
  if (activity) {
    head.append(h('button', { class: 'btn sm', type: 'button', onclick: () => openPlayground(data.service || 'info', d.domain) }, 'Try service'));
    const services = [...new Set([...state.services, ...(data.items || []).map(item => String(item.service || '')), data.service])].filter(Boolean).sort();
    const filter = customSelect({ value: data.service, ariaLabel: 'Activity service filter',
      options: [{ value: '', label: 'All services' }, ...services.map(service => ({ value: service, label: service }))],
      onChange(service) { data.service = service; refreshDomainHistory(d, kind); document.querySelector('#de-activity .k-select-trigger')?.focus({ preventScroll: true }); },
    });
    head.append(filter);
  } else {
    const create = h('button', { class: 'btn primary sm', type: 'button', disabled: data.busy || data.loading }, icon('plus'), 'Create backup');
    create.addEventListener('click', () => backupAction(d, 'create'));
    head.append(create);
  }
  head.append(refresh);
  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(data.loading || !!data.busy) });
  body.append(h('p', { class: 'history-note', text: activity
    ? 'Latest 100 operations. Times are local. Request contents and credentials are not shown.'
    : backupPolicyCopy() + ' Stop the bridge before restoring.' }));
  if (data.loading || data.busy) body.append(h('div', { class: 'history-message', role: 'status', text: data.busy ? 'Backup action in progress …' : 'Loading ' + kind + ' …' }));
  if (data.error) body.append(h('div', { class: 'history-message error-text', role: 'alert', text: data.error + (data.items ? ' Showing the last loaded list.' : ' Use Refresh to try again.') }));
  if (data.actionError) body.append(h('div', { class: 'history-message error-text', role: 'alert', text: data.actionError }));
  const items = (data.items || []).filter(item => !activity || !data.service || item.service === data.service);
  if (data.items !== null && !items.length) {
    body.append(emptyState(activity ? 'scroll-text' : 'hard-drive', activity ? 'No activity yet' : 'No backups yet',
      activity ? (data.service ? 'No recent operations for this service. Choose another service or refresh.' : 'Service operations will appear here. Refresh to check for new activity.') : 'Create a backup now, or wait for the next automatic backup (every ' + (state.config?.backups?.interval_minutes ?? 60) + ' minutes).'));
  } else if (items.length) {
    const table = h('table', { 'aria-label': 'Domain ' + kind });
    table.append(h('thead', {}, h('tr', {}, ...(activity ? ['Time', 'Service', 'Operation', 'Result', 'Duration', 'Source', 'Help'] : ['Name', 'Created', 'Size', 'Actions']).map(text => h('th', { scope: 'col', text })))));
    const rows = h('tbody');
    for (const item of items) {
      const row = h('tr');
      if (activity) {
        // Deliberate allowlist: never render note, payload, prompts or response data.
        row.append(h('td', { class: 'cell-num', text: historyTime(item.ts) }), h('td', {}, h('span', { class: 'tag', text: item.service || '—' })),
          h('td', { class: 'history-operation', text: item.op || '—' }),
          h('td', {}, h('span', { class: 'activity-result ' + (item.ok === true ? 'ok' : 'failed'), text: item.ok === true ? 'Succeeded' : item.error_code || 'Failed' })),
          h('td', { text: Number.isFinite(item.duration_ms) ? item.duration_ms + ' ms' : '—' }),
          h('td', { text: item.source === 'playground' ? 'Playground' : 'Bridge' }),
          h('td', {}, item.ok === true ? null : errorHelp(item.error_code, item.service)));
      } else {
        const name = String(item.name || item.id || 'Unnamed backup');
        const expires = item.retained ? 'Kept permanently' : item.expires_at ? 'Expires ' + historyTime(item.expires_at) : null;
        const kind = item.kind ? String(item.kind) : null;
        const actions = h('td', { class: 'backup-actions' });
        if (item.kind === 'manual') actions.append(h('button', { class: 'btn sm', type: 'button', disabled: data.busy || data.loading,
          onclick: () => backupAction(d, 'retain', item) }, item.retained ? 'Release retention' : 'Keep permanently'));
        for (const [action, label, glyph] of [['rename', 'Rename', 'pencil'], ['restore', 'Restore', 'refresh-cw'], ['delete', 'Delete', 'trash-2']]) {
          const btn = h('button', { class: 'btn sm' + (action === 'delete' ? ' danger' : ''), type: 'button', disabled: data.busy || data.loading,
            'aria-label': label + ' backup ' + name }, icon(glyph), h('span', { text: label }));
          btn.addEventListener('click', () => backupAction(d, action, { ...item, name }));
          actions.append(btn);
        }
        const nameCell = h('td', { class: 'backup-name', text: name });
        const nameMeta = [kind, expires].filter(Boolean).join(' · ');
        if (nameMeta) {
          nameCell.title = nameMeta;
          nameCell.setAttribute('aria-label', name);
          nameCell.setAttribute('data-tooltip', nameMeta);
        }
        row.append(nameCell,
          h('td', { class: 'cell-num', text: historyTime(item.created_at) }), h('td', { class: 'cell-num', text: backupSize(item.size_bytes) }), actions);
      }
      rows.append(row);
    }
    table.append(rows);
    body.append(h('div', { class: 'table-wrap history-table', tabindex: '0', 'aria-label': title + ' list' }, table));
  }
  const panel = h('section', { class: 'panel domain-history', id: 'de-' + kind, 'aria-labelledby': 'de-' + kind + '-title' }, head, body);
  if (data.items === null && !data.loading && !data.error) queueMicrotask(() => { if (!data.loading && data.items === null && !data.error) loadDomainHistory(d, kind); });
  return panel;
}

function renderDomainEditPage(main, { section = 'services', limitsOnly = false } = {}) {
  const d = limitsOnly ? state.limitsEdit : state.domainEdit;
  const isEdit = d.mode === 'edit';
  if (!isEdit && !limitsOnly && renderDomainWizard(main, d, renderApp)) return;
  if (!isEdit && !limitsOnly) main.append(h('div', { class: 'workflow-notice row' },
    wizardSteps(3), h('span', { class: 'grow hint', text: 'Review services and limits, then create the domain.' }),
    h('button', { class: 'btn sm', type: 'button', onclick: () => { d.wizardStep = 2; renderApp(); } }, 'Change template')));

  const domainIn = h('input', { class: 'input', id: 'de-domain', value: d.domain, placeholder: 'e.g. my-bot.example.com', autocomplete: 'off', spellcheck: 'false' });
  domainIn.setAttribute('aria-label', 'Domain name');
  domainIn.addEventListener('input', () => { d.domain = domainIn.value; });
  if (isEdit) domainIn.disabled = true;

  const ownerIn = h('input', { class: 'input', id: 'de-owner', value: d.ownerText, placeholder: 'e.g. 12345678, 87654321' });
  ownerIn.setAttribute('aria-label', 'Owner IDs, comma-separated');
  ownerIn.addEventListener('input', () => { d.ownerText = ownerIn.value; });

  const storageIn = h('input', { class: 'input', id: 'de-storage', type: 'text', value: d.storageText, placeholder: '1024 MB or 8gb', 'aria-describedby': 'de-storage-hint' });
  storageIn.addEventListener('input', () => { d.storageText = storageIn.value; });

  const quotaIn = h('input', { class: 'input', id: 'de-quota', type: 'text', inputmode: 'numeric', value: d.quotaText, placeholder: 'Unlimited', 'aria-describedby': 'de-quota-hint' });
  quotaIn.addEventListener('input', () => { d.quotaText = quotaIn.value; });
  const tokensIn = h('input', { class: 'input', id: 'de-tokens', type: 'text', inputmode: 'numeric', value: d.tokensText, placeholder: 'Unlimited', 'aria-describedby': 'de-tokens-hint' });
  tokensIn.addEventListener('input', () => { d.tokensText = tokensIn.value; });
  const modelsIn = h('textarea', { class: 'textarea', id: 'de-models', rows: '3', placeholder: 'Unrestricted', spellcheck: 'false', 'aria-describedby': 'de-models-hint' });
  modelsIn.value = d.modelsText;
  modelsIn.addEventListener('input', () => { d.modelsText = modelsIn.value; });
  const promptIn = h('textarea', { class: 'textarea', id: 'de-systemprompt', rows: '4',
    placeholder: 'Empty = use the bridge-wide system prompt', spellcheck: 'false', maxlength: '8000',
    'aria-describedby': 'de-systemprompt-hint' });
  promptIn.value = d.systemPromptText;
  promptIn.addEventListener('input', () => { d.systemPromptText = promptIn.value; });

  const serviceFields = new Map();
  const field = (id, label, input, hint, wide = false) => h('div', { class: 'field' + (wide ? ' span-2' : '') },
    h('label', { for: id, text: label }), input,
    hint ? h('span', { class: 'hint', id: id + '-hint', text: hint }) : null);
  serviceFields.set('datastore', [field('de-storage', 'Storage limit', storageIn,
    '1–1048576 whole MB. MB, GB and TB accepted (1 GB = 1024 MB). Writes beyond this limit are rejected. GenAI chats of this domain are stored in the same budget.')]);
  serviceFields.set('genai', [
    field('de-quota', 'Daily request quota (UTC)', quotaIn,
      'Only successful AI requests count. Pending requests reserve a slot; failures release it. Resets at midnight UTC. Blank = unlimited; otherwise 1–1000000.'),
    field('de-tokens', 'Output token cap per request', tokensIn,
      'Hard limit for one completion. A higher output cap configured under AI & models is lowered to this value instead of rejecting the request. Blank = unlimited; otherwise 1–1000000.'),
    field('de-models', 'Model allowlist', modelsIn,
      'Exact model IDs, separated by commas or newlines. Blank allows all models; no wildcard matching.', true),
    field('de-systemprompt', 'System prompt', promptIn,
      'Replaces the bridge-wide system prompt for this domain. Documentation excerpts are appended to whichever prompt applies. Blank = use the global one; up to 8000 characters.', true),
  ]);
  for (const [key, label] of Object.entries(SERVICE_LIMIT_LABELS)) {
    const service = key.replace('_requests_per_day', '');
    const input = h('input', { class: 'input', id: 'de-' + key, type: 'text', inputmode: 'numeric',
      value: d.serviceLimitText[key], placeholder: 'Unlimited', 'aria-label': label });
    input.addEventListener('input', () => { d.serviceLimitText[key] = input.value; });
    if (!serviceFields.has(service)) serviceFields.set(service, []);
    serviceFields.get(service).push(field('de-' + key, label, input,
      'Resets at midnight UTC. Blank = unlimited; otherwise 1–1000000.' +
      (['webhook', 'playerinfo'].includes(service) ? ' Failed calls release their slot.' : '')));
  }
  // The same names as Settings → Services, so a service reads the same everywhere.
  const names = SERVICE_NAMES;
  const serviceSections = h('div', { class: 'domain-services', id: 'de-service-limits' });
  if (!d.serviceExpanded) d.serviceExpanded = new Map();
  const order = [...new Set(['datastore', 'genai', ...state.services, ...serviceFields.keys(), ...d.services])];
  /* While editing, a service opens as its own sub-page instead of unfolding in
   * the list; a new domain keeps the inline list of its wizard step. */
  const subpages = isEdit && !limitsOnly;
  const servicePage = subpages && order.includes(state.domainService) ? state.domainService : null;
  // On a service's own page its switch, state and fields go straight into the
  // panel: no second box inside it, nothing to fold.
  let pagePart = null;
  for (const service of order) {
    if (servicePage && service !== servicePage) continue;
    const available = state.services.includes(service);
    const toggle = checkBox({ id: 'svc-' + service });
    if (service === 'info') d.services.add(service);
    toggle.checked = d.services.has(service);
    toggle.disabled = service === 'info' || !available;
    const status = statusBadge('', 'off');
    status.classList.add('domain-service-status');
    const fields = h('fieldset', { class: 'domain-service-fields form-grid',
      'aria-label': (names[service] || service) + ' settings' }, ...(serviceFields.get(service) || [
      h('p', { class: 'hint', text: 'No domain-specific settings for this service.' }),
    ]));
    fields.id = 'de-fields-' + service;
    if (!d.serviceExpanded.has(service)) d.serviceExpanded.set(service, available && toggle.checked);
    if (servicePage) d.serviceExpanded.set(service, true);
    else if (subpages) d.serviceExpanded.set(service, false);
    const hasSettings = serviceFields.has(service);
    const disclosure = h('button', { class: 'btn ghost icon-only domain-service-disclosure', type: 'button',
      'aria-controls': fields.id, 'aria-label': (names[service] || service) + ' settings' }, icon('chevron-down'));
    const section = h('section', { class: 'domain-service', 'data-service': service,
      /* One id scheme for both renderings: a jump from Settings looks the row up
       * by 'settings-limit-<service>' (see focusServiceSection), so the domain
       * sub-page must expose the same id or the jump silently does nothing. */
      id: 'settings-limit-' + service,
      tabindex: '-1', 'aria-label': (names[service] || service) + ' limits' },
      h('div', { class: 'domain-service-head' },
        h('label', { class: 'domain-service-toggle', for: toggle.id }, toggle, serviceIcon(service), h('span', { text: names[service] || service })),
        h('div', { class: 'domain-service-controls' }, status, disclosure)), fields);
    const sync = () => {
      fields.disabled = !available || !toggle.checked;
      fields.hidden = !d.serviceExpanded.get(service);
      disclosure.setAttribute('aria-expanded', String(!fields.hidden));
      section.classList.toggle('is-disabled', fields.disabled);
      section.classList.toggle('is-on', available && toggle.checked);
      section.classList.toggle('is-open', !fields.hidden);
      const global = service === 'info' || state.config?.services?.includes(service);
      if (service === 'info') status.update('Always on', 'ok');
      else if (!available) status.update('Unavailable', 'off');
      else if (!toggle.checked) status.update('Off', 'off', 'Its values are kept for when you enable it again.');
      else if (!global) status.update('Off globally', 'warn', 'Enable it in Settings → Services, or the domain cannot use it.');
      else status.update('Enabled', 'ok');
    };
    const openPage = () => navigate('domains', { domain: d.domain, section: 'services', entry: service });
    if (subpages) {
      /* The list is a set of links: the row opens the service's page, the
       * checkbox still switches it on or off in place. */
      disclosure.setAttribute('aria-label', 'Open ' + (names[service] || service) + ' settings');
      disclosure.removeAttribute('aria-controls');
      disclosure.hidden = !!servicePage || !hasSettings;
      section.classList.add(servicePage ? 'is-page' : 'is-link');
      if (!servicePage && hasSettings) {
        disclosure.addEventListener('click', openPage);
        section.querySelector('.domain-service-head').addEventListener('click', event => {
          if (event.target.closest('label, button, input')) return;
          openPage();
        });
      }
    } else {
      disclosure.addEventListener('click', () => {
        d.serviceExpanded.set(service, !d.serviceExpanded.get(service));
        sync();
      });
    }
    toggle.addEventListener('change', () => {
      if (toggle.checked) d.services.add(service); else d.services.delete(service);
      if (!subpages) d.serviceExpanded.set(service, toggle.checked);
      sync();
    });
    sync();
    serviceSections.append(section);
    if (servicePage) pagePart = { toggle, status, fields };
  }

  const cancel = h('button', { class: 'btn ghost', type: 'button' }, 'Cancel');

  const err = h('div', { class: 'error-text', role: 'alert', text: d.saveError || '' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, icon(isEdit ? 'pencil' : 'plus'), isEdit ? 'Save changes' : 'Add domain');
  /* Not in the row any more, but still a submit button of this form: the arrow
   * hands it the click, and the form's own handler reads `ev.submitter`. */
  const applySubmit = h('button', { type: 'submit', 'data-apply-domain': 'true' }, icon('circle-check'), h('span', { text: 'Save & apply' }));
  /* Service limits and domain limits are the same fields, read from the same
   * draft; only the payload differs, so the two paths share one submit
   * handler further down. */
  const showServices = section === 'services';

  /* The action, and the arrow that opens what else the same form can do. Saving
   * and applying, and the diagnostics, used to stand here as their own buttons —
   * a second and a third primary next to the first — while the page already
   * offers both above them (the apply notice). Behind the arrow they stay
   * reachable without being said three times. */
  function domainFormActions() {
    return h('div', { class: 'domain-form-actions' }, cancel,
      h('div', { class: 'btn-split' }, submit, actionMenu({
        buttonClass: 'btn primary', id: 'de-form-actions', ariaLabel: 'More ways to save this domain',
        items: [
          applySubmit,
          { label: 'Run diagnostics', icon: 'stethoscope', onSelect: () => diagnose(true) },
        ],
      })));
  }

  const form = h('form', { class: 'stack' },
    showServices ? h('div', { class: 'form-grid' },
      h('div', { class: 'field' },
        h('label', { for: 'de-domain' }, 'Domain'),
        domainIn,
        h('span', { class: 'hint', text: isEdit ? 'The domain name identifies the datastore and cannot be renamed.' : 'Letters, numbers, dots, underscores, dashes and slashes.' })),
      h('div', { class: 'field' },
        h('label', { for: 'de-owner' }, 'Owner IDs'),
        ownerIn,
        h('span', { class: 'hint', text: 'Roblox user IDs allowed to use this domain, comma-separated.' }))) : null,
    showServices ? h('div', { class: 'field' }, h('h3', { class: 'group-label', text: 'Services' }),
      h('p', { class: 'hint', text: 'Enable each service below, then set how much of it this domain may use. Disabled settings are kept for when you enable it again.' })) : null,
    serviceSections,
    err,
    domainFormActions());
  if (servicePage) {
    pagePart.fields.classList.add('is-page-fields');
    pagePart.toggle.classList.add('is-switch');
    form.replaceChildren(pagePart.fields, err, domainFormActions());
  }

  if (limitsOnly) {
    submit.textContent = 'Save domain limits';
    submit.disabled = !!d.saving;
    cancel.textContent = 'Discard limit changes';
    cancel.disabled = !!d.saving;
    if (d.saving) err.textContent = 'Saving limits …';
    cancel.addEventListener('click', () => {
      if (d.saving) return;
      state.limitsEdit = null; renderApp();
      document.getElementById('settings-limits-domain')?.focus({ preventScroll: true });
    });
    form.replaceChildren(serviceSections, err, domainFormActions());
  }
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (d.saving) return;
    d.saveError = '';
    err.textContent = '';
    const storage_mb = parseStorageMB(storageIn.value);
    if (Number.isNaN(storage_mb)) {
      err.textContent = 'Storage limit must convert to a whole number between 1 and 1048576 MB (e.g. 8gb = 8192 MB). Fractional MB are not rounded.';
      return;
    }
    const max_requests_per_day = parseDomainLimit(quotaIn.value);
    const max_output_tokens = parseDomainLimit(tokensIn.value);
    if (Number.isNaN(max_requests_per_day) || Number.isNaN(max_output_tokens)) {
      err.textContent = 'Daily request quota and output token cap must be whole numbers between 1 and 1000000, or blank for unlimited.';
      return;
    }
    const models = modelsIn.value.split(/[,\r\n]+/).map(s => s.trim()).filter(Boolean);
    const service_limits = {};
    for (const key of Object.keys(SERVICE_LIMIT_LABELS)) {
      const parsed = parseDomainLimit(d.serviceLimitText[key] ?? '');
      if (Number.isNaN(parsed)) {
        err.textContent = 'Service limits must be whole numbers between 1 and 1000000, or blank for unlimited.';
        return;
      }
      service_limits[key] = parsed;
    }
    const payload = { domain: domainIn.value, owners: ownerIn.value.split(','), services: [...d.services], storage_mb,
      max_requests_per_day, max_output_tokens, allowed_models: models.length ? models : null,
      system_prompt: promptIn.value, service_limits, isEdit, err,
      editDraft: d };
    if (limitsOnly) {
      // Send only the visible limit fields. Owners and services come from the
      // freshest server state: stale hidden values would revert changes made
      // meanwhile in the Domains tab, while null or [] would wipe them. The
      // backend requires owner_ids; allowed_models is not editable in the
      // limits editor, so its current server value is echoed back.
      const fresh = state.domains.find(row => row.domain === d.domain) || {};
      payload.owners = Array.isArray(fresh.owner_ids) ? fresh.owner_ids : [];
      payload.services = Array.isArray(fresh.services) ? fresh.services : [...d.services];
      payload.allowed_models = Array.isArray(fresh.allowed_models) ? fresh.allowed_models : null;
      payload.system_prompt = String(fresh.system_prompt || '');
      for (const key of Object.keys(SERVICE_LIMIT_LABELS)) {
        if (!(key in payload.service_limits)) payload.service_limits[key] = fresh[key] ?? null;
      }
    } else if (!isEdit) {
      // Keep the typed name in the draft: rejected submits rerender from it.
      d.domain = domainIn.value;
    }
    d.saving = true;
    form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
    err.textContent = limitsOnly ? 'Saving limits …' : '';
    try {
      await submitDomain({ ...payload, apply: ev.submitter?.dataset.applyDomain === 'true' });
    } finally {
      d.saving = false;
      form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = false; });
      domainIn.disabled = isEdit;
      for (const service of order) {
        const toggle = document.getElementById('svc-' + service);
        if (toggle && (service === 'info' || !state.services.includes(service))) toggle.disabled = true;
      }
    }
  });

  if (limitsOnly) {
    if (d.saving) form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
    main.append(form);
    return;
  }

  /* Cancel drops the edit and shows the domain list again — the same place the
   * Back action in the page head goes, and the same draft it throws away. (In
   * the limits editor above, Cancel means "discard limit changes" instead.) */
  cancel.addEventListener('click', closeDomainEdit);

  /* One section per page. The head stays, the body changes, and the actions
   * only exist where there is something to submit. */
  const SECTION_COPY = {
    services: ['Owners, services and their limits.', 'Update owners, services, storage and AI limits for this domain.'],
    activity: ['What this domain did recently.', 'What this domain did recently. Read-only, newest first.'],
    backups: ['Backup copies and restore points.', 'Backups of this domain’s data, and the actions that change them.'],
    danger: ['Actions that cannot be undone.', 'These actions apply immediately and cannot be undone.'],
  };
  const active = SECTION_COPY[section] ? section : 'services';
  const [eyebrow, description] = SECTION_COPY[active];
  const discard = h('button', { class: 'btn ghost', type: 'button', id: 'de-discard' }, icon('refresh-cw'), 'Discard changes');
  discard.addEventListener('click', () => {
    state.domainEdit = domainEditFromEntry(d.mode, state.domains.find(row => row.domain === d.domain) || {});
    navigate('domains', { domain: d.domain, section: 'services' });
  });

  /* The same bottom bar as Settings: what the draft is on the left, discard and
   * save on the right, a blue edge once something changed. It stays inside the
   * form, so its buttons still submit it. */
  if (active === 'services') {
    const title = h('strong');
    const hint = h('span', { class: 'hint' });
    const bar = h('div', { class: 'save-bar domain-save-bar' },
      h('div', { class: 'save-bar-copy' }, title, hint),
      h('span', { class: 'grow' }),
      isEdit ? discard : cancel,
      form.lastElementChild.querySelector('.btn-split'));
    const sync = () => {
      const dirty = domainEditDirty(d);
      bar.classList.toggle('is-dirty', dirty);
      discard.disabled = !dirty;
      title.textContent = !isEdit ? 'New domain' : dirty ? 'Unsaved changes' : 'Saved domain';
      hint.textContent = !isEdit ? 'Review services and limits, then create the domain.'
        : liveApply() ? 'Saving applies the changes to the running bridge.' : 'Saved changes take effect after the bridge restarts.';
    };
    form.lastElementChild.replaceWith(bar);
    // The whole page, not only the form: a service page keeps its switch in
    // the panel head, outside the form.
    main.addEventListener('input', sync);
    main.addEventListener('change', sync);
    main.addEventListener('click', () => queueMicrotask(sync));
    sync();
    main.classList.add('has-save-bar');
  }
  const back = h('button', { class: 'btn ghost', type: 'button', id: 'de-back' }, icon('arrow-left'), servicePage ? 'All services' : 'All domains');
  back.addEventListener('click', servicePage ? () => navigate('domains', { domain: d.domain, section: 'services' }) : closeDomainEdit);
  const serviceName = servicePage ? (names[servicePage] || servicePage) : '';

  const pageHead = h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: servicePage ? serviceName : isEdit ? 'Edit domain' : 'New domain' }),
      h('p', { text: servicePage
        ? 'What ' + d.domain + ' may use of ' + serviceName + '. Switch it on for this domain, then set its limits.'
        : eyebrow + ' ' + description })),
    h('div', { class: 'page-actions' }, back));
  const panel = h('div', { class: 'panel' },
    h('div', { class: 'panel-head' },
      servicePage ? serviceIcon(servicePage) : null,
      h('h3', { text: servicePage ? serviceName : isEdit ? 'Domain' : 'New domain' }),
      isEdit && !servicePage ? h('span', { class: 'tag', text: d.domain }) : null,
      h('span', { class: 'grow' }),
      servicePage
        ? h('div', { class: 'service-page-switch' }, pagePart.status,
          h('label', { class: 'switch-label', for: pagePart.toggle.id }, 'Enabled for this domain'), pagePart.toggle)
        : h('span', { class: 'panel-note', text: liveApply() ? 'Saved changes reach the running bridge at once.' : 'Changes take effect after restarting the bridge.' })),
    h('div', { class: 'panel-body' }, form));

  if (active === 'services') {
    main.append(pageHead, panel);
    if (state.settingsService) {
      const service = state.settingsService;
      state.settingsService = null;
      queueMicrotask(() => focusServiceSection(service));
    }
    if (!isEdit) setTimeout(() => { if (!domainIn.disabled) domainIn.focus(); else storageIn.focus(); }, 0);
    return;
  }
  if (active === 'activity') { main.append(pageHead, domainHistoryPanel(d, 'activity')); return; }
  if (active === 'backups') { main.append(pageHead, domainHistoryPanel(d, 'backups')); return; }

  const dangerErr = h('div', { class: 'error-text', role: 'alert' });
  const dsBtn = h('button', { class: 'btn danger', type: 'button', id: 'de-reset-datastore' }, icon('trash-2'), h('span', { text: 'Delete datastore contents' }));
  dsBtn.addEventListener('click', async () => {
    dangerErr.textContent = '';
    if (!(await resetDomainDatastore(d.domain))) return;
    await runDomainReset(API.domainResetDs, d.domain, null, dangerErr);
    dsBtn.blur();
  });
  const genaiBtn = h('button', { class: 'btn danger', type: 'button', id: 'de-reset-genai' }, icon('refresh-cw'), h('span', { text: 'Reset GenAI daily counter' }));
  genaiBtn.addEventListener('click', async () => {
    dangerErr.textContent = '';
    if (!(await resetDomainGenai(d.domain))) return;
    await runDomainReset(API.domainResetGenai, d.domain, null, dangerErr);
    genaiBtn.blur();
  });
  const deleteBtn = h('button', { class: 'btn danger', type: 'button', id: 'de-delete-domain', 'data-domain-delete': '', disabled: domainDeleteBlocked() || state.busy.domainRemove }, icon('trash-2'), h('span', { text: 'Delete domain permanently' }));
  deleteBtn.addEventListener('click', () => removeDomain(d.domain, dangerErr));
  main.append(pageHead, h('div', { class: 'panel danger-zone' },
    h('div', { class: 'panel-head' },
      h('h3', { text: 'Danger zone' }),
      h('span', { class: 'grow' }),
      h('span', { class: 'panel-note', text: 'These actions apply immediately and cannot be undone.' })),
    h('div', { class: 'panel-body stack' },
      h('div', { class: 'row' },
        h('div', { class: 'stack domain-delete-copy' },
          h('strong', { text: 'Delete datastore contents' }),
          h('span', { class: 'hint', text: 'Removes every stored key of this domain. Settings and limits are kept.' })),
        dsBtn),
      h('div', { class: 'row' },
        h('div', { class: 'stack domain-delete-copy' },
          h('strong', { text: 'Reset GenAI daily counter' }),
          h('span', { class: 'hint', text: 'Clears today’s used/reserved count. The configured limits stay as they are.' })),
        genaiBtn),
      h('div', { class: 'row domain-delete-row' },
        h('div', { class: 'stack domain-delete-copy' }, h('strong', { text: 'Delete domain permanently' }),
          h('span', { class: 'hint', id: 'de-delete-warning', text: DOMAIN_DELETE_WARNING })),
        deleteBtn),
      dangerErr)));
  deleteBtn.setAttribute('aria-describedby', 'de-delete-warning');
}

/* Bring one service row into view after a jump from Settings. The row lives on
 * the services sub-page, so this only has to expand and focus it — no scroll
 * chasing across a stacked page. */
function focusServiceSection(service) {
  const target = document.getElementById('settings-limit-' + service) || document.getElementById('settings-limit-datastore');
  if (!target) return;
  const draft = state.domainEdit;
  if (draft?.serviceExpanded) draft.serviceExpanded.set(service, true);
  const fields = document.getElementById('de-fields-' + service);
  if (fields) {
    fields.hidden = false;
    const disclosure = target.querySelector('.domain-service-disclosure');
    if (disclosure) disclosure.setAttribute('aria-expanded', 'true');
  }
  target.classList.add('settings-highlight');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center', behavior: 'auto' });
  setTimeout(() => target.classList.remove('settings-highlight'), 1800);
}

export { closeDomainEdit, domainDeleteBlocked, domainEditDirty, domainEditFromEntry, domainSections, openDomainService, parseGlobalLimit, removeDomain, renderDomainEditPage };

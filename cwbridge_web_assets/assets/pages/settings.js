/* CWBridge console: pages/settings. Local ES module; no runtime dependencies.
 *
 * Settings is a set of sub-pages, not one long frame: the shell shows the
 * section list in the sidebar and renders exactly one section into <main>. All
 * sections share ONE draft (state.settingsDraft), so editing "Storage" and then
 * opening "AI & models" does not lose the first edit — the sticky save bar,
 * which every section carries, is what commits it. */
import { API, UnauthorizedError, api, state } from '../core.js';
import { checkBox, confirmDialog, copyField, customSelect, emptyState, fmtMB, h, icon, openDialog, setPopText, spinnerRow, toast, actionMenu } from '../ui.js';
import { discardSettings, saveSettings, secretFlags, settingsDirtySections, settingsSectionDirty } from '../settings-model.js';
import { applySaved, diagnose, diagnosisButton, liveApply } from '../operations.js';
import { handleUnauthorized } from '../auth.js';
import { navigate } from '../router.js';
import { overviewNavigate } from './overview.js';
import { domainEditFromEntry, openDomainService, parseGlobalLimit, renderDomainEditPage } from './domain-detail.js';
import { openPlayground, openServiceSetup, serviceIcon, serviceStatus, SERVICE_NAMES, statusBadge } from '../workflows.js';

/* The sub-page list the sidebar renders, in order. */
const SETTINGS_SECTIONS = [
  { id: 'services', label: 'Services' },
  { id: 'limits', label: 'Limits & usage' },
  { id: 'storage', label: 'Storage' },
  { id: 'backups', label: 'Backups' },
  { id: 'ai', label: 'AI & models' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'notifications', label: 'Webhooks' },
];

function settingsSectionIds() {
  return SETTINGS_SECTIONS.map(section => section.id);
}

function settingsSectionLabel(id) {
  const item = SETTINGS_SECTIONS.find(section => section.id === id);
  return item ? item.label : 'Settings';
}

function openModelPicker() {
  const draft = state.settingsDraft;
  const connection = { provider: draft.ai.provider, protocol: draft.ai.protocol, base_url: draft.ai.base_url.trim() };
  const selected = new Set();
  let models = [], closed = false, loading = false, generation = 0;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search model IDs…', 'aria-label': 'Search available models' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const error = h('p', { class: 'error-text', role: 'alert' });
  const list = h('div', { class: 'ai-discovery-list scroll-slim', tabindex: '0', role: 'region', 'aria-label': 'Available models' });
  const fetchBtn = h('button', { class: 'btn', type: 'button' }, icon('refresh-cw'), 'Fetch available models');
  const allBtn = h('button', { class: 'btn ghost sm', type: 'button' }, 'Select visible');
  const noneBtn = h('button', { class: 'btn ghost sm', type: 'button' }, 'Clear selection');
  const manual = h('input', { class: 'input mono', id: 'model-manual', maxlength: 256, placeholder: 'Exact model ID', 'aria-label': 'Manual model ID' });
  const manualBtn = h('button', { class: 'btn', type: 'button' }, icon('plus'), 'Select ID');
  const dlg = openDialog({
    title: 'Add models to active pool', iconName: 'bot',
    onClose() { closed = true; generation++; },
    buildBody(body, dialog) {
      dialog.classList.add('ai-model-dialog');
      body.append(h('p', { class: 'hint', text: 'Choose models for your bridge. Add them to your draft, then save when ready.' }),
        h('div', { class: 'ai-catalog-source' },
          h('div', { class: 'ai-connection-caption' },
            h('span', { class: 'ai-source-label', text: 'Model catalog' }),
            h('span', { class: 'mono', text: connection.base_url }),
            h('span', { class: 'hint', text: connection.protocol })), fetchBtn),
        search, h('div', { class: 'ai-catalog-toolbar' }, status, h('div', { class: 'row' }, allBtn, noneBtn)), error, list,
        h('div', { class: 'field ai-manual' }, h('label', { for: 'model-manual' }, 'Add by model ID'), h('div', { class: 'row' }, manual, manualBtn)));
    },
    actions: [{ label: 'Cancel' }, { label: 'Add selected', kind: 'primary', onClick(close) {
      if (state.settingsDraft !== draft) { close(); return; }
      draft.ai.models = [...new Set([...draft.ai.models, ...selected])];
      if (!draft.ai.model) draft.ai.model = draft.ai.models[0] || '';
      close(); markDirty();
      for (const picker of document.querySelectorAll('.ai-pool-list')) paintPool(picker);
      toast('Models added to draft — save changes to activate.', 'info');
    } }],
  });
  const addBtn = dlg.dialog.querySelector('.dialog-actions .primary');
  const visible = () => models.filter(id => id.toLowerCase().includes(search.value.trim().toLowerCase()));
  function paint() {
    const ids = visible();
    list.replaceChildren();
    for (const id of ids) {
      const active = draft.ai.models.includes(id);
      const cb = checkBox({ ariaLabel: id });
      cb.checked = active || selected.has(id); cb.disabled = active || loading;
      cb.addEventListener('change', () => { cb.checked ? selected.add(id) : selected.delete(id); updateCount(); });
      const slash = id.indexOf('/');
      list.append(h('label', { class: 'ai-model-option' }, cb,
        h('span', { class: 'ai-model-id', title: id },
          h('span', { class: 'ai-model-name', text: slash >= 0 ? id.slice(slash + 1) : id }),
          h('span', { class: 'ai-model-provider', text: slash >= 0 ? id.slice(0, slash) : 'Model' })),
        active ? h('span', { class: 'chip', text: 'In pool' }) : null));
    }
    if (!ids.length) list.append(h('div', { class: 'ai-catalog-empty' }, icon(loading ? 'loader-circle' : 'bot'),
      h('strong', { text: loading ? 'Fetching model catalog…' : models.length ? 'No matching models' : 'Find your next model' }),
      h('p', { class: 'hint', text: loading ? 'Waiting for your provider.' : models.length ? 'Try a different name or provider.' : 'Fetch the catalog above, or add an exact model ID below.' })));
    allBtn.disabled = loading || !ids.some(id => !draft.ai.models.includes(id));
    updateCount();
  }
  function updateCount() {
    setPopText(status, `${models.length} available · ${selected.size} selected · ${draft.ai.models.length} already in pool`);
    addBtn.textContent = selected.size ? `Add ${selected.size} to pool` : 'Add selected';
    addBtn.disabled = !selected.size || loading;
    noneBtn.disabled = !selected.size || loading;
  }
  async function fetchModels() {
    if (loading) return;
    loading = true; const round = ++generation;
    fetchBtn.disabled = true; fetchBtn.setAttribute('aria-busy', 'true'); fetchBtn.replaceChildren(icon('refresh-cw'), 'Fetching…'); error.textContent = ''; paint();
    const body = { ...connection };
    if (Object.hasOwn(draft.secrets, 'ai_api_key')) body.api_key = draft.secrets.ai_api_key || '';
    try {
      const data = await api(API.models, { method: 'POST', body });
      if (closed || round !== generation || state.settingsDraft !== draft) return;
      models = [...new Set((data.models || []).filter(id => typeof id === 'string' && id))].sort();
      if (!models.length) error.textContent = 'The provider returned no models. Check the endpoint or add an ID manually.';
    } catch (err) {
      if (err instanceof UnauthorizedError) { dlg.close(); handleUnauthorized(); }
      else if (!closed) error.textContent = err.message;
    } finally {
      if (!closed) { loading = false; fetchBtn.disabled = false; fetchBtn.setAttribute('aria-busy', 'false'); fetchBtn.replaceChildren(icon('refresh-cw'), 'Fetch available models'); paint(); }
    }
  }
  search.addEventListener('input', paint);
  fetchBtn.addEventListener('click', fetchModels);
  allBtn.addEventListener('click', () => { visible().filter(id => !draft.ai.models.includes(id)).forEach(id => selected.add(id)); paint(); });
  noneBtn.addEventListener('click', () => { selected.clear(); paint(); });
  function addManual() {
    const id = manual.value.trim();
    if (!id || id.length > 256 || /[\x00-\x1f,]/.test(id) || ['request', 'default'].includes(id.toLowerCase())) { error.textContent = 'Enter a valid model ID (not “request” or “default”).'; return; }
    error.textContent = '';
    if (!models.includes(id)) models.push(id);
    if (!draft.ai.models.includes(id)) selected.add(id);
    manual.value = ''; search.value = ''; paint();
  }
  manualBtn.addEventListener('click', addManual);
  manual.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } });
  paint(); search.focus();
}

/* ---- Section chrome ---------------------------------------------------- */
/* One page head per sub-page. The hint under it is rewritten by markDirty, so
 * a section never claims to be clean while another one holds an unsaved edit. */
function sectionHead(title, description, action) {
  return h('div', { class: 'page-head' },
    h('div', { class: 'titles' }, h('h1', { text: title }), h('p', { text: description })),
    action || null);
}

/* Whether the whole draft holds edits — used for the save bar, which saves
 * every section at once. Which sidebar entries show a dot is decided per
 * section (settingsDirtySections): an edit marks its own sub-page, not all. */
function settingsDirty() {
  return Object.keys(settingsDirtySections()).length > 0;
}

/* The head hint speaks about the section the reader is looking at. */
function settingsHeadHint(section) {
  if (section === 'notifications') return settingsSectionDirty(section) ? 'Unsaved webhook settings.' : 'Webhook settings take effect after saving.';
  if (liveApply()) return settingsSectionDirty(section) ? 'Unsaved changes — saving applies them to the running bridge.' : 'Bridge configuration. Saved changes apply live; only a storage switch needs a restart.';
  return settingsSectionDirty(section) ? 'Unsaved changes — save and restart the bridge.' : 'Bridge configuration. Changes require a restart.';
}

/* Every settings sub-page ends with the same bar: the draft is shared, so the
 * save action has to be reachable without walking back through other pages.
 * Saving and applying in one step, and the diagnostics, stand behind the arrow
 * beside it: the page already offers the apply itself in the notice above, and
 * a bar of three equally loud buttons says the same thing three times. */
function settingsSaveBar(detail) {
  const dirty = settingsDirty();
  const saveBtn = h('button', { class: 'btn primary', id: 'settings-save', disabled: !dirty || state.busy.settings }, icon('circle-check'), 'Save changes');
  saveBtn.addEventListener('click', () => saveSettings());
  const applyBtn = h('button', { type: 'button', id: 'settings-save-apply', disabled: !dirty || state.busy.settings || state.busy.bridge,
    onclick: () => saveSettings(undefined, true) }, icon('circle-check'), h('span', { text: 'Save & apply' }));
  /* The storage connection test is what the credentials and storage sections
   * need; everywhere else the full diagnostics are the useful ones. */
  const connect = state.settingsSection === 'storage' || state.settingsSection === 'credentials';
  return h('div', { class: 'save-bar' + (dirty ? ' is-dirty' : '') },
    h('div', { class: 'save-bar-copy' },
      h('strong', { text: dirty ? 'Unsaved draft' : 'Saved configuration' }),
      h('span', { class: 'hint', text: detail || (liveApply() ? 'Saving applies every section of this draft to the running bridge.' : 'Saving applies every section of this draft and needs a bridge restart.') })),
    h('span', { class: 'grow' }),
    discardAction(),
    h('div', { class: 'btn-split' }, saveBtn, actionMenu({
      buttonClass: 'btn primary', id: 'settings-save-actions', ariaLabel: 'More ways to save the configuration',
      items: [applyBtn, { label: 'Run diagnostics', icon: 'stethoscope', onSelect: () => diagnose(connect) }],
    })));
}

/* Keep both actions on the shared draft together in the bottom save bar. */
function discardAction() {
  const dirty = settingsDirty();
  const button = h('button', {
    class: 'btn ghost', type: 'button', id: 'settings-discard', disabled: !dirty || state.busy.settings,
  }, icon('refresh-cw'), 'Discard changes');
  button.addEventListener('click', discardDraft);
  return button;
}

/* Reverting is the counterweight to saving, and it covers the same thing: the
 * whole draft, every sub-page at once. Which pages are about to lose their edits
 * is said out loud before it happens — the draft is shared, and an edit made two
 * sub-pages ago is easy to forget about. */
async function discardDraft() {
  const sections = Object.keys(settingsDirtySections());
  if (!sections.length || state.busy.settings) return;
  const names = sections.map(settingsSectionLabel);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  const ok = await confirmDialog({
    title: 'Discard unsaved changes?',
    message: 'The unsaved edits under ' + list + ' are dropped and every field returns to the saved configuration. '
      + 'Nothing is sent to the bridge, and what is dropped cannot be brought back.',
    confirmLabel: 'Discard changes', destructive: true,
  });
  if (!ok || !discardSettings()) return;
  /* The marks are repainted in place first, so the page never shows a clean
   * draft next to a stale "Unsaved changes"; the section itself is then rendered
   * again from the restored draft, which is what puts the fields back. */
  markDirty();
  renderSettingsSection();
  toast('Unsaved changes discarded', 'info');
}

function markDirty() {
  const dirty = settingsDirty();
  /* One sub-page is on screen, and only its own hint changes meaning here. */
  for (const hint of document.querySelectorAll('.page-head p.section-dirty-hint')) {
    setPopText(hint, settingsHeadHint(state.settingsSection));
  }
  for (const bar of document.querySelectorAll('.save-bar')) {
    bar.classList.toggle('is-dirty', dirty);
    const strong = bar.querySelector('.save-bar-copy strong');
    if (strong) setPopText(strong, dirty ? 'Unsaved draft' : 'Saved configuration');
    const save = bar.querySelector('#settings-save');
    if (save) save.disabled = !dirty || state.busy.settings;
    const apply = bar.querySelector('#settings-save-apply');
    if (apply) apply.disabled = !dirty || state.busy.settings || state.busy.bridge;
  }
  /* Nothing left to revert is the one state in which this button does nothing,
   * and it is the state the page returns to right here. */
  for (const discard of document.querySelectorAll('#settings-discard')) {
    discard.disabled = !dirty || state.busy.settings;
  }
  /* The sidebar dots are painted in place, so a full shell render cannot drop
   * focus out of the page the user is editing. */
  document.dispatchEvent(new CustomEvent('cwbridge:settings-dirty'));
}

function renderSettingsSection() {
  if (state.tab !== 'settings') return;
  const focusId = document.activeElement && document.activeElement.id ? document.activeElement.id : null;
  import('../shell.js').then(({ renderApp }) => {
    renderApp();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  });
}

/* ---- Services ---------------------------------------------------------- */
/* The saved state as a badge: ready, off, or what is still missing. */
function serviceStatusBadge(service) {
  const text = serviceStatus(service);
  return statusBadge(text, text === 'Configured' ? 'ok' : text === 'Disabled' ? 'off' : 'warn');
}

function settingsServicesSection(main) {
  const enabled = new Set(state.settingsDraft ? state.settingsDraft.services : []);
  const available = state.services || [];
  const descriptions = state.serviceDescriptions || {};
  main.append(sectionHead('Services', 'Configure services, choose domain access and try a real service request.'));

  const body = h('div', { class: 'stack' });
  const panel = h('div', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h3', { text: 'Available services' }),
      h('span', { class: 'grow' }),
      h('span', { class: 'panel-note', text: enabled.size + ' of ' + available.length + ' enabled' })),
    h('div', { class: 'panel-body flush' }));

  if (!available.length) {
    panel.querySelector('.panel-body').append(emptyState('server', 'No services registered', 'The server did not report any services.'));
  } else {
    const list = h('div', { class: 'service-list is-flat' });
    for (const service of available) {
      const cb = checkBox({ id: 'tsvc-' + service, role: 'switch', ariaLabel: 'Enable ' + service });
      cb.checked = service === 'info' || enabled.has(service);
      cb.disabled = service === 'info';
      /* Two independent controls: the switch toggles the bridge-wide draft, the
       * row opens this service's limits for one domain. */
      const open = h('button', { class: 'service-settings-link', type: 'button',
        'aria-label': 'Set up ' + (SERVICE_NAMES[service] || service) },
        serviceIcon(service),
        h('span', { class: 'stack service-settings-copy' },
          h('span', { class: 'name', text: SERVICE_NAMES[service] || service }),
          descriptions[service] ? h('span', { class: 'hint', text: descriptions[service] }) : null),
        serviceStatusBadge(service));
      open.addEventListener('click', () => openServiceSetup(service));
      cb.addEventListener('change', () => {
        cb.closest('.service-settings-row')?.classList.toggle('is-on', cb.checked);
        if (cb.checked) { if (!state.settingsDraft.services.includes(service)) state.settingsDraft.services.push(service); }
        else state.settingsDraft.services = state.settingsDraft.services.filter(x => x !== service);
        const note = panel.querySelector('.panel-note');
        if (note) setPopText(note, state.settingsDraft.services.length + ' of ' + available.length + ' enabled');
        markDirty();
      });
      const domains = state.domains.filter(d => d.services === 'all' || d.services?.includes(service));
      open.title = domains.length ? 'Used by ' + domains.map(d => d.domain).join(', ') : 'No domains have access yet';
      list.append(h('div', { class: 'service-settings-row service-workflow' + (cb.checked ? ' is-on' : '') }, cb, open,
        actionMenu({ floating: true, buttonClass: 'btn ghost sm icon-only', ariaLabel: 'More actions for ' + service,
          items: [{ label: 'Set up', icon: 'settings-2', onSelect: () => openServiceSetup(service) },
            { label: 'Try service', icon: 'play', onSelect: () => openPlayground(service) },
            { label: 'Domain access and limits', icon: 'list', onSelect: () => openServiceSettings(service) }] })));
    }
    panel.querySelector('.panel-body').append(list);
  }

  body.append(panel,
    h('p', { class: 'hint', text: 'Status badges describe saved configuration, not a connection test. Global service selection and per-domain access must both allow a service. Disabling keeps stored domain limits.' }),
    settingsSaveBar('Enabling a service takes effect after a bridge restart.'));
  main.append(body);
}

/* A service row jumps to the domain that owns the limits. Without a domain
 * there is nothing to configure yet, so the row points at the add form. */
function openServiceSettings(service) {
  const entry = state.domains.find(d => d.domain === state.limitsDomain) || state.domains[0];
  if (!entry) {
    toast('Add a domain first — service limits belong to a domain.', 'info');
    overviewNavigate('domains', true);
    return;
  }
  state.limitsDomain = entry.domain;
  if (!state.limitsEdit || state.limitsEdit.domain !== entry.domain) {
    state.limitsEdit = domainEditFromEntry('edit', entry);
  }
  openDomainService(service);
}

/* ---- Global limits (bridge-wide) + per-domain usage chart -------------- */
// One color per domain, colorblind-friendly, repeated only above 9 domains.
const CHART_COLORS = ['#2563eb', '#10b981', '#f5b95c', '#a78bfa', '#f08080', '#38bdf8', '#fb923c', '#34d399', '#e879f9'];

function globalLimitsRows() {
  const snapshot = state.globalLimitsSnapshot;
  return snapshot && Array.isArray(snapshot.domains)
    ? snapshot.domains.filter(row => row && typeof row.domain === 'string' && row.domain) : [];
}

function chartSegmentLabel(row, kind, cap) {
  const value = Math.max(0, Number(kind === 'genai' ? row.genai_today : row.datastore_mb) || 0);
  const amount = kind === 'genai' ? value.toLocaleString() + ' calls today' : fmtMB(value) + ' used';
  return row.domain + ' · ' + amount + (cap ? ' · ' + (value / cap * 100).toFixed(1) + '% of global limit' : ' · no global limit');
}

function globalUsageChart(kind, cap) {
  /* One meter for both kinds, capped or not: the figure, then a horizontal
   * track where every domain is a coloured segment of the shared limit. A
   * kind without a cap keeps the same shape with an empty, dashed track. */
  const meter = h('div', { class: 'meter' });
  const bar = h('div', { class: 'chart-bar meter-track', role: 'group' });
  if (!state.globalLimitsSnapshot) {
    bar.classList.add('is-empty');
    meter.append(h('div', { class: 'meter-stat' }, h('span', { class: 'chart-note', text: state.globalLimitsError || 'Loading usage …' })), bar);
    return meter;
  }
  const rows = globalLimitsRows().slice().sort((a, b) => a.domain.localeCompare(b.domain));
  const value = row => Math.max(0, Number(kind === 'genai' ? row.genai_today : row.datastore_mb) || 0);
  const total = rows.reduce((sum, row) => sum + value(row), 0);
  const amount = number => kind === 'genai' ? Math.round(number).toLocaleString() : fmtMB(number);
  const percent = cap ? total / cap * 100 : 0;
  meter.append(h('div', { class: 'meter-stat' },
    h('span', { class: 'meter-value', text: amount(total) }),
    h('span', { class: 'meter-unit', text: cap ? 'of ' + amount(cap) + (kind === 'genai' ? ' calls' : '') : kind === 'genai' ? 'calls today' : 'stored' }),
    h('span', { class: 'grow' }),
    cap ? h('span', { class: 'meter-percent' + (total > cap ? ' is-over' : ''), text: percent.toFixed(1) + '%' }) : statusBadge('No limit', 'off')));
  meter.append(bar);
  if (!cap) {
    bar.classList.add('is-uncapped');
    bar.setAttribute('aria-label', 'No global limit set');
    return meter;
  }
  const contributors = rows.filter(row => value(row) > 0);
  bar.setAttribute('aria-label', Math.round(Math.min(100, percent)) + '% of the global ' + (kind === 'genai' ? 'daily call' : 'storage') + ' limit in use');
  if (!contributors.length) {
    meter.append(h('p', { class: 'hint meter-note', text: 'No usage yet today.' }));
    return meter;
  }
  let consumed = 0;
  for (const [index, row] of contributors.entries()) {
    if (consumed >= 100) break;
    const share = Math.min(100 - consumed, (value(row) / cap) * 100);
    const segment = h('div', { class: 'chart-segment', tabindex: '0' });
    // Exact percentages: no minimum width that would distort small shares.
    segment.style.flex = '0 0 ' + share + '%';
    segment.style.background = CHART_COLORS[index % CHART_COLORS.length];
    segment.setAttribute('data-tooltip', chartSegmentLabel(row, kind, cap));
    segment.setAttribute('aria-label', chartSegmentLabel(row, kind, cap));
    bar.append(segment);
    consumed += share;
  }
  const legend = h('ul', { class: 'chart-legend', 'aria-label': 'Domain usage' });
  contributors.forEach((row, index) => {
    const swatch = h('span', { class: 'chart-swatch', 'aria-hidden': 'true' });
    swatch.style.background = CHART_COLORS[index % CHART_COLORS.length];
    legend.append(h('li', { tabindex: '0', 'data-tooltip': chartSegmentLabel(row, kind, cap) },
      swatch, h('span', { text: row.domain }), h('span', { class: 'chart-legend-value', text: (value(row) / cap * 100).toFixed(1) + '%' })));
  });
  meter.append(legend);
  if (total > cap) meter.append(h('p', { class: 'hint meter-note is-over', text: 'Over the saved limit.' }));
  return meter;
}

/* Repaint the chart in place, keeping a focused control if it belongs to it.
 * The panel is built fresh and takes the place of the one on screen: every
 * field is rendered from the draft, so a rebuild loses nothing. A section that
 * is not in the document (the render assembling it is still running) is left
 * alone — that render draws whichever snapshot it already has. */
function paintGlobalLimitsInPlace() {
  const section = document.getElementById('settings-global-limits');
  if (state.view !== 'app' || state.tab !== 'settings' || !section?.isConnected) return;
  const focusId = section.contains(document.activeElement) ? document.activeElement.id : null;
  section.replaceWith(settingsGlobalLimitsPanel());
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

async function refreshGlobalLimitsSnapshot() {
  if (state.busy.limitsSnapshot) return;
  state.busy.limitsSnapshot = true;
  paintGlobalLimitsInPlace();
  state.globalLimitsError = null;
  const request = state.globalLimitsRequest = (state.globalLimitsRequest || 0) + 1;
  try {
    const snapshot = await api(API.usageSnapshot, { method: 'POST', body: {} });
    if (request !== state.globalLimitsRequest) return;
    if (!Array.isArray(snapshot.domains)) throw new Error('Invalid usage response.');
    state.globalLimitsSnapshot = snapshot;
  } catch (err) {
    if (request === state.globalLimitsRequest && !(err instanceof UnauthorizedError)) {
      state.globalLimitsSnapshot = null;
      state.globalLimitsError = err.message + ' Use Refresh usage to retry.';
    }
  } finally {
    if (request === state.globalLimitsRequest) {
      state.busy.limitsSnapshot = false;
      paintGlobalLimitsInPlace();
    }
  }
}

function settingsGlobalLimitsPanel() {
  const d = state.settingsDraft;
  const section = h('section', { class: 'panel', id: 'settings-global-limits', tabindex: '-1', 'aria-label': 'Global limits' });
  const head = h('div', { class: 'panel-head' },
    h('h3', { text: 'Global limits' }),
    h('span', { class: 'grow' }),
    h('span', { class: 'panel-note', text: 'Across all domains' }));
  section.append(head);
  const body = h('div', { class: 'panel-body stack' });
  const genaiIn = h('input', { class: 'input', id: 'st-limit-genai_requests_per_day', type: 'text',
    value: d.global_limits.genai_requests_per_day, placeholder: 'Unlimited', autocomplete: 'off', inputmode: 'numeric' });
  genaiIn.setAttribute('aria-label', 'Global GenAI requests per day');
  genaiIn.addEventListener('input', () => { state.settingsDraft.global_limits.genai_requests_per_day = genaiIn.value; markDirty(); });
  const storageIn = h('input', { class: 'input', id: 'st-limit-datastore_storage_mb', type: 'text',
    value: d.global_limits.datastore_storage_mb, placeholder: 'Unlimited', autocomplete: 'off', inputmode: 'numeric' });
  storageIn.setAttribute('aria-label', 'Global datastore storage in MB');
  storageIn.addEventListener('input', () => { state.settingsDraft.global_limits.datastore_storage_mb = storageIn.value; markDirty(); });
  const refresh = h('button', { class: 'btn ghost sm', type: 'button' }, icon('refresh-cw'), 'Refresh usage');
  refresh.disabled = !!state.busy.limitsSnapshot;
  refresh.setAttribute('aria-busy', String(!!state.busy.limitsSnapshot));
  refresh.addEventListener('click', refreshGlobalLimitsSnapshot);
  // One refresh for both meters, in the panel head instead of inside one card.
  head.append(refresh);
  const capGenai = parseGlobalLimit(state.settings.global_limits.genai_requests_per_day, 1000000);
  const capStorage = parseGlobalLimit(state.settings.global_limits.datastore_storage_mb, 1048576);
  const chartNote = capGenai || capStorage
    ? 'Segments show which domain uses how much of the shared limit. Hover or focus a color to see the domain.'
    : 'Set a limit above and save to compare domains here. The chart reads live usage, not the unsaved draft.';
  body.append(
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'st-limit-genai_requests_per_day' }, 'GenAI calls per day (all domains)'), genaiIn,
        h('span', { class: 'hint', text: 'Shared cap for every domain together. Empty = unlimited; otherwise 1–1000000 successful calls, reset 00:00 UTC.' })),
      h('div', { class: 'field' }, h('label', { for: 'st-limit-datastore_storage_mb' }, 'Datastore storage total (MB)'), storageIn,
        h('span', { class: 'hint', text: 'Sum of all domain datastores. Whole MB, 1–1048576; empty = unlimited. Writes beyond the cap are rejected.' }))),
    h('div', { class: 'chart-grid' },
      h('div', { class: 'chart-wrap' },
        h('div', { class: 'chart-row' }, h('strong', { text: 'GenAI calls today' }),
          h('span', { class: 'grow' }), h('span', { class: 'hint', text: 'Resets 00:00 UTC' })),
        globalUsageChart('genai', capGenai)),
      h('div', { class: 'chart-wrap' },
        h('div', { class: 'chart-row' }, h('strong', { text: 'Datastore storage' }),
          h('span', { class: 'grow' }), h('span', { class: 'hint', text: 'All domain datastores' })),
        globalUsageChart('datastore', capStorage))),
    h('p', { class: 'hint', text: chartNote }));
  section.append(body);
  return section;
}

function settingsGlobalLimitsSection(main) {
  /* Fire the fetch after this render has put the section into the document:
   * the response repaints the chart in place, and a detached section cannot be
   * replaced. Until it lands, the chart shows its own loading line. */
  if (!state.globalLimitsSnapshot && !state.globalLimitsError && !state.busy.limitsSnapshot) {
    queueMicrotask(() => refreshGlobalLimitsSnapshot().then(paintGlobalLimitsInPlace));
  }
  main.append(sectionHead('Limits & usage', 'Bridge-wide caps, and the domains that consume them.'));
  const error = h('p', { class: 'error-text', id: 'settings-limits-error', role: 'alert' });
  main.append(h('div', { class: 'stack' }, settingsGlobalLimitsPanel(), error, settingsLimitsSection(), settingsSaveBar()));
}

/* Per-domain limits. The domain picker is a link into the Domains sub-pages:
 * limits are edited by the domain's own "Services & limits" section. */
function settingsLimitsSection() {
  const section = h('section', { class: 'panel', id: 'settings-limits', 'aria-label': 'Domain service limits' });
  const body = h('div', { class: 'panel-body stack' });
  section.append(h('div', { class: 'panel-head' }, h('h3', { text: 'Service limits' }),
    h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Per domain' })), body);
  body.append(h('p', { class: 'hint', text: 'Per-domain limits (storage, daily calls, output tokens) live on the domain itself — this is not a shared bridge budget.' }));
  if (state.domainsError) {
    body.append(h('p', { class: 'error-text', role: 'alert', text: state.domainsError + ' Refresh status to try again.' }));
    return section;
  }
  if (!state.domains.length) {
    const add = h('button', { class: 'btn', type: 'button', text: 'Add domain' });
    add.addEventListener('click', () => overviewNavigate('domains', true));
    body.append(emptyState('database', 'No domain to configure', 'Add a domain first, then set its service limits there.', [add]));
    return section;
  }
  const entry = state.domains.find(d => d.domain === state.limitsDomain) || state.domains[0];
  state.limitsDomain = entry.domain;
  const select = customSelect({ value: entry.domain, ariaLabel: 'Domain for service limits',
    options: state.domains.map(d => ({ value: d.domain, label: d.domain })),
    onChange(value) {
      if (value === state.limitsDomain) return;
      state.limitsDomain = value;
      if (state.limitsEdit?.domain !== value) state.limitsEdit = null;
      renderSettingsSection();
    },
  });
  select.querySelector('button').id = 'settings-limits-domain';
  const open = h('button', { class: 'btn', type: 'button', id: 'settings-limits-open' }, icon('arrow-right'), 'Open domain limits');
  open.addEventListener('click', () => navigate('domains', { domain: state.limitsDomain, section: 'services' }));
  body.append(h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'settings-limits-domain', text: 'Domain' }), select)),
    h('div', { class: 'row' }, open,
      h('span', { class: 'hint', text: 'Opens this domain’s limits page.' })));
  return section;
}

/* ---- Storage ----------------------------------------------------------- */
/* The storage settings say where data lives; this is the way to the data
 * itself. Kept in the page head so it is reachable without scrolling past the
 * form. */
function storedDataAction() {
  const open = h('button', { class: 'btn', type: 'button', id: 'settings-open-datastore' }, icon('database'), 'Browse stored data');
  open.addEventListener('click', () => navigate('datastore'));
  return h('div', { class: 'page-actions' }, open);
}

function settingsStorageSection(main) {
  const d = state.settingsDraft;
  const modes = [['sqlite', 'SQLite (local)'], ['mongodb-local', 'MongoDB (local)'], ['mongodb-remote', 'MongoDB (remote)']];
  const modeSelect = customSelect({
    value: d.storage.mode,
    options: modes.map(([v, label]) => ({ value: v, label })),
    ariaLabel: 'Storage mode',
    onChange(v) {
      if (d.storage.mode === v) return;
      const apply = () => { d.storage.mode = v; markDirty(); renderSettingsSection(); };
      if (v !== 'sqlite') {
        confirmDialog({
          title: 'Switch storage mode',
          message: 'Switching the storage mode does not migrate existing data. The bridge must be restarted afterwards.',
          confirmLabel: 'Switch anyway',
          destructive: true,
        }).then(ok => { if (ok) apply(); else modeSelect.setValue(d.storage.mode); });
      } else apply();
    },
  });
  modeSelect.querySelector('.k-select-trigger').id = 'st-mode';

  const dbIn = h('input', { class: 'input', id: 'st-database', value: d.storage.database || 'rbx', autocomplete: 'off', spellcheck: 'false' });
  dbIn.addEventListener('input', () => { d.storage.database = dbIn.value; markDirty(); });

  main.append(sectionHead('Storage', 'Where the bridge keeps datastores, counters and activity.', storedDataAction()));
  main.append(h('div', { class: 'stack' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'Storage' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Mode and database' })),
      h('div', { class: 'panel-body stack' },
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', { for: 'st-mode' }, 'Mode'), modeSelect),
          h('div', { class: 'field' }, h('label', { for: 'st-database' }, 'Database'), dbIn)),
        h('div', { class: 'callout warn' }, icon('circle-alert'),
          h('span', {}, 'Switching the storage mode does not migrate existing data. After saving, the bridge must be restarted.')))),
    settingsSaveBar('A changed storage mode takes effect after a bridge restart.')));
}

/* ---- Backups ----------------------------------------------------------- */
function backupPolicyCopy() {
  const config = state.config?.backups || {};
  return 'Automatic backups run every ' + (config.interval_minutes ?? 60) + ' minutes while the bridge or Web Console server is running; the browser may be closed. '
    + 'The global cap of ' + (config.max_backups ?? 1000) + ' expiring backups covers all domains. Oldest expiring backups are deleted first after the cap or 72 hours. Manual backups marked Keep permanently are exempt.';
}

function backupKindLabel(kind) {
  if (kind === 'manual') return 'Manual';
  if (kind === 'automatic') return 'Automatic';
  if (kind === 'pre-restore') return 'Safety';
  return kind ? String(kind) : '—';
}

function backupBytes(value) {
  const bytes = Number(value);
  if (value === null || value === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function backupTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/* Every stored snapshot, across every domain. Separate from the settings draft:
 * this is a listing of what is on disk right now, not a form value. */
async function loadAllBackups() {
  const store = state.settingsBackups;
  const request = ++store.request;
  store.loading = true;
  store.error = null;
  paintBackupsPanel();
  try {
    const data = await api(API.backupsAll, { method: 'POST', body: {} });
    if (request !== store.request) return;
    store.items = Array.isArray(data.items) ? data.items : [];
    store.loaded = true;
  } catch (err) {
    if (request !== store.request) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.items = [];
    store.error = err.message;
  } finally {
    if (request === store.request) {
      store.loading = false;
      paintBackupsPanel();
    }
  }
}

/* Repaint the list in place: the settings form above it keeps its unsaved edits. */
function paintBackupsPanel() {
  if (state.view !== 'app' || state.tab !== 'settings' || state.settingsSection !== 'backups') return;
  const panel = document.getElementById('settings-backups-list');
  if (panel) panel.replaceWith(storedBackupsPanel());
}

async function deleteStoredBackup(item) {
  if (state.busy.backupDelete || state.busy.backupPurge) return;
  const domain = String(item.domain || '');
  const name = String(item.name || item.id || 'this backup');
  const confirmed = await confirmDialog({
    title: 'Delete backup',
    message: 'Permanently delete “' + name + '” for ' + (domain || 'an unregistered domain') + '? This snapshot cannot be recovered.',
    confirmLabel: 'Delete backup', destructive: true, requireText: domain,
  });
  if (!confirmed) return;
  state.busy.backupDelete = true;
  try {
    await api(API.domainBackupDelete, { method: 'POST', body: { domain, backup_id: item.id, confirmation: domain } });
    toast('Backup deleted');
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    toast(err.message, 'err');
  } finally {
    state.busy.backupDelete = false;
  }
  await loadAllBackups();
}

async function deleteEveryStoredBackup() {
  const store = state.settingsBackups;
  if (state.busy.backupDelete || state.busy.backupPurge) return;
  const count = store.items.length;
  if (!count) return;
  const confirmed = await confirmDialog({
    title: 'Delete all backups',
    message: 'Permanently delete all ' + count + (count === 1 ? ' stored backup' : ' stored backups') + ', for every domain, including manual and safety snapshots? '
      + 'This cannot be undone, and the next automatic backup starts from scratch.',
    confirmLabel: 'Delete all backups', destructive: true, requireText: 'delete all backups',
  });
  if (!confirmed) return;
  state.busy.backupPurge = true;
  try {
    const data = await api(API.backupsDeleteAll, { method: 'POST', body: { confirmation: 'delete all backups' } });
    toast(Number(data.count || 0) + (data.count === 1 ? ' backup deleted' : ' backups deleted'));
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    toast(err.message, 'err');
  } finally {
    state.busy.backupPurge = false;
  }
  await loadAllBackups();
}

function storedBackupRow(item) {
  const name = String(item.name || item.id || 'Unnamed backup');
  const domain = String(item.domain || 'unregistered domain');
  const busy = state.busy.backupDelete || state.busy.backupPurge;
  const kind = h('td', {}, h('span', { class: 'tag', text: backupKindLabel(item.kind) }));
  const domainCell = h('td', { class: 'cell-domain mono', text: domain });
  const nameCell = h('td', { class: 'backup-name', text: name + (item.retained ? ' · Kept permanently' : '') });
  nameCell.setAttribute('data-tooltip', name + ' · ' + domain);
  const actions = h('td', { class: 'cell-actions' });
  const remove = h('button', {
    class: 'btn ghost sm danger', type: 'button', disabled: busy,
    'aria-label': 'Delete backup ' + name + ' of ' + domain, 'data-backup-delete': item.id,
  }, icon('trash-2'), h('span', { text: 'Delete' }));
  remove.addEventListener('click', () => deleteStoredBackup(item));
  actions.append(remove);
  return h('tr', {}, domainCell, nameCell, kind,
    h('td', { class: 'cell-num', text: backupTime(item.created_at) }),
    h('td', { class: 'cell-num', text: backupBytes(item.size_bytes) }),
    actions);
}

function storedBackupsPanel() {
  const store = state.settingsBackups;
  const loading = store.loading;
  const busy = state.busy.backupDelete || state.busy.backupPurge;
  const items = store.items;
  const totalBytes = items.reduce((sum, item) => sum + (Number(item.size_bytes) || 0), 0);
  const domains = new Set(items.map(item => String(item.domain || ''))).size;

  const refresh = h('button', { class: 'btn sm', type: 'button', disabled: loading || busy, 'aria-busy': String(loading), onclick: loadAllBackups },
    icon('refresh-cw'), 'Refresh');
  const purge = h('button', { class: 'btn danger sm', type: 'button', disabled: loading || busy || !items.length,
    onclick: deleteEveryStoredBackup }, icon('trash-2'), 'Delete all');
  const panel = h('div', { class: 'panel', id: 'settings-backups-list' },
    h('div', { class: 'panel-head' },
      h('h3', { text: 'All stored backups' }),
      h('span', { class: 'grow' }),
      h('span', { class: 'panel-note', text: loading ? 'Loading …' : (items.length
        ? items.length + (items.length === 1 ? ' backup' : ' backups') + ' · ' + domains + (domains === 1 ? ' domain' : ' domains') + ' · ' + backupBytes(totalBytes)
        : 'Nothing stored') }),
      refresh, purge,
      store.error ? h('span', { class: 'error-text', role: 'alert', text: store.error }) : null));

  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(loading) });
  if (loading && !items.length) {
    body.append(h('div', { class: 'panel-body', role: 'status' }, spinnerRow()));
  } else if (store.error && !items.length) {
    body.append(emptyState('circle-alert', 'Backups are unavailable', store.error, [
      h('button', { class: 'btn', onclick: loadAllBackups }, icon('refresh-cw'), 'Try again'),
    ]));
  } else if (!items.length) {
    body.append(emptyState('hard-drive', 'No backups stored',
      'No domain has a stored snapshot right now. Automatic backups run while the bridge or Web Console server is running.'));
  } else {
    const table = h('table', { 'aria-label': 'All stored backups' });
    table.append(h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Domain' }),
      h('th', { scope: 'col', text: 'Backup' }),
      h('th', { scope: 'col', text: 'Type' }),
      h('th', { scope: 'col', text: 'Created' }),
      h('th', { scope: 'col', text: 'Size' }),
      h('th', { scope: 'col', text: '' }))));
    const rows = h('tbody');
    for (const item of items) rows.append(storedBackupRow(item));
    table.append(rows);
    body.append(h('div', { class: 'table-wrap' }, table));
  }
  panel.append(body);
  return panel;
}

function backupSchedulePanel() {
  const content = h('div', { class: 'stack', role: 'status' });
  const refresh = h('button', { class: 'btn sm', type: 'button', onclick: load }, icon('refresh-cw'), 'Refresh schedule');
  async function load() {
    refresh.disabled = true; refresh.setAttribute('aria-busy', 'true');
    try {
      const report = await api(API.backupSchedule, { method: 'POST', body: {} });
      if (!content.isConnected) return;
      content.replaceChildren();
      for (const item of report.domains || []) content.append(h('p', { class: 'hint', text:
        item.domain + ' · Last successful automatic backup: ' + (item.last_success ? backupTime(item.last_success) : 'none yet')
        + ' · Next due: ' + (item.next_due ? backupTime(item.next_due) : 'next scheduler check') }));
      if (!report.domains?.length) content.append(h('p', { class: 'hint', text: 'Add a domain to schedule backups.' }));
    } catch (error) {
      if (content.isConnected && !(error instanceof UnauthorizedError)) content.replaceChildren(h('p', { class: 'error-text', text: error.message }), diagnosisButton(true));
    } finally { refresh.disabled = false; refresh.setAttribute('aria-busy', 'false'); }
  }
  queueMicrotask(load);
  return h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', { text: 'Backup schedule' }), refresh),
    h('div', { class: 'panel-body' }, h('p', { class: 'hint', text: 'Checked every minute while the bridge or console server runs. Missed checks are retried on the next run.' }), content));
}

function settingsBackupsSection(main) {
  const d = state.settingsDraft.backups;
  const fields = h('div', { class: 'form-grid' });
  const error = h('p', { class: 'error-text', id: 'settings-backups-error', role: 'alert' });
  for (const [key, label, max, hint] of [
    ['interval_minutes', 'Automatic backup interval (minutes)', 10080, 'Whole minutes, from 1 to 10,080 (7 days).'],
    ['max_backups', 'Maximum backups (global)', 100000, 'Total retained across all domains, from 1 to 100,000.'],
  ]) {
    const id = 'st-backup-' + key;
    const input = h('input', { class: 'input', id, type: 'number', min: 1, max, step: 1, required: true, value: d[key], disabled: state.busy.settings, 'aria-describedby': id + '-hint' });
    input.addEventListener('input', () => { d[key] = input.value; error.textContent = ''; markDirty(); });
    fields.append(h('div', { class: 'field' }, h('label', { for: id, text: label }), input, h('span', { class: 'hint', id: id + '-hint', text: hint })));
  }
  main.append(sectionHead('Backups', 'Schedule, global retention and every stored snapshot.'));
  main.append(h('div', { class: 'stack backup-settings', id: 'settings-backups', 'aria-labelledby': 'settings-backups-title' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { id: 'settings-backups-title', text: 'Backups' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Schedule & global retention' })),
      h('div', { class: 'panel-body stack' }, fields,
        h('p', { class: 'hint policy-hint', text: 'The cap covers expiring backups across all domains. Oldest are deleted first; 72-hour expiry also applies. Manual backups marked Keep permanently are exempt. Lowering the cap can delete expiring backups.' }), error)),
    backupSchedulePanel(), storedBackupsPanel(),
    settingsSaveBar('The bridge or Web Console server schedules backups. Save changes applies the policy without a restart.')));
  /* The listing is read-only output, so it loads on its own instead of with the
   * draft. A schedule edit repaints the page and must not refetch it. */
  if (!state.settingsBackups.loaded && !state.settingsBackups.loading) queueMicrotask(loadAllBackups);
}

/* ---- AI ---------------------------------------------------------------- */
function paintPool(pool) {
  const d = state.settingsDraft;
  pool.replaceChildren();
  for (const id of d.ai.models) {
    const isDefault = id === d.ai.model;
    const choose = h('button', { class: 'btn ghost sm', type: 'button', disabled: isDefault, 'aria-label': 'Use ' + id + ' as default', text: isDefault ? 'Default' : 'Make default' });
    choose.addEventListener('click', () => { d.ai.model = id; markDirty(); renderSettingsSection(); });
    const remove = h('button', { class: 'btn ghost sm icon-only ai-pool-remove', type: 'button', 'aria-label': 'Remove ' + id }, icon('x'));
    remove.addEventListener('click', () => { d.ai.models = d.ai.models.filter(m => m !== id); if (isDefault) d.ai.model = d.ai.models[0] || ''; markDirty(); renderSettingsSection(); });
    const slash = id.indexOf('/');
    const name = slash >= 0 ? id.slice(slash + 1) : id;
    const provider = slash >= 0 ? id.slice(0, slash) : 'Model';
    const label = h('div', { class: 'ai-model-id', title: id },
      h('span', { class: 'ai-model-name', text: name }),
      h('span', { class: 'ai-model-provider', text: provider }));
    const status = isDefault
      ? h('span', { class: 'ai-default-badge' }, icon('check'), 'Default')
      : choose;
    pool.append(h('div', { class: 'ai-pool-row' + (isDefault ? ' is-default' : '') },
      label, h('div', { class: 'ai-pool-actions' }, status, remove)));
  }
  if (!d.ai.models.length) pool.append(h('div', { class: 'ai-pool-empty' }, icon('bot'), h('strong', { text: 'Choose the models your bridge can use' }), h('p', { class: 'hint', text: 'Add models from the provider catalog or enter an exact ID. GenAI needs at least one model.' })));
}

/* ---- CatWeb documentation knowledge base -------------------------------- */

/* Read-only view of the downloaded index plus a test search. None of this
 * belongs to the settings draft: it describes what is on disk right now, so it
 * is loaded separately and repainted in place without touching the form. */
async function loadDocsStatus() {
  const store = state.docs;
  store.loading = true;
  store.statusError = null;
  paintDocsPanel();
  try {
    store.status = await api(API.docsStatus, { method: 'POST', body: {} });
    store.loaded = true;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.status = null;
    store.statusError = err.message;
  } finally {
    store.loading = false;
    paintDocsPanel();
  }
}

async function refreshDocsIndex() {
  const store = state.docs;
  if (store.busy) return;
  store.busy = true;
  store.statusError = null;
  paintDocsPanel();
  try {
    const data = await api(API.docsRefresh, { method: 'POST', body: {} });
    store.status = data.status || store.status;
    store.loaded = true;
    toast(data.changed ? 'CatWeb documentation downloaded and indexed.' : 'CatWeb documentation is already current.', 'info');
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.statusError = err.message;
    toast(err.message, 'err');
  } finally {
    store.busy = false;
    paintDocsPanel();
  }
}

async function runDocsSearch() {
  const store = state.docs;
  const input = document.getElementById('docs-query');
  const query = (input ? input.value : store.query || '').trim();
  store.query = query;
  store.searched = false;
  store.results = [];
  if (!query) { store.searchError = null; paintDocsPanel(); return; }
  store.searching = true;
  store.searchError = null;
  paintDocsPanel();
  try {
    const data = await api(API.docsSearch, { method: 'POST', body: { query, limit: 5 } });
    store.results = Array.isArray(data.results) ? data.results : [];
    store.status = data.status || store.status;
    store.searched = true;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.searchError = err.message;
  } finally {
    store.searching = false;
    paintDocsPanel();
  }
}

function docsStatusText() {
  const store = state.docs;
  const status = store.status;
  if (store.statusError) return store.statusError;
  if (!status) return store.loading ? 'Loading …' : 'Not checked yet.';
  if (!status.enabled && !status.available) return 'Off — the AI answers without documentation excerpts.';
  if (!status.available) return 'Not downloaded yet. Save the settings, then press “Refresh now”.';
  const parts = [
    status.files + (status.files === 1 ? ' text file' : ' text files'),
    Math.round((status.chars || 0) / 1024) + ' KB indexed',
  ];
  if (status.sha) parts.push('commit ' + String(status.sha).slice(0, 7));
  if (status.fetched_at) parts.push('updated ' + new Date(status.fetched_at * 1000).toLocaleString());
  if (status.stale) parts.push('refresh due');
  return parts.join(' · ');
}

function docsPanel() {
  const store = state.docs;
  const status = store.status;
  const list = h('ul', { class: 'docs-results', id: 'docs-search-results' });
  if (store.searching) list.append(h('li', { class: 'hint', text: 'Searching the indexed documentation …' }));
  else if (store.searchError) list.append(h('li', { class: 'error-text', text: store.searchError }));
  else if (store.searched && !store.results.length) list.append(h('li', { class: 'hint', text: 'No matching excerpt. The repository may not be indexed yet, or the term does not occur in it.' }));
  for (const hit of store.results) {
    list.append(h('li', { class: 'docs-result' },
      h('div', { class: 'row' }, h('span', { class: 'mono docs-path', text: String(hit.path || '') }),
        h('span', { class: 'grow' }), h('span', { class: 'chip', text: 'score ' + hit.score })),
      hit.title ? h('span', { class: 'hint', text: hit.title }) : null,
      h('p', { class: 'docs-snippet', text: String(hit.snippet || '') })));
  }

  const query = h('input', { class: 'input', id: 'docs-query', value: store.query || '',
    placeholder: 'e.g. JSONScript Action 88', autocomplete: 'off', 'aria-label': 'Test documentation search' });
  query.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); runDocsSearch(); }
  });
  const search = h('button', { class: 'btn', type: 'button', id: 'docs-search' }, icon('zoom-in'), 'Test search');
  search.disabled = !!store.searching;
  search.addEventListener('click', runDocsSearch);
  const refresh = h('button', { class: 'btn', type: 'button', id: 'docs-refresh' }, icon('refresh-cw'), 'Refresh now');
  refresh.disabled = !!store.busy || !!store.loading;
  refresh.setAttribute('aria-busy', String(!!store.busy || !!store.loading));
  refresh.addEventListener('click', refreshDocsIndex);

  const panel = h('div', { class: 'panel', id: 'settings-docs-panel' },
    h('div', { class: 'panel-head' }, h('h3', { text: 'Indexed documentation' }), h('span', { class: 'grow' }),
      h('span', { class: 'panel-note', text: status && status.repo ? status.repo : 'CatWeb docs' })),
    h('div', { class: 'panel-body stack' },
      h('p', { class: 'hint', id: 'docs-status', text: docsStatusText() }),
      h('div', { class: 'row' }, refresh),
      h('div', { class: 'row docs-search-row' }, query, search),
      list));
  return panel;
}

/* Repaint in place: the save form above keeps its unsaved edits. */
function paintDocsPanel() {
  if (state.view !== 'app' || state.tab !== 'settings' || state.settingsSection !== 'ai') return;
  const panel = document.getElementById('settings-docs-panel');
  if (panel) panel.replaceWith(docsPanel());
}

function settingsAiSection(main) {
  const d = state.settingsDraft;
  const options = (state.aiProviders || []).map(p => ({ value: p.value, label: p.label }));
  if (!options.some(p => p.value === d.ai.provider)) options.push({ value: d.ai.provider, label: d.ai.provider + ' (saved)' });
  function changed() { markDirty(); renderSettingsSection(); }
  const provider = customSelect({ value: d.ai.provider, options, ariaLabel: 'Provider', onChange(value) {
    if (value === d.ai.provider) return;
    const apply = () => {
      const preset = state.aiProviders.find(p => p.value === value);
      Object.assign(d.ai, { provider: value, base_url: preset.base_url || '', protocol: preset.protocol, mode: preset.mode, models: [], model: '' });
      delete d.secrets.ai_api_key;
      changed();
    };
    if (d.ai.models.length || Object.hasOwn(d.secrets, 'ai_api_key')) confirmDialog({ title: 'Change provider', message: 'This clears the current model pool and unsaved AI key from the draft. The saved connection stays unchanged until you save.', confirmLabel: 'Change provider' }).then(ok => { if (ok) apply(); else provider.setValue(d.ai.provider); });
    else apply();
  } });
  provider.querySelector('button').id = 'st-provider';
  const protocol = customSelect({ value: d.ai.protocol, options: state.aiProtocols, ariaLabel: 'API protocol', onChange(value) { d.ai.protocol = value; changed(); } });
  protocol.querySelector('button').id = 'st-protocol';
  const mode = customSelect({ value: d.ai.mode, options: [{ value: 'local', label: 'Local / no key required' }, { value: 'cloud', label: 'Cloud / API key required' }], ariaLabel: 'AI mode', onChange(value) { d.ai.mode = value; changed(); } });
  mode.querySelector('button').id = 'st-ai-mode';
  const url = h('input', { class: 'input mono', id: 'st-baseurl', value: d.ai.base_url, placeholder: 'https://api.example.com/v1', autocomplete: 'off', spellcheck: 'false' });
  url.addEventListener('input', () => { d.ai.base_url = url.value; markDirty(); });
  const key = h('input', { class: 'input', id: 'sec-ai', type: 'password', value: d.secrets.ai_api_key || '', autocomplete: 'new-password', placeholder: secretFlags().ai_api_key ? 'Saved — enter a key for a new connection' : 'API key (optional for local servers)' });
  const keyNote = h('span', { class: 'hint', text: d.secrets.ai_api_key === null ? 'Key will be removed when you save.' : 'Encrypted on the server. Fetch uses this draft key; a saved key is reused only for the saved connection.' });
  key.addEventListener('input', () => { if (key.value) d.secrets.ai_api_key = key.value; else delete d.secrets.ai_api_key; setPopText(keyNote, key.value ? 'Draft key — sent only to the endpoint above. Save changes to store it.' : 'No replacement entered. The saved key stays unchanged.'); markDirty(); });
  const removeKey = h('button', { class: 'btn ghost sm', type: 'button', text: 'Remove saved key' });
  removeKey.addEventListener('click', () => { d.secrets.ai_api_key = null; key.value = ''; setPopText(keyNote, 'Key will be removed when you save.'); markDirty(); });
  const add = h('button', { class: 'btn', type: 'button', id: 'ai-add-models' }, icon('plus'), 'Add models');
  add.addEventListener('click', openModelPicker);
  const pool = h('div', { class: 'ai-pool-list scroll-slim', tabindex: '0', role: 'region', 'aria-label': 'Active model pool' });
  paintPool(pool);
  const poolCount = h('span', { class: 'chip', text: String(d.ai.models.length) });
  const temperature = h('input', { class: 'input', id: 'st-ai-temperature', type: 'text', value: d.ai.temperature, placeholder: '0.7', autocomplete: 'off', inputmode: 'decimal' });
  temperature.setAttribute('aria-label', 'Temperature');
  temperature.addEventListener('input', () => { d.ai.temperature = temperature.value; markDirty(); });
  const maxTokens = h('input', { class: 'input', id: 'st-ai-max-tokens', type: 'text', value: d.ai.max_tokens, placeholder: '1024', autocomplete: 'off', inputmode: 'numeric' });
  maxTokens.setAttribute('aria-label', 'Max output tokens');
  maxTokens.addEventListener('input', () => { d.ai.max_tokens = maxTokens.value; markDirty(); });
  const aiError = h('p', { class: 'error-text', id: 'settings-ai-error', role: 'alert' });
  const promptArea = h('textarea', { class: 'textarea', id: 'st-ai-systemprompt', rows: '5',
    placeholder: 'You are the assistant of a Roblox experience built with CatWeb. Answer in the language of the question.',
    spellcheck: 'false', maxlength: '8000' });
  promptArea.value = d.ai.system_prompt || '';
  promptArea.addEventListener('input', () => { d.ai.system_prompt = promptArea.value; markDirty(); });
  const docsToggle = checkBox({ id: 'st-docs-enabled', role: 'switch', checked: d.ai.docs.enabled,
    ariaLabel: 'Search the CatWeb documentation' });
  docsToggle.addEventListener('change', () => { d.ai.docs.enabled = docsToggle.checked; markDirty(); });
  const docsRepo = h('input', { class: 'input mono', id: 'st-docs-repo', value: d.ai.docs.repo,
    placeholder: 'Mailo037/catweb-docs', autocomplete: 'off', spellcheck: 'false' });
  docsRepo.addEventListener('input', () => { d.ai.docs.repo = docsRepo.value; markDirty(); });
  const docsResults = h('input', { class: 'input', id: 'st-docs-results', type: 'text', value: d.ai.docs.results,
    autocomplete: 'off', inputmode: 'numeric' });
  docsResults.addEventListener('input', () => { d.ai.docs.results = docsResults.value; markDirty(); });
  const docsChars = h('input', { class: 'input', id: 'st-docs-max-chars', type: 'text', value: d.ai.docs.max_chars,
    autocomplete: 'off', inputmode: 'numeric' });
  docsChars.addEventListener('input', () => { d.ai.docs.max_chars = docsChars.value; markDirty(); });
  const docsHours = h('input', { class: 'input', id: 'st-docs-refresh-hours', type: 'text', value: d.ai.docs.refresh_hours,
    autocomplete: 'off', inputmode: 'numeric' });
  docsHours.addEventListener('input', () => { d.ai.docs.refresh_hours = docsHours.value; markDirty(); });

  main.append(sectionHead('AI & models', 'Provider connection, the models the bridge may use, and what the AI knows.'));
  const section = h('div', { class: 'section ai-settings', id: 'settings-ai', tabindex: '-1', 'aria-label': 'GenAI settings' });
  section.append(h('div', { class: 'stack' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'AI connections & models' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Provider → protocol → active pool' })),
      h('div', { class: 'panel-body stack' },
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', { for: 'st-provider' }, 'Provider preset'), provider),
          h('div', { class: 'field' }, h('label', { for: 'st-protocol' }, 'API protocol'), protocol),
          h('div', { class: 'field span-2' }, h('label', { for: 'st-baseurl' }, 'Base URL'), url, h('span', { class: 'hint', text: 'The protocol controls the request format, not the vendor. Include /v1 when your provider requires it.' })),
          h('div', { class: 'field span-2' }, h('label', { for: 'st-ai-mode' }, 'Connection mode'), mode),
          h('div', { class: 'field span-2' }, h('label', { for: 'sec-ai' }, 'AI API key'), key, keyNote, h('div', { class: 'row' }, removeKey))),
        h('div', { class: 'ai-pool' }, h('div', { class: 'row ai-pool-head' }, h('h3', { text: 'Active model pool' }), poolCount, h('span', { class: 'grow' }), add), pool,
          h('p', { class: 'hint', text: 'Requests may select any model in this pool. “default” uses the marked model. Domain model restrictions still apply. ' + (liveApply() ? 'Saved changes reach the running bridge at once.' : 'Save changes, then restart the bridge.') })))),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'Generation' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Every request' })),
      h('div', { class: 'panel-body stack' },
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', { for: 'st-ai-temperature' }, 'Temperature'), temperature,
            h('span', { class: 'hint', text: 'Sampling temperature for every completion, 0–2. Lower is more deterministic.' })),
          h('div', { class: 'field' }, h('label', { for: 'st-ai-max-tokens' }, 'Max output tokens'), maxTokens,
            h('span', { class: 'hint', text: 'Output cap for every completion, 1–1000000. A domain’s own output limit still lowers it.' }))))),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'System prompt & CatWeb knowledge' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Prepended to every request' })),
      h('div', { class: 'panel-body stack' },
        h('div', { class: 'field' }, h('label', { for: 'st-ai-systemprompt' }, 'System prompt'), promptArea,
          h('span', { class: 'hint', text: 'Instruction for every completion. A domain can replace it with its own prompt on its domain page. Up to 8000 characters.' })),
        h('div', { class: 'docs-block' },
          h('label', { class: 'docs-toggle', for: 'st-docs-enabled' }, docsToggle, h('span', { text: 'Let the AI search the CatWeb documentation' })),
          h('p', { class: 'hint', text: 'The bridge downloads the GitHub repository below over HTTPS, indexes its text files and prepends the best matching excerpts to the system prompt. Off by default: nothing is downloaded until you enable it and press “Refresh now”.' }),
          h('div', { class: 'form-grid' },
            h('div', { class: 'field span-2' }, h('label', { for: 'st-docs-repo' }, 'Documentation repository'), docsRepo,
              h('span', { class: 'hint', text: 'Public GitHub repository written as owner/name. Its default branch is indexed; vendor folders such as node_modules are skipped.' })),
            h('div', { class: 'field' }, h('label', { for: 'st-docs-results' }, 'Excerpts per request'), docsResults,
              h('span', { class: 'hint', text: 'How many documentation excerpts may be added, 1–10.' })),
            h('div', { class: 'field' }, h('label', { for: 'st-docs-max-chars' }, 'Documentation context size'), docsChars,
              h('span', { class: 'hint', text: 'Character budget for those excerpts, 500–50000. The system prompt is not counted.' })),
            h('div', { class: 'field' }, h('label', { for: 'st-docs-refresh-hours' }, 'Refresh interval (hours)'), docsHours,
              h('span', { class: 'hint', text: 'How old the local copy may get before the bridge refreshes it in the background. 0 = only manual refreshes.' })))))),
    docsPanel(),
    aiError,
    settingsSaveBar('A changed connection or pool takes effect after a bridge restart.')));
  if (state.busy.settings) section.querySelectorAll('input, button, textarea').forEach(el => { el.disabled = true; });
  main.append(section);
  if (!state.docs.loaded && !state.docs.loading) queueMicrotask(loadDocsStatus);
}

function settingsNotificationsSection(main) {
  const draft = state.settingsDraft, cfg = draft.notifications;
  main.append(sectionHead('Webhooks', 'Status updates in Discord or your own endpoint.'));
  const body = h('div', { class: 'panel-body stack' });
  const error = h('p', { class: 'error-text', role: 'alert' });
  function toggle(label, key, source = cfg) {
    const input = checkBox({ id: 'notify-' + key, ariaLabel: label });
    input.checked = source[key];
    input.addEventListener('change', () => { source[key] = input.checked; markDirty(); });
    return h('label', { class: 'row', for: 'notify-' + key }, input, h('span', { text: label }));
  }
  body.append(h('p', { class: 'hint', text: 'A webhook sends an HTTP message when an event happens. Only status, domain and service names are sent — no prompts, stored values or credentials.' }),
    toggle('Enable notifications', 'enabled'));
  const format = customSelect({ value: cfg.format, ariaLabel: 'Webhook format', options: [
    { value: 'json', label: 'Generic JSON' }, { value: 'discord', label: 'Discord' }],
    onChange(value) { cfg.format = value; markDirty(); } });
  const url = h('input', { class: 'input', id: 'notify-url', type: 'password', autocomplete: 'new-password',
    value: draft.secrets.webhook_url || '', placeholder: secretFlags().webhook_url ? 'Saved — enter a new URL to replace' : 'https://…' });
  url.addEventListener('input', () => { if (url.value) draft.secrets.webhook_url = url.value; else delete draft.secrets.webhook_url; markDirty(); });
  const remove = h('button', { class: 'btn ghost sm', type: 'button', onclick() {
    draft.secrets.webhook_url = null; cfg.enabled = false; url.value = ''; markDirty(); renderSettingsSection();
  } }, 'Remove saved URL');
  const consoleUrl = h('input', { class: 'input', id: 'notify-console', type: 'url', value: cfg.console_url, placeholder: 'https://your-console.example/settings/notifications' });
  consoleUrl.addEventListener('input', () => { cfg.console_url = consoleUrl.value; markDirty(); });
  const cooldown = h('input', { class: 'input', id: 'notify-cooldown', type: 'number', min: 60, max: 86400, value: cfg.cooldown_seconds });
  cooldown.addEventListener('input', () => { cfg.cooldown_seconds = cooldown.value; markDirty(); });
  body.append(h('div', { class: 'field' }, h('label', { for: 'notify-url' }, 'Webhook URL (HTTPS)'), url, remove), format,
    h('div', { class: 'field' }, h('label', { for: 'notify-console' }, 'Console link in messages (optional)'), consoleUrl),
    h('p', { class: 'hint', text: 'Use the reachable HTTPS address of this console, without a login token. Discord recipients can open it, sign in and restart the bot here.' }));
  const eventOptions = Object.entries({ bridge_online: 'Bot online / recovered', bridge_offline: 'Bot offline / connection lost',
    genai_limit: 'GenAI request or output limit reached', datastore_limit: 'Datastore or chat storage limit reached', service_limit: 'Other service limit reached' })
    .map(([value, label]) => ({ value, label }));
  const events = customSelect({ multiple: true, floating: true, ariaLabel: 'Notification events',
    options: eventOptions, value: eventOptions.filter(option => cfg.events[option.value]).map(option => option.value),
    onChange(values) { for (const option of eventOptions) cfg.events[option.value] = values.includes(option.value); markDirty(); } });
  events.classList.add('transfer-picker');
  body.append(h('div', { class: 'field' }, h('span', { class: 'group-label', text: 'Notification events' }), events));
  body.append(h('div', { class: 'field' }, h('label', { for: 'notify-cooldown' }, 'Repeat limit alerts after (seconds)'), cooldown),
    h('p', { class: 'hint', text: 'Limits notify when a request is refused. Cooldown is per domain and service. Keep the web console running to detect a bot process crash. A PC or network outage needs an external monitor.' }));
  const actions = h('div', { class: 'row' });
  const history = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
  async function perform(button, work) {
    button.disabled = true; button.setAttribute('aria-busy', 'true'); error.textContent = '';
    try { await work(); } catch (err) { if (err instanceof UnauthorizedError) handleUnauthorized(); else error.textContent = err.message; }
    finally { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
  }
  async function refresh() {
    const data = await api(API.notifications);
    history.replaceChildren(...(data.items.length ? data.items.map(item => h('p', { class: 'hint', text:
      new Date(item.created * 1000).toLocaleString() + ' · ' + item.kind + (item.domain ? ' · ' + item.domain : '') + ' · ' + item.status + (item.error ? ' · ' + item.error : '') })) : [h('p', { class: 'hint', text: 'No deliveries yet.' })]));
  }
  const test = h('button', { class: 'btn', type: 'button', id: 'notify-test' }, 'Send test');
  test.addEventListener('click', () => perform(test, async () => {
    if (settingsSectionDirty('notifications')) throw new Error('Save webhook changes before testing.');
    await api(API.notificationTest, { method: 'POST', body: {} }); toast('Test queued. Refresh delivery status in a moment.', 'info'); await refresh();
  }));
  const refreshBtn = h('button', { class: 'btn ghost', type: 'button' }, icon('refresh-cw'), 'Refresh deliveries');
  refreshBtn.addEventListener('click', () => perform(refreshBtn, refresh));
  actions.append(test, refreshBtn);
  body.append(h('div', { class: 'notification-delivery' }, actions, error, history));
  const control = h('div', { class: 'panel-body stack' },
    h('p', { class: 'hint', text: 'Restart uses your saved configuration. It does not reset quotas or delete domain data.' }),
    h('button', { class: 'btn', type: 'button', id: 'notify-restart', onclick: () => applySaved() }, icon('refresh-cw'), 'Restart bot'),
    toggle('Enable remote restart webhook', 'remote_restart'));
  const endpoint = new URL('api/webhooks/restart', new URL('../../', import.meta.url)).href;
  control.append(h('p', { class: 'hint', text: 'External tools: POST an empty JSON object to the endpoint below with Authorization: Bearer <token>. The console must be running and reachable. Maximum one restart per minute.' }),
    copyField(h('input', { class: 'input mono', readonly: true, value: endpoint, 'aria-label': 'Restart endpoint' }), { label: 'Copy endpoint' }));
  const tokenOutput = h('input', { class: 'input mono', type: 'password', readonly: true, 'aria-label': 'New restart token', placeholder: 'Generate a token — shown only once here' });
  const tokenField = copyField(tokenOutput, { label: 'Copy token', reveal: true });
  const generate = h('button', { class: 'btn ghost', type: 'button' }, 'Generate / rotate restart token');
  generate.addEventListener('click', () => perform(generate, async () => {
    if (!await confirmDialog({ title: 'Rotate restart token', message: 'Existing integrations will need the new token.', confirmLabel: 'Generate token' })) return;
    const result = await api(API.restartToken, { method: 'POST', body: {} }); tokenOutput.value = result.token; tokenField._sync();
  }));
  control.append(generate, tokenField, h('p', { class: 'hint', text: 'Store this token in your automation. It is never included in outgoing notifications. Save the remote restart switch to activate it.' }));
  main.append(h('div', { class: 'stack' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'Notifications' }),
        h('span', { class: 'panel-note', text: 'Events & delivery' })), body),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', { text: 'Remote restart' }),
        h('span', { class: 'panel-note', text: 'Endpoint & access token' })), control),
    settingsSaveBar('Webhook changes take effect immediately after saving.')));
  queueMicrotask(() => perform(refreshBtn, refresh));
}

/* ---- Credentials ------------------------------------------------------- */
function settingsSecretsSection(main) {
  const flags = secretFlags();
  const panel = h('div', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h3', { text: 'Credentials' }), h('span', { class: 'grow' }), h('span', { class: 'panel-note', text: 'Stored encrypted on the server.' })),
    h('div', { class: 'panel-body stack' }));

  const mongoIn = h('input', { class: 'input', type: 'password', id: 'sec-mongo', value: state.settingsDraft.secrets.mongodb_uri || '', placeholder: state.settingsDraft.secrets.mongodb_uri === null ? 'Will be removed on save' : flags.mongodb_uri ? 'Set — a new entry replaces it' : 'Not set yet', autocomplete: 'new-password' });
  mongoIn.addEventListener('input', () => { if (mongoIn.value) state.settingsDraft.secrets.mongodb_uri = mongoIn.value; else delete state.settingsDraft.secrets.mongodb_uri; markDirty(); });
  mongoIn.setAttribute('aria-label', 'MongoDB URI');

  const mongoStatus = h('span', { class: 'secret-item' + (flags.mongodb_uri ? ' ok' : '') }, icon(flags.mongodb_uri ? 'circle-check' : 'circle-x'), h('span', { class: 'name', text: 'MongoDB URI' }), h('span', { class: 'grow' }), flags.mongodb_uri ? 'set' : 'not set');

  const clrMongo = h('button', { class: 'btn ghost sm', type: 'button' }, 'Remove');
  clrMongo.addEventListener('click', () => { state.settingsDraft.secrets.mongodb_uri = null; mongoIn.value = ''; mongoIn.placeholder = 'Will be removed on save'; markDirty(); });

  panel.querySelector('.panel-body').append(
    h('div', { class: 'field' }, h('label', { for: 'sec-mongo' }, 'MongoDB-URI'), mongoIn,
      h('div', { class: 'row' }, mongoStatus, clrMongo)),
    h('div', { class: 'hint', text: 'Leave empty to keep the stored value. “Remove” deletes the entry on save.' }));

  main.append(sectionHead('Credentials', 'Secrets the bridge stores for you — they are never read back into the browser.'));
  main.append(h('div', { class: 'stack' }, panel,
    h('div', { class: 'hint', text: 'The AI API key lives with its connection on “AI & models”.' }),
    accessPanel(),
    settingsSaveBar('Credentials are stored encrypted; rotating one needs a bridge restart.')));
  if (!state.access.loaded && !state.access.loading) queueMicrotask(loadAccessStatus);
}

/* ---- Console access (Settings → Credentials) ---------------------------- */

/* The credential that unlocks this console. Read and changed immediately, never
 * through the settings draft: it protects the console itself, so “saved but not
 * applied” would be exactly the wrong state for it. */
async function loadAccessStatus() {
  const store = state.access;
  store.loading = true;
  store.error = null;
  paintAccessPanel();
  try {
    store.status = await api(API.accessStatus, { method: 'POST', body: {} });
    if (!store.mode) store.mode = store.status.mode;
    if (!store.scheme) store.scheme = store.status.scheme;
    store.minLength = Number(store.status.min_length) || store.minLength;
    store.loaded = true;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.status = null;
    store.error = err.message;
  } finally {
    store.loading = false;
    paintAccessPanel();
  }
}

async function useGeneratedAccess() {
  const store = state.access;
  if (store.busy) return;
  const confirmed = await confirmDialog({
    title: 'Use a generated access token',
    message: 'The console will accept the random token printed by "cwbridge web" again, and the stored password is deleted — switching back later asks for a new one. Other signed-in browsers are signed out.',
    confirmLabel: 'Delete password',
    destructive: true,
  });
  if (!confirmed) return;
  store.busy = true;
  store.error = null;
  store.notice = null;
  paintAccessPanel();
  try {
    const data = await api(API.accessGenerated, { method: 'POST', body: {} });
    store.status = data.status;
    store.mode = data.status.mode;
    store.notice = data.notice || 'The stored password was deleted. Sign-in uses the printed token again.';
    store.password = '';
    store.confirmation = '';
    toast('Generated access token enabled.', 'info');
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.error = err.message;
  } finally {
    store.busy = false;
    paintAccessPanel();
  }
}

async function saveConsolePassword() {
  const store = state.access;
  if (store.busy) return;
  const password = store.password || '';
  if (password.length < store.minLength) {
    store.error = `The console password must be at least ${store.minLength} characters.`;
    paintAccessPanel();
    return;
  }
  if (password !== (store.confirmation || '')) {
    store.error = 'The two password entries do not match.';
    paintAccessPanel();
    return;
  }
  store.busy = true;
  store.error = null;
  store.notice = null;
  paintAccessPanel();
  try {
    const data = await api(API.accessPassword, {
      method: 'POST',
      body: { password, confirmation: store.confirmation || '', scheme: store.scheme },
    });
    store.status = data.status;
    store.mode = data.status.mode;
    store.password = '';
    store.confirmation = '';
    const ended = Number(data.sessions_ended) || 0;
    store.notice = 'The password is set. Sign in with it from now on.'
      + (ended ? ` ${ended} other signed-in browser${ended === 1 ? ' was' : 's were'} signed out.` : '');
    toast('Console password set.', 'info');
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.error = err.message;
  } finally {
    store.busy = false;
    paintAccessPanel();
  }
}

function accessModeText(status) {
  if (!status) return 'Not checked yet.';
  if (status.mode === 'password') {
    const when = status.set_at ? new Date(status.set_at).toLocaleString() : null;
    return 'Own password' + (when ? ` (set ${when})` : '')
      + ` · hashed with ${status.scheme === 'scrypt' ? 'scrypt' : 'PBKDF2-HMAC-SHA256'}, never stored in plain text.`;
  }
  return 'Generated access token: a new random one on every start of “cwbridge web”, printed in the terminal.';
}

function accessPanel() {
  const store = state.access;
  const status = store.status;
  const mode = store.mode || (status && status.mode) || 'generated';
  const scheme = store.scheme || (status && status.scheme) || 'pbkdf2_sha256';
  const busy = !!store.busy;

  const modeSelect = customSelect({
    value: mode,
    options: [
      { value: 'generated', label: 'Generated access token (new every start)' },
      { value: 'password', label: 'Own password' },
    ],
    ariaLabel: 'Console sign-in method',
    onChange(value) {
      if (value === mode) return;
      if (value === 'generated') { useGeneratedAccess(); return; }
      store.mode = 'password';
      store.notice = null;
      store.error = null;
      paintAccessPanel();
    },
  });
  modeSelect.querySelector('button').id = 'access-mode';
  if (busy) { modeSelect.querySelector('button').disabled = true; }

  const body = h('div', { class: 'panel-body stack' },
    h('p', { class: 'hint', id: 'access-status', text: accessModeText(status) }),
    h('div', { class: 'field' }, h('label', { for: 'access-mode' }, 'Sign-in method'), modeSelect));

  if (status && status.active_mode && status.active_mode !== status.mode) {
    body.append(h('p', { class: 'hint', id: 'access-active-note', text:
      `The running console still signs in with ${status.active_mode === 'password' ? 'the password' : 'a token'}. `
      + 'Restart “cwbridge web” to apply the stored setting.' }));
  }
  if (mode === 'generated' && status && status.active_token) {
    body.append(h('div', { class: 'field' },
      h('label', { for: 'access-token' }, 'Token of the running console'),
      copyField(h('input', { class: 'input mono', id: 'access-token', readonly: true, value: status.active_token,
        onfocus: event => event.target.select() }), { label: 'Copy token' }),
      h('span', { class: 'hint', text: 'Valid until the console is restarted; the next start prints a new one in the terminal.' })));
  }

  if (mode === 'password') {
    const password = h('input', { class: 'input', id: 'access-password', type: 'password',
      value: store.password || '', autocomplete: 'new-password' });
    password.addEventListener('input', () => { store.password = password.value; });
    const confirmation = h('input', { class: 'input', id: 'access-confirmation', type: 'password',
      value: store.confirmation || '', autocomplete: 'new-password' });
    confirmation.addEventListener('input', () => { store.confirmation = confirmation.value; });
    const schemeSelect = customSelect({
      value: scheme,
      options: (status && status.schemes ? status.schemes : [{ value: 'pbkdf2_sha256', label: 'PBKDF2-HMAC-SHA256' }])
        .map(row => ({ value: row.value, label: row.label })),
      ariaLabel: 'Password hashing scheme',
      onChange(value) { store.scheme = value; paintAccessPanel(); },
    });
    schemeSelect.querySelector('button').id = 'access-scheme';
    const chosen = (status && status.schemes || []).find(row => row.value === scheme);
    const save = h('button', { class: 'btn primary', type: 'button', id: 'access-save' }, 'Set password');
    save.disabled = busy;
    save.append(icon('key-round'));
    save.addEventListener('click', saveConsolePassword);
    body.append(
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { for: 'access-password' }, 'New password'), password,
          h('span', { class: 'hint', text: `At least ${store.minLength} characters. Leading and trailing spaces are refused, and the password is never stored — only a salted hash of it.` })),
        h('div', { class: 'field' }, h('label', { for: 'access-confirmation' }, 'Repeat password'), confirmation,
          h('span', { class: 'hint', text: 'Typed twice so a typo cannot lock you out.' })),
        h('div', { class: 'field span-2' }, h('label', { for: 'access-scheme' }, 'Hashing scheme'), schemeSelect,
          h('span', { class: 'hint', text: chosen ? chosen.hint : '' }))),
      h('div', { class: 'row' }, save,
        h('span', { class: 'hint', text: status && status.set_at && status.mode === 'password'
          ? `Replaces the password set on ${new Date(status.set_at).toLocaleString()}.`
          : 'Signing in asks for this password instead of the terminal token.' })));
  }

  if (store.error) body.append(h('p', { class: 'error-text', id: 'access-error', role: 'alert', text: store.error }));
  if (store.notice) body.append(h('p', { class: 'hint', id: 'access-notice', text: store.notice }));

  return h('div', { class: 'panel', id: 'access-panel' },
    h('div', { class: 'panel-head' }, h('h3', { text: 'Console access' }), h('span', { class: 'grow' }),
      h('span', { class: 'panel-note', text: 'cwbridge web' })),
    body);
}

/* Repaint in place: the credentials form above keeps its unsaved edits. */
function paintAccessPanel() {
  if (state.view !== 'app' || state.tab !== 'settings' || state.settingsSection !== 'credentials') return;
  const panel = document.getElementById('access-panel');
  if (panel) panel.replaceWith(accessPanel());
}

/* ---- Entry point ------------------------------------------------------- */
const SECTION_RENDERERS = {
  services: settingsServicesSection,
  limits: settingsGlobalLimitsSection,
  storage: settingsStorageSection,
  backups: settingsBackupsSection,
  ai: settingsAiSection,
  credentials: settingsSecretsSection,
  notifications: settingsNotificationsSection,
};

function renderSettingsSectionPage(main, section) {
  const render = SECTION_RENDERERS[section] || SECTION_RENDERERS[settingsSectionIds()[0]];
  render(main);
  /* The draft is shared, but this hint speaks for the section on screen: an
   * edit on another sub-page is reported by that sub-page's dot in the nav.
   * markDirty keeps this current without a full re-render. */
  const hint = main.querySelector('.page-head p');
  if (hint) {
    hint.classList.add('section-dirty-hint');
    hint.textContent = settingsHeadHint(section);
  }
}

/* Repaint the settings view that is on screen: the settings-model save path
 * calls this without knowing which sub-page is open. */
function renderSettingsTab(main) {
  if (main) return renderSettingsSectionPage(main, state.settingsSection);
  renderSettingsSection();
}

export { backupPolicyCopy, markDirty, openServiceSettings, renderSettingsSectionPage, renderSettingsSection,
  renderSettingsTab, settingsDirty, settingsDirtySections, settingsSectionIds, settingsSectionLabel, SETTINGS_SECTIONS };

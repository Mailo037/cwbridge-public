/* Guided workflows share the existing settings draft and domain sub-pages. */
import { API, api, fetchState, state, UnauthorizedError } from './core.js';
import { h, icon, actionMenu, copyButton, customSelect, checkBox, openDialog, confirmDialog } from './ui.js';
import { navigate } from './router.js';
import { saveSettings } from './settings-model.js';
import { domainEditFromEntry } from './pages/domain-detail.js';
import { applyEffect, applyLabel, liveApply } from './operations.js';

export const SERVICE_NAMES = { datastore: 'Datastore', genai: 'AI assistant', weather: 'Weather', translate: 'Translation', webhook: 'Webhook', qr: 'QR code', fetch: 'HTTP requests', playerinfo: 'Player info', info: 'Domain info' };
const EXAMPLES = { datastore: 'get,example', weather: 'Berlin,current.temp_c', translate: 'Hello,en,de', webhook: 'post,,Hello,WEBHOOK_ID,WEBHOOK_TOKEN', qr: 'Hello CatWeb', genai: 'models', fetch: 'GET,https://example.com,,{}', playerinfo: 'Roblox', info: 'info' };
const button = (label, action, primary = false) => h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: action }, label);
const field = (label, input) => h('label', { class: 'field' }, h('span', { text: label }), input);
function choice(options, value, ariaLabel) {
  const root = h('div', { class: 'workflow-choice' });
  let current = value, select;
  function paint() {
    select = customSelect({ floating: true, options, value: current, ariaLabel, onChange(value) {
      current = value; root.dispatchEvent(new Event('change', { bubbles: true }));
    } });
    root.replaceChildren(select);
  }
  Object.defineProperty(root, 'value', { get: () => current, set(value) { current = value; select.setValue(value); } });
  root.setOptions = next => { options = next; current = options.some(o => o.value === current) ? current : options[0]?.value || ''; paint(); };
  paint(); return root;
}

export const SERVICE_ICONS = { datastore: 'database', weather: 'cloud-sun', translate: 'languages', webhook: 'webhook', qr: 'qr-code',
  genai: 'bot', fetch: 'globe', playerinfo: 'user', info: 'info' };

/* A state as a small pill: ok (green), warn (amber), off (grey). One look for
 * every list that says whether a service is on. */
export function statusBadge(text, tone = 'off', title = '') {
  const badge = h('span', { class: 'status-badge ' + tone, title: title || null }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text }));
  badge.update = (nextText, nextTone, nextTitle = '') => {
    badge.className = 'status-badge ' + nextTone;
    badge.lastChild.textContent = nextText;
    if (nextTitle) badge.title = nextTitle; else badge.removeAttribute('title');
  };
  return badge;
}

export function serviceIcon(service) {
  return h('span', { class: 'service-icon', 'aria-hidden': 'true' }, icon(SERVICE_ICONS[service] || 'server'));
}

export function serviceStatus(service) {
  if (service !== 'info' && !state.config?.services?.includes(service)) return 'Disabled';
  if (service === 'genai') {
    if (state.config.ai?.mode === 'cloud' && !state.config.secret_status?.ai_api_key && !state.config.secret_status?.ai_api_key_present) return 'API key missing';
    if (!state.config.ai?.models?.length && !state.config.ai?.model) return 'Choose a model';
  }
  return 'Configured';
}

export function errorHelp(code, service) {
  if (code === 'credentials' && service === 'genai') return button('Check AI connection', () => openServiceSetup(service));
  const copy = { credentials: ['Check credentials', 'credentials'], disabled: ['Enable service', 'services'], limit: ['Review limits', 'limits'], timeout: ['Check connection', 'services'], input: ['Check request format', 'services'], service: ['Review service setup', 'services'] };
  const [label, section] = copy[code] || copy.service;
  return button(label, () => navigate('settings', { section }));
}

export function openPlayground(service = 'info', domainName = '') {
  let closed = false;
  const session = state.settings;
  const domain = choice(state.domains.map(d => ({ value: d.domain, label: d.domain })), state.domains[0]?.domain || '', 'Test domain');
  if (domainName) domain.value = domainName;
  const choose = choice(state.services.map(s => ({ value: s, label: SERVICE_NAMES[s] || s })), service, 'Test service');
  choose.value = service;
  const input = h('textarea', { class: 'textarea', rows: '4', maxlength: '8000', 'aria-label': 'Service request', spellcheck: 'false' });
  input.value = EXAMPLES[service] || '';
  const effect = h('p', { class: 'hint' });
  const output = h('pre', { class: 'workflow-output', tabindex: '0', 'aria-label': 'Service response' });
  const outputBox = h('div', { class: 'copy-block' }, output, copyButton(() => output.textContent, 'Copy response'));
  const status = h('p', { role: 'status', 'aria-live': 'polite' });
  const help = h('div');
  function effects() {
    effect.textContent = choose.value === 'datastore' ? 'Uses the real domain datastore. Set, post and delete change stored data.'
      : choose.value === 'webhook' ? 'Can send, edit or delete real messages at the specified webhook.'
      : choose.value === 'genai' ? 'Uses your AI provider. Generation may cost money, consume quota and store chat data; delete commands remove chats.'
      : choose.value === 'fetch' ? 'Contacts the supplied URL. Requests can change data on the destination server.'
      : ['weather', 'translate', 'playerinfo'].includes(choose.value) ? 'Contacts the service provider using this request.' : 'Runs locally using the selected domain.';
  }
  choose.addEventListener('change', () => { input.value = EXAMPLES[choose.value] || ''; effects(); output.textContent = ''; });
  effects();
  const run = button('Run service test', async () => {
    const request = { domain: domain.value, service: choose.value, body: input.value, confirmed: true };
    if (!request.domain || !request.body.trim()) { status.textContent = 'Choose a domain and enter a request.'; return; }
    run.disabled = true;
    if (!await confirmDialog({ title: 'Run service test?', message: effect.textContent + ' The call uses saved settings and counts toward usage and limits. It does not send a response to Roblox.', confirmLabel: 'Run test' })) { run.disabled = false; return; }
    if (closed || state.view !== 'app') return;
    status.textContent = 'Running service test …'; output.textContent = ''; help.replaceChildren();
    try {
      const result = await api('api/services/test', { method: 'POST', body: request });
      if (closed || state.view !== 'app' || state.settings !== session) return;
      output.textContent = result.output;
      status.textContent = (result.ok ? 'Service succeeded' : 'Service failed') + ' · ' + result.duration_ms + ' ms. Roblox delivery was not tested.' + (result.truncated ? ' Response truncated.' : '');
      if (!result.ok) help.append(button('Open service setup', () => { dialog.close(); openServiceSetup(request.service); }));
    } catch (e) { if (!closed && !(e instanceof UnauthorizedError)) { status.textContent = e.message; help.append(button('Open service setup', () => { dialog.close(); openServiceSetup(request.service); })); } }
    finally { run.disabled = false; }
  }, true);
  run.disabled = !state.domains.length;
  // Without a domain there is nothing to test against: say so and offer the
  // way out instead of leaving an empty picker and a dead button.
  const noDomain = state.domains.length ? null : h('div', { class: 'callout info' }, icon('info'),
    h('span', { class: 'grow', text: 'A test runs against a domain. Create one first.' }),
    button('Create a domain', () => { dialog.close(); navigate('domains', { addDomain: true }); }));
  const dialog = openDialog({ title: 'Service playground', iconName: 'play', onClose() { closed = true; input.value = ''; output.textContent = ''; },
    buildBody(body, el) { el.classList.add('workflow-dialog'); body.append(h('p', { class: 'hint', text: 'Test a service with saved settings. This does not send input to Roblox.' }), ...(noDomain ? [noDomain] : []), h('div', { class: 'form-grid' }, field('Domain', domain), field('Service', choose)), field('Request', input), effect, status, help, outputBox); },
  });
  dialog.dialog.querySelector('.dialog-actions').append(run);
}

export function openServiceSetup(service) {
  const draft = state.settingsDraft;
  const ai = service === 'genai';
  const content = h('div', { class: 'stack' });
  const message = h('p', { role: 'status', 'aria-live': 'polite' });
  let closed = false;
  const dialog = openDialog({ title: 'Set up ' + (SERVICE_NAMES[service] || service), onClose() { closed = true; import('./pages/settings.js').then(m => m.markDirty()); }, buildBody(body, el) { el.classList.add('workflow-dialog'); body.append(content, message); } });
  const current = () => !closed && state.view === 'app' && state.settingsDraft === draft;
  const enabled = checkBox({ role: 'switch', ariaLabel: 'Service enabled' });
  enabled.checked = service === 'info' || draft.services.includes(service);
  enabled.disabled = service === 'info';
  enabled.addEventListener('change', () => {
    if (enabled.checked && !draft.services.includes(service)) draft.services.push(service);
    else if (!enabled.checked) draft.services = draft.services.filter(s => s !== service);
  });
  content.append(h('label', { class: 'row setup-enabled' }, enabled, h('span', { text: service === 'info' ? 'Always enabled' : 'Service enabled' })));
  if (ai) {
    const provider = choice((state.aiProviders || []).map(p => ({ value: p.value, label: p.label })), draft.ai.provider, 'Setup AI provider');
    provider.value = draft.ai.provider;
    const url = h('input', { class: 'input', value: draft.ai.base_url, 'aria-label': 'Setup API URL' });
    const key = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Keep saved key', 'aria-label': 'Setup API key' });
    const model = choice(draft.ai.models.map(m => ({ value: m, label: m })), draft.ai.model, 'Setup model');
    model.value = draft.ai.model;
    provider.addEventListener('change', () => {
      const preset = state.aiProviders.find(p => p.value === provider.value);
      if (!preset) return;
      Object.assign(draft.ai, { provider: preset.value, mode: preset.mode, protocol: preset.protocol, base_url: preset.base_url || '', model: '', models: [] });
      url.value = draft.ai.base_url; model.setOptions([]); key.value = ''; delete draft.secrets.ai_api_key;
      document.dispatchEvent(new CustomEvent('cwbridge:settings-dirty'));
    });
    url.addEventListener('input', () => { draft.ai.base_url = url.value; });
    key.addEventListener('input', () => { draft.secrets.ai_api_key = key.value; });
    model.addEventListener('change', () => { draft.ai.model = model.value; if (!draft.ai.models.includes(model.value)) draft.ai.models.push(model.value); });
    const test = button('Test connection and load models', async () => {
      test.disabled = true; message.textContent = 'Checking provider …';
      try {
        const result = await api(API.models, { method: 'POST', body: { provider: draft.ai.provider, protocol: draft.ai.protocol, base_url: draft.ai.base_url, ...(key.value ? { api_key: key.value } : {}) } });
        if (!current()) return;
        const models = result.models || [];
        model.setOptions(models.map(m => ({ value: typeof m === 'string' ? m : m.id, label: typeof m === 'string' ? m : m.id })));
        if (model.value) { draft.ai.model = model.value; draft.ai.models = [...new Set([...draft.ai.models, model.value])]; }
        message.textContent = models.length ? 'Connection succeeded. Choose a model, then save.' : 'Connection returned no models. Add an exact model ID under AI & models.';
      } catch (e) { if (current() && !(e instanceof UnauthorizedError)) message.textContent = e.message; }
      finally { test.disabled = false; updateSave(); }
    });
    content.append(field('Provider', provider), field('API URL', url), field('API key (cloud providers)', key), test, field('Model', model));
  }
  const save = button('Save changes', async () => {
    if (!current()) return;
    if (await saveSettings()) { dialog.close(); openServiceSetup(service); }
  }, true);
  const initial = JSON.stringify(draft);
  save.disabled = true;
  function updateSave() { save.disabled = state.busy.settings || JSON.stringify(draft) === initial; }
  content.addEventListener('input', updateSave);
  content.addEventListener('change', updateSave);
  content.addEventListener('click', () => queueMicrotask(updateSave));
  const tools = actionMenu({ floating: true, triggerIcon: 'ellipsis', buttonClass: 'btn ghost sm icon-only', ariaLabel: 'Service tools', items: [
    { label: 'Try service', icon: 'play', onSelect: () => { dialog.close(); openPlayground(service); } },
    ...(ai || service === 'datastore' ? [{ label: 'Advanced settings', icon: 'settings-2', onSelect: () => { dialog.close(); navigate('settings', { section: ai ? 'ai' : 'storage' }); } }] : []),
  ] });
  const head = dialog.dialog.querySelector('.dialog-head');
  head.insertBefore(tools, head.lastElementChild);
  dialog.dialog.querySelector('.dialog-actions').append(save);
  content.append(h('h3', { text: 'Domain access' }));
  const accessList = h('div', { class: 'setup-access-list' });
  content.append(accessList);
  for (const domain of state.domains) {
    const allowed = domain.services === 'all' || domain.services?.includes(service);
    const access = checkBox({ role: 'switch', ariaLabel: 'Allow ' + service + ' for ' + domain.domain });
    access.checked = allowed;
    access.addEventListener('change', async () => {
      const desired = access.checked;
      access.disabled = true;
      try {
        // Read fresh domain settings before changing only this service selection.
        await fetchState();
        const fresh = state.domains.find(d => d.domain === domain.domain);
        if (!fresh || closed || state.view !== 'app') return;
        const services = new Set(fresh.services === 'all' ? state.services : fresh.services);
        if (desired) services.add(service); else services.delete(service);
        if (!await reviewChanges({ services: fresh.services }, { services: [...services] })) return;
        await api(API.domainUpd, { method: 'POST', body: { domain: fresh.domain, owner_ids: (fresh.owner_ids || []).map(String), services: [...services], storage_mb: fresh.storage_mb } });
        await fetchState(); dialog.close(); openServiceSetup(service);
      } catch (e) { if (!closed && !(e instanceof UnauthorizedError)) message.textContent = e.message; }
      finally { access.disabled = false; if (!closed) access.checked = allowed; }
    });
    access.disabled = service === 'info';
    const limits = button('Limits', () => { dialog.close(); state.settingsService = service; navigate('domains', { domain: domain.domain, section: 'services' }); });
    limits.className = 'btn ghost sm';
    accessList.append(h('div', { class: 'setup-access-row' }, h('label', { class: 'row' }, access, h('span', { text: domain.domain })), limits));
  }
  if (!state.domains.length) content.append(button('Create a domain', () => { dialog.close(); navigate('domains', { addDomain: true }); }));
}

export const DOMAIN_TEMPLATES = [
  { id: 'ai', name: 'AI assistant', services: ['genai', 'info'], hint: '100 AI requests per day, 1024 output tokens per request.' },
  { id: 'data', name: 'Data app', services: ['datastore', 'info'], hint: '1024 MB storage. Uses the existing global backup schedule.' },
  { id: 'info', name: 'Info page', services: ['weather', 'translate', 'info'], hint: 'Weather and translation, each limited to 100 requests per day.' },
  { id: 'custom', name: 'Custom', services: ['info'], hint: 'Choose individual services and limits in the next step.' },
];

export function duplicateDomain(entry) {
  const draft = domainEditFromEntry('add', entry);
  draft.domain = ''; draft.wizardStep = 1; draft.template = 'copy';
  draft.copiedFrom = entry.domain;
  state.domainEdit = draft;
  navigate('domains', { addDomain: true });
}

/* The add-domain progress: done steps get a check, the current one is lit. */
export function wizardSteps(current) {
  const names = ['Name', 'Template', 'Review and create'];
  return h('ol', { class: 'wizard-steps', 'aria-label': 'Add domain progress' }, ...names.map((name, i) => {
    const step = i + 1;
    const stateClass = step < current ? 'is-done' : step === current ? 'is-current' : '';
    const item = h('li', { class: 'wizard-step ' + stateClass },
      h('span', { class: 'wizard-step-dot' }, step < current ? icon('circle-check') : String(step)), h('span', { text: name }));
    if (step === current) item.setAttribute('aria-current', 'step');
    return item;
  }));
}

export function renderDomainWizard(main, draft, render) {
  if (draft.wizardStep === 3) return false;
  draft.wizardStep ||= 1;
  main.append(h('div', { class: 'page-head' }, h('div', { class: 'titles' }, h('h1', { text: 'Add domain' }), wizardSteps(draft.wizardStep))));
  const panel = h('div', { class: 'panel' });
  const body = h('div', { class: 'panel-body workflow-wizard-body' });
  const actions = h('div', { class: 'workflow-wizard-actions' });
  panel.append(body, actions);
  const error = h('p', { class: 'error-text', role: 'alert' });
  if (draft.wizardStep === 1) {
    const input = h('input', { class: 'input', id: 'de-domain', value: draft.domain, placeholder: 'my-app.example', 'aria-label': 'Domain name' });
    input.addEventListener('input', () => { draft.domain = input.value; });
    body.append(field('Domain name', input), h('p', { class: 'hint', text: 'Letters, numbers, dots, underscores, dashes and slashes.' }));
    if (draft.copiedFrom) body.append(h('p', { class: 'hint', text: 'Copy settings from ' + draft.copiedFrom + '. Stored data, chats, counters and history are not copied.' }));
    const next = button('Choose template', () => {
      if (!/^[A-Za-z0-9._/-]{1,255}$/.test(draft.domain.trim())) { error.textContent = 'Enter a domain using letters, numbers, dots, underscores, dashes or slashes.'; return; }
      if (state.domains.some(d => d.domain === draft.domain.trim())) { error.textContent = 'This domain already exists. Choose another name.'; return; }
      draft.domain = draft.domain.trim(); draft.wizardStep = 2; render();
    }, true);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } });
    body.append(error); actions.append(next);
  } else {
    body.append(h('h3', { text: 'Choose a starting point' }));
    if (draft.copiedFrom) body.append(button('Use copied settings', () => { draft.wizardStep = 3; render(); }, true));
    const templates = h('div', { class: 'stack service-list' });
    body.append(templates);
    for (const template of DOMAIN_TEMPLATES) {
      const select = button(template.name, () => {
      draft.template = template.id; draft.services = new Set(template.services.filter(s => state.services.includes(s)));
      draft.storageText = '1024'; draft.quotaText = template.id === 'ai' ? '100' : ''; draft.tokensText = template.id === 'ai' ? '1024' : '';
      draft.modelsText = ''; draft.systemPromptText = ''; draft.serviceExpanded = new Map();
      Object.keys(draft.serviceLimitText).forEach(k => { draft.serviceLimitText[k] = template.id === 'info' && ['weather_requests_per_day', 'translate_requests_per_day'].includes(k) ? '100' : ''; });
      draft.wizardStep = 3; render();
      });
      select.className = 'service-settings-link'; select.setAttribute('aria-label', template.name);
      select.replaceChildren(h('span', { class: 'stack service-settings-copy' }, h('span', { class: 'name', text: template.name }), h('span', { class: 'hint', text: template.hint })), icon('arrow-right'));
      templates.append(h('div', { class: 'service-settings-row' }, select));
    }
    actions.append(button('Back to name', () => { draft.wizardStep = 1; render(); }));
  }
  actions.prepend(button('Cancel', () => { state.domainEdit = null; navigate('domains'); }));
  main.append(panel);
  return true;
}

/* Every changed leaf, with its path, its old and new value, and whether the
 * value is a secret that must not be shown. */
function collectChanges(before, after, prefix = '') {
  const rows = [];
  for (const [key, value] of Object.entries(after || {})) {
    const path = prefix ? prefix + '.' + key : key;
    const old = before?.[key];
    if (JSON.stringify(old) === JSON.stringify(value) || (typeof value === 'number' && typeof old === 'string' && old.trim() !== '' && Number(old) === value) || (value === null && old === '')) continue;
    if (/secret|key|password|token|uri|url|prompt/i.test(path)) { rows.push({ path, old, value, hidden: true }); continue; }
    if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(...collectChanges(old, value, path));
    else rows.push({ path, old, value, hidden: false });
  }
  return rows;
}

export function describeChanges(before, after, prefix = '') {
  return collectChanges(before, after, prefix).map(row => row.hidden
    ? row.path + ': ' + (row.value === null ? 'removed' : 'updated (value hidden)')
    : row.path + ': ' + JSON.stringify(row.old ?? 'unset') + ' → ' + JSON.stringify(row.value));
}

/* What a setting is called on its page, so the review reads like the form. */
const CHANGE_LABELS = {
  'global_limits.genai_requests_per_day': 'GenAI calls per day', 'global_limits.datastore_storage_mb': 'Datastore storage total (MB)',
  'backups.interval_minutes': 'Backup interval (minutes)', 'backups.max_backups': 'Backups kept',
  services: 'Services', 'storage.mode': 'Storage', 'storage.database': 'Database name',
  'ai.mode': 'Connection mode', 'ai.provider': 'Provider', 'ai.protocol': 'API protocol', 'ai.base_url': 'Base URL', 'ai.model': 'Default model',
  'ai.models': 'Model pool', 'ai.temperature': 'Temperature', 'ai.max_tokens': 'Max output tokens', 'ai.system_prompt': 'System prompt',
  domain: 'Domain', owner_ids: 'Owner IDs', storage_mb: 'Storage (MB)', max_requests_per_day: 'AI requests per day',
  max_output_tokens: 'Output token cap', allowed_models: 'Model allowlist', system_prompt: 'System prompt',
};
const CHANGE_GROUPS = { global_limits: 'Global limits', backups: 'Backups', ai: 'AI & models', storage: 'Storage', notifications: 'Webhooks', service_limits: 'Service limits', docs: 'Documentation', secrets: 'Credentials' };
const humanize = key => key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

function changeLabel(path) {
  const parts = path.split('.');
  const last = parts[parts.length - 1];
  const limit = /^(.+)_requests_per_day$/.exec(last);
  const label = CHANGE_LABELS[path] || (parts[0] === 'service_limits' && limit ? (SERVICE_NAMES[limit[1]] || humanize(limit[1])) + ' requests per day' : CHANGE_LABELS[last] || humanize(last));
  const group = parts.slice(0, -1).map(part => CHANGE_GROUPS[part] || humanize(part)).join(' · ');
  return { label, group };
}

function changeValue(path, value) {
  if (value === null || value === undefined || value === '') return { text: /limit|_mb$|per_day|tokens|quota/.test(path) ? 'Unlimited' : 'Not set', empty: true };
  if (typeof value === 'boolean') return { text: value ? 'On' : 'Off' };
  if (Array.isArray(value)) {
    if (!value.length) return { text: 'None', empty: true };
    return { text: value.map(item => /(^|\.)services$/.test(path) ? (SERVICE_NAMES[item] || item) : String(item)).join(', ') };
  }
  if (typeof value === 'number') return { text: value.toLocaleString() };
  return { text: String(value) };
}

export function reviewChanges(before, after, apply = false) {
  const rows = collectChanges(before, after);
  // One row per setting: its name (and section), then what it was and becomes.
  const changeRow = row => {
    const { label, group } = changeLabel(row.path);
    const name = h('span', { class: 'change-path' }, group ? h('small', { text: group }) : null, h('span', { text: label }));
    if (row.hidden) return h('li', {}, name, h('span', { class: 'change-value' }, h('span', { class: 'change-new', text: row.value === null ? 'Removed' : 'Updated (hidden)' })));
    const next = changeValue(row.path, row.value);
    const value = h('span', { class: 'change-value' });
    // A value that was never there is simply added: nothing to strike out.
    if (row.old !== undefined) {
      const prev = changeValue(row.path, row.old);
      value.append(h('span', { class: 'change-old' + (prev.empty ? ' is-empty' : ''), text: prev.text }), icon('arrow-right'));
    }
    value.append(h('span', { class: 'change-new' + (next.empty ? ' is-empty' : ''), text: next.text }));
    return h('li', {}, name, value);
  };
  return new Promise(resolve => openDialog({ title: 'Review changes', iconName: 'list', onClose() { resolve(false); }, buildBody(body, dialog) {
    dialog.classList.add('workflow-dialog');
    body.append(h('p', { class: 'dialog-message', text: apply ? applyEffect() : liveApply() ? 'Save the configuration; the running bridge takes it live, without a restart.' : 'Save the configuration. The running bridge is not restarted by this action.' }),
      h('ul', { class: 'change-list' }, ...rows.map(changeRow)), h('p', { class: 'hint', text: liveApply() ? 'New domains get their tab right away; removing one reopens the bridge’s tabs.' : 'Apply saved changes to activate runtime settings. Domain tabs open after CatWeb is ready.' }));
  }, actions: [{ label: 'Cancel' }, { label: apply ? applyLabel() : 'Save changes', kind: 'primary', onClick(close) { resolve(true); close(); } }] }));
}

export function openSearch() {
  if (state.view !== 'app' || document.querySelector('.dialog-backdrop')) return;
  const input = h('input', { class: 'command-input', type: 'search', 'aria-label': 'Search domains, services and settings', placeholder: 'Search or go to …', autocomplete: 'off' });
  const list = h('div', { class: 'command-results scroll-slim' });
  const entries = [
    ...state.domains.map(d => ({ group: 'Domains', label: d.domain, icon: 'database', action: () => navigate('domains', { domain: d.domain }) })),
    ...[['overview', 'Overview', 'layout-dashboard'], ['domains', 'Domains', 'database'], ['datastore', 'Datastore', 'table'], ['usage', 'Usage', 'chart-column'], ['logs', 'Logs', 'scroll-text'], ['about', 'About', 'info']].map(([tab, label, icon]) => ({ group: 'Pages', label, icon, action: () => navigate(tab) })),
    ...[['services', 'Services'], ['limits', 'Limits & usage'], ['storage', 'Storage'], ['backups', 'Backups'], ['ai', 'AI & models'], ['credentials', 'Credentials'], ['notifications', 'Webhooks']].map(([section, label]) => ({ group: 'Settings', label, icon: 'settings-2', action: () => navigate('settings', { section }) })),
    ...[['transfer', 'Export & import'], ['danger', 'Danger zone']].map(([section, label]) => ({ group: 'About', label, icon: 'info', action: () => navigate('about', { section }) })),
    ...state.services.map(s => ({ group: 'Services', label: SERVICE_NAMES[s] || s, icon: 'server', action: () => openServiceSetup(s) })),
  ];
  let keyStatus = '';
  const dialog = openDialog({ title: 'Go to', actions: [], buildBody(body, el) { el.classList.add('command-dialog'); body.append(input, list); } });
  let active = 0, rows = [];
  function highlight(index) {
    active = (index + rows.length) % rows.length;
    rows.forEach((row, i) => row.classList.toggle('active', i === active));
    rows[active]?.scrollIntoView({ block: 'nearest' });
  }
  function matches(text, query) {
    text = text.toLowerCase();
    return query.split(/\s+/).every(token => {
      if (text.includes(token)) return true;
      let position = 0;
      for (const char of text) if (char === token[position]) position++;
      if (position === token.length) return true;
      if (token.length < 3) return false;
      // Bounded edit distance accepts a small typo without flooding short queries.
      return text.split(/[^a-z0-9]+/).some(word => {
        const limit = token.length >= 6 ? 2 : 1;
        if (Math.abs(word.length - token.length) > limit) return false;
        let previous = Array.from({ length: word.length + 1 }, (_, i) => i);
        for (let i = 1; i <= token.length; i++) {
          const row = [i];
          for (let j = 1; j <= word.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (token[i - 1] === word[j - 1] ? 0 : 1));
          previous = row;
        }
        return previous[word.length] <= limit;
      });
    });
  }
  function paint() {
    const query = input.value.trim().toLowerCase();
    const results = entries.filter(e => matches(e.group + ' ' + e.label + ' ' + (e.detail || ''), query));
    list.replaceChildren(); rows = []; let group, groupElement;
    for (const entry of results) {
      if (group !== entry.group) { group = entry.group; groupElement = h('section', { class: 'command-section' }, h('div', { class: 'command-group', text: group })); list.append(groupElement); }
      const row = h('button', { class: 'command-row', type: 'button', onclick: () => { dialog.close(); entry.action(); } }, icon(entry.icon), h('span', { text: entry.label }), entry.detail ? h('small', { class: 'command-detail', text: entry.detail }) : null);
      const index = rows.length;
      row.addEventListener('pointermove', () => highlight(index));
      rows.push(row); groupElement.append(row);
    }
    if (!rows.length) list.append(h('p', { class: 'command-empty', text: 'No matching results.' }));
    if (keyStatus) list.append(h('p', { class: 'command-empty', text: keyStatus }));
    active = 0; if (rows.length) highlight(0);
    list.scrollTop = 0;
  }
  input.addEventListener('input', paint);
  dialog.dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (rows.length) highlight(active + (e.key === 'ArrowDown' ? 1 : -1)); input.focus(); }
    if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); rows[active]?.click(); }
  });
  paint(); input.focus();
  api('api/datastore/search-keys', { method: 'POST', body: {} }).then(data => {
    if (!dialog.dialog.isConnected || state.view !== 'app') return;
    entries.push(...data.items.map(item => ({ group: 'Datastore keys', label: item.key, detail: item.collection, icon: 'key-round', action: () => navigate('datastore', { collection: item.collection, section: 'entries', entry: item.key }) })));
    if (data.truncated) keyStatus = 'Showing the first 5,000 keys. Open Datastore to browse all entries.';
    paint();
  }).catch(error => {
    if (!dialog.dialog.isConnected || error instanceof UnauthorizedError) return;
    keyStatus = 'Datastore keys could not be loaded.'; paint();
  });
}

export function installSearch() {
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.view === 'app') { e.preventDefault(); openSearch(); } });
}

export function activityPanel(compact = false) {
  const rows = h('div', { class: 'stack' });
  const domain = choice([{ value: '', label: 'All domains' }, ...state.domains.map(d => ({ value: d.domain, label: d.domain }))], '', 'Request domain filter');
  const service = choice([{ value: '', label: 'All services' }, ...state.services.map(s => ({ value: s, label: SERVICE_NAMES[s] || s }))], '', 'Request service filter');
  const failed = checkBox({ ariaLabel: 'Failures only' });
  let items = [];
  function paint() {
    const filtered = items.filter(i => (!domain.value || i.domain === domain.value) && (!service.value || i.service === service.value) && (!failed.checked || i.ok !== true));
    rows.replaceChildren();
    if (!filtered.length) rows.append(h('p', { class: 'hint', text: 'No matching recent requests.' }));
    for (const item of filtered.slice(0, compact ? 5 : 100)) rows.append(h('div', { class: 'request-row' },
      h('div', { class: 'request-copy' }, h('button', { class: 'breadcrumb-link', type: 'button', text: item.domain, onclick: () => navigate('domains', { domain: item.domain, section: 'activity' }) }),
        h('span', { class: 'hint', text: new Date(item.ts).toLocaleString() + ' · ' + (SERVICE_NAMES[item.service] || item.service) + ' · ' + (item.op || 'request') })),
      h('span', { class: item.ok ? 'hint' : 'error-text', text: item.ok ? 'Succeeded' : 'Failed: ' + (item.error_code || 'service') }),
      h('span', { class: 'hint', text: (Number.isFinite(item.duration_ms) ? item.duration_ms + ' ms' : 'Duration unavailable') + ' · ' + (item.source === 'playground' ? 'Playground' : 'Bridge') }),
      item.ok ? null : errorHelp(item.error_code, item.service)));
  }
  const refresh = button('Load recent requests', async () => {
    refresh.disabled = true; rows.replaceChildren(h('p', { role: 'status', text: 'Loading recent requests …' }));
    try {
      const data = await api('api/activity');
      if (!panel.isConnected || state.view !== 'app') return;
      items = data.items || []; paint(); refresh.textContent = 'Refresh requests';
    } catch (e) { if (panel.isConnected && !(e instanceof UnauthorizedError)) rows.replaceChildren(h('p', { class: 'error-text', role: 'alert', text: e.message })); }
    finally { refresh.disabled = false; }
  });
  refresh.className = 'btn ghost sm';
  const panel = h('section', { class: 'panel request-panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'overview-section-title', text: 'Recent requests' }), h('span', { class: 'grow' }), refresh),
    h('div', { class: 'panel-body' }, compact ? null : h('p', { class: 'hint', text: 'Up to 20 recent requests per domain, 100 in total. Request contents are not stored.' }),
      compact ? null : h('div', { class: 'workflow-filters' }, field('Domain', domain), field('Service', service), h('label', { class: 'row' }, failed, 'Failures only')), rows));
  for (const input of [domain, service, failed]) input.addEventListener('change', paint);
  rows.append(h('p', { class: 'hint', text: 'Load the recent requests to inspect results and response times.' }));
  if (compact) {
    const history = button('Open request history', openRequestHistory); history.className = 'btn ghost sm';
    panel.querySelector('.panel-head').append(history);
  }
  queueMicrotask(() => { if (panel.isConnected) refresh.click(); });
  return panel;
}

export function openRequestHistory() {
  openDialog({ title: 'Request history', buildBody(body, dialog) { dialog.classList.add('workflow-dialog'); body.append(activityPanel()); } });
}

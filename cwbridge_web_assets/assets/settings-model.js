/* CWBridge console: settings-model. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, fetchState, state } from './core.js';
import { toast } from './ui.js';
import { handleUnauthorized } from './auth.js';
import { renderApp } from './shell.js';
import { parseGlobalLimit } from './pages/domain-detail.js';
import { renderSettingsSection } from './pages/settings.js';
import { applyLive, applySaved, confirmApply, liveApply } from './operations.js';
import { reviewChanges } from './workflows.js';

function snapshotConfig(cfg) {
  const ai = cfg.ai || {};
  const limits = cfg.global_limits || {};
  return {
    services: Array.isArray(cfg.services) ? cfg.services.slice() : [],
    storage: { mode: cfg.storage.mode || 'sqlite', database: cfg.storage.database || 'rbx' },
    ai: { mode: aiModeFromProvider(ai), provider: ai.provider || 'custom', base_url: ai.base_url || '', model: ai.model || '',
      protocol: ai.protocol || ({ anthropic: 'anthropic-messages', 'openai-responses': 'openai-responses', ollama: 'ollama' }[ai.provider] || 'openai-completions'),
      models: Array.isArray(ai.models) ? ai.models.slice() : (ai.model && ai.model !== 'request' ? [ai.model] : []),
      /* Generation settings live here, not in the request body, so they are
       * edited as text and converted on save. */
      temperature: String(ai.temperature ?? 0.7),
      max_tokens: String(ai.max_tokens ?? 1024),
      /* The system prompt is free text (it may span lines); the documentation
       * block only steers the knowledge base the bridge keeps locally. */
      system_prompt: typeof ai.system_prompt === 'string' ? ai.system_prompt : '',
      docs: {
        enabled: !!(ai.docs && ai.docs.enabled),
        repo: (ai.docs && ai.docs.repo) || 'Mailo037/catweb-docs',
        results: String((ai.docs && ai.docs.results) ?? 4),
        max_chars: String((ai.docs && ai.docs.max_chars) ?? 6000),
        refresh_hours: String((ai.docs && ai.docs.refresh_hours) ?? 24),
      } },
    notifications: { enabled: !!cfg.notifications?.enabled, format: cfg.notifications?.format || 'json',
      events: { bridge_online: true, bridge_offline: true, genai_limit: true, datastore_limit: true, service_limit: true, ...cfg.notifications?.events },
      cooldown_seconds: cfg.notifications?.cooldown_seconds ?? 900, console_url: cfg.notifications?.console_url || '',
      remote_restart: !!cfg.notifications?.remote_restart },
    backups: { interval_minutes: String(cfg.backups?.interval_minutes ?? 60), max_backups: String(cfg.backups?.max_backups ?? 1000) },
    global_limits: {
      genai_requests_per_day: limits.genai_requests_per_day == null ? '' : String(limits.genai_requests_per_day),
      datastore_storage_mb: limits.datastore_storage_mb == null ? '' : String(limits.datastore_storage_mb),
    },
    secrets: {},
  };
}

function aiModeFromProvider(cfgAi) {
  if (cfgAi && cfgAi.mode === 'local') return 'local';
  return 'cloud';
}

function cloneSettings(s) {
  return {
    services: s.services.slice(),
    storage: { mode: s.storage.mode, database: s.storage.database },
    ai: { ...s.ai, models: s.ai.models.slice(), docs: { ...s.ai.docs } },
    notifications: { ...s.notifications, events: { ...s.notifications.events } },
    backups: { ...s.backups },
    global_limits: { ...s.global_limits },
    secrets: { ...(s.secrets || {}) },
  };
}

/* Which part of the shared draft one Settings sub-page owns. The draft is one
 * object for every sub-page, so "is this section unsaved?" has to be asked per
 * section — otherwise one edit marks all six of them. Credentials are split by
 * key because the AI key is edited on the AI sub-page and the rest on
 * Credentials. */
const SECTION_KEYS = {
  services: ['services'],
  storage: ['storage'],
  backups: ['backups'],
  notifications: ['notifications', 'secrets.webhook_url'],
  limits: ['global_limits'],
  ai: ['ai', 'secrets.ai_api_key'],
  credentials: ['secrets.mongodb_uri'],
};

function _slice(value, path) {
  let current = value;
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function _same(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

/* Compare one section, or the whole draft when no section is named. */
function settingsEqual(a, b, section = null) {
  const keys = section ? SECTION_KEYS[section] : null;
  if (!keys) {
    return a.services.join('\u0001') === b.services.join('\u0001')
      && a.storage.mode === b.storage.mode && a.storage.database === b.storage.database
      && JSON.stringify(a.ai) === JSON.stringify(b.ai)
      && JSON.stringify(a.notifications) === JSON.stringify(b.notifications)
      && JSON.stringify(a.backups) === JSON.stringify(b.backups)
      && JSON.stringify(a.global_limits) === JSON.stringify(b.global_limits)
      && JSON.stringify(a.secrets || {}) === JSON.stringify(b.secrets || {});
  }
  return keys.every(key => _same(_slice(a, key), _slice(b, key)));
}

function settingsSectionDirty(section) {
  if (!state.settingsDraft || !state.settings) return false;
  return !settingsEqual(state.settingsDraft, state.settings, section);
}

/* Every sub-page that currently holds unsaved edits. */
function settingsDirtySections() {
  const dirty = {};
  for (const section of Object.keys(SECTION_KEYS)) {
    if (settingsSectionDirty(section)) dirty[section] = 'Unsaved changes';
  }
  return dirty;
}

function secretFlags() {
  const s = (state.config && state.config.secret_status) || {};
  return {
    ai_api_key: !!(s.ai_api_key || s.ai_api_key_present),
    webhook_url: !!s.webhook_url,
    mongodb_uri: !!(s.mongodb_uri || s.mongodb_uri_present),
  };
}

/* The other half of saving: the draft is put back to the configuration the
 * server holds. Nothing is sent and nothing is fetched — the draft is
 * overwritten with the saved configuration the sub-pages were painted from, so
 * every field returns to the value it showed before it was edited.
 *
 * Asked of the same baseline the dirty marks are counted against (state.settings
 * rather than a fresh read of state.config), because "revert" has to mean "back
 * to what this console showed me", not "back to whatever the server holds now"
 * — a draft that appeared to be clean must never revert into a surprise. */
function discardSettings() {
  const saved = state.settings || (state.config ? snapshotConfig(state.config) : null);
  if (!saved) return false;
  state.settings = saved;
  state.settingsDraft = cloneSettings(saved);
  return true;
}

async function saveSettings(overrides, apply = false) {
  if (state.busy.settings) return false;
  const draft = state.settingsDraft;
  if (!overrides) {
    for (const [key, max, label] of [['interval_minutes', 10080, 'Automatic backup interval'], ['max_backups', 100000, 'Maximum backups']]) {
      const raw = String(draft.backups[key]);
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
        const message = label + ' must be a whole number from 1 to ' + max + '.';
        const error = document.getElementById('settings-backups-error');
        if (error) error.textContent = message;
        else toast(message, 'err');
        document.getElementById('st-backup-' + key)?.focus();
        return false;
      }
    }
    // Global limits: blank = unlimited, otherwise a positive whole number.
    for (const [key, max, label] of [['genai_requests_per_day', 1000000, 'Global GenAI requests per day'], ['datastore_storage_mb', 1048576, 'Global datastore storage']]) {
      const raw = String(draft.global_limits[key]).trim();
      if (raw && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max)) {
        const message = label + ' must be a whole number from 1 to ' + max + ', or empty for unlimited.';
        const error = document.getElementById('settings-limits-error');
        if (error) error.textContent = message;
        else toast(message, 'err');
        document.getElementById('st-limit-' + key)?.focus();
        return false;
      }
    }
    // Generation settings: every request uses them instead of a body value.
    const aiChecks = [
      ['temperature', /^\d+(\.\d+)?$/, 2, 'Temperature must be a number from 0 to 2.', 'st-ai-temperature'],
      ['max_tokens', /^\d+$/, 1000000, 'Max output tokens must be a whole number from 1 to 1000000.', 'st-ai-max-tokens'],
    ];
    for (const [key, pattern, max, message, elementId] of aiChecks) {
      const raw = String(draft.ai[key]).trim();
      const minimum = key === 'max_tokens' ? 1 : 0;
      if (!pattern.test(raw) || Number(raw) < minimum || Number(raw) > max) {
        const error = document.getElementById('settings-ai-error');
        if (error) error.textContent = message;
        else toast(message, 'err');
        document.getElementById(elementId)?.focus();
        return false;
      }
    }
    // The documentation block: the repository is what the bridge downloads.
    const docsChecks = [
      ['results', /^\d+$/, 1, 10, 'Search results must be a whole number from 1 to 10.', 'st-docs-results'],
      ['max_chars', /^\d+$/, 500, 50000, 'Documentation context must be a whole number from 500 to 50000 characters.', 'st-docs-max-chars'],
      ['refresh_hours', /^\d+$/, 0, 8760, 'The refresh interval must be a whole number of hours from 0 to 8760.', 'st-docs-refresh-hours'],
    ];
    const docs = draft.ai.docs;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(docs.repo.trim())) {
      const error = document.getElementById('settings-ai-error');
      const message = 'The documentation repository must be written as owner/name.';
      if (error) error.textContent = message;
      else toast(message, 'err');
      document.getElementById('st-docs-repo')?.focus();
      return false;
    }
    for (const [key, pattern, minimum, max, message, elementId] of docsChecks) {
      const raw = String(docs[key]).trim();
      if (!pattern.test(raw) || Number(raw) < minimum || Number(raw) > max) {
        const error = document.getElementById('settings-ai-error');
        if (error) error.textContent = message;
        else toast(message, 'err');
        document.getElementById(elementId)?.focus();
        return false;
      }
    }
    if (String(draft.ai.system_prompt || '').length > 8000) {
      const error = document.getElementById('settings-ai-error');
      const message = 'The system prompt must be at most 8000 characters.';
      if (error) error.textContent = message;
      else toast(message, 'err');
      document.getElementById('st-ai-systemprompt')?.focus();
      return false;
    }
  }
  const body = overrides || {
    services: draft.services.slice(),
    storage: { mode: draft.storage.mode, database: draft.storage.database },
    ai: {
      ...draft.ai,
      models: draft.ai.models.slice(),
      temperature: Number(draft.ai.temperature),
      max_tokens: Number(draft.ai.max_tokens),
      system_prompt: draft.ai.system_prompt || '',
      docs: {
        enabled: !!draft.ai.docs.enabled,
        repo: draft.ai.docs.repo.trim(),
        results: Number(draft.ai.docs.results),
        max_chars: Number(draft.ai.docs.max_chars),
        refresh_hours: Number(draft.ai.docs.refresh_hours),
      },
    },
    notifications: { ...draft.notifications, events: { ...draft.notifications.events }, cooldown_seconds: Number(draft.notifications.cooldown_seconds) },
    backups: { interval_minutes: Number(draft.backups.interval_minutes), max_backups: Number(draft.backups.max_backups) },
    global_limits: {
      genai_requests_per_day: parseGlobalLimit(draft.global_limits.genai_requests_per_day, 1000000),
      datastore_storage_mb: parseGlobalLimit(draft.global_limits.datastore_storage_mb, 1048576),
    },
    secrets: { ...draft.secrets },
  };
  if (!(await reviewChanges(state.settings, body, apply))) return false;
  state.busy.settings = true;
  renderSettingsSection();
  try {
    await api(API.settings, { method: 'POST', body });
    await fetchState();
    state.settings = snapshotConfig(state.config);
    state.settingsDraft = cloneSettings(state.settings);
    if (apply) {
      toast('Settings saved.', 'info');
      return await applySaved(true);
    }
    // A running bridge with live reload takes the saved settings right away.
    if (liveApply()) { await applyLive(); return true; }
    toast(state.status?.configuration === 'pending' ? 'Settings saved, but not active yet.' : 'Settings saved.', 'info');
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return false; }
    toast(err.message, 'err');
    return false;
  } finally {
    state.busy.settings = false;
    if (state.view === 'app') renderApp();
  }
}

export { cloneSettings, discardSettings, saveSettings, secretFlags, settingsDirtySections, settingsEqual, settingsSectionDirty, snapshotConfig };

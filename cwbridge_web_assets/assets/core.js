/* CWBridge console: core. Local ES module; no runtime dependencies. */
import { cloneSettings, snapshotConfig } from './settings-model.js';
import { handleUnauthorized } from './auth.js';
import { scheduleCompactDomainRows } from './pages/domains.js';
import { newDatastoreState } from './pages/datastore.js';
import { renderStatusPill, updateBridgeButtons } from './shell.js';
import { newOverviewState, newRobloxState, updateOverviewStatus } from './pages/overview.js';
import { newUsageState } from './pages/usage.js';
import { pollLogs } from './pages/logs.js';
import { startBlockReason } from './platform.js';

/* ------------------------------------------------------------------ *
 *  API layer — same-origin relative paths only                        *
 * ------------------------------------------------------------------ */
// Resolve against this module, never the current page (which may be nested).
// The paths are kept relative so a harness can rebase the whole graph onto
// another origin without duplicating a single URL. A console loaded from disk
// rather than from the server has no base path to derive: it serves itself.
let basePath = import.meta.url.startsWith('file:') ? '/' : new URL('../', import.meta.url).pathname;
function getBasePath() { return basePath; }
function setBasePath(value) { basePath = value; }

const API = {
  session:   'api/session',
  login:     'api/login',
  logout:    'api/logout',
  state:     'api/state',
  status:    'api/status',
  settings:  'api/settings',
  notifications: 'api/notifications',
  notificationTest: 'api/notifications/test',
  restartToken: 'api/notifications/restart-token',
  apply: 'api/bridge/apply',
  backupSchedule: 'api/backups/schedule',
  domainBackupRetain: 'api/domain/backup-retain',
  domainAdd: 'api/domain/add',
  domainUpd: 'api/domain/update',
  domainRem: 'api/domain/remove',
  domainRefresh: 'api/domain/refresh',
  domainResetDs: 'api/domain/reset-datastore',
  domainResetGenai: 'api/domain/reset-genai',
  domainActivity: 'api/domain/activity',
  domainBackups: 'api/domain/backups',
  domainBackupCreate: 'api/domain/backup-create',
  domainBackupRestore: 'api/domain/backup-restore',
  domainBackupDelete: 'api/domain/backup-delete',
  domainBackupRename: 'api/domain/backup-rename',
  backupsAll: 'api/backups/all',
  backupsDeleteAll: 'api/backups/delete-all',
  datastoreCollections: 'api/datastore/collections',
  datastoreEntries: 'api/datastore/entries',
  datastoreEntrySet: 'api/datastore/entry-set',
  datastoreEntryDelete: 'api/datastore/entry-delete',
  datastoreDocuments: 'api/datastore/documents',
  datastoreDocument: 'api/datastore/document',
  datastoreDocumentSet: 'api/datastore/document-set',
  datastoreDocumentDelete: 'api/datastore/document-delete',
  usage:     'api/usage',
  usageSnapshot: 'api/usage_snapshot',
  logs:      'api/logs',
  start:     'api/bridge/start',
  openRoblox: 'api/bridge/open-roblox',
  stop:      'api/bridge/stop',
  screenshot: 'api/bridge/screenshot',
  rejoin:    'api/bridge/rejoin',
  models:    'api/models',
  docsStatus: 'api/docs/status',
  docsRefresh: 'api/docs/refresh',
  docsSearch: 'api/docs/search',
  accessStatus: 'api/access/status',
  accessPassword: 'api/access/password',
  accessGenerated: 'api/access/generated',
  about:     'api/about',
  webStop: 'api/web/stop',
  aboutUpdate: 'api/about/update',
  aboutAutoUpdate: 'api/about/auto-update',
  aboutDoctor: 'api/about/doctor',
  aboutReset: 'api/about/reset',
  transferPlan: 'api/transfer/plan',
  transferExport: 'api/transfer/export',
  transferImport: 'api/transfer/import',
};

class UnauthorizedError extends Error {}

const authSession = { csrfToken: null };

/* One place resolves a relative path against this module's own location. The
 * path is folded to lower case because a deployment path is mixed case in the
 * module URL while the server answers on its lower-case form. A caller that
 * appends an opaque identifier (a session id, a domain name) says so, so the
 * identifier is never folded with it. */
function withBasePath(path) { return basePath + path.toLowerCase(); }

/* The whole backup store, listed on Settings → Backups. Kept apart from the
 * settings draft: it is read-only output, never a form value. */
function newSettingsBackupsState() {
  return { items: [], loading: false, loaded: false, error: null, request: 0 };
}

/* The About page owns release state, the doctor run and the transfer block.
 * Everything here is fetched on demand; nothing is polled. */
function newAboutState() {
  return {
    info: null, infoError: null, infoLoaded: false,
    plan: null, planError: null, planLoaded: false,
    doctor: null, doctorError: null, doctorBusy: false,
    updateBusy: false, autoBusy: false,
    importBusy: false, resetBusy: false,
    notice: null, // Last transfer result, shown until the next action.
    request: 0,   // Invalidates responses from a previous signed-in session.
  };
}

/* An export is a plain same-origin GET: the browser streams the file to disk
 * and no byte of it passes through JavaScript. The path is folded to lower
 * case like every other API path, while the query keeps its exact case so a
 * domain name is never mangled. */
function downloadUrl(path, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined) continue;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const suffix = query.toString();
  return getBasePath() + path.toLowerCase() + (suffix ? '?' + suffix : '');
}

function startDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

/* Base64 for an upload. Chunked because a whole archive in one
 * String.fromCharCode call would overflow the argument list. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/* A forwarder in front of the console (VS Code port forwarding, a reverse
 * proxy) can answer a single request with a gateway status or drop it while the
 * console itself is healthy. Reads are safe to repeat, so a GET is attempted
 * twice before the console reports an error; mutations never are. */
const GATEWAY_RETRY_DELAY_MS = 600;

function gatewayStatus(status) { return status === 502 || status === 503 || status === 504; }

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const pendingReads = new Map();
async function api(path, options = {}) {
  if (options.method === 'POST' && (path === API.start || path === API.apply || path === API.openRoblox)) {
    const reason = startBlockReason(state.status);
    if (reason) throw new Error(reason);
  }
  const method = options.method || 'GET';
  if (method !== 'GET') {
    pendingReads.clear(); // A read after a mutation must request fresh state.
    try { return await requestApi(path, options); }
    finally { pendingReads.clear(); }
  }
  const key = (options.raw ? basePath + path : withBasePath(path));
  let pending = pendingReads.get(key);
  if (!pending) {
    pending = requestApi(path, options);
    pendingReads.set(key, pending);
  }
  try { return structuredClone(await pending); }
  finally { if (pendingReads.get(key) === pending) pendingReads.delete(key); }
}

async function requestApi(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'Accept': 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && authSession.csrfToken) headers['X-CWBridge-CSRF'] = authSession.csrfToken;

  const send = () => fetch(raw ? basePath + path : withBasePath(path), {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin',
    ...(method === 'GET' ? { signal: AbortSignal.timeout(20000) } : {}),
  });

  let res;
  try {
    res = await send();
    if (method === 'GET' && gatewayStatus(res.status)) {
      await delay(GATEWAY_RETRY_DELAY_MS);
      res = await send();
    }
  } catch (err) {
    if (method !== 'GET') throw new Error('Network error: server unreachable.');
    // Same transient class as a gateway answer: one repeated read.
    await delay(GATEWAY_RETRY_DELAY_MS);
    try {
      res = await send();
    } catch (retryError) {
      throw new Error('Network error: server unreachable.');
    }
  }

  let data = {};
  try { data = await res.json(); } catch (_) { /* non-JSON */ }

  if (res.status === 401) {
    if (state.view === 'app' || state.view === 'setup') handleUnauthorized();
    throw new UnauthorizedError((data && data.error) || 'Sitzung abgelaufen.');
  }
  if (!res.ok) {
    if (gatewayStatus(res.status)) throw new Error('The forwarder in front of the console answered ' + res.status + '. Reload to try again.');
    throw new Error((data && data.error) || ('Serverfehler ' + res.status));
  }
  return data;
}

/* The CatWeb documentation knowledge base: read-only status, plus the test
 * search on the AI sub-page. Never part of the settings draft. */
function newDocsState() {
  return { status: null, statusError: null, loading: false, loaded: false,
           busy: false, query: '', results: [], searchError: null, searched: false };
}

/* The console's own credential (Settings → Credentials) and the mode the
 * sign-in form has to label itself with. Both are action state, not settings. */
function newAccessState() {
  return { status: null, error: null, notice: null, loading: false, loaded: false,
           busy: false, mode: '', scheme: '', password: '', confirmation: '', minLength: 8 };
}

const state = {
  view: 'loading',        // loading | login | setup | app
  tab: 'overview',
  config: null,
  services: [],
  serviceDescriptions: {}, // one plain-language line per service, for Settings
  status: null,
  domains: [],
  domainsError: null,
  settings: null,         // saved config snapshot for the settings form
  settingsDraft: null,    // unsaved edits, shared by every Settings sub-page
  settingsSection: 'limits', // active Settings sub-page (router keeps it in the URL)
  settingsBackups: newSettingsBackupsState(), // every stored snapshot, across all domains
  docs: newDocsState(),   // CatWeb documentation index: status and test search
  access: newAccessState(), // console credential: status and mode changes
  authMode: null,         // "generated" | "password", as the sign-in probe reports it
  aboutSection: 'general',
  helpSection: 'start',
  about: newAboutState(), // About: release state, doctor run and the transfer block
  domainEdit: null,       // Raw field drafts + selected services; parsed only on submit.
  domainSection: 'services', // active sub-page of the current domain
  datastore: newDatastoreState(), // stored collections + the browsed one
  datastoreSection: 'entries',    // active sub-page of the browsed collection
  limitsEdit: null,       // Independent per-domain draft in Settings.
  limitsDomain: '',
  settingsService: null,  // service to reveal after a jump from Settings
  globalLimitsSnapshot: null, // usage per domain for the global limits chart
  usage: newUsageState(),
  overview: newOverviewState(),
  roblox: newRobloxState(),
  logText: null,
  logError: null,
  logSessions: [],
  logSelection: '', // Empty follows the latest session on refresh.
  logSessionId: null,
  logRequest: 0,
  logMutation: false,
  busy: { bridge: false, logs: false, settings: false, models: false, domainRefresh: false, domainRemove: false, limitsSnapshot: false, backupDelete: false, backupPurge: false },
  refreshingDomain: null,
};

let statusTimer = null;

let logsTimer = null;

/* ------------------------------------------------------------------ *
 *  API bindings                                                        *
 * ------------------------------------------------------------------ */
async function fetchState() {
  const data = await api(API.state);
  applyState(data);
}

/* After an import or a reset the server holds a different configuration, so
 * every snapshot the console derived from the previous one has to be rebuilt
 * from the next state response: the settings draft, the domain drafts and the
 * limits editor would otherwise keep showing values that no longer exist. The
 * About page's own scratch state is reloaded the same way; only the last
 * transfer result is kept, because it belongs to the action the user just
 * took. */
function discardCachedState() {
  state.settings = null;
  state.settingsDraft = null;
  state.settingsBackups = newSettingsBackupsState();
  state.docs = newDocsState();
  state.access = newAccessState();
  state.domainEdit = null;
  state.limitsEdit = null;
  state.limitsDomain = '';
  state.settingsService = null;
  state.globalLimitsSnapshot = null;
  state.globalLimitsError = null;
  state.datastore = newDatastoreState();
  state.overview = newOverviewState();
  ++state.logRequest;
  state.logText = null;
  state.logError = null;
  state.logSessions = [];
  state.logSelection = '';
  state.logSessionId = null;
  state.about.info = null;
  state.about.plan = null;
  state.about.doctor = null;
  ++state.about.request;
}

function applyState(data) {
  state.config = data.config || {};
  state.aiProviders = data.ai_providers || [];
  state.aiProtocols = data.ai_protocols || [
    { value: 'openai-completions', label: 'OpenAI Chat Completions' },
    { value: 'openai-responses', label: 'OpenAI Responses' },
    { value: 'anthropic-messages', label: 'Anthropic Messages' },
    { value: 'ollama', label: 'Ollama (native)' },
  ];
  state.services = Array.isArray(data.services) ? data.services : [];
  state.serviceDescriptions = data.service_descriptions && typeof data.service_descriptions === 'object'
    ? data.service_descriptions : {};
  state.status = data.status || { running: false, pid: null };
  state.domains = Array.isArray(data.domains) ? data.domains : [];
  state.domainsError = data.domains_error || null;
  if (!state.settings) {
    state.settings = snapshotConfig(state.config);
    state.settingsDraft = cloneSettings(state.settings);
  }
}

async function pollStatus() {
  try {
    const data = await api(API.status);
    const incoming = data.status || data;
    if (state.status?.instance && incoming.instance && state.status.instance !== incoming.instance) {
      stopPolling();
      location.reload();
      return;
    }
    state.status = data.status || data;
    if (state.view === 'app') {
      const pill = document.querySelector('.status-pill');
      if (pill) renderStatusPill(pill);
      updateBridgeButtons();
      updateOverviewStatus();
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); }
  }
}

/* ------------------------------------------------------------------ *
 *  Polling                                                             *
 * ------------------------------------------------------------------ */
function refreshVisibleStatus() {
  if (!document.hidden) pollStatus();
}

function startPolling() {
  stopPolling();
  statusTimer = setInterval(() => { if (!document.hidden) pollStatus(); }, 5000);
  /* The one thing an operator sits and watches arrive is the log, so that is
   * the one poll fast enough to look live; the status check above stays slow
   * and quiet. */
  logsTimer = setInterval(pollLogs, 1000);
  window.addEventListener('resize', scheduleCompactDomainRows);
  document.addEventListener('visibilitychange', refreshVisibleStatus);
}

function stopPolling() {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (logsTimer) { clearInterval(logsTimer); logsTimer = null; }
  window.removeEventListener('resize', scheduleCompactDomainRows);
  document.removeEventListener('visibilitychange', refreshVisibleStatus);
}

export { API, UnauthorizedError, api, authSession, discardCachedState, downloadUrl, fetchState, getBasePath, newAboutState, newSettingsBackupsState, pollStatus, setBasePath, startDownload, startPolling, state, stopPolling, toBase64 };

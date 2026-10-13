/* CWBridge console: auth. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, authSession, fetchState, newSettingsBackupsState, startPolling, state, stopPolling } from './core.js';
import { checkBox, copyValue, customSelect, h, icon, installTooltips, spinner, toast } from './ui.js';
import { snapshotConfig } from './settings-model.js';
import { newOverviewState, newRobloxState } from './pages/overview.js';
import { newUsageState } from './pages/usage.js';
import { render, renderBooting } from './shell.js';

function handleUnauthorized() {
  authSession.csrfToken = null;
  state.roblox = newRobloxState(); // Discard private captures and invalidate in-flight responses.
  state.usage = newUsageState(); // Invalidate pending requests and discard authenticated data.
  state.overview = newOverviewState();
  ++state.logRequest; // Invalidate responses from the previous signed-in session.
  state.logText = null;
  state.logError = null;
  state.logSessions = [];
  state.logSelection = '';
  state.logSessionId = null;
  state.busy.logs = false;
  state.settings = null;
  state.settingsDraft = null;
  state.domainEdit = null;
  state.limitsEdit = null;
  state.limitsDomain = '';
  state.settingsService = null;
  state.globalLimitsSnapshot = null;
  state.globalLimitsError = null;
  state.globalLimitsRequest = (state.globalLimitsRequest || 0) + 1;
  state.busy.limitsSnapshot = false;
  state.settingsBackups = newSettingsBackupsState(); // Discard the previous session's backup listing.
  state.busy.backupDelete = false;
  state.busy.backupPurge = false;
  document.querySelectorAll('.dialog-backdrop').forEach(el => el.remove());
  stopPolling();
  // The mode is re-read with the next sign-in form: the credential may have
  // been changed from another browser while this session was open.
  state.authMode = null;
  state.access = { ...state.access, status: null, loaded: false, busy: false,
    mode: '', scheme: '', password: '', confirmation: '', error: null, notice: null };
  state.view = 'login';
  render();
}

/* ------------------------------------------------------------------ *
 *  Actions                                                             *
 * ------------------------------------------------------------------ */
/* Token handed over by "cwbridge web" via the URL fragment (#token=...).
   Fragments are never sent to the server; the URL is cleaned right after use.
   Only the generated mode produces one, so a console that expects a password
   never receives a credential through the address bar. */
function fragmentToken() {
  try {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (!raw) return null;
    const value = raw.startsWith('token=') ? raw.slice(6) : raw;
    return /^[\x21-\x7e]{32,256}$/.test(value) ? value : null;
  } catch (_) { return null; }
}

/* How this console wants to be signed in to. The signed-out session probe
   reports it; without an answer the form stays on the token it has always
   asked for. */
function wantsPassword() {
  return state.authMode === 'password';
}

function invalidCredentialText() {
  return wantsPassword() ? 'The password is invalid.' : 'Invalid access token.';
}

/* One probe at a time, only while the mode is unknown: the login form is
   painted before the answer arrives and repaints itself once it does. */
let authModeProbe = null;
function ensureAuthMode(repaint) {
  if (state.authMode) return;
  if (!authModeProbe) {
    authModeProbe = api(API.session)
      .then(data => { state.authMode = (data && data.auth && data.auth.mode) || 'generated'; })
      .catch(() => { state.authMode = state.authMode || 'generated'; })
      .then(() => { authModeProbe = null; });
  }
  authModeProbe.then(repaint);
}

function clearUrlFragment() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

async function loginWithToken(token) {
  const data = await api(API.login, { method: 'POST', body: { token } });
  authSession.csrfToken = data.csrf;
  await fetchState();
  state.view = state.config && state.config.setup_complete === false ? 'setup' : 'app';
  render();
  if (state.view === 'app') startPolling();
}

async function doLogin(ev) {
  ev.preventDefault();
  const input = document.getElementById('login-token');
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const showError = message => {
    errEl.querySelector('[data-error-text]').textContent = message;
    errEl.hidden = !message;
    input.closest('.login-field')?.classList.toggle('has-error', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  };
  if (!input.value.trim()) { showError(wantsPassword() ? 'Enter your password.' : 'Paste the access token first.'); input.focus(); return; }
  showError('');
  btn.disabled = true;
  btn.replaceChildren(spinner(), 'Signing in …');
  try {
    await loginWithToken(input.value.trim());
    input.value = '';
    clearUrlFragment();
  } catch (err) {
    showError(err instanceof UnauthorizedError ? invalidCredentialText() : err.message);
    btn.disabled = false;
    btn.replaceChildren('Sign in', icon('arrow-right'));
    input.select();
    input.focus();
  }
}

async function doLogout() {
  const request = api(API.logout, { method: 'POST', body: {} });
  handleUnauthorized(); // Clear the snapshot immediately, even while logout is pending.
  try { await request; } catch (_) { /* already signed out locally */ }
}

/* ------------------------------------------------------------------ *
 *  Render — the gate (sign in, setup, start-up)                        *
 * ------------------------------------------------------------------ */
/* The console before anyone is signed in is the console: the same brand it
 * carries in the rail, the same panels, fields and buttons, in one narrow
 * column in the middle of the window. The rail itself is the only thing
 * missing, because signed out there is nothing to navigate to.
 *
 * Every gate screen is built from this, so sign-in, first-run setup and the
 * start-up screen cannot drift apart. */
function gateCard({ title, note, build }) {
  const card = h('div', { class: 'gate-card' },
    h('div', { class: 'brand' },
      h('span', { class: 'logo' }, icon('terminal')),
      h('span', { class: 'brand-name', text: 'CWBridge' })));
  if (title) {
    card.append(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h3', { text: title }),
        h('span', { class: 'grow' }),
        note ? h('span', { class: 'panel-note', text: note }) : null),
      h('div', { class: 'panel-body stack' }, build())));
  } else {
    card.append(...build());
  }
  return h('div', { class: 'gate-page' }, card);
}

/* ------------------------------------------------------------------ *
 *  Render — login                                                      *
 * ------------------------------------------------------------------ */
function renderLogin() {
  const root = document.getElementById('app');
  root.textContent = '';

  const password = wantsPassword();
  if (!state.authMode) ensureAuthMode(() => { if (state.view === 'login') renderLogin(); });
  const input = h('input', { class: 'input', id: 'login-token', type: 'password', autocomplete: 'current-password',
    spellcheck: 'false', placeholder: password ? 'Your console password' : 'Paste the token from the terminal' });
  input.setAttribute('aria-label', password ? 'Password' : 'Access token');
  input.setAttribute('aria-describedby', 'login-help-text');
  const reveal = h('button', { class: 'btn ghost sm icon-only', type: 'button', 'aria-label': 'Show', 'data-tooltip': 'Show' }, icon('eye'));
  reveal.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    reveal.replaceChildren(icon(hidden ? 'eye-off' : 'eye'));
    reveal.setAttribute('aria-label', hidden ? 'Hide' : 'Show');
    reveal.dataset.tooltip = hidden ? 'Hide' : 'Show';
    input.focus();
  });
  const err = h('div', { class: 'callout login-error', id: 'login-error', role: 'alert', hidden: true },
    icon('circle-alert'), h('span', { 'data-error-text': '' }));
  const btn = h('button', { class: 'btn primary', type: 'submit', id: 'login-btn' }, 'Sign in', icon('arrow-right'));

  const field = h('div', { class: 'field login-field' },
    h('label', { for: 'login-token', text: password ? 'Password' : 'Access token' }),
    h('div', { class: 'copy-field' }, input, h('div', { class: 'copy-field-actions' }, reveal)),
    h('span', { class: 'hint', id: 'login-help-text', text: password
      ? 'The password you set under Settings → Credentials.'
      : 'Printed by the terminal that started the console.' }));
  input.addEventListener('input', () => {
    if (!err.hidden) { err.hidden = true; field.classList.remove('has-error'); input.removeAttribute('aria-invalid'); }
  });
  const form = h('form', { class: 'login-form', novalidate: true }, field, err, btn);
  form.addEventListener('submit', doLogin);

  /* Where the credential comes from, folded away until someone needs it. */
  const help = h('details', { class: 'login-help' },
    h('summary', {}, icon('info'), password ? 'Forgot the password?' : 'Where do I find the token?'),
    password
      ? h('ol', { class: 'login-steps' },
        h('li', {}, 'Stop the console. In ', copyValue('%APPDATA%\CWBridge\secrets.json'), ' remove only the four entries that start with “web.”.'),
        h('li', {}, 'Start ', copyValue('cwbridge web'), ' again: it prints an access token. Sign in with it and set a new password under Settings → Credentials.'))
      : h('ol', { class: 'login-steps' },
        h('li', {}, 'Open the terminal window where ', copyValue('cwbridge web'), ' is running.'),
        h('li', {}, 'Copy the value after “Access token:” and paste it here.'),
        h('li', {}, 'A new token is printed on every start; the link the console opens signs in on its own.')));

  const card = h('div', { class: 'gate-card login-card' },
    h('div', { class: 'brand' },
      h('span', { class: 'logo' }, icon('terminal')),
      h('span', { class: 'brand-name', text: 'CWBridge' })),
    h('section', { class: 'panel login-panel' },
      h('div', { class: 'login-head' },
        h('span', { class: 'login-badge', 'aria-hidden': 'true' }, icon(password ? 'lock' : 'key-round')),
        h('div', {},
          h('h1', { text: 'Sign in to the console' }),
          h('p', { text: password ? 'Enter your console password to continue.' : 'Paste the access token to manage your bridge.' }))),
      h('div', { class: 'panel-body' }, form),
      help),
    h('p', { class: 'login-foot' }, icon('lock'), 'Your session stays in a secure cookie on this device.'));
  root.append(h('div', { class: 'gate-page login-page' }, card));
  input.focus();
}

/* ------------------------------------------------------------------ *
 *  Render — first-run setup                                            *
 * ------------------------------------------------------------------ */
function renderSetup() {
  const root = document.getElementById('app');
  root.textContent = '';

  const consentBox = checkBox({ id: 'consent-box' });
  consentBox.addEventListener('change', () => { btn.disabled = !consentBox.checked; });

  const btn = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Complete setup');
  btn.append(icon('arrow-right'));

  const err = h('div', { class: 'error-text', role: 'alert' });

  const legacyAi = (state.config && state.config.ai) || {};
  const setupProviderOptions = (state.aiProviders || []).map(p => ({ value: p.value, label: p.label }));
  if (legacyAi.provider && !setupProviderOptions.some(o => o.value === legacyAi.provider)) {
    setupProviderOptions.push({ value: legacyAi.provider, label: legacyAi.provider + ' (saved)', preset: { base_url: legacyAi.base_url || '', protocol: legacyAi.protocol || 'openai-completions', mode: legacyAi.mode || 'cloud' } });
  }
  const presetFor = value => {
    const found = setupProviderOptions.find(o => o.value === value);
    return found && found.preset ? found.preset : (state.aiProviders || []).find(p => p.value === value) || null;
  };
  let setupProvider = legacyAi.provider || (setupProviderOptions[0] && setupProviderOptions[0].value) || 'custom';
  const providerSel = customSelect({
    value: setupProvider,
    options: setupProviderOptions,
    ariaLabel: 'Provider',
    onChange(v) { setupProvider = v; },
  });
  providerSel.querySelector('.k-select-trigger').id = 'setup-provider';
  const modelIn = h('input', { class: 'input', id: 'setup-model', autocomplete: 'off', spellcheck: 'false', placeholder: 'Model name (optional)' });
  modelIn.setAttribute('aria-label', 'Model name');

  const form = h('form', {},
    h('div', { class: 'field' },
      h('label', { for: 'setup-provider' }, 'Model provider'),
      providerSel,
      h('span', { class: 'hint', text: 'Provider for the services\u2019 AI requests.' })),
    h('div', { class: 'field' },
      h('label', { for: 'setup-model' }, 'Model'),
      modelIn,
      h('span', { class: 'hint', text: 'Without a model name, the AI service is disabled. You can add more models in the settings afterwards.' })),
    h('ul', { class: 'setup-list' },
      h('li', {}, icon('info'), h('span', {}, 'The console controls the local bridge and can send control commands to the local Roblox instance.')),
      h('li', {}, icon('info'), h('span', {}, 'Requests of the chosen provider are sent to its servers. Without the AI service, all data stays local.'))),
    h('label', { class: 'chip togglable', for: 'consent-box' }, consentBox, 'I have read the notes and consent'),
    err,
    btn);

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    btn.disabled = true;
    err.textContent = '';
    const saved = state.settings || snapshotConfig(state.config || {});
    const model = modelIn.value.trim();
    const services = model
      ? (saved.services.length ? saved.services : state.services.slice())
      : state.services.filter(s => s !== 'genai');
    const preset = presetFor(setupProvider) || {};
    const aiBody = {
      mode: preset.mode || saved.ai.mode || 'cloud',
      provider: setupProvider,
      protocol: preset.protocol || saved.ai.protocol || 'openai-completions',
      base_url: preset.base_url || saved.ai.base_url || '',
      model,
      models: model ? [model] : [],
    };
    // Without a model the AI service stays disabled: omit base_url so the
    // saved connection is kept instead of echoed back as a restriction.
    if (!model) delete aiBody.base_url;
    try {
      await api(API.settings, {
        method: 'POST',
        body: {
          consent: true,
          services,
          storage: saved.storage,
          ai: aiBody,
        },
      });
      await fetchState();
      state.view = 'app';
      render();
      startPolling();
      toast('Setup completed');
    } catch (e2) {
      err.textContent = e2.message;
      // The consent gate re-applies after a failed submit: the box is cleared,
      // which disables the submit until the user consents again (retry allowed).
      consentBox.checked = false;
      btn.disabled = true;
    }
  });

  root.append(gateCard({
    title: 'First-run setup', note: 'Before first use',
    build: () => [h('p', { class: 'gate-lede', text: 'A short setup before the console hands the bridge over to you.' }), form],
  }));
}

/* ------------------------------------------------------------------ *
 *  Boot                                                                *
 * ------------------------------------------------------------------ */
async function boot() {
  renderBooting();
  const autoToken = fragmentToken();
  if (autoToken) clearUrlFragment();
  try {
    const data = await api(API.session);
    if (data.auth && data.auth.mode) state.authMode = data.auth.mode;
    if (!data.csrf) {
      // Signed out. The server reports that as a plain state, so no
      // authenticated request follows and the browser console stays clean.
      if (autoToken) await loginWithToken(autoToken);
      else state.view = 'login';
    } else {
      authSession.csrfToken = data.csrf;
      await fetchState();
      if (state.config && state.config.setup_complete === false) state.view = 'setup';
      else state.view = 'app';
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      if (autoToken) {
        try {
          await loginWithToken(autoToken);
        } catch (loginErr) {
          state.view = 'login';
          renderLogin();
          const el = document.getElementById('login-error');
          if (el) el.textContent = loginErr instanceof UnauthorizedError ? invalidCredentialText() : loginErr.message;
        }
      } else {
        state.view = 'login';
      }
    } else {
      state.view = 'login';
      renderLogin();
      const el = document.getElementById('login-error');
      if (el) el.textContent = err.message;
      return;
    }
  }
  render();
  if (state.view === 'app') startPolling();
}

export { boot, doLogout, gateCard, handleUnauthorized, renderLogin, renderSetup };

/* CWBridge console: pages/about. Local ES module; no runtime dependencies.
 *
 * About is the console's one page about the installation rather than about a
 * domain: which build is installed, where it lives, how it is updated, whether
 * the installation is healthy, and how configuration and data move in and out
 * of it.
 *
 * Two rules run through the whole page:
 *
 * * Nothing here contacts the internet by itself. The release check and the
 *   install are explicit button presses; the auto-update switch only decides
 *   whether the server's own background worker (and the Windows login start)
 *   may check and install later.
 * * An export is a plain same-origin download and an import is one archive
 *   upload. The selection is made on this page and travels with the request, so
 *   the server keeps no state between the two steps.
 */
import {
  API, UnauthorizedError, api, authSession, discardCachedState, fetchState, getBasePath, state, stopPolling, toBase64,
} from '../core.js';
import { checkBox, confirmDialog, copyValue, customSelect, h, icon, openDialog, popInText, spinner, toast } from '../ui.js';
import { handleUnauthorized } from '../auth.js';

/* The request body carries the archive as base64, so a file has to stay below
 * the server's 64 MB wire limit with the encoding overhead included. */
const MAX_IMPORT_BYTES = 48 * 1024 * 1024;

/* Every settings block of the general configuration, in the order they are
 * stored. `general` is the command name and the setup flag. */
const SETTINGS_BLOCKS = [
  { id: 'general', label: 'General', note: 'Command name and setup state' },
  { id: 'storage', label: 'Storage', note: 'SQLite, local or remote MongoDB' },
  { id: 'services', label: 'Services', note: 'Which services are enabled' },
  { id: 'ai', label: 'AI & models', note: 'Connection, protocol and model pool' },
  { id: 'limits', label: 'Limits & usage', note: 'Bridge-wide caps' },
  { id: 'backups', label: 'Backups', note: 'Interval and snapshot cap' },
];

/* The selection survives a repaint, so ticking a box and then reading a
 * transfer result does not silently reset what the next export contains. */
const transfer = {
  sections: null, // Set of block ids, filled from the plan on first render
  domains: null,  // Set of domain names, filled from the plan on first render
  secrets: false,
  logs: true,
  mode: 'merge',
};

/* ------------------------------------------------------------------ *
 *  Small helpers                                                       *
 * ------------------------------------------------------------------ */
/* A full shell repaint rebuilds the toast stack, so a notice shown before the
 * repaint is gone by the time it could be read. Every action therefore repaints
 * first and reports afterwards — callers await repaint() and only then toast. */
function repaint() {
  const focusId = document.activeElement && document.activeElement.id ? document.activeElement.id : null;
  return import('../shell.js').then(({ renderApp }) => {
    renderApp();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  });
}

function failure(err, fallback) {
  if (err instanceof UnauthorizedError) { handleUnauthorized(); return ''; }
  return err.message || fallback;
}

function formatStamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let size = bytes;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return (index === 0 ? String(size) : size.toFixed(size < 10 ? 1 : 0)) + ' ' + units[index];
}

function panel(title, note, body, extraClass) {
  return h('div', { class: 'panel' + (extraClass ? ' ' + extraClass : '') },
    h('div', { class: 'panel-head' }, h('h3', { text: title }), h('span', { class: 'grow' }),
      note ? h('span', { class: 'panel-note', text: note }) : null),
    h('div', { class: 'panel-body stack' }, ...body));
}

function factRow(label, value, mono = true) {
  return h('div', { class: 'fact' },
    h('dt', { text: label }),
    mono && value ? h('dd', {}, copyValue(String(value), { label: 'Copy ' + label.toLowerCase() })) : h('dd', { class: mono ? 'mono' : null, text: value }));
}

/* ------------------------------------------------------------------ *
 *  Data                                                                *
 * ------------------------------------------------------------------ */
async function loadInfo(force = false) {
  const about = state.about;
  if (about.infoLoaded && !force) return;
  about.infoLoaded = true;
  about.infoError = null;
  const round = ++about.request;
  try {
    const info = await api(API.about);
    if (round !== about.request) return;
    about.info = info;
  } catch (err) {
    if (round !== about.request) return;
    about.infoError = failure(err, 'The version information could not be read.');
  }
  repaint();
}

async function loadPlan(force = false) {
  const about = state.about;
  if (about.planLoaded && !force) return;
  about.planLoaded = true;
  about.planError = null;
  const round = about.request;
  try {
    const plan = await api(API.transferPlan);
    if (round !== about.request) return;
    about.plan = plan;
    if (!transfer.sections) transfer.sections = new Set(plan.settings.sections);
    if (!transfer.domains) transfer.domains = new Set(plan.settings.domains);
  } catch (err) {
    if (round !== about.request) return;
    about.planError = failure(err, 'The export overview could not be read.');
  }
  repaint();
}

/* ------------------------------------------------------------------ *
 *  Release handling                                                    *
 * ------------------------------------------------------------------ */
function releaseState(info) {
  const updates = (info && info.updates) || {};
  const last = updates.last_result || null;
  const current = (info && info.version) || '—';
  if (!last) return { tone: 'idle', text: 'No release check yet.', detail: 'Nothing has been requested from the package registry.' };
  if (last.status === 'error') return { tone: 'err', text: 'The last check failed.', detail: String(last.message || '') };
  if (last.status === 'updated') return { tone: 'ok', text: `Updated to v${last.latest}.`, detail: 'A running bridge was stopped for the install and started again on the new build.' };
  if (last.status === 'update-available') return { tone: 'warn', text: `v${last.latest} is available.`, detail: `Installed: v${last.current || current}.` };
  return { tone: 'ok', text: `Up to date — v${last.latest || current}.`, detail: 'The newest published build is installed.' };
}

async function runUpdate(action) {
  const about = state.about;
  if (about.updateBusy) return;
  about.updateBusy = true;
  about.updateAction = action;
  about.notice = null;
  await repaint();
  let message = null;
  let kind = 'ok';
  try {
    const result = await api(API.aboutUpdate, { method: 'POST', body: { action } });
    if (result.web_restarting) {
      await waitForConsoleRestart(result.instance, result.latest);
      return;
    }
    const record = {
      status: result.status, current: result.current, latest: result.latest,
      update_available: result.update_available,
    };
    about.info = about.info
      ? { ...about.info, updates: { ...about.info.updates, last_result: record, last_check_at: new Date().toISOString() } }
      : about.info;
    if (result.status === 'updated') {
      message = result.restart_required
        ? `Installed CWBridge ${result.latest}. Restart the bridge to use it.`
        : `Installed CWBridge ${result.latest}.`;
    } else if (result.update_available) {
      message = `CWBridge ${result.latest} is available.`;
      kind = 'info';
    } else {
      message = `CWBridge ${result.current} is up to date.`;
    }
  } catch (err) {
    message = failure(err, 'The release check failed.');
    kind = 'err';
  }
  about.updateBusy = false;
  await repaint();
  if (message) toast(message, kind);
}

async function waitForConsoleRestart(previous, version) {
  stopPolling();
  state.view = 'restarting';
  const message = h('p', { role: 'status', text: 'Installed v' + version + '. Restarting the web console…' });
  const retry = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => location.reload() }, 'Reconnect');
  document.getElementById('app').replaceChildren(h('main', { class: 'main' }, h('h1', { text: 'Restarting web console' }), message, retry));
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const response = await fetch(getBasePath() + API.status, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(2000) });
      if (!response.ok) continue;
      const next = await response.json();
      if (next.instance && next.instance !== previous) {
        let runningVersion = next.web_version;
        if (!runningVersion) {
          const aboutResponse = await fetch(getBasePath() + API.about, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(2000) });
          if (!aboutResponse.ok) continue;
          runningVersion = (await aboutResponse.json()).version;
        }
        if (runningVersion === version) { location.reload(); return; }
        message.textContent = `The console restarted, but it is running v${runningVersion || 'unknown'} instead of v${version}. Start the updated CWBridge executable and reconnect.`;
        retry.hidden = false;
        return;
      }
    } catch (_) { /* A closed listener is expected during restart. */ }
  }
  message.textContent = `The update was installed, but a console running v${version} has not reconnected. Start the updated CWBridge executable and reconnect.`;
  retry.hidden = false;
}

async function stopWebConsole() {
  if (!(await confirmDialog({ title: 'Stop web console?', message: 'This closes the web interface on this address. The bridge continues running. Start “cwbridge web” to open the console again.', confirmLabel: 'Stop web console' }))) return;
  try {
    await api(API.webStop, { method: 'POST', body: {} });
    stopPolling();
    state.view = 'stopped';
    document.getElementById('app').replaceChildren(h('main', { class: 'main' },
      h('h1', { text: 'Web console stopped' }),
      h('p', { text: 'The bridge continues running. To reopen this interface, run cwbridge web.' })));
  } catch (error) { toast(failure(error, 'The console could not be stopped.'), 'err'); }
}

async function toggleAutoUpdate(enabled) {
  const about = state.about;
  if (about.autoBusy) return;
  about.autoBusy = true;
  await repaint();
  let message = enabled
    ? 'Automatic updates enabled. The console checks the registry at most once a day and at Windows login.'
    : 'Automatic updates disabled.';
  let kind = 'ok';
  try {
    const result = await api(API.aboutAutoUpdate, { method: 'POST', body: { enabled } });
    if (about.info) about.info = { ...about.info, updates: { ...about.info.updates, ...result.updates } };
  } catch (err) {
    message = failure(err, 'The auto-update setting could not be saved.');
    kind = 'err';
  }
  about.autoBusy = false;
  await repaint();
  if (message) toast(message, kind);
}

/* ------------------------------------------------------------------ *
 *  Doctor                                                              *
 * ------------------------------------------------------------------ */
async function runDoctor(connect, fix = false) {
  const about = state.about;
  if (about.doctorBusy) return;
  about.doctorBusy = true;
  about.doctorError = null;
  repaint();
  try {
    about.doctor = await api(API.aboutDoctor, { method: 'POST', body: { connect, fix } });
  } catch (err) {
    about.doctorError = failure(err, fix
      ? 'The repairs could not be applied.'
      : 'The diagnostics could not be run.');
  } finally {
    about.doctorBusy = false;
    repaint();
  }
}

/* ------------------------------------------------------------------ *
 *  Transfer                                                            *
 * ------------------------------------------------------------------ */
function exportPassword(creating) {
  return new Promise(resolve => {
    const password = h('input', { class: 'input', type: 'password', autocomplete: creating ? 'new-password' : 'current-password', 'aria-label': 'Export password', placeholder: 'At least 12 characters', maxlength: 1024 });
    const confirmation = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Confirm export password', placeholder: 'Repeat password', maxlength: 1024 });
    const error = h('p', { class: 'error-text', role: 'alert' });
    openDialog({ title: creating ? 'Encrypt export' : 'Unlock export', iconName: 'lock',
      onClose() { password.value = confirmation.value = ''; resolve(null); },
      buildBody(body) { body.classList.add('stack'); body.append(h('p', { class: 'hint', text: creating ? 'The entire file is encrypted. Keep this password: you need it to import the file on any computer.' : 'Enter the password used to encrypt this file.' }), password); if (creating) body.append(confirmation); body.append(error); },
      actions: [{ label: 'Cancel' }, { label: creating ? 'Export encrypted file' : 'Unlock', kind: 'primary', onClick(close) {
        if (password.value.length < 12 || (creating && password.value !== confirmation.value)) { error.textContent = 'Use at least 12 characters and matching passwords.'; return; }
        resolve(password.value); close();
      } }],
    });
    password.focus();
  });
}

function importControl(id, kind, label, { accept = '.zip,.json,.cwenc', primary = false } = {}) {
  const input = h('input', { type: 'file', class: 'file-input', id: id + '-file', accept, tabindex: '-1', 'aria-hidden': 'true' });
  const button = h('button', {
    class: 'btn' + (primary ? ' primary' : ''), type: 'button', id,
    disabled: state.about.importBusy,
  }, icon('upload'), label);
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) runImport(kind, file);
  });
  return h('span', { class: 'import-control' }, input, button);
}

function exportButton(id, kind, label, options) {
  const button = h('button', { class: 'btn', type: 'button', id }, icon('download'), label);
  button.addEventListener('click', async () => {
    // The selection is read when the button is pressed, not when it was built:
    // a checkbox ticked after the last repaint still decides the file.
    const resolved = typeof options === 'function' ? options() : options;
    let password = await exportPassword(true);
    if (password === null) return;
    button.disabled = true;
    try {
      const response = await fetch(getBasePath() + API.transferExport, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CWBridge-CSRF': authSession.csrfToken },
        body: JSON.stringify({ query: new URLSearchParams({ kind, ...resolved }).toString(), password }),
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Export failed.'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || `cwbridge-${kind}.cwenc`;
      const link = h('a', { href: url, download: filename });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast('Encrypted export downloaded.', 'ok');
    } catch (error) { toast(error.message, 'err'); }
    finally { password = null; button.disabled = false; }
  });
  return button;
}

async function runImport(kind, file) {
  const about = state.about;
  if (about.importBusy) return;
  if (file.size > MAX_IMPORT_BYTES) {
    toast(`“${file.name}” is ${formatBytes(file.size)}. Imports are limited to ${formatBytes(MAX_IMPORT_BYTES)}.`, 'err');
    return;
  }
  if (kind !== 'settings' && state.status && state.status.running) {
    toast('Stop the bridge before importing stored data.', 'err');
    return;
  }
  let password = null;
  if ((await file.slice(0, 21).text()).startsWith('CWBRIDGE-ENCRYPTED-1\n')) {
    password = await exportPassword(false);
    if (password === null) return;
  }
  if (transfer.mode === 'replace') {
    const confirmed = await confirmDialog({
      title: 'Replace instead of merge?',
      message: 'Snapshots and stored documents that are not part of this file are deleted before it is applied.',
      confirmLabel: 'Replace and import',
      destructive: true,
    });
    if (!confirmed) return;
  }
  about.importBusy = true;
  about.notice = null;
  await repaint();
  let message = null;
  let tone = 'ok';
  try {
    const data = toBase64(await file.arrayBuffer());
    const report = await api(API.transferImport, {
      method: 'POST',
      body: { kind, mode: transfer.mode, filename: file.name, data, password },
    });
    about.notice = { report, filename: file.name, failed: false };
    // The installation is a different one now: every cached draft is stale.
    discardCachedState();
    about.infoLoaded = false;
    about.planLoaded = false;
    await fetchState();
    message = reportSummary(report);
  } catch (err) {
    message = failure(err, 'The import failed.');
    if (message) {
      about.notice = { filename: file.name, failed: true, message };
      tone = 'err';
    }
  }
  about.importBusy = false;
  password = null;
  await repaint();
  if (message) toast(message, tone);
}

function reportSummary(report) {
  const parts = [];
  if (report.settings) parts.push(`${report.settings.domains.length} domain setting(s)`);
  if (report.datastore) parts.push(`${report.datastore.documents} stored value(s)`);
  if (report.backups) parts.push(`${report.backups.imported} snapshot(s)`);
  if (report.logs) parts.push(`${report.logs.imported} log(s)`);
  return parts.length ? 'Imported ' + parts.join(', ') + '.' : 'The file was read, but it contained nothing to apply.';
}

function reportDetails(report) {
  const lines = [];
  const skipped = (report.backups && report.backups.skipped_domains) || [];
  if (skipped.length) {
    lines.push('Snapshots for ' + skipped.join(', ') + ' were dropped: this installation has no such domain.');
  }
  for (const item of (report.backups && report.backups.invalid) || []) {
    lines.push(`Snapshot ${item.id || '(no id)'} was rejected: ${item.reason}`);
  }
  for (const item of (report.datastore && report.datastore.skipped) || []) {
    lines.push(`Collection ${item.collection} was skipped: ${item.reason}`);
  }
  const secrets = (report.settings && report.settings.secrets) || [];
  if (secrets.length) lines.push('Restored credentials: ' + secrets.join(', ') + '.');
  if (report.settings && report.settings.notifications) lines.push(report.settings.notifications);
  for (const item of (report.logs && report.logs.skipped) || []) {
    lines.push(`Log ${item.session} was skipped: ${item.reason}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ *
 *  Reset                                                              *
 * ------------------------------------------------------------------ */
async function resetInstallation() {
  const about = state.about;
  if (about.resetBusy) return;
  if (state.status && state.status.running) {
    toast('Stop the bridge before resetting this installation.', 'err');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Reset this installation?',
    message: 'Configuration, credentials, every domain with its stored data, all snapshots and all logs are deleted. '
      + 'This cannot be undone — export a bundle first if you may need any of it.',
    confirmLabel: 'Delete everything',
    destructive: true,
    requireText: 'reset everything',
  });
  if (!confirmed) return;
  about.resetBusy = true;
  await repaint();
  let report = null;
  let message = null;
  try {
    report = await api(API.aboutReset, { method: 'POST', body: { confirmation: 'reset everything' } });
  } catch (err) {
    message = failure(err, 'The reset failed.');
  }
  if (!report) {
    about.resetBusy = false;
    await repaint();
    if (message) toast(message, 'err');
    return;
  }
  discardCachedState();
  await fetchState();
  const failures = report.failures || [];
  if (failures.length) {
    // Something stayed behind: the console is still usable, so report it here
    // instead of pretending the installation is empty.
    about.resetBusy = false;
    await repaint();
    toast('Reset with problems: ' + failures.join(' '), 'err');
    return;
  }
  // Nothing is configured any more: the console returns to first-run setup,
  // which replaces the whole page — including any toast, so none is shown.
  const { render } = await import('../shell.js');
  state.view = 'setup';
  render();
}

/* ------------------------------------------------------------------ *
 *  Sections                                                           *
 * ------------------------------------------------------------------ */
function head(main, info) {
  const about = state.about;
  const check = h('button', {
    class: 'btn', type: 'button', id: 'about-check', disabled: about.updateBusy, 'aria-busy': String(about.updateBusy),
  }, icon('refresh-cw'), about.updateBusy ? (about.updateAction === 'install' ? 'Updating…' : 'Checking…') : 'Check for update');
  check.addEventListener('click', () => runUpdate('check'));

  // Blue only when the last check found a newer build; otherwise the install
  // stays a quiet secondary action next to the check.
  const last = info?.updates?.last_result || null;
  const available = !!last && (last.status === 'update-available' || last.update_available === true);
  const install = h('button', {
    class: 'btn' + (available ? ' primary' : ''), type: 'button', id: 'about-install', disabled: about.updateBusy,
    title: available ? '' : 'No newer version is known. Check for an update first.',
  }, icon('download'), available && last.latest ? 'Install v' + last.latest : 'Install update');
  install.addEventListener('click', () => runUpdate('install'));

  main.append(h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: 'About' }),
      h('p', {}, info ? `CWBridge ${info.version} · configuration schema ${info.schema_version}` : 'This installation.',
        available ? h('span', { class: 'status-badge warn about-update-badge' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), 'Update available') : null)),
    h('div', { class: 'page-actions' }, check, install)));
}

function versionPanel(info) {
  const facts = h('dl', { class: 'fact-list' });
  facts.append(
    factRow('Version', `v${info.version}`),
    factRow('Configuration schema', String(info.schema_version)),
    factRow('Build', info.frozen ? 'Installed build' : 'Source checkout', false),
    factRow('Platform', info.platform, false),
    factRow('Configuration folder', info.config_dir),
    factRow('Package', info.package),
    factRow('Registry', info.registry));
  return panel('Installation', null, [facts]);
}

function updatesPanel(info) {
  const updates = info.updates || {};
  const status = releaseState(info);
  const row = h('label', { class: 'switch-row', for: 'about-auto-update' });
  const box = checkBox({ id: 'about-auto-update', role: 'switch', disabled: state.about.autoBusy });
  box.checked = !!updates.auto_update;
  box.addEventListener('change', () => toggleAutoUpdate(box.checked));
  row.append(box, h('span', { class: 'switch-copy' },
    h('span', { class: 'switch-name', text: 'Automatic updates' }),
    h('span', { class: 'hint', text: 'Checks the package registry at most once a day. A newer build is installed on its own: the bridge is stopped, updated and started again, and the console restarts on the new version.' })));

  const detail = h('div', { class: 'release-state' },
    h('p', { class: 'release-line ' + status.tone }, popInText(status.text)),
    status.detail ? h('p', { class: 'hint', text: status.detail }) : null,
    h('p', { class: 'hint', text: updates.last_check_at
      ? 'Last check: ' + (formatStamp(updates.last_check_at) || updates.last_check_at)
      : 'This installation has never asked the registry.' }));

  return panel('Updates', updates.auto_update ? 'Automatic' : 'Manual', [row, detail,
    h('p', { class: 'hint', text: 'Installing an update stops a running bridge, replaces the build and starts the bridge again on the new version.' })]);
}

/* What a repair run actually changed, or that there was nothing to change.
 * Installing, replacing and deleting are never done here, so the lines name the
 * command that owns each remaining difference instead. */
function doctorRepairs(repaired) {
  const list = h('div', { class: 'doctor-repairs' });
  if (!repaired || !repaired.length) {
    list.append(h('p', { class: 'hint', text: 'Doctor fix: nothing needed repairing; nothing was changed.' }));
    return list;
  }
  list.append(h('p', { class: 'hint', text: 'Doctor fix:' }));
  const items = h('ul', { class: 'repair-list' });
  for (const repair of repaired) {
    items.append(h('li', {}, h('span', { class: 'repair-name', text: repair.name }),
      h('span', { class: 'mono', text: repair.detail })));
  }
  list.append(items);
  return list;
}

function doctorPanel() {
  const about = state.about;
  const connect = checkBox({ id: 'about-doctor-connect' });
  connect.checked = !!(about.doctor && about.doctor.connect);

  const run = h('button', {
    class: 'btn' + (about.doctor ? '' : ' primary'), type: 'button', id: 'about-doctor-run', disabled: about.doctorBusy,
  }, about.doctorBusy ? spinner() : icon('stethoscope'), 'Run CW Bridge Doctor');
  run.addEventListener('click', () => runDoctor(connect.checked));

  /* Repairing is the same run with the repairs switched on. It only ever closes
   * differences that need no decision, so it needs no confirmation dialog; what
   * it will not touch is named in the panel. */
  const fix = h('button', {
    class: 'btn', type: 'button', id: 'about-doctor-fix', disabled: about.doctorBusy,
    'data-tooltip': 'Repair missing folders and the PATH entry this installation owns',
  }, icon('rotate-ccw'), 'Doctor fix');
  fix.addEventListener('click', () => runDoctor(connect.checked, true));

  const body = [
    h('label', { class: 'switch-row', for: 'about-doctor-connect' }, connect,
      h('span', { class: 'switch-copy' },
        h('span', { class: 'switch-name', text: 'Also test the database connection' }),
        h('span', { class: 'hint', text: 'Without this, the storage check only reads the configuration and never opens a connection.' }))),
    h('div', { class: 'row' }, run, fix),
  ];

  if (about.doctorError) body.push(h('p', { class: 'error-text', role: 'alert', text: about.doctorError }));
  if (about.doctor) {
    const summary = about.doctor.summary;
    body.push(h('div', { class: 'row doctor-summary' },
      h('span', { class: 'chip doctor-ok' }, icon('circle-check'), popInText(summary.ok + ' ok')),
      summary.warn ? h('span', { class: 'chip doctor-warn' }, icon('circle-alert'), popInText(summary.warn + ' warning(s)')) : null,
      summary.fail ? h('span', { class: 'chip doctor-fail' }, icon('circle-x'), popInText(summary.fail + ' error(s)')) : null));
    if (about.doctor.fix) body.push(doctorRepairs(about.doctor.repaired));
    const list = h('div', { class: 'doctor-list' });
    for (const item of about.doctor.items) {
      list.append(h('div', { class: 'doctor-row' },
        h('span', { class: 'doctor-status ' + item.status, text: item.status === 'ok' ? 'OK' : item.status.toUpperCase() }),
        h('span', { class: 'doctor-name', text: item.name }),
        h('span', { class: 'doctor-detail mono', text: item.detail })));
    }
    body.push(list);
  } else if (!about.doctorError) {
    body.push(h('p', { class: 'hint', text: 'Read-only checks: version, configuration, services, credentials, storage, install paths, logs and the Roblox client log.' }));
  }
  return panel('Diagnostics', about.doctor ? null : 'Not run yet', body);
}

/* The one destination that is public. The source repository is private, so it
 * is deliberately absent: a link to it would be a dead end for every operator,
 * and the published package is the only address that actually resolves. */
function resourcesPanel(info) {
  const links = (info && info.links) || {};
  const rows = [
    { href: links.npm, icon: 'package', title: 'npm package', note: 'Install and update with npx' },
  ].filter(row => row.href);

  const list = h('div', { class: 'link-list' });
  for (const row of rows) {
    list.append(h('a', {
      class: 'link-row', href: row.href, target: '_blank', rel: 'noopener noreferrer',
    },
      h('span', { class: 'link-icon' }, icon(row.icon)),
      h('span', { class: 'link-copy' },
        h('span', { class: 'link-title', text: row.title }),
        h('span', { class: 'link-note', text: row.note })),
      h('span', { class: 'link-go' }, icon('external-link'))));
  }
  if (!rows.length) list.append(h('p', { class: 'hint', text: 'The server did not report any links.' }));
  return panel('Resources & Links', null, [list,
    h('p', { class: 'hint', text: 'The package registry is the only address CWBridge reaches out to, and only when a release check is requested.' })]);
}

function selectionControls(plan) {
  const about = state.about;
  const picker = (options, values, label, change) => {
    const menu = customSelect({ options, value: [...values], ariaLabel: label, multiple: true, floating: true, onChange: change });
    menu.classList.add('transfer-picker');
    menu.setDisabled(about.importBusy || !options.length);
    return menu;
  };
  const blocks = picker(SETTINGS_BLOCKS.filter(b => plan.settings.sections.includes(b.id)).map(b => ({ value: b.id, label: b.label, note: b.note })), transfer.sections, 'Export settings blocks', values => { transfer.sections = new Set(values); });
  const domainList = picker(plan.settings.domains.map(name => ({ value: name, label: name })), transfer.domains, 'Export domains', values => { transfer.domains = new Set(values); });

  const secrets = checkBox({ id: 'export-secrets', disabled: about.importBusy });
  secrets.checked = transfer.secrets;
  secrets.addEventListener('change', () => { transfer.secrets = secrets.checked; });

  return [
    h('div', { class: 'field' }, h('span', { class: 'group-label', text: 'Include these blocks' }), blocks),
    h('div', { class: 'field' },
      h('div', { class: 'row' }, h('span', { class: 'group-label', text: 'Domains' }), h('span', { class: 'grow' })),
      domainList),
    h('label', { class: 'switch-row', for: 'export-secrets' }, secrets,
      h('span', { class: 'switch-copy' },
        h('span', { class: 'switch-name', text: 'Include API keys and secrets' }),
        h('span', { class: 'hint', text: 'Include the AI API key, the MongoDB URI, the webhook URL and the restart token in the password-encrypted export. The console password is never included.' }))),
  ];
}

function transferPanel(plan) {
  const about = state.about;
  const settingsOptions = () => ({
    sections: [...transfer.sections].join(','),
    domains: [...transfer.domains].join(','),
    secrets: transfer.secrets ? '1' : '0',
  });

  const settingsCard = h('div', { class: 'transfer-card transfer-settings' },
    h('div', { class: 'transfer-head' },
      h('span', { class: 'transfer-icon' }, icon('settings-2')),
      h('div', { class: 'transfer-copy' },
        h('h4', { text: 'Settings' }),
        h('p', { class: 'hint', text: 'General configuration and the per-domain registry: limits, owners, services and allowed models.' }))),
    ...selectionControls(plan),
    h('div', { class: 'row transfer-actions' },
      exportButton('action-export-settings', 'settings', 'Export settings', settingsOptions),
      importControl('action-import-settings', 'settings', 'Import settings')));

  const logsBox = checkBox({ id: 'export-logs', disabled: about.importBusy });
  logsBox.checked = transfer.logs;
  logsBox.addEventListener('change', () => { transfer.logs = logsBox.checked; });

  const backupCard = h('div', { class: 'transfer-card' },
    h('div', { class: 'transfer-head' },
      h('span', { class: 'transfer-icon' }, icon('scroll-text')),
      h('div', { class: 'transfer-copy' },
        h('h4', { text: 'Snapshots & logs' }),
        h('p', { class: 'hint', text: `${plan.backups.count} stored snapshot(s) across ${plan.backups.domains.length} domain(s), ${formatBytes(plan.backups.bytes)}.` }))),
    h('label', { class: 'switch-row', for: 'export-logs' }, logsBox,
      h('span', { class: 'switch-copy' },
        h('span', { class: 'switch-name', text: 'Include session logs' }),
        h('span', { class: 'hint', text: `${plan.logs.count} log(s), ${formatBytes(plan.logs.bytes)}. Logs can contain service and user content.` }))),
    h('p', { class: 'hint', text: 'A snapshot whose domain does not exist in the target installation is not restored — it would be unreachable data.' }),
    h('div', { class: 'row transfer-actions' },
      exportButton('action-export-backups', 'backups', 'Export snapshots', () => ({ logs: transfer.logs ? '1' : '0' })),
      importControl('action-import-backups', 'backups', 'Import snapshots')));

  const collections = plan.datastore.collections.length;
  const datastoreCard = h('div', { class: 'transfer-card' },
    h('div', { class: 'transfer-head' },
      h('span', { class: 'transfer-icon' }, icon('table')),
      h('div', { class: 'transfer-copy' },
        h('h4', { text: 'Datastore' }),
        h('p', { class: 'hint', text: `${collections} collection(s), ${formatBytes(plan.datastore.bytes)}. Every stored document of the configured database, including the registry and counters.` }))),
    h('p', { class: 'hint', text: 'Importing stored data requires a stopped bridge.' }),
    h('div', { class: 'row transfer-actions' },
      exportButton('action-export-datastore', 'datastore', 'Export datastore'),
      importControl('action-import-datastore', 'datastore', 'Import datastore')));

  /* Import mode is one of the console's own selects: the native control opened
   * the browser's menu, which looked nothing like the one every other form on
   * this page opens. */
  const mode = customSelect({
    value: transfer.mode,
    ariaLabel: 'Import mode',
    options: [
      { value: 'merge', label: 'Merge — keep what is not in the file' },
      { value: 'replace', label: 'Replace — delete first, then import' },
    ],
    onChange(value) { transfer.mode = value; },
  });
  mode.querySelector('.k-select-trigger').id = 'import-mode';
  mode.setDisabled(about.importBusy);

  const bundleCard = h('div', { class: 'transfer-card bundle' },
    h('div', { class: 'transfer-head' },
      h('span', { class: 'transfer-icon' }, icon('package')),
      h('div', { class: 'transfer-copy' },
        h('h4', { text: 'Complete bundle' }),
        h('p', { class: 'hint', text: 'One ZIP with settings, stored data, snapshots and logs — the whole installation in a single file.' }))),
    h('p', { class: 'hint', text: 'Always carries every settings block and every domain. The credentials switch in the settings card and the log switch above decide whether it also carries those.' }),
    h('div', { class: 'field' }, h('label', { for: 'import-mode' }, 'Import mode'), mode),
    h('div', { class: 'row transfer-actions' },
      exportButton('action-export-all', 'all', 'Export encrypted bundle', () => ({
        secrets: transfer.secrets ? '1' : '0',
        logs: transfer.logs ? '1' : '0',
      })),
      importControl('action-import-all', 'all', 'Import bundle', { primary: true })));

  const notice = about.notice ? importNotice(about.notice) : null;
  return h('section', { class: 'about-section' },
    h('p', { class: 'about-lede', text: 'Export password-encrypted files (.cwenc), or import an encrypted export or an older JSON/ZIP file.' }),
    notice,
    h('div', { class: 'transfer-grid' }, ...[settingsCard, backupCard, datastoreCard, bundleCard].map((card, index) => {
      const oldHead = card.querySelector('.transfer-head');
      const title = oldHead.querySelector('h4').textContent;
      const description = oldHead.querySelector('.hint');
      oldHead.remove();
      const body = h('div', { class: 'panel-body stack' }, description, ...Array.from(card.childNodes));
      card.classList.add('panel');
      card.append(h('div', { class: 'panel-head' }, h('h3', { text: title }),
        h('span', { class: 'panel-note', text: index === 0 ? 'Encrypted JSON' : 'Encrypted ZIP' })), body);
      return card;
    })));
}

function importNotice(notice) {
  const box = h('div', { class: 'notice' + (notice.failed ? ' err' : ' ok'), role: 'status' });
  box.append(icon(notice.failed ? 'circle-x' : 'circle-check'));
  const copy = h('div', { class: 'notice-copy' },
    h('strong', { text: notice.failed ? 'Import failed' : 'Import finished' }),
    h('span', { class: 'hint', text: notice.failed ? notice.message : `${notice.filename} — ${reportSummary(notice.report)}` }));
  box.append(copy);
  if (!notice.failed) {
    for (const line of reportDetails(notice.report)) {
      box.append(h('p', { class: 'notice-line', text: line }));
    }
  }
  return box;
}

function dangerPanel() {
  const button = h('button', {
    class: 'btn danger', type: 'button', id: 'about-reset', disabled: state.about.resetBusy,
  }, icon('trash-2'), 'Reset everything');
  button.addEventListener('click', resetInstallation);
  return h('div', { class: 'panel danger-zone' },
    h('div', { class: 'panel-head' }, h('h3', { text: 'Danger zone' }), h('span', { class: 'grow' })),
    h('div', { class: 'panel-body' },
      h('div', { class: 'row' },
        h('div', { class: 'domain-delete-copy' },
          h('strong', { text: 'Reset this installation' }),
          h('p', { class: 'hint', text: 'Deletes configuration, credentials, domains, stored data, snapshots and logs. Setup runs again afterwards. The bridge must be stopped.' })),
        button)));
}

/* ------------------------------------------------------------------ *
 *  Entry point                                                        *
 * ------------------------------------------------------------------ */
const ABOUT_SECTIONS = [
  { id: 'general', label: 'About', icon: 'info' },
  { id: 'transfer', label: 'Export & import', icon: 'download' },
  { id: 'danger', label: 'Danger zone', icon: 'circle-alert' },
];

const STARTUP_OPTIONS = [
  ['web_gui', 'Start Web GUI at login', 'Starts the local console and opens it in your browser when you sign in to Windows.'],
  ['connection', 'Connect to CatWeb at login', 'Starts the bridge in the background. It waits for Roblox and CatWeb to be ready.'],
  ['roblox', 'Open CatWeb in Roblox at login', 'Also launches Roblox straight into CatWeb, so the bridge connects without any clicks. Needs “Connect to CatWeb at login”.'],
];

function startupPanel(info) {
  const settings = info.startup || {};
  const controls = [];
  const rows = [];
  for (const [key, title, description] of STARTUP_OPTIONS) {
    const box = h('input', { type: 'checkbox', id: 'about-startup-' + key, disabled: !settings.supported });
    box.checked = !!settings[key];
    box.addEventListener('change', async () => {
      for (const control of controls) control.disabled = true;
      const body = { web_gui: !!settings.web_gui, connection: !!settings.connection, roblox: !!settings.roblox, [key]: box.checked };
      // Opening CatWeb only makes sense with the bridge, so the two follow each other.
      if (key === 'roblox' && box.checked) body.connection = true;
      if (key === 'connection' && !box.checked) body.roblox = false;
      try {
        const result = await api('api/startup', { method: 'POST', body });
        info.startup = result.startup;
        await repaint();
        toast('Login startup saved.', 'ok');
      } catch (err) {
        box.checked = !!settings[key];
        toast(failure(err, 'Startup could not be saved.'), 'err');
      } finally {
        for (const control of controls) control.disabled = !settings.supported;
      }
    });
    controls.push(box);
    rows.push(h('label', { class: 'switch-row', for: box.id }, box,
      h('span', { class: 'switch-copy' }, h('span', { class: 'switch-name', text: title }),
        h('span', { class: 'hint', text: description }))));
  }
  const autoUpdate = !!(info.updates && info.updates.auto_update);
  return panel('Startup', 'Windows login', [
    h('div', { class: 'startup-options' }, ...rows),
    h('p', { class: 'hint', text: settings.supported
      ? 'Saved immediately for this Windows user and used at the next login.'
        + (autoUpdate ? ' With automatic updates on, a newer release is installed before anything starts.' : '')
      : 'Login startup is available on Windows only.' }),
  ]);
}

function renderAboutTab(main) {
  const about = state.about;
  const section = state.aboutSection || 'general';
  if (section === 'danger') {
    main.append(h('div', { class: 'page-head' }, h('h1', { text: 'Danger zone' })), dangerPanel());
    return;
  }
  if (section === 'transfer') {
    loadPlan();
    main.append(h('div', { class: 'page-head' }, h('h1', { text: 'Export & import' })));
    const body = h('div', { class: 'stack about-stack' });
    if (about.plan) body.append(transferPanel(about.plan));
    else if (about.planError) body.append(h('p', { class: 'error-text', role: 'alert', text: about.planError }));
    else body.append(panel('Export & import', null, [h('div', { class: 'row quiet' }, spinner(), 'Loading …')]));
    main.append(body);
    return;
  }
  loadInfo();
  head(main, about.info);

  const body = h('div', { class: 'stack about-stack' });
  if (about.infoError) {
    body.append(h('p', { class: 'error-text', role: 'alert', text: about.infoError }));
  }
  if (about.info) {
    body.append(versionPanel(about.info), startupPanel(about.info), updatesPanel(about.info));
  } else if (!about.infoError) {
    body.append(panel('Installation', null, [h('div', { class: 'row quiet' }, spinner(), 'Loading …')]));
  }
  body.append(doctorPanel());
  if (about.info) body.append(resourcesPanel(about.info));

  main.append(body);
}

export { ABOUT_SECTIONS, renderAboutTab, stopWebConsole };

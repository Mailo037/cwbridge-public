import { API, UnauthorizedError, api, pollStatus, state } from './core.js';
import { confirmDialog, copyText, h, icon, openDialog, spinner, toast } from './ui.js';
import { updateBridgeButtons } from './shell.js';
import { startBlockReason } from './platform.js';

const noticeDismissalKey = 'cwbridge:hide-apply-notice:' + new URL('.', import.meta.url).pathname;
let applyNoticeDismissed = false;
try { applyNoticeDismissed = sessionStorage.getItem(noticeDismissalKey) === '1'; } catch (_) { /* Storage may be disabled. */ }

function diagnosisButton(connect = false, label = 'Run diagnostics') {
  return h('button', { class: 'btn sm', type: 'button', onclick: () => diagnose(connect) }, icon('stethoscope'), label);
}

async function diagnose(connect = false) {
  let content, dialogElement;
  let currentStorage = connect;
  const rerun = h('button', { class: 'btn sm', type: 'button', onclick: () => run(currentStorage) }, icon('refresh-cw'), 'Run again');
  const switchTest = h('button', { class: 'btn sm', type: 'button', onclick: () => run(!currentStorage) });
  let report = '';
  const copyReport = h('button', { class: 'btn sm', type: 'button', disabled: true, onclick: async () => {
    try { await copyText(report); toast('Diagnostics copied', 'ok'); } catch (error) { toast(error.message, 'err'); }
  } }, icon('copy'), 'Copy report');
  let closed = false, request = 0;
  openDialog({ title: connect ? 'Storage connection test' : 'Bridge diagnostics', iconName: 'stethoscope',
    onClose() { closed = true; request++; },
    buildBody(body, dialog) {
      dialogElement = dialog;
      dialog.classList.add('diagnostics-dialog');
      body.classList.add('scroll-slim');
      content = h('div', { class: 'diagnostics-list', role: 'status' });
      body.append(content);
    },
    actions: [{ label: 'Close' }],
  });
  dialogElement.querySelector('.dialog-actions').prepend(h('div', { class: 'diagnostics-actions' }, rerun, switchTest, copyReport));
  async function run(storage) {
    currentStorage = storage;
    rerun.disabled = switchTest.disabled = true;
    rerun.setAttribute('aria-busy', 'true');
    switchTest.textContent = storage ? 'View full diagnostics' : 'Test storage connection';
    const generation = ++request;
    const title = storage ? 'Storage connection test' : 'Bridge diagnostics';
    dialogElement.querySelector('h2').textContent = title;
    dialogElement.setAttribute('aria-label', title);
    dialogElement.classList.toggle('storage-test-dialog', storage);
    content.replaceChildren(spinner(), storage ? 'Testing storage access…' : 'Checking the installation…');
    try {
      const result = await api(API.aboutDoctor, { method: 'POST', body: { connect: storage } });
      if (closed || generation !== request) return;
      const all = result.items || [];
      const rows = storage ? all.filter(item => item.name === 'Storage'
        || (item.name === 'Configuration' && item.status !== 'ok')) : all;
      const issues = rows.filter(item => item.status !== 'ok');
      report = rows.map(item => `[${item.status.toUpperCase()}] ${item.name}: ${item.detail}`).join('\n');
      copyReport.disabled = !report;
      content.replaceChildren(h('p', { class: 'hint', text: storage
        ? 'Checks whether the configured database can be accessed. SQLite is opened read-only; MongoDB receives a connection test. No data is changed.'
        : 'Checks your installation, configuration and Roblox readiness. MongoDB is only contacted when you run the storage test.' }));
      const summary = h('div', { class: 'diagnostics-summary' + (issues.length || !rows.length ? ' needs-attention' : ' all-clear') },
        icon(issues.length || !rows.length ? 'circle-alert' : 'circle-check'), h('div', {}, h('h3', { text: !rows.length ? 'Storage could not be checked'
        : storage ? issues.length ? 'Storage needs attention' : 'Storage is accessible'
          : issues.length ? issues.length + ' checks need attention' : 'All checks passed' })));
      content.append(summary);
      const renderRow = item => h('div', { class: 'doctor-row' },
        h('span', { class: 'doctor-status ' + item.status, text: item.status.toUpperCase() }),
        h('strong', { class: 'doctor-name', text: item.name }),
        h('span', { class: 'doctor-detail', text: item.detail }));
      if (issues.length) content.append(h('div', { class: 'doctor-list diagnostics-issues' }, ...issues.map(renderRow)));
      const passed = rows.filter(item => item.status === 'ok');
      if (passed.length) content.append(h('details', { class: 'diagnostics-passed', open: storage || !issues.length },
        h('summary', {}, `Passed checks (${passed.length})`),
        h('div', { class: 'doctor-list' }, ...passed.map(renderRow))));
    } catch (error) {
      if (!closed && generation === request && !(error instanceof UnauthorizedError)) content.replaceChildren(
        h('p', { class: 'error-text', text: error.message }),
        h('button', { class: 'btn sm', type: 'button', onclick: () => run(storage) }, 'Try again'));
    } finally {
      if (!closed && generation === request) {
        rerun.disabled = switchTest.disabled = false;
        rerun.setAttribute('aria-busy', 'false');
      }
    }
  }
  await run(connect);
}

/* A running bridge that publishes the reload capability takes saved changes
 * in place: settings at once, a tab for each added domain, reopened tabs when
 * one was removed. Only a storage switch still needs a restart. */
function liveApply(status = state.status) {
  const bridge = status?.bridge;
  return !!status?.running && bridge?.pid === status.pid && (bridge?.capabilities || []).includes('reload');
}

function applyEffect() {
  if (liveApply()) return 'The running bridge takes the changes without a restart: new domains get a tab, removed ones are closed.';
  return state.status?.running ? 'The bridge will restart and ongoing requests may be interrupted.' : 'The bridge will start.';
}

function applyLabel() {
  return liveApply() ? 'Apply live' : state.status?.running ? 'Apply & restart' : 'Apply & start';
}

async function confirmApply(summary = 'Apply saved settings and domain changes') {
  return confirmDialog({ title: 'Apply configuration',
    message: summary + '. ' + applyEffect() + (liveApply() ? '' : ' Domain tabs will open when CatWeb is ready.'),
    confirmLabel: applyLabel(),
  });
}

function liveSummary(result) {
  const parts = [];
  if (result.added?.length) parts.push('opened ' + result.added.join(', '));
  if (result.removed?.length) parts.push('closed ' + result.removed.join(', '));
  if (result.tabs === 'reopening') parts.push('tabs are reopening');
  if (result.tabs === 'deferred' && (result.added?.length || result.removed?.length)) parts.push('tabs follow once CatWeb is ready');
  return 'Changes applied live' + (parts.length ? ' — ' + parts.join('; ') : '') + '.';
}

/* Apply after a save, without asking and without ever restarting: a bridge
 * that cannot take the change live keeps it as "saved, not active". */
async function applyLive() {
  if (!liveApply() || state.busy.bridge) return false;
  state.busy.bridge = true;
  updateApplyNotice();
  try {
    const result = await api(API.apply, { method: 'POST', body: { live_only: true } });
    if (result.live) toast(liveSummary(result), 'ok');
    else if (result.restart_required) toast('Saved. This change needs a bridge restart to take effect.', 'info');
    return !!result.live;
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) toast(error.message, 'err');
    return false;
  } finally {
    state.busy.bridge = false;
    await pollStatus();
    updateBridgeButtons();
    updateApplyNotice();
  }
}

async function applySaved(confirmed = false) {
  const reason = startBlockReason(state.status);
  if (reason) { toast(reason, 'err'); return false; }
  if (state.busy.bridge || (!confirmed && !(await confirmApply()))) return false;
  state.busy.bridge = true;
  updateBridgeButtons();
  updateApplyNotice();
  try {
    const result = await api(API.apply, { method: 'POST', body: {} });
    if (result.live) toast(liveSummary(result), 'ok');
    else toast(result.forced ? 'Previous bridge was terminated. New process started; waiting for CatWeb readiness.' : 'Bridge process started. CatWeb readiness is checked on Overview.', 'info');
    return true;
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      toast(error.message, 'err');
    }
    return false;
  } finally {
    state.busy.bridge = false;
    await pollStatus();
    updateBridgeButtons();
    updateApplyNotice();
  }
}

function updateApplyNotice() {
  const box = document.getElementById('apply-notice');
  if (!box) return;
  const configuration = state.status?.configuration;
  const startReason = startBlockReason(state.status);
  // The overview's status card already says "Bridge stopped" with its own
  // Start button; the banner would only repeat it right above.
  const repeatsOverview = configuration === 'stopped' && state.tab === 'overview' && !state.busy.bridge;
  box.hidden = applyNoticeDismissed || repeatsOverview || (!['pending', 'unknown', 'stopped'].includes(configuration) && !state.busy.bridge);
  const label = box.querySelector('[data-apply-label]');
  label.textContent = startReason || (state.busy.bridge ? 'Applying saved configuration…'
    : configuration === 'stopped' ? 'The bridge is stopped. Start it to handle requests and open your domain tabs.'
    : configuration === 'unknown' ? 'Running configuration could not be verified. Apply saved changes to synchronize.'
      : liveApply() ? 'Saved, but not active yet. Apply to load the changes into the running bridge — no restart needed.'
      : 'Saved, but not active. Apply changes to restart the bridge and reopen domain tabs.');
  // When nothing is pending, applying just starts the bridge: name it that.
  const apply = box.querySelector('button');
  const stopped = configuration === 'stopped';
  apply.replaceChildren(icon(stopped ? 'play' : 'refresh-cw'), stopped ? 'Start bridge' : 'Apply saved changes');
  apply.disabled = !!state.busy.bridge || !!state.busy.settings || !!startReason;
  box.classList.toggle('is-stopped', stopped);
}

function applyNotice() {
  const box = h('section', { class: 'panel row', id: 'apply-notice', role: 'status' },
    h('span', { class: 'grow', 'data-apply-label': '' }),
    // Both actions are one group: if the row is too narrow they wrap together.
    h('div', { class: 'apply-notice-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => applySaved() }, 'Apply saved changes'),
      diagnosisButton()),
    h('button', { class: 'btn ghost sm icon-only apply-notice-close', type: 'button',
      'aria-label': 'Hide notification', title: 'Hide notification', onclick: () => {
        applyNoticeDismissed = true;
        try { sessionStorage.setItem(noticeDismissalKey, '1'); } catch (_) { /* Keep the in-memory preference. */ }
        updateApplyNotice();
      } }, icon('x')));
  queueMicrotask(updateApplyNotice);
  return box;
}

export { applyEffect, applyLabel, applyLive, applyNotice, applySaved, confirmApply, diagnose, diagnosisButton, liveApply, updateApplyNotice };

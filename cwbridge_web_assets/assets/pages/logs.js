/* CWBridge console: pages/logs. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, authSession, state } from '../core.js';
import { confirmDialog, copyText, customSelect, emptyState, h, icon, setPopText, spinnerRow, streamText, toast } from '../ui.js';
import { renderApp } from '../shell.js';

async function fetchLogs() {
  const request = ++state.logRequest;
  const selection = state.logSelection;
  state.busy.logs = true;
  state.logError = null;
  try {
    const data = await api(API.logs + (selection ? '/' + encodeURIComponent(selection) : ''), { raw: true });
    if (request !== state.logRequest) return;
    state.logSessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.logSessionId = data.session_id || null;
    state.logText = data.session_id ? (data.text || '') : '';
  } catch (err) {
    if (request !== state.logRequest) return;
    state.logText = null;
    state.logSessionId = null;
    state.logError = err.message;
  } finally {
    if (request === state.logRequest) state.busy.logs = false;
  }
}

/* ---- Logs tab ------------------------------------------------------------ */
function logSessionLabel(session) {
  if (session.legacy) return 'Previous combined log';
  const date = new Date(session.started_at);
  const label = session.started_at && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : session.id;
  return label + (session.active ? ' · Running' : ' · Saved');
}

/* ---- Reading the log ------------------------------------------------------ *
 * The viewer sits in a frame of a fixed height and the log scrolls inside it,
 * the way a terminal does: what the operator watches is the end of the log, and
 * the page behind it must not grow with every line the bridge writes.
 *
 * Whether anyone is watching the end is asked of the frame's own position
 * rather than remembered in a flag: a reader who scrolled up to an older line
 * is simply no longer at the bottom, so the next poll leaves them there, and a
 * reader who scrolled back down is following again. One gesture, both ways,
 * with nothing to switch on or off — and nothing pulls the view away from
 * someone who is reading. */
const FOLLOW_SLACK = 32;   // the last lines are still "at the end"

function atNewest(frame) {
  return frame.scrollHeight - frame.scrollTop - frame.clientHeight < FOLLOW_SLACK;
}

function scrollToNewest(frame) {
  frame.scrollTop = frame.scrollHeight;
}

/* A log opens at its end: the newest line is the one an operator came for. The
 * page is still being built when the frame is made and has no height to scroll
 * within until it is in the document — which is one microtask later, before
 * anything is painted. */
function openAtNewest(frame) {
  queueMicrotask(() => { if (frame.isConnected) scrollToNewest(frame); });
}

async function pollLogs() {
  if (state.view !== 'app' || state.tab !== 'logs' || document.hidden || state.busy.logs || state.logMutation
      || document.querySelector('.dialog-backdrop') || document.querySelector('.logs-toolbar .k-select.open')
      || window.getSelection()?.toString()) return;
  const request = state.logRequest + 1;
  const previousId = state.logSessionId;
  const previousSessions = JSON.stringify(state.logSessions.map(({ size_bytes, ...session }) => session));
  await fetchLogs();
  if (state.logRequest !== request || state.view !== 'app' || state.tab !== 'logs' || state.logMutation) return;
  const frame = document.querySelector('.logs-panel .log-frame');
  const pre = frame?.querySelector('.log-view');
  const nextSessions = JSON.stringify(state.logSessions.map(({ size_bytes, ...session }) => session));
  if (frame && pre && state.logText && !state.logError && previousId === state.logSessionId && previousSessions === nextSessions) {
    // Do not replace the viewer: keep focus/scroll while someone reads older lines.
    const follow = atNewest(frame);
    /* Only what is new is written, and it streams in: a poll that finds two
     * more lines must not replay the whole log, and the lines that are arriving
     * are exactly the ones worth watching arrive. A log that is not simply
     * longer (a cleared or rotated session) is replaced as a whole instead. */
    const shown = pre.textContent;
    if (shown !== state.logText) {
      if (state.logText.startsWith(shown)) streamText(pre, state.logText.slice(shown.length));
      else pre.textContent = state.logText;
    }
    /* The new lines carry the view down with them — but only for a reader who
     * was already at the end. Someone further up keeps their place, and stays
     * the one who decides when to come back down. */
    if (follow) scrollToNewest(frame);
    const selected = state.logSessions.find(session => session.id === state.logSessionId);
    const meta = document.getElementById('logs-meta');
    if (meta && selected) setPopText(meta, logSessionLabel(selected) + ' · ' + state.logText.replace(/\n$/, '').split('\n').length + ' lines');
  } else if (!document.querySelector('.logs-toolbar .k-select.open') && !window.getSelection()?.toString()) {
    const focusedId = document.activeElement?.id;
    renderApp();
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  }
}

async function mutateLog(action) {
  if (state.logMutation || state.busy.logs || !state.logSessionId) return;
  const id = state.logSessionId;
  const selected = state.logSessions.find(session => session.id === id);
  if (!selected || (action === 'delete' && selected.active)) return;
  state.logMutation = true; // Suspend polling until confirmation and reload finish.
  try {
    if (!await confirmDialog({
      title: action === 'delete' ? 'Delete session log' : 'Clear session log',
      message: (action === 'delete' ? 'Permanently delete the log for ' : 'Remove all existing log entries for ') + logSessionLabel(selected) + '? '
        + (action === 'clear' ? 'The session is kept and new entries will continue to appear. ' : '') + 'This cannot be undone.',
      confirmLabel: action === 'delete' ? 'Delete log' : 'Clear log', destructive: true,
    })) return;
    const auth = authSession.csrfToken;
    await api(API.logs + '/' + action, { method: 'POST', body: { session_id: id } });
    if (state.view !== 'app' || auth !== authSession.csrfToken) return;
    if (action === 'delete' && state.logSelection === id) state.logSelection = '';
    state.logText = null;
    state.logSessionId = null;
    await reloadLogs();
    if (state.view === 'app') toast(action === 'delete' ? 'Session log deleted' : 'Session log cleared');
  } catch (err) {
    if (!(err instanceof UnauthorizedError) && state.view === 'app') toast(err.message, 'err');
  } finally { state.logMutation = false; }
}

async function reloadLogs() {
  const pending = fetchLogs();
  if (state.view === 'app' && state.tab === 'logs') renderApp();
  await pending;
  if (state.view === 'app' && state.tab === 'logs') renderApp();
}

async function copyLogText(text) {
  try { await copyText(text); }
  catch (_) { throw new Error('Copy unavailable. Use Download or select the log text to copy it.'); }
}

function renderLogsTab(main) {
  const loading = state.busy.logs;
  const selected = state.logSessions.find(session => session.id === state.logSessionId);
  const canExport = !loading && !state.logError && !!state.logSessionId && state.logText !== null;
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: 'Logs' }),
      h('p', { text: 'One log per bridge session. Sensitive data is masked in previews, copies and downloads.' })),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn', id: 'logs-refresh', 'aria-busy': String(loading), disabled: loading, onclick: reloadLogs }, icon('refresh-cw'), 'Refresh')));

  const selector = customSelect({
    value: state.logSelection,
    options: [{ value: '', label: 'Latest session' }, ...state.logSessions.map(session => ({ value: session.id, label: logSessionLabel(session) }))],
    ariaLabel: 'Saved bridge session',
    onChange(value) {
      state.logSelection = value;
      state.logText = null;
      state.logSessionId = null;
      reloadLogs();
    },
  });
  selector.querySelector('button').id = 'logs-session';
  selector.setDisabled(loading);
  const copy = h('button', { class: 'btn', id: 'logs-copy', disabled: !canExport, text: 'Copy log' });
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    try {
      await copyLogText(state.logText);
      if (copy.isConnected) toast('Session log copied');
    } catch (err) {
      if (copy.isConnected) toast(err.message, 'err');
    } finally { if (copy.isConnected) copy.disabled = false; }
  });
  const download = h('button', { class: 'btn', id: 'logs-download', disabled: !canExport, text: 'Download .log' });
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([state.logText], { type: 'text/plain;charset=utf-8' }));
    const link = h('a', { href: url, download: 'cwbridge-' + state.logSessionId + '.log' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const toolbar = h('div', { class: 'logs-toolbar' },
    h('div', { class: 'field logs-session-field' }, h('label', { for: 'logs-session', text: 'Session' }), selector),
    h('div', { class: 'page-actions' }, copy, download,
      h('button', { class: 'btn', id: 'logs-clear', disabled: loading || !selected, text: 'Clear log', onclick: () => mutateLog('clear') }),
      h('button', { class: 'btn danger', id: 'logs-delete', disabled: loading || !selected || selected.active, text: 'Delete log', onclick: () => mutateLog('delete') })));
  toolbar.append(h('p', { class: 'hint logs-auto-note', text: 'Updates automatically every second. Latest session follows new bridge starts; selecting a saved session keeps it open.' }));

  const panel = h('div', { class: 'panel logs-panel' });
  const lines = state.logText ? state.logText.replace(/\n$/, '').split('\n').length : 0;
  const meta = h('span', { class: 'panel-note', id: 'logs-meta' });
  setPopText(meta, loading ? 'Loading …' : !state.logError && selected ? logSessionLabel(selected) + ' · ' + lines + ' lines' : '');
  const pHead = h('div', { class: 'panel-head' },
    h('h3', { text: 'Bridge log' }),
    h('span', { class: 'grow' }),
    meta);

  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(loading) });
  if (loading) {
    body.append(h('div', { class: 'panel-body', role: 'status' }, spinnerRow()));
  } else if (state.logError) {
    body.append(emptyState('circle-alert', 'Log unavailable', state.logError, [
      h('button', { class: 'btn', onclick: reloadLogs }, icon('refresh-cw'), 'Try again'),
    ]));
  } else if (!state.logText) {
    body.append(emptyState('scroll-text', 'No entries yet', state.logSessionId ? 'This session has not written any log entries yet.' : 'Start the bridge to save its first session log.'));
  } else {
    /* The frame is what stops at the height in the stylesheet — the log inside
     * it is whole, however long the session runs. */
    const frame = h('div', { class: 'log-frame scroll-slim' });
    frame.append(h('pre', { class: 'log-view mark', 'aria-label': 'Log text', tabindex: '0', text: state.logText }));
    body.append(frame);
    openAtNewest(frame);
  }

  panel.append(pHead, body);
  main.append(head, toolbar);
  if (selected?.legacy) main.append(h('p', { class: 'hint logs-legacy-note', text: 'Older runs share this combined log. New bridge starts are saved as separate sessions.' }));
  main.append(panel);
  if (state.logText === null && !state.logError && !loading) {
    fetchLogs().then(() => { if (state.view === 'app' && state.tab === 'logs') renderApp(); });
  }
}

export { pollLogs, renderLogsTab };

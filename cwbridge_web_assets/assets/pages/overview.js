/* CWBridge console: pages/overview. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, fetchState, pollStatus, state } from '../core.js';
import { actionMenu, openDialog, confirmDialog, h, icon, popInText, setPopText, spinner, toast } from '../ui.js';
import { handleUnauthorized } from '../auth.js';
import { renderApp, updateBridgeButtons } from '../shell.js';
import { navigate } from '../router.js';
import { applySaved, diagnose } from '../operations.js';
import { openRequestHistory } from '../workflows.js';
import { startBlockReason } from '../platform.js';

async function bridgeStart() {
  const reason = startBlockReason(state.status);
  if (reason) { toast(reason, 'err'); return; }
  state.busy.bridge = true;
  updateBridgeButtons();
  try {
    await api(API.start, { method: 'POST', body: {} });
    toast('Bridge started');
    await pollStatus();
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) toast(err.message, 'err');
  } finally {
    state.busy.bridge = false;
    updateBridgeButtons();
  }
}

async function openRoblox() {
  const reason = startBlockReason(state.status);
  if (reason) { toast(reason, 'err'); return; }
  if (!state.status?.running || state.busy.bridge) return;
  state.busy.bridge = true;
  updateBridgeButtons();
  try {
    const confirmed = await confirmDialog({
      title: 'Open Roblox?',
      message: 'Launch Roblox and join CatWeb on the computer running CWBridge?',
      confirmLabel: 'Open Roblox',
    });
    if (!confirmed) return;
    const result = await api(API.openRoblox, { method: 'POST', body: {} });
    toast(result.already_open ? 'Roblox is already open.'
      : 'CatWeb launch requested through Roblox. Waiting for the game to load.', 'info');
    await pollStatus();
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) toast(err.message, 'err');
  } finally {
    state.busy.bridge = false;
    updateBridgeButtons();
    updateOverviewStatus();
  }
}

async function bridgeStop() {
  state.busy.bridge = true;
  updateBridgeButtons();
  try {
    const result = await api(API.stop, { method: 'POST', body: {} });
    // The server escalates to a termination when the bridge ignores the request;
    // say so plainly instead of reporting an ordinary stop.
    if (result && result.forced === true) toast(result.message || 'The bridge did not respond and was terminated.', 'info');
    else toast('Bridge stopped');
    await pollStatus();
    if (state.settingsDraft && state.settings && (state.settingsDraft.storage.mode !== state.settings.storage.mode)) {
      toast('Restart required for the change to take effect', 'info');
    }
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) toast(err.message, 'err');
  } finally {
    state.busy.bridge = false;
    updateBridgeButtons();
  }
}

async function restartBridge() {
  const reason = startBlockReason(state.status);
  if (reason) { toast(reason, 'err'); return; }
  const ok = await confirmDialog({
    title: 'Restart bridge',
    message: 'The bridge will be stopped and started again. Ongoing connections will be interrupted.',
    confirmLabel: 'Restart',
  });
  if (!ok) return;
  state.busy.bridge = true;
  updateBridgeButtons();
  try {
    await api(API.stop, { method: 'POST', body: {} });
    toast('Stopping bridge …', 'info');
    await new Promise(r => setTimeout(r, 600));
    await api(API.start, { method: 'POST', body: {} });
    toast('Bridge restarted');
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) toast(err.message, 'err');
  } finally {
    state.busy.bridge = false;
    await pollStatus();
    updateBridgeButtons();
  }
}

/* ---- Overview: bridge controls and an unfiltered daily snapshot ------- */
function newOverviewState() {
  return { data: null, loading: false, error: null, request: 0 };
}

/* ---- Roblox window: on-demand snapshot + confirmed rejoin -------------- */
function newRobloxState() {
  return { image: null, capturedAt: null, size: null, stale: false, loading: false, error: null, request: 0, rejoinBusy: false, rejoinMessage: null, rejoinError: null };
}

async function captureRobloxScreenshot() {
  const roblox = state.roblox;
  if (state.view !== 'app' || state.config?.setup_complete !== true || roblox.loading || roblox.rejoinBusy) return; // One capture at a time, no auto refresh.
  const request = ++roblox.request;
  roblox.loading = true;
  roblox.error = null;
  updateRobloxPanel();
  try {
    const data = await api(API.screenshot, { method: 'POST', body: {} });
    if (state.roblox !== roblox || request !== roblox.request) return; // Superseded or signed out.
    if (!data || typeof data.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image)
        || typeof data.captured_at !== 'string' || !Number.isFinite(Date.parse(data.captured_at))
        || !Number.isSafeInteger(data.width) || data.width < 1 || !Number.isSafeInteger(data.height) || data.height < 1) {
      throw new Error('The server returned an invalid window snapshot. Try capturing again.');
    }
    // Decode before replacing the last good frame; never assign arbitrary URLs to src.
    const image = new Image();
    image.src = data.image;
    await image.decode();
    if (state.roblox !== roblox || request !== roblox.request) return;
    roblox.image = data.image;
    roblox.capturedAt = new Date(data.captured_at).toISOString();
    roblox.size = { w: data.width, h: data.height };
    roblox.stale = false;
    roblox.error = null;
  } catch (err) {
    if (state.roblox !== roblox || request !== roblox.request) return;
    if (err instanceof UnauthorizedError) return; // handleUnauthorized already reset the panel.
    roblox.error = err.message;
    if (roblox.image) roblox.stale = true; // Keep the last frame visible, but label it.
  } finally {
    if (state.roblox === roblox && request === roblox.request) {
      roblox.loading = false;
      updateRobloxPanel();
    }
  }
}

function renderRobloxSnapshot(container) {
  const roblox = state.roblox;
  const snapshotImage = () => {
    const img = h('img', {
      class: 'roblox-snapshot-image',
      src: roblox.image,
      alt: roblox.stale
        ? 'Stale snapshot of the Roblox window, taken earlier and possibly out of date'
        : 'Snapshot of the Roblox window',
      decoding: 'async',
    });
    img.loading = 'lazy';
    if (roblox.capturedAt) img.setAttribute('data-captured-at', roblox.capturedAt);
    return img;
  };
  container.replaceChildren();
  container.setAttribute('aria-busy', String(roblox.loading));
  const meta = h('div', { class: 'row', id: 'roblox-snapshot-meta', 'aria-live': 'polite' });
  if (roblox.loading) {
    meta.append(spinner(), h('span', { text: 'Capturing the Roblox window …' }));
    container.append(meta);
    if (roblox.image) container.append(snapshotImage()); // Keep the last frame visible while capturing.
    return;
  }
  if (roblox.error && !roblox.image) {
    meta.append(icon('circle-alert'), h('span', { class: 'error-text', role: 'alert', text: 'Capture failed: ' + roblox.error }));
    container.append(meta);
    return;
  }
  if (!roblox.image) {
    meta.append(h('span', { class: 'hint', text: 'No window snapshot taken yet. Use “Capture now” to grab the current Roblox window.' }));
    container.append(meta);
    return;
  }
  meta.append(h('span', { class: 'hint' }, 'Captured ',
    h('time', { datetime: roblox.capturedAt, text: formatRobloxTimestamp(roblox.capturedAt) }),
    ' · ' + roblox.size.w + '×' + roblox.size.h));
  if (roblox.stale) meta.append(h('span', { class: 'hint warn', text: 'Stale snapshot — this earlier capture may no longer match the window.' }));
  if (roblox.error) meta.append(h('span', { class: 'error-text', role: 'alert', text: 'Capture failed: ' + roblox.error }));

  /* The frame lives in this page only, so these actions need no request: open
   * it to inspect, or drop it from the panel. */
  const inspect = h('button', { class: 'btn sm', type: 'button', id: 'roblox-open', 'aria-label': 'Open the snapshot to zoom and pan' }, icon('zoom-in'), h('span', { text: 'Inspect' }));
  inspect.addEventListener('click', () => inspectRobloxSnapshot());
  const clear = h('button', { class: 'btn ghost sm danger', type: 'button', id: 'roblox-clear', 'aria-label': 'Clear the stored snapshot' }, icon('trash-2'), h('span', { text: 'Clear snapshot' }));
  clear.addEventListener('click', clearRobloxSnapshot);
  meta.append(inspect, clear);
  container.append(meta, snapshotImage());
}

function formatRobloxTimestamp(iso) {
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

/* ---- Snapshot viewer: zoom, pan, fullscreen ---------------------------- */
/* The snapshot is only ever a value in this page's state — the server does not
 * keep the frame — so clearing it needs no request. The viewer is a layer of
 * its own instead of a dialog: it stays usable while the panel repaints. */
const SNAPSHOT_ZOOM_MIN = 0.25;
const SNAPSHOT_ZOOM_MAX = 8;
let snapshotViewer = null; // { layer, canvas, img, label, zoom, host }

function openSnapshotViewer({ image, caption, alt }) {
  closeSnapshotViewer();
  let zoom = 1;
  let fitWidth = 0; // The width the frame is shown at when the zoom is 100%.
  const zoomIn = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Zoom in', 'data-tooltip': 'Zoom in' }, icon('zoom-in'));
  const zoomOut = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Zoom out', 'data-tooltip': 'Zoom out' }, icon('zoom-out'));
  const fit = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Fit to the screen' }, icon('scan'), h('span', { text: 'Fit' }));
  const full = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Toggle fullscreen', 'aria-pressed': 'false' }, icon('maximize'), h('span', { text: 'Fullscreen' }));
  const zoomLabel = h('span', { class: 'snapshot-zoom-label mono', role: 'status', 'aria-live': 'polite', text: '100%' });
  const close = h('button', { class: 'btn ghost sm icon-only', type: 'button', 'aria-label': 'Close the snapshot viewer' }, icon('x'));

  const img = h('img', { class: 'snapshot-zoom-image', src: image, alt: alt || 'Roblox window snapshot', decoding: 'async', draggable: 'false' });
  const canvas = h('div', { class: 'snapshot-canvas', tabindex: '0', role: 'img', 'aria-label': (alt || 'Roblox window snapshot') + ' — zoom with the buttons or the mouse wheel' }, img);
  const bar = h('div', { class: 'snapshot-bar' },
    h('span', { class: 'snapshot-caption', text: caption }),
    h('span', { class: 'grow' }), zoomOut, zoomLabel, zoomIn, fit, full, close);
  const layer = h('div', { class: 'snapshot-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Roblox snapshot viewer' }, bar, canvas);

  function apply() {
    /* The width carries the zoom so the scroll box pans over the whole frame. */
    img.style.width = Math.max(1, Math.round(fitWidth * zoom)) + 'px';
    setPopText(zoomLabel, Math.round(zoom * 100) + '%');
    canvas.classList.toggle('is-zoomed', zoom > 1.001);
    zoomIn.disabled = zoom >= SNAPSHOT_ZOOM_MAX - 1e-9;
    zoomOut.disabled = zoom <= SNAPSHOT_ZOOM_MIN + 1e-9;
  }
  function setZoom(next) {
    zoom = Math.min(SNAPSHOT_ZOOM_MAX, Math.max(SNAPSHOT_ZOOM_MIN, next));
    apply();
  }
  /* Zoom around the pointer, so the spot under the cursor stays put. */
  function zoomAt(clientX, clientY, factor) {
    const before = zoom;
    const box = canvas.getBoundingClientRect();
    const cx = clientX - box.left;
    const cy = clientY - box.top;
    const ratio = Math.min(SNAPSHOT_ZOOM_MAX, Math.max(SNAPSHOT_ZOOM_MIN, before * factor)) / before;
    setZoom(before * factor);
    if (ratio !== 1) {
      canvas.scrollLeft = (canvas.scrollLeft + cx) * ratio - cx;
      canvas.scrollTop = (canvas.scrollTop + cy) * ratio - cy;
    }
  }
  function fitToScreen() {
    /* The canvas has no padding of its own: the frame fills it edge to edge. */
    const available = canvas.clientWidth;
    const natural = img.naturalWidth || 1;
    fitWidth = Math.max(80, Math.round(Math.min(natural, available > 0 ? available : natural)));
    zoom = 1;
    apply();
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeSnapshotViewer(); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom * 1.25); return; }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom(zoom / 1.25); return; }
    if (event.key === '0') { event.preventDefault(); fitToScreen(); }
  }
  zoomIn.addEventListener('click', () => setZoom(zoom * 1.25));
  zoomOut.addEventListener('click', () => setZoom(zoom / 1.25));
  fit.addEventListener('click', fitToScreen);
  full.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (layer.requestFullscreen) await layer.requestFullscreen();
    } catch (err) { toast('This browser refused the fullscreen request.', 'err'); }
  });
  close.addEventListener('click', closeSnapshotViewer);
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  canvas.addEventListener('dblclick', event => { event.preventDefault(); setZoom(zoom > 1.001 ? 1 : 2); });
  /* Drag to pan: a scaled image in a scrolling box has no native drag. */
  let pan = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || zoom <= 1.001) return;
    pan = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-panning');
  });
  canvas.addEventListener('pointermove', event => {
    if (!pan) return;
    canvas.scrollLeft = pan.left - (event.clientX - pan.x);
    canvas.scrollTop = pan.top - (event.clientY - pan.y);
  });
  const endPan = () => { pan = null; canvas.classList.remove('is-panning'); };
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
  document.addEventListener('fullscreenchange', updateFullscreenLabel);
  document.addEventListener('keydown', onKey, true);
  layer.addEventListener('mousedown', event => { if (event.target === layer || event.target === canvas) closeSnapshotViewer(); });

  function updateFullscreenLabel() {
    const active = !!(document.fullscreenElement && document.fullscreenElement === layer);
    full.classList.toggle('primary', active);
    full.setAttribute('aria-pressed', String(active));
    full.lastChild.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
  }

  document.body.append(layer);
  apply();
  /* A layer needs a size before the fit can be computed; the element is in the
   * document at this point, so one animation frame is enough. */
  const host = document.activeElement;
  requestAnimationFrame(() => { fitToScreen(); updateFullscreenLabel(); });
  snapshotViewer = {
    layer, canvas, img, label: zoomLabel, getZoom: () => zoom, host,
    detach() {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', updateFullscreenLabel);
    },
  };
}

/* The viewer as a function of the stored frame: the panel's Inspect button only
 * decides when to open it. */
function inspectRobloxSnapshot() {
  const roblox = state.roblox;
  if (!roblox.image) return false;
  const alt = roblox.stale
    ? 'Stale snapshot of the Roblox window, taken earlier and possibly out of date'
    : 'Snapshot of the Roblox window';
  const caption = 'Captured ' + formatRobloxTimestamp(roblox.capturedAt)
    + (roblox.size ? ' · ' + roblox.size.w + '×' + roblox.size.h : '');
  openSnapshotViewer({ image: roblox.image, caption, alt });
  return true;
}

function closeSnapshotViewer() {
  const viewer = snapshotViewer;
  if (!viewer) return;
  snapshotViewer = null;
  viewer.detach();
  if (document.fullscreenElement === viewer.layer && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  viewer.layer.remove();
  if (viewer.host && viewer.host.isConnected && viewer.host.focus) focusWithoutRing(viewer.host);
}

function clearRobloxSnapshot() {
  const roblox = state.roblox;
  if (state.view !== 'app' || roblox.loading) return;
  closeSnapshotViewer();
  ++roblox.request; // A capture in flight must not repaint the frame that was just cleared.
  roblox.image = null;
  roblox.capturedAt = null;
  roblox.size = null;
  roblox.stale = false;
  roblox.error = null;
  updateRobloxPanel();
}

async function bridgeRejoin() {
  const roblox = state.roblox;
  if (state.view !== 'app' || !state.status?.running || state.busy.bridge || state.busy.domainRefresh || roblox.loading || roblox.rejoinBusy) return;
  roblox.rejoinBusy = true; // Lock before confirmation so dialogs cannot stack.
  updateBridgeButtons();
  try {
    const ok = await confirmDialog({
      title: 'Rejoin Roblox + domains',
      message: 'This interrupts the current Roblox session and requests a new CatWeb launch. '
        + 'The running bridge will reopen your registered domains in Roblox when CatWeb is ready. Check Logs for recovery progress.',
      confirmLabel: 'Request rejoin',
    });
    if (!ok || state.roblox !== roblox || state.view !== 'app') return;
    if (!state.status?.running || state.busy.bridge) throw new Error('Start the bridge before requesting a rejoin.');
    roblox.rejoinMessage = null;
    roblox.rejoinError = null;
    if (roblox.image) roblox.stale = true; // A timed-out request may still have launched; treat the frame as outdated from the moment it is sent.
    updateRobloxPanel();
    const data = await api(API.rejoin, { method: 'POST', body: {} });
    if (state.roblox !== roblox || state.view !== 'app') return;
    if (data?.ok !== true || data?.launched !== true) throw new Error('The server did not confirm a launch request. Check Logs before retrying.');
    roblox.rejoinMessage = 'Launch requested — joining is not confirmed. Domains will reopen when CatWeb is ready. Check Logs for recovery progress.';
    toast(roblox.rejoinMessage, 'info');
  } catch (err) {
    if (state.roblox !== roblox) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    roblox.rejoinError = err.message;
  } finally {
    if (state.roblox === roblox) {
      roblox.rejoinBusy = false;
      updateBridgeButtons();
      updateRobloxPanel();
    }
  }
}

function updateRobloxButtons() {
  const roblox = state.roblox;
  const capture = document.getElementById('roblox-capture');
  const rejoin = document.getElementById('roblox-rejoin');
  if (capture) {
    capture.disabled = state.config?.setup_complete !== true || roblox.loading || roblox.rejoinBusy;
    capture.setAttribute('aria-busy', String(roblox.loading));
    capture.querySelector('span').textContent = roblox.loading ? 'Capturing …' : roblox.image ? 'Refresh snapshot' : 'Capture now';
  }
  if (rejoin) {
    rejoin.disabled = !state.status?.running || state.busy.bridge || state.busy.domainRefresh || roblox.loading || roblox.rejoinBusy;
    rejoin.setAttribute('aria-busy', String(roblox.rejoinBusy));
    rejoin.querySelector('span').textContent = roblox.rejoinBusy ? 'Rejoin pending …' : 'Rejoin + domains';
  }
  const note = document.getElementById('roblox-rejoin-note');
  if (note) setPopText(note, state.status?.running
    ? 'Rejoin interrupts Roblox. The bridge reopens domains when CatWeb is ready.'
    : 'Start the bridge to rejoin and reopen domains. Snapshots also work while the bridge is stopped.');
}

function updateRobloxPanel() {
  /* The panel is rebuilt below, so a viewer left over from the previous frame
   * would show a snapshot that is no longer on screen. */
  closeSnapshotViewer();
  updateRobloxButtons();
  const container = document.getElementById('roblox-snapshot');
  if (container) renderRobloxSnapshot(container);
  const message = document.getElementById('roblox-rejoin-message');
  if (message) {
    message.className = state.roblox.rejoinError ? 'error-text' : 'hint';
    setPopText(message, state.roblox.rejoinError || state.roblox.rejoinMessage || '');
  }
}

function overviewNavigate(tab, addDomain = false) {
  navigate(tab === 'services' ? 'settings' : tab, tab === 'services' ? { section: 'services' } : { addDomain });
  document.querySelector('.main')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function fetchOverviewUsage() {
  const overview = state.overview;
  if (overview.loading) return;
  const request = ++overview.request;
  overview.loading = true;
  overview.error = null;
  overview.data = null;
  updateOverviewUsage();
  try {
    const data = await api(API.usage, { method: 'POST', body: { domain: null, service: null, days: 7 } });
    if (state.overview === overview && request === overview.request) overview.data = data;
  } catch (err) {
    if (state.overview !== overview || request !== overview.request) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    overview.error = err.message;
  } finally {
    if (state.overview === overview && request === overview.request) {
      overview.loading = false;
      updateOverviewUsage();
    }
  }
}

function updateOverviewStatus() {
  const overall = document.getElementById('overview-overall');
  if (overall) {
    const running = !!state.status?.running;
    const bridge = state.status?.telemetry_fresh ? state.status.bridge : null;
    const ready = running && bridge?.catweb_ready === true;
    const waiting = bridge?.waiting_for || '';
    const pending = state.status?.configuration === 'pending';
    const startReason = startBlockReason(state.status);
    let title, detail, label, action;
    if (startReason && (pending || !running || bridge?.roblox_open === false)) { title = 'Windows required'; detail = startReason; label = 'Start unavailable'; action = null; }
    else if (running && bridge?.roblox_open === false) { title = 'Roblox is not open'; detail = 'CWBridge is running, but no Roblox Player window was found. Open Roblox and join CatWeb.'; label = 'Open Roblox'; action = openRoblox; }
    else if (state.domainsError) { title = 'Domain storage needs attention'; detail = state.domainsError; label = 'Check connection'; action = () => diagnose(true); }
    else if (!state.domains.length) { title = 'Create your first domain'; detail = 'Choose a template to set up services and sensible limits.'; label = 'Add domain'; action = () => navigate('domains', { addDomain: true }); }
    else if (pending) { title = 'Saved changes are waiting'; detail = 'Apply the saved configuration to update the running bridge.'; label = 'Apply saved changes'; action = () => applySaved(); }
    else if (!running) { title = 'Bridge stopped'; detail = 'Start the bridge to handle requests for your configured domains.'; label = 'Start bridge'; action = bridgeStart; }
    else if (ready) { title = 'Ready for requests'; detail = 'CatWeb is ready. Individual response delivery is tracked separately from readiness.'; label = 'View requests'; action = openRequestHistory; }
    else { title = /closed|not open/i.test(waiting) ? 'Open Roblox and join CatWeb' : 'Waiting for CatWeb'; detail = /focus|foreground/i.test(waiting) ? 'Click the Roblox window once, then retry the domain tabs.' : waiting || 'Waiting for fresh CatWeb readiness evidence.'; label = 'Check connection'; action = () => diagnose(); }
    setPopText(overall.querySelector('h2'), title);
    setPopText(overall.querySelector('p'), detail);
    overall.dataset.ready = String(ready && !pending && !state.domainsError);
    const next = overall.querySelector('[data-next-action]'); next.setAttribute('aria-label', label); setPopText(next, label); next.onclick = action; next.disabled = !!state.busy.bridge || !action;
  }
}

function updateOverviewUsage() {
  const container = document.getElementById('overview-usage');
  if (!container) return;
  const overview = state.overview;
  container.replaceChildren();
  container.setAttribute('aria-busy', String(overview.loading));
  if (overview.loading) {
    container.append(h('p', { class: 'hint', role: 'status', text: 'Loading today’s usage …' }));
    return;
  }
  if (overview.error) {
    container.append(h('p', { class: 'error-text', role: 'alert', text: 'Usage could not be loaded: ' + overview.error }),
      h('button', { class: 'btn sm', onclick: fetchOverviewUsage, text: 'Retry usage' }));
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const row = overview.data?.series?.find(item => item.day === today);
  if (!row) {
    container.append(h('p', { class: 'hint', text: 'No usage data for today is available. Refresh to try again.' }));
    return;
  }
  const metrics = h('dl', { class: 'overview-metrics' });
  for (const [key, label] of [['total', 'Requests'], ['succeeded', 'Succeeded'], ['failed', 'Failed']]) {
    metrics.append(h('div', {}, h('dt', { text: label }),
      h('dd', { id: 'overview-today-' + key }, popInText(Number(row[key] || 0).toLocaleString('en-US')))));
  }
  container.append(metrics, h('p', { class: 'hint', text: row.total === 0
    ? 'No requests recorded today. Counts include all domains and services.'
    : 'All domains and services, including removed domains. Resets at midnight UTC.' }));
}

function openRobloxPanel() {
  openDialog({ title: 'Roblox window', iconName: 'scan', onClose: closeSnapshotViewer,
    buildBody(body, dialog) {
      dialog.classList.add('workflow-dialog');
      body.append(h('p', { class: 'hint', text: 'On-demand snapshot. The Roblox window must be open and not minimized.' }),
        h('div', { class: 'row' }, h('button', { class: 'btn', id: 'roblox-capture', onclick: captureRobloxScreenshot }, icon('refresh-cw'), h('span', { text: 'Capture now' }))),
        h('div', { id: 'roblox-snapshot', 'aria-live': 'polite' }),
        h('p', { class: 'hint', id: 'roblox-rejoin-note' }),
        h('div', { class: 'row' }, h('button', { class: 'btn', id: 'roblox-rejoin', 'aria-describedby': 'roblox-rejoin-note', onclick: bridgeRejoin }, icon('refresh-cw'), h('span', { text: 'Rejoin + domains' }))),
        h('p', { class: 'hint', id: 'roblox-rejoin-message', role: 'status' }));
    },
  });
  updateRobloxPanel();
}

function renderOverviewTab(main) {
  const start = h('button', { id: 'bridge-start', onclick: bridgeStart }, icon('play'), h('span', { text: 'Start bridge' }));
  const stop = h('button', { id: 'bridge-stop', onclick: bridgeStop }, icon('square'), h('span', { text: 'Stop bridge' }));
  start.disabled = state.busy.bridge || !!state.status?.running || !!startBlockReason(state.status);
  start.title = startBlockReason(state.status) || '';
  stop.disabled = state.busy.bridge || !state.status?.running;
  const more = actionMenu({ floating: true, ariaLabel: 'Bridge actions', buttonClass: 'btn ghost', items: [
    start, stop,
    { label: 'Restart bridge', icon: 'refresh-cw', onSelect: restartBridge },
    { label: 'Request history', icon: 'scroll-text', onSelect: openRequestHistory },
    { label: 'Run diagnostics', icon: 'stethoscope', onSelect: () => diagnose() },
    { label: 'Roblox window', icon: 'scan', onSelect: openRobloxPanel },
    { label: 'View logs', icon: 'scroll-text', onSelect: () => navigate('logs') },
  ] });
  main.append(h('div', { class: 'page-head' }, h('div', { class: 'titles' },
    h('h1', { text: 'Overview' }), h('p', { text: 'Your bridge at a glance.' }))),
    h('div', { class: 'stack overview-stack' },
      h('section', { class: 'panel overview-overall', id: 'overview-overall', 'aria-label': 'Overall status' },
        h('div', {}, h('h2', { text: 'Checking bridge status' }), h('p', { class: 'hint' })),
        h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', type: 'button', 'data-next-action': '', text: 'Check connection' }), more)),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' },
        h('h2', { class: 'overview-section-title', text: 'Today (UTC)' }),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost sm', onclick: () => navigate('usage') }, 'View usage')),
        h('div', { class: 'panel-body', id: 'overview-usage', 'aria-live': 'polite' }))));
  queueMicrotask(() => {
    if (state.view !== 'app' || state.tab !== 'overview' || !main.isConnected) return;
    updateOverviewStatus(); updateBridgeButtons(); updateOverviewUsage(); fetchOverviewUsage();
  });
}

export { bridgeRejoin, captureRobloxScreenshot, inspectRobloxSnapshot, newOverviewState, newRobloxState, overviewNavigate, renderOverviewTab, updateOverviewStatus, updateRobloxButtons };

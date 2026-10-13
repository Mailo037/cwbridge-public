/* CWBridge console: ui. Local ES module; no runtime dependencies. */


/* ------------------------------------------------------------------ *
 *  Icons — preloaded local Lucide SVGs (stroke: currentColor)          *
 * ------------------------------------------------------------------ */
const ICON_PRELOAD = {
  'ellipsis': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'check': '<path d="m20 6-11 11-5-5"/>',
  'scan': '<path d="M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3"/>',
  'layout-dashboard': '<path d="M3 3h7v9H3z"/><path d="M14 3h7v5h-7z"/><path d="M14 12h7v9h-7z"/><path d="M3 16h7v5H3z"/>',
  'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'play': '<path d="m6 3 14 9-14 9z"/>',
  'square': '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  'terminal': '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  'server': '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-5.66"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'hard-drive': '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  'bot': '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'unplug': '<path d="m19 5 3 3"/><path d="m2 22 3-3"/><path d="M3 3l18 18"/><path d="m9 8 4-4 4 4"/><path d="m6 11 8 8"/><path d="m16 11 2 2"/><path d="m11 16 2 2"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  'chart-column': '<path d="M3 3v18h18"/><path d="M8 16v-5"/><path d="M13 16V7"/><path d="M18 16V4"/>',
  'list': '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  'table': '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
  'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  'minimize': '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'stethoscope': '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'compass': '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'languages': '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  'cloud-sun': '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  'webhook': '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
};

function icon(name) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('lucide');
  el.dataset.icon = name;
  if (name === 'loader-circle') el.classList.add('spin');
  const d = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  d.innerHTML = ICON_PRELOAD[name] || '';
  if (name === 'settings-2') {
    d.children[0].setAttribute('d', 'M4 7h0 M10 7h10');
    d.children[1].setAttribute('d', 'M4 17h10 M20 17h0');
  }
  if (name === 'table') {
    const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cell.setAttribute('x', '4'); cell.setAttribute('y', '4');
    cell.setAttribute('width', '7'); cell.setAttribute('height', '4');
    cell.setAttribute('class', 'nav-cell'); cell.setAttribute('fill', 'currentColor');
    cell.setAttribute('stroke', 'none'); cell.setAttribute('opacity', '0');
    d.appendChild(cell);
  }
  el.appendChild(d);
  return el;
}

/* A loading ring drawn as a full circle whose stroke is dashed: the element
 * never moves, only the dashes travel, so it reads as a steady rotation
 * instead of an arc swinging from side to side. */
function spinner() {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.classList.add('lucide', 'spinner');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  ring.setAttribute('class', 'spin-arc');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', '12');
  track.setAttribute('cy', '12');
  track.setAttribute('r', '9');
  track.setAttribute('opacity', '.25');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', '12');
  arc.setAttribute('cy', '12');
  arc.setAttribute('r', '9');
  /* Circumference of r=9 is 56.55: one segment of 15 travels through the rest. */
  arc.setAttribute('stroke-dasharray', '15 41.55');
  ring.append(arc);
  el.append(track, ring);
  return el;
}

/* ------------------------------------------------------------------ *
 *  DOM helpers — textContent only, no unsanitized HTML                 *
 * ------------------------------------------------------------------ */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'disabled') el.disabled = true;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else if (v && typeof v === 'object') Object.assign(el.style, v);
      }
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

function toast(message, kind = 'ok') {
  const box = h('div', { class: 'toast ' + kind, role: 'status' });
  box.append(icon(kind === 'ok' ? 'circle-check' : kind === 'err' ? 'circle-x' : 'info'));
  box.append(h('div', { class: 'grow', text: message }));
  const close = h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss notification' });
  close.append(icon('x'));
  close.addEventListener('click', () => dismiss());
  box.append(close);
  document.querySelector('.toast-stack').append(box);
  const dismiss = () => {
    box.classList.add('leaving');
    setTimeout(() => box.remove(), 160);
  };
  setTimeout(dismiss, kind === 'err' ? 6500 : 3200);
}

/* ------------------------------------------------------------------ *
 *  Keyboard-accessible dialogs                                         *
 * ------------------------------------------------------------------ */
function openDialog({ title, iconName = 'info', tone = 'default', buildBody, actions, onClose }) {
  const backdrop = h('div', { class: 'dialog-backdrop' });
  const dialog = h('div', { class: 'dialog tone-' + tone, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const head = h('div', { class: 'dialog-head' });
  // The icon sits in a tinted badge whose colour carries the dialog's tone,
  // so a destructive question reads as one before its text is read.
  head.append(h('span', { class: 'dialog-icon', 'aria-hidden': 'true' }, icon(iconName)));
  head.append(h('h2', { text: title }));
  const closeBtn = h('button', { class: 'btn ghost sm icon-only', 'aria-label': 'Close dialog' });
  closeBtn.append(icon('x'));
  head.append(h('div', { class: 'grow' }), closeBtn);

  const body = h('div', { class: 'dialog-body' });
  if (buildBody) buildBody(body, dialog);

  const foot = h('div', { class: 'dialog-actions' });
  const btns = [];
  for (const a of actions || [{ label: 'Close' }]) {
    const b = h('button', { class: 'btn' + (a.kind ? ' ' + a.kind : '') }, ...(a.icon ? [icon(a.icon)] : []), a.label);
    b.addEventListener('click', () => a.onClick ? a.onClick(close) : close());
    btns.push(b);
    foot.append(b);
  }

  dialog.append(head, body, foot);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const prevFocus = document.activeElement;
  function focusables() {
    return [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  function close() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  }
  function onKey(e) {
    const popup = [...document.querySelectorAll('.k-floating-select:not(.hidden):not(.is-closing), .k-floating-actions:not(.hidden):not(.is-closing)')].find(menu => dialog.contains(menu._owner));
    if (popup && (e.key === 'Escape' || e.key === 'Tab')) {
      e.preventDefault(); e.stopImmediatePropagation(); popup._close(); return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
  closeBtn.addEventListener('click', close);
  (btns[0] || closeBtn).focus();
  return { close, dialog, body };
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', destructive = false, requireText = null }) {
  return new Promise(resolve => {
    let input = null;
    const dlg = openDialog({
      title, iconName: destructive ? 'circle-alert' : 'info', tone: destructive ? 'danger' : 'default',
      onClose() { resolve(false); },
      buildBody(body) {
        if (message) body.append(h('p', { class: 'dialog-message', text: message }));
        if (requireText !== null) {
          const confirmField = h('div', { class: 'dialog-confirm-field' });
          confirmField.append(h('label', { for: 'dialog-confirm-input' }, 'Type ', h('span', { class: 'mono dialog-phrase', text: requireText }), ' to confirm'));
          input = h('input', { class: 'input', id: 'dialog-confirm-input', autocomplete: 'off', spellcheck: 'false', placeholder: requireText });
          input.setAttribute('aria-label', 'Confirmation input');
          confirmField.append(input);
          body.append(confirmField);
          input.addEventListener('input', () => {
            const matches = input.value === requireText;
            okBtn.disabled = !matches;
            confirmField.classList.toggle('is-match', matches);
          });
        }
      },
      actions: [
        { label: 'Cancel' },
        {
          label: confirmLabel, kind: destructive ? 'danger' : 'primary', icon: destructive ? 'trash-2' : 'circle-check',
          onClick(close) { resolve(true); close(); },
        },
      ],
    });
    const okBtn = dlg.dialog.querySelectorAll('.dialog-actions .btn')[1];
    if (requireText !== null && okBtn) okBtn.disabled = true;
    if (input) input.focus();
    dlg.dialog.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input && document.activeElement === input && okBtn && !okBtn.disabled) okBtn.click();
    });
  });
}

/* ------------------------------------------------------------------ *
 *  Custom select — Bloub k-select: trigger + floating check-mark menu  *
 * ------------------------------------------------------------------ */
/* How long the menu takes to withdraw; the animation of the same length lives
 * in the stylesheet (k-menu-out), and the menu is only hidden after it. */
const MENU_EXIT_MS = 130;

function customSelect({ value, options, ariaLabel, onChange, floating = false, multiple = false }) {
  const root = h('div', { class: 'k-select' });
  let current = value;
  let open = false;
  let disabled = false;
  let closeTimer = 0;

  const selected = v => multiple ? current.includes(v) : current === v;
  const labelFor = v => { if (multiple) return v.length + ' selected'; const o = options.find(o => o.value === v); return o ? o.label : (v == null ? '' : String(v)); };
  const valueEl = h('span', { class: 'k-select-value' });
  /* The chosen value is text that arrives, both ways round: in place when the
   * page keeps the trigger, and as an entrance when the change repaints the
   * section the trigger stands in. */
  setPopText(valueEl, labelFor(current));
  const caret = h('span', { class: 'k-select-caret', 'aria-hidden': 'true' });
  caret.append(icon('chevron-down'));
  const trigger = h('button', { type: 'button', class: 'k-select-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, valueEl, caret);
  if (ariaLabel) trigger.setAttribute('aria-label', ariaLabel);

  const menu = h('div', { class: 'k-select-menu hidden', role: 'listbox' });
  if (multiple) menu.setAttribute('aria-multiselectable', 'true');
  /* The rows live in their own box: the menu clips, the box scrolls, so the
   * scrollbar is inset by the menu's padding and never crosses its corners. */
  const scroller = h('div', { class: 'k-select-scroll scroll-slim' });
  menu.append(scroller);
  let optionButtons = [];

  function renderOptions() {
    scroller.textContent = '';
    optionButtons = options.map(o => {
      const copy = h('span', { class: 'k-option-copy' }, h('span', { text: o.label }), o.note ? h('span', { class: 'hint', text: o.note }) : null);
      const check = h('span', { class: 'k-option-check', 'aria-hidden': 'true' }, '✓');
      const b = h('button', { type: 'button', class: 'k-option' + (selected(o.value) ? ' selected' : ''), role: 'option', 'aria-selected': String(selected(o.value)) }, copy, check);
      b.addEventListener('click', () => commit(o.value));
      return b;
    });
    scroller.append(...optionButtons);
  }

  function onDocDown(e) { if (!root.contains(e.target) && !menu.contains(e.target)) setOpen(false); }
  function onDocKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.focus(); }
  }

  let observer;
  function positionMenu() {
    if (!floating || !open) return;
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 14, above = rect.top - 14;
    const room = Math.max(80, Math.min(280, Math.max(below, above)));
    menu.style.setProperty('--k-select-max-h', room + 'px');
    Object.assign(menu.style, { position: 'fixed', zIndex: '200', width: Math.min(Math.max(rect.width, multiple ? 280 : 200), innerWidth - 24) + 'px', right: 'auto', bottom: 'auto' });
    Object.assign(menu.style, { left: Math.max(12, Math.min(rect.left, innerWidth - menu.offsetWidth - 12)) + 'px',
      top: (below >= menu.offsetHeight || below >= above ? rect.bottom + 4 : Math.max(12, rect.top - menu.offsetHeight - 4)) + 'px' });
  }
  function setOpen(next, { focusMenu = false } = {}) {
    if (disabled && next) return;
    open = next;
    root.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    clearTimeout(closeTimer);
    if (open) {
      /* The menu drops in from the control it belongs to — the elevator — and
       * the drop has to start from the top every time it is opened. */
      if (floating) {
        document.body.append(menu);
        menu.classList.add('k-floating-select');
        menu._owner = root;
        menu._close = () => { setOpen(false); trigger.focus(); };
        observer = new MutationObserver(() => { if (!root.isConnected) { setOpen(false); menu.remove(); } });
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', positionMenu);
        document.addEventListener('scroll', positionMenu, true);
      }
      menu.classList.remove('hidden', 'is-closing', 'is-opening');
      renderOptions();
      positionMenu();
      void menu.offsetWidth;
      menu.classList.add('is-opening');
      if (focusMenu) (optionButtons.find(b => b.getAttribute('aria-selected') === 'true') || optionButtons[0])?.focus();
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
    } else {
      menu.classList.remove('is-opening');
      menu.classList.add('is-closing');
      /* Withdrawing takes as long as MENU_EXIT_MS in the stylesheet; until then
       * the menu must not swallow a click meant for what is below it. */
      closeTimer = setTimeout(() => {
        menu.classList.add('hidden');
        menu.classList.remove('is-closing');
        if (floating && root.isConnected) root.append(menu);
      }, MENU_EXIT_MS);
      observer?.disconnect();
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('scroll', positionMenu, true);
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    }
  }

  function moveFocus(delta, end) {
    if (!optionButtons.length) return;
    const idx = optionButtons.indexOf(document.activeElement);
    const next = end === true ? optionButtons.length - 1 : end === false ? 0
      : idx < 0 ? 0 : (idx + delta + optionButtons.length) % optionButtons.length;
    optionButtons[next].focus();
  }

  function commit(v) {
    if (multiple) {
      current = selected(v) ? current.filter(item => item !== v) : [...current, v];
      setPopText(valueEl, labelFor(current));
      optionButtons.forEach((row, index) => { row.classList.toggle('selected', selected(options[index].value)); row.setAttribute('aria-selected', String(selected(options[index].value))); });
      if (onChange) onChange([...current]);
      return;
    }
    current = v;
    setPopText(valueEl, labelFor(v));
    setOpen(false);
    trigger.focus();
    if (onChange) onChange(v);
  }

  trigger.addEventListener('click', () => setOpen(!open));
  trigger.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true, { focusMenu: true });
    }
  });
  menu.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Home') { e.preventDefault(); moveFocus(0, false); }
    else if (e.key === 'End') { e.preventDefault(); moveFocus(0, true); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  });

  root.append(trigger, menu);
  root.setDisabled = v => {
    disabled = v;
    root.classList.toggle('disabled', v);
    trigger.disabled = v;
    trigger.setAttribute('aria-disabled', String(v));
    if (v) setOpen(false);
  };
  root.setValue = v => { current = v; setPopText(valueEl, labelFor(v)); };
  return root;
}

/* ------------------------------------------------------------------ *
 *  Menu of actions behind an arrow                                    *
 * ------------------------------------------------------------------ */
/* What a control can also do, one step behind it: the arrow opens the menu the
 * custom select uses — the same surface, the same rows, the same elevator — with
 * entries that do something instead of entries that are chosen. Only the
 * anchoring differs (the stylesheet turns it upward), because the bars these
 * arrows live in sit at the bottom of a page.
 *
 * A row is either a ready-made button — the submit that saves and applies, which
 * has to stay a submit button of its own form — or a description of one
 * ({ label, icon, onSelect }). Picking a row closes the menu; a row that opens a
 * dialog of its own is not held up by that.
 *
 * The trigger carries the arrow and nothing else: it is placed against the
 * button it belongs to, which keeps its own label. */
function actionMenu({ items = [], ariaLabel = 'More actions', id = null, buttonClass = 'btn', floating = false, triggerIcon = 'chevron-down' }) {
  const root = h('div', { class: 'k-actions' });
  const trigger = h('button', { class: buttonClass + ' k-actions-trigger', type: 'button', id, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  trigger.setAttribute('aria-label', ariaLabel);
  trigger.append(icon(triggerIcon));
  const menu = h('div', { class: 'k-select-menu k-actions-menu hidden', role: 'menu', 'aria-label': ariaLabel });
  /* The rows live in the select's own scroller, exactly as they do in a select:
   * that is the box the highlight travels in, so a menu of actions is lit the
   * way a menu of choices is — one pill moving from row to row. */
  const scroller = h('div', { class: 'k-select-scroll' });
  const rows = items.map(item => {
    if (item && item.nodeType === Node.ELEMENT_NODE) return item;
    const row = h('button', { type: 'button' }, item.icon ? icon(item.icon) : null, h('span', { text: item.label }));
    if (item.onSelect) row.addEventListener('click', () => item.onSelect());
    return row;
  });
  for (const row of rows) {
    // Reused toolbar buttons become menu rows; their button sizing and hover
    // styles must not compete with the menu's shared row and moving highlight.
    row.classList.remove('btn', 'ghost', 'sm', 'primary', 'icon-only');
    row.classList.add('k-option');
    row.setAttribute('role', 'menuitem');
    row.addEventListener('click', () => setOpen(false));
  }
  menu.append(scroller);
  scroller.append(...rows);
  root.append(trigger, menu);

  let open = false;
  let closeTimer = 0;
  const usable = () => rows.filter(row => !row.disabled);

  function onDocDown(e) { if (!root.contains(e.target) && !menu.contains(e.target)) setOpen(false); }
  function onDocKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.focus(); }
  }

  let observer;
  function positionMenu() {
    if (!floating || !open) return;
    const rect = trigger.getBoundingClientRect();
    const height = menu.offsetHeight;
    Object.assign(menu.style, { position: 'fixed', zIndex: '200', right: 'auto', bottom: 'auto',
      left: Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px',
      top: (rect.bottom + height + 8 <= innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)) + 'px' });
  }
  function setOpen(next, { focusMenu = false } = {}) {
    open = next;
    trigger.setAttribute('aria-expanded', String(open));
    clearTimeout(closeTimer);
    if (open) {
      /* The menu rises out of the arrow it belongs to, and that has to start
       * from the top every time it is opened. */
      if (floating) {
        document.body.append(menu);
        menu.classList.add('k-floating-actions');
        menu._owner = root;
        menu._close = () => { setOpen(false); trigger.focus(); };
        observer = new MutationObserver(() => { if (!root.isConnected) { setOpen(false); menu.remove(); } });
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', positionMenu);
        document.addEventListener('scroll', positionMenu, true);
      }
      menu.classList.remove('hidden', 'is-closing', 'is-opening');
      positionMenu();
      void menu.offsetWidth;
      menu.classList.add('is-opening');
      if (focusMenu) usable()[0]?.focus();
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
    } else {
      menu.classList.remove('is-opening');
      menu.classList.add('is-closing');
      /* Withdrawing takes as long as MENU_EXIT_MS in the stylesheet; until then
       * the menu must not swallow a click meant for what is below it. */
      closeTimer = setTimeout(() => {
        menu.classList.add('hidden');
        menu.classList.remove('is-closing');
        if (floating && root.isConnected) root.append(menu);
      }, MENU_EXIT_MS);
      observer?.disconnect();
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('scroll', positionMenu, true);
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    }
  }

  function moveFocus(delta, end) {
    const list = usable();
    if (!list.length) return;
    const idx = list.indexOf(document.activeElement);
    const next = end === true ? list.length - 1 : end === false ? 0
      : idx < 0 ? 0 : (idx + delta + list.length) % list.length;
    list[next].focus();
  }

  trigger.addEventListener('click', () => setOpen(!open));
  trigger.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true, { focusMenu: true });
    }
  });
  menu.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Home') { e.preventDefault(); moveFocus(0, false); }
    else if (e.key === 'End') { e.preventDefault(); moveFocus(0, true); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  });
  /* Closing what the caller opened with: the shell repaints whole pages, and a
   * menu that survived its trigger would hang in the air. */
  root.closeMenu = () => { if (open) setOpen(false); };
  return root;
}

/* ------------------------------------------------------------------ *
 *  Animated checkbox (Transitions.dev)                                 *
 * ------------------------------------------------------------------ */
/* The console's checkboxes are buttons, not inputs: the box fills and the check
 * draws itself in along its path, so a tick never simply appears.
 *
 * The button stands in for <input type="checkbox"> wherever it is used. It
 * carries the same `.checked` property, and a toggle by hand fires `change`
 * while a programmatic write stays silent — exactly like the native control.
 * A label that names it keeps working too: a button is a labelable element, so
 * clicking the row forwards the click to it. */
const CHECK_PATH = 'M1 5.52L3.92 9.17L9.17 1';
/* Length of that path (getTotalLength() = 14.4, rounded up) — the distance the
 * dash offset travels, so the stroke is complete exactly at the end and never
 * over- or under-draws. */
const CHECK_PATH_LEN = 15;

function checkBox({ id, checked = false, role = 'checkbox', ariaLabel, disabled = false } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10.1668 10.1668');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHECK_PATH);
  svg.append(path);
  const button = h('button', {
    class: 't-check', type: 'button', id, role, 'aria-checked': checked ? 'true' : 'false',
  }, svg);
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.disabled = !!disabled;
  Object.defineProperty(button, 'checked', {
    get: () => button.getAttribute('aria-checked') === 'true',
    set: value => button.setAttribute('aria-checked', value ? 'true' : 'false'),
  });
  button.addEventListener('click', () => {
    button.checked = !button.checked;
    button.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return button;
}

/* ------------------------------------------------------------------ *
 *  Digits that pop in (Transitions.dev)                                *
 * ------------------------------------------------------------------ */
/* A figure that is the point of a card should arrive as a figure, not as a
 * replaced string: every character drops in on its own, a moment after the one
 * before it. Used for the stat numbers (usage totals, today's requests, the
 * datastore metrics) — never in a table, where a screenful of moving digits
 * would be noise.
 *
 * The whole text is split, separators included, so the digits that are already
 * there do not shift when the number grows by one place.
 *
 * `--digit-stagger` is capped: at the given 70 ms a six-digit total would take
 * half a second before its last digit is even there. Short figures keep the
 * full step, long ones are spread over the same 140 ms. */
const DIGIT_STAGGER_SPAN = 140;   // ms between the first and the last character, at most

/* The effect is character-wise, so it takes a word just as well as a number
 * (Running / Stopped) — the class names keep the vendor's word for it. */
function popInText(value) {
  const text = String(value);
  const group = h('span', { class: 't-digit-group is-animating' + (/\p{L}/u.test(text) ? ' is-word' : '') });
  group.style.setProperty('--digit-stagger', Math.min(70, Math.round(DIGIT_STAGGER_SPAN / Math.max(1, text.length - 1))) + 'ms');
  [...text].forEach((character, index) => {
    // The position rides on --i, so the wave runs left to right however long
    // the text is (a fixed list of nth delays left the tail of a long word
    // landing first, ahead of the letters before it).
    const digit = h('span', { class: 't-digit', 'data-stagger': String(index) }, character);
    digit.style.setProperty('--i', String(index));
    group.append(digit);
  });
  /* Once every character has landed, the spans are folded back into one text
   * node: selected, copied or wrapped, the label is plain text again instead
   * of a row of boxes. The text is unchanged, so the label swap sees no change
   * and does not replay. The timer covers characters that never animate
   * (reduced motion, a hidden tab). */
  let landed = 0;
  const settle = () => {
    if (!group.classList.contains('is-animating')) return;
    group.classList.remove('is-animating');
    group.classList.add('is-settled');
    group.replaceChildren(document.createTextNode(text));
  };
  group.addEventListener('animationend', e => {
    if (e.target.classList?.contains('t-digit') && ++landed >= text.length) settle();
  });
  setTimeout(settle, 2000);
  return group;
}

/* Text that arrives rather than appears. A short label — a state word, a
 * figure, "9 of 9 enabled" — pops in character by character; a sentence would
 * be a wave of forty letters, so it lifts in as one block instead.
 *
 * The value is remembered per element, and the same one again is not written at
 * all: these labels are polled, and a poll that finds the state it already
 * shows must not replay the animation. */
const POP_TEXT_MAX = 24;   // longer than this arrives as a block
const popTextState = new WeakMap();

function setPopText(element, value) {
  const text = String(value);
  if (popTextState.get(element) === text) return;
  popTextState.set(element, text);
  if (!text) { element.textContent = ''; return; }
  if (text.length <= POP_TEXT_MAX) { element.replaceChildren(popInText(text)); return; }
  element.textContent = text;
  element.classList.remove('is-arriving');
  void element.offsetWidth;   // a replayed animation has to start over
  element.classList.add('is-arriving');
}

/* ------------------------------------------------------------------ *
 *  Text that streams in (Transitions.dev)                             *
 * ------------------------------------------------------------------ */
/* The tail of the log viewer: what the last poll brought is not dropped in as
 * a block but resolves word by word, each word fading up out of a small blur —
 * lines that are still being written read as being written.
 *
 * The markup belongs here so a caller only hands over text: every word becomes
 * its own .t-stream-w span and the spaces between them stay plain text nodes.
 * The viewer's own text — what it is copied for, counted in, and compared
 * against the next poll — is therefore unchanged, character for character.
 *
 * The wave is driven from here instead of from one animation-delay per word:
 * a run is spread over at most STREAM_SPAN_MS whatever its length, so fifty new
 * lines do not take a minute to arrive (the same reasoning as the capped digit
 * stagger). Once the last word is in, the spans are folded back into plain
 * text — a viewer left open for hours must not collect thousands of them. */
const STREAM_GAP_MS = 60;     // step between two words — the --stream-gap of the stylesheet
const STREAM_SPAN_MS = 600;   // ... capped: first to last word of one run, at most
const STREAM_SETTLE_MS = 500; // the fade of the last word, before the spans go

function streamText(parent, value) {
  const text = String(value);
  if (!text) return;
  /* With motion reduced the stylesheet shows the words at once; writing them
   * plainly saves the wave and the spans it would leave behind. */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { parent.append(document.createTextNode(text)); return; }
  const group = h('span', { class: 't-stream' });
  const words = [];
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    if (!token.trim()) { group.append(document.createTextNode(token)); continue; }
    const word = h('span', { class: 't-stream-w', text: token });
    words.push(word);
    group.append(word);
  }
  parent.append(group);
  if (!words.length) return;
  const span = Math.min(STREAM_SPAN_MS, words.length * STREAM_GAP_MS);
  const started = performance.now();
  let shown = 0;
  const run = now => {
    if (!group.isConnected) return;   // the viewer was re-rendered under the wave
    const elapsed = now - started;
    const due = elapsed >= span ? words.length : Math.floor(words.length * elapsed / span) + 1;
    while (shown < due) words[shown++].classList.add('is-in');
    if (shown < words.length) { requestAnimationFrame(run); return; }
    setTimeout(() => { if (group.isConnected) group.replaceWith(document.createTextNode(text)); }, STREAM_SETTLE_MS);
  };
  void group.offsetWidth;   // the wave has to start from the unrevealed state
  requestAnimationFrame(run);
}

/* ------------------------------------------------------------------ *
 *  Rows that arrive (Transitions.dev)                                 *
 * ------------------------------------------------------------------ */
/* The same wave the figures make (see the digit group above), with the row of a
 * table as its unit instead of the character: a list is read row by row, so it
 * arrives row by row rather than appearing whole — each row fades up out of a
 * small blur a moment after the one above it.
 *
 * The markup is not touched this time, only the delay each row is given: the
 * stylesheet fades a `.t-rows` row in, and the step between two rows is capped
 * here exactly as the digit stagger is, so a table of fifty rows is complete in
 * the time a table of six is. What the eye should read is the list arriving,
 * not a queue being worked through. */
const ROW_GAP_MS = 40;     // step between two rows
const ROW_SPAN_MS = 360;   // ... never more than this from the first row to the last
const ROW_DUR_MS = 430;    // one row's own fade — the --row-dur of the stylesheet

/* Marks every table below `root` as arriving. Called once per render, from the
 * shell, because that is the one place where every page's markup is on screen
 * and finished — a table written later arrives the same way without anyone
 * remembering to ask for it.
 *
 * The wave is a moment in the table's life, not a state it stays in: when the
 * last row has arrived, the marker goes and the rows are plain rows again. A
 * hundred-row page must not keep a hundred filters alive for as long as it is
 * open. */
function popInRows(root) {
  for (const body of root.querySelectorAll('.table-wrap tbody')) {
    const rows = [...body.rows];
    if (!rows.length) continue;
    const step = Math.min(ROW_GAP_MS, Math.round(ROW_SPAN_MS / rows.length));
    rows.forEach((row, index) => row.style.setProperty('--row-delay', index * step + 'ms'));
    body.classList.add('t-rows');
    setTimeout(() => {
      if (!body.isConnected) return;   // the table was replaced under the wave
      body.classList.remove('t-rows');
      rows.forEach(row => row.style.removeProperty('--row-delay'));
    }, (rows.length - 1) * step + ROW_DUR_MS + 60);
  }
}

/* ------------------------------------------------------------------ *
 *  Button labels that arrive                                           *
 * ------------------------------------------------------------------ */
/* Buttons swap their own text while the operator is looking at them: Start
 * becomes Starting …, Save changes becomes Saving …, Fetch models becomes
 * Fetching…. The swap is read from the document rather than wired into every
 * call site, so a button written later behaves the same way without anyone
 * remembering to ask for it.
 *
 * Two things keep it honest:
 *
 * * Only real text changes count. Writing the same label again — which a status
 *   poll does every few seconds — leaves the label alone, so nothing replays.
 * * A text node cannot be animated, so the label moves into its own span the
 *   first time it changes. That move is itself a mutation, and it is ignored
 *   for exactly the same reason: it does not change the text. */
function labelOwner(record) {
  const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
  if (!node || !node.closest) return null;
  const marked = node.closest('.btn-label');
  if (marked) return marked;
  const button = node.closest('button');
  if (!button) return null;
  /* A label that already has its own element (an icon next to a span) only
   * needs the marker, not a new wrapper. */
  const inner = node === button ? null : node.closest('span');
  return inner && button.contains(inner) ? inner : button;
}

function labelChanged(record) {
  if (record.type === 'characterData') return record.oldValue !== record.target.data;
  const before = [...record.removedNodes].map(node => node.textContent || '').join('');
  const after = [...record.addedNodes].map(node => node.textContent || '').join('');
  return before !== after;
}

/* Lifts the label of a button into a span of its own, leaving its icon where
 * it is. Returns null when there is nothing to lift (no text of its own). */
function labelSpan(button) {
  let span = button.querySelector('.btn-label');
  if (span) return span;
  const texts = [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.data.trim());
  if (texts.length !== 1) return null;
  span = h('span', { class: 'btn-label' });
  texts[0].replaceWith(span);
  span.append(texts[0]);
  return span;
}

function installLabelSwap() {
  if (installLabelSwap.done) return;
  installLabelSwap.done = true;
  const observer = new MutationObserver(records => {
    const seen = new Set();
    for (const record of records) {
      if (!labelChanged(record)) continue;
      /* Content that brings its own animation — a figure popping in — is not
       * animated a second time as a block. */
      const own = [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('t-digit-group'));
      if (own) continue;
      const owner = labelOwner(record);
      if (!owner) continue;
      const label = owner.tagName === 'BUTTON' ? labelSpan(owner) : owner;
      if (!label || seen.has(label)) continue;
      seen.add(label);
      label.classList.add('btn-label');
      label.classList.remove('is-arriving');
      void label.offsetWidth;   // a replayed class has to start over, not continue
      label.classList.add('is-arriving');
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
}

/* ------------------------------------------------------------------ *
 *  Sidebar collapse state (persisted per browser profile)              *
 * ------------------------------------------------------------------ */
const SIDEBAR_COLLAPSED_KEY = 'cwbridge.sidebar.collapsed';

function sidebarCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch (_) { return false; }
}

function setSidebarCollapsed(collapsed) {
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (_) { /* storage unavailable */ }
}

function sidebarTooltip(control, label) {
  control.setAttribute('data-tooltip', label);
  control.setAttribute('aria-label', label);
  return control;
}

/* Narrow screens turn the sidebar into an overlay drawer. Its open state is
 * remembered per browser profile, exactly like the desktop rail width, but in
 * its own key: collapsing the rail must never decide the mobile drawer (and
 * the other way round). Closed is the default, so the page keeps its full
 * width until navigation is asked for. */
const DRAWER_OPEN_KEY = 'cwbridge.drawer.open';

function drawerOpen() {
  try { return localStorage.getItem(DRAWER_OPEN_KEY) === '1'; } catch (_) { return false; }
}

function setDrawerOpen(open) {
  try { localStorage.setItem(DRAWER_OPEN_KEY, open ? '1' : '0'); } catch (_) { /* storage unavailable */ }
}

/* The one breakpoint that decides between inline rail and overlay drawer. */
function mobileMedia() {
  return window.matchMedia('(max-width: 720px)');
}

/* ------------------------------------------------------------------ *
 *  Section navigation — the sidebar's second level                     *
 * ------------------------------------------------------------------ */
/* A section context (Settings, one domain, a new domain) replaces the tab
 * list with its own items, so a page never has to squeeze every panel into a
 * single scrolling frame. Every module hands in the same shape; the shell
 * only has to render it.
 *
 * `control` is the optional live marker of the section context: it reports
 * which item is active, carries the unsaved-changes flags, and lets a page
 * repaint the nav in place when those flags change (a full shell render would
 * throw focus out of the navigation). */
function sectionNav({ back, onBack, eyebrow, items, control, onSelect, onKeydown }) {
  const nav = h('div', { class: 'section-nav' });
  if (back) {
    const backBtn = h('button', { class: 'section-back', type: 'button' }, icon('arrow-left'),
      h('span', { class: 'sidebar-label', text: back }));
    sidebarTooltip(backBtn, back);
    backBtn.addEventListener('click', () => { if (onBack) onBack(); });
    nav.append(backBtn);
  }
  if (eyebrow) nav.append(h('p', { class: 'section-eyebrow sidebar-label', text: eyebrow }));
  const list = h('div', { class: 'section-list' });
  nav.append(list);
  const entries = () => items.filter(item => !item.divider);

  /* Repaints the items in place. A context may mark one section dirty: the
   * dot is the only signal that an edit made on another sub-page is still
   * unsaved, so it has to survive a repaint without stealing focus. */
  function paint() {
    const active = control ? control.current() : null;
    list.replaceChildren();
    for (const item of items) {
      if (item.divider) { list.append(h('span', { class: 'section-divider', 'aria-hidden': 'true' })); continue; }
      const selected = item.id === active;
      const flags = control ? control.flags() : null;
      const note = flags && flags[item.id];
      const button = h('button', {
        class: 'section-item', type: 'button', 'data-section': item.id,
        'aria-current': selected ? 'true' : null,
        tabindex: selected ? '0' : '-1',
      }, icon(item.icon || 'square'),
        h('span', { class: 'sidebar-label', text: item.label }),
        note ? h('span', { class: 'section-item-note', title: note, text: '●' }) : null);
      sidebarTooltip(button, item.label);
      button.addEventListener('click', () => { if (onSelect) onSelect(item.id); });
      button.addEventListener('keydown', event => { if (onKeydown) onKeydown(event, item); });
      list.append(button);
    }
  }
  function mark(active) {
    for (const node of list.querySelectorAll('.section-item')) {
      const selected = node.getAttribute('data-section') === active;
      node.setAttribute('aria-current', selected ? 'true' : null);
      node.tabIndex = selected ? 0 : -1;
    }
  }
  paint();
  return {
    nav,
    paint,
    mark,
    first: () => entries()[0]?.id,
    last: () => entries()[entries().length - 1]?.id,
  };
}

/* ---- Sticky hover for list surfaces ------------------------------------- *
 * The rows do not each fade their own hover background in and out: they hand
 * it to one pill that travels from row to row with the pointer, so running
 * down a list reads as a single moving surface instead of two crossfades.
 * Today that is both sidebar lists and the open menu of a custom select; every
 * further list only has to name its container and its rows below.
 *
 * For a menu the container is the box the rows scroll in, not the menu around
 * it: the pill is placed at the row's own offset, so it has to live in the same
 * box as the rows to travel with them — held outside it, it would stay put
 * while the list scrolled on under it.
 *
 * The pill is measured from the row's own box (a layout offset, not a viewport
 * rectangle), which keeps it on the row while the list scrolls under a resting
 * pointer, and a repaint of the list — which replaces the rows, and the pill
 * with them — is treated as a fresh appearance instead of a jump. */
const HOVER_LIST = '.tabs, .section-list, .k-select-scroll';
const HOVER_ROW = '.tab, .section-item, .k-option';

/* One pill per list. The map is weak so a re-rendered shell leaves nothing
 * behind. */
const hoverPills = new WeakMap();
const hoverState = { list: null, row: null, placed: false, x: 0, y: 0 };

function hoverPill(list) {
  let pill = hoverPills.get(list);
  if (!pill) {
    pill = h('span', { class: 'nav-hover-pill', 'aria-hidden': 'true' });
    hoverPills.set(list, pill);
  }
  /* A rebuilt list throws the pill away with its rows; the stored node is put
   * back so the next hover does not have to start from nothing. */
  if (pill.parentNode !== list) list.append(pill);
  return pill;
}

/* `carries` is the whole point: the pill only animates when the highlight it
 * already shows moves on to another row of the same list. A first appearance,
 * a list whose rows were rebuilt under it, or a jump into a different list is
 * placed directly, so the pill is never seen travelling from a row that is no
 * longer there. */
function moveHoverPill(list, row, carry) {
  const attached = hoverPills.get(list)?.parentNode === list;
  const pill = hoverPill(list);
  const carries = carry && attached && hoverState.placed && hoverState.list === list;
  if (!carries) pill.classList.add('no-anim');
  pill.style.transform = 'translate3d(' + row.offsetLeft + 'px,' + row.offsetTop + 'px,0)';
  pill.style.width = row.offsetWidth + 'px';
  pill.style.height = row.offsetHeight + 'px';
  if (!carries) {
    /* Flushed with the transitions off: the pill is pinned to the row before
     * anything can animate from its old place. */
    void pill.offsetWidth;
    pill.classList.remove('no-anim');
  }
  /* The rows hand their own hover surface over only while the pill is really
   * there to stand in for it — without script, hover stays exactly as it was.
   * The list that had the highlight gives it up whole: a pill left lit behind a
   * highlight that has moved on to another list is a second one that nothing
   * ever puts out again. */
  if (hoverState.list && hoverState.list !== list) {
    hoverState.list.classList.remove('is-hovering');
    hoverPills.get(hoverState.list)?.classList.remove('visible');
  }
  list.classList.add('is-hovering');
  pill.classList.add('visible');
  hoverState.list = list;
  hoverState.row = row;
  hoverState.placed = true;
}

function hideHoverPill() {
  hoverState.row = null;
  const list = hoverState.list;
  if (!list) return;
  /* The rows take their own hover surface back: with the pill hidden — the
   * pointer is over the list but not on a row — a hovered row has to look
   * hovered again. */
  list.classList.remove('is-hovering');
  hoverPills.get(list)?.classList.remove('visible');
}

/* The pointer has not moved, but its row has: asked after a scroll, after a
 * resize, and after a shell render that replaced the row it is sitting on. The
 * row is re-measured even when it is the same one, because the box the pill is
 * pinned to may have moved with the layout. */
function retargetHoverPill() {
  if (!hoverState.row) return;
  const node = document.elementFromPoint(hoverState.x, hoverState.y);
  const row = node && node.closest ? node.closest(HOVER_ROW) : null;
  const list = row ? row.closest(HOVER_LIST) : null;
  if (!row || !list) hideHoverPill();
  else moveHoverPill(list, row, true);
}

/* Called by the shell after every render: navigation replaces the rows, and
 * the highlight has to stay under the pointer that is still resting on one. */
function refreshHoverPill() {
  if (hoverState.row) retargetHoverPill();
}

function focusVisible(node) {
  try { return node.matches(':focus-visible'); } catch (_) { return true; }
}

function installHoverPill() {
  if (installHoverPill.done) return;
  installHoverPill.done = true;
  document.addEventListener('pointerover', event => {
    /* A touch pointer never runs down a list: it taps a row and is gone, so
     * the pill would only be a flash on the way to the page. */
    if (event.pointerType === 'touch') return;
    hoverState.x = event.clientX;
    hoverState.y = event.clientY;
    const row = event.target.closest ? event.target.closest(HOVER_ROW) : null;
    const list = row ? row.closest(HOVER_LIST) : null;
    if (!list) return;
    moveHoverPill(list, row, true);
  });
  document.addEventListener('pointerout', event => {
    const list = event.target.closest ? event.target.closest(HOVER_LIST) : null;
    if (!list || list.contains(event.relatedTarget)) return;
    hideHoverPill();
  });
  document.addEventListener('pointermove', event => {
    if (!hoverState.row) return;
    hoverState.x = event.clientX;
    hoverState.y = event.clientY;
  }, { passive: true });
  /* A scroll or a resize moves the rows under a pointer that is not moving
   * itself, so the row below it has to be looked up again. */
  document.addEventListener('scroll', () => { if (hoverState.row) retargetHoverPill(); }, true);
  window.addEventListener('resize', () => { if (hoverState.row) retargetHoverPill(); });
  document.addEventListener('focusin', event => {
    const row = event.target.closest ? event.target.closest(HOVER_ROW) : null;
    const list = row ? row.closest(HOVER_LIST) : null;
    if (!list || !focusVisible(row)) return;
    moveHoverPill(list, row, true);
  });
  document.addEventListener('focusout', event => {
    const list = event.target.closest ? event.target.closest(HOVER_LIST) : null;
    /* While the pointer is still inside the list it owns the highlight; an
     * arrow key that leaves the list must not take the pill along. */
    if (!list || list.contains(event.relatedTarget) || list.matches(':hover')) return;
    hideHoverPill();
  });
}

/* ---- Global custom tooltips --------------------------------------------- *
 * One floating layer replaces native title tooltips everywhere. Controls
 * opt in with data-tooltip; listeners are delegated once on <document>, so
 * rerendered buttons need no per-element wiring. Inside the sidebar a label
 * is only shown while the rail is collapsed (otherwise the text is visible).
 *
 * A label that is already on screen does not blink out and back in when the
 * pointer runs on to the next control of the same row: it travels there and
 * swaps its text on the way, exactly like the hover pill travels the sidebar.
 * Only controls that sit next to each other share a label that way — a hop
 * across the page is a new tooltip, not a flight. */
const TOOLTIP_DELAY = 350;   // the pointer has to rest this long before a label appears
const TOOLTIP_GRACE = 90;    // ... and a visible label survives leaving a control this long,
                             // which is what carries it across the gap between two rows
const TOOLTIP_MARGIN = 8;    // no label may come closer than this to a viewport edge

const tooltipLayer = { el: null, label: null, control: null, anchor: null, timer: 0, hideTimer: 0 };

/* Two controls sit together when they share their row of the layout: the rows
 * of one rail, the fields of one toolbar, the buttons of one footer. */
function tooltipNeighbour(a, b) {
  return !!a && !!b && a !== b && a.parentElement === b.parentElement;
}

function tooltipVisible() {
  return !!tooltipLayer.el && tooltipLayer.el.classList.contains('visible');
}

/* The text is its own layer inside the box, and it never travels: on the way
 * to the next control the label is put at the destination at once and then
 * released back to the box's origin over exactly the time and curve the box
 * itself needs. The two movements cancel out — the surface glides, the writing
 * stands still and simply waits for the box to arrive around it. A label that
 * is swapped on the way is faded in instead of cut over, so the box is never
 * seen carrying a word that has already been replaced. */
function holdTooltipLabel(dx, dy, fade) {
  const label = tooltipLayer.label;
  if (!label) return;
  label.classList.add('no-anim');
  label.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
  if (fade) label.style.opacity = '0';
  void label.offsetWidth;   // placed before it is released, or it would fly in
  label.classList.remove('no-anim');
  label.style.transform = 'translate3d(0,0,0)';
  if (fade) label.style.opacity = '';
}

/* Where a label goes for a given control box, label size and viewport.
 *
 * The label prefers the side it always had, but a control near the right edge
 * would push it out of the viewport — and a horizontally scrolling page would
 * then clip it away entirely. So it flips to the left when there is no room on
 * the right, and is otherwise held inside the viewport: a label that cannot be
 * read where it was asked for is worse than one that overlaps its control.
 *
 * Pure and exported: the placement is the part worth checking, and it must be
 * checkable without a browser that lays out and measures. */
function placeTooltip(control, label, viewport) {
  /* Never more than what the viewport holds, even when the label is wider than
   * the viewport itself: then the left margin is the only position that keeps
   * the start of the label readable. */
  const maxLeft = Math.max(TOOLTIP_MARGIN, viewport.width - label.width - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, viewport.height - label.height - TOOLTIP_MARGIN);
  const gap = 16;
  const wanted = control.right + gap;
  let side = 'right';
  let left = Math.min(wanted, maxLeft);
  if (left < wanted) {
    const flipped = control.left - gap - label.width;
    if (flipped >= TOOLTIP_MARGIN) { left = flipped; side = 'left'; }
  }
  const top = control.top + control.height / 2 - label.height / 2;
  /* The margin is applied last: a viewport narrower than the label itself must
   * still start the label at the left edge rather than push it off that edge. */
  return {
    x: Math.max(TOOLTIP_MARGIN, Math.min(Math.round(left), maxLeft)),
    y: Math.max(TOOLTIP_MARGIN, Math.min(Math.round(top), maxTop)),
    side,
  };
}

/* `travel` moves the box on to another control; without it the box is placed
 * and faded in where it stands. */
function showTooltip(control, travel) {
  const text = control.getAttribute('data-tooltip');
  if (!text) return;
  const sidebar = control.closest('.sidebar');
  if (sidebar && !sidebar.classList.contains('is-collapsed')) return;
  const el = tooltipLayer.el || (tooltipLayer.el = h('div', { class: 'dsh-tooltip', role: 'tooltip' }));
  if (!el.isConnected) document.body.append(el);
  const label = tooltipLayer.label || (tooltipLayer.label = h('span', { class: 'dsh-tooltip-label' }));
  if (label.parentNode !== el) el.append(label);
  label.textContent = text;

  const box = control.getBoundingClientRect();
  const tip = el.getBoundingClientRect();
  const spot = placeTooltip(box, tip, { width: window.innerWidth, height: window.innerHeight });
  const x = spot.x;
  const y = spot.y;

  /* Where the box is *right now*: a travel that is still running has to be
   * counted in, or the label would land next to the box instead of on it. */
  const from = travel ? el.getBoundingClientRect() : null;
  holdTooltipLabel(from ? x - from.left : 0, from ? y - from.top : 0, !!from);

  const point = 'translate3d(' + x + 'px,' + y + 'px,0)';
  el.dataset.side = spot.side;
  if (travel) el.style.transform = point;
  else {
    /* Placed, not moved: the fade is kept, the flight from wherever the last
     * box sat is not. */
    el.classList.add('no-anim');
    el.style.transform = point;
    void el.offsetWidth;
    el.classList.remove('no-anim');
  }
  el.classList.add('visible');
  tooltipLayer.anchor = control;
}

function hideTooltip() {
  clearTimeout(tooltipLayer.timer);
  clearTimeout(tooltipLayer.hideTimer);
  dropTooltip();
}

/* Takes the label off screen without touching the pending timers: a control
 * the pointer only passes on its way to the next one must not cancel the label
 * that is already waiting for that next one. */
function dropTooltip() {
  tooltipLayer.anchor = null;
  if (tooltipLayer.el) tooltipLayer.el.classList.remove('visible');
}

/* Leaving a control is not the same as leaving the label behind: the pointer is
 * usually on its way to the next control of the same row, and the show handler
 * decides there whether the label travels on with it. */
function leaveTooltip(next) {
  if (tooltipNeighbour(tooltipLayer.anchor, next)) return;
  if (!tooltipVisible()) return;
  clearTimeout(tooltipLayer.hideTimer);
  tooltipLayer.hideTimer = setTimeout(dropTooltip, TOOLTIP_GRACE);
}

function installTooltips() {
  if (installTooltips.done) return;
  installTooltips.done = true;
  document.addEventListener('pointerover', event => {
    const control = event.target.closest('[data-tooltip]');
    if (!control || tooltipLayer.control === control) return;
    tooltipLayer.control = control;
    clearTimeout(tooltipLayer.timer);
    clearTimeout(tooltipLayer.hideTimer);
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (tooltipVisible() && tooltipNeighbour(tooltipLayer.anchor, control)) {
      showTooltip(control, true);
      return;
    }
    /* A label somewhere else is a different label: it goes now, and the new one
     * appears once the pointer has rested on its control. */
    dropTooltip();
    tooltipLayer.timer = setTimeout(() => showTooltip(control, false), TOOLTIP_DELAY);
  });
  document.addEventListener('pointerout', event => {
    const control = event.target.closest('[data-tooltip]');
    if (!control || tooltipLayer.control !== control || control.contains(event.relatedTarget)) return;
    tooltipLayer.control = null;
    leaveTooltip(relatedControl(event.relatedTarget));
  });
  document.addEventListener('focusin', event => {
    const control = event.target.closest('[data-tooltip]');
    if (!control) return;
    tooltipLayer.control = control;
    clearTimeout(tooltipLayer.timer);
    clearTimeout(tooltipLayer.hideTimer);
    /* Keyboard focus gets the label at once, and keeps it on the move: the
     * arrows through a rail walk it down just like the pointer does. */
    showTooltip(control, tooltipNeighbour(tooltipLayer.anchor, control));
  });
  document.addEventListener('focusout', event => {
    const control = tooltipLayer.control;
    if (!control || control.contains(event.relatedTarget)) return;
    tooltipLayer.control = null;
    leaveTooltip(relatedControl(event.relatedTarget));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, true);
}

function relatedControl(node) {
  return node && node.closest ? node.closest('[data-tooltip]') : null;
}

function fmtMB(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1024) return (v / 1024).toFixed(1) + ' GB';
  return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '') + ' MB';
}

/* ------------------------------------------------------------------ *
 *  Copy to clipboard                                                   *
 * ------------------------------------------------------------------ */
/* The console is often opened over plain HTTP (a tunnel, a LAN address), where
 * the async clipboard API is missing: the selection-based copy covers that. */
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch (_) { /* Try selection-based copy. */ }
  }
  const previousFocus = document.activeElement;
  const buffer = h('textarea', { class: 'copy-buffer', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
  buffer.value = text;
  document.body.append(buffer);
  try {
    buffer.select();
    if (!document.execCommand('copy')) throw new Error('Copy is unavailable here. Select the text and press Ctrl+C.');
  } finally {
    buffer.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
}

/* One copy control for every value: the icon turns into a check for a moment,
 * so the result is visible where the pointer is, and screen readers hear it. */
function copyButton(getText, label = 'Copy') {
  const button = h('button', { class: 'btn ghost sm icon-only copy-btn', type: 'button', 'aria-label': label, 'data-tooltip': label }, icon('copy'));
  let timer = 0;
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const text = getText();
    if (!text) return;
    try {
      await copyText(text);
      button.classList.add('is-copied');
      button.replaceChildren(icon('check'));
      button.setAttribute('aria-label', 'Copied');
      button.dataset.tooltip = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove('is-copied');
        button.replaceChildren(icon('copy'));
        button.setAttribute('aria-label', label);
        button.dataset.tooltip = label;
      }, 1400);
    } catch (error) {
      toast(error.message, 'err');
    }
  });
  return button;
}

/* An input with its actions inside, at the right edge: copy, and for a secret
 * a reveal toggle. A read-only field also copies when it is clicked. */
function copyField(input, { label = 'Copy', reveal = false } = {}) {
  const wrap = h('div', { class: 'copy-field' });
  const actions = h('div', { class: 'copy-field-actions' });
  const copy = copyButton(() => input.value, label);
  if (reveal) {
    const toggle = h('button', { class: 'btn ghost sm icon-only', type: 'button', 'aria-label': 'Show', 'data-tooltip': 'Show' }, icon('eye'));
    toggle.addEventListener('click', () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      toggle.replaceChildren(icon(hidden ? 'eye-off' : 'eye'));
      toggle.setAttribute('aria-label', hidden ? 'Hide' : 'Show');
      toggle.dataset.tooltip = hidden ? 'Hide' : 'Show';
    });
    actions.append(toggle);
  }
  actions.append(copy);
  if (input.readOnly) {
    wrap.classList.add('is-click-copy');
    input.addEventListener('click', () => { if (input.value && !getSelection()?.toString()) { input.select(); copy.click(); } });
  }
  const sync = () => { copy.disabled = !input.value; };
  input.addEventListener('input', sync);
  new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['value', 'type'] });
  sync();
  wrap.append(input, actions);
  wrap._sync = sync;
  return wrap;
}

/* A value in running text (a path, a version) with a copy button that appears
 * on hover and focus; clicking the value itself copies too. */
function copyValue(text, { mono = true, label = 'Copy' } = {}) {
  const button = copyButton(() => text, label);
  const value = h('span', { class: 'copy-value-text' + (mono ? ' mono' : ''), text, title: 'Click to copy' });
  value.addEventListener('click', () => { if (!getSelection()?.toString()) button.click(); });
  return h('span', { class: 'copy-value' }, value, button);
}

function emptyState(glyphIcon, title, text, actions) {
  const box = h('div', { class: 'empty' },
    h('div', { class: 'glyph' }, icon(glyphIcon)),
    h('h4', { text: title }),
    h('p', { text }));
  if (actions && actions.length) box.append(h('div', { class: 'row', class: 'row center' }, ...actions));
  return box;
}

function spinnerRow() {
  const row = h('div', { class: 'row', class: 'row quiet' },
    spinner(), 'Loading …');
  return row;
}

export { actionMenu, checkBox, confirmDialog, copyButton, copyField, copyText, copyValue, customSelect, drawerOpen, emptyState, fmtMB, h, hideTooltip, icon, installHoverPill, installLabelSwap, installTooltips,
  mobileMedia, openDialog, placeTooltip, popInRows, popInText, refreshHoverPill, sectionNav, setDrawerOpen, setPopText, setSidebarCollapsed, sidebarCollapsed, sidebarTooltip, spinner, spinnerRow, streamText, toast };

// Brief action feedback; sustained rotation is reserved for a busy operation.
document.addEventListener('click', event => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const glyph = button.querySelector('svg[data-icon]');
  if (!glyph || button.matches('[role="checkbox"], [role="switch"]')) return;
  const turns = ['refresh-cw', 'rotate-ccw'].includes(glyph.dataset.icon);
  glyph.getAnimations().forEach(animation => animation.cancel());
  glyph.animate(turns ? [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }]
    : [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: .4 }, { transform: 'scale(1)' }],
    { duration: turns ? 500 : 220, easing: 'ease-out' });
}, true);

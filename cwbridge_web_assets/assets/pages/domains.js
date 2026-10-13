import { diagnosisButton } from '../operations.js';
/* CWBridge console: pages/domains. Local ES module; no runtime dependencies. */
import { navigate } from '../router.js';
import { API, UnauthorizedError, api, fetchState, state } from '../core.js';
import { actionMenu, copyButton, emptyState, fmtMB, h, icon, setPopText, toast } from '../ui.js';
import { handleUnauthorized } from '../auth.js';
import { domainDeleteBlocked, domainEditFromEntry, removeDomain } from './domain-detail.js';
import { renderApp } from '../shell.js';
import { duplicateDomain } from '../workflows.js';

let compactRowsTimer = null;

function scheduleCompactDomainRows() {
  if (compactRowsTimer) clearTimeout(compactRowsTimer);
  compactRowsTimer = setTimeout(() => {
    compactRowsTimer = null;
    if (state.view === 'app' && state.tab === 'domains' && !state.domainEdit) compactDomainRows();
  }, 150);
}

/* ---- Domains tab ---------------------------------------------------- */
function updateDomainRefreshButtons() {
  const busy = state.busy.domainRefresh;
  for (const button of document.querySelectorAll('[data-domain-refresh]')) {
    const target = button.dataset.domainRefresh;
    const active = busy && target === (state.refreshingDomain || '');
    button.disabled = busy || state.busy.bridge || !state.status?.running || !!state.domainsError || !state.domains.length;
    button.setAttribute('aria-busy', String(active));
    button.querySelector('span').textContent = active ? 'Refreshing …' : target ? 'Refresh' : 'Refresh all';
  }
  const hint = document.getElementById('domain-refresh-hint');
  if (hint) setPopText(hint, state.status?.running
    ? 'Refresh reloads existing CatWeb tabs in Roblox and brings Roblox to the foreground. Newly added domains require a bridge restart.'
    : 'Start the bridge to reload all or individual CatWeb tabs in Roblox.');
}

function domainRefreshButton(domain = null) {
  const button = h('button', { class: domain ? 'btn ghost sm' : 'btn', type: 'button',
    'data-domain-refresh': domain || '', 'aria-label': domain ? 'Refresh domain ' + domain : 'Refresh all domains' },
    icon('refresh-cw'), h('span', { text: domain ? 'Refresh' : 'Refresh all' }));
  button.addEventListener('click', () => refreshDomains(domain));
  return button;
}

let activeDomainMenu = null;

function closeDomainMenu() {
  if (activeDomainMenu) activeDomainMenu();
}

function domainActionsMenuTrigger(buttons, label) {
  const trigger = h('button', { class: 'btn ghost sm icon-only', type: 'button',
    'data-domain-menu-trigger': label || '', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': label ? 'More actions for ' + label : 'More domain actions' }, icon('settings-2'));
  let menu = null;
  let items = [];
  const close = () => {
    menu?.remove();
    menu = null;
    items = [];
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
    window.removeEventListener('resize', onDocResize);
    if (activeDomainMenu === close) activeDomainMenu = null;
  };
  const onDocDown = e => { if (menu && !menu.contains(e.target) && e.target !== trigger) close(); };
  const onDocKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); trigger.focus(); } };
  const onDocResize = () => close();
  // A row collapses one action at a time, so the set is re-read on every open:
  // an action hidden after this trigger was created must still be listed, or it
  // would be unreachable on narrow screens (neither inline nor in the menu).
  const compacted = () => [...trigger.parentElement.querySelectorAll(':scope > button.compact-hidden')];
  const open = () => {
    close();
    menu = h('div', { class: 'domain-actions-menu', role: 'menu' });
    const current = compacted();
    items = (current.length ? current : buttons).map(b => {
      const text = b.getAttribute('aria-label') || b.textContent.trim();
      const item = h('button', { type: 'button', class: 'domain-actions-item', role: 'menuitem',
        'aria-label': text }, b.querySelector('svg')?.cloneNode(true) || icon('settings-2'), h('span', { text }));
      item.disabled = b.disabled;
      item.addEventListener('click', () => { close(); if (!b.disabled) b.click(); });
      return item;
    });
    menu.append(...items);
    document.body.append(menu);
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) + 'px';
    const top = rect.bottom + 6;
    menu.style.top = (top + menu.offsetHeight > innerHeight - 8 ? Math.max(8, rect.top - menu.offsetHeight - 6) : top) + 'px';
    trigger.setAttribute('aria-expanded', 'true');
    activeDomainMenu = close;
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', onDocResize);
    items.find(i => !i.disabled)?.focus();
  };
  trigger.addEventListener('click', () => (menu ? close() : open()));
  trigger.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !menu) { e.preventDefault(); open(); }
  });
  return trigger;
}

function compactDomainRows() {
  const table = document.querySelector('table[aria-label="Domains"]');
  if (!table) return;
  const wrap = table.closest('.table-wrap');
  const cells = [...table.querySelectorAll('tbody .cell-actions')];
  closeDomainMenu();
  for (const cell of cells) {
    cell.querySelector('[data-domain-menu-trigger]')?.remove();
    for (const b of cell.querySelectorAll(':scope > button')) b.classList.remove('compact-hidden');
  }
  if (!wrap || wrap.scrollWidth - wrap.clientWidth <= 1) return;
  const visibleButtons = cell => [...cell.querySelectorAll(':scope > button:not(.compact-hidden):not([data-domain-menu-trigger])')];
  const budget = cells.reduce((n, cell) => n + visibleButtons(cell).length, 0);
  for (let step = 0; step <= budget && wrap.scrollWidth - wrap.clientWidth > 1; step++) {
    let target = null;
    for (const cell of cells) {
      const visible = visibleButtons(cell);
      if (visible.length && (!target || visible.length > target.visible.length)) target = { cell, visible };
    }
    if (!target) break;
    target.visible[target.visible.length - 1].classList.add('compact-hidden');
    if (!target.cell.querySelector('[data-domain-menu-trigger]')) {
      target.cell.append(domainActionsMenuTrigger(
        [...target.cell.querySelectorAll(':scope > button.compact-hidden')],
        target.cell.dataset.compactLabel || ''));
    }
  }
}

async function refreshDomains(domain = null) {
  if (state.busy.domainRefresh || state.busy.bridge || !state.status?.running) return;
  state.busy.domainRefresh = true;
  state.refreshingDomain = domain;
  updateDomainRefreshButtons();
  try {
    const result = await api(API.domainRefresh, { method: 'POST', body: { domain } });
    if (result.ok !== true || !Array.isArray(result.refreshed)) throw new Error('Refresh could not be confirmed. Check the bridge logs.');
    if (state.view === 'app') toast('Reload triggered for ' + result.refreshed.length + ' CatWeb ' + (result.refreshed.length === 1 ? 'domain' : 'domains'));
  } catch (err) {
    if (err instanceof UnauthorizedError) handleUnauthorized();
    else if (state.view === 'app') toast(err.message, 'err');
  } finally {
    state.busy.domainRefresh = false;
    state.refreshingDomain = null;
    updateDomainRefreshButtons();
  }
}

function renderDomainsTab(main) {
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: 'Domains' }),
      h('p', { text: 'Forwarded domains with their services and owners.' })),
    h('div', { class: 'page-actions' },
      domainRefreshButton(),
      h('button', { class: 'btn primary', id: 'domain-new' }, icon('plus'), 'Add domain')));

  const panel = h('div', { class: 'panel' });
  const pHead = h('div', { class: 'panel-head' },
    h('h3', { text: 'Registered domains' }),
    h('span', { class: 'grow' }),
    h('span', { class: 'panel-note', text: state.domains.length + ' entries' }));

  const body = h('div', { class: 'panel-body flush' });

  if (state.domainsError) {
    pHead.append(h('span', { class: 'error-text', text: state.domainsError }));
    body.append(emptyState('circle-alert', 'Domains could not be loaded', state.domainsError, [
      h('button', { class: 'btn', onclick: 'void 0' }, icon('refresh-cw'), 'Try again'),
    ]));
    body.append(diagnosisButton(true, 'Test storage connection'));
    const retry = body.querySelector('button');
    retry.addEventListener('click', async () => {
      try { await fetchState(); renderApp(); } catch (err) { if (err instanceof UnauthorizedError) handleUnauthorized(); else toast(err.message, 'err'); }
    });
  } else if (state.domains.length === 0) {
    body.append(emptyState('unplug', 'No domains yet', 'Add the first domain to forward requests to services.', [
      h('button', { class: 'btn primary' }, icon('plus'), 'Add domain'),
    ]));
    body.querySelector('button').addEventListener('click', () => navigate('domains', { addDomain: true }));
  } else {
    const wrap = h('div', { class: 'table-wrap' });
    const table = h('table', { 'aria-label': 'Domains' });
    table.append(h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Domain' }),
      h('th', { scope: 'col', text: 'Services' }),
      h('th', { scope: 'col', text: 'Owners' }),
      h('th', { scope: 'col', text: 'Storage' }),
      h('th', { scope: 'col', text: '' }))));
    const tbody = h('tbody');
    for (const d of state.domains) {
      const svc = Array.isArray(d.services) ? d.services : String(d.services || '').split(',').map(s => s.trim()).filter(Boolean);
      const owners = Array.isArray(d.owner_ids) ? d.owner_ids : [];
      const tr = h('tr');
      tr.append(
        h('td', { class: 'cell-domain' }, h('div', { class: 'cell-copy' }, h('span', { class: 'cell-copy-text', text: d.domain }), copyButton(() => d.domain, 'Copy domain'))),
        svc.length ? h('td', {}, ...svc.slice(0, 3).map(s => h('span', { class: 'tag', text: s })), svc.length > 3 ? h('span', { class: 'tag more', text: '+' + (svc.length - 3) }) : null)
                   : h('td', { class: 'cell-muted', text: '—' }),
        owners.length ? h('td', { class: 'cell-num', text: owners.join(', ') }) : h('td', { class: 'cell-muted', text: '—' }),
        h('td', { class: 'cell-num', text: fmtMB(d.storage_mb) }),
        h('td', { class: 'cell-actions', 'data-compact-label': d.domain }));
      const editBtn = h('button', { class: 'btn ghost sm', 'aria-label': 'Edit domain ' + d.domain }, icon('pencil'), h('span', { text: 'Edit' }));
      editBtn.addEventListener('click', () => {
        navigate('domains', { domain: d.domain });
      });
      const delBtn = h('button', { class: 'btn ghost sm danger', 'aria-label': 'Delete domain permanently ' + d.domain, 'data-domain-delete': '', disabled: domainDeleteBlocked() || state.busy.domainRemove, title: domainDeleteBlocked() ? 'Stop the bridge before permanently deleting this domain and all its data.' : 'Delete this domain and all its data' }, icon('trash-2'), h('span', { text: 'Delete' }));
      delBtn.addEventListener('click', () => removeDomain(d.domain));
      const duplicate = h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Duplicate domain ' + d.domain, onclick: () => duplicateDomain(d) }, icon('copy'), h('span', { text: 'Duplicate' }));
      tr.lastChild.append(editBtn, actionMenu({ floating: true, buttonClass: 'btn ghost sm icon-only', ariaLabel: 'Actions for ' + d.domain,
        items: [domainRefreshButton(d.domain), duplicate, delBtn] }));
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    body.append(wrap);
  }

  panel.append(pHead, body);
  main.append(head, h('p', { class: 'hint', id: 'domain-refresh-hint' }), panel);
  updateDomainRefreshButtons();

  main.querySelector('#domain-new').addEventListener('click', () => {
    navigate('domains', { addDomain: true });
  });
}

export { closeDomainMenu, compactDomainRows, renderDomainsTab, scheduleCompactDomainRows, updateDomainRefreshButtons };

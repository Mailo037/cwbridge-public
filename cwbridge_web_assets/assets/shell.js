/* CWBridge console: shell. Local ES module; no runtime dependencies. */
import { UnauthorizedError, fetchState, pollStatus, state } from './core.js';
import { drawerOpen, emptyState, h, hideTooltip, icon, mobileMedia, popInRows, popInText, refreshHoverPill, sectionNav, setDrawerOpen, setSidebarCollapsed, sidebarCollapsed, sidebarTooltip, spinner } from './ui.js';
import { doLogout, gateCard, handleUnauthorized, renderLogin, renderSetup } from './auth.js';
import { renderOverviewTab, updateRobloxButtons } from './pages/overview.js';
import { renderUsageTab } from './pages/usage.js';
import { compactDomainRows, renderDomainsTab, updateDomainRefreshButtons } from './pages/domains.js';
import { closeDomainEdit, domainDeleteBlocked, domainEditDirty, domainSections, renderDomainEditPage } from './pages/domain-detail.js';
import { closeDatastoreCollection, datastoreSectionLabel, datastoreSections, renderDatastoreCollectionPage, renderDatastoreTab } from './pages/datastore.js';
import { SETTINGS_DEFAULT_SECTION, navigate, navigateSection, navigateTab, syncRoute } from './router.js';
import { renderSettingsSectionPage, settingsDirtySections, settingsSectionIds, settingsSectionLabel } from './pages/settings.js';
import { renderLogsTab } from './pages/logs.js';
import { ABOUT_SECTIONS, renderAboutTab, stopWebConsole } from './pages/about.js';
import { HELP_PAGES, renderHelpPage } from './pages/help.js';
import { applyNotice, updateApplyNotice } from './operations.js';
import { openSearch, SERVICE_NAMES } from './workflows.js';
import { startBlockReason } from './platform.js';

/* ------------------------------------------------------------------ *
 *  App state                                                           *
 * ------------------------------------------------------------------ */
/* Top-level destinations only. Anything with sub-pages (Settings, a domain)
 * hands its own list in through SECTIONS and replaces this list in the
 * sidebar, so no page is a single long scrolling frame by construction. */
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'domains',  label: 'Domains',  icon: 'database' },
  { id: 'datastore', label: 'Datastore', icon: 'table' },
  { id: 'usage',    label: 'Usage',    icon: 'chart-column' },
  { id: 'settings', label: 'Settings', icon: 'settings-2' },
  { id: 'logs',     label: 'Logs', icon: 'scroll-text' },
  { id: 'help',     label: 'Docs', icon: 'compass' },
  { id: 'about',    label: 'About', icon: 'info' },
];

const SETTINGS_SECTIONS = [
  { id: 'services',    label: 'Services',        icon: 'list' },
  { id: 'limits',      label: 'Limits & usage',  icon: 'chart-column' },
  { id: 'storage',     label: 'Storage',         icon: 'hard-drive' },
  { id: 'backups',     label: 'Backups',         icon: 'scroll-text' },
  { id: 'ai',          label: 'AI & models',     icon: 'bot' },
  { id: 'credentials', label: 'Credentials',     icon: 'key-round' },
  { id: 'notifications', label: 'Webhooks', icon: 'unplug' },
];

const SECTION_ICONS = {
  services: 'list', limits: 'chart-column', storage: 'hard-drive', backups: 'scroll-text',
  ai: 'bot', credentials: 'key-round', notifications: 'unplug',
  activity: 'scroll-text', danger: 'circle-alert',
  entries: 'table', documents: 'scroll-text',
};

/* The context whose sub-pages the sidebar currently shows, or null while a
 * top-level tab without sub-pages is active. */
function sectionContext() {
  if (state.tab === 'help') {
    return { back: 'All sections', onBack: () => navigate('overview'), eyebrow: 'Docs', items: HELP_PAGES, current: 'start' };
  }
  if (state.tab === 'about') {
    return { back: 'All sections', onBack: () => navigate('overview'), eyebrow: 'About', items: ABOUT_SECTIONS, current: 'general' };
  }
  if (state.tab === 'settings') {
    return {
      back: 'All sections',
      onBack: () => navigate('overview'),
      eyebrow: 'Settings',
      items: SETTINGS_SECTIONS,
      current: SETTINGS_DEFAULT_SECTION,
    };
  }
  if (state.tab === 'datastore' && state.datastore.open) {
    const open = state.datastore.open;
    return {
      back: 'All collections',
      onBack: () => closeDatastoreCollection(),
      // The domain behind a collection is the name an operator recognises; the
      // collection name is the fallback for the bridge's internal records.
      eyebrow: open.domain || open.collection,
      items: datastoreSections(),
      current: 'entries',
    };
  }
  if (state.tab === 'domains' && state.domainEdit) {
    const draft = state.domainEdit;
    // Creating a domain has no sub-pages yet: the sidebar keeps the tab list.
    if (draft.mode !== 'edit') return null;
    return {
      back: 'Domains',
      onBack: () => closeDomainEdit(),
      eyebrow: draft.domain,
      items: domainSections('edit'),
      current: 'services',
    };
  }
  return null;
}

/* Live marker for the section nav: which sub-page is active, and which of the
 * others hold unsaved edits. The draft is shared across sub-pages, but the dot
 * belongs to the sub-page whose own values changed — an edit to the storage
 * mode must not mark AI, backups and credentials as unsaved too. */
function sectionControl() {
  return {
    current: () => state.tab === 'help' ? state.helpSection : state.tab === 'about' ? state.aboutSection : state.tab === 'settings' ? state.settingsSection
      : state.tab === 'datastore' ? state.datastoreSection
      : state.domainSection,
    flags: () => {
      if (state.tab === 'settings') return settingsDirtySections();
      return state.domainEdit && domainEditDirty(state.domainEdit) ? { services: 'Unsaved changes' } : null;
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Render — app shell                                                  *
 * ------------------------------------------------------------------ */
function renderStatusPill(pill) {
  updateApplyNotice();
  const running = !!(state.status && state.status.running);
  const label = running ? 'Running' : 'Stopped';
  /* The pill is rebuilt on every status poll, so the word is only swapped — and
   * only animates — when the bridge really changed state. */
  const changed = pill.dataset.state !== label;
  pill.dataset.state = label;
  pill.textContent = '';
  pill.classList.toggle('running', running);
  pill.classList.toggle('stopped', !running);
  pill.append(h('span', { class: 'dot', 'aria-hidden': 'true' }));
  pill.append(changed ? popInText(label) : h('span', { text: label }));
  if (running && state.status && state.status.pid != null) pill.classList.add('pid'),
  pill.append(sidebarTooltip(h('span', { class: 'chip' }), state.status.pid != null ? 'PID ' + state.status.pid : ''));
}

function updateBridgeButtons() {
  updateDomainRefreshButtons();
  updateRobloxButtons();
  const busy = state.busy.bridge || state.roblox.rejoinBusy;
  const startBtn = document.getElementById('bridge-start');
  const stopBtn = document.getElementById('bridge-stop');
  const running = !!(state.status && state.status.running);
  const startReason = startBlockReason(state.status);
  // A running bridge with live reload releases a domain before its deletion.
  document.querySelectorAll('[data-domain-delete]').forEach(button => { button.disabled = busy || domainDeleteBlocked() || !!state.busy.domainRemove; });
  if (startBtn) {
    startBtn.disabled = busy || running || !!startReason;
    startBtn.title = startReason || '';
    const sp = startBtn.querySelector('span:last-child');
    if (sp) sp.textContent = state.busy.bridge && !running ? 'Starting …' : 'Start';
  }
  if (stopBtn) {
    stopBtn.disabled = busy || !running;
    const sp = stopBtn.querySelector('span:last-child');
    if (sp) sp.textContent = state.busy.bridge && running ? 'Stopping …' : 'Stop';
  }
}

/* Top-level tab list. */
function tabsNav() {
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' });
  for (const t of TABS) {
    const b = h('button', {
      class: 'tab', role: 'tab', id: 'tab-' + t.id,
      'aria-selected': String(state.tab === t.id),
      'aria-controls': 'panel-' + t.id,
      tabindex: state.tab === t.id ? '0' : '-1',
    }, icon(t.icon), h('span', { class: 'sidebar-label', text: t.label }));
    sidebarTooltip(b, t.label);
    b.addEventListener('click', () => navigateTab(t.id));
    b.addEventListener('keydown', e => {
      const idx = TABS.findIndex(x => x.id === state.tab);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); navigateTab(TABS[(idx + 1) % TABS.length].id); focusTab(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); navigateTab(TABS[(idx - 1 + TABS.length) % TABS.length].id); focusTab(); }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); navigateTab(TABS[e.key === 'Home' ? 0 : TABS.length - 1].id); focusTab(); }
    });
    tabs.append(b);
  }
  return tabs;
}

/* Second-level list inside a context. Selection and arrow keys stay inside the
 * nav: changing a sub-page never tears the list down, so focus is kept. */
/* The nav is the only place that reports an unsaved draft made on another
 * sub-page, so it repaints in place instead of waiting for a shell render. */
let currentSectionNav = null;
let navRepaintInstalled = false;
function installNavRepaint() {
  if (navRepaintInstalled) return;
  navRepaintInstalled = true;
  document.addEventListener('cwbridge:settings-dirty', () => {
    if (!currentSectionNav) return;
    const active = sectionControl().current();
    currentSectionNav.paint();
    currentSectionNav.mark(active);
  });
}

function contextNav() {
  const context = sectionContext();
  /* Every entry is a routable sub-page — none of them may carry a "divider"
   * flag, or it would be drawn as a rule instead of as a destination. */
  const items = context.items.map(item => ({
    id: item.id, label: item.label,
    icon: item.icon || SECTION_ICONS[item.id] || 'square',
  }));
  const ids = items.map(item => item.id);
  const nav = sectionNav({
    back: context.back,
    eyebrow: context.eyebrow,
    items,
    control: sectionControl(),
    onBack: context.onBack,
    onSelect: id => selectSection(id),
    onKeydown: (event, item) => {
      const index = ids.indexOf(item.id);
      let next = null;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = ids[(index + 1) % ids.length];
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = ids[(index - 1 + ids.length) % ids.length];
      else if (event.key === 'Home') next = ids[0];
      else if (event.key === 'End') next = ids[ids.length - 1];
      else if (event.key === 'Enter' || event.key === ' ') next = item.id;
      if (next === null) return;
      event.preventDefault();
      /* Enter and Space activate in place; the arrows only move focus. */
      if (event.key === 'Enter' || event.key === ' ') { selectSection(next); return; }
      nav.mark(next);
      nav.list.querySelector('[data-section="' + next + '"]')?.focus();
    },
  });
  currentSectionNav = nav;
  return nav;
}

/* Folding the rail is a change of the shell, not of the page: the classes are
 * set on what is already on screen so the width can travel, and the labels only
 * arrive when the rail opens again. */
let expandTimer = 0;
let lastNavKind = null;   // 'tabs' or 'sections' — the level the sidebar shows
function applyCollapsed(sidebar, collapsed) {
  sidebar.classList.toggle('is-collapsed', collapsed);
  document.querySelector('.shell')?.classList.toggle('rail-collapsed', collapsed);
  clearTimeout(expandTimer);
  sidebar.classList.toggle('just-expanded', !collapsed);
  if (!collapsed) {
    /* The class has to go again, or the next re-render would replay the
     * labels on a rail that never moved. */
    expandTimer = setTimeout(() => sidebar.classList.remove('just-expanded'), 260);
  }
}

/* Reading the console's state again: what the topbar's refresh does, and the
 * way out of a dead end that came from a read which failed. */
let consoleRefreshing = false;
async function refreshConsole() {
  if (consoleRefreshing) return;
  consoleRefreshing = true;
  const sync = () => document.querySelectorAll('[aria-label="Refresh status"]').forEach(button => {
    button.disabled = consoleRefreshing; button.setAttribute('aria-busy', String(consoleRefreshing));
  });
  sync();
  try { await fetchState(); await pollStatus(); renderApp(); }
  catch (err) { if (err instanceof UnauthorizedError) handleUnauthorized(); }
  finally { consoleRefreshing = false; sync(); }
}

function renderApp() {
  syncRoute();
  const root = document.getElementById('app');
  const focusId = document.activeElement && document.activeElement.id ? document.activeElement.id : null;
  // Toasts outlive a re-render: a save that shows one and then repaints the
  // page (navigate, renderApp) must not drop the message it just announced.
  const toastStack = root.querySelector('.toast-stack') || h('div', { class: 'toast-stack' });
  root.textContent = '';

  const collapsed = sidebarCollapsed();
  const overlay = mobileMedia().matches;
  const useDrawer = overlay && drawerOpen();

  const brand = h('div', { class: 'brand' },
    h('span', { class: 'logo' }, icon('terminal')),
    h('span', { class: 'brand-name', text: 'CWBridge' }));

  const collapseBtn = h('button', {
    class: 'sidebar-icon-btn', type: 'button',
    'aria-label': collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    'aria-expanded': String(!collapsed),
  });
  collapseBtn.append(icon('chevron-down'));
  sidebarTooltip(collapseBtn, collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  collapseBtn.addEventListener('click', () => {
    const next = !sidebarCollapsed();
    setSidebarCollapsed(next);
    /* The rail is not rebuilt for this. A re-render would swap the element, and
     * a fresh element cannot animate its width — the same classes the render
     * would have set are enough. */
    applyCollapsed(sidebar, next);
    sidebarTooltip(collapseBtn, next ? 'Expand sidebar' : 'Collapse sidebar');
    collapseBtn.setAttribute('aria-expanded', String(!next));
    hideTooltip();   // the label under the pointer no longer fits the button
    collapseBtn.focus({ preventScroll: true });
  });

  /* On a narrow screen the same sidebar becomes an overlay drawer: closed by
   * default, but its open state is remembered. The page underneath is never
   * re-laid-out, so nothing gets squeezed while it is open. */
  const closeBtn = h('button', { class: 'sidebar-icon-btn drawer-close', type: 'button', 'aria-label': 'Close navigation' });
  closeBtn.append(icon('x'));
  sidebarTooltip(closeBtn, 'Close navigation');
  closeBtn.addEventListener('click', () => closeDrawer());

  const pill = h('span', { class: 'status-pill' });
  renderStatusPill(pill);

  const refresh = sidebarTooltip(h('button', { class: 'btn ghost sm icon-only', 'aria-label': 'Refresh status', disabled: consoleRefreshing, 'aria-busy': String(consoleRefreshing) }), 'Refresh status');
  refresh.append(icon('refresh-cw'));
  refresh.addEventListener('click', refreshConsole);

  const logout = sidebarTooltip(h('button', { class: 'btn ghost sm' },
    icon('log-out'), h('span', { class: 'sidebar-label', text: 'Sign out' })), 'Sign out');
  logout.addEventListener('click', doLogout);
  const stopConsole = sidebarTooltip(h('button', { class: 'btn ghost sm icon-only', type: 'button', 'aria-label': 'Stop web console', disabled: state.about.updateBusy, onclick: stopWebConsole }, icon('square')), 'Stop web console');

  const section = sectionContext();
  /* Stepping into a context (Settings, a domain, a collection) replaces the tab
   * list with that context's sub-pages. The new list swipes in from the side it
   * came from, so changing level reads as a movement instead of a swap; a plain
   * repaint of the same level does not move at all. */
  const kind = section ? 'sections' : 'tabs';
  const swipe = lastNavKind && lastNavKind !== kind ? (kind === 'sections' ? ' swipe-forward' : ' swipe-back') : '';
  lastNavKind = kind;
  const sidebar = h('aside', { class: 'sidebar' + (!overlay && collapsed ? ' is-collapsed' : ''), 'aria-label': 'CWBridge Navigation' },
    h('div', { class: 'sidebar-head' }, brand,
      h('span', { class: 'grow' }), overlay ? closeBtn : collapseBtn),
    h('div', { class: 'sidebar-nav' + swipe }, section ? contextNav().nav : tabsNav()),
    h('div', { class: 'sidebar-footer' },
      h('div', { class: 'sidebar-session-actions' }, logout, stopConsole)));

  const menuBtn = h('button', { class: 'topbar-menu', type: 'button', 'aria-label': 'Open navigation', 'aria-expanded': String(useDrawer), 'aria-controls': 'app-sidebar' });
  menuBtn.append(icon('list'));
  sidebarTooltip(menuBtn, 'Open navigation');
  menuBtn.addEventListener('click', () => openDrawer());
  sidebar.id = 'app-sidebar';

  const crumbButton = (label, navigateTo) => {
    const button = h('button', { class: 'breadcrumb-link', type: 'button', text: label });
    button.addEventListener('click', () => {
      navigateTo();
      document.querySelector('.main')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    });
    return button;
  };
  const separator = () => h('span', { 'aria-hidden': 'true', text: ' / ' });
  const breadcrumb = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
    crumbButton('Console', () => { state.domainEdit = null; navigate('overview'); }),
    separator());
  if (state.tab === 'settings') {
    breadcrumb.append(
      h('span', { 'aria-current': 'page', text: 'Settings' }), separator(),
      h('span', { text: settingsSectionLabel(state.settingsSection) }));
  } else if (state.tab === 'about' && state.aboutSection !== 'general') {
    breadcrumb.append(crumbButton('About', () => navigate('about')), separator(),
      h('span', { 'aria-current': 'page', text: ABOUT_SECTIONS.find(s => s.id === state.aboutSection)?.label }));
  } else if (state.tab === 'help' && state.helpSection !== 'start') {
    breadcrumb.append(crumbButton('Docs', () => navigate('help')), separator(),
      h('span', { 'aria-current': 'page', text: HELP_PAGES.find(s => s.id === state.helpSection)?.label }));
  } else if (state.tab === 'datastore' && state.datastore.open) {
    breadcrumb.append(
      crumbButton('Datastore', closeDatastoreCollection), separator(),
      h('span', { text: state.datastore.open.domain || state.datastore.open.collection }), separator(),
      h('span', { 'aria-current': 'page', text: datastoreSectionLabel(state.datastoreSection) }));
    if (state.datastore.entryKey != null || state.datastore.newEntry) {
      breadcrumb.lastChild.remove();
      breadcrumb.append(crumbButton('Entries', () => navigate('datastore', { collection: state.datastore.open.collection, section: 'entries' })), separator(),
        h('span', { 'aria-current': 'page', text: state.datastore.newEntry ? 'New entry' : state.datastore.entryKey }));
    }
  } else if (state.tab === 'domains' && state.domainEdit?.mode === 'edit') {
    breadcrumb.append(
      crumbButton('Domains', closeDomainEdit), separator(),
      h('span', { text: state.domainEdit.domain }), separator());
    if (state.domainService) {
      const domain = state.domainEdit.domain;
      breadcrumb.append(crumbButton(domainSectionLabel('services'), () => navigate('domains', { domain, section: 'services' })), separator(),
        h('span', { 'aria-current': 'page', text: SERVICE_NAMES[state.domainService] || state.domainService }));
    } else {
      breadcrumb.append(h('span', { 'aria-current': 'page', text: domainSectionLabel(state.domainSection) }));
    }
  } else if (state.tab === 'domains' && state.domainEdit) {
    breadcrumb.append(
      crumbButton('Domains', closeDomainEdit), separator(),
      h('span', { 'aria-current': 'page', text: 'New domain' }));
  } else {
    breadcrumb.append(h('span', { 'aria-current': 'page', text: TABS.find(t => t.id === state.tab).label }));
  }
  const top = h('header', { class: 'topbar' },
    /* The drawer control belongs to the overlay layout only: it is the one
     * control that would otherwise be a second, misleading way into the rail. */
    useDrawer || mobileMedia().matches ? menuBtn : null,
    breadcrumb,
    h('div', { class: 'top-actions' }, h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Search (Ctrl+K)', onclick: openSearch }, icon('search')), pill, refresh));

  /* A section context that saves a draft reserves room at the bottom for the
   * sticky save bar, so its last field can never sit behind the bar. */
  const savesDraft = state.tab === 'settings';
  const main = h('main', { class: 'main' + (savesDraft ? ' has-save-bar' : ''), id: 'panel-' + state.tab, tabindex: '-1' });
  main.append(applyNotice());
  /* A tab panel only when the tab list is on screen; a section context has no
   * tab to point at, so it names itself instead. */
  if (section) {
    main.setAttribute('aria-label', state.tab === 'settings' ? 'Settings' : state.tab === 'datastore' ? 'Datastore' : state.tab === 'help' ? 'Docs' : 'Domain');
  } else {
    main.setAttribute('role', 'tabpanel');
    main.setAttribute('aria-labelledby', 'tab-' + state.tab);
  }

  const shell = () => {
    const parts = [sidebar, h('div', { class: 'workspace' }, top, main)];
    if (useDrawer) parts.push(drawerBackdrop());
    const railClass = (!overlay && collapsed) ? ' rail-collapsed' : '';
    const shellEl = h('div', { class: 'shell' + (useDrawer ? ' drawer-open' : '') + railClass }, ...parts);
    const app = h('div', {}, shellEl, toastStack);
    root.append(app);
    installNavRepaint();
    /* Every table on the page arrives as rows, a moment apart: the page is on
     * screen and finished here, which is the only moment that can say so — and
     * the one place that has to, for every table the console has. */
    popInRows(main);
    /* The rows are new, but the pointer may still be resting on one of them:
     * the travelling highlight is re-anchored instead of disappearing. */
    refreshHoverPill();
    /* A label is anchored to the control it names, and that control is gone. */
    hideTooltip();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  };

  if (state.routeError) {
    main.append(...deadEndPage());
    shell();
    return;
  }

  if (state.tab === 'overview') renderOverviewTab(main);
  else if (state.tab === 'domains') {
    if (state.domainEdit) renderDomainEditPage(main, { section: state.domainSection || 'services' });
    else renderDomainsTab(main);
  }
  else if (state.tab === 'usage') renderUsageTab(main);
  else if (state.tab === 'datastore') {
    if (state.datastore.open) renderDatastoreCollectionPage(main, state.datastoreSection || 'entries');
    else renderDatastoreTab(main);
  }
  else if (state.tab === 'settings') renderSettingsSectionPage(main, state.settingsSection || SETTINGS_DEFAULT_SECTION);
  else if (state.tab === 'logs') renderLogsTab(main);
  else if (state.tab === 'help') renderHelpPage(main, state.helpSection);
  else if (state.tab === 'about') renderAboutTab(main);

  shell();
  installGlobalEscapes();
  if (state.tab === 'domains' && !state.domainEdit) {
    updateDomainRefreshButtons();
    compactDomainRows();
  }
}

function domainSectionLabel(section) {
  const item = domainSections(state.domainEdit?.mode || 'edit').find(entry => entry.id === section);
  return item ? item.label : 'Domain';
}

/* Picking a sub-page from the overlay closes the drawer: the point of the tap
 * is to see the page. On the inline rail nothing changes. */
function selectSection(id) {
  navigateSection(id);
  if (mobileMedia().matches && drawerOpen()) closeDrawer();
}

/* ---- Mobile drawer --------------------------------------------------- */
function drawerBackdrop() {
  const backdrop = h('div', { class: 'nav-backdrop', 'aria-hidden': 'true' });
  backdrop.addEventListener('click', () => closeDrawer());
  return backdrop;
}

function openDrawer() {
  setDrawerOpen(true);
  document.body.classList.add('drawer-locked');
  renderApp();
  const sidebar = document.getElementById('app-sidebar');
  sidebar?.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
}

function closeDrawer() {
  setDrawerOpen(false);
  document.body.classList.remove('drawer-locked');
  if (mobileMedia().matches) renderApp();
}

let escapeInstalled = false;
function installGlobalEscapes() {
  if (escapeInstalled) return;
  escapeInstalled = true;
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    hideTooltip();
    if (!mobileMedia().matches || !drawerOpen() || document.querySelector('.dialog-backdrop')) return;
    closeDrawer();
    document.querySelector('.topbar-menu')?.focus({ preventScroll: true });
  });
}

function focusTab() {
  const t = document.getElementById('tab-' + state.tab);
  if (t) t.focus();
}

function renderBooting() {
  const root = document.getElementById('app');
  root.textContent = '';
  root.append(gateCard({
    build: () => [h('div', { class: 'gate-progress' }, spinner(), 'Starting the console …')],
  }));
}

/* A route that leads nowhere is still a page of the console: the same head with
 * the same title, and the empty state every other page uses when there is
 * nothing to show — with a way out, rather than an error sentence under a bare
 * heading. The three dead ends differ only in what they say and where they send
 * the reader. */
function deadEndPage() {
  const missing = state.routeError === 'Domain not found';
  const failed = state.routeError === 'Domains could not be loaded';
  const address = state.routeError === 'Page not found' ? location.pathname : null;
  const lede = failed
    ? 'The list of domains could not be read, so this domain cannot be opened.'
    : missing
      ? 'No domain with this name is registered on this bridge.'
      : 'The console has no page at this address. The link may be out of date, or it may belong to a different version of the console.';
  const [glyph, title, text] = failed
    ? ['circle-alert', 'The domain list did not arrive', state.domainsError || 'Refresh the console and try again.']
    : missing
      ? ['unplug', 'This domain is not on this bridge', 'It may have been renamed or removed. The domain list shows every domain the bridge serves.']
      : ['compass', 'Nothing answers this address', 'Every page of the console is reachable from the navigation. Start again from the overview, or open the domain list.'];
  const back = h('button', { class: 'btn' + (missing ? ' primary' : ''), type: 'button', onclick: () => navigate('domains') }, icon('unplug'), 'All domains');
  const home = h('button', { class: 'btn' + (missing || failed ? '' : ' primary'), type: 'button', onclick: () => navigate('overview') }, icon('layout-dashboard'), 'Go to the overview');
  /* A domain that could not be looked up is the one dead end with something to
   * try again. */
  const retry = failed
    ? h('button', { class: 'btn primary', type: 'button', onclick: refreshConsole }, icon('refresh-cw'), 'Try again')
    : null;
  /* The way out stands in the same order as every other pair of buttons in the
   * console: the plain one first, the one that follows from the state last. */
  const actions = missing ? [home, back] : failed ? [home, retry] : [back, home];
  return [
    h('div', { class: 'page-head' },
      h('div', { class: 'titles' },
        h('h1', { text: state.routeError }),
        h('p', {}, lede, address ? [' ', h('code', { class: 'dead-end-path', text: address })] : null))),
    h('div', { class: 'panel dead-end' },
      h('div', { class: 'panel-body' },
        emptyState(glyph, title, text, actions))),
  ];
}

/* ---- Router ---------------------------------------------------------------- */
function render() {
  if (!mobileMedia().matches) document.body.classList.remove('drawer-locked');
  if (state.view === 'login') { renderLogin(); return; }
  if (state.view === 'setup') { renderSetup(); return; }
  if (state.view === 'app') { renderApp(); return; }
  renderBooting();
}

export { closeDrawer, openDrawer, render, renderApp, renderBooting, renderStatusPill, updateBridgeButtons };

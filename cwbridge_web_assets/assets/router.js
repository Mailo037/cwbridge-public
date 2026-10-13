/* URL navigation for the console. No history entries are added by rerenders.
 *
 * Two levels of routes exist:
 *   /settings/<section>          one Settings sub-page
 *   /domains/<domain>/<section>  one sub-page of a domain
 *   /datastore/<collection>/<section>  one sub-page of a stored collection
 * A section-less deep link stays valid and resolves to the context's default
 * section, so old bookmarks and the collection list keep working. */
import { getBasePath, state } from './core.js';
import { render } from './shell.js';
import { domainEditFromEntry, domainSections } from './pages/domain-detail.js';
import { datastoreSectionIds, openDatastoreCollection } from './pages/datastore.js';
import { closeDomainMenu } from './pages/domains.js';
import { hideTooltip } from './ui.js';

/* The top-level tab list and the path list are the same thing: one entry per
 * tab, with the path it lives at. Anything else (an alias, a sub-page) is a
 * case of its own in readRoute, never a value in here. */
export const PAGE_PATHS = Object.freeze({
  overview: 'overview', domains: 'domains', datastore: 'datastore',
  usage: 'users', settings: 'settings', logs: 'logs', help: 'docs', about: 'about',
});

/* Top-level navigation: Services became a Settings sub-page, so the tab list
 * is shorter than the list of routes. */
export const TOP_LEVEL = Object.freeze(['overview', 'domains', 'datastore', 'usage', 'settings', 'logs', 'help', 'about']);
export const HELP_SECTIONS = Object.freeze(['start', 'flow', 'services', 'requests', 'updates', 'problems']);

export const SETTINGS_SECTIONS = Object.freeze(['services', 'limits', 'storage', 'backups', 'ai', 'credentials', 'notifications']);
export const ABOUT_SECTIONS = Object.freeze(['general', 'transfer', 'danger']);
export const SETTINGS_DEFAULT_SECTION = 'limits';
export const DATASTORE_DEFAULT_SECTION = 'entries';

/* A domain carries different sections while it is being edited than while it
 * is being created; both live in pages/domain-detail.js. */
/* Every declared section is routable: they are sub-pages, not decorations. */
function domainSectionIds(mode) {
  return domainSections(mode).map(section => section.id);
}

function segment(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function decodeSegment(value) {
  try { return decodeURIComponent(value); }
  catch (_) { return null; }
}

let installed = false;

export function pageHref(tab, { domain = null, collection = null, addDomain = false, section = null, entry = null, newEntry = false } = {}) {
  if (!Object.hasOwn(PAGE_PATHS, tab)) throw new Error('Unknown console page: ' + tab);
  // Keep even slash-containing domain names in ONE encoded path segment.
  const path = getBasePath() + PAGE_PATHS[tab]
    + (domain !== null ? '/' + encodeURIComponent(domain) : '')
    + (collection !== null ? '/' + encodeURIComponent(collection) : '');
  const query = addDomain || newEntry ? '?new=1' : '';
  // A sub-page is one more path segment: settings/<section>, domains/<domain>/<section>.
  return section ? path + '/' + section + (entry !== null ? '/' + encodeURIComponent(entry) : '') + query : path + query;
}

export function readRoute() {
  if (!location.pathname.startsWith(getBasePath())) return null;
  const path = location.pathname.slice(getBasePath().length).replace(/\/$/, '');
  // The bare console root stays /: it is the canonical home and must never be
  // rewritten to /overview, or a later reload would request an unknown page.
  if (!path || path === 'index.html') return { tab: 'overview', keepPath: true };
  if (path === 'usage') return { tab: 'usage' }; // Friendly alias; /users is canonical.
  /* Services moved into Settings; the old top-level path keeps working and is
   * rewritten to the sub-page it now names. */
  if (path === 'services') return { tab: 'settings', section: 'services' };
  const parts = path.split('/');
  if (parts.length === 4 && parts[0] === 'datastore' && parts[2] === 'entries') {
    const collection = decodeSegment(parts[1]), entry = decodeSegment(parts[3]);
    return collection && entry ? { tab: 'datastore', collection, section: 'entries', entry } : null;
  }
  if (parts.length === 2 && parts[0] === 'about') {
    return { tab: 'about', section: ABOUT_SECTIONS.includes(parts[1]) ? parts[1] : 'general' };
  }
  if (parts.length === 2 && parts[0] === 'docs') {
    return { tab: 'help', section: HELP_SECTIONS.includes(parts[1]) ? parts[1] : 'start' };
  }
  if (parts.length === 2 && parts[0] === 'settings') {
    // An unknown section is not an error: it falls through to the default so a
    // stale link still lands somewhere usable, and syncRoute canonicalizes it.
    return { tab: 'settings', section: SETTINGS_SECTIONS.includes(parts[1]) ? parts[1] : null };
  }
  /* One service of a domain is a sub-page of its services: the crumb grows by
   * one step and Back returns to the list. */
  if (parts.length === 4 && parts[0] === 'domains' && parts[2] === 'services') {
    const domain = decodeSegment(parts[1]);
    if (domain === null) return null;
    return { tab: 'domains', domain, section: 'services', entry: /^[a-z]+$/.test(parts[3]) ? parts[3] : null };
  }
  if (parts.length === 3 && parts[0] === 'domains') {
    const domain = decodeSegment(parts[1]);
    if (domain === null) return null;
    return { tab: 'domains', domain, section: segment(parts[2]) };
  }
  /* A stored collection is one encoded segment, exactly like a domain. The
   * server's shell allowlist uses the same shape. */
  if ((parts.length === 2 || parts.length === 3) && parts[0] === 'datastore') {
    const collection = decodeSegment(parts[1]);
    if (collection === null || !collection) return null;
    return { tab: 'datastore', collection, section: parts.length === 3 ? segment(parts[2]) : null, newEntry: new URLSearchParams(location.search).get('new') === '1' };
  }
  if (parts.length === 1) {
    const tab = Object.keys(PAGE_PATHS).find(key => PAGE_PATHS[key] === path);
    if (tab) return { tab, addDomain: tab === 'domains' && new URLSearchParams(location.search).get('new') === '1' };
  }
  const match = /^domains\/([^/]+)$/.exec(path);
  if (match) {
    const domain = decodeSegment(match[1]);
    if (domain === null) return null;
    return { tab: 'domains', domain };
  }
  return null;
}

// Called before rendering the authenticated shell, after its data has loaded.
// Keeping this out of boot means login and setup preserve deep links too.
export function syncRoute() {
  if (!installed) return; // Focused component tests can render without a router.
  const route = readRoute();
  state.routeError = route ? null : 'Page not found';
  if (!route) return;
  state.tab = route.tab;
  if (route.tab === 'about') state.aboutSection = route.section || 'general';
  if (route.tab === 'help') state.helpSection = route.section || 'start';
  if (route.tab === 'settings') {
    state.settingsSection = route.section || SETTINGS_DEFAULT_SECTION;
  }
  if (route.tab === 'domains') {
    if (route.domain !== undefined) {
      const entry = state.domains.find(d => d.domain === route.domain);
      if (!entry) {
        state.domainEdit = null;
        state.routeError = state.domainsError ? 'Domains could not be loaded' : 'Domain not found';
      } else if (state.domainEdit?.mode !== 'edit' || state.domainEdit.domain !== route.domain) {
        state.domainEdit = domainEditFromEntry('edit', entry);
      }
      if (state.domainEdit?.mode === 'edit') {
        const ids = domainSectionIds('edit');
        state.domainSection = ids.includes(route.section) ? route.section : ids[0];
      }
      state.domainService = state.domainSection === 'services' ? knownService(route.entry) : null;
    } else if (route.addDomain) {
      if (state.domainEdit?.mode !== 'add') state.domainEdit = domainEditFromEntry('add');
      state.domainSection = domainSectionIds('add')[0];
    } else state.domainEdit = null;
  }
  if (route.tab === 'datastore') {
    state.datastore.entryKey = route.entry ?? null;
    state.datastore.newEntry = !!route.newEntry;
    if (route.collection !== undefined && route.collection !== null) {
      // The collection is not validated here: the page asks the server for its
      // contents and reports a collection it does not have.
      openDatastoreCollection(route.collection);
      const ids = datastoreSectionIds();
      state.datastoreSection = ids.includes(route.section) ? route.section : ids[0];
    } else {
      state.datastore.open = null;
      state.datastoreSection = DATASTORE_DEFAULT_SECTION;
    }
  }
  const canonical = pageHref(route.tab, {
    domain: route.domain ?? null,
    collection: route.collection ?? null,
    addDomain: route.addDomain,
    entry: route.tab === 'domains' ? (state.domainService ?? null) : (route.entry ?? null),
    newEntry: route.newEntry,
    /* The canonical URL names the section that is actually shown: an unknown,
     * missing or stale section resolves to the default and is corrected here,
     * so a reload never lands on a sub-page the state does not have. */
    section: canonicalSection(route),
  });
  // Only canonicalize path aliases/trailing slashes and missing sections,
  // without dropping query strings.
  if (!route.keepPath && location.pathname !== canonical.split('?')[0]) {
    history.replaceState(null, '', canonical.split('?')[0] + location.search + location.hash);
  }
}

/* A service sub-page only exists for a service the server reports. */
function knownService(name) {
  return typeof name === 'string' && (name === 'info' || (state.services || []).includes(name)) ? name : null;
}

function canonicalSection(route) {
  if (route.tab === 'about') return state.aboutSection === 'general' ? null : state.aboutSection;
  if (route.tab === 'help') return state.helpSection === 'start' ? null : state.helpSection;
  if (route.tab === 'settings') {
    return SETTINGS_SECTIONS.includes(state.settingsSection) ? state.settingsSection : SETTINGS_DEFAULT_SECTION;
  }
  if (route.tab === 'domains' && state.domainEdit?.mode === 'edit') {
    const ids = domainSectionIds('edit');
    return ids.includes(state.domainSection) ? state.domainSection : ids[0];
  }
  if (route.tab === 'datastore') {
    // The collection list has no sub-page: only a browsed collection carries
    // one, or the canonical URL would name a collection called "entries".
    if (!state.datastore.open) return null;
    const ids = datastoreSectionIds();
    return ids.includes(state.datastoreSection) ? state.datastoreSection : DATASTORE_DEFAULT_SECTION;
  }
  return null;
}

export function navigate(tab, options = {}) {
  closeDomainMenu();
  hideTooltip();
  const url = pageHref(tab, options);
  if (location.pathname + location.search !== url) {
    history[options.replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  // Also usable by isolated page tests that do not install the router.
  state.tab = tab;
  if (tab === 'about') state.aboutSection = ABOUT_SECTIONS.includes(options.section) ? options.section : 'general';
  if (tab === 'help') state.helpSection = HELP_SECTIONS.includes(options.section) ? options.section : 'start';
  // Like the monolith, sidebar navigation keeps the domain draft in memory;
  // only the explicit Back/crumb actions navigate back without one.
  if (tab === 'domains') {
    if (options.addDomain) {
      if (state.domainEdit?.mode !== 'add') state.domainEdit = domainEditFromEntry('add');
      state.domainSection = domainSectionIds('add')[0];
    } else if (options.domain !== undefined && options.domain !== null) {
      const entry = state.domains.find(d => d.domain === options.domain);
      if (entry && (state.domainEdit?.mode !== 'edit' || state.domainEdit.domain !== options.domain)) state.domainEdit = domainEditFromEntry('edit', entry);
      const ids = domainSectionIds('edit');
      state.domainSection = ids.includes(options.section) ? options.section : ids[0];
    } else state.domainEdit = null;
    state.domainService = state.domainEdit?.mode === 'edit' && state.domainSection === 'services' ? knownService(options.entry) : null;
  }
  if (tab === 'settings') {
    state.settingsSection = SETTINGS_SECTIONS.includes(options.section) ? options.section : SETTINGS_DEFAULT_SECTION;
  }
  if (tab === 'datastore') {
    state.datastore.entryKey = options.entry ?? null;
    state.datastore.newEntry = !!options.newEntry;
    if (options.collection) openDatastoreCollection(options.collection);
    else state.datastore.open = null;
    const ids = datastoreSectionIds();
    state.datastoreSection = ids.includes(options.section) ? options.section : ids[0];
  }
  render();
}

/* Sub-page navigation: stays inside the current context, so the panel is
 * replaced without tearing down the surrounding shell. The caller decides
 * whether the mobile drawer closes; sections are usually reached from it. */
export function navigateSection(section) {
  if (state.tab === 'help') return navigate('help', { section: section === 'start' ? null : section });
  if (state.tab === 'about') return navigate('about', { section: section === 'general' ? null : section });
  if (state.tab === 'settings') return navigate('settings', { section });
  if (state.tab === 'datastore') {
    const open = state.datastore.open;
    if (!open) return navigate('datastore');
    return navigate('datastore', { collection: open.collection, section });
  }
  if (state.tab === 'domains') {
    const draft = state.domainEdit;
    if (!draft) return navigate('domains');
    if (draft.mode === 'add') return navigate('domains', { addDomain: true });
    return navigate('domains', { domain: draft.domain, section });
  }
  return null;
}

// Sidebar navigation retains the current domain draft, as before the split.
// The Domains breadcrumb/Back action explicitly navigates to the domain list.
export function navigateTab(tab) {
  const draft = tab === 'domains' && state.domainEdit;
  navigate(tab, draft ? draft.mode === 'edit' ? { domain: draft.domain } : { addDomain: true } : {});
}

export function installRouter() {
  if (installed) return;
  installed = true;
  window.addEventListener('popstate', () => {
    closeDomainMenu();
    hideTooltip();
    // render() respects login/setup and never exposes the shell while signed out.
    render();
    document.querySelector('.main')?.focus({ preventScroll: true });
  });
}

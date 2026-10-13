import { diagnosisButton } from '../operations.js';
/* CWBridge console: pages/datastore. Local ES module; no runtime dependencies.
 *
 * The operator's view of the stored data. The Datastore service only ever sees
 * one key of one domain at a time; this page lists every collection of the
 * configured database, edits the entries of a collection's datastore document,
 * and exposes the remaining documents (meta, counters, activity) behind them.
 *
 * Entries are written one field at a time, because the bridge may be serving
 * requests while this page is open: replacing a whole document here would drop
 * a key CatWeb wrote a moment ago. */
import { API, UnauthorizedError, api, state } from '../core.js';
import { confirmDialog, copyButton, customSelect, emptyState, fmtMB, h, icon, openDialog, popInText, spinnerRow, toast } from '../ui.js';
import { handleUnauthorized } from '../auth.js';
import { navigate } from '../router.js';
import { renderApp } from '../shell.js';

/* A collection's sub-pages. Both are routable: the sidebar lists exactly these
 * ids and the router keeps the active one in the URL. */
function datastoreSections() {
  return [
    { id: 'entries', label: 'Entries', icon: 'table' },
    { id: 'documents', label: 'Raw documents', icon: 'scroll-text' },
  ];
}

function datastoreSectionIds() {
  return datastoreSections().map(section => section.id);
}

function datastoreSectionLabel(section) {
  const item = datastoreSections().find(entry => entry.id === section);
  return item ? item.label : 'Datastore';
}

function newEntryState() {
  return {
    items: [], keys: 0, bytes: 0, page: 0, perPage: 25, pages: 1, search: '',
    loading: false, loaded: false, error: null, request: 0,
  };
}

function newDocumentState() {
  return { items: [], bytes: 0, loading: false, loaded: false, error: null, request: 0 };
}

function newDatastoreState() {
  return {
    collections: [],
    totals: { collections: 0, keys: 0, bytes: 0 },
    globalLimitMb: null,
    collectionsLoading: false,
    collectionsLoaded: false,
    collectionsError: null,
    open: null,          // The browsed collection; the router sets it from the URL.
    entries: newEntryState(),
    documents: newDocumentState(),
  };
}

/* Switching to another collection starts from a clean section state: a filter
 * or page of the previous collection must never be applied to the next one. */
function openDatastoreCollection(collection) {
  const store = state.datastore;
  if (store.open && store.open.collection === collection) return store.open;
  store.open = { collection, domain: null, meta: null };
  store.entries = newEntryState();
  store.documents = newDocumentState();
  return store.open;
}

function closeDatastoreCollection() {
  // The collection list stays cached: only the browsed collection and its
  // sections are dropped.
  state.datastore.open = null;
  state.datastore.entries = newEntryState();
  state.datastore.documents = newDocumentState();
  navigate('datastore');
}

/* ---- Formatting ---------------------------------------------------------- */
function fmtBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
  if (value >= 1024) return (value / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  return Math.round(value) + ' B';
}

/* A stored value is normally text, but a raw writer may have stored a number,
 * a list or an object; each is shown in its own notation, never coerced. */
function valueText(value, type) {
  if (type === 'string') return value;
  if (type === 'null') return 'null';
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function clampText(text, limit = 400) {
  const value = String(text ?? '');
  return value.length > limit ? value.slice(0, limit) + ' …' : value;
}

/* ---- Loading ------------------------------------------------------------- */
/* A render may start a load, and a load repaints the shell: deferring the start
 * keeps the render that requested it from being replaced while it runs. */
function schedule(loader) {
  Promise.resolve().then(loader);
}

function paintDatastore() {
  if (state.view === 'app' && state.tab === 'datastore') renderApp();
}

/* A response belongs to the section state it was requested for. Switching to
 * another collection replaces both, so a late answer for the previous one must
 * neither paint nor overwrite what is on screen now. */
function isCurrent(entries, collection) {
  return state.datastore.entries === entries && state.datastore.open?.collection === collection;
}

function isCurrentDocuments(documents, collection) {
  return state.datastore.documents === documents && state.datastore.open?.collection === collection;
}

async function loadCollections() {
  const store = state.datastore;
  store.collectionsLoading = true;
  store.collectionsError = null;
  paintDatastore();
  try {
    const data = await api(API.datastoreCollections, { method: 'POST', body: {} });
    store.collections = Array.isArray(data.items) ? data.items : [];
    store.totals = data.totals || { collections: 0, keys: 0, bytes: 0 };
    store.globalLimitMb = data.global_limit_mb ?? null;
    store.collectionsLoaded = true;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    store.collectionsError = err.message;
  } finally {
    store.collectionsLoading = false;
    paintDatastore();
  }
}

async function loadEntries() {
  const store = state.datastore;
  const entries = store.entries;
  const open = store.open;
  if (!open) return;
  const collection = open.collection;
  const stale = () => !isCurrent(entries, collection);
  const request = ++entries.request;
  entries.loading = true;
  entries.error = null;
  paintDatastore();
  try {
    const data = await api(API.datastoreEntries, { method: 'POST', body: {
      collection,
      page: entries.page,
      per_page: entries.perPage,
      search: entries.search,
    } });
    if (request !== entries.request || stale()) return;
    entries.items = Array.isArray(data.items) ? data.items : [];
    entries.keys = data.keys || 0;
    entries.bytes = data.bytes || 0;
    entries.page = data.page || 0;
    entries.pages = data.pages || 1;
    entries.perPage = data.per_page || entries.perPage;
    entries.loaded = true;
    store.open = { ...open, domain: data.domain || null, meta: {
      hasMeta: !!data.has_meta,
      hasDatastore: !!data.has_datastore,
      storageMb: data.storage_mb ?? null,
      services: Array.isArray(data.services) ? data.services : [],
    } };
  } catch (err) {
    if (request !== entries.request || stale()) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    entries.items = [];
    entries.error = err.message;
  } finally {
    if (request === entries.request && !stale()) {
      entries.loading = false;
      paintDatastore();
    }
  }
}

async function loadDocuments() {
  const store = state.datastore;
  const documents = store.documents;
  const open = store.open;
  if (!open) return;
  const collection = open.collection;
  const stale = () => !isCurrentDocuments(documents, collection);
  const request = ++documents.request;
  documents.loading = true;
  documents.error = null;
  paintDatastore();
  try {
    const data = await api(API.datastoreDocuments, { method: 'POST', body: { collection } });
    if (request !== documents.request || stale()) return;
    documents.items = Array.isArray(data.items) ? data.items : [];
    documents.bytes = data.bytes || 0;
    documents.loaded = true;
  } catch (err) {
    if (request !== documents.request || stale()) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    documents.items = [];
    documents.error = err.message;
  } finally {
    if (request === documents.request && !stale()) {
      documents.loading = false;
      paintDatastore();
    }
  }
}

/* Reload whatever the open section shows. The router decides which section is
 * on screen, never this module. */
function reloadSection() {
  if (state.tab === 'datastore' && state.datastore.open) {
    return state.datastoreSection === 'documents' ? loadDocuments() : loadEntries();
  }
  return loadCollections();
}

async function submit(action, body, successMessage) {
  try {
    const result = await api(action, { method: 'POST', body });
    if (successMessage && state.view === 'app') toast(successMessage);
    return result;
  } catch (err) {
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return null; }
    throw err;
  }
}

/* ---- Entry editor -------------------------------------------------------- */
/* One dialog serves create, edit and rename. The value mode decides whether the
 * text is stored as typed or parsed as JSON first, so an entry that holds a
 * number or a list keeps its type. */
function openEntryDialog(options = {}) {
  const collection = state.datastore.open.collection;
  state.datastore.entryDraft = null;
  navigate('datastore', { collection, section: 'entries', entry: options.previousKey ?? null, newEntry: options.previousKey == null });
}

function renderEntryEditor(main, draft) {
  const { key = '', value = '', type = 'string', previousKey = null } = draft;
  const creating = previousKey === null;
  const collection = state.datastore.open.collection;
  let mode = draft.mode || (type === 'string' ? 'text' : 'json');
  let busy = false;
  const back = () => { state.datastore.entryDraft = null; navigate('datastore', { collection, section: 'entries' }); };
  const keyInput = h('input', { class: 'input', id: 'ds-key', autocomplete: 'off', spellcheck: 'false', value: key, 'aria-label': 'Entry key' });
  const valueArea = h('textarea', { class: 'textarea ds-value-input', id: 'ds-value', spellcheck: 'false', 'aria-label': 'Entry value' });
  valueArea.value = draft.raw ?? (mode === 'text' ? String(value ?? '') : valueText(value, type));
  keyInput.addEventListener('input', () => { draft.key = keyInput.value; });
  valueArea.addEventListener('input', () => { draft.raw = valueArea.value; });
  const error = h('p', { class: 'error-text', id: 'ds-entry-error', role: 'alert' });
  const format = customSelect({ value: mode, ariaLabel: 'Value format', floating: true,
    options: [{ value: 'text', label: 'Text' }, { value: 'json', label: 'JSON' }],
    onChange(next) {
      if (busy || mode === next) return;
      const current = valueArea.value;
      if (next === 'json') { try { JSON.parse(current); } catch (_) { valueArea.value = JSON.stringify(current); } }
      else { try { const parsed = JSON.parse(current); if (typeof parsed === 'string') valueArea.value = parsed; } catch (_) {} }
      mode = next; draft.mode = next; draft.raw = valueArea.value; error.textContent = '';
    },
  });
  const saveButton = h('button', { class: 'btn primary', type: 'submit' }, icon('circle-check'), 'Save entry');
  const form = h('form', { class: 'stack datastore-entry-editor' },
    h('div', { class: 'panel' }, h('div', { class: 'panel-body stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { for: 'ds-key', text: 'Key' }), keyInput),
        h('div', { class: 'field' }, h('span', { text: 'Value format' }), format)),
      h('div', { class: 'field' }, h('label', { for: 'ds-value', text: 'Value' }), valueArea,
        h('span', { class: 'hint', text: 'Text is stored as typed. JSON preserves numbers, lists and objects.' })), error)),
    h('div', { class: 'domain-form-actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: back }, 'Cancel'), saveButton));
  form.addEventListener('submit', event => { event.preventDefault(); void save(back); });
  main.append(h('div', { class: 'page-head' }, h('div', { class: 'titles' },
    h('h1', { text: creating ? 'New entry' : previousKey }), h('p', { text: 'Datastore entry in ' + collection })),
    h('button', { class: 'btn ghost', type: 'button', onclick: back }, icon('arrow-left'), 'All entries')), form);
  async function save(close) {
    if (busy) return;
    const nextKey = keyInput.value.trim();
    const raw = valueArea.value;
    error.textContent = '';
    if (!nextKey) { error.textContent = 'A key is required.'; keyInput.focus(); return; }
    if (nextKey === '_id' || nextKey.includes('.') || nextKey.startsWith('$')) {
      error.textContent = 'Keys may not contain ".", start with "$", or be named "_id".';
      keyInput.focus();
      return;
    }
    if (mode === 'json') {
      try { JSON.parse(raw); }
      catch (err) { error.textContent = 'Value is not valid JSON: ' + err.message; valueArea.focus(); return; }
    }
    busy = true; saveButton.disabled = true; format.setDisabled(true);
    try {
      const result = await submit(API.datastoreEntrySet, {
        collection, key: nextKey, value: raw, value_type: mode,
        ...(!creating && previousKey !== nextKey ? { previous_key: previousKey } : {}),
      }, creating ? 'Entry saved' : 'Entry updated');
      if (!result) return;
      state.datastore.entries.loaded = false;
      if (state.view === 'app' && state.datastore.entryDraft === draft) close();
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      error.textContent = err.message;
    } finally {
      busy = false; saveButton.disabled = false; format.setDisabled(false);
    }
  }

  return form;
}

async function deleteEntry(key) {
  const collection = state.datastore.open.collection;
  if (!await confirmDialog({
    title: 'Delete entry',
    message: 'Delete "' + key + '" from this datastore? This cannot be undone.',
    confirmLabel: 'Delete entry', destructive: true,
  })) return;
  try {
    const result = await submit(API.datastoreEntryDelete, { collection, key }, 'Entry deleted');
    if (!result) return;
    await reloadSection();
  } catch (err) {
    if (err instanceof UnauthorizedError) return;
    toast(err.message, 'err');
  }
}

/* ---- Raw document editor ------------------------------------------------- */
async function openDocumentDialog(documentId = null) {
  const collection = state.datastore.open.collection;
  const creating = documentId === null;
  let document = { };
  if (!creating) {
    try {
      const data = await api(API.datastoreDocument, { method: 'POST', body: { collection, document_id: documentId } });
      document = data.document || { _id: documentId };
    } catch (err) {
      if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
      toast(err.message, 'err');
      return;
    }
  }

  const idInput = h('input', { class: 'input', id: 'ds-doc-id', autocomplete: 'off', spellcheck: 'false', value: creating ? '' : documentId });
  idInput.setAttribute('aria-label', 'Document id');
  if (!creating) idInput.disabled = true;
  const area = h('textarea', { class: 'textarea ds-json-input', id: 'ds-doc-json', spellcheck: 'false' });
  area.setAttribute('aria-label', 'Document JSON');
  area.value = JSON.stringify(document, null, 2);
  const error = h('p', { class: 'error-text', id: 'ds-doc-error', role: 'alert' });
  let busy = false;

  openDialog({
    title: creating ? 'New document' : 'Edit document',
    iconName: 'scroll-text',
    buildBody(body) {
      body.append(h('p', { text: 'Raw documents are the bridge\u2019s own records: "datastore" holds the entries, "meta" describes the domain and its limits, and the service counters sit beside them.' }));
      body.append(h('div', { class: 'field' }, h('label', { for: 'ds-doc-id', text: 'Document id' }), idInput,
        h('span', { class: 'hint', text: creating ? 'The id identifies the document. "datastore" and "meta" are the ones the bridge reads.' : 'The id cannot be changed.' })));
      body.append(h('div', { class: 'field' }, h('label', { for: 'ds-doc-json', text: 'Document JSON' }), area,
        h('span', { class: 'hint', text: 'A JSON object. Fields missing here are removed from the document. Raw documents are limited to 32 KB — use the entries editor for a larger datastore.' })));
      body.append(error);
    },
    actions: [
      { label: 'Cancel' },
      { label: 'Save document', kind: 'primary', icon: 'circle-check', onClick: close => { void save(close); } },
    ],
  });

  async function save(close) {
    if (busy) return;
    const id = (creating ? idInput.value.trim() : documentId) || '';
    error.textContent = '';
    if (!id) { error.textContent = 'A document id is required.'; idInput.focus(); return; }
    let parsed;
    try {
      parsed = JSON.parse(area.value);
    } catch (err) {
      error.textContent = 'Document is not valid JSON: ' + err.message;
      area.focus();
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      error.textContent = 'A document must be a JSON object.';
      area.focus();
      return;
    }
    busy = true;
    try {
      const result = await submit(API.datastoreDocumentSet, { collection, document_id: id, document: parsed },
        creating ? 'Document created' : 'Document saved');
      if (!result) return;
      close();
      await reloadSection();
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      error.textContent = err.message;
    } finally {
      busy = false;
    }
  }
}

async function deleteDocument(item) {
  const collection = state.datastore.open.collection;
  const entries = item.id === 'datastore' && item.keys > 0 ? ' It also deletes all ' + item.keys + ' stored entries.' : '';
  if (!await confirmDialog({
    title: 'Delete document',
    message: 'Permanently delete the document "' + item.id + '" from ' + collection + '?' + entries
      + ' The bridge reads these records directly, so removing one can break this collection.',
    confirmLabel: 'Delete document', destructive: true, requireText: item.id,
  })) return;
  try {
    const result = await submit(API.datastoreDocumentDelete,
      { collection, document_id: item.id, confirmation: item.id }, 'Document deleted');
    if (!result) return;
    await reloadSection();
  } catch (err) {
    if (err instanceof UnauthorizedError) return;
    toast(err.message, 'err');
  }
}

/* ---- Buttons ------------------------------------------------------------- */
function newEntryButton(id, kind = '') {
  const button = h('button', { class: 'btn' + (kind ? ' ' + kind : ''), id }, icon('plus'), h('span', { text: 'New entry' }));
  button.addEventListener('click', () => openEntryDialog());
  return button;
}

function newDocumentButton(id, kind = '') {
  const button = h('button', { class: 'btn' + (kind ? ' ' + kind : ''), id }, icon('plus'), h('span', { text: 'New document' }));
  button.addEventListener('click', () => openDocumentDialog());
  return button;
}

/* ---- Collection list ----------------------------------------------------- */
function collectionRow(item) {
  const label = item.domain || item.collection;
  const tr = h('tr');
  tr.append(
    h('td', { class: 'cell-domain' }, h('span', { text: item.collection }),
      item.internal ? h('span', { class: 'tag more ds-tag', text: 'Internal' }) : null),
    h('td', { class: 'cell-muted', text: item.domain ? 'Registered domain' : 'Bridge bookkeeping' }),
    h('td', { class: 'cell-num', text: item.has_datastore ? String(item.keys) : '—' }),
    h('td', { class: 'cell-num', text: fmtBytes(item.accounted_bytes ?? item.bytes) }),
    h('td', { class: 'cell-num', text: item.storage_mb ? fmtMB(item.storage_mb) : '—' }),
    h('td', { class: 'cell-actions' }),
  );
  const open = h('button', { class: 'btn ghost sm', 'data-ds-open': item.collection, 'aria-label': 'Browse stored data of ' + label },
    icon('arrow-right'), h('span', { text: 'Browse' }));
  open.addEventListener('click', () => navigate('datastore', { collection: item.collection }));
  tr.lastChild.append(open);
  return tr;
}

function renderDatastoreTab(main) {
  const store = state.datastore;
  const loading = store.collectionsLoading;
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: 'Datastore' }),
      h('p', { text: 'Every stored collection with the data the bridge holds. Open one to read, edit and delete its entries and documents.' })),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn', id: 'ds-refresh', 'aria-busy': String(loading), disabled: loading, onclick: loadCollections }, icon('refresh-cw'), 'Refresh')));

  const metrics = h('dl', { class: 'ds-metrics', id: 'ds-totals' },
    h('div', {}, h('dt', { text: 'Collections' }), h('dd', null, popInText(String(store.totals.collections || 0)))),
    h('div', {}, h('dt', { text: 'Stored entries' }), h('dd', null, popInText(String(store.totals.keys || 0)))),
    h('div', {}, h('dt', { text: 'Stored volume' }), h('dd', null, popInText(fmtBytes(store.totals.accounted_bytes ?? store.totals.bytes ?? 0)))),
    h('div', {}, h('dt', { text: 'Global limit' }), h('dd', null, popInText(store.globalLimitMb ? fmtMB(store.globalLimitMb) : 'Unlimited'))));

  const panel = h('div', { class: 'panel' });
  const pHead = h('div', { class: 'panel-head' },
    h('h3', { text: 'Stored collections' }),
    h('span', { class: 'grow' }),
    loading ? h('span', { class: 'panel-note', text: 'Loading …' })
      : h('span', { class: 'panel-note' }, popInText((store.totals.collections || 0) + ' collections')),
    store.collectionsError ? h('span', { class: 'error-text', text: store.collectionsError }) : null);
  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(loading) });

  if (loading && !store.collectionsLoaded) {
    body.append(h('div', { class: 'panel-body', role: 'status' }, spinnerRow()));
  } else if (store.collectionsError && !store.collectionsLoaded) {
    body.append(emptyState('circle-alert', 'Stored data is unavailable', store.collectionsError, [
      diagnosisButton(true, 'Test storage connection'),
      h('button', { class: 'btn', onclick: loadCollections }, icon('refresh-cw'), 'Try again'),
    ]));
  } else if (!store.collections.length) {
    body.append(emptyState('hard-drive', 'Nothing stored yet', 'A domain writes its first entry through the Datastore service. Register a domain, start the bridge and store a value to see it here.'));
  } else {
    const wrap = h('div', { class: 'table-wrap' });
    const table = h('table', { 'aria-label': 'Stored collections', id: 'ds-collections' });
    table.append(h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Collection' }),
      h('th', { scope: 'col', text: 'Kind' }),
      h('th', { scope: 'col', text: 'Entries' }),
      h('th', { scope: 'col', text: 'Size' }),
      h('th', { scope: 'col', text: 'Limit' }),
      h('th', { scope: 'col', text: '' }))));
    const tbody = h('tbody');
    for (const item of store.collections) tbody.append(collectionRow(item));
    table.append(tbody);
    wrap.append(table);
    body.append(wrap);
  }
  panel.append(pHead, body);
  main.append(head, metrics,
    h('p', { class: 'hint', text: 'Sizes are the stored bytes a collection accounts for: its datastore document and its GenAI chat history, which share one limit. Writes are rejected once a domain reaches its limit or the global cap is used up.' }),
    panel);

  if (!store.collectionsLoaded && !loading) schedule(loadCollections);
}

/* ---- Entries section ----------------------------------------------------- */
function entryRow(item) {
  const text = valueText(item.value, item.type);
  const tr = h('tr');
  tr.append(
    h('td', { class: 'cell-domain ds-key' }, h('div', { class: 'cell-copy' }, h('span', { class: 'cell-copy-text', text: item.key }), copyButton(() => item.key, 'Copy key'))),
    h('td', {}, h('span', { class: 'tag', text: item.type })),
    h('td', { class: 'ds-value', 'data-tooltip': clampText(text), text: text }),
    h('td', { class: 'cell-num', text: fmtBytes(item.bytes) }),
    h('td', { class: 'cell-actions' }),
  );
  const edit = h('button', { class: 'btn ghost sm', 'data-ds-entry-edit': item.key, 'aria-label': 'Edit entry ' + item.key },
    icon('pencil'), h('span', { text: 'Edit' }));
  edit.addEventListener('click', () => openEntryDialog({ key: item.key, value: item.value, type: item.type, previousKey: item.key }));
  const remove = h('button', { class: 'btn ghost sm danger', 'data-ds-entry-delete': item.key, 'aria-label': 'Delete entry ' + item.key },
    icon('trash-2'), h('span', { text: 'Delete' }));
  remove.addEventListener('click', () => deleteEntry(item.key));
  tr.lastChild.append(edit, remove);
  return tr;
}

function entrySummary(entries, meta) {
  const parts = [entries.keys + (entries.keys === 1 ? ' entry' : ' entries'), fmtBytes(entries.bytes)];
  if (meta && meta.storageMb) parts.push('of ' + fmtMB(meta.storageMb) + ' allowed');
  return parts.join(' · ');
}

function entriesPanel() {
  const store = state.datastore;
  const entries = store.entries;
  const meta = store.open.meta || {};
  const panel = h('div', { class: 'panel' });
  const pHead = h('div', { class: 'panel-head' },
    h('h3', { text: 'Stored entries' }),
    h('span', { class: 'grow' }),
    h('span', { class: 'panel-note', id: 'ds-entries-meta', text: entries.loading ? 'Loading …' : entrySummary(entries, meta) }));
  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(entries.loading) });

  if (entries.loading && !entries.items.length) {
    body.append(h('div', { class: 'panel-body', role: 'status' }, spinnerRow()));
  } else if (entries.error) {
    body.append(emptyState('circle-alert', 'Entries are unavailable', entries.error, [
      diagnosisButton(true, 'Test storage connection'),
      h('button', { class: 'btn', onclick: loadEntries }, icon('refresh-cw'), 'Try again'),
    ]));
  } else if (!entries.items.length) {
    body.append(entries.search
      ? emptyState('table', 'No matching entries', 'No key contains "' + entries.search + '".', [
        h('button', { class: 'btn', onclick: () => { entries.search = ''; entries.page = 0; loadEntries(); } }, icon('x'), 'Clear search'),
      ])
      : emptyState('table', meta.hasDatastore ? 'No entries yet' : 'No datastore yet',
        meta.hasDatastore
          ? 'This datastore is empty. Add the first entry, or let CatWeb store one.'
          : 'Nothing is stored for this collection yet. The first entry creates the datastore.',
        [newEntryButton('ds-entry-empty')]));
  } else {
    const wrap = h('div', { class: 'table-wrap' });
    const table = h('table', { 'aria-label': 'Datastore entries', id: 'ds-entries' });
    table.append(h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Key' }),
      h('th', { scope: 'col', text: 'Type' }),
      h('th', { scope: 'col', text: 'Value' }),
      h('th', { scope: 'col', text: 'Size' }),
      h('th', { scope: 'col', text: '' }))));
    const tbody = h('tbody');
    for (const item of entries.items) tbody.append(entryRow(item));
    table.append(tbody);
    wrap.append(table);
    body.append(wrap);
  }
  panel.append(pHead, body);
  return panel;
}

function entriesToolbar() {
  const entries = state.datastore.entries;
  const loading = entries.loading;
  const search = h('input', { class: 'input', id: 'ds-search', type: 'search', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Filter keys', value: entries.search, disabled: loading });
  search.setAttribute('aria-label', 'Filter keys');
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      // The toolbar may have been replaced by another collection in the
      // meantime; a late keystroke must not filter the new one.
      if (state.datastore.entries !== entries) return;
      entries.search = search.value.trim();
      entries.page = 0;
      loadEntries();
    }, 300);
  });

  const perPage = customSelect({
    value: String(entries.perPage),
    options: [25, 50, 100].map(size => ({ value: String(size), label: size + ' per page' })),
    ariaLabel: 'Entries per page',
    onChange(value) { entries.perPage = Number(value); entries.page = 0; loadEntries(); },
  });
  perPage.querySelector('button').id = 'ds-perpage';
  perPage.setDisabled(loading);

  const previous = h('button', { class: 'btn sm', id: 'ds-prev', disabled: loading || entries.page <= 0, text: 'Previous' });
  previous.addEventListener('click', () => { entries.page = Math.max(0, entries.page - 1); loadEntries(); });
  const next = h('button', { class: 'btn sm', id: 'ds-next', disabled: loading || entries.page >= entries.pages - 1, text: 'Next' });
  next.addEventListener('click', () => { entries.page += 1; loadEntries(); });

  return h('div', { class: 'ds-toolbar' },
    h('div', { class: 'field ds-search-field' }, h('label', { for: 'ds-search', text: 'Search' }), search),
    h('div', { class: 'ds-toolbar-actions' },
      h('div', { class: 'field ds-perpage-field' }, h('label', { for: 'ds-perpage', text: 'Page size' }), perPage),
      h('div', { class: 'row' }, previous, next,
        h('span', { class: 'panel-note', id: 'ds-page', text: 'Page ' + (entries.page + 1) + ' of ' + Math.max(1, entries.pages) }))));
}

/* ---- Documents section --------------------------------------------------- */
function documentKindTag(id) {
  if (id === 'datastore') return h('span', { class: 'tag ds-tag', text: 'Entries' });
  if (id === 'meta') return h('span', { class: 'tag more ds-tag', text: 'Domain' });
  return null;
}

function documentRow(item) {
  const tr = h('tr');
  tr.append(
    h('td', { class: 'cell-domain' }, h('span', { text: item.id }), documentKindTag(item.id)),
    h('td', { class: 'cell-num', text: String(item.keys) }),
    h('td', { class: 'cell-num', text: fmtBytes(item.bytes) }),
    h('td', { class: 'cell-actions' }),
  );
  const edit = h('button', { class: 'btn ghost sm', 'data-ds-doc-edit': item.id, 'aria-label': 'Edit document ' + item.id },
    icon('pencil'), h('span', { text: 'Edit' }));
  edit.addEventListener('click', () => openDocumentDialog(item.id));
  const remove = h('button', { class: 'btn ghost sm danger', 'data-ds-doc-delete': item.id, 'aria-label': 'Delete document ' + item.id },
    icon('trash-2'), h('span', { text: 'Delete' }));
  remove.addEventListener('click', () => deleteDocument(item));
  tr.lastChild.append(edit, remove);
  return tr;
}

function documentsPanel() {
  const documents = state.datastore.documents;
  const loading = documents.loading;
  const panel = h('div', { class: 'panel' });
  const pHead = h('div', { class: 'panel-head' },
    h('h3', { text: 'Stored documents' }),
    h('span', { class: 'grow' }),
    h('span', { class: 'panel-note', id: 'ds-documents-meta',
      text: loading ? 'Loading …' : documents.items.length + (documents.items.length === 1 ? ' document' : ' documents') + ' · ' + fmtBytes(documents.bytes) }));
  const body = h('div', { class: 'panel-body flush', 'aria-busy': String(loading) });

  if (loading && !documents.items.length) {
    body.append(h('div', { class: 'panel-body', role: 'status' }, spinnerRow()));
  } else if (documents.error) {
    body.append(emptyState('circle-alert', 'Documents are unavailable', documents.error, [
      diagnosisButton(true, 'Test storage connection'),
      h('button', { class: 'btn', onclick: loadDocuments }, icon('refresh-cw'), 'Try again'),
    ]));
  } else if (!documents.items.length) {
    body.append(emptyState('scroll-text', 'No documents', 'This collection holds no document yet.', [newDocumentButton('ds-doc-empty')]));
  } else {
    const wrap = h('div', { class: 'table-wrap' });
    const table = h('table', { 'aria-label': 'Collection documents', id: 'ds-documents' });
    table.append(h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Document' }),
      h('th', { scope: 'col', text: 'Fields' }),
      h('th', { scope: 'col', text: 'Size' }),
      h('th', { scope: 'col', text: '' }))));
    const tbody = h('tbody');
    for (const item of documents.items) tbody.append(documentRow(item));
    table.append(tbody);
    wrap.append(table);
    body.append(wrap);
  }
  panel.append(pHead, body);
  return panel;
}

/* ---- Section page -------------------------------------------------------- */
function renderDatastoreCollectionPage(main, section) {
  const currentStore = state.datastore;
  if (section === 'entries' && (currentStore.entryKey !== null && currentStore.entryKey !== undefined || currentStore.newEntry)) {
    const collection = currentStore.open.collection;
    const routeKey = currentStore.newEntry ? null : currentStore.entryKey;
    const identity = JSON.stringify([collection, routeKey]);
    if (currentStore.entryDraft?.identity !== identity) {
      currentStore.entryDraft = { identity, previousKey: routeKey, loading: routeKey !== null, key: '', value: '', type: 'string' };
      if (routeKey !== null) {
        const draft = currentStore.entryDraft;
        api('api/datastore/entry', { method: 'POST', body: { collection, key: routeKey } }).then(item => {
          if (state.datastore !== currentStore || currentStore.entryDraft !== draft) return;
          Object.assign(draft, item, { loading: false }); paintDatastore();
        }).catch(error => {
          if (state.datastore !== currentStore || currentStore.entryDraft !== draft || error instanceof UnauthorizedError) return;
          draft.loading = false; draft.error = error.message; paintDatastore();
        });
      }
    }
    const draft = currentStore.entryDraft;
    if (draft.loading) { main.append(spinnerRow('Loading entry …')); return; }
    if (draft.error) {
      main.append(emptyState('circle-alert', 'Entry could not be loaded', draft.error, [h('button', { class: 'btn', onclick: () => { currentStore.entryDraft = null; paintDatastore(); } }, 'Retry'),
        h('button', { class: 'btn', onclick: () => navigate('datastore', { collection, section: 'entries' }) }, 'All entries')])); return;
    }
    renderEntryEditor(main, draft); return;
  }

  const store = state.datastore;
  const open = store.open;
  const label = open.domain || open.collection;
  const isDocuments = section === 'documents';
  const loading = isDocuments ? store.documents.loading : store.entries.loading;

  const head = h('div', { class: 'page-head' },
    h('div', { class: 'titles' },
      h('h1', { text: datastoreSectionLabel(section) }),
      h('p', { text: isDocuments
        ? 'The documents stored for ' + label + '. Editing them changes what the bridge reads.'
        : 'Keys stored for ' + label + '. CatWeb reads and writes them through the Datastore service.' })),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn', id: 'ds-section-refresh', 'aria-busy': String(loading), disabled: loading, onclick: reloadSection }, icon('refresh-cw'), 'Refresh'),
      isDocuments ? newDocumentButton('ds-doc-new', 'primary') : newEntryButton('ds-entry-new', 'primary')));

  if (isDocuments) {
    main.append(head,
      h('div', { class: 'callout warn' }, icon('circle-alert'),
        h('div', {}, h('strong', { text: 'These records belong to the bridge.' }),
          h('p', { class: 'hint', text: '"datastore" holds the entries, "meta" describes the domain with its limits and owners, and the service counters sit beside them. Removing or reshaping them can make this collection unusable; a removed "meta" record is recreated from the console settings, without its limits and owners.' }))),
      documentsPanel());
    if (!store.documents.loaded && !loading) schedule(loadDocuments);
    return;
  }

  main.append(head, entriesToolbar(),
    h('p', { class: 'hint', text: state.status && state.status.running
      ? 'The bridge is running: a CatWeb request can change an entry while this page is open. Refresh before editing something you did not create.'
      : 'The bridge is stopped, so nothing writes to this datastore besides this page.' }),
    entriesPanel());
  if (!store.entries.loaded && !loading) schedule(loadEntries);
}

export { closeDatastoreCollection, datastoreSectionIds, datastoreSectionLabel, datastoreSections,
  newDatastoreState, openDatastoreCollection, renderDatastoreCollectionPage, renderDatastoreTab };

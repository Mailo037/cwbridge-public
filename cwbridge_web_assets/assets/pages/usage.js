/* CWBridge console: pages/usage. Local ES module; no runtime dependencies. */
import { API, UnauthorizedError, api, state } from '../core.js';
import { customSelect, h, icon, popInText, spinner } from '../ui.js';
import { handleUnauthorized } from '../auth.js';

/* ---- Usage: all-time ledger with a bounded UTC daily window ---------- */
function newUsageState() {
  return { domain: null, service: null, days: 30, data: null, domains: [], services: [], loading: false, error: null, initialized: false, request: 0 };
}

async function fetchUsage() {
  const usage = state.usage;
  const request = ++usage.request;
  const body = { domain: usage.domain, service: usage.service, days: usage.days };
  usage.initialized = true;
  usage.loading = true;
  usage.error = null;
  usage.data = null; // Never label old totals with a newly selected filter.
  updateUsageView();
  try {
    const data = await api(API.usage, { method: 'POST', body });
    if (state.usage !== usage || request !== usage.request) return;
    usage.data = data;
    // These are global options supplied by the ledger, not registered domains.
    usage.domains = Array.isArray(data.domains) ? data.domains : [];
    usage.services = Array.isArray(data.services) ? data.services : [];
  } catch (err) {
    if (state.usage !== usage || request !== usage.request) return;
    if (err instanceof UnauthorizedError) { handleUnauthorized(); return; }
    usage.error = err.message;
  } finally {
    if (state.usage === usage && request === usage.request) {
      usage.loading = false;
      updateUsageView();
    }
  }
}

function renderUsageTab(main) {
  main.classList.add('usage-page');
  main.append(h('div', { class: 'page-head' },
    h('div', { class: 'titles' }, h('h1', { text: 'Usage' }),
      h('p', { text: 'Request outcomes across your bridge, including removed domains.' })),
    h('button', { class: 'btn', id: 'usage-refresh', 'aria-busy': String(state.usage.loading), 'aria-label': 'Refresh usage', onclick: () => fetchUsage() }, icon('refresh-cw'), 'Refresh')),
  h('div', { id: 'usage-filters', class: 'usage-filters' }),
  h('div', { id: 'usage-results', class: 'usage-results', 'aria-busy': String(state.usage.loading) }));
  renderUsageFilters(main.querySelector('#usage-filters'));
  renderUsageResults(main.querySelector('#usage-results'));
  main.querySelector('#usage-refresh').disabled = state.usage.loading;
  if (!state.usage.initialized) queueMicrotask(() => {
    if (state.view === 'app' && state.tab === 'usage' && !state.usage.initialized) fetchUsage();
  });
}

function renderUsageFilters(container) {
  const usage = state.usage;
  const signature = JSON.stringify([usage.domains, usage.services]);
  if (container.dataset.options === signature) return;
  const focusId = document.activeElement?.id;
  container.dataset.options = signature;
  container.replaceChildren();
  const options = (items, selected, label) => [{ value: null, label },
    ...[...new Set([...items, ...(selected === null ? [] : [selected])])].sort().map(value => ({ value, label: value }))];
  for (const [key, label, values] of [
    ['domain', 'Domain', options(usage.domains, usage.domain, 'All domains')],
    ['service', 'Service', options(usage.services, usage.service, 'All services')],
    ['days', 'Daily period', [7, 30, 90, 365].map(value => ({ value, label: 'Last ' + value + ' days' }))],
  ]) {
    const id = 'usage-' + key;
    const select = customSelect({ value: usage[key], options: values, ariaLabel: 'Usage ' + label.toLowerCase() + ' filter',
      onChange(value) { usage[key] = value; fetchUsage(); } });
    select.querySelector('button').id = id;
    container.append(h('div', { class: 'field' }, h('label', { for: id, text: label }), select));
  }
  if (focusId && container.querySelector('#' + focusId)) container.querySelector('#' + focusId).focus();
}

function updateUsageView() {
  if (state.view !== 'app' || state.tab !== 'usage') return;
  const results = document.getElementById('usage-results');
  if (!results) return;
  renderUsageFilters(document.getElementById('usage-filters'));
  document.getElementById('usage-refresh').disabled = state.usage.loading;
  document.getElementById('usage-refresh').setAttribute('aria-busy', String(state.usage.loading));
  renderUsageResults(results);
}

function usageNumber(value) {
  return (Number.isFinite(value) && value >= 0 ? value : 0).toLocaleString('en-US');
}

function usageTable(rows, key, label) {
  return h('div', { class: 'table-wrap usage-table', tabindex: '0', role: 'region', 'aria-label': label },
    h('table', {}, h('caption', { text: label }),
      h('thead', {}, h('tr', {}, [key === 'day' ? 'Day (UTC)' : key === 'domain' ? 'Domain' : 'Service', 'Total', 'Succeeded', 'Failed']
        .map(text => h('th', { scope: 'col', text })))),
      h('tbody', {}, rows.map(row => h('tr', {}, h('th', { scope: 'row', text: row[key] }),
        ...['total', 'succeeded', 'failed'].map(field => h('td', { class: 'cell-num', text: usageNumber(row[field]) })))))));
}

function usageGraph(series) {
  const svgEl = (tag, attrs, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const graph = svgEl('svg', { class: 'usage-chart', viewBox: '0 0 760 230', role: 'img', 'aria-labelledby': 'usage-chart-title usage-chart-description' });
  graph.append(svgEl('title', { id: 'usage-chart-title' }, 'Daily succeeded and failed requests (UTC)'),
    svgEl('desc', { id: 'usage-chart-description' }, 'Stacked bars: succeeded below, failed above. Exact daily counts are in the Daily data table below.'));
  const max = Math.max(1, ...series.map(row => row.succeeded + row.failed));
  const left = 62, width = 684, baseline = 197, height = 170;
  for (const fraction of [0, 0.5, 1]) {
    const y = baseline - height * fraction;
    graph.append(svgEl('line', { x1: left, x2: left + width, y1: y, y2: y, class: 'usage-gridline' }),
      svgEl('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'usage-axis' }, Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(max * fraction)));
  }
  const step = width / series.length;
  series.forEach((row, index) => {
    const x = left + index * step + step * 0.12;
    const succeeded = row.succeeded / max * height;
    const failed = row.failed / max * height;
    const group = svgEl('g');
    group.append(svgEl('title', {}, `${row.day} UTC: ${usageNumber(row.total)} total, ${usageNumber(row.succeeded)} succeeded, ${usageNumber(row.failed)} failed`),
      svgEl('rect', { x, y: baseline - succeeded, width: step * 0.76, height: succeeded, class: 'usage-bar-success' }),
      svgEl('rect', { x, y: baseline - succeeded - failed, width: step * 0.76, height: failed, class: 'usage-bar-failure' }));
    graph.append(group);
  });
  graph.append(svgEl('text', { x: left, y: 222, class: 'usage-axis' }, series[0].day),
    svgEl('text', { x: left + width, y: 222, 'text-anchor': 'end', class: 'usage-axis' }, series[series.length - 1].day));
  return graph;
}

function renderUsageResults(results) {
  const usage = state.usage;
  results.replaceChildren();
  results.setAttribute('aria-busy', String(usage.loading));
  if (usage.loading || !usage.initialized) {
    results.append(h('div', { class: 'usage-message', role: 'status' }, spinner(), 'Loading usage…'));
    return;
  }
  if (usage.error) {
    results.append(h('div', { class: 'callout', role: 'alert' }, icon('circle-alert'),
      h('div', {}, h('strong', { text: 'Usage could not be loaded' }), h('p', { text: usage.error }), h('span', { text: 'Choose Refresh to try again.' }))));
    return;
  }
  const data = usage.data;
  if (!data) return;
  const since = data.tracking_since && !Number.isNaN(Date.parse(data.tracking_since))
    ? new Date(data.tracking_since).toISOString().replace('T', ' ').replace('.000Z', 'Z').replace('Z', ' UTC') : null;
  results.append(h('p', { class: 'usage-tracking', text: since
    ? 'Tracked since ' + since + '; no historical backfill.'
    : 'Tracked since: not started; no historical backfill.' }),
    h('p', { class: 'usage-scope', text: `${usage.domain || 'All domains'} / ${usage.service || 'All services'} · Cards and breakdowns are all-time, not limited by the daily period.` }));
  const totals = data.totals || {};
  results.append(h('div', { class: 'usage-totals', 'aria-label': 'All-time request totals' },
    ...[['total', 'Total requests'], ['succeeded', 'Succeeded'], ['failed', 'Failed']].map(([key, label]) =>
      h('div', { class: 'usage-stat ' + key }, h('span', { class: 'usage-stat-label', text: label }),
        h('strong', { id: 'usage-total-' + key }, popInText(usageNumber(totals[key]))), h('span', { class: 'usage-stat-period', text: 'All-time' })))));
  if (!totals.total) results.append(h('div', { class: 'usage-message', role: 'status' },
    h('div', {}, h('h2', { text: 'No usage recorded' }), h('p', { text: 'No tracked requests match these filters. Try all domains and services, or return after a request completes.' }))));
  const series = Array.isArray(data.series) ? data.series : [];
  const chart = h('section', { class: 'panel usage-daily', 'aria-labelledby': 'usage-daily-title' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'usage-daily-title', text: 'Daily requests' }),
      h('span', { class: 'panel-note', text: 'Last ' + usage.days + ' days · UTC' })),
    h('div', { class: 'usage-legend' }, h('span', { class: 'succeeded', text: 'Succeeded · lower bar' }), h('span', { class: 'failed', text: 'Failed · upper bar' })));
  if (series.length) {
    chart.append(usageGraph(series), h('p', { class: 'usage-range', text: series[0].day + ' — ' + series[series.length - 1].day + ' (UTC). Daily counts only; totals above cover all tracked time.' }));
    if (!series.some(row => row.total > 0)) chart.append(h('p', { class: 'usage-range', role: 'status', text: 'No requests in this daily range.' }));
    chart.append(h('details', { class: 'usage-data' }, h('summary', { text: 'Daily data table' }), usageTable(series, 'day', 'Daily request counts (UTC)')));
  } else chart.append(h('p', { class: 'usage-range', role: 'status', text: 'No daily data in this UTC range. All-time totals may include earlier requests.' }));
  results.append(chart);
  for (const [key, label] of [['service', 'By service'], ['domain', 'By domain']]) {
    const rows = Array.isArray(data['by_' + key]) ? data['by_' + key] : [];
    results.append(h('section', { class: 'panel usage-breakdown', 'aria-label': label + ' · all-time' },
      h('div', { class: 'panel-head' }, h('h2', { text: label }), h('span', { class: 'panel-note', text: 'All-time · current filters' })),
      rows.length ? usageTable(rows, key, label + ' — all-time request counts') : h('p', { class: 'usage-range', text: 'No tracked requests for these filters.' })));
  }
}

export { newUsageState, renderUsageTab };

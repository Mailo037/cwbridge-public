/* Beginner guide and reference for the local CatWeb <-> CWBridge connection. */
import { h, icon } from '../ui.js';
import { navigate } from '../router.js';

export const HELP_PAGES = [
  { id: 'start', label: 'Get started', icon: 'play' },
  { id: 'flow', label: 'How it works', icon: 'arrow-right' },
  { id: 'services', label: 'Services', icon: 'list' },
  { id: 'requests', label: 'Request reference', icon: 'terminal' },
  { id: 'updates', label: 'Updates & startup', icon: 'refresh-cw' },
  { id: 'problems', label: 'Troubleshooting', icon: 'stethoscope' },
];

function link(label, tab, options = {}) {
  return h('button', { class: 'btn ghost sm', type: 'button', onclick: () => navigate(tab, options) }, icon('arrow-right'), label);
}

function panel(title, ...content) {
  return h('section', { class: 'panel help-panel' },
    h('div', { class: 'panel-head' }, h('h3', { text: title })),
    h('div', { class: 'panel-body stack' }, ...content));
}

function step(number, title, detail) {
  return h('li', { class: 'help-step' }, h('span', { class: 'help-step-number', 'aria-hidden': 'true', text: number }),
    h('div', {}, h('strong', { text: title }), h('p', { text: detail })));
}

function code(text) {
  return h('code', { text });
}

/* A compact reference table; rows are [first cell, ...cells]. */
function table(headings, rows) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, headings.map(text => h('th', { scope: 'col', text })))),
    h('tbody', {}, rows.map(cells => h('tr', {}, cells.map((cell, index) =>
      h(index ? 'td' : 'th', index ? {} : { scope: 'row' }, typeof cell === 'string' ? cell : cell)))))));
}

function flowGraphic() {
  const nodes = [
    ['1', 'CatWeb in Roblox', 'A domain tab sends a request'],
    ['2', 'CWBridge on your PC', 'Reads, checks and runs the service'],
    ['3', 'Service or datastore', 'Produces a result'],
    ['4', 'CatWeb in Roblox', 'Receives the answer'],
  ];
  return h('figure', { class: 'help-flow', role: 'img', 'aria-label': 'Request path: CatWeb in Roblox sends a request to local CWBridge. The bridge runs a service or reads the datastore, then delivers the result back to CatWeb.' },
    h('div', { class: 'help-flow-track', 'aria-hidden': 'true' }, nodes.map(([number, title, detail], index) => [
      h('div', { class: 'help-flow-node' }, h('span', { class: 'help-flow-number', text: number }),
        h('strong', { text: title }), h('small', { text: detail })),
      index < nodes.length - 1 ? h('span', { class: 'help-flow-arrow', text: '→' }) : null,
    ])),
    h('figcaption', { class: 'hint', text: 'The web console manages the bridge. CatWeb requests travel through the local Roblox client, not through this browser page.' }));
}

function startPage() {
  return [
    panel('The short version',
      h('p', { text: 'CWBridge is a local helper for CatWeb. It watches your CatWeb domain tabs in the Roblox Player, handles allowed service requests, and sends answers back to the same tab. Everything runs on this Windows PC: there is no CWBridge server or account.' }),
      flowGraphic()),
    panel('First request checklist',
      h('ol', { class: 'help-steps' },
        step('1', 'Add a domain', 'Use the exact domain name of the CatWeb tab and choose which services it may use.'),
        step('2', 'Enable a service', 'Choose the services you want in Settings. Some services also need a provider, API key or other settings.'),
        step('3', 'Start the bridge', 'Open CatWeb in Roblox and start CWBridge from Overview. Wait until the console reports that CatWeb is ready; the bridge then opens one tab per domain.'),
        step('4', 'Ask from CatWeb', 'Make a request in that domain tab. CWBridge handles it and returns the result there.')),
      h('div', { class: 'page-actions' }, link('Open Domains', 'domains'), link('Open Services', 'settings', { section: 'services' }), link('Open Overview', 'overview'))),
    panel('Make it hands-off',
      h('p', { text: 'Under About → Startup you can start the bridge when you sign in to Windows and let it open CatWeb in Roblox for you. With About → Updates → Automatic updates on, new releases install themselves and the bridge comes back on the new version.' }),
      h('div', { class: 'page-actions' }, link('Read: Updates & startup', 'help', { section: 'updates' }), link('Open About', 'about'))),
  ];
}

function flowPage() {
  return [
    panel('One request, one answer', flowGraphic(),
      h('p', { text: 'The domain selects the CatWeb tab. Each request also names a service and carries a body. CWBridge checks that the domain exists, the service is enabled and allowed for that domain, and any limits permit the request.' }),
      h('p', { text: 'The service result is delivered to CatWeb in the Roblox window. A successful service test in this console proves the service configuration, but it does not prove delivery to Roblox.' })),
    panel('How the bridge watches Roblox',
      h('p', { text: 'The bridge reads the Roblox Player log and checks the Player window. It only types into Roblox when that window is in the foreground and the log shows that CatWeb finished loading; otherwise it pauses and says what it is waiting for.' }),
      h('p', { text: 'After a network disconnect (error 277) it asks Windows to rejoin the last place after 5 seconds, then retries with growing pauses up to 5 minutes. A rejoin may land on a different server. Leaving on purpose or other kick codes do not trigger a rejoin.' })),
    panel('What the web console does',
      h('p', { text: 'This page is an administration interface: configure domains, services and credentials, start or stop the local bridge, and inspect status and logs. Opening the web console alone does not start Roblox or the bridge.' }),
      h('p', { text: 'Saved settings and domains reach a running bridge without a restart when it supports live reload: added domains get a tab, removed ones are closed. A storage change still needs a restart, and the console says so.' }),
      h('p', { text: 'The bridge and Roblox Player need to run on the same Windows computer. If you view this console through a forwarded port, the browser may be elsewhere; service URLs such as localhost still refer to the bridge computer.' })),
  ];
}

function servicesPage() {
  return [
    panel('Choose what CatWeb may use',
      h('p', { text: 'Services are capabilities behind CatWeb requests. Weather and translation contact their providers; Datastore reads or changes domain data; GenAI uses your configured model provider. Other services include webhook, QR, fetch, player info and domain info.' }),
      h('p', { text: 'Enable a service globally in Settings, then allow it for the domain. Use the service setup guide to fill in required settings. Daily limits can be set per service, globally and per domain.' }),
      h('div', { class: 'page-actions' }, link('Configure services', 'settings', { section: 'services' }), link('Choose domain access', 'domains'))),
    panel('Try a harmless example',
      h('p', { text: 'The Info service (service ID 10) describes the current domain. In its CatWeb domain tab, request Info with an empty body or “info”. The answer describes that domain’s services and settings. The domain must permit Info.' }),
      h('p', { text: 'To check a service before using CatWeb, open its menu in Settings → Services and choose the playground. It runs a real call with saved settings and asks before effects such as writes, external requests or AI usage. Its result stays in the console.' })),
    panel('Who is contacted',
      h('p', { text: 'Weather uses Open-Meteo and its geocoding API. Cloud GenAI talks directly to the OpenAI-compatible provider you configured. Translation, webhook and fetch reach the destinations you configured or requested; player info reads public Roblox profile APIs without any login. Datastore, QR and Info stay on this PC (or your MongoDB).' })),
  ];
}

function requestsPage() {
  return [
    panel('Request format',
      h('p', {}, 'A CatWeb domain tab sends one line per request: ', code('user|…|service ID|body|request ID'),
        '. The bridge answers to the same user and request ID. Most bodies are comma-separated arguments, as listed below.'),
      h('p', {}, 'Send ', code('retry'), ' or ', code('<user>|retry'),
        ' to get the most recent answer for the domain again without running the service a second time.')),
    panel('Service IDs and bodies',
      table(['ID', 'Service', 'Body'], [
        ['0', 'Datastore', h('span', {}, code('get,key'), ' · ', code('set,key,value'), ' · ', code('delete,key'), ' · ', code('list[,page[,prefix[,per_page]]]'), ' (per_page up to 10)')],
        ['1', 'Weather', h('span', {}, code('city,path.to.value,…'), ' — a city followed by the values to return')],
        ['2', 'Translate', code('text,source language,target language')],
        ['3', 'Webhook', code('method,message_id,content,webhook_id,webhook_token')],
        ['6', 'QR code', h('span', {}, 'the text to encode; the answer is a matrix of ', code('0'), '/', code('1'), ' rows')],
        ['7', 'GenAI', h('span', {}, code('model,chat,prompt'), ' with chat = ', code('new'), ', a chat ID or empty; also ', code('models'), ', ', code('quota'), ', ', code('info'))],
        ['8', 'Fetch', code('METHOD,URL,BODY,HEADERS_JSON')],
        ['9', 'Player info', h('span', {}, code('user[,own user]'), ' by name or ID, or a JSON object')],
        ['10', 'Info', h('span', {}, 'empty or ', code('info'))],
      ]),
      h('p', { class: 'hint', text: 'GenAI and player info run asynchronously, so a slow model or lookup never blocks other requests. A service that is not allowed for the domain, disabled, or over its limit answers with an error instead of running.' })),
  ];
}

function updatesPage() {
  return [
    panel('Automatic updates',
      h('p', { text: 'Turn on About → Updates → Automatic updates. The console then asks the npm registry at most once a day; Windows login checks as well. When a newer build exists, CWBridge runs one fixed sequence:' }),
      h('ol', { class: 'help-steps' },
        step('1', 'Stop the bridge', 'Only once a newer build is known; a check that finds nothing stops nothing.'),
        step('2', 'Install and verify', 'The package is downloaded over HTTPS, checked against the registry’s integrity digest, and the new executable must start and report the expected version. Otherwise the previous build is restored.'),
        step('3', 'Start on the new version', 'The web console restarts itself on the new build and the bridge is started again. If the install failed, the bridge starts again on the previous build.')),
      h('p', {}, 'The same sequence runs for the Install button and for ', code('cwbridge update'),
        ' in a terminal. Add ', code('--no-restart'), ' to leave a running bridge on the old build.'),
      h('div', { class: 'page-actions' }, link('Open About', 'about'))),
    panel('Start with Windows',
      h('p', { text: 'About → Startup has three switches, saved for the current Windows user and used at the next sign-in:' }),
      h('ol', { class: 'help-steps' },
        step('1', 'Start Web GUI at login', 'Starts this console in the background and opens it in your browser.'),
        step('2', 'Connect to CatWeb at login', 'Starts the bridge in the background. It waits for Roblox and CatWeb before it types anything.'),
        step('3', 'Open CatWeb in Roblox at login', 'Also launches Roblox straight into CatWeb, so the bridge connects without a click. Roblox is left alone when it is already running. Needs the bridge switch.')),
      h('p', { text: 'With automatic updates on, the login start installs a newer release first and then starts everything on the new version. Without a network connection it simply starts the installed build.' })),
  ];
}

function problemsPage() {
  return [
    panel('No answer in CatWeb?',
      h('ol', { class: 'help-steps' },
        step('1', 'Check readiness', 'Overview shows whether the bridge runs, the Roblox window is available and CatWeb has finished loading.'),
        step('2', 'Check the domain', 'The domain name must match the CatWeb tab. A domain added while the bridge runs gets its tab as soon as you save it.'),
        step('3', 'Check service access', 'The service must be enabled locally and allowed for that domain. Check daily limits and any provider credentials.'),
        step('4', 'Read the evidence', 'Logs show bridge and delivery errors. Request history shows which service ran and whether it succeeded.')),
      h('div', { class: 'page-actions' }, link('Open Overview', 'overview'), link('Open Logs', 'logs'), link('Open Usage', 'usage'))),
    panel('Tabs do not open or the bridge stops at “Opening tabs…”',
      h('p', { text: 'Windows only delivers keys to the foreground window and may refuse to bring Roblox forward for a background program. Click the Roblox window once, then use Refresh all or restart the bridge.' }),
      h('p', { text: 'If Roblox runs as administrator, Windows blocks all input from a normal program. Start Roblox normally; About → Run CW Bridge Doctor reports this case.' })),
    panel('An update did not take effect',
      h('p', {}, 'A second copy from ', code('npm install -g cwbridge'), ' can win the ', code('cwbridge'),
        ' command. About and ', code('cwbridge version'), ' list every installation; refresh an old npm copy with ',
        code('npm install -g cwbridge@latest'), ' or run ', code('cwbridge doctor --fix'), '.')),
    panel('Lost the last answer?',
      h('p', { text: 'From the CatWeb domain tab, send “retry” or “<user>|retry”. CWBridge re-sends the most recently delivered answer for that domain without running the service again. This works only while that answer is still available in the running bridge.' })),
  ];
}

const PAGES = { start: startPage, flow: flowPage, services: servicesPage, requests: requestsPage, updates: updatesPage, problems: problemsPage };

export function renderHelpPage(main, section = 'start') {
  const page = HELP_PAGES.find(item => item.id === section) || HELP_PAGES[0];
  main.classList.add('help-page');
  main.append(h('div', { class: 'page-head' },
    h('div', { class: 'titles' }, h('h1', { text: page.label }),
      h('p', { text: 'A visual guide to CatWeb and your local CWBridge.' }))),
    h('div', { class: 'stack about-stack help-content' }, ...PAGES[page.id]()));
}

/* CWBridge console boot guard.
   Classic script, loaded before the ES module entry point. The console is one
   ES module graph: if a single module, the API or the first render fails, the
   browser paints nothing and the window stays empty. This guard turns that
   silence into a readable report that names the request which failed. A console
   that boots normally never shows it, and it never touches a rendered app. */
(function () {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 9000;
  var GRACE_MS = 700;
  var MAX_MODULES = 40;
  var MAX_DEPTH = 6;
  var MAX_PROBLEMS = 6;
  var RETRY_KEY = 'cwbridgeBootGuardRetry';
  var MAX_RETRIES = 2;
  var RETRY_WINDOW_MS = 10000;
  var RETRY_DELAY_MS = 1500;
  var timeoutMs = DEFAULT_TIMEOUT_MS;
  if (typeof window.__cwbridgeBootGuardTimeoutMs === 'number' && window.__cwbridgeBootGuardTimeoutMs > 0) {
    timeoutMs = window.__cwbridgeBootGuardTimeoutMs;
  }

  var startedAt = Date.now();
  var silent = false;      // The app took over: stay quiet for the rest of the session.
  var shown = false;       // A report is on screen.
  var pending = null;
  var failures = [];

  var BASE = (function () {
    var meta = document.querySelector('meta[name="cwbridge-base-path"]');
    var value = (meta && meta.getAttribute('content')) || '/';
    if (value.charAt(0) !== '/') value = '/' + value;
    return value.charAt(value.length - 1) === '/' ? value : value + '/';
  })();

  /* Matches static and dynamic module specifiers without executing anything. */
  var SPECIFIER = /\bimport\s*(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function consoleRoot() { return document.getElementById('app'); }

  /* Any child that is not the static fallback means the app painted. */
  function rendered() {
    var node = consoleRoot();
    if (!node) return true; // Nothing to repair: this page is not the console shell.
    var children = node.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].id !== 'boot-fallback') return true;
    }
    return false;
  }

  function entryModuleUrl() {
    var node = document.querySelector('script[type="module"]');
    return (node && node.src) ? node.src : BASE + 'assets/app.js';
  }

  function isScriptType(type) {
    return type.indexOf('javascript') !== -1 || type.indexOf('ecmascript') !== -1;
  }

  function describeModule(url, status, type, body) {
    var head = url + ' — HTTP ' + status + (type ? ' ' + type : '');
    if (status === 404) {
      return { line: head, hint: 'This file is not served. A web server started before the console files changed (an older build, or a long-running instance) answers 404 for it; restart "cwbridge web".' };
    }
    if (status >= 500) {
      return { line: head, hint: 'A gateway between browser and console (tunnel or reverse proxy) could not reach the console in time: HTTP ' + status + ' is the gateway answering, not the console. It is usually transient; reload, and if it persists restart the port forward and then the web server.' };
    }
    if (status >= 400) {
      return { line: head, hint: 'The console refused its own frontend file; check the server output.' };
    }
    if (!isScriptType(type)) {
      return { line: head + (body ? ' — body: ' + body.slice(0, 120).replace(/\s+/g, ' ') : ''), hint: 'The answer is not JavaScript, so the browser refuses to run it. Something between browser and console (tunnel, reverse proxy, sign-in or anti-phishing page) delivered its own document instead of the file.' };
    }
    return { line: head + ' — empty response', hint: 'The file was served without content; restart the web server.' };
  }

  /* Walks the module graph from the entry point and collects only failures, so
     the report can name the file the server actually refuses rather than the
     entry point the browser reports the failure on. */
  function walk(url, depth, seen, problems, budget, state) {
    if (depth > MAX_DEPTH || problems.length >= MAX_PROBLEMS || budget.count >= MAX_MODULES) return Promise.resolve();
    if (seen[url]) return Promise.resolve();
    seen[url] = true;
    budget.count++;
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (response) {
      var type = (response.headers.get('content-type') || '').toLowerCase();
      if (depth === 0) state.entryStatus = response.status;
      if (response.status >= 400 || !isScriptType(type)) {
        return response.text().then(function (body) {
          problems.push(describeModule(url, response.status, type, body));
        });
      }
      return response.text().then(function (body) {
        var children = [];
        var match;
        SPECIFIER.lastIndex = 0;
        while ((match = SPECIFIER.exec(body)) !== null) {
          var value = match[1] || match[2];
          if (!value) continue;
          var first = value.charAt(0);
          if (first === '.' || first === '/') {
            try { children.push(new URL(value, url).href); } catch (error) { /* ignore unusable specifier */ }
          }
        }
        return children.reduce(function (chain, child) {
          return chain.then(function () { return walk(child, depth + 1, seen, problems, budget, state); });
        }, Promise.resolve());
      });
    }).catch(function (error) {
      problems.push({ line: url + ' — request failed (' + ((error && error.message) || error) + ')', hint: 'The browser never reached this file. A forwarded port, tunnel or proxy that asks for its own sign-in answers such requests with a login or error page, which the browser then refuses to run.' });
    });
  }

  function probe(url, label) {
    if (typeof fetch !== 'function') return Promise.resolve({ label: label, url: url, error: 'this browser cannot request the file' });
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (response) {
      return response.text().then(function (body) {
        return { label: label, url: url, status: response.status, finalUrl: response.url, redirected: response.redirected, type: (response.headers.get('content-type') || '').toLowerCase(), body: body.slice(0, 160).replace(/\s+/g, ' ').trim() };
      });
    }).catch(function (error) {
      return { label: label, url: url, error: (error && error.message) ? error.message : String(error) };
    });
  }

  function stop() {
    silent = true;
    if (pending) { clearTimeout(pending); pending = null; }
  }

  /* Checks run before the app painted; a rendered console is left alone. */
  function check() {
    if (shown || silent) return;
    if (rendered()) { stop(); return; }
    if (Date.now() - startedAt >= timeoutMs) report();
  }

  function report(problem) {
    if (shown || silent) return;
    if (problem && failures.indexOf(problem) === -1) failures.push(problem);
    if (rendered()) { stop(); return; }
    shown = true;
    var entry = entryModuleUrl();
    var problems = [];
    var state = { entryStatus: null };
    walk(entry, 0, {}, problems, { count: 0 }, state)
      .then(function () {
        // A failed entry load that answers normally a moment later, or a
        // gateway answer, is a transient tunnel/proxy hiccup: reload once
        // instead of asking the user to do it by hand.
        if (retryTransient(state.entryStatus, problems)) return null;
        return probe(BASE + 'api/session', 'Session endpoint').then(function (session) { paint(entry, problems, session); });
      });
  }

  function gatewayStatus(status) {
    return status === 502 || status === 503 || status === 504 || status === 500;
  }

  /* One automatic reload while the failure looks transient, guarded against loops. */
  function retryTransient(status, problems) {
    var gateway = gatewayStatus(status);
    var answeredNow = problems.length === 0; // every module is fine on this second look
    if (!gateway && !answeredNow) return false;
    var state = { count: 0, at: 0 };
    try {
      var raw = window.sessionStorage.getItem(RETRY_KEY);
      if (raw) state = JSON.parse(raw) || state;
    } catch (error) { return false; } // No storage: never risk a reload loop.
    if (state.count >= MAX_RETRIES || Date.now() - (state.at || 0) < RETRY_WINDOW_MS) return false;
    try { window.sessionStorage.setItem(RETRY_KEY, JSON.stringify({ count: state.count + 1, at: Date.now() })); }
    catch (error) { return false; }
    var node = consoleRoot();
    if (node) {
      node.textContent = '';
      var note = el('div', 'boot-report');
      note.appendChild(el('h1', 'boot-report-title', 'The console did not start'));
      note.appendChild(el('p', 'boot-report-lede', 'The browser could not load ' + entryModuleUrl() + (gateway ? ' (HTTP ' + status + ' from a gateway in front of the console)' : ' (the file answers normally again now)') + '. This is the transient tunnel or proxy hiccup the console retries by itself.'));
      note.appendChild(el('p', 'boot-report-lede', 'Reloading now.'));
      node.appendChild(note);
    }
    setTimeout(function () { window.location.reload(); }, RETRY_DELAY_MS);
    return true;
  }

  /* A short grace period keeps transient errors from flashing a report. */
  function reportSoon(problem) {
    if (shown || silent || pending) return;
    pending = setTimeout(function () {
      pending = null;
      report(problem);
    }, GRACE_MS);
  }

  function sessionLine(result, lines, hints) {
    if (result.error) {
      lines.push(result.label + ': ' + result.url + ' — request failed (' + result.error + ')');
      hints.push('The console API is not reachable either, so the web server is down or the forwarded port has no listener. Start it with "cwbridge web" and check the port the tunnel forwards.');
      return;
    }
    var note = result.status === 401 ? ' (normal while signed out)' : '';
    lines.push(result.label + ': ' + result.url + ' — HTTP ' + result.status + (result.type ? ' ' + result.type : '') + note);
    if (result.status >= 400 && result.status !== 401) {
      hints.push('The console API answered with an error status instead of a session response.');
    }
  }

  function paint(entry, problems, session) {
    var node = consoleRoot();
    if (!node) return;
    node.textContent = '';

    var lines = ['Console entry: ' + entry];
    var hints = [];
    sessionLine(session, lines, hints);
    // A reachable API proves the web server itself is up, so the failure is
    // about the listed file, not about a stopped console.
    if (problems.length && session.status && session.status < 500) {
      hints.push('The console answered the session request, so the web server is running; only the file listed above did not arrive.');
    }

    var wrap = el('div', 'boot-report');
    wrap.appendChild(el('h1', 'boot-report-title', 'The console did not start'));
    wrap.appendChild(el('p', 'boot-report-lede', 'This page is the CWBridge console shell, but its frontend never took over. Nothing is lost: the server is unaffected and the bridge keeps running.'));

    if (failures.length) {
      var coarse = el('ul', 'boot-report-list');
      failures.forEach(function (failure) { coarse.appendChild(el('li', 'boot-report-problem', String(failure))); });
      wrap.appendChild(coarse);
    }

    if (problems.length) {
      wrap.appendChild(el('h2', 'boot-report-heading', 'Files that did not arrive'));
      var fileList = el('ul', 'boot-report-list boot-report-diag');
      problems.forEach(function (problem) {
        fileList.appendChild(el('li', 'boot-report-problem', problem.line));
        if (problem.hint) hints.push(problem.hint);
      });
      wrap.appendChild(fileList);
    }

    wrap.appendChild(el('h2', 'boot-report-heading', 'What the page found'));
    var diag = el('ul', 'boot-report-list boot-report-diag');
    lines.forEach(function (line) { diag.appendChild(el('li', null, line)); });
    diag.appendChild(el('li', null, 'Page: ' + ((window.location && window.location.href) || '(unknown)')));
    wrap.appendChild(diag);

    var unique = [];
    hints.forEach(function (hint) { if (unique.indexOf(hint) === -1) unique.push(hint); });
    unique.push('Reload after the web server was restarted, and compare the direct address (http://127.0.0.1:8787/) with the forwarded address to tell a console problem from a tunnel problem.');
    unique.push('A private forwarded port needs the tunnel sign-in for every request; when that sign-in fails, an empty page is what remains.');

    wrap.appendChild(el('h2', 'boot-report-heading', 'What to try'));
    var hintList = el('ul', 'boot-report-list');
    unique.forEach(function (hint) { hintList.appendChild(el('li', null, hint)); });
    wrap.appendChild(hintList);

    var actions = el('div', 'boot-report-actions');
    var reload = el('button', 'btn primary', 'Reload');
    reload.type = 'button';
    reload.addEventListener('click', function () { window.location.reload(); });
    actions.appendChild(reload);
    wrap.appendChild(actions);

    node.appendChild(wrap);
  }

  /* Capture phase: module and stylesheet load errors do not bubble. */
  window.addEventListener('error', function (event) {
    if (silent || shown) return;
    var target = event && event.target;
    if (target && target !== window && target.tagName && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      var url = target.src || target.href;
      reportSoon('A required console file did not load: ' + (url || target.tagName.toLowerCase()));
      return;
    }
    if (event && event.message) {
      // A module syntax error reports its own file here: name it, or the message
      // ("Unexpected token") would be useless on its own.
      var where = event.filename ? ' — ' + event.filename + (event.lineno ? ':' + event.lineno : '') : '';
      reportSoon(event.message + where);
    }
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    if (silent || shown) return;
    var reason = event && event.reason;
    reportSoon((reason && (reason.message || reason)) || 'Unhandled error during startup');
  });

  /* Poll while the app has not painted yet, then stop for good. */
  var timer = setInterval(function () {
    if (shown || silent) { clearInterval(timer); return; }
    check();
  }, 400);
  check();
})();

/* CWBridge console entry point. Pages and shared code are native ES modules. */
import { boot } from './auth.js';
import { installDisclosureMotion, installHoverPill, installLabelSwap, installTooltips } from './ui.js';
import { installRouter } from './router.js';
import { installSearch } from './workflows.js';

function start() {
  installTooltips();
  installHoverPill();
  installLabelSwap();
  installDisclosureMotion();
  installRouter();
  installSearch();
  boot();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

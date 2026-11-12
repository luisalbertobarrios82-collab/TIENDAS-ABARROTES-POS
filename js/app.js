import { init } from './services.js';
import { showError } from './ui.js';
import { renderSell } from './views/sell.js';
import { renderScan } from './views/scan.js';
import { renderInventory, renderProduct } from './views/inventory.js';
import { renderImport } from './views/import.js';
import { renderCorte, renderCorteDetail } from './views/corte.js';
import { renderFiado } from './views/fiado.js';
import { renderFacturas } from './views/facturas.js';
import { renderSales } from './views/sales.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  vender: renderSell,
  escanear: renderScan,
  inventario: renderInventory,
  producto: renderProduct,
  importar: renderImport,
  corte: renderCorte,
  'corte-detalle': renderCorteDetail,
  fiado: renderFiado,
  facturas: renderFacturas,
  ventas: renderSales,
  reportes: renderReports,
  ajustes: renderSettings,
};
const ACTIVE_TAB = { producto: 'inventario', importar: 'inventario', facturas: 'corte', 'corte-detalle': 'corte' };

// Al volver de un detalle a su lista, la lista regresa a donde se había quedado.
const RETURNS_TO = {
  inventario: ['producto', 'importar'],
  corte: ['corte-detalle', 'facturas'],
  vender: ['ventas', 'reportes', 'ajustes', 'facturas'],
};
const scrollMemory = new Map();
let currentView = null;

const main = document.getElementById('main');
let cleanup = null;

// Las pantallas que cargan datos después tardan en tener su altura completa: se reintenta un momento.
function restoreScroll(top) {
  let tries = 0;
  const attempt = () => {
    main.scrollTop = top;
    if (Math.abs(main.scrollTop - top) > 2 && tries < 60) {
      tries += 1;
      requestAnimationFrame(attempt);
    }
  };
  attempt();
}

function route() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const [path, param] = location.hash.slice(1).split('/');
  const name = ROUTES[path] ? path : 'vender';
  const previous = currentView;
  if (previous) scrollMemory.set(previous, main.scrollTop);
  cleanup?.();
  main.scrollTop = 0;
  document.body.dataset.view = name;
  currentView = name;
  cleanup = ROUTES[name](main, param) || null;
  const saved = scrollMemory.get(name);
  if (saved && RETURNS_TO[name]?.includes(previous)) restoreScroll(saved);
  const tab = ACTIVE_TAB[name] || name;
  document.querySelectorAll('.tabbar a').forEach((link) => {
    if (link.getAttribute('href') === `#${tab}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

try {
  await init();
  window.addEventListener('hashchange', route);
  route();
} catch (error) {
  showError(error);
  main.textContent = 'No se pudo abrir la base de datos de este navegador. Revisa que no estés en una ventana privada.';
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

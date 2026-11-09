import { init } from './services.js';
import { showError } from './ui.js';
import { renderSell } from './views/sell.js';
import { renderScan } from './views/scan.js';
import { renderInventory, renderProduct } from './views/inventory.js';
import { renderCorte } from './views/corte.js';
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
  corte: renderCorte,
  fiado: renderFiado,
  facturas: renderFacturas,
  ventas: renderSales,
  reportes: renderReports,
  ajustes: renderSettings,
};
const ACTIVE_TAB = { producto: 'inventario', facturas: 'corte' };

const main = document.getElementById('main');
let cleanup = null;

function route() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const [path, param] = location.hash.slice(1).split('/');
  const name = ROUTES[path] ? path : 'vender';
  cleanup?.();
  main.scrollTop = 0;
  document.body.dataset.view = name;
  cleanup = ROUTES[name](main, param) || null;
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

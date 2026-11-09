import { html } from '../core.js';
import { cart, cartTotals, addToCart, clearCart, onCartChange, pruneCart } from '../cart.js';
import { startScanner } from '../scanner.js';
import { findByCode } from '../services.js';
import { checkout, newCodeSheet, quantitySheet } from '../sheets.js';
import { money, setHTML, showError } from '../ui.js';
import { handleTicketClick, ticketLines } from './sell.js';

const REPEAT_MS = 1500;

export function renderScan(root) {
  pruneCart();
  let scanner = null;
  let leaving = false;
  let last = { code: '', at: 0 };
  let pillTimer;

  setHTML(root, html`
    <div class="scan">
      <div class="scan-top">
        <video id="video" playsinline muted aria-hidden="true"></video>
        <header class="scan-head">
          <a href="#vender">Cerrar</a>
          <span><i class="dot"></i>Escaneo continuo</span>
          <button id="torch" class="torch" aria-label="Linterna" hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3h8v5l-2 3v10h-4V11L8 8V3Z"/></svg>
          </button>
        </header>
        <div class="frame"><i class="scan-line"></i></div>
        <p class="scan-hint" id="hint">Apunta a los productos uno tras otro</p>
        <form id="manual" class="manual" hidden>
          <input id="manual-code" inputmode="numeric" autocomplete="off" placeholder="Escribe el código" aria-label="Código de barras">
          <button class="btn btn-primary">Agregar</button>
        </form>
        <p class="scan-pill" id="pill" role="status" hidden></p>
      </div>
      <section class="scan-sheet" aria-label="Ticket actual">
        <header class="scan-ticket-head">
          <div><small id="count"></small><strong id="total"></strong></div>
          <button class="link" id="clear">Vaciar</button>
        </header>
        <ul id="lines" class="lines"></ul>
        <button class="btn btn-primary btn-pill" id="charge">Cobrar</button>
      </section>
    </div>
  `);

  const renderTicket = () => {
    const totals = cartTotals();
    const units = cart.lines.reduce((a, l) => a + (Number.isInteger(l.qty) ? l.qty : 1), 0);
    root.querySelector('#count').textContent = `Ticket · ${units} ${units === 1 ? 'artículo' : 'artículos'}`;
    root.querySelector('#total').textContent = money(totals.total);
    setHTML(root.querySelector('#lines'), html`${ticketLines()}`);
    const charge = root.querySelector('#charge');
    charge.disabled = !cart.lines.length;
    charge.textContent = cart.lines.length ? `Cobrar ${money(totals.total)}` : 'Cobrar';
  };
  renderTicket();
  const stopCart = onCartChange(renderTicket);

  const pill = (text) => {
    const element = root.querySelector('#pill');
    element.textContent = text;
    element.hidden = false;
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => { element.hidden = true; }, 1800);
  };

  const handleCode = (code) => {
    if (document.querySelector('dialog[open]')) return;
    const time = Date.now();
    if (code === last.code && time - last.at < REPEAT_MS) return;
    last = { code, at: time };
    navigator.vibrate?.(40);
    const product = findByCode(code);
    if (!product) {
      newCodeSheet(code);
      return;
    }
    if (product.unit !== 'pza') {
      quantitySheet(product);
    } else if (addToCart(product)) {
      pill(`+1 ${product.name} · ${money(product.price)}`);
    }
  };

  root.querySelector('#lines').addEventListener('click', handleTicketClick);
  root.querySelector('#charge').addEventListener('click', checkout);
  root.querySelector('#clear').addEventListener('click', clearCart);

  const manual = root.querySelector('#manual');
  manual.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = root.querySelector('#manual-code');
    const code = input.value.trim();
    input.value = '';
    last = { code: '', at: 0 };
    if (code) handleCode(code);
  });

  if (navigator.mediaDevices?.getUserMedia) {
    startScanner(root.querySelector('#video'), handleCode).then((instance) => {
      if (leaving) { instance.stop(); return; }
      scanner = instance;
      if (instance.torch) {
        const button = root.querySelector('#torch');
        button.hidden = false;
        button.addEventListener('click', () => instance.torch().catch(showError));
      }
    }).catch(() => {
      if (leaving) return;
      root.querySelector('#hint').textContent = 'No se pudo usar la cámara. Revisa el permiso o escribe el código.';
      manual.hidden = false;
    });
  } else {
    root.querySelector('#hint').textContent = 'La cámara necesita abrirse desde el enlace seguro (https).';
    manual.hidden = false;
  }

  return () => {
    leaving = true;
    clearTimeout(pillTimer);
    stopCart();
    scanner?.stop();
  };
}

import { formatQty, html, normalize } from '../core.js';
import { cart, cartItems, cartQty, cartTotals, clearCart, onCartChange, pruneCart, stepLine } from '../cart.js';
import { findByCode, loadDemoProducts, state } from '../services.js';
import { checkout, discountSheet, freeAmountSheet, newCodeSheet, pickProduct, quantitySheet } from '../sheets.js';
import { money, monogram, openModal, setHTML, showError, toast } from '../ui.js';

const MAX_TILES = 60;
const filter = { text: '', category: 'Todos' };
let root;

const product = (id) => state.products.find((p) => p.id === id);
const shortName = (p) => p.name;

function matches() {
  const words = normalize(filter.text).split(/\s+/).filter(Boolean);
  return state.products.filter((p) => {
    if (filter.category !== 'Todos' && p.category !== filter.category) return false;
    const haystack = normalize(`${p.name} ${p.codeList.join(' ')} ${p.category}`);
    return words.every((word) => haystack.includes(word));
  });
}

function renderCategories() {
  const categories = ['Todos', ...new Set(state.products.map((p) => p.category))];
  setHTML(root.querySelector('#categories'), categories.map((c) => html`
    <button data-category="${c}" aria-pressed="${c === filter.category}">${c}</button>
  `).map(String).join(''));
}

function renderGrid() {
  const grid = root.querySelector('#grid');
  if (!state.products.length) {
    setHTML(grid, html`
      <div class="empty">
        <h2>Aún no hay productos</h2>
        <p class="muted">Agrega tu mercancía o prueba con productos de ejemplo.</p>
        <div class="row-gap">
          <a class="btn btn-primary" href="#inventario">Agregar productos</a>
          <button class="btn" id="demo">Cargar ejemplos</button>
        </div>
      </div>
    `);
    return;
  }
  const found = matches();
  const tiles = found.slice(0, MAX_TILES).map((p) => {
    const out = p.stock <= 0 && !state.settings.allowNegativeStock;
    const qty = cartQty(p.id);
    return html`
      <button class="tile" data-add="${p.id}" ${out ? html`disabled` : ''}>
        ${monogram(p.name)}
        <span class="tile-text">
          <span class="tile-name">${shortName(p)}</span>
          <span class="tile-price">${out ? 'Agotado' : `${money(p.price)}${p.unit === 'pza' ? '' : `/${p.unit}`}`}</span>
        </span>
        ${qty > 0 && html`<span class="tile-badge">${formatQty(qty)}</span>`}
      </button>
    `;
  });
  setHTML(grid, html`
    ${tiles}
    ${!filter.text && html`
      <button class="tile" id="free">
        <span class="mono-tile tint-6" aria-hidden="true">$</span>
        <span class="tile-text"><span class="tile-name">Monto libre</span><span class="tile-price">Tú pones</span></span>
      </button>
    `}
    ${!found.length && filter.text && html`<p class="muted empty">Sin resultados.</p>`}
    ${found.length > MAX_TILES && html`<p class="muted grid-note">Mostrando ${MAX_TILES} de ${found.length}. Escribe para afinar.</p>`}
  `);
}

export function ticketLines() {
  const { lines } = cartTotals();
  if (!lines.length) return html`<li class="cart-empty muted">Escanea o toca un producto.</li>`;
  return lines.map((line) => html`
    <li class="line">
      <button class="line-info" data-edit="${line.key}" aria-label="Cambiar cantidad de ${line.name}">
        <span class="line-name">${line.name}</span>
        <small>${formatQty(line.qty)}${line.unit === 'pza' ? '' : ` ${line.unit}`} × ${money(line.unitPrice)}</small>
      </button>
      <span class="stepper">
        <button data-dec="${line.key}" aria-label="Quitar uno de ${line.name}">−</button>
        <button data-inc="${line.key}" aria-label="Agregar uno de ${line.name}">+</button>
      </span>
      <span class="line-total">${money(line.gross)}</span>
    </li>
  `);
}

export function handleTicketClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const { dec, inc, edit } = button.dataset;
  if (inc) stepLine(inc, 1);
  if (dec) stepLine(dec, -1);
  if (edit) {
    const line = cart.lines.find((l) => l.key === edit);
    if (line && !line.free) quantitySheet(product(line.productId), line.qty);
  }
}

function renderCart() {
  const totals = cartTotals();
  const empty = !cart.lines.length;
  setHTML(root.querySelector('#cart-lines'), html`${ticketLines()}`);
  setHTML(root.querySelector('#cart-extra'), html`
    ${totals.discount > 0 && html`<div class="sum"><span>Descuento</span><span>−${money(totals.discount)}</span></div>`}
    ${Object.entries(totals.taxByRate).length > 0 && html`<div class="sum muted"><span>IVA ${state.settings.pricesIncludeTax ? 'incluido' : ''}</span><span>${money(totals.tax)}</span></div>`}
  `);
  const charge = root.querySelector('#charge');
  charge.disabled = empty;
  charge.textContent = empty ? 'Cobrar' : `Cobrar ${money(totals.total)}`;
  root.querySelector('#clear').hidden = empty;
  root.querySelector('#discount-btn').hidden = empty;
  renderGrid();
}

function focusSearch() {
  if (matchMedia('(pointer: fine)').matches) root?.querySelector('#search')?.focus();
}

function onSearchEnter(input) {
  const code = input.value.trim();
  if (!code) return;
  const exact = findByCode(code);
  const clear = () => { input.value = ''; filter.text = ''; };
  if (exact) {
    pickProduct(exact);
    clear();
    renderGrid();
    return;
  }
  if (/^\d{6,}$/.test(code)) {
    clear();
    renderGrid();
    newCodeSheet(code, focusSearch);
    return;
  }
  const found = matches();
  if (found.length === 1) {
    pickProduct(found[0]);
    clear();
    renderGrid();
  } else {
    toast(found.length ? 'Hay varias coincidencias: elige una.' : `No se encontró "${code}".`, 'error');
    input.select();
  }
}

function onKeydown(event) {
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'F2') { event.preventDefault(); root.querySelector('#search').focus(); }
  if (event.key === 'F9') { event.preventDefault(); checkout(); }
}

function moreMenu() {
  openModal(html`
    <div class="modal-body">
      <h2>Más opciones</h2>
      <nav class="group" aria-label="Más opciones" data-close>
        <a class="row row-btn" href="#ventas"><span class="row-main"><strong>Ventas</strong><small>Historial, reimprimir y cancelar</small></span></a>
        <a class="row row-btn" href="#facturas"><span class="row-main"><strong>Facturas</strong><small>Datos fiscales de clientes</small></span></a>
        <a class="row row-btn" href="#reportes"><span class="row-main"><strong>Reportes</strong><small>Ganancias y lo más vendido</small></span></a>
        <a class="row row-btn" href="#ajustes"><span class="row-main"><strong>Ajustes</strong><small>Negocio, respaldo e importación</small></span></a>
      </nav>
      <button class="btn btn-plain" data-close>Cerrar</button>
    </div>
  `);
}

export function renderSell(container) {
  root = container;
  pruneCart();
  if (filter.category !== 'Todos' && !state.products.some((p) => p.category === filter.category)) filter.category = 'Todos';

  setHTML(root, html`
    <div class="sell">
      <section class="catalog" aria-label="Productos">
        <header class="title-row">
          <div>
            <a class="eyebrow" href="#corte">${state.settings.storeName} · ${state.shift ? 'Caja abierta' : 'Caja cerrada'}</a>
            <h1>Vender</h1>
          </div>
          <button class="round-btn" id="more" aria-label="Más opciones">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
        </header>
        <div class="search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6C6C70" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
          <input id="search" type="search" placeholder="Buscar o escanear" autocomplete="off" aria-label="Buscar producto" value="${filter.text}">
        </div>
        <div id="categories" class="tabs" role="group" aria-label="Categorías"></div>
        <div id="grid" class="grid"></div>
      </section>
      <aside class="ticket" aria-label="Ticket actual">
        <header class="ticket-head">
          <h2>Ticket</h2>
          <span>
            <button class="link" id="discount-btn">Descuento</button>
            <button class="link" id="clear">Vaciar</button>
          </span>
        </header>
        <ul id="cart-lines" class="lines"></ul>
        <div id="cart-extra"></div>
        <button class="btn btn-primary btn-pill" id="charge">Cobrar</button>
      </aside>
    </div>
  `);

  renderCategories();
  renderCart();
  const stopCart = onCartChange(renderCart);

  const search = root.querySelector('#search');
  search.addEventListener('input', () => { filter.text = search.value; renderGrid(); });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); onSearchEnter(search); }
  });

  root.querySelector('#charge').addEventListener('click', checkout);
  root.querySelector('#more').addEventListener('click', moreMenu);
  root.querySelector('#discount-btn').addEventListener('click', discountSheet);
  root.querySelector('#clear').addEventListener('click', () => { clearCart(); focusSearch(); });
  root.querySelector('#cart-lines').addEventListener('click', handleTicketClick);

  root.querySelector('.catalog').addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const { add, category } = target.dataset;
    if (add) { pickProduct(product(add)); focusSearch(); }
    if (category) { filter.category = category; renderCategories(); renderGrid(); }
    if (target.id === 'free') freeAmountSheet();
    if (target.id === 'demo') {
      try {
        await loadDemoProducts();
        renderCategories();
        renderGrid();
        toast('Productos de ejemplo cargados');
      } catch (error) { showError(error); }
    }
  });

  document.addEventListener('keydown', onKeydown);
  focusSearch();
  return () => {
    stopCart();
    document.removeEventListener('keydown', onKeydown);
  };
}

export { cartItems };

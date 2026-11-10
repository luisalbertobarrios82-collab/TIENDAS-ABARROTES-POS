// Utilidades de interfaz: hojas modales, avisos, ticket y descargas.
import { centsToInput, computeMargin, formatMoney, formatPercent, formatQty, html, initials, MINISUPER_CATEGORIES, parseMoney, tintIndex, unitCostFromPack } from './core.js';
import { openShift, state, UserError } from './services.js';

export const money = (cents) => formatMoney(cents, state.settings.currency);
export const moneyFull = (cents) => formatMoney(cents, state.settings.currency, { full: true });

// Lista de categorías: las típicas, las que ya usa la tienda y una opción para escribir otra.
const OTHER_CATEGORY = '__otra';

export function categoryFieldHtml(current = '') {
  const names = [...new Set([...MINISUPER_CATEGORIES, ...state.products.map((p) => p.category), ...(current ? [current] : [])])]
    .sort((a, b) => a.localeCompare(b, 'es'));
  return html`
    <label class="field">Categoría
      <select name="categoryChoice">
        <option value="">Elige una</option>
        ${names.map((name) => html`<option value="${name}" ${name === current ? html`selected` : ''}>${name}</option>`)}
        <option value="${OTHER_CATEGORY}">Otra…</option>
      </select>
    </label>
    <label class="field" data-category-other hidden>Escribe la categoría
      <input name="category" maxlength="40" autocomplete="off">
    </label>
  `;
}

export function bindCategoryField(form) {
  const other = form.querySelector('[data-category-other]');
  form.elements.categoryChoice.addEventListener('change', (event) => {
    other.hidden = event.target.value !== OTHER_CATEGORY;
    if (!other.hidden) form.elements.category.focus();
  });
}

export const readCategory = (values) => (values.categoryChoice === OTHER_CATEGORY
  ? values.category.trim()
  : values.categoryChoice) || 'General';

// Texto corto de ganancia por unidad, por ejemplo "+$0.90 · margen 30%".
export function marginShort(price, cost) {
  const { profit, margin } = computeMargin(price, cost);
  return `${profit < 0 ? '−' : '+'}${money(Math.abs(profit))}${margin === null ? '' : ` · margen ${formatPercent(margin)}`}`;
}

// Muestra la ganancia en [data-margin] mientras se escriben precio y costo.
export function bindMargin(form) {
  const box = form.querySelector('[data-margin]');
  const update = () => {
    const price = parseMoney(form.elements.price.value);
    const costText = form.elements.cost.value.trim();
    const cost = parseMoney(costText);
    const ready = price !== null && costText !== '' && cost !== null;
    const { profit, margin } = ready ? computeMargin(price, cost) : { profit: 0, margin: null };
    box.classList.toggle('is-gain', ready && profit >= 0);
    box.classList.toggle('is-loss', ready && profit < 0);
    if (!ready) {
      box.textContent = 'Escribe precio y costo para ver cuánto ganas.';
      return;
    }
    const marginText = margin === null ? '' : ` · Margen ${formatPercent(margin)}`;
    box.textContent = `${profit < 0 ? 'Pierdes' : 'Ganas'} ${money(Math.abs(profit))}${marginText}`;
  };
  form.elements.price.addEventListener('input', update);
  form.elements.cost.addEventListener('input', update);
  update();
}

export const packFieldsHtml = (packUnits = 0) => html`
  <label class="field">Piezas por caja <input name="packUnits" inputmode="numeric" value="${packUnits || ''}" autocomplete="off"></label>
  <label class="field">Costo de la caja <input name="packCost" inputmode="decimal" placeholder="Opcional" autocomplete="off"></label>
`;

// Al escribir el costo de la caja, llena el costo por pieza.
export function bindPackCost(form) {
  const update = () => {
    const cost = unitCostFromPack(parseMoney(form.elements.packCost.value), Number(form.elements.packUnits.value));
    if (cost === null) return;
    form.elements.cost.value = centsToInput(cost);
    form.elements.cost.dispatchEvent(new Event('input', { bubbles: true }));
  };
  form.elements.packCost.addEventListener('input', update);
  form.elements.packUnits.addEventListener('input', update);
}

export const METHODS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Fiado' };

export const monogram = (name, size = '') => html`<span class="mono-tile ${size} tint-${tintIndex(name)}" aria-hidden="true">${initials(name)}</span>`;
export const thumb = (product, size = '') => (product.image
  ? html`<img class="mono-tile photo ${size}" src="${product.image}" alt="" loading="lazy" data-name="${product.name}">`
  : monogram(product.name, size));

// Si una foto no carga, se muestran las iniciales.
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('photo')) return;
  image.outerHTML = String(monogram(image.dataset.name, image.classList.contains('mono-xl') ? 'mono-xl' : ''));
}, true);

export const catalogCard = (found) => html`
  ${found.image && html`<img class="catalog-photo" src="${found.image}" alt="">`}
  <span>
    <strong>${found.name || 'Encontramos la foto'}</strong>
    <small>${found.name ? 'Sugerido por Open Food Facts. Revisa que sea correcto.' : 'Falta el nombre: escríbelo abajo.'}</small>
  </span>
`;

export const chevron = html`<svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m1 1 6 6-6 6"/></svg>`;
export const backLink = (href, label) => html`<a class="back" href="${href}"><svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 1 1 9l8 8"/></svg>${label}</a>`;

// Tras una espera, indica si el usuario sigue en esa pantalla.
export const isView = (name) => document.body.dataset.view === name;

export function setHTML(element, content) {
  element.innerHTML = String(content);
}

export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  item.textContent = message;
  box.replaceChildren(item);
  setTimeout(() => item.remove(), kind === 'error' ? 6000 : 2600);
}

export function showError(error) {
  if (error instanceof UserError) toast(error.message, 'error');
  else {
    console.error(error);
    toast(`Ocurrió un error: ${error?.message || error}`, 'error');
  }
}

// Abre un <dialog> como hoja inferior. onReady recibe (dialog, close).
export function openModal(content, onReady, { onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  setHTML(dialog, content);
  document.body.append(dialog);
  // Los toasts deben verse por encima de la capa superior del diálogo.
  dialog.append(document.getElementById('toasts'));
  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    const parent = document.querySelector('dialog[open]') || document.body;
    parent.append(document.getElementById('toasts'));
    dialog.remove();
    onClose?.();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) close();
  });
  dialog.showModal();
  onReady?.(dialog, close);
  return { dialog, close };
}

export function confirmDialog({ title, message, action = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal(html`
      <form method="dialog" class="modal-body">
        <h2>${title}</h2>
        <p class="muted">${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Volver</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${action}</button>
        </div>
      </form>
    `, (dialog) => {
      dialog.querySelector('[data-yes]').addEventListener('click', () => { answer = true; });
    }, { onClose: () => resolve(answer) });
  });
}

// Conecta un formulario: maneja errores y evita doble envío.
export function onSubmit(form, handler) {
  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  });
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const dateTime = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const dayStart = (value) => new Date(`${value}T00:00:00`).toISOString();
export const dayEnd = (value) => new Date(`${value}T23:59:59.999`).toISOString();

export function printTicket(sale) {
  const { storeName, address, phone, taxId, ticketFooter } = state.settings;
  setHTML(document.getElementById('print-area'), html`
    <div class="ticket-print">
      <h1>${storeName}</h1>
      ${address && html`<p>${address}</p>`}
      ${phone && html`<p>Tel. ${phone}</p>`}
      ${taxId && html`<p>RFC ${taxId}</p>`}
      <hr>
      <p>Ticket ${sale.folio} · ${dateTime(sale.date)}</p>
      ${sale.status === 'cancelled' && html`<p><strong>*** VENTA CANCELADA ***</strong></p>`}
      <hr>
      ${sale.lines.map((line) => html`
        <div class="tp-item">${line.name}</div>
        <div class="tp-row"><span>${formatQty(line.qty)} ${line.unit} x ${moneyFull(line.unitPrice)}</span><span>${moneyFull(line.gross)}</span></div>
      `)}
      <hr>
      ${sale.discount > 0 && html`<div class="tp-row"><span>Descuento</span><span>-${moneyFull(sale.discount)}</span></div>`}
      <div class="tp-row"><span>Subtotal</span><span>${moneyFull(sale.net)}</span></div>
      ${Object.entries(sale.taxByRate).map(([rate, amount]) => html`
        <div class="tp-row"><span>IVA ${rate}%</span><span>${moneyFull(amount)}</span></div>
      `)}
      <div class="tp-row tp-total"><span>TOTAL</span><span>${moneyFull(sale.total)}</span></div>
      ${sale.method === 'credit'
        ? html`<div class="tp-row"><span>Fiado a</span><span>${sale.customerName}</span></div>`
        : html`<div class="tp-row"><span>${METHODS[sale.method]}</span><span>${moneyFull(sale.received)}</span></div>`}
      ${sale.change > 0 && html`<div class="tp-row"><span>Cambio</span><span>${moneyFull(sale.change)}</span></div>`}
      <hr>
      <p>${ticketFooter}</p>
    </div>
  `);
  window.print();
}

export function promptOpenShift(onDone) {
  openModal(html`
    <form class="modal-body">
      <h2>Abrir caja</h2>
      <p class="muted">¿Con cuánto efectivo empiezas?</p>
      <label class="field">Fondo inicial
        <input name="float" inputmode="decimal" autocomplete="off" value="0.00" required>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Abrir caja</button>
      </div>
    </form>
  `, (dialog, close) => {
    dialog.querySelector('[name=float]').select();
    onSubmit(dialog.querySelector('form'), async ({ float }) => {
      const amount = parseMoney(float);
      if (amount === null) throw new UserError('Escribe un monto válido.');
      await openShift(amount);
      close();
      toast('Caja abierta');
      onDone?.();
    });
  });
}

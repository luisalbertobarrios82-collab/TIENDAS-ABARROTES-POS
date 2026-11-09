import { formatQty, html } from '../core.js';
import { cancelSale, getSale, salesBetween } from '../services.js';
import { backLink, dateTime, dayEnd, dayStart, isView, localDate, METHODS, money, onSubmit, openModal, printTicket, setHTML, showError, toast } from '../ui.js';

let range = { from: localDate(), to: localDate() };
let root;

async function load() {
  const sales = await salesBetween(dayStart(range.from), dayEnd(range.to));
  if (!isView('ventas')) return;
  const active = sales.filter((s) => s.status !== 'cancelled');
  root.querySelector('#summary').textContent = `${active.length} ${active.length === 1 ? 'venta' : 'ventas'} · ${money(active.reduce((a, s) => a + s.total, 0))}`;
  setHTML(root.querySelector('#table'), sales.length ? html`
    <table class="table table-click">
      <thead><tr><th>Folio</th><th>Fecha</th><th class="num">Artículos</th><th>Pago</th><th>Estado</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${sales.map((s) => html`
          <tr data-sale="${s.id}" tabindex="0" class="${s.status === 'cancelled' ? 'is-cancelled' : ''}">
            <td data-label="Folio" class="mono"><strong>#${s.folio}</strong></td>
            <td data-label="Fecha">${dateTime(s.date)}</td>
            <td data-label="Artículos" class="num">${formatQty(s.lines.reduce((a, l) => a + l.qty, 0))}</td>
            <td data-label="Pago">${METHODS[s.method]}</td>
            <td data-label="Estado">${s.status === 'cancelled' ? '✕ Cancelada' : 'Completada'}</td>
            <td data-label="Total" class="num"><strong>${money(s.total)}</strong></td>
          </tr>
        `)}
      </tbody>
    </table>
  ` : html`<p class="empty muted">No hay ventas en este periodo.</p>`);
}

function cancelForm(sale, onDone) {
  openModal(html`
    <form class="modal-body">
      <h2>Cancelar venta #${sale.folio}</h2>
      <p class="muted">Se devolverán los productos al inventario y ${money(sale.total)} ya no contarán como venta.</p>
      <label class="field">Motivo
        <input name="reason" required maxlength="120" autocomplete="off" autofocus>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Volver</button>
        <button class="btn btn-danger">Cancelar venta</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ reason }) => {
      await cancelSale(sale.id, reason.trim());
      close();
      toast(`Venta #${sale.folio} cancelada`);
      onDone();
    });
  });
}

async function detail(id) {
  const sale = await getSale(id);
  const cancelled = sale.status === 'cancelled';
  openModal(html`
    <div class="modal-body">
      <h2>Venta #${sale.folio}</h2>
      <p class="muted">${dateTime(sale.date)} · ${METHODS[sale.method]}${sale.reference && ` · Ref. ${sale.reference}`}</p>
      ${cancelled && html`<p class="notice">✕ Cancelada: ${sale.cancelReason}</p>`}
      <ul class="plain-list">
        ${sale.lines.map((l) => html`
          <li><span>${formatQty(l.qty)} ${l.unit} · ${l.name}</span><span class="mono">${money(l.gross)}</span></li>
        `)}
      </ul>
      ${sale.discount > 0 && html`<div class="sum"><span>Descuento</span><span>−${money(sale.discount)}</span></div>`}
      <div class="sum"><span>Subtotal</span><span>${money(sale.net)}</span></div>
      <div class="sum"><span>IVA</span><span>${money(sale.tax)}</span></div>
      <div class="sum sum-total"><span>Total</span><span>${money(sale.total)}</span></div>
      <div class="modal-actions">
        <button class="btn" data-close>Cerrar</button>
        <button class="btn" data-print>Reimprimir</button>
        ${!cancelled && html`<button class="btn btn-ghost-danger" data-cancel>Cancelar venta</button>`}
      </div>
    </div>
  `, (dialog, close) => {
    dialog.querySelector('[data-print]').addEventListener('click', () => printTicket(sale));
    dialog.querySelector('[data-cancel]')?.addEventListener('click', () => {
      close();
      cancelForm(sale, () => load().catch(showError));
    });
  });
}

export function renderSales(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#vender', 'Vender')}</header>
      <header><h1>Ventas</h1><p class="muted" id="summary"></p></header>
      <div class="toolbar">
        <label class="field-inline">Desde <input type="date" id="from" value="${range.from}"></label>
        <label class="field-inline">Hasta <input type="date" id="to" value="${range.to}"></label>
      </div>
      <div id="table"></div>
    </div>
  `);
  const update = (key) => (event) => {
    if (!event.target.value) return;
    range[key] = event.target.value;
    load().catch(showError);
  };
  root.querySelector('#from').addEventListener('change', update('from'));
  root.querySelector('#to').addEventListener('change', update('to'));

  const table = root.querySelector('#table');
  table.addEventListener('click', (event) => {
    const row = event.target.closest('[data-sale]');
    if (row) detail(row.dataset.sale).catch(showError);
  });
  table.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-sale]');
    if (row && event.key === 'Enter') detail(row.dataset.sale).catch(showError);
  });
  load().catch(showError);
}

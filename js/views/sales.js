import { formatQty, html } from '../core.js';
import { cancelSale, changeSaleMethod, getSale, listCustomers, salesBetween, state } from '../services.js';
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
            <td data-label="Pago">${METHODS[s.method]}${s.methodChanges?.length ? ' ✎' : ''}</td>
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

const changeTime = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

// Solo se corrige mientras la caja de esa venta siga abierta: después del corte ya no.
const canChangeMethod = (sale) => sale.status !== 'cancelled' && !sale.invoiceId && state.shift?.id === sale.shiftId;

async function methodForm(sale, onDone) {
  const customers = await listCustomers();
  // La forma actual no se ofrece, salvo transferencia o fiado (para corregir la referencia o el cliente).
  const options = Object.keys(METHODS)
    .filter((m) => m !== 'credit' || customers.length)
    .filter((m) => m !== sale.method || m === 'transfer' || m === 'credit');
  openModal(html`
    <form class="modal-body">
      <h2>Cambiar forma de pago</h2>
      <p class="muted">Venta #${sale.folio} · ${money(sale.total)} · ahora dice <strong>${METHODS[sale.method]}</strong></p>
      <div class="segmented" role="radiogroup" aria-label="Cómo pagó en realidad">
        ${options.map((m) => html`<label><input type="radio" name="method" value="${m}" required><span>${METHODS[m]}</span></label>`)}
      </div>
      <label class="field" id="ref-field" hidden>Referencia de la transferencia
        <input name="reference" maxlength="60" autocomplete="off" placeholder="Ej. SPEI 482913">
      </label>
      <label class="field" id="customer-field" hidden>¿A quién se le fía?
        <select name="customerId">
          <option value="">Elige un cliente</option>
          ${customers.map((c) => html`<option value="${c.id}">${c.name}</option>`)}
        </select>
      </label>
      <label class="field">¿Por qué se cambia?
        <input name="reason" required maxlength="120" autocomplete="off" placeholder="Ej. Pagó con tarjeta y se registró en efectivo">
      </label>
      <p class="hint">El cambio queda anotado en la venta y se ve en el corte del día.</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Volver</button>
        <button class="btn btn-primary">Guardar cambio</button>
      </div>
    </form>
  `, (dialog, close) => {
    const form = dialog.querySelector('form');
    form.addEventListener('change', () => {
      const method = form.elements.method.value;
      dialog.querySelector('#ref-field').hidden = method !== 'transfer';
      dialog.querySelector('#customer-field').hidden = method !== 'credit';
    });
    onSubmit(form, async ({ method, reference, customerId, reason }) => {
      await changeSaleMethod(sale.id, { method, reference: reference || '', customerId: customerId || null, reason });
      close();
      toast(`Venta #${sale.folio} cambiada a ${METHODS[method]}`);
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
      ${(sale.methodChanges || []).map((c) => html`<p class="notice">Forma de pago cambiada de ${METHODS[c.from]} a ${METHODS[c.to]} · ${changeTime(c.date)} · ${c.reason}</p>`)}
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
      ${canChangeMethod(sale) && html`<button class="btn btn-pill btn-tinted" data-method>Cambiar forma de pago</button>`}
    </div>
  `, (dialog, close) => {
    dialog.querySelector('[data-print]').addEventListener('click', () => printTicket(sale));
    dialog.querySelector('[data-method]')?.addEventListener('click', () => {
      close();
      methodForm(sale, () => load().catch(showError)).catch(showError);
    });
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

// Prepara los datos de cada factura. El timbrado ante el SAT lo hace un PAC, fuera de esta app.
import { html, isValidRFC } from '../core.js';
import { getSaleByFolio, lastSale, listInvoices, salesBetween, saveInvoice, setInvoiceStatus, state, UserError } from '../services.js';
import { backLink, dateTime, dayEnd, dayStart, download, isView, localDate, moneyFull, onSubmit, openModal, setHTML, showError, toast } from '../ui.js';

const REGIMES = {
  601: 'General de Ley', 603: 'Sin fines de lucro', 605: 'Sueldos y salarios', 606: 'Arrendamiento',
  612: 'Persona física', 616: 'Sin obligaciones fiscales', 621: 'Incorporación fiscal', 626: 'RESICO',
};
const USES = { G01: 'Adquisición de mercancías', G03: 'Gastos en general', D01: 'Gastos médicos', S01: 'Sin efectos fiscales' };
const SAT_FORM = { cash: '01 · Efectivo', card: '04 · Tarjeta', transfer: '03 · Transferencia', credit: '99 · Por definir' };

let root;
let tab = 'client';
let sale = null;
let invoices = [];

const options = (map, selected) => Object.entries(map).map(([code, label]) => html`<option value="${code}" ${code === selected ? html`selected` : ''}>${code} · ${label}</option>`);
const statusLabel = (i) => (i.status === 'stamped' ? 'Timbrada' : 'Por timbrar');

function totalsRows(payment, totals) {
  return html`
    <div class="group">
      <div class="row between"><span>Forma de pago</span><span class="muted">${payment}</span></div>
      <div class="row between"><span>Subtotal</span><span class="tabular">${moneyFull(totals.net)}</span></div>
      <div class="row between"><span>IVA</span><span class="tabular">${moneyFull(totals.tax)}</span></div>
      <div class="row between"><strong>Total</strong><strong class="tabular">${moneyFull(totals.total)}</strong></div>
    </div>
  `;
}

function renderRecent() {
  setHTML(root.querySelector('#recent'), invoices.length ? html`
    <p class="group-title">RECIENTES</p>
    <div class="group">
      ${invoices.slice(0, 20).map((i) => html`
        <button class="row row-btn" data-invoice="${i.id}">
          <span class="row-main"><span class="row-title">${i.customer.name}</span><small>${dateTime(i.date)} · ${moneyFull(i.total)}</small></span>
          <span class="pill ${i.status === 'stamped' ? 'pill-good' : 'pill-wait'}">${statusLabel(i)}</span>
        </button>
      `)}
    </div>
  ` : '');
}

function renderClientForm(box) {
  const validSale = sale && sale.status !== 'cancelled' && !sale.invoiceId;
  setHTML(box, html`
    <section class="group pad ticket-pick">
      <div>
        <small class="muted">${sale ? `Ticket ${sale.folio} · ${dateTime(sale.date)}` : 'Sin ticket'}</small>
        <strong class="big-num">${sale ? moneyFull(sale.total) : '—'}</strong>
        ${sale?.invoiceId && html`<small class="alert">▲ Este ticket ya está facturado</small>`}
        ${sale?.status === 'cancelled' && html`<small class="alert">▲ Este ticket está cancelado</small>`}
      </div>
      <form id="find-ticket" class="find-ticket">
        <input name="folio" inputmode="numeric" placeholder="Ticket" aria-label="Número de ticket" autocomplete="off">
        <button class="btn btn-sm btn-tinted">Buscar</button>
      </form>
    </section>
    <form id="invoice" class="stack-gap">
      <section>
        <p class="group-title">DATOS FISCALES DEL CLIENTE</p>
        <div class="group">
          <label class="row between">RFC <input class="inline-input wide" name="rfc" required maxlength="13" autocomplete="off" style="text-transform:uppercase"></label>
          <label class="row between">Razón social <input class="inline-input wide" name="name" required maxlength="200" autocomplete="off"></label>
          <label class="row between">Código postal <input class="inline-input wide" name="zip" required inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="off"></label>
          <label class="row between">Régimen fiscal <select class="inline-select" name="regime">${options(REGIMES, '612')}</select></label>
          <label class="row between">Uso del CFDI <select class="inline-select" name="use">${options(USES, 'G03')}</select></label>
          <label class="row between">Enviar a <input class="inline-input wide" name="email" type="email" maxlength="120" autocomplete="off" placeholder="correo@ejemplo.com"></label>
        </div>
        <p class="hint">Los datos deben coincidir con la constancia de situación fiscal del cliente. Se guardan para la próxima vez.</p>
      </section>
      ${sale && totalsRows(SAT_FORM[sale.method], sale)}
      <button class="btn btn-primary btn-pill" ${validSale ? '' : html`disabled`}>Guardar para timbrar</button>
    </form>
  `);

  box.querySelector('#find-ticket').addEventListener('submit', async (event) => {
    event.preventDefault();
    const folio = Number(new FormData(event.target).get('folio'));
    try {
      const found = Number.isInteger(folio) && folio > 0 ? await getSaleByFolio(folio) : null;
      if (!found) throw new UserError('No existe ese ticket.');
      sale = found;
      renderClientForm(box);
    } catch (error) { showError(error); }
  });

  const form = box.querySelector('#invoice');
  form.elements.rfc.addEventListener('change', () => {
    const rfc = form.elements.rfc.value.trim().toUpperCase();
    const known = invoices.find((i) => i.customer.rfc === rfc);
    if (!known) return;
    for (const key of ['name', 'zip', 'regime', 'use', 'email']) form.elements[key].value = known.customer[key] || '';
  });
  onSubmit(form, async (values) => {
    if (!validSale) throw new UserError('Busca un ticket que se pueda facturar.');
    const rfc = values.rfc.trim().toUpperCase();
    if (!isValidRFC(rfc)) throw new UserError('El RFC no tiene un formato válido.');
    await saveInvoice({
      type: 'client',
      saleIds: [sale.id],
      paymentForm: SAT_FORM[sale.method],
      customer: { rfc, name: values.name.trim(), zip: values.zip, regime: values.regime, use: values.use, email: values.email.trim() },
    });
    toast('Guardada para timbrar');
    sale = null;
    renderView();
  });
}

function renderGlobalForm(box) {
  const today = new Date();
  const first = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  setHTML(box, html`
    <form id="global" class="stack-gap">
      <section>
        <p class="group-title">PERIODO</p>
        <div class="group">
          <label class="row between">Desde <input class="inline-input wide" type="date" name="from" value="${first}" required></label>
          <label class="row between">Hasta <input class="inline-input wide" type="date" name="to" value="${localDate(today)}" required></label>
        </div>
        <p class="hint">Incluye los tickets del periodo que no se han facturado a un cliente. Se emite a Público en general.</p>
      </section>
      <div id="global-totals"></div>
      <button class="btn btn-primary btn-pill" id="global-save">Guardar para timbrar</button>
    </form>
  `);
  const form = box.querySelector('#global');
  let pending = [];
  const refresh = async () => {
    const { from, to } = Object.fromEntries(new FormData(form));
    if (!from || !to) return;
    const sales = await salesBetween(dayStart(from), dayEnd(to));
    pending = sales.filter((s) => s.status !== 'cancelled' && !s.invoiceId);
    const sum = (key) => pending.reduce((a, s) => a + s[key], 0);
    setHTML(box.querySelector('#global-totals'), totalsRows(`${pending.length} tickets`, { net: sum('net'), tax: sum('tax'), total: sum('total') }));
    box.querySelector('#global-save').disabled = !pending.length;
  };
  form.addEventListener('change', () => refresh().catch(showError));
  refresh().catch(showError);
  onSubmit(form, async ({ from, to }) => {
    await saveInvoice({
      type: 'global',
      saleIds: pending.map((s) => s.id),
      paymentForm: 'Varias',
      period: { from, to },
      customer: { rfc: 'XAXX010101000', name: 'Público en general', zip: state.settings.zip, regime: '616', use: 'S01', email: '' },
    });
    toast('Guardada para timbrar');
    renderView();
  });
}

function invoiceSheet(id) {
  const invoice = invoices.find((i) => i.id === id);
  const c = invoice.customer;
  const isPending = invoice.status === 'pending';
  openModal(html`
    <div class="modal-body">
      <h2>${c.name}</h2>
      <p class="muted">${c.rfc} · ${statusLabel(invoice)}</p>
      <div class="group spaced">
        <div class="row between"><span>Tickets</span><span class="muted">${invoice.folios.length > 6 ? `${invoice.folios.length} tickets` : invoice.folios.join(', ')}</span></div>
        <div class="row between"><span>Subtotal</span><span class="tabular">${moneyFull(invoice.net)}</span></div>
        <div class="row between"><span>IVA</span><span class="tabular">${moneyFull(invoice.tax)}</span></div>
        <div class="row between"><strong>Total</strong><strong class="tabular">${moneyFull(invoice.total)}</strong></div>
      </div>
      <button class="btn btn-primary btn-pill" data-json>Descargar datos</button>
      ${isPending && html`<button class="btn btn-pill btn-tinted" data-stamped>Ya la timbré</button>`}
      <button class="btn btn-plain" data-close>Cerrar</button>
    </div>
  `, (dialog, close) => {
    dialog.querySelector('[data-json]').addEventListener('click', () => {
      download(`factura-${c.rfc}-${invoice.date.slice(0, 10)}.json`, JSON.stringify(invoice, null, 2), 'application/json');
    });
    dialog.querySelector('[data-stamped]')?.addEventListener('click', async () => {
      await setInvoiceStatus(id, 'stamped').catch(showError);
      close();
      renderView();
    });
  });
}

async function renderView() {
  invoices = await listInvoices();
  if (tab === 'client' && !sale) {
    const latest = await lastSale();
    if (latest && !latest.invoiceId && latest.status !== 'cancelled') sale = latest;
  }
  if (!isView('facturas')) return;
  const box = root.querySelector('#form-box');
  if (tab === 'client') renderClientForm(box);
  else renderGlobalForm(box);
  renderRecent();
}

export function renderFacturas(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#corte', 'Corte')}</header>
      <h1>Facturas</h1>
      <p class="notice-soft">Aquí preparas la factura. Para que tenga validez, debes timbrarla con tu proveedor (PAC) o en el portal del SAT.</p>
      <div class="tabs tabs-2" id="tabs">
        <button data-tab="client" aria-pressed="${tab === 'client'}">A un cliente</button>
        <button data-tab="global" aria-pressed="${tab === 'global'}">Factura global</button>
      </div>
      <div id="form-box" class="stack-gap"></div>
      <div id="recent"></div>
    </div>
  `);
  root.querySelector('#tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    tab = button.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', b === button));
    renderView().catch(showError);
  });
  root.querySelector('#recent').addEventListener('click', (event) => {
    const row = event.target.closest('[data-invoice]');
    if (row) invoiceSheet(row.dataset.invoice);
  });
  sale = null;
  renderView().catch(showError);
}

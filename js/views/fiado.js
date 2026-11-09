import { html, normalize, parseMoney } from '../core.js';
import { creditHistory, createCustomer, deleteCustomer, listCustomers, payCredit, UserError } from '../services.js';
import { chevron, confirmDialog, dateTime, isView, METHODS, money, monogram, onSubmit, openModal, setHTML, showError, toast } from '../ui.js';

let root;
let customers = [];
let text = '';

function renderList() {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  const rows = customers.filter((c) => words.every((w) => normalize(c.name).includes(w)));
  setHTML(root.querySelector('#list'), rows.length ? html`
    <div class="group">
      ${rows.map((c) => html`
        <button class="row row-btn" data-customer="${c.id}">
          ${monogram(c.name)}
          <span class="row-main"><span class="row-title">${c.name}</span><small>${c.balance > 0 ? 'Debe' : c.balance < 0 ? 'Saldo a favor' : 'Al corriente'}</small></span>
          <strong class="row-qty ${c.balance > 0 ? 'alert' : ''}">${money(Math.abs(c.balance))}</strong>
          ${chevron}
        </button>
      `)}
    </div>
  ` : html`<p class="empty muted">${customers.length ? 'Sin resultados.' : 'Aquí aparecerán las personas a las que les fías. Elige Fiado al cobrar o agrega un cliente.'}</p>`);
}

async function load() {
  customers = await listCustomers();
  if (!isView('fiado')) return;
  const debtors = customers.filter((c) => c.balance > 0);
  const owed = debtors.reduce((a, c) => a + c.balance, 0);
  setHTML(root.querySelector('#hero'), html`
    <section class="hero-card">
      <small>Te deben</small>
      <p class="hero-amount">${money(owed)}</p>
      <p class="muted hero-sub">${debtors.length} ${debtors.length === 1 ? 'cliente' : 'clientes'} con deuda</p>
    </section>
  `);
  renderList();
}

function newCustomer() {
  openModal(html`
    <form class="modal-body">
      <h2>Cliente nuevo</h2>
      <label class="field">Nombre <input name="name" required maxlength="80" autocomplete="off" autofocus></label>
      <label class="field">Teléfono (opcional) <input name="phone" inputmode="tel" maxlength="20" autocomplete="off"></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ name, phone }) => {
      await createCustomer(name.trim(), phone.trim());
      close();
      load().catch(showError);
    });
  });
}

async function customerSheet(id) {
  const customer = customers.find((c) => c.id === id);
  const history = await creditHistory(id);
  const label = { charge: 'Fiado', payment: 'Abono', void: 'Cancelado' };
  openModal(html`
    <form class="modal-body">
      <div class="product-hero compact">
        ${monogram(customer.name, 'mono-xl')}
        <h2>${customer.name}</h2>
        <p class="muted">${customer.phone || 'Sin teléfono'}</p>
        <p class="hero-amount ${customer.balance > 0 ? '' : 'good'}">${money(Math.abs(customer.balance))}</p>
        ${customer.balance < 0 && html`<p class="muted">Saldo a favor del cliente</p>`}
      </div>
      ${customer.balance > 0 && html`
        <label class="field">Abono <input name="amount" inputmode="decimal" autocomplete="off" required></label>
        <div class="segmented" role="radiogroup" aria-label="Cómo pagó">
          ${['cash', 'card', 'transfer'].map((m, i) => html`<label><input type="radio" name="method" value="${m}" ${i === 0 ? html`checked` : ''}><span>${METHODS[m]}</span></label>`)}
        </div>
        <button class="btn btn-primary btn-pill">Registrar abono</button>
      `}
      ${history.length > 0 && html`
        <p class="group-title">HISTORIAL</p>
        <div class="group">
          ${history.slice(0, 20).map((m) => html`
            <div class="row">
              <span class="row-main"><span class="row-title">${label[m.type]} · ${m.note}</span><small>${dateTime(m.date)}</small></span>
              <strong class="tabular">${m.type === 'charge' ? '+' : '−'}${money(m.amount)}</strong>
            </div>
          `)}
        </div>
      `}
      ${customer.balance === 0
        ? html`<button type="button" class="btn btn-plain btn-ghost-danger" data-delete>Eliminar cliente</button>`
        : html`<p class="hint">Para eliminar este cliente, su saldo debe estar en $0.</p>`}
      <button type="button" class="btn btn-plain" data-close>Cerrar</button>
    </form>
  `, (dialog, close) => {
    dialog.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Eliminar cliente',
        message: `"${customer.name}" y su historial de fiado se borrarán. Las ventas ya registradas se conservan.`,
        action: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteCustomer(id);
        close();
        toast('Cliente eliminado');
        load().catch(showError);
      } catch (error) { showError(error); }
    });
    onSubmit(dialog.querySelector('form'), async ({ amount, method }) => {
      const cents = parseMoney(amount);
      if (!cents) throw new UserError('Escribe un monto mayor a cero.');
      await payCredit(id, cents, method);
      close();
      toast('Abono registrado');
      load().catch(showError);
    });
  });
}

export function renderFiado(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="title-row">
        <h1>Fiado</h1>
        <button class="round-btn" id="new" aria-label="Cliente nuevo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </header>
      <div id="hero"></div>
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6C6C70" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input id="filter" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${text}">
      </div>
      <div id="list"></div>
    </div>
  `);
  root.querySelector('#new').addEventListener('click', newCustomer);
  root.querySelector('#filter').addEventListener('input', (e) => { text = e.target.value; renderList(); });
  root.querySelector('#list').addEventListener('click', (event) => {
    const row = event.target.closest('[data-customer]');
    if (row) customerSheet(row.dataset.customer).catch(showError);
  });
  load().catch(showError);
}

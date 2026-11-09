import { aggregateSales, formatQty, html, parseMoney } from '../core.js';
import { addCashMove, closedShifts, closeShift, salesBetween, shiftDetails, state, UserError } from '../services.js';
import { confirmDialog, dateTime, dayEnd, dayStart, isView, localDate, METHODS, money, onSubmit, openModal, promptOpenShift, setHTML, showError, toast } from '../ui.js';

let root;
const rerender = () => { if (isView('corte')) renderCorte(root); };
const SERIES = ['cash', 'card', 'transfer', 'credit'];

function difference(cents) {
  if (cents === 0) return html`<strong class="good">✓ Cuadra</strong>`;
  return cents > 0
    ? html`<strong class="alert">▲ Sobran ${money(cents)}</strong>`
    : html`<strong class="alert">▲ Faltan ${money(-cents)}</strong>`;
}

function moveForm(type) {
  const isIn = type === 'in';
  openModal(html`
    <form class="modal-body">
      <h2>${isIn ? 'Meter efectivo' : 'Sacar efectivo'}</h2>
      <label class="field">Monto <input name="amount" inputmode="decimal" required autocomplete="off" autofocus></label>
      <label class="field">Motivo <input name="reason" required maxlength="120" autocomplete="off" placeholder="${isIn ? 'Ej. Cambio adicional' : 'Ej. Pago a proveedor'}"></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Registrar</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ amount, reason }) => {
      const cents = parseMoney(amount);
      if (!cents) throw new UserError('Escribe un monto mayor a cero.');
      await addCashMove(type, cents, reason.trim());
      close();
      toast('Movimiento registrado');
      rerender();
    });
  });
}

function hero(report) {
  const total = Object.values(report.byMethod).reduce((a, b) => a + b, 0);
  const active = SERIES.filter((key) => report.byMethod[key] > 0 || key !== 'transfer');
  return html`
    <section class="hero-card">
      <small>Vendido hoy</small>
      <p class="hero-amount">${money(report.total)}</p>
      <p class="good hero-sub">Ganancia estimada ${money(report.profit)}</p>
      ${total > 0 && html`
        <div class="stack" role="img" aria-label="Reparto del dinero por forma de pago">
          ${SERIES.filter((key) => report.byMethod[key] > 0).map((key) => html`<i class="s-${key}" style="flex:${report.byMethod[key]}" title="${METHODS[key]}: ${money(report.byMethod[key])}"></i>`)}
        </div>
      `}
      <div class="legend">
        ${active.map((key) => html`<div><span><i class="s-${key}"></i>${METHODS[key]}</span><strong>${money(report.byMethod[key])}</strong></div>`)}
      </div>
    </section>
  `;
}

function topSold(report) {
  return html`
    <section>
      <p class="group-title">LO MÁS VENDIDO</p>
      <div class="group">
        ${report.topProducts.length ? [...report.topProducts].sort((a, b) => b.qty - a.qty).slice(0, 5).map((p) => html`
          <div class="row between"><span>${p.name}</span><span class="muted tabular">${formatQty(p.qty)}</span></div>
        `) : html`<p class="row muted">Todavía no hay ventas hoy.</p>`}
      </div>
    </section>
  `;
}

function historySection(history) {
  if (!history.length) return '';
  return html`
    <section>
      <p class="group-title">CORTES ANTERIORES</p>
      <div class="group">
        ${history.slice(0, 15).map((s) => html`
          <div class="row">
            <span class="row-main"><span class="row-title">${dateTime(s.closedAt)}</span><small>Vendido ${money(s.summary.total)} · contaste ${money(s.counted)}</small></span>
            ${difference(s.difference)}
          </div>
        `)}
      </div>
    </section>
  `;
}

async function load() {
  const today = localDate();
  const [sales, history] = await Promise.all([salesBetween(dayStart(today), dayEnd(today)), closedShifts()]);
  if (!isView('corte')) return;
  const report = aggregateSales(sales);
  const content = root.querySelector('#content');
  const shift = state.shift;

  if (!shift) {
    setHTML(content, html`
      ${hero(report)}
      <section class="group pad center">
        <h2>La caja está cerrada</h2>
        <p class="muted">Ábrela para empezar a cobrar.</p>
        <button class="btn btn-primary btn-pill" id="open">Abrir caja</button>
      </section>
      ${topSold(report)}
      <a class="btn btn-pill btn-tinted" href="#facturas">Emitir facturas</a>
      ${historySection(history)}
    `);
    root.querySelector('#open').addEventListener('click', () => promptOpenShift(rerender));
    return;
  }

  const { summary, cashMoves } = await shiftDetails(shift);
  if (!isView('corte')) return;
  setHTML(content, html`
    ${hero(report)}
    <section>
      <p class="group-title">EFECTIVO EN CAJA</p>
      <div class="group">
        <div class="row between"><span>Fondo inicial</span><span class="muted tabular">${money(summary.openingFloat)}</span></div>
        <div class="row between"><span>Ventas en efectivo</span><span class="muted tabular">${money(summary.cashSales)}</span></div>
        ${cashMoves.map((m) => html`
          <div class="row between"><span>${m.reason}</span><span class="muted tabular">${m.type === 'in' ? '+' : '−'}${money(m.amount)}</span></div>
        `)}
        <div class="row between"><strong>Debe haber</strong><strong class="tabular">${money(summary.expected)}</strong></div>
        <label class="row between">Contaste
          <input id="counted" class="inline-input" inputmode="decimal" autocomplete="off" placeholder="$0">
        </label>
        <div class="row between"><span>Diferencia</span><span id="diff" class="muted">—</span></div>
      </div>
      <div class="row-gap two-btns under">
        <button class="btn" data-move="in">Meter efectivo</button>
        <button class="btn" data-move="out">Sacar efectivo</button>
      </div>
    </section>
    ${topSold(report)}
    <a class="btn btn-pill btn-tinted" href="#facturas">Emitir facturas</a>
    <button class="btn btn-primary btn-pill" id="close">Cerrar el día</button>
    ${historySection(history)}
  `);

  const counted = root.querySelector('#counted');
  counted.addEventListener('input', () => {
    const cents = parseMoney(counted.value);
    setHTML(root.querySelector('#diff'), cents === null ? '—' : difference(cents - summary.expected));
  });
  root.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => moveForm(b.dataset.move)));
  root.querySelector('#close').addEventListener('click', async () => {
    const cents = parseMoney(counted.value);
    if (cents === null) {
      toast('Primero escribe cuánto contaste.', 'error');
      counted.focus();
      return;
    }
    const diff = cents - summary.expected;
    const ok = await confirmDialog({
      title: 'Cerrar el día',
      message: diff === 0 ? 'La caja cuadra exacto.' : `Hay una diferencia de ${money(Math.abs(diff))}. ¿Cerrar de todos modos?`,
      action: 'Cerrar caja',
    });
    if (!ok) return;
    try {
      await closeShift(cents);
      toast('Día cerrado');
      rerender();
    } catch (error) { showError(error); }
  });
}

export function renderCorte(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header>
        <p class="eyebrow">Hoy</p>
        <h1>Corte de caja</h1>
      </header>
      <div id="content" class="stack-gap"></div>
    </div>
  `);
  load().catch(showError);
}

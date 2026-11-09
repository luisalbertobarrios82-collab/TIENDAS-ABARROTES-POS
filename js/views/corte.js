import { aggregateSales, formatQty, html, parseMoney } from '../core.js';
import { addCashMove, closedShifts, closeShift, getShift, salesBetween, shiftDetails, state, UserError } from '../services.js';
import { backLink, chevron, confirmDialog, dateTime, dayEnd, dayStart, isView, localDate, METHODS, money, onSubmit, openModal, promptOpenShift, setHTML, showError, toast } from '../ui.js';

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

function hero(report, label = 'Vendido hoy') {
  const total = Object.values(report.byMethod).reduce((a, b) => a + b, 0);
  const active = SERIES.filter((key) => report.byMethod[key] > 0 || key !== 'transfer');
  return html`
    <section class="hero-card">
      <small>${label}</small>
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

const TOP_VISIBLE = 5;

function topSold(report) {
  const sold = [...report.topProducts].sort((a, b) => b.qty - a.qty || b.total - a.total);
  const row = (p) => html`
    <div class="row between"><span>${p.name}</span><span class="muted tabular">${formatQty(p.qty)} ${p.unit === 'pza' ? 'pz' : p.unit}</span></div>
  `;
  const hiddenCount = sold.length - TOP_VISIBLE;
  return html`
    <section>
      <p class="group-title">LO MÁS VENDIDO</p>
      <div class="group">
        ${sold.length ? sold.slice(0, TOP_VISIBLE).map(row) : html`<p class="row muted">Todavía no hay ventas hoy.</p>`}
        ${hiddenCount > 0 && html`
          <div class="more-rows" id="more-sold" hidden>${sold.slice(TOP_VISIBLE).map(row)}</div>
          <button type="button" class="row row-btn link-row" id="toggle-sold" aria-expanded="false" aria-controls="more-sold" data-count="${hiddenCount}">Ver más (${hiddenCount})</button>
        `}
      </div>
    </section>
  `;
}

function toggleSold(button) {
  const more = root.querySelector('#more-sold');
  more.hidden = !more.hidden;
  button.setAttribute('aria-expanded', String(!more.hidden));
  button.textContent = more.hidden ? `Ver más (${button.dataset.count})` : 'Ver menos';
}

function historySection(history) {
  if (!history.length) return '';
  return html`
    <section>
      <p class="group-title">CORTES ANTERIORES</p>
      <div class="group">
        ${history.map((s) => html`
          <a class="row row-btn" href="#corte-detalle/${s.id}">
            <span class="row-main"><span class="row-title">${dateTime(s.closedAt)}</span><small>Vendido ${money(s.summary.total)} · contaste ${money(s.counted)}</small></span>
            ${difference(s.difference)}
            ${chevron}
          </a>
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

async function loadDetail(id) {
  const shift = await getShift(id);
  if (!shift || shift.status !== 'closed') {
    location.hash = '#corte';
    return;
  }
  const { sales, cashMoves } = await shiftDetails(shift);
  if (!isView('corte-detalle')) return;

  const report = aggregateSales(sales);
  const { summary, difference: diff } = shift;
  const cancelledLater = sales.filter((s) => s.cancelledAt && s.cancelledAt > shift.closedAt).length;
  const day = new Date(shift.openedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const diffLabel = diff < 0 ? 'Cuánto faltó' : diff > 0 ? 'Cuánto sobró' : 'Diferencia';

  setHTML(root.querySelector('#detail'), html`
    <header>
      <p class="eyebrow">Corte de caja</p>
      <h1>${day}</h1>
      <p class="muted">Abrió ${dateTime(shift.openedAt)} · Cerró ${dateTime(shift.closedAt)}</p>
    </header>
    ${hero(report, 'Vendido')}
    <section>
      <p class="group-title">EFECTIVO EN CAJA</p>
      <div class="group">
        <div class="row between"><span>Con cuánto iniciaste</span><strong class="tabular">${money(summary.openingFloat)}</strong></div>
        <div class="row between"><span>Ventas en efectivo</span><span class="muted tabular">${money(summary.cashSales)}</span></div>
        ${[...cashMoves].reverse().map((m) => html`
          <div class="row between"><span>${m.reason}</span><span class="muted tabular">${m.type === 'in' ? '+' : '−'}${money(m.amount)}</span></div>
        `)}
        <div class="row between"><span>Debía haber</span><span class="muted tabular">${money(summary.expected)}</span></div>
        <div class="row between"><span>Cuánto tenías</span><strong class="tabular">${money(shift.counted)}</strong></div>
        <div class="row between"><strong>${diffLabel}</strong>${difference(diff)}</div>
      </div>
      ${shift.note && html`<p class="hint">Nota: ${shift.note}</p>`}
    </section>
    <section>
      <p class="group-title">LO QUE SE VENDIÓ</p>
      <div class="group">
        ${report.topProducts.length ? report.topProducts.map((p) => html`
          <div class="row">
            <span class="row-main"><span class="row-title">${p.name}</span><small>${formatQty(p.qty)} ${p.unit === 'pza' ? 'pz' : p.unit}</small></span>
            <strong class="tabular">${money(p.total)}</strong>
          </div>
        `) : html`<p class="row muted">No hubo ventas en este corte.</p>`}
        ${report.topProducts.length > 0 && html`<div class="row between"><strong>Total · ${report.tickets} ${report.tickets === 1 ? 'ticket' : 'tickets'}</strong><strong class="tabular">${money(report.total)}</strong></div>`}
      </div>
      ${cancelledLater > 0 && html`<p class="hint">${cancelledLater} ${cancelledLater === 1 ? 'venta se canceló' : 'ventas se cancelaron'} después del cierre y no aparece${cancelledLater === 1 ? '' : 'n'} en esta lista. El efectivo muestra lo que había al cerrar.</p>`}
    </section>
  `);
}

export function renderCorteDetail(container, id) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#corte', 'Corte')}</header>
      <div id="detail" class="stack-gap"></div>
    </div>
  `);
  loadDetail(id).catch(showError);
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
  root.querySelector('#content').addEventListener('click', (event) => {
    const button = event.target.closest('#toggle-sold');
    if (button) toggleSold(button);
  });
  load().catch(showError);
}

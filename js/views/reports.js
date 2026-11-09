import { aggregateSales, formatQty, html } from '../core.js';
import { salesBetween, state } from '../services.js';
import { backLink, dayEnd, dayStart, isView, localDate, METHODS, money, setHTML, showError } from '../ui.js';

const PERIODS = { today: 'Hoy', week: '7 días', month: '30 días' };
const DAYS = { today: 1, week: 7, month: 30 };
let period = 'week';
let root;

function dayList(count) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return localDate(d);
  });
}

function barChart(days, byDay) {
  const values = days.map((day) => ({ day, value: byDay[day] || 0 }));
  const max = Math.max(...values.map((v) => v.value), 1);
  const short = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const every = Math.ceil(days.length / 7);
  return html`
    <div class="bars" role="img" aria-label="Ventas por día. El detalle está en la tabla de abajo.">
      ${values.map(({ day, value }, i) => html`
        <div class="bar-col" tabindex="0" data-tip="${short(day)}: ${money(value)}">
          <div class="bar-track"><div class="bar" style="height:${value ? Math.max((value / max) * 100, 2) : 0}%"></div></div>
          <span class="bar-label">${(days.length - 1 - i) % every === 0 ? short(day) : ''}</span>
        </div>
      `)}
    </div>
    <details class="chart-table">
      <summary>Ver como tabla</summary>
      <table class="table">
        <thead><tr><th>Día</th><th class="num">Ventas</th></tr></thead>
        <tbody>${values.map(({ day, value }) => html`<tr><td data-label="Día">${short(day)}</td><td data-label="Ventas" class="num">${money(value)}</td></tr>`)}</tbody>
      </table>
    </details>
  `;
}

const stat = (label, value) => html`<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

async function load() {
  const days = dayList(DAYS[period]);
  const sales = await salesBetween(dayStart(days[0]), dayEnd(days[days.length - 1]));
  if (!isView('reportes')) return;
  const report = aggregateSales(sales);
  const low = state.products.filter((p) => p.stock <= p.minStock);

  setHTML(root.querySelector('#content'), html`
    <div class="stats">
      ${stat('Ventas', money(report.total))}
      ${stat('Tickets', report.tickets)}
      ${stat('Ticket promedio', money(report.average))}
      ${stat('Utilidad bruta', money(report.profit))}
      ${stat('IVA cobrado', money(report.tax))}
      ${stat('Canceladas', report.cancelled)}
    </div>
    ${period !== 'today' && html`<section class="panel"><h2>Ventas por día</h2>${barChart(days, report.byDay)}</section>`}
    <div class="two-col">
      <section class="panel">
        <h2>Productos más vendidos</h2>
        ${report.topProducts.length ? html`
          <ul class="plain-list">
            ${report.topProducts.slice(0, 10).map((p) => html`
              <li><span>${p.name} <span class="muted">· ${formatQty(p.qty)}</span></span><span class="mono">${money(p.total)}</span></li>
            `)}
          </ul>
        ` : html`<p class="muted">Sin ventas en este periodo.</p>`}
      </section>
      <div>
        <section class="panel">
          <h2>Formas de pago</h2>
          <ul class="plain-list">
            ${Object.entries(METHODS).map(([key, label]) => html`
              <li><span>${label}</span><span class="mono">${money(report.byMethod[key] || 0)}</span></li>
            `)}
          </ul>
        </section>
        <section class="panel">
          <h2>Por surtir (${low.length})</h2>
          ${low.length ? html`
            <ul class="plain-list">
              ${low.slice(0, 10).map((p) => html`
                <li><span>${p.name}</span><span class="mono badge-low">▲ ${formatQty(p.stock)} ${p.unit}</span></li>
              `)}
            </ul>
          ` : html`<p class="muted">Todo el inventario está en nivel correcto.</p>`}
        </section>
      </div>
    </div>
  `);
}

export function renderReports(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#vender', 'Vender')}</header>
      <h1>Reportes</h1>
      <div class="chips" id="periods">
        ${Object.entries(PERIODS).map(([key, label]) => html`<button class="chip" data-period="${key}" aria-pressed="${key === period}">${label}</button>`)}
      </div>
      <div id="content"></div>
    </div>
  `);
  root.querySelector('#periods').addEventListener('click', (event) => {
    const button = event.target.closest('[data-period]');
    if (!button) return;
    period = button.dataset.period;
    root.querySelectorAll('[data-period]').forEach((b) => b.setAttribute('aria-pressed', b === button));
    load().catch(showError);
  });
  load().catch(showError);
}

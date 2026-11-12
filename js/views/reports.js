import { aggregateSales, formatPercent, formatQty, html } from '../core.js';
import { salesBetween, state } from '../services.js';
import { backLink, dayEnd, dayStart, isView, localDate, METHODS, money, setHTML, showError } from '../ui.js';

const PERIODS = { today: 'Hoy', week: '7 días', month: '30 días' };
const DAYS = { today: 1, week: 7, month: 30 };
// Orden de abajo hacia arriba en cada barra: lo que costó, el IVA y lo que queda.
const SERIES = [
  { key: 'cost', label: 'Costo', cls: 'seg-cost' },
  { key: 'tax', label: 'IVA', cls: 'seg-tax' },
  { key: 'profit', label: 'Ganancia', cls: 'seg-profit' },
];
let period = 'week';
let root;

function dayList(count) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return localDate(d);
  });
}

const empty = { total: 0, cost: 0, tax: 0, profit: 0 };

function dayBuckets(days, byDay) {
  const short = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return days.map((day) => ({ label: short(day), ...(byDay[day] || empty) }));
}

// Hoy: una barra por hora, de las 8 a las 20 h o más si hubo ventas fuera de ese horario.
function hourBuckets(byHour) {
  const hours = Object.keys(byHour).map(Number);
  const from = Math.min(8, ...hours);
  const to = Math.max(20, ...hours);
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${from + i} h`, ...(byHour[from + i] || empty) }));
}

function tipFor(b) {
  const lines = [b.label, `Ventas: ${money(b.total)}`, `Costo: ${money(b.cost)}`, `IVA: ${money(b.tax)}`];
  lines.push(b.profit < 0 ? `Pérdida: ${money(-b.profit)}` : `Ganancia: ${money(b.profit)}`);
  return lines.join('\n');
}

function stackChart(buckets, report, firstColumn) {
  const height = (b) => b.cost + b.tax + Math.max(b.profit, 0);
  const max = Math.max(...buckets.map(height), 1);
  const every = Math.ceil(buckets.length / 7);
  return html`
    <div class="chart-legend">
      ${SERIES.map((s) => html`
        <div><span><i class="${s.cls}"></i>${s.label}</span><strong>${money(report[s.key])}</strong></div>
      `)}
    </div>
    <div class="bars stacked" role="img" aria-label="Ventas separadas en costo, IVA y ganancia. El detalle está en la tabla de abajo.">
      ${buckets.map((b, i) => html`
        <div class="bar-col" tabindex="0" data-tip="${tipFor(b)}">
          <div class="bar-track">
            <div class="bar-stack" style="height:${height(b) ? Math.max((height(b) / max) * 100, 2) : 0}%">
              ${SERIES.map((s) => {
                const value = Math.max(b[s.key], 0);
                return value ? html`<i class="${s.cls}" style="flex:${value}"></i>` : '';
              })}
            </div>
          </div>
          <span class="bar-label">${(buckets.length - 1 - i) % every === 0 ? b.label : ''}</span>
        </div>
      `)}
    </div>
    <details class="chart-table">
      <summary>Ver como tabla</summary>
      <table class="table">
        <thead><tr><th>${firstColumn}</th><th class="num">Ventas</th><th class="num">Costo</th><th class="num">IVA</th><th class="num">Ganancia</th></tr></thead>
        <tbody>${buckets.filter((b) => b.total).map((b) => html`
          <tr>
            <td data-label="${firstColumn}">${b.label}</td>
            <td data-label="Ventas" class="num">${money(b.total)}</td>
            <td data-label="Costo" class="num">${money(b.cost)}</td>
            <td data-label="IVA" class="num">${money(b.tax)}</td>
            <td data-label="Ganancia" class="num">${money(b.profit)}</td>
          </tr>
        `)}</tbody>
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
  const isToday = period === 'today';
  const buckets = isToday ? hourBuckets(report.byHour) : dayBuckets(days, report.byDay);

  setHTML(root.querySelector('#content'), html`
    <div class="stats">
      ${stat('Ventas', money(report.total))}
      ${stat('Costo de lo vendido', money(report.cost))}
      ${stat('Ganancia', money(report.profit))}
      ${stat('Margen', report.margin === null ? '—' : formatPercent(report.margin))}
      ${stat('Tickets', report.tickets)}
      ${stat('Ticket promedio', money(report.average))}
      ${stat('IVA cobrado', money(report.tax))}
      ${stat('Canceladas', report.cancelled)}
    </div>
    <section class="panel">
      <h2>${isToday ? 'Ventas por hora' : 'Ventas por día'}</h2>
      ${report.tickets
        ? stackChart(buckets, report, isToday ? 'Hora' : 'Día')
        : html`<p class="muted">Sin ventas en este periodo.</p>`}
      <p class="hint">Cada barra es lo vendido: abajo lo que te costó, en medio el IVA y arriba tu ganancia.</p>
    </section>
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

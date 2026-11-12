// Importador de productos: sube el Excel o CSV de la tienda, asocia columnas, revisa e importa.
import { formatQty, html } from '../core.js';
import {
  buildImportRows, detectHeaderRow, guessMapping, IMPORT_FIELDS, mappingSignature, missingRequired,
} from '../import-map.js';
import { getImportMapping, importProducts, saveImportMapping, UserError } from '../services.js';
import { backLink, download, isView, money, setHTML, showError, toast } from '../ui.js';
import { readSpreadsheet, SpreadsheetError } from '../xlsx-read.js';
import { buildXlsx, columnName, XLSX_MIME } from '../xlsx.js';

let root;
let job = null; // { fileName, sheets, sheetIndex, headerIndex, mapping, mode }
const PREVIEW_ROWS = 8;
const MAX_ERRORS = 30;

const TEMPLATE_COLUMNS = [
  { header: 'Código de barras', width: 20, type: 'text' },
  { header: 'Nombre', width: 32, type: 'text' },
  { header: 'Categoría', width: 18, type: 'text' },
  { header: 'Precio de venta', width: 15, type: 'money' },
  { header: 'Costo', width: 12, type: 'money' },
  { header: 'Existencias', width: 12, type: 'qty' },
  { header: 'Existencia mínima', width: 17, type: 'qty' },
  { header: 'Unidad', width: 10, type: 'text' },
  { header: 'IVA', width: 8, type: 'text' },
  { header: 'Caducidad', width: 12, type: 'text' },
  { header: 'Piezas por caja', width: 15, type: 'qty' },
];

const sheet = () => job.sheets[job.sheetIndex];

function columnCount() {
  const rows = sheet().rows.slice(job.headerIndex, job.headerIndex + 300);
  return Math.max(0, ...rows.map((row) => row.length));
}

const headers = () => Array.from({ length: columnCount() }, (_, i) => sheet().rows[job.headerIndex]?.[i] ?? '');

function samples(col) {
  const values = [];
  for (const row of sheet().rows.slice(job.headerIndex + 1, job.headerIndex + 60)) {
    const value = row[col];
    if (value !== '' && value !== undefined && value !== null) values.push(String(value).slice(0, 28));
    if (values.length === 2) break;
  }
  return values;
}

async function prepareSheet() {
  job.headerIndex = detectHeaderRow(sheet().rows);
  await prepareMapping();
}

async function prepareMapping() {
  const list = headers();
  const remembered = await getImportMapping(mappingSignature(list));
  job.mapping = remembered && remembered.length === list.length ? remembered : guessMapping(list);
  job.remembered = Boolean(remembered && remembered.length === list.length);
}

function uploadStep() {
  return html`
    <section class="group pad stack-gap">
      <p class="muted">Sube el Excel (.xlsx) o CSV de la tienda tal como lo tienen. La app reconoce las columnas y te deja revisar todo antes de guardar.</p>
      <label class="btn btn-primary btn-pill">Elegir archivo
        <input id="file" type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only">
      </label>
      <button type="button" class="btn btn-pill btn-tinted" id="template">Descargar plantilla de Excel</button>
    </section>
    <p class="hint">¿Tienes un archivo .xls antiguo? Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".</p>
  `;
}

function mappingStep() {
  const list = headers();
  return html`
    <section class="group pad stack-gap">
      <div class="file-line">
        <span class="row-main"><strong>${job.fileName}</strong><small>${sheet().rows.length} filas leídas</small></span>
        <button type="button" class="link" id="change-file">Cambiar</button>
      </div>
      ${job.sheets.length > 1 && html`
        <label class="field">Hoja
          <select id="sheet">${job.sheets.map((s, i) => html`<option value="${i}" ${i === job.sheetIndex ? html`selected` : ''}>${s.name}</option>`)}</select>
        </label>
      `}
      <label class="field">Fila de los encabezados
        <select id="header-row">
          ${sheet().rows.slice(0, 20).map((row, i) => html`
            <option value="${i}" ${i === job.headerIndex ? html`selected` : ''}>Fila ${sheet().rowNumbers[i]}: ${row.filter((c) => c !== '').slice(0, 3).join(' · ').slice(0, 40) || '(vacía)'}</option>
          `)}
        </select>
      </label>
    </section>

    <p class="group-title">ASOCIA CADA COLUMNA CON SU DATO${job.remembered ? ' · USANDO LA ÚLTIMA CONFIGURACIÓN' : ''}</p>
    <div class="group">
      ${list.map((header, col) => html`
        <div class="map-row">
          <span class="row-main">
            <span class="row-title">${String(header).trim() || `Columna ${columnName(col)}`}</span>
            <small>${samples(col).join(' · ') || 'sin datos'}</small>
          </span>
          <select data-col="${col}" aria-label="Dato de la columna ${String(header).trim() || columnName(col)}">
            <option value="" ${job.mapping[col] ? '' : html`selected`}>No importar</option>
            ${IMPORT_FIELDS.map((f) => html`<option value="${f.key}" ${job.mapping[col] === f.key ? html`selected` : ''}>${f.label}${f.required ? ' *' : ''}</option>`)}
          </select>
        </div>
      `)}
    </div>
    <p class="hint">* Obligatorio. Las columnas en "No importar" se ignoran.</p>
    <div id="review"></div>
  `;
}

function reviewHtml() {
  const missing = missingRequired(job.mapping);
  if (missing.length) {
    return html`<p class="notice">Falta asociar: ${missing.join(' y ')}.</p>`;
  }
  const result = buildImportRows(sheet(), job.headerIndex, job.mapping);
  job.result = result;
  const count = result.items.length;
  return html`
    <p class="group-title">REVISA ANTES DE IMPORTAR</p>
    <div class="group">
      <div class="row between"><span>Productos listos</span><strong class="good">✓ ${count}</strong></div>
      <div class="row between"><span>Filas con errores (no se importan)</span><strong class="${result.errors.length ? 'alert' : 'muted'}">${result.errors.length ? '▲ ' : ''}${result.errors.length}</strong></div>
      <div class="row between"><span>Avisos</span><strong class="muted">${result.warnings.length}</strong></div>
    </div>

    ${count > 0 && html`
      <p class="group-title">ASÍ QUEDARÁN LAS PRIMERAS FILAS</p>
      <div class="group">
        ${result.items.slice(0, PREVIEW_ROWS).map(({ product }) => html`
          <div class="row">
            <span class="row-main"><span class="row-title">${product.name}</span><small>${product.category || 'General'}${product.barcodes ? ` · ${product.barcodes.map((b) => b.code).join(', ')}` : ''}</small></span>
            <span class="row-end"><strong class="tabular">${money(product.price)}</strong><small>${product.stock === undefined ? 'sin existencias' : `${formatQty(product.stock)} ${product.unit === 'kg' ? 'kg' : 'pz'}`}</small></span>
          </div>
        `)}
      </div>
    `}

    ${result.errors.length > 0 && html`
      <p class="group-title">ERRORES · CORRÍGELOS EN TU ARCHIVO SI QUIERES IMPORTAR ESAS FILAS</p>
      <div class="group">
        ${result.errors.slice(0, MAX_ERRORS).map((e) => html`
          <div class="row"><span class="row-main"><span class="row-title">Fila ${e.row}${e.name ? ` · ${e.name}` : ''}</span><small class="alert">${e.message}</small></span></div>
        `)}
        ${result.errors.length > MAX_ERRORS && html`<p class="row muted">Y ${result.errors.length - MAX_ERRORS} más.</p>`}
      </div>
    `}

    ${result.warnings.length > 0 && html`
      <details class="chart-table">
        <summary>Ver avisos (${result.warnings.length})</summary>
        <div class="group">
          ${result.warnings.slice(0, MAX_ERRORS).map((w) => html`
            <div class="row"><span class="row-main"><span class="row-title">Fila ${w.row}${w.name ? ` · ${w.name}` : ''}</span><small>${w.message}</small></span></div>
          `)}
        </div>
      </details>
    `}

    <p class="group-title">SI UN PRODUCTO YA EXISTE</p>
    <div class="segmented" role="radiogroup" aria-label="Qué hacer con los productos que ya existen">
      <label><input type="radio" name="mode" value="upsert" ${job.mode === 'upsert' ? html`checked` : ''}><span>Actualizar y agregar</span></label>
      <label><input type="radio" name="mode" value="new" ${job.mode === 'new' ? html`checked` : ''}><span>Solo agregar nuevos</span></label>
    </div>
    <p class="hint">Un producto ya existe si tiene el mismo código de barras o, si no tiene código, el mismo nombre. Al actualizar solo cambian las columnas que trae el archivo; lo demás se conserva.</p>
    <button type="button" class="btn btn-primary btn-pill" id="run" ${count ? '' : html`disabled`}>Importar ${count} ${count === 1 ? 'producto' : 'productos'}</button>
  `;
}

function render() {
  if (!isView('importar')) return;
  setHTML(root.querySelector('#import-body'), job ? mappingStep() : uploadStep());
  if (job) setHTML(root.querySelector('#review'), reviewHtml());
}

async function onFile(file) {
  try {
    const sheets = await readSpreadsheet(file);
    if (!isView('importar')) return;
    const sheetIndex = Math.max(0, sheets.findIndex((s) => s.rows.length >= 2));
    job = { fileName: file.name, sheets, sheetIndex, headerIndex: 0, mapping: [], mode: 'upsert' };
    await prepareSheet();
    render();
  } catch (error) {
    showError(error instanceof SpreadsheetError ? new UserError(error.message) : error);
  }
}

async function run(button) {
  button.disabled = true;
  try {
    const { items } = job.result;
    const counts = await importProducts(items.map((i) => i.product), { mode: job.mode, reason: `Importación de ${job.fileName}` });
    await saveImportMapping(mappingSignature(headers()), job.mapping);
    const parts = [`${counts.created} nuevos`, `${counts.updated} actualizados`];
    if (counts.skipped) parts.push(`${counts.skipped} ya existían`);
    toast(`Importación lista: ${parts.join(', ')}`);
    job = null;
    location.hash = '#inventario';
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

export function renderImport(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#inventario', 'Inventario')}</header>
      <h1>Importar productos</h1>
      <div id="import-body" class="stack-gap"></div>
    </div>
  `);
  render();

  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.id === 'file') {
      const [file] = target.files;
      target.value = '';
      if (file) await onFile(file);
    } else if (target.id === 'sheet') {
      job.sheetIndex = Number(target.value);
      await prepareSheet();
      render();
    } else if (target.id === 'header-row') {
      job.headerIndex = Number(target.value);
      await prepareMapping();
      render();
    } else if (target.dataset.col !== undefined) {
      const col = Number(target.dataset.col);
      // Un dato solo puede venir de una columna: la otra pasa a "No importar".
      job.mapping = job.mapping.map((key, i) => (i !== col && key === target.value && key ? '' : key));
      job.mapping[col] = target.value;
      job.remembered = false;
      render();
    } else if (target.name === 'mode') {
      job.mode = target.value;
    }
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'template') {
      download('plantilla-productos.xlsx', buildXlsx({ sheetName: 'Productos', columns: TEMPLATE_COLUMNS, rows: [] }), XLSX_MIME);
    }
    if (button.id === 'change-file') { job = null; render(); }
    if (button.id === 'run') run(button);
  });
}


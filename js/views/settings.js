import { html, normalize, parseCSV, PRODUCT_CSV_HEADER, productFromRow, productToRow, toCSV } from '../core.js';
import { exportBackup, importProducts, restoreBackup, saveSettings, state, UserError, wipeAll } from '../services.js';
import { backLink, confirmDialog, download, localDate, onSubmit, setHTML, showError, toast } from '../ui.js';

const CURRENCIES = ['MXN', 'USD', 'EUR', 'COP', 'PEN', 'CLP', 'ARS', 'GTQ'];
let root;

async function importFile(file) {
  const rows = parseCSV(await file.text());
  if (rows.length < 2) throw new UserError('El archivo no tiene productos.');
  const header = rows[0].map((h) => normalize(h).trim());
  if (!header.includes('nombre') || !header.includes('precio')) {
    throw new UserError('El CSV debe tener al menos las columnas "nombre" y "precio".');
  }
  const parsed = rows.slice(1).map((row) => productFromRow(header, row, state.settings.defaultTaxRate));
  const errors = parsed.map((r, i) => (r.error ? `Fila ${i + 2}: ${r.error}` : null)).filter(Boolean);
  if (errors.length) {
    throw new UserError(`No se importó nada. ${errors.slice(0, 3).join('. ')}${errors.length > 3 ? ` y ${errors.length - 3} más` : ''}.`);
  }
  const { created, updated } = await importProducts(parsed.map((r) => r.product));
  toast(`Listo: ${created} nuevos, ${updated} actualizados`);
}

function exportCSV() {
  const csv = toCSV([PRODUCT_CSV_HEADER, ...state.products.map(productToRow)], [0, 1, 2]);
  download(`productos-${localDate()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
}

export function renderSettings(container) {
  root = container;
  const s = state.settings;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#vender', 'Vender')}</header>
      <h1>Ajustes</h1>
      <form class="group pad" id="form">
        <h2>Datos del ticket</h2>
        <label class="field">Nombre del negocio <input name="storeName" required maxlength="80" value="${s.storeName}"></label>
        <label class="field">Dirección <input name="address" maxlength="160" value="${s.address}"></label>
        <div class="form-grid">
          <label class="field">Teléfono <input name="phone" maxlength="30" value="${s.phone}"></label>
          <label class="field">RFC <input name="taxId" maxlength="13" value="${s.taxId}"></label>
          <label class="field">Código postal <input name="zip" maxlength="5" inputmode="numeric" value="${s.zip}"></label>
          <label class="field">Moneda
            <select name="currency">${CURRENCIES.map((c) => html`<option ${c === s.currency ? html`selected` : ''}>${c}</option>`)}</select>
          </label>
        </div>
        <label class="field">Mensaje al final del ticket <input name="ticketFooter" maxlength="160" value="${s.ticketFooter}"></label>
        <label class="field">IVA para productos nuevos (%) <input name="defaultTaxRate" inputmode="decimal" required value="${s.defaultTaxRate}"></label>
        <label class="check"><input type="checkbox" name="pricesIncludeTax" ${s.pricesIncludeTax ? html`checked` : ''}> Los precios ya incluyen IVA</label>
        <label class="check"><input type="checkbox" name="allowNegativeStock" ${s.allowNegativeStock ? html`checked` : ''}> Permitir vender sin existencias</label>
        <button class="btn btn-primary btn-pill">Guardar ajustes</button>
      </form>

      <section class="group pad">
        <h2>Lista de productos</h2>
        <p class="muted">Carga o descarga tu mercancía en un archivo CSV de Excel.</p>
        <div class="row-gap">
          <label class="btn">Importar CSV<input id="import" type="file" accept=".csv,text/csv" class="sr-only"></label>
          <button class="btn" id="export">Exportar CSV</button>
        </div>
      </section>

      <section class="group pad">
        <h2>Respaldo</h2>
        <p class="muted">La información vive solo en este dispositivo. Descarga un respaldo seguido y guárdalo en otro lugar.</p>
        <div class="row-gap">
          <button class="btn btn-primary" id="backup">Descargar respaldo</button>
          <label class="btn">Restaurar<input id="restore" type="file" accept=".json,application/json" class="sr-only"></label>
        </div>
      </section>

      <section class="group pad">
        <h2>Borrar todo</h2>
        <p class="muted">Elimina productos, ventas, cortes, fiados y ajustes de este dispositivo.</p>
        <button class="btn btn-ghost-danger" id="wipe">Borrar todos los datos</button>
      </section>
    </div>
  `);

  onSubmit(root.querySelector('#form'), async (values) => {
    const defaultTaxRate = Number(values.defaultTaxRate);
    if (!Number.isFinite(defaultTaxRate) || defaultTaxRate < 0 || defaultTaxRate > 100) throw new UserError('El IVA debe estar entre 0 y 100.');
    await saveSettings({
      ...values,
      defaultTaxRate,
      pricesIncludeTax: values.pricesIncludeTax === 'on',
      allowNegativeStock: values.allowNegativeStock === 'on',
    });
    toast('Ajustes guardados');
  });

  root.querySelector('#export').addEventListener('click', exportCSV);
  root.querySelector('#import').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) await importFile(file).catch(showError);
  });

  root.querySelector('#backup').addEventListener('click', async () => {
    try {
      const data = await exportBackup();
      download(`respaldo-abarrotes-${localDate()}.json`, JSON.stringify(data), 'application/json');
    } catch (error) { showError(error); }
  });

  root.querySelector('#restore').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      let backup;
      try { backup = JSON.parse(await file.text()); } catch { throw new UserError('El archivo no es un respaldo válido.'); }
      const ok = await confirmDialog({
        title: 'Restaurar respaldo',
        message: 'Los datos actuales de este dispositivo se reemplazarán por los del archivo.',
        action: 'Restaurar',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(backup);
      location.reload();
    } catch (error) { showError(error); }
  });

  root.querySelector('#wipe').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Borrar todos los datos',
      message: 'Esta acción no se puede deshacer. Descarga un respaldo antes si puedes necesitarlos.',
      action: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    try {
      await wipeAll();
      location.hash = '#vender';
      location.reload();
    } catch (error) { showError(error); }
  });
}

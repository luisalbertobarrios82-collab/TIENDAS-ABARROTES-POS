import { centsToInput, computeMargin, daysUntil, EXPIRY_WARNING_DAYS, formatCode, formatPercent, formatQty, html, isLookupCode, normalize, parseMoney, parseQty, UNITS } from '../core.js';
import { adjustStock, deleteProduct, getMovements, linkCode, saveProduct, state, unlinkCode, UserError } from '../services.js';
import { lookupProduct } from '../catalog.js';
import { bindPhotoPicker, fileToPhoto, photoPickerHtml } from '../photo.js';
import { backLink, bindMargin, catalogCard, chevron, confirmDialog, dateTime, isView, marginShort, money, onSubmit, openModal, setHTML, showError, thumb, toast } from '../ui.js';

const filter = { text: '', kind: 'all' };

const isLow = (p) => p.stock <= p.minStock;
function expiringIn(p) {
  const days = daysUntil(p.expiry);
  return days !== null && days <= EXPIRY_WARNING_DAYS ? days : null;
}

function statusOf(p) {
  const days = expiringIn(p);
  if (days !== null) {
    const text = days < 0 ? 'Ya caducó' : days === 0 ? 'Caduca hoy' : `Caduca en ${days} ${days === 1 ? 'día' : 'días'}`;
    return html`<small class="alert">▲ ${text}</small>`;
  }
  if (p.stock <= 0) return html`<small class="alert">▲ Agotado</small>`;
  if (isLow(p)) return html`<small class="alert">▲ Se acaba pronto</small>`;
  const n = p.barcodes.length;
  const codes = n ? `${n} ${n === 1 ? 'código' : 'códigos'}` : 'Sin código';
  return html`<small>${codes}${p.packUnits ? ` · caja de ${p.packUnits}` : ''}</small>`;
}

function productSheet(existing, onSaved) {
  const p = existing || {
    name: '', category: '', price: 0, cost: 0, stock: 0, minStock: 0, unit: 'pza',
    taxRate: state.settings.defaultTaxRate, expiry: '', packUnits: 0, barcodes: [],
  };
  const categories = [...new Set(state.products.map((x) => x.category))];
  openModal(html`
    <form class="modal-body">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2>${existing ? 'Editar' : 'Producto nuevo'}</h2>
        <button class="link link-strong">Guardar</button>
      </div>
      ${photoPickerHtml()}
      ${existing ? '' : html`
        <label class="field">Código de barras
          <input name="code" maxlength="40" autocomplete="off" placeholder="Escríbelo o escanéalo para llenar los datos">
        </label>
        <div class="catalog-card" data-catalog role="status" hidden></div>
      `}
      <label class="field">Nombre <input name="name" required maxlength="120" value="${p.name}" autocomplete="off"></label>
      <div class="form-grid">
        <label class="field">Precio <input name="price" inputmode="decimal" required value="${existing ? centsToInput(p.price) : ''}" autocomplete="off"></label>
        <label class="field">Costo <input name="cost" inputmode="decimal" value="${existing ? centsToInput(p.cost) : ''}" autocomplete="off"></label>
        <p class="margin-line" data-margin role="status"></p>
        <label class="field">Categoría
          <input name="category" list="category-list" maxlength="40" value="${p.category}" placeholder="General" autocomplete="off">
          <datalist id="category-list">${categories.map((c) => html`<option value="${c}"></option>`)}</datalist>
        </label>
        <label class="field">Se vende por
          <select name="unit">${UNITS.map((u) => html`<option ${u === p.unit ? html`selected` : ''}>${u}</option>`)}</select>
        </label>
        ${existing ? '' : html`
          <label class="field">Existencias <input name="stock" inputmode="decimal" value="0" autocomplete="off"></label>
        `}
        <label class="field">Avisar cuando queden <input name="minStock" inputmode="decimal" value="${p.minStock}" autocomplete="off"></label>
        <label class="field">Piezas por caja <input name="packUnits" inputmode="numeric" value="${p.packUnits || ''}" autocomplete="off"></label>
        <label class="field">Caducidad <input name="expiry" type="date" value="${p.expiry}"></label>
        <label class="field">IVA (%) <input name="taxRate" inputmode="decimal" required value="${p.taxRate}" autocomplete="off"></label>
      </div>
      ${existing && html`<button type="button" class="btn btn-plain btn-ghost-danger" data-delete>Eliminar producto</button>`}
    </form>
  `, (dialog, close) => {
    const form = dialog.querySelector('form');
    const picker = bindPhotoPicker(form, p.image || '');
    const card = dialog.querySelector('[data-catalog]');
    bindMargin(form);
    // Enter en el código (como hace un lector USB) busca en vez de guardar.
    form.elements.code?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.target.blur();
    });
    form.elements.code?.addEventListener('change', async (event) => {
      const code = event.target.value.trim();
      picker.suggest('');
      card.hidden = !isLookupCode(code);
      if (card.hidden) return;
      setHTML(card, html`<small>Buscando el producto…</small>`);
      const found = await lookupProduct(code);
      if (!dialog.isConnected || form.elements.code.value.trim() !== code) return;
      if (!found) {
        setHTML(card, html`<small>No está en el catálogo. Escribe sus datos.</small>`);
        return;
      }
      picker.suggest(found.image);
      setHTML(card, catalogCard({ ...found, image: '' }));
      if (!form.elements.name.value) form.elements.name.value = found.name;
      (form.elements.name.value ? form.elements.price : form.elements.name).focus();
    });
    dialog.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Eliminar producto',
        message: `"${p.name}" se quitará del inventario. Las ventas ya registradas se conservan.`,
        action: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      await deleteProduct(p.id).catch(showError);
      close();
      toast('Producto eliminado');
      location.hash = '#inventario';
    });
    onSubmit(form, async (values) => {
      const price = parseMoney(values.price);
      if (price === null) throw new UserError('Escribe un precio válido.');
      const cost = values.cost.trim() === '' ? 0 : parseMoney(values.cost);
      if (cost === null) throw new UserError('Escribe un costo válido.');
      const taxRate = Number(values.taxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new UserError('El IVA debe estar entre 0 y 100.');
      const minStock = parseQty(values.minStock || '0');
      if (minStock === null || minStock < 0) throw new UserError('Revisa el aviso de existencias.');
      const stock = existing ? p.stock : parseQty(values.stock || '0');
      if (stock === null) throw new UserError('Existencias inválidas.');
      const packUnits = values.packUnits.trim() === '' ? 0 : Number(values.packUnits);
      if (!Number.isInteger(packUnits) || packUnits < 0) throw new UserError('Las piezas por caja deben ser un número entero.');
      const code = (values.code || '').trim();

      const id = await saveProduct({
        ...(existing ? { id: existing.id } : {}),
        image: picker.value,
        name: values.name.trim(),
        category: values.category.trim() || 'General',
        price, cost, taxRate, unit: values.unit, minStock, stock, packUnits, expiry: values.expiry,
        barcodes: existing ? existing.barcodes : code ? [{ label: '', code }] : [],
      });
      close();
      toast('Producto guardado');
      onSaved(id);
    });
  });
}

// ---------- Lista ----------
function renderList(root) {
  const words = normalize(filter.text).split(/\s+/).filter(Boolean);
  const rows = state.products.filter((p) => {
    if (filter.kind === 'low' && !isLow(p)) return false;
    if (filter.kind === 'expiring' && expiringIn(p) === null) return false;
    return words.every((w) => normalize(`${p.name} ${p.codeList.join(' ')}`).includes(w));
  });
  setHTML(root.querySelector('#list'), rows.length ? html`
    <div class="group">
      ${rows.map((p) => html`
        <a class="row row-btn" href="#producto/${p.id}">
          ${thumb(p)}
          <span class="row-main"><span class="row-title">${p.name}</span>${statusOf(p)}</span>
          <span class="row-end">
            <strong class="row-qty">${formatQty(p.stock)} ${p.unit === 'pza' ? 'pz' : p.unit}</strong>
            ${p.cost > 0 && html`<small class="${p.price < p.cost ? 'alert' : 'good'}">${marginShort(p.price, p.cost)}</small>`}
          </span>
          ${chevron}
        </a>
      `)}
    </div>
  ` : html`<p class="empty muted">No hay productos aquí.</p>`);
}

export function renderInventory(root) {
  const low = state.products.filter(isLow).length;
  const expiring = state.products.filter((p) => expiringIn(p) !== null).length;
  const stat = (kind, cls, icon, value, label) => html`
    <button class="stat-card" data-kind="${kind}" aria-pressed="${filter.kind === kind}">
      <span class="stat-icon ${cls}" aria-hidden="true">${icon}</span>
      <strong>${value}</strong><small>${label}</small>
    </button>
  `;
  setHTML(root, html`
    <div class="page">
      <header class="title-row">
        <h1>Inventario</h1>
        <button class="round-btn" id="new" aria-label="Producto nuevo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </header>
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6C6C70" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input id="filter" type="search" placeholder="Nombre o código" aria-label="Buscar" value="${filter.text}">
      </div>
      <div class="stat-cards" id="stats">
        ${stat('all', 'si-blue', '▦', state.products.length, 'Productos')}
        ${stat('low', 'si-red', '↓', low, 'Se acaban')}
        ${stat('expiring', 'si-orange', '!', expiring, 'Caducan')}
      </div>
      <div id="list"></div>
    </div>
  `);
  renderList(root);
  root.querySelector('#filter').addEventListener('input', (e) => { filter.text = e.target.value; renderList(root); });
  root.querySelector('#new').addEventListener('click', () => productSheet(null, (id) => { location.hash = `#producto/${id}`; }));
  root.querySelector('#stats').addEventListener('click', (event) => {
    const button = event.target.closest('[data-kind]');
    if (!button) return;
    filter.kind = button.dataset.kind;
    root.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b === button));
    renderList(root);
  });
}

// ---------- Detalle ----------
function addCodeSheet(p, onDone) {
  openModal(html`
    <form class="modal-body">
      <h2>Agregar código</h2>
      <label class="field">Código de barras <input name="code" required maxlength="40" autocomplete="off" autofocus></label>
      <label class="field">Variante (opcional) <input name="label" maxlength="40" autocomplete="off" placeholder="Ej. Fresa"></label>
      <p class="hint">Se cobra a ${money(p.price)} y descuenta de las mismas existencias.</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Agregar</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ code, label }) => {
      await linkCode(p.id, code.trim(), label.trim());
      close();
      onDone();
    });
  });
}

function receiveSheet(p, onDone) {
  const hasPack = p.packUnits > 0;
  openModal(html`
    <form class="modal-body">
      <h2>Recibir mercancía</h2>
      <p class="muted">${p.name}</p>
      ${hasPack && html`
        <div class="segmented" role="radiogroup" aria-label="Cómo llegó">
          <label><input type="radio" name="by" value="pack" checked><span>Cajas de ${p.packUnits}</span></label>
          <label><input type="radio" name="by" value="unit"><span>Sueltas</span></label>
        </div>
      `}
      <label class="field">¿Cuántas llegaron? <input name="qty" inputmode="decimal" required autocomplete="off" autofocus></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Recibir</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ qty, by }) => {
      const value = parseQty(qty);
      if (!value || value < 0) throw new UserError('Escribe una cantidad mayor a cero.');
      const isPack = by === 'pack';
      if ((isPack || p.unit === 'pza') && !Number.isInteger(value)) throw new UserError('Escribe un número entero.');
      await adjustStock(p.id, isPack ? value * p.packUnits : value, isPack ? `Compra · ${value} ${value === 1 ? 'caja' : 'cajas'}` : 'Compra');
      close();
      toast('Mercancía recibida');
      onDone();
    });
  });
}

function countSheet(p, onDone) {
  openModal(html`
    <form class="modal-body">
      <h2>Contar existencias</h2>
      <p class="muted">${p.name}: el sistema dice ${formatQty(p.stock)} ${p.unit}.</p>
      <label class="field">¿Cuántos hay en realidad? <input name="qty" inputmode="decimal" required autocomplete="off" autofocus></label>
      <label class="field">Motivo
        <select name="reason"><option>Conteo físico</option><option>Merma o caducidad</option><option>Otro</option></select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async ({ qty, reason }) => {
      const value = parseQty(qty);
      if (value === null || value < 0) throw new UserError('Escribe una cantidad válida.');
      if (p.unit === 'pza' && !Number.isInteger(value)) throw new UserError('Las piezas deben ser números enteros.');
      const delta = Math.round((value - p.stock) * 1000) / 1000;
      if (delta !== 0) await adjustStock(p.id, delta, reason);
      close();
      toast('Existencias actualizadas');
      onDone();
    });
  });
}

export function renderProduct(root, id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) { location.hash = '#inventario'; return; }
  const redraw = () => renderProduct(root, id);
  const { profit, percent } = computeMargin(p.price, p.cost);
  const days = daysUntil(p.expiry);

  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#inventario', 'Inventario')}<button class="link" id="edit">Editar</button></header>
      <div class="product-hero">
        ${thumb(p, 'mono-xl')}
        <label class="link photo-link">${p.image ? 'Cambiar foto' : 'Agregar foto'}<input id="photo-input" type="file" accept="image/*" class="sr-only"></label>
        <h1>${p.name}</h1>
        <p class="muted">${p.category} · se vende por ${p.unit === 'pza' ? 'pieza' : p.unit}</p>
      </div>
      <div class="triple">
        <div><small>Existencias</small><strong>${formatQty(p.stock)}</strong></div>
        <div><small>Precio</small><strong>${money(p.price)}</strong></div>
        <div><small>Ganancia</small><strong class="${profit >= 0 ? 'good' : 'alert'}">${money(profit)}</strong>${percent !== null && html`<small class="${profit >= 0 ? 'good' : 'alert'}">${formatPercent(percent)}</small>`}</div>
      </div>
      <div class="row-gap two-btns">
        <button class="btn btn-primary" id="receive">Recibir mercancía</button>
        <button class="btn" id="count">Contar existencias</button>
      </div>

      <section>
        <p class="group-title">CÓDIGOS LIGADOS</p>
        <div class="group">
          ${p.barcodes.map((b) => html`
            <div class="row">
              <span class="row-main"><span class="row-title">${b.label || 'Código'}</span></span>
              <span class="muted tabular">${formatCode(b.code)}</span>
              <button class="link link-danger" data-unlink="${b.code}" aria-label="Quitar código ${b.code}">Quitar</button>
            </div>
          `)}
          <button class="row row-btn link-row" id="add-code"><span class="plus-dot" aria-hidden="true">+</span>Agregar código</button>
        </div>
        ${p.barcodes.length > 1 && html`<p class="hint">Todos se cobran a ${money(p.price)} y descuentan de las mismas ${formatQty(p.stock)} piezas.</p>`}
      </section>

      <section>
        <p class="group-title">CÓMO LO COMPRAS</p>
        <div class="group">
          ${p.packUnits > 0 && html`<div class="row between"><span>Caja</span><span class="muted">${p.packUnits} piezas</span></div>`}
          <div class="row between"><span>${p.unit === 'pza' ? 'Pieza suelta' : 'Por ' + p.unit}</span><span class="muted">${p.unit === 'pza' ? '1 pieza' : `1 ${p.unit}`}</span></div>
          ${p.expiry && html`<div class="row between"><span>Caducidad</span><span class="${days !== null && days <= EXPIRY_WARNING_DAYS ? 'alert' : 'muted'}">${p.expiry}</span></div>`}
        </div>
      </section>

      <section>
        <p class="group-title">ÚLTIMOS MOVIMIENTOS</p>
        <div class="group" id="movements"><p class="row muted">Cargando…</p></div>
      </section>
    </div>
  `);

  root.querySelector('#edit').addEventListener('click', () => productSheet(p, redraw));
  root.querySelector('#receive').addEventListener('click', () => receiveSheet(p, redraw));
  root.querySelector('#count').addEventListener('click', () => countSheet(p, redraw));
  root.querySelector('#photo-input').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      await saveProduct({ ...p, image: await fileToPhoto(file) });
      toast('Foto guardada');
      if (isView('producto')) redraw();
    } catch (error) { showError(error); }
  });
  root.querySelector('#add-code').addEventListener('click', () => addCodeSheet(p, redraw));
  root.querySelectorAll('[data-unlink]').forEach((button) => button.addEventListener('click', async () => {
    await unlinkCode(p.id, button.dataset.unlink).catch(showError);
    redraw();
  }));

  getMovements(id).then((moves) => {
    if (!isView('producto')) return;
    setHTML(root.querySelector('#movements'), moves.length ? moves.slice(0, 10).map((m) => html`
      <div class="row">
        <span class="row-main"><span class="row-title">${m.reason}</span><small>${dateTime(m.date)}</small></span>
        <strong class="tabular">${m.delta > 0 ? '+' : '−'}${formatQty(Math.abs(m.delta))}</strong>
      </div>
    `).map(String).join('') : String(html`<p class="row muted">Sin movimientos todavía.</p>`));
  }).catch(showError);
}

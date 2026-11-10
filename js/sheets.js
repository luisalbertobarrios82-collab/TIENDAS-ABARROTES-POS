// Hojas compartidas por Vender y Cámara: cantidad, monto libre, código nuevo y cobro.
import { centsToInput, formatCode, formatQty, html, isLookupCode, normalize, parseMoney, parseQty } from './core.js';
import { lookupProduct } from './catalog.js';
import { bindPhotoPicker, photoPickerHtml } from './photo.js';
import { playPaid } from './sounds.js';
import { addFreeAmount, addToCart, cart, cartItems, cartTotals, clearCart, setDiscount, setLineQty } from './cart.js';
import { completeSale, createCustomer, linkCode, listCustomers, saveProduct, state, UserError } from './services.js';
import { bindCategoryField, bindMargin, bindPackCost, catalogCard, categoryFieldHtml, packFieldsHtml, readCategory, METHODS, money, onSubmit, openModal, printTicket, promptOpenShift, setHTML, thumb, toast } from './ui.js';

function focusSearch() {
  if (matchMedia('(pointer: fine)').matches) document.querySelector('#search')?.focus();
}

// Agrega un producto; los de peso preguntan primero cuánto.
export function pickProduct(p) {
  if (p.unit === 'pza') return addToCart(p);
  quantitySheet(p);
  return true;
}

export function quantitySheet(p, currentQty = null) {
  openModal(html`
    <form class="modal-body">
      <h2>${p.name}</h2>
      <p class="muted">${money(p.price)} por ${p.unit}</p>
      <div class="form-grid">
        <label class="field">Cantidad (${p.unit})
          <input name="qty" inputmode="decimal" autocomplete="off" value="${currentQty ?? ''}">
        </label>
        ${p.unit === 'pza' ? '' : html`
          <label class="field">o por dinero ($)
            <input name="amount" inputmode="decimal" autocomplete="off">
          </label>
        `}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Listo</button>
      </div>
    </form>
  `, (dialog, close) => {
    const qtyInput = dialog.querySelector('[name=qty]');
    qtyInput.select();
    onSubmit(dialog.querySelector('form'), ({ qty, amount }) => {
      const cents = amount ? parseMoney(amount) : null;
      if (amount && !cents) throw new UserError('Escribe un monto válido.');
      const value = cents ? Math.round((cents / p.price) * 1000) / 1000 : parseQty(qty);
      if (!value || value < 0) throw new UserError('Escribe una cantidad mayor a cero.');
      if (p.unit === 'pza' && !Number.isInteger(value)) throw new UserError('Las piezas deben ser números enteros.');
      if (currentQty !== null) setLineQty(p.id, value);
      else if (!addToCart(p, value)) return;
      close();
    });
  }, { onClose: focusSearch });
}

export function freeAmountSheet() {
  openModal(html`
    <form class="modal-body">
      <h2>Monto libre</h2>
      <label class="field">Monto
        <input name="amount" inputmode="decimal" required autocomplete="off" autofocus>
      </label>
      <label class="field">Concepto (opcional)
        <input name="name" maxlength="60" autocomplete="off" placeholder="Monto libre">
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Agregar</button>
      </div>
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), ({ amount, name }) => {
      const cents = parseMoney(amount);
      if (!cents) throw new UserError('Escribe un monto mayor a cero.');
      addFreeAmount(name.trim() || 'Monto libre', cents);
      close();
    });
  }, { onClose: focusSearch });
}

export function discountSheet() {
  const current = cart.discount || { type: 'amount', value: 0 };
  const initial = current.value ? (current.type === 'amount' ? centsToInput(current.value) : current.value) : '';
  openModal(html`
    <form class="modal-body">
      <h2>Descuento al ticket</h2>
      <fieldset class="segmented">
        <legend class="sr-only">Tipo de descuento</legend>
        <label><input type="radio" name="type" value="amount" ${current.type === 'amount' ? html`checked` : ''}><span>Monto $</span></label>
        <label><input type="radio" name="type" value="percent" ${current.type === 'percent' ? html`checked` : ''}><span>Porcentaje %</span></label>
      </fieldset>
      <label class="field">Valor
        <input name="value" inputmode="decimal" autocomplete="off" value="${initial}" autofocus>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-remove-discount>Sin descuento</button>
        <button class="btn btn-primary">Aplicar</button>
      </div>
    </form>
  `, (dialog, close) => {
    dialog.querySelector('[data-remove-discount]').addEventListener('click', () => { setDiscount(null); close(); });
    onSubmit(dialog.querySelector('form'), ({ type, value }) => {
      if (type === 'amount') {
        const cents = parseMoney(value);
        if (cents === null) throw new UserError('Escribe un monto válido.');
        setDiscount(cents ? { type, value: cents } : null);
      } else {
        const percent = Number(value);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new UserError('El porcentaje debe estar entre 0 y 100.');
        setDiscount(percent ? { type, value: percent } : null);
      }
      close();
    });
  });
}

// Código que nadie conoce: ligarlo a un producto o crear uno nuevo.
export function newCodeSheet(code, onClose) {
  let selected = null;
  let mode = 'link';
  openModal(html`
    <form class="modal-body">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2>Código nuevo</h2>
        <button class="link link-strong">Agregar</button>
      </div>
      <p class="code-chip">${formatCode(code)}</p>
      ${isLookupCode(code) && html`<div class="catalog-card" data-catalog role="status"><small>Buscando el producto…</small></div>`}
      <div class="segmented" role="radiogroup" aria-label="Qué hacer con este código">
        <label><input type="radio" name="mode" value="link" checked><span>Ya lo tengo</span></label>
        <label><input type="radio" name="mode" value="new"><span>Producto nuevo</span></label>
      </div>
      <div data-mode="link">
        <div class="search"><input data-find type="search" placeholder="Buscar producto" aria-label="Buscar producto" autocomplete="off"></div>
        <p class="group-title">LIGAR A UN PRODUCTO</p>
        <div class="group" data-options></div>
        <p class="hint">El código se cobra al mismo precio y descuenta del mismo inventario.</p>
      </div>
      <div data-mode="new" hidden>
        ${photoPickerHtml()}
        <label class="field">Nombre <input name="name" maxlength="120" autocomplete="off"></label>
        <div class="form-grid">
          <label class="field">Precio <input name="price" inputmode="decimal" autocomplete="off"></label>
          <label class="field">Costo <input name="cost" inputmode="decimal" autocomplete="off"></label>
          ${packFieldsHtml()}
          <p class="margin-line" data-margin role="status"></p>
          <label class="field">Existencias <input name="stock" inputmode="decimal" value="1" autocomplete="off"></label>
          ${categoryFieldHtml()}
        </div>
      </div>
      <button class="btn btn-primary btn-pill" data-submit>Ligar y agregar a la venta</button>
    </form>
  `, (dialog, close) => {
    const form = dialog.querySelector('form');
    const options = dialog.querySelector('[data-options]');
    const find = dialog.querySelector('[data-find]');
    bindMargin(form);
    const picker = bindPhotoPicker(form);
    bindCategoryField(form);
    bindPackCost(form);

    const renderOptions = () => {
      const words = normalize(find.value).split(/\s+/).filter(Boolean);
      const found = state.products.filter((p) => words.every((w) => normalize(p.name).includes(w))).slice(0, 5);
      setHTML(options, found.length ? found.map((p) => html`
        <button type="button" class="row row-btn" data-pick="${p.id}" aria-pressed="${p.id === selected}">
          ${thumb(p)}
          <span class="row-main"><strong>${p.name}</strong><small>${p.barcodes.length} ${p.barcodes.length === 1 ? 'código' : 'códigos'} · ${formatQty(p.stock)} ${p.unit}</small></span>
          ${p.id === selected ? html`<span class="check-mark" aria-hidden="true">✓</span>` : ''}
        </button>
      `).map(String).join('') : String(html`<p class="row muted">Sin resultados.</p>`));
    };
    renderOptions();
    find.addEventListener('input', renderOptions);
    options.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pick]');
      if (button) { selected = button.dataset.pick; renderOptions(); }
    });
    const applyMode = (value) => {
      mode = value;
      dialog.querySelector('[data-catalog]')?.classList.toggle('no-photo', mode === 'new');
      dialog.querySelector('[data-mode=link]').hidden = mode !== 'link';
      dialog.querySelector('[data-mode=new]').hidden = mode !== 'new';
      dialog.querySelector('[data-submit]').textContent = mode === 'link' ? 'Ligar y agregar a la venta' : 'Guardar y agregar a la venta';
    };
    let touched = false;
    form.addEventListener('change', (event) => {
      if (event.target.name !== 'mode') return;
      touched = true;
      applyMode(event.target.value);
    });
    options.addEventListener('click', () => { touched = true; });

    const card = dialog.querySelector('[data-catalog]');
    if (card) {
      lookupProduct(code).then((found) => {
        if (!dialog.isConnected) return;
        if (!found) {
          setHTML(card, html`<small>No está en el catálogo. Escribe sus datos o lígalo a un producto.</small>`);
          return;
        }
        picker.suggest(found.image);
        setHTML(card, catalogCard(found));
        if (!form.elements.name.value) form.elements.name.value = found.name;
        // Si ya eligió qué hacer, no se le cambia la pantalla.
        if (touched) return;
        form.elements.mode.value = 'new';
        applyMode('new');
        (found.name ? form.elements.price : form.elements.name).focus();
      });
    }

    onSubmit(form, async (values) => {
      let productId = selected;
      if (mode === 'link') {
        if (!productId) throw new UserError('Elige a qué producto ligar el código.');
        await linkCode(productId, code);
      } else {
        const price = parseMoney(values.price);
        const cost = values.cost.trim() === '' ? 0 : parseMoney(values.cost);
        const stock = parseQty(values.stock || '0');
        if (!values.name.trim()) throw new UserError('Escribe el nombre.');
        if (price === null || cost === null || stock === null) throw new UserError('Revisa el precio, el costo y las existencias.');
        const packUnits = values.packUnits.trim() === '' ? 0 : Number(values.packUnits);
        if (!Number.isInteger(packUnits) || packUnits < 0) throw new UserError('Las piezas por caja deben ser un número entero.');
        productId = await saveProduct({
          name: values.name.trim(), category: readCategory(values), price, cost, stock, image: picker.value,
          barcodes: [{ label: '', code }], unit: 'pza', taxRate: state.settings.defaultTaxRate, minStock: 0, expiry: '', packUnits,
        });
      }
      close();
      pickProduct(state.products.find((p) => p.id === productId));
    });
  }, { onClose });
}

export function checkout() {
  if (!cart.lines.length) return;
  if (!state.shift) {
    promptOpenShift(checkout);
    return;
  }
  const { total } = cartTotals();
  const bills = [...new Set([total, ...[5000, 10000, 20000, 50000, 100000].filter((b) => b > total)])].slice(0, 4);

  openModal(html`
    <form class="modal-body">
      <p class="checkout-label">Total a cobrar</p>
      <p class="checkout-total">${money(total)}</p>
      <fieldset class="segmented">
        <legend class="sr-only">Forma de pago</legend>
        ${Object.entries(METHODS).map(([value, label], i) => html`
          <label><input type="radio" name="method" value="${value}" ${i === 0 ? html`checked` : ''}><span>${label}</span></label>
        `)}
      </fieldset>
      <div data-section="cash">
        <label class="field">Efectivo recibido
          <input name="received" inputmode="decimal" autocomplete="off" value="${centsToInput(total)}">
        </label>
        <div class="row-gap bills">
          ${bills.map((b) => html`<button type="button" class="chip" data-bill="${b}">${b === total ? 'Exacto' : money(b)}</button>`)}
        </div>
        <p class="change"><span>Cambio</span><strong data-change>${money(0)}</strong></p>
      </div>
      <div data-section="reference" hidden>
        <label class="field">Referencia (opcional)
          <input name="reference" autocomplete="off" maxlength="60">
        </label>
      </div>
      <div data-section="credit" hidden>
        <label class="field">¿A quién se le fía?
          <input name="customer" list="customer-list" autocomplete="off" maxlength="80" placeholder="Nombre del cliente">
          <datalist id="customer-list"></datalist>
        </label>
        <p class="hint">Si el nombre es nuevo, se crea el cliente.</p>
      </div>
      <button class="btn btn-primary btn-pill">Confirmar cobro</button>
      <button type="button" class="btn btn-plain" data-close>Volver</button>
    </form>
  `, async (dialog, close) => {
    const form = dialog.querySelector('form');
    const received = form.elements.received;
    const customers = await listCustomers();
    setHTML(dialog.querySelector('#customer-list'), customers.map((c) => html`<option value="${c.name}"></option>`).map(String).join(''));

    const updateChange = () => {
      const cents = parseMoney(received.value);
      const short = cents === null || cents < total;
      const label = dialog.querySelector('[data-change]');
      label.textContent = short ? 'Falta efectivo' : money(cents - total);
      label.classList.toggle('is-short', short);
    };
    received.select();
    received.addEventListener('input', updateChange);
    form.addEventListener('change', () => {
      const method = form.elements.method.value;
      dialog.querySelector('[data-section=cash]').hidden = method !== 'cash';
      dialog.querySelector('[data-section=reference]').hidden = method !== 'card' && method !== 'transfer';
      dialog.querySelector('[data-section=credit]').hidden = method !== 'credit';
    });
    dialog.querySelectorAll('[data-bill]').forEach((button) => button.addEventListener('click', () => {
      received.value = centsToInput(Number(button.dataset.bill));
      updateChange();
    }));
    updateChange();

    onSubmit(form, async ({ method, received: cash, reference, customer }) => {
      const cents = method === 'cash' ? parseMoney(cash) : total;
      if (cents === null) throw new UserError('Escribe el efectivo recibido.');
      let customerId = null;
      if (method === 'credit') {
        const name = customer.trim();
        if (!name) throw new UserError('Escribe a quién se le fía.');
        const existing = customers.find((c) => normalize(c.name) === normalize(name));
        customerId = (existing || await createCustomer(name)).id;
      }
      const sale = await completeSale({ items: cartItems(), discount: cart.discount, method, received: cents, reference, customerId });
      clearCart();
      close();
      playPaid();
      saleDone(sale);
    });
  }, { onClose: focusSearch });
}

function saleDone(sale) {
  openModal(html`
    <div class="modal-body done">
      <span class="done-mark" aria-hidden="true">✓</span>
      <p class="checkout-label">Ticket ${sale.folio} · ${METHODS[sale.method]}</p>
      ${sale.method === 'cash'
        ? html`<p class="checkout-label">Cambio</p><p class="checkout-total">${money(sale.change)}</p>`
        : html`<p class="checkout-total">${money(sale.total)}</p>`}
      <button class="btn btn-primary btn-pill" data-close autofocus>Nueva venta</button>
      <button class="btn btn-plain" data-print>Imprimir ticket</button>
    </div>
  `, (dialog) => {
    dialog.querySelector('[data-print]').addEventListener('click', () => printTicket(sale));
  }, { onClose: () => { focusSearch(); toast('Venta registrada'); } });
}

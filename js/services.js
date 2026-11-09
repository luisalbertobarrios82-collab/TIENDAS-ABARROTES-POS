// Operaciones del negocio. Cada una es atómica: se guarda completa o no se guarda.
import { computeTotals, formatQty, roundQty, summarizeShift } from './core.js';
import { get, getAll, getAllByIndex, put, req, STORES, tx, uid } from './db.js';

export const DEFAULT_SETTINGS = {
  storeName: 'Abarrotes',
  address: '',
  phone: '',
  taxId: '',
  zip: '',
  ticketFooter: '¡Gracias por su compra!',
  currency: 'MXN',
  defaultTaxRate: 16,
  pricesIncludeTax: true,
  allowNegativeStock: false,
};

export const state = { settings: { ...DEFAULT_SETTINGS }, products: [], shift: null };

export class UserError extends Error {}

export async function init() {
  const stored = await get('kv', 'settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(stored?.value || {}) };
  await refreshProducts();
  await refreshShift();
  // Pide al navegador no borrar estos datos cuando falte espacio.
  navigator.storage?.persist?.().catch(() => {});
}

export async function refreshProducts() {
  state.products = (await getAll('products')).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function refreshShift() {
  const open = await get('kv', 'openShiftId');
  state.shift = open?.value ? await get('shifts', open.value) : null;
}

export async function saveSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  await put('kv', { key: 'settings', value: state.settings });
}

const now = () => new Date().toISOString();

function movement(product, delta, reason, ref = null) {
  return {
    id: uid(), productId: product.id, name: product.name, delta, reason, ref,
    stockAfter: product.stock, date: now(),
  };
}

// ---------- Productos ----------
const withCodeList = (product) => ({ ...product, codeList: (product.barcodes || []).map((b) => b.code) });

export const findByCode = (code) => state.products.find((p) => p.codeList.includes(code));

async function assertCodesFree(store, codes, ownId) {
  for (const code of codes) {
    const found = await req(store.index('codeList').get(code));
    if (found && found.id !== ownId) throw new UserError(`El código ${code} ya es de "${found.name}".`);
  }
}

export async function saveProduct(data) {
  const created = await tx(['products', 'movements'], 'readwrite', async ({ products, movements }) => {
    const incoming = withCodeList(data);
    await assertCodesFree(products, incoming.codeList, data.id);
    if (data.id) {
      const current = await req(products.get(data.id));
      if (!current) throw new UserError('El producto ya no existe.');
      await req(products.put({ ...current, ...incoming, stock: current.stock, updatedAt: now() }));
      return data.id;
    }
    const product = { ...incoming, id: uid(), createdAt: now() };
    await req(products.put(product));
    if (product.stock !== 0) await req(movements.put(movement(product, product.stock, 'Inventario inicial')));
    return product.id;
  });
  await refreshProducts();
  return created;
}

export async function deleteProduct(id) {
  await tx(['products'], 'readwrite', ({ products }) => req(products.delete(id)));
  await refreshProducts();
}

export async function linkCode(productId, code, label = '') {
  await tx(['products'], 'readwrite', async ({ products }) => {
    await assertCodesFree(products, [code], productId);
    const product = await req(products.get(productId));
    if (!product) throw new UserError('El producto ya no existe.');
    if (!product.codeList.includes(code)) product.barcodes.push({ label, code });
    await req(products.put(withCodeList(product)));
  });
  await refreshProducts();
}

export async function unlinkCode(productId, code) {
  await tx(['products'], 'readwrite', async ({ products }) => {
    const product = await req(products.get(productId));
    if (!product) throw new UserError('El producto ya no existe.');
    product.barcodes = product.barcodes.filter((b) => b.code !== code);
    await req(products.put(withCodeList(product)));
  });
  await refreshProducts();
}

export async function adjustStock(id, delta, reason) {
  await tx(['products', 'movements'], 'readwrite', async ({ products, movements }) => {
    const product = await req(products.get(id));
    if (!product) throw new UserError('El producto ya no existe.');
    product.stock = roundQty(product.stock + delta);
    await req(products.put(product));
    await req(movements.put(movement(product, delta, reason)));
  });
  await refreshProducts();
}

export const getMovements = async (productId) => (await getAllByIndex('movements', 'productId', productId))
  .sort((a, b) => b.date.localeCompare(a.date));

export async function importProducts(rows) {
  const counts = { created: 0, updated: 0 };
  await tx(['products', 'movements'], 'readwrite', async ({ products, movements }) => {
    for (const row of rows) {
      const incoming = withCodeList(row);
      let existing = null;
      for (const code of incoming.codeList) {
        existing = existing || await req(products.index('codeList').get(code));
      }
      if (existing) {
        const delta = roundQty(incoming.stock - existing.stock);
        const updated = { ...existing, ...incoming, id: existing.id, updatedAt: now() };
        await req(products.put(updated));
        if (delta !== 0) await req(movements.put(movement(updated, delta, 'Importación CSV')));
        counts.updated += 1;
      } else {
        const product = { ...incoming, id: uid(), createdAt: now() };
        await req(products.put(product));
        if (product.stock !== 0) await req(movements.put(movement(product, product.stock, 'Importación CSV')));
        counts.created += 1;
      }
    }
  });
  await refreshProducts();
  return counts;
}

// ---------- Ventas ----------
export async function completeSale({ items, discount, method, received, reference, customerId }) {
  if (!state.shift) throw new UserError('Abre la caja antes de cobrar.');
  if (!items.length) throw new UserError('El ticket está vacío.');
  if (method === 'credit' && !customerId) throw new UserError('Elige a quién se le fía.');
  const { allowNegativeStock, pricesIncludeTax } = state.settings;
  const totals = computeTotals(items, { discount, pricesIncludeTax });
  if (method === 'cash' && received < totals.total) throw new UserError('El efectivo recibido no cubre el total.');

  const names = ['products', 'sales', 'movements', 'customers', 'creditMoves', 'kv'];
  const sale = await tx(names, 'readwrite', async ({ products, sales, movements, customers, creditMoves, kv }) => {
    const openId = await req(kv.get('openShiftId'));
    if (openId?.value !== state.shift.id) throw new UserError('La caja ya no está abierta. Recarga la página.');

    const counter = await req(kv.get('folio'));
    const folio = (counter?.value || 0) + 1;
    await req(kv.put({ key: 'folio', value: folio }));

    const id = uid();
    for (const line of totals.lines) {
      if (!line.productId) continue; // Monto libre: no descuenta inventario.
      const product = await req(products.get(line.productId));
      if (!product) throw new UserError(`"${line.name}" ya no existe en el catálogo.`);
      if (!allowNegativeStock && product.stock < line.qty) {
        throw new UserError(`Solo hay ${formatQty(product.stock)} ${product.unit} de "${product.name}".`);
      }
      product.stock = roundQty(product.stock - line.qty);
      await req(products.put(product));
      await req(movements.put(movement(product, -line.qty, `Venta #${folio}`, id)));
    }

    let customerName = '';
    if (method === 'credit') {
      const customer = await req(customers.get(customerId));
      if (!customer) throw new UserError('El cliente ya no existe.');
      customer.balance += totals.total;
      customerName = customer.name;
      await req(customers.put(customer));
      await req(creditMoves.put({
        id: uid(), customerId, type: 'charge', amount: totals.total, note: `Venta #${folio}`, date: now(),
      }));
    }

    const record = {
      id,
      folio,
      date: now(),
      shiftId: state.shift.id,
      status: 'completed',
      lines: totals.lines,
      discount: totals.discount,
      gross: totals.gross,
      net: totals.net,
      tax: totals.tax,
      taxByRate: totals.taxByRate,
      total: totals.total,
      method,
      received: method === 'cash' ? received : method === 'credit' ? 0 : totals.total,
      change: method === 'cash' ? received - totals.total : 0,
      reference: reference || '',
      customerId: method === 'credit' ? customerId : null,
      customerName,
      invoiceId: null,
    };
    await req(sales.put(record));
    return record;
  });
  await refreshProducts();
  return sale;
}

export async function cancelSale(id, reason) {
  const names = ['products', 'sales', 'movements', 'cashMoves', 'customers', 'creditMoves', 'kv'];
  await tx(names, 'readwrite', async ({ products, sales, movements, cashMoves, customers, creditMoves, kv }) => {
    const sale = await req(sales.get(id));
    if (!sale) throw new UserError('La venta no existe.');
    if (sale.status === 'cancelled') throw new UserError('Esta venta ya estaba cancelada.');
    if (sale.invoiceId) throw new UserError('Esta venta ya está en una factura.');

    // Una venta en efectivo de un turno ya cerrado se devuelve desde la caja actual.
    const openId = (await req(kv.get('openShiftId')))?.value;
    if (sale.method === 'cash' && sale.shiftId !== openId) {
      if (!openId) throw new UserError('Abre la caja para devolver el efectivo de una venta de otro turno.');
      await req(cashMoves.put({
        id: uid(), shiftId: openId, type: 'out', amount: sale.total, reason: `Devolución venta #${sale.folio}`, date: now(),
      }));
    }

    if (sale.method === 'credit') {
      const customer = await req(customers.get(sale.customerId));
      if (customer) {
        // Si ya había abonado, el saldo queda negativo: es dinero a su favor.
        customer.balance -= sale.total;
        await req(customers.put(customer));
        await req(creditMoves.put({
          id: uid(), customerId: customer.id, type: 'void', amount: sale.total, note: `Cancelación venta #${sale.folio}`, date: now(),
        }));
      }
    }

    for (const line of sale.lines) {
      if (!line.productId) continue;
      const product = await req(products.get(line.productId));
      if (!product) continue;
      product.stock = roundQty(product.stock + line.qty);
      await req(products.put(product));
      await req(movements.put(movement(product, line.qty, `Cancelación venta #${sale.folio}`, sale.id)));
    }
    sale.status = 'cancelled';
    sale.cancelledAt = now();
    sale.cancelReason = reason;
    await req(sales.put(sale));
  });
  await refreshProducts();
}

export const salesBetween = async (from, to) => (await getAllByIndex('sales', 'date', IDBKeyRange.bound(from, to)))
  .sort((a, b) => b.date.localeCompare(a.date));

export const getSale = (id) => get('sales', id);

export async function getSaleByFolio(folio) {
  const [sale] = await getAllByIndex('sales', 'folio', folio);
  return sale || null;
}

export async function lastSale() {
  const counter = await get('kv', 'folio');
  return counter?.value ? getSaleByFolio(counter.value) : null;
}

// ---------- Caja ----------
export async function openShift(openingFloat) {
  await tx(['shifts', 'kv'], 'readwrite', async ({ shifts, kv }) => {
    if ((await req(kv.get('openShiftId')))?.value) throw new UserError('Ya hay una caja abierta.');
    const shift = { id: uid(), openedAt: now(), openingFloat, status: 'open' };
    await req(shifts.put(shift));
    await req(kv.put({ key: 'openShiftId', value: shift.id }));
  });
  await refreshShift();
}

export async function addCashMove(type, amount, reason) {
  if (!state.shift) throw new UserError('No hay una caja abierta.');
  await put('cashMoves', { id: uid(), shiftId: state.shift.id, type, amount, reason, date: now() });
}

export async function shiftDetails(shift) {
  const [sales, cashMoves] = await Promise.all([
    getAllByIndex('sales', 'shiftId', shift.id),
    getAllByIndex('cashMoves', 'shiftId', shift.id),
  ]);
  cashMoves.sort((a, b) => b.date.localeCompare(a.date));
  return { sales, cashMoves, summary: summarizeShift(shift, sales, cashMoves) };
}

export async function closeShift(counted, note = '') {
  if (!state.shift) throw new UserError('No hay una caja abierta.');
  const shift = state.shift;
  await tx(['shifts', 'sales', 'cashMoves', 'kv'], 'readwrite', async ({ shifts, sales, cashMoves, kv }) => {
    const shiftSales = await req(sales.index('shiftId').getAll(shift.id));
    const moves = await req(cashMoves.index('shiftId').getAll(shift.id));
    const summary = summarizeShift(shift, shiftSales, moves);
    await req(shifts.put({
      ...shift, status: 'closed', closedAt: now(), counted, note, summary, difference: counted - summary.expected,
    }));
    await req(kv.delete('openShiftId'));
  });
  await refreshShift();
}

export const closedShifts = async () => (await getAll('shifts'))
  .filter((s) => s.status === 'closed')
  .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

// ---------- Fiado ----------
export const listCustomers = async () => (await getAll('customers'))
  .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'es'));

export async function createCustomer(name, phone = '') {
  const customer = { id: uid(), name, phone, balance: 0, createdAt: now() };
  await put('customers', customer);
  return customer;
}

export const creditHistory = async (customerId) => (await getAllByIndex('creditMoves', 'customerId', customerId))
  .sort((a, b) => b.date.localeCompare(a.date));

export async function payCredit(customerId, amount, method) {
  if (method === 'cash' && !state.shift) throw new UserError('Abre la caja para recibir un abono en efectivo.');
  await tx(['customers', 'creditMoves', 'cashMoves'], 'readwrite', async ({ customers, creditMoves, cashMoves }) => {
    const customer = await req(customers.get(customerId));
    if (!customer) throw new UserError('El cliente ya no existe.');
    if (amount > customer.balance) throw new UserError('El abono es mayor que la deuda.');
    customer.balance -= amount;
    await req(customers.put(customer));
    await req(creditMoves.put({ id: uid(), customerId, type: 'payment', amount, method, note: 'Abono', date: now() }));
    if (method === 'cash') {
      await req(cashMoves.put({
        id: uid(), shiftId: state.shift.id, type: 'in', amount, reason: `Abono de ${customer.name}`, date: now(),
      }));
    }
  });
}

// ---------- Facturas (solicitudes por timbrar) ----------
export const listInvoices = async () => (await getAll('invoices')).sort((a, b) => b.date.localeCompare(a.date));

export async function saveInvoice({ type, saleIds, customer, paymentForm, period = null }) {
  return tx(['invoices', 'sales'], 'readwrite', async ({ invoices, sales }) => {
    if (!saleIds.length) throw new UserError('No hay ventas para facturar.');
    const id = uid();
    let net = 0;
    let tax = 0;
    let total = 0;
    const folios = [];
    for (const saleId of saleIds) {
      const sale = await req(sales.get(saleId));
      if (!sale || sale.status === 'cancelled') throw new UserError('Una de las ventas ya no es válida.');
      if (sale.invoiceId) throw new UserError(`El ticket ${sale.folio} ya está facturado.`);
      net += sale.net;
      tax += sale.tax;
      total += sale.total;
      folios.push(sale.folio);
      sale.invoiceId = id;
      await req(sales.put(sale));
    }
    const invoice = { id, type, status: 'pending', date: now(), customer, paymentForm, period, saleIds, folios, net, tax, total };
    await req(invoices.put(invoice));
    return invoice;
  });
}

export async function setInvoiceStatus(id, status) {
  const invoice = await get('invoices', id);
  await put('invoices', { ...invoice, status });
}

// ---------- Respaldo ----------
export async function exportBackup() {
  const data = await tx(STORES, 'readonly', async (stores) => {
    const entries = await Promise.all(STORES.map(async (name) => [name, await req(stores[name].getAll())]));
    return Object.fromEntries(entries);
  });
  return { app: 'abarroteria-pos', version: 1, exportedAt: now(), data };
}

export async function restoreBackup(backup) {
  if (backup?.app !== 'abarroteria-pos' || !STORES.every((name) => Array.isArray(backup.data?.[name]))) {
    throw new UserError('El archivo no es un respaldo válido de este sistema.');
  }
  await tx(STORES, 'readwrite', async (stores) => {
    for (const name of STORES) {
      await req(stores[name].clear());
      for (const row of backup.data[name]) await req(stores[name].put(row));
    }
  });
  await init();
}

export async function wipeAll() {
  await tx(STORES, 'readwrite', async (stores) => {
    for (const name of STORES) await req(stores[name].clear());
  });
  await init();
}

function inDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function loadDemoProducts() {
  const code = (...codes) => codes.map(([label, value]) => ({ label, code: value }));
  const base = { unit: 'pza', minStock: 5, taxRate: 16, expiry: '', packUnits: 0 };
  await importProducts([
    { ...base, name: 'Refresco cola 600 ml', category: 'Abarrotes', price: 2000, cost: 1500, stock: 8, minStock: 12, packUnits: 24, barcodes: code(['', '7500000000103']) },
    { ...base, name: 'Chicle de $3', category: 'Dulces', price: 300, cost: 210, stock: 143, minStock: 20, packUnits: 20, barcodes: code(['Menta', '7500000000011'], ['Fresa', '7500000000028'], ['Yerbabuena', '7500000000035']) },
    { ...base, name: 'Huevo por pieza', category: 'Sueltos', price: 400, cost: 300, stock: 212, minStock: 30, taxRate: 0, packUnits: 360, barcodes: [] },
    { ...base, name: 'Dulce de $1', category: 'Dulces', price: 100, cost: 60, stock: 90, packUnits: 100, barcodes: [] },
    { ...base, name: 'Paleta de $2', category: 'Dulces', price: 200, cost: 130, stock: 76, packUnits: 50, barcodes: [] },
    { ...base, name: 'Jamón', category: 'Por peso', unit: 'kg', price: 14000, cost: 10500, stock: 2.4, minStock: 1, taxRate: 0, expiry: inDays(3), barcodes: [] },
    { ...base, name: 'Queso', category: 'Por peso', unit: 'kg', price: 16000, cost: 12000, stock: 1.1, minStock: 1.5, taxRate: 0, barcodes: [] },
    { ...base, name: 'Tortilla', category: 'Por peso', unit: 'kg', price: 2600, cost: 2000, stock: 18, minStock: 5, taxRate: 0, barcodes: [] },
    { ...base, name: 'Yogur natural 1 L', category: 'Abarrotes', price: 3800, cost: 2900, stock: 6, minStock: 3, taxRate: 0, expiry: inDays(5), barcodes: code(['', '7500000000042']) },
    { ...base, name: 'Jabón de barra', category: 'Abarrotes', price: 2200, cost: 1600, stock: 24, packUnits: 12, barcodes: code(['', '7500000000059']) },
    { ...base, name: 'Leche entera 1 L', category: 'Abarrotes', price: 2800, cost: 2300, stock: 30, minStock: 10, taxRate: 0, packUnits: 12, barcodes: code(['', '7500000000066']) },
    { ...base, name: 'Galletas de vainilla', category: 'Abarrotes', price: 1800, cost: 1300, stock: 40, minStock: 10, barcodes: code(['', '7500000000073']) },
  ]);
}

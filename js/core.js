// Lógica pura, sin DOM ni IndexedDB. Todo el dinero se maneja en centavos enteros.

// ---------- Plantillas HTML con escape automático ----------
class Safe {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderValue(value) {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
  return new Safe(out);
}

// ---------- Dinero y cantidades ----------
export function parseMoney(input) {
  const s = String(input ?? '').trim().replace(/[$\s,]/g, '');
  if (s === '' || s === '.' || !/^\d*(\.\d{0,2})?$/.test(s)) return null;
  const [whole, decimals = ''] = s.split('.');
  return Number(whole || 0) * 100 + Number((decimals + '00').slice(0, 2));
}

export function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}

export function roundQty(qty) {
  return Math.round((Number(qty) + Number.EPSILON) * 1000) / 1000;
}

export function parseQty(input) {
  const s = String(input ?? '').trim().replace(/,/g, '');
  if (!/^-?\d*(\.\d{0,3})?$/.test(s) || s === '' || s === '.' || s === '-') return null;
  return roundQty(Number(s));
}

// Por defecto oculta ".00", como en "$20". Con full siempre muestra centavos.
export function formatMoney(cents, currency = 'MXN', { full = false } = {}) {
  const digits = !full && cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: 2,
  }).format(cents / 100);
}

// Ganancia por unidad. El margen es sobre el precio de venta; null si falta precio o costo.
export function computeMargin(price, cost) {
  const profit = price - cost;
  return { profit, margin: cost > 0 && price > 0 ? Math.round((profit / price) * 1000) / 10 : null };
}

// Costo por pieza a partir del costo de la caja; null si faltan datos.
export function unitCostFromPack(packCost, units) {
  if (!packCost || !Number.isInteger(units) || units <= 0) return null;
  return Math.round(packCost / units);
}

export function formatPercent(value) {
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatCode(code) {
  return /^\d{13}$/.test(code) ? `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}` : code;
}

export function initials(name) {
  const clean = String(name).trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1, 2).toLowerCase() : '?';
}

export function tintIndex(name, count = 7) {
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.codePointAt(0)) % 1000003;
  return hash % count;
}

// Días que faltan para una fecha AAAA-MM-DD; null si no hay fecha.
export function daysUntil(date, today = new Date()) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - start) / 86400000);
}

export const EXPIRY_WARNING_DAYS = 7;

export function isValidRFC(rfc) {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(String(rfc).toUpperCase());
}

export function formatQty(qty) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(qty);
}

// ---------- Totales ----------
export function resolveDiscount(discount, gross) {
  if (!discount || !discount.value) return 0;
  const amount = discount.type === 'percent'
    ? Math.round((gross * discount.value) / 100)
    : discount.value;
  return Math.min(Math.max(amount, 0), gross);
}

// Reparte el descuento entre líneas sin perder centavos (mayor residuo).
function allocateDiscount(grossByLine, gross, discount) {
  if (!discount || !gross) return grossByLine.map(() => 0);
  const exact = grossByLine.map((g) => (g * discount) / gross);
  const floors = exact.map(Math.floor);
  let remaining = discount - floors.reduce((a, b) => a + b, 0);
  exact
    .map((value, index) => ({ index, rest: value - floors[index] }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ index }) => {
      if (remaining > 0) { floors[index] += 1; remaining -= 1; }
    });
  return floors;
}

export function computeTotals(items, { discount = null, pricesIncludeTax = true } = {}) {
  const grossByLine = items.map((item) => Math.round(item.qty * item.unitPrice));
  const gross = grossByLine.reduce((a, b) => a + b, 0);
  const discountAmount = resolveDiscount(discount, gross);
  const allocation = allocateDiscount(grossByLine, gross, discountAmount);
  const taxByRate = {};

  const lines = items.map((item, i) => {
    const afterDiscount = grossByLine[i] - allocation[i];
    const rate = item.taxRate || 0;
    let tax;
    let net;
    if (pricesIncludeTax) {
      tax = Math.round((afterDiscount * rate) / (100 + rate));
      net = afterDiscount - tax;
    } else {
      net = afterDiscount;
      tax = Math.round((net * rate) / 100);
    }
    if (rate > 0) taxByRate[rate] = (taxByRate[rate] || 0) + tax;
    return { ...item, gross: grossByLine[i], discount: allocation[i], net, tax, total: net + tax };
  });

  const net = lines.reduce((a, l) => a + l.net, 0);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  return { lines, gross, discount: discountAmount, net, tax, total: net + tax, taxByRate };
}

// ---------- Caja ----------
export function summarizeShift(shift, sales, cashMoves) {
  const active = sales.filter((s) => s.status !== 'cancelled');
  const totalBy = (method) => active.filter((s) => s.method === method).reduce((a, s) => a + s.total, 0);
  const cashIn = cashMoves.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount, 0);
  const cashOut = cashMoves.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount, 0);
  const cashSales = totalBy('cash');
  return {
    openingFloat: shift.openingFloat,
    cashSales,
    cardSales: totalBy('card'),
    transferSales: totalBy('transfer'),
    creditSales: totalBy('credit'),
    cashIn,
    cashOut,
    expected: shift.openingFloat + cashSales + cashIn - cashOut,
    tickets: active.length,
    total: active.reduce((a, s) => a + s.total, 0),
  };
}

// ---------- Reportes ----------
function localDayKey(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Cada venta se reparte en costo + IVA + ganancia, por día y por hora local.
export function aggregateSales(sales) {
  const active = sales.filter((s) => s.status !== 'cancelled');
  const byMethod = { cash: 0, card: 0, transfer: 0, credit: 0 };
  const byDay = {};
  const byHour = {};
  const products = new Map();
  let total = 0;
  let tax = 0;
  let profit = 0;
  let cost = 0;
  const bucket = (store, key) => {
    store[key] ||= { total: 0, cost: 0, tax: 0, profit: 0 };
    return store[key];
  };

  for (const sale of active) {
    total += sale.total;
    tax += sale.tax;
    byMethod[sale.method] = (byMethod[sale.method] || 0) + sale.total;
    const day = bucket(byDay, localDayKey(sale.date));
    const hour = bucket(byHour, new Date(sale.date).getHours());
    for (const target of [day, hour]) {
      target.total += sale.total;
      target.tax += sale.tax;
    }
    for (const line of sale.lines) {
      const lineCost = Math.round(line.qty * (line.cost || 0));
      profit += line.net - lineCost;
      cost += lineCost;
      for (const target of [day, hour]) {
        target.cost += lineCost;
        target.profit += line.net - lineCost;
      }
      const key = line.productId || line.name;
      const row = products.get(key) || { name: line.name, unit: line.unit, qty: 0, total: 0 };
      row.qty = roundQty(row.qty + line.qty);
      row.total += line.total;
      products.set(key, row);
    }
  }

  return {
    total,
    tax,
    profit,
    cost,
    // Margen sobre lo vendido sin IVA, porque el IVA no es dinero de la tienda.
    margin: total - tax > 0 ? Math.round((profit / (total - tax)) * 1000) / 10 : null,
    tickets: active.length,
    average: active.length ? Math.round(total / active.length) : 0,
    cancelled: sales.length - active.length,
    byMethod,
    byDay,
    byHour,
    topProducts: [...products.values()].sort((a, b) => b.total - a.total),
  };
}

// ---------- CSV ----------
export function parseCSV(text) {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

// Evita que Excel interprete textos como fórmulas al abrir el CSV.
function neutralizeFormula(value) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCSV(rows, textColumns = []) {
  return rows.map((row, rowIndex) => row.map((value, columnIndex) => {
    let s = String(value ?? '');
    if (rowIndex > 0 && textColumns.includes(columnIndex)) s = neutralizeFormula(s);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

export const PRODUCT_CSV_HEADER = ['codigo', 'nombre', 'categoria', 'precio', 'costo', 'existencias', 'minimo', 'unidad', 'iva', 'caducidad', 'piezas_por_caja'];
export const UNITS = ['pza', 'kg', 'l', 'm'];
export const MINISUPER_CATEGORIES = [
  'Abarrotes', 'Aceites y condimentos', 'Aguas y jugos', 'Artículos para bebé', 'Botanas', 'Café, té y azúcar',
  'Cereales y granos', 'Cervezas, vinos y licores', 'Cigarros', 'Congelados', 'Dulces y chocolates', 'Enlatados y conservas',
  'Farmacia y botiquín', 'Frutas y verduras', 'Galletas', 'General', 'Higiene personal', 'Lácteos y huevo',
  'Limpieza del hogar', 'Mascotas', 'Pan y tortillas', 'Papelería', 'Por peso', 'Recargas y servicios',
  'Refrescos', 'Salchichonería y carnes', 'Sueltos',
];

export function productToRow(p) {
  return [
    p.barcodes.map((b) => b.code).join('|'), p.name, p.category, centsToInput(p.price), centsToInput(p.cost),
    p.stock, p.minStock, p.unit, p.taxRate, p.expiry || '', p.packUnits || '',
  ];
}

const stripGuard = (value) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

// Devuelve { product } o { error } para una fila del CSV de productos.
export function productFromRow(header, row, defaultTaxRate = 16) {
  const get = (name) => {
    const index = header.indexOf(name);
    return index === -1 ? '' : stripGuard(String(row[index] ?? '').trim());
  };
  const name = get('nombre');
  if (!name) return { error: 'falta el nombre' };
  const price = parseMoney(get('precio'));
  if (price === null) return { error: `precio inválido en "${name}"` };
  const cost = get('costo') === '' ? 0 : parseMoney(get('costo'));
  if (cost === null) return { error: `costo inválido en "${name}"` };
  const stock = get('existencias') === '' ? 0 : parseQty(get('existencias'));
  if (stock === null) return { error: `existencias inválidas en "${name}"` };
  const minStock = get('minimo') === '' ? 0 : parseQty(get('minimo'));
  if (minStock === null || minStock < 0) return { error: `mínimo inválido en "${name}"` };
  const unit = get('unidad') || 'pza';
  if (!UNITS.includes(unit)) return { error: `unidad inválida en "${name}"` };
  const taxRate = get('iva') === '' ? defaultTaxRate : Number(get('iva'));
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return { error: `IVA inválido en "${name}"` };
  const expiry = get('caducidad');
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { error: `caducidad inválida en "${name}" (usa AAAA-MM-DD)` };
  const packUnits = get('piezas_por_caja') === '' ? 0 : Number(get('piezas_por_caja'));
  if (!Number.isInteger(packUnits) || packUnits < 0) return { error: `piezas por caja inválidas en "${name}"` };
  const barcodes = get('codigo').split('|').map((code) => code.trim()).filter(Boolean).map((code) => ({ label: '', code }));
  return {
    product: { barcodes, name, category: get('categoria') || 'General', price, cost, stock, minStock, unit, taxRate, expiry, packUnits },
  };
}

// ---------- Catálogo abierto de productos ----------
const CATALOG_IMAGE_HOSTS = ['images.openfoodfacts.org', 'images.openbeautyfacts.org', 'images.openproductsfacts.org'];

export const isLookupCode = (code) => /^\d{8,14}$/.test(String(code));

// Convierte la respuesta del catálogo en { name, image }, o null si no sirve.
export function parseCatalogProduct(json) {
  if (json?.status !== 1 || !json.product) return null;
  const p = json.product;
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Algunos registros traen como nombre solo el número del código.
  const base = [p.product_name_es, p.product_name].map(clean).find((value) => /\p{L}/u.test(value)) || '';
  const parts = [base];
  for (const extra of [clean(p.brands).split(',')[0].trim(), clean(p.quantity)]) {
    if (base && extra && !normalize(base).includes(normalize(extra))) parts.push(extra);
  }
  let image = '';
  try {
    const url = new URL(p.image_small_url);
    if (url.protocol === 'https:' && CATALOG_IMAGE_HOSTS.includes(url.hostname)) image = url.href;
  } catch { /* sin foto utilizable */ }
  if (!base && !image) return null;
  return { name: parts.join(' ').slice(0, 120), image };
}

export function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateSales, computeMargin, computeTotals, daysUntil, formatMoney, formatPercent, html, isLookupCode, isValidRFC, parseCatalogProduct, parseCSV, parseMoney, parseQty, productFromRow, unitCostFromPack,
  PRODUCT_CSV_HEADER, resolveDiscount, roundQty, summarizeShift, toCSV,
} from '../js/core.js';

test('parseMoney convierte a centavos sin errores de punto flotante', () => {
  assert.equal(parseMoney('19.99'), 1999);
  assert.equal(parseMoney('1,234.5'), 123450);
  assert.equal(parseMoney('$ 0.07'), 7);
  assert.equal(parseMoney('1.005'), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney(''), null);
});

test('parseQty acepta hasta tres decimales', () => {
  assert.equal(parseQty('1.255'), 1.255);
  assert.equal(parseQty('-2'), -2);
  assert.equal(parseQty('1.2345'), null);
  assert.equal(roundQty(0.1 + 0.2), 0.3);
});

test('IVA incluido en el precio', () => {
  const t = computeTotals([{ qty: 1, unitPrice: 11600, taxRate: 16 }], { pricesIncludeTax: true });
  assert.equal(t.total, 11600);
  assert.equal(t.tax, 1600);
  assert.equal(t.net, 10000);
  assert.deepEqual(t.taxByRate, { 16: 1600 });
});

test('IVA agregado sobre el precio', () => {
  const t = computeTotals([{ qty: 2, unitPrice: 5000, taxRate: 16 }], { pricesIncludeTax: false });
  assert.equal(t.net, 10000);
  assert.equal(t.tax, 1600);
  assert.equal(t.total, 11600);
});

test('tasa 0% no genera impuesto', () => {
  const t = computeTotals([
    { qty: 1, unitPrice: 2000, taxRate: 0 },
    { qty: 1, unitPrice: 1160, taxRate: 16 },
  ]);
  assert.equal(t.total, 3160);
  assert.equal(t.tax, 160);
  assert.deepEqual(t.taxByRate, { 16: 160 });
});

test('el descuento se reparte sin perder centavos', () => {
  const t = computeTotals([
    { qty: 1, unitPrice: 333, taxRate: 0 },
    { qty: 1, unitPrice: 333, taxRate: 0 },
    { qty: 1, unitPrice: 334, taxRate: 0 },
  ], { discount: { type: 'amount', value: 100 } });
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 100);
  assert.equal(t.total, 900);
});

test('el descuento nunca supera el importe', () => {
  assert.equal(resolveDiscount({ type: 'amount', value: 5000 }, 1000), 1000);
  assert.equal(resolveDiscount({ type: 'percent', value: 10 }, 1000), 100);
  assert.equal(resolveDiscount(null, 1000), 0);
});

test('cantidades fraccionarias redondean al centavo', () => {
  const t = computeTotals([{ qty: 0.375, unitPrice: 8999, taxRate: 0 }]);
  assert.equal(t.total, 3375);
});

test('el corte de caja ignora ventas canceladas y otros métodos', () => {
  const summary = summarizeShift({ openingFloat: 50000 }, [
    { method: 'cash', total: 10000, status: 'completed' },
    { method: 'cash', total: 7000, status: 'cancelled' },
    { method: 'card', total: 3000, status: 'completed' },
  ], [
    { type: 'in', amount: 2000 },
    { type: 'out', amount: 500 },
  ]);
  assert.equal(summary.expected, 61500);
  assert.equal(summary.cardSales, 3000);
  assert.equal(summary.tickets, 2);
});

test('los reportes calculan utilidad sobre el importe sin IVA', () => {
  const report = aggregateSales([{
    date: '2026-11-09T18:00:00.000Z',
    method: 'cash',
    total: 11600,
    tax: 1600,
    status: 'completed',
    lines: [{ productId: 'a', name: 'A', qty: 2, cost: 3000, net: 10000, total: 11600 }],
  }]);
  assert.equal(report.profit, 4000);
  assert.equal(report.average, 11600);
  assert.equal(report.topProducts[0].qty, 2);
});

test('parseCSV maneja comillas, saltos de línea, BOM y punto y coma', () => {
  assert.deepEqual(parseCSV('﻿a,b\r\n"x, ""y""",2\n'), [['a', 'b'], ['x, "y"', '2']]);
  assert.deepEqual(parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCSV('"l1\nl2",z'), [['l1\nl2', 'z']]);
});

test('toCSV neutraliza fórmulas y productFromRow las restaura', () => {
  const csv = toCSV([PRODUCT_CSV_HEADER, ['', '=SUMA(A1)', 'X', '1.00', '0.50', 1, 0, 'pza', 16]], [0, 1, 2]);
  const [header, row] = parseCSV(csv);
  assert.equal(row[1], "'=SUMA(A1)");
  assert.equal(productFromRow(header, row).product.name, '=SUMA(A1)');
});

test('productFromRow valida los campos', () => {
  const h = PRODUCT_CSV_HEADER;
  assert.match(productFromRow(h, ['', '', '', '1']).error, /nombre/);
  assert.match(productFromRow(h, ['', 'A', '', 'x']).error, /precio/);
  assert.match(productFromRow(h, ['', 'A', '', '1', '', '', '', 'caja']).error, /unidad/);
  const { product } = productFromRow(h, ['123', 'A', '', '10.50', '', '', '', '', '']);
  assert.equal(product.price, 1050);
  assert.equal(product.taxRate, 16);
  assert.equal(product.category, 'General');
});

test('un producto admite varios códigos y caducidad', () => {
  const row = ['111|222', 'A', '', '3', '', '', '', '', '', '2026-12-01', '20'];
  const { product } = productFromRow(PRODUCT_CSV_HEADER, row);
  assert.deepEqual(product.barcodes.map((b) => b.code), ['111', '222']);
  assert.equal(product.expiry, '2026-12-01');
  assert.equal(product.packUnits, 20);
  row[9] = '01/12/2026';
  assert.match(productFromRow(PRODUCT_CSV_HEADER, row).error, /caducidad/);
});

test('montos enteros sin decimales y facturas con centavos', () => {
  assert.equal(formatMoney(2000), '$20');
  assert.equal(formatMoney(2050), '$20.50');
  assert.equal(formatMoney(2000, 'MXN', { full: true }), '$20.00');
});

test('daysUntil cuenta días de calendario', () => {
  const today = new Date(2026, 10, 9, 23, 30);
  assert.equal(daysUntil('2026-11-12', today), 3);
  assert.equal(daysUntil('2026-11-08', today), -1);
  assert.equal(daysUntil('', today), null);
});

test('valida el formato del RFC', () => {
  assert.equal(isValidRFC('EJEM800101AB1'), true);
  assert.equal(isValidRFC('ABC800101AB1'), true);
  assert.equal(isValidRFC('NOVALIDO'), false);
});

test('el corte separa las ventas fiadas del efectivo', () => {
  const s = summarizeShift({ openingFloat: 0 }, [{ method: 'credit', total: 500, status: 'completed' }], []);
  assert.equal(s.creditSales, 500);
  assert.equal(s.expected, 0);
});

test('el catálogo arma el nombre con marca y tamaño sin repetir', () => {
  const image = 'https://images.openfoodfacts.org/images/products/1/front_es.200.jpg';
  assert.deepEqual(
    parseCatalogProduct({ status: 1, product: { product_name_es: 'Pan de molde', brands: 'Bimbo,Grupo', quantity: '620g', image_small_url: image } }),
    { name: 'Pan de molde Bimbo 620g', image },
  );
  assert.equal(parseCatalogProduct({ status: 1, product: { product_name: 'Coca-Cola', brands: 'Coca-Cola', quantity: '355 ml' } }).name, 'Coca-Cola 355 ml');
});

test('el catálogo descarta nombres numéricos, fotos ajenas y productos vacíos', () => {
  assert.equal(parseCatalogProduct({ status: 0 }), null);
  assert.equal(parseCatalogProduct({ status: 1, product: { product_name: '7501030459941' } }), null);
  const onlyPhoto = parseCatalogProduct({ status: 1, product: { product_name: '7501030459941', brands: 'barcel', image_small_url: 'https://images.openfoodfacts.org/a.jpg' } });
  assert.equal(onlyPhoto.name, '');
  assert.equal(parseCatalogProduct({ status: 1, product: { product_name: 'A', image_small_url: 'https://malicioso.example/a.jpg' } }).image, '');
  assert.equal(parseCatalogProduct({ status: 1, product: { product_name: 'A', image_small_url: 'javascript:alert(1)' } }).image, '');
});

test('solo se consultan códigos de barras numéricos', () => {
  assert.equal(isLookupCode('7501055300075'), true);
  assert.equal(isLookupCode('123'), false);
  assert.equal(isLookupCode('../../x'), false);
});

test('la ganancia se calcula en pesos y en porcentaje sobre el costo', () => {
  assert.deepEqual(computeMargin(300, 210), { profit: 90, percent: 42.9, margin: 30 });
  assert.deepEqual(computeMargin(1000, 1250), { profit: -250, percent: -20, margin: -25 });
  assert.deepEqual(computeMargin(500, 0), { profit: 500, percent: null, margin: null });
  assert.deepEqual(computeMargin(0, 100), { profit: -100, percent: -100, margin: null });
  assert.equal(formatPercent(42.9), '42.9%');
  assert.equal(formatPercent(30), '30%');
});

test('el costo por pieza sale del costo de la caja', () => {
  assert.equal(unitCostFromPack(23000, 10), 2300);
  assert.equal(unitCostFromPack(10000, 3), 3333);
  assert.equal(unitCostFromPack(null, 10), null);
  assert.equal(unitCostFromPack(0, 10), null);
  assert.equal(unitCostFromPack(23000, 0), null);
  assert.equal(unitCostFromPack(23000, 1.5), null);
});

test('html escapa valores y conserva fragmentos anidados', () => {
  const inner = html`<b>${'<x>'}</b>`;
  assert.equal(String(html`<p>${inner}${['"', null, false]}</p>`), '<p><b>&lt;x&gt;</b>&quot;</p>');
});

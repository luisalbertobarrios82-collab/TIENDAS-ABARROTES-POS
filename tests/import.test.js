import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  buildImportRows, detectHeaderRow, guessMapping, missingRequired, parseBarcodesCell, parseDateCell,
  parseMoneyCell, parseQtyCell, parseTaxCell, parseUnitCell,
} from '../js/import-map.js';
import { crc32, buildXlsx } from '../js/xlsx.js';
import { columnIndex, decodeText, readCsvText, readXlsx, unescapeXml } from '../js/xlsx-read.js';

const enc = new TextEncoder();

// ZIP con compresión deflate, como los que guarda Excel.
function deflatedZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(text);
    const data = new Uint8Array(deflateRawSync(raw));
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(8, 8, true); h.setUint32(14, crc32(raw), true);
    h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(h.buffer), nameBytes, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(16, crc32(raw), true);
    c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cd = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true);
  e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, cd, true); e.setUint32(16, offset, true);
  const all = [...local, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}

test('lee un Excel con textos compartidos, compresión y filas con huecos', async () => {
  const bytes = deflatedZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Mi &amp; Inventario" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Descripción</t></si><si><r><t>PV</t></r><r><t>P</t></r></si><si><t>Jamón &lt;pavo&gt;</t><rPh><t>x</t></rPh></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c></row><row r="5"><c r="A5" t="s"><v>2</v></c><c r="C5"><v>140.5</v></c></row></sheetData></worksheet>',
  });
  const [sheet] = await readXlsx(bytes);
  assert.equal(sheet.name, 'Mi & Inventario');
  assert.deepEqual(sheet.rows, [['Descripción', '', 'PVP'], ['Jamón <pavo>', '', 140.5]]);
  assert.deepEqual(sheet.rowNumbers, [2, 5]);
});

test('lee el Excel que genera la propia app', async () => {
  const bytes = buildXlsx({ sheetName: 'Inventario', columns: [{ header: 'Nombre', type: 'text' }, { header: 'Precio', type: 'money' }], rows: [['Leche', 28]] });
  const [sheet] = await readXlsx(bytes);
  assert.deepEqual(sheet.rows, [['Nombre', 'Precio'], ['Leche', 28]]);
});

test('lee CSV en UTF-8 y en Windows-1252', () => {
  assert.equal(decodeText(enc.encode('Jamón')), 'Jamón');
  assert.equal(decodeText(new Uint8Array([0x4a, 0x61, 0x6d, 0xf3, 0x6e])), 'Jamón');
  assert.deepEqual(readCsvText('a,b\n,\n1,2')[0].rowNumbers, [1, 3]);
  assert.equal(columnIndex('AB12'), 27);
  assert.equal(unescapeXml('&#241;&#x41;&amp;'), 'ñA&');
});

test('encuentra los encabezados aunque haya títulos arriba', () => {
  const rows = [['Abarrotes La Esquina'], ['Inventario al 10/11'], [], ['Código', 'Descripción', 'PVP', 'Stock']];
  assert.equal(detectHeaderRow(rows), 3);
});

test('reconoce columnas con nombres distintos', () => {
  assert.deepEqual(
    guessMapping(['Código', 'Descripción', 'Precio de compra', 'PVP', 'Stock', 'Depto', 'Observaciones']),
    ['barcodes', 'name', 'cost', 'price', 'stock', 'category', ''],
  );
  assert.deepEqual(guessMapping(['Producto', 'Precio', 'Costo', 'Cantidad']), ['name', 'price', 'cost', 'stock']);
  assert.deepEqual(guessMapping(['Descripción', 'P.V.P.', 'U.M.', 'C.B.']), ['name', 'price', 'unit', 'barcodes']);
  assert.deepEqual(missingRequired(['name', '']), ['Precio de venta']);
});

test('convierte precios, cantidades, códigos, unidades, IVA y fechas', () => {
  assert.equal(parseMoneyCell('$1,250.50'), 125050);
  assert.equal(parseMoneyCell('12,5'), 1250);
  assert.equal(parseMoneyCell('1.250,50'), 125050);
  assert.equal(parseMoneyCell(12.5), 1250);
  assert.equal(parseMoneyCell(''), undefined);
  assert.equal(parseMoneyCell('gratis'), null);
  assert.equal(parseQtyCell('1,200'), 1200);
  assert.equal(parseQtyCell('-3', { allowNegative: true }), -3);
  assert.deepEqual(parseBarcodesCell(7501055300075), ['7501055300075']);
  assert.deepEqual(parseBarcodesCell('750 1055 300075 | 7500000000015'), ['7501055300075', '7500000000015']);
  assert.equal(parseBarcodesCell('7.50105E+12'), null);
  assert.equal(parseUnitCell('Kilo'), 'kg');
  assert.equal(parseUnitCell('PZA'), 'pza');
  assert.equal(parseUnitCell('docena'), null);
  assert.equal(parseTaxCell('16%'), 16);
  assert.equal(parseTaxCell(0.16), 16);
  assert.equal(parseTaxCell('Exento'), 0);
  assert.equal(parseDateCell(46387), '2026-12-31');
  assert.equal(parseDateCell('31/12/2026'), '2026-12-31');
  assert.equal(parseDateCell('2026-02-30'), null);
});

test('revisa filas: errores, avisos, repetidos y solo los campos presentes', () => {
  const sheet = {
    rows: [
      ['Código', 'Producto', 'PVP', 'Stock', 'Unidad'],
      ['7501055300075', 'Refresco', '$20', '24', 'pza'],
      ['', 'Jamón', '140.5', '', 'kilo'],
      ['7501055300075', 'Refresco repetido', '20', '1', ''],
      ['7.50105E+12', 'Código dañado', '10', '', ''],
      ['', '', '', '', ''],
      ['', 'Sin precio', '', '5', ''],
      ['', 'Galletas', '18', '10', 'caja grande'],
      ['', 'TOTAL', '', '', ''],
    ],
    rowNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
  const result = buildImportRows(sheet, 0, ['barcodes', 'name', 'price', 'stock', 'unit']);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items[0].product, { name: 'Refresco', price: 2000, barcodes: [{ label: '', code: '7501055300075' }], stock: 24, unit: 'pza' });
  assert.equal('stock' in result.items[1].product, false);
  assert.equal(result.items[1].product.unit, 'kg');
  assert.deepEqual(result.errors.map((e) => e.row), [4, 5, 7]);
  assert.match(result.errors[0].message, /fila 2/);
  assert.match(result.errors[1].message, /notación científica/);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.skipped, 1);
});

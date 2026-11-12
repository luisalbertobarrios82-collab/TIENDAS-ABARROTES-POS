// Convierte la hoja de cálculo de cualquier tienda en productos de la app.
// Todo es lógica pura para poder probarla sin navegador.
import { normalize, roundQty, UNITS } from './core.js';

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Nombre', required: true, synonyms: ['nombre', 'producto', 'descripcion', 'articulo', 'nombre del producto', 'descripcion del producto', 'concepto', 'item'] },
  { key: 'barcodes', label: 'Código de barras', synonyms: ['codigo', 'codigo de barras', 'cod barras', 'codigo barras', 'barcode', 'ean', 'upc', 'cb', 'codigos de barras'] },
  { key: 'price', label: 'Precio de venta', required: true, synonyms: ['precio', 'precio venta', 'precio de venta', 'pvp', 'precio publico', 'precio al publico', 'venta', 'p venta', 'precio unitario', 'precio menudeo'] },
  { key: 'cost', label: 'Costo', synonyms: ['costo', 'precio compra', 'precio de compra', 'costo unitario', 'compra', 'p compra', 'costo por pieza', 'ultimo costo'] },
  { key: 'stock', label: 'Existencias', synonyms: ['existencias', 'existencia', 'stock', 'cantidad', 'inventario', 'piezas', 'unidades', 'cant', 'stock actual', 'existencia actual'] },
  { key: 'category', label: 'Categoría', synonyms: ['categoria', 'departamento', 'linea', 'familia', 'grupo', 'depto', 'seccion'] },
  { key: 'unit', label: 'Se vende por', synonyms: ['unidad', 'unidad de medida', 'um', 'medida', 'se vende por', 'tipo de venta'] },
  { key: 'minStock', label: 'Existencia mínima', synonyms: ['minimo', 'stock minimo', 'existencia minima', 'inventario minimo', 'avisar cuando queden', 'punto de reorden'] },
  { key: 'taxRate', label: 'IVA', synonyms: ['iva', 'impuesto', 'tasa iva', 'tasa de iva', 'iva %'] },
  { key: 'expiry', label: 'Caducidad', synonyms: ['caducidad', 'fecha de caducidad', 'fecha caducidad', 'vence', 'vencimiento', 'fecha de vencimiento'] },
  { key: 'packUnits', label: 'Piezas por caja', synonyms: ['piezas por caja', 'pzas por caja', 'pz por caja', 'unidades por caja', 'contenido caja', 'piezas caja', 'contenido'] },
];

export const fieldLabel = (key) => IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key;

const headerText = (value) => normalize(String(value ?? '')).replace(/[^a-z0-9%]+/g, ' ').trim();
const isEmpty = (value) => value === '' || value === null || value === undefined || (typeof value === 'string' && !value.trim());

// Coincidencia exacta (también sin espacios, como "U.M." = "um") vale más que contener la palabra.
function fieldScore(text, field) {
  const compact = text.replace(/ /g, '');
  let score = 0;
  for (const synonym of field.synonyms) {
    if (text === synonym || compact === synonym.replace(/ /g, '')) score = Math.max(score, 100 + synonym.length);
    else if (synonym.length >= 3 && ` ${text} `.includes(` ${synonym} `)) score = Math.max(score, synonym.length);
  }
  return score;
}

function synonymScore(header) {
  return Math.max(0, ...IMPORT_FIELDS.map((field) => fieldScore(header, field)));
}

// La fila de encabezados puede no ser la primera: busca la que más nombres de columna reconoce.
export function detectHeaderRow(rows) {
  let best = { index: -1, hits: 0 };
  rows.slice(0, 20).forEach((row, index) => {
    const hits = row.filter((cell) => synonymScore(headerText(cell)) > 0).length;
    if (hits > best.hits) best = { index, hits };
  });
  if (best.hits >= 2) return best.index;
  const firstText = rows.findIndex((row) => row.filter((cell) => typeof cell === 'string' && cell.trim()).length >= 2);
  return firstText === -1 ? 0 : firstText;
}

// Asigna a cada columna el campo más probable; cada campo se usa una sola vez.
export function guessMapping(headers) {
  const candidates = headers.flatMap((header, col) => {
    const text = headerText(header);
    return IMPORT_FIELDS.map((field) => ({ col, key: field.key, score: fieldScore(text, field) }))
      .filter((c) => c.score > 0);
  }).sort((a, b) => b.score - a.score);
  const mapping = headers.map(() => '');
  const used = new Set();
  for (const { col, key } of candidates) {
    if (mapping[col] || used.has(key)) continue;
    mapping[col] = key;
    used.add(key);
  }
  return mapping;
}

export const mappingSignature = (headers) => headers.map(headerText).join('|');

export function missingRequired(mapping) {
  return IMPORT_FIELDS.filter((f) => f.required && !mapping.includes(f.key)).map((f) => f.label);
}

// ---------- Conversión de valores ----------
// Cada función devuelve undefined si la celda está vacía y null si el valor no sirve.

function cleanNumberText(text) {
  let s = String(text).replace(/[$\s ]|mxn|pesos?/gi, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(\.\d{3})+,\d{1,3}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d{1,3}$/.test(s)) s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function parseMoneyCell(value) {
  if (isEmpty(value)) return undefined;
  const number = typeof value === 'number' ? value : cleanNumberText(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

export function parseQtyCell(value, { allowNegative = false } = {}) {
  if (isEmpty(value)) return undefined;
  const number = typeof value === 'number' ? value : cleanNumberText(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) return null;
  return roundQty(number);
}

export function parseBarcodesCell(value) {
  if (isEmpty(value)) return undefined;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value < 1e15 ? [String(value)] : null;
  }
  const text = String(value).trim();
  if (/\d[.,]\d*e\+?\d+/i.test(text)) return null;
  const codes = text.split(/[|,;/]+/).map((code) => code.replace(/\s+/g, '')).filter(Boolean);
  return codes.length ? [...new Set(codes)] : undefined;
}

const UNIT_WORDS = {
  pza: ['pza', 'pzas', 'pz', 'pzs', 'pieza', 'piezas', 'unidad', 'unidades', 'u', 'und', 'un', 'pk', 'paquete'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'granel'],
  l: ['l', 'lt', 'lts', 'litro', 'litros'],
  m: ['m', 'mt', 'mts', 'metro', 'metros'],
};

export function parseUnitCell(value) {
  if (isEmpty(value)) return undefined;
  const text = headerText(value).replace(/\s/g, '');
  const found = Object.entries(UNIT_WORDS).find(([, words]) => words.includes(text));
  return found ? found[0] : null;
}

export function parseTaxCell(value) {
  if (isEmpty(value)) return undefined;
  if (typeof value === 'number') {
    const rate = value > 0 && value < 1 ? value * 100 : value;
    return rate >= 0 && rate <= 100 ? Math.round(rate * 100) / 100 : null;
  }
  const text = headerText(value);
  if (/^(exento|no|tasa 0|sin iva|0 %|0%)$/.test(text)) return 0;
  const number = cleanNumberText(text.replace('%', ''));
  if (!Number.isFinite(number)) return null;
  return parseTaxCell(number);
}

const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

export function parseDateCell(value) {
  if (isEmpty(value)) return undefined;
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  return null;
}

const shortText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const show = (value) => `"${shortText(value, 30)}"`;

// Revisa cada fila. Solo incluye en el producto los campos que el archivo trae,
// para que al actualizar no se borre lo que la tienda ya tenía.
export function buildImportRows(sheet, headerIndex, mapping) {
  const result = { items: [], errors: [], warnings: [], skipped: 0 };
  const colOf = (key) => mapping.indexOf(key);
  const seenCodes = new Map();

  for (let i = headerIndex + 1; i < sheet.rows.length; i += 1) {
    const cells = sheet.rows[i];
    const rowNumber = sheet.rowNumbers[i];
    if (!cells.some((cell) => !isEmpty(cell))) continue;
    const get = (key) => (colOf(key) === -1 ? undefined : cells[colOf(key)]);
    const errors = [];
    const warnings = [];
    const product = {};

    const name = shortText(get('name'), 120);
    const price = parseMoneyCell(get('price'));
    if (!name) {
      if (price === undefined && isEmpty(get('barcodes'))) { result.skipped += 1; continue; }
      errors.push('falta el nombre');
    } else if (/^total(es)?\b/.test(normalize(name)) && isEmpty(get('barcodes'))) {
      result.skipped += 1;
      continue;
    }
    product.name = name;

    if (price === undefined) errors.push('falta el precio');
    else if (price === null) errors.push(`precio no válido ${show(get('price'))}`);
    else product.price = price;

    const barcodes = parseBarcodesCell(get('barcodes'));
    if (barcodes === null) {
      errors.push(`código dañado ${show(get('barcodes'))}: Excel lo cambió a notación científica, corrígelo en el archivo`);
    } else if (barcodes) {
      for (const code of barcodes) {
        if (seenCodes.has(code)) errors.push(`el código ${code} también está en la fila ${seenCodes.get(code)}`);
      }
      product.barcodes = barcodes.map((code) => ({ label: '', code }));
    }

    const cost = parseMoneyCell(get('cost'));
    if (cost === null) errors.push(`costo no válido ${show(get('cost'))}`);
    else if (cost !== undefined) product.cost = cost;

    const stock = parseQtyCell(get('stock'), { allowNegative: true });
    if (stock === null) errors.push(`existencias no válidas ${show(get('stock'))}`);
    else if (stock !== undefined) product.stock = stock;

    const minStock = parseQtyCell(get('minStock'));
    if (minStock === null) warnings.push(`existencia mínima ${show(get('minStock'))} no válida, se dejó en 0`);
    else if (minStock !== undefined) product.minStock = minStock;

    const packUnits = parseQtyCell(get('packUnits'));
    if (packUnits === null || (packUnits !== undefined && !Number.isInteger(packUnits))) {
      warnings.push(`piezas por caja ${show(get('packUnits'))} no válidas, se ignoraron`);
    } else if (packUnits !== undefined) product.packUnits = packUnits;

    const unit = parseUnitCell(get('unit'));
    if (unit === null) warnings.push(`unidad ${show(get('unit'))} desconocida, se usó pieza`);
    else if (unit !== undefined && UNITS.includes(unit)) product.unit = unit;

    const taxRate = parseTaxCell(get('taxRate'));
    if (taxRate === null) warnings.push(`IVA ${show(get('taxRate'))} no válido, se usó el de Ajustes`);
    else if (taxRate !== undefined) product.taxRate = taxRate;

    const expiry = parseDateCell(get('expiry'));
    if (expiry === null) warnings.push(`caducidad ${show(get('expiry'))} no válida, se ignoró`);
    else if (expiry !== undefined) product.expiry = expiry;

    const category = shortText(get('category'), 40);
    if (category) product.category = category;

    if (errors.length) {
      result.errors.push({ row: rowNumber, name, message: errors.join('; ') });
      continue;
    }
    for (const code of barcodes || []) seenCodes.set(code, rowNumber);
    for (const message of warnings) result.warnings.push({ row: rowNumber, name, message });
    result.items.push({ row: rowNumber, product });
  }
  return result;
}

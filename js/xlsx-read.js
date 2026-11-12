// Lee hojas de cálculo sin librerías: Excel (.xlsx) y CSV.
// Cada hoja se devuelve como { name, rows, rowNumbers }, con las filas tal como están en el archivo.
import { parseCSV } from './core.js';

export class SpreadsheetError extends Error {}

const MAX_ROWS = 20000;
const utf8 = new TextDecoder('utf-8');

// Los CSV que guarda Excel en México suelen venir en Windows-1252, no en UTF-8.
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new SpreadsheetError('Este navegador no puede abrir archivos de Excel. Guarda el archivo como CSV e inténtalo de nuevo.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Índice de un ZIP: nombre de cada archivo y cómo leerlo.
export function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new SpreadsheetError('El archivo no es un Excel válido o está dañado.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new SpreadsheetError('El archivo de Excel está dañado.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, async () => {
      if (flags & 1) throw new SpreadsheetError('El archivo tiene contraseña. Quítala en Excel e inténtalo de nuevo.');
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new SpreadsheetError('El archivo de Excel usa un formato de compresión que no se puede leer.');
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function unescapeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (match, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()];
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : match;
  });
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

// Texto de un nodo con varios <t> (texto con formato), sin la guía fonética <rPh>.
const richText = (xmlPart) => unescapeXml(xmlPart.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  .match(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)?.map((t) => t.replace(/<\/?t\b[^>]*>/g, '')).join('') ?? '');

export function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? '';
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseSheet(sheetXml, shared) {
  const rows = [];
  const rowNumbers = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch;
  let fallbackRow = 0;
  while ((rowMatch = rowRe.exec(sheetXml)) && rows.length < MAX_ROWS) {
    fallbackRow += 1;
    const number = Number(attr(rowMatch[1], 'r')) || fallbackRow;
    fallbackRow = number;
    const row = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    let next = 0;
    while ((cellMatch = cellRe.exec(rowMatch[2] || ''))) {
      const ref = attr(cellMatch[1], 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attr(cellMatch[1], 't');
      const body = cellMatch[2] || '';
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = richText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
      else if (type === 'str') value = unescapeXml(raw ?? '');
      else if (type === 'b') value = raw === '1' ? 'VERDADERO' : 'FALSO';
      else if (type === 'e') value = '';
      else if (raw !== undefined) value = Number(raw);
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
    rowNumbers.push(number);
  }
  return { rows, rowNumbers };
}

export async function readXlsx(bytes) {
  const files = unzip(bytes);
  const read = async (path) => (files.has(path) ? utf8.decode(await files.get(path)()) : null);
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new SpreadsheetError('El archivo no es un Excel válido (.xlsx).');
  const rels = await read('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map((rels.match(/<Relationship\b[^>]*>/g) ?? []).map((tag) => [attr(tag, 'Id'), attr(tag, 'Target')]));
  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? (sharedXml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\s*\/>/g) ?? []).map(richText) : [];

  const sheets = [];
  for (const tag of workbook.match(/<sheet\b[^>]*>/g) ?? []) {
    const id = tag.match(/\b[\w]+:id="([^"]*)"/)?.[1];
    let target = targets.get(id);
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetXml = await read(target);
    if (sheetXml) sheets.push({ name: unescapeXml(attr(tag, 'name') ?? 'Hoja'), ...parseSheet(sheetXml, shared) });
  }
  if (!sheets.length) throw new SpreadsheetError('No se encontraron hojas en el archivo.');
  return sheets;
}

// Conserva el número de fila del archivo aunque haya filas vacías, para que los avisos coincidan con Excel.
export function readCsvText(text) {
  const rows = [];
  const rowNumbers = [];
  parseCSV(text, { keepEmpty: true }).forEach((row, i) => {
    if (rows.length < MAX_ROWS && row.some((value) => value.trim() !== '')) {
      rows.push(row);
      rowNumbers.push(i + 1);
    }
  });
  return [{ name: 'CSV', rows, rowNumbers }];
}

// Recibe un File del navegador y devuelve sus hojas.
export async function readSpreadsheet(file) {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith('.xls')) {
    throw new SpreadsheetError('Ese formato de Excel es muy antiguo. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".');
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) return readCsvText(decodeText(bytes));
  if (name.endsWith('.xlsx') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return readXlsx(bytes);
  throw new SpreadsheetError('Sube un archivo de Excel (.xlsx) o CSV.');
}

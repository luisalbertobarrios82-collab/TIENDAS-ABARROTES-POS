// Ticket en curso, compartido por la pantalla de Vender y la de la cámara.
import { computeTotals, formatQty, roundQty } from './core.js';
import { state } from './services.js';
import { toast } from './ui.js';

export const cart = { lines: [], discount: null };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function onCartChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const productOf = (line) => state.products.find((p) => p.id === line.productId);

export function cartItems() {
  return cart.lines.map((line) => {
    if (line.free) {
      return { key: line.key, productId: null, name: line.free.name, unit: 'pza', qty: 1, unitPrice: line.free.unitPrice, cost: 0, taxRate: line.free.taxRate };
    }
    const p = productOf(line);
    return { key: line.key, productId: p.id, name: p.name, unit: p.unit, qty: line.qty, unitPrice: p.price, cost: p.cost, taxRate: p.taxRate };
  });
}

export const cartTotals = () => computeTotals(cartItems(), {
  discount: cart.discount, pricesIncludeTax: state.settings.pricesIncludeTax,
});

export const cartQty = (productId) => cart.lines.find((l) => l.productId === productId)?.qty || 0;

function hasStock(p, qty) {
  if (state.settings.allowNegativeStock || p.stock >= qty) return true;
  toast(p.stock > 0 ? `Solo hay ${formatQty(p.stock)} ${p.unit} de "${p.name}".` : `"${p.name}" está agotado.`, 'error');
  return false;
}

// Suma qty al producto. Devuelve false si no hay existencias suficientes.
export function addToCart(p, qty = 1) {
  const line = cart.lines.find((l) => l.productId === p.id);
  const next = roundQty((line?.qty || 0) + qty);
  if (!hasStock(p, next)) return false;
  if (line) line.qty = next;
  else cart.lines.push({ key: p.id, productId: p.id, qty: next });
  notify();
  return true;
}

export function addFreeAmount(name, unitPrice) {
  const key = crypto.randomUUID();
  cart.lines.push({ key, productId: null, qty: 1, free: { name, unitPrice, taxRate: state.settings.defaultTaxRate } });
  notify();
}

export function setLineQty(key, qty) {
  const line = cart.lines.find((l) => l.key === key);
  if (!line) return;
  if (qty <= 0) cart.lines = cart.lines.filter((l) => l !== line);
  else if (line.free || hasStock(productOf(line), qty)) line.qty = line.free ? 1 : roundQty(qty);
  notify();
}

export function stepLine(key, direction) {
  const line = cart.lines.find((l) => l.key === key);
  if (!line) return;
  const step = line.free || productOf(line).unit === 'pza' ? 1 : 0.1;
  setLineQty(key, roundQty(line.qty + direction * step));
}

export function clearCart() {
  cart.lines = [];
  cart.discount = null;
  notify();
}

export function pruneCart() {
  cart.lines = cart.lines.filter((line) => line.free || productOf(line));
}

export function setDiscount(discount) {
  cart.discount = discount;
  notify();
}

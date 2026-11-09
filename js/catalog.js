// Busca nombre y foto por código de barras en los catálogos abiertos de Open Food Facts.
// Solo se envía el código; si no hay internet o no aparece, se captura a mano.
import { isLookupCode, parseCatalogProduct } from './core.js';

const SOURCES = ['openfoodfacts', 'openbeautyfacts', 'openproductsfacts'];
const FIELDS = 'product_name,product_name_es,brands,quantity,image_small_url';
const TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 300000;

async function query(source, code, signal) {
  const response = await fetch(`https://world.${source}.org/api/v2/product/${code}.json?fields=${FIELDS}`, { signal });
  const found = response.ok ? parseCatalogProduct(await response.json()) : null;
  if (!found) throw new Error('sin resultado');
  return found;
}

// Guarda la foto dentro de los datos para que también se vea sin internet.
async function embedImage(url, signal) {
  try {
    const blob = await (await fetch(url, { signal })).blob();
    if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) return url;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

// Devuelve { name, image } o null. Nunca lanza errores.
export async function lookupProduct(code) {
  if (!isLookupCode(code) || navigator.onLine === false) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const found = await Promise.any(SOURCES.map((source) => query(source, code, controller.signal)));
    return { ...found, image: found.image ? await embedImage(found.image, controller.signal) : '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

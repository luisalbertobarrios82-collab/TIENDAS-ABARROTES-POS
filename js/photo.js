// Fotos propias de los productos: se reducen y se guardan dentro de los datos.
import { html } from './core.js';
import { UserError } from './services.js';
import { setHTML, showError } from './ui.js';

const MAX_SIDE = 320;

export async function fileToPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    throw new UserError('No se pudo leer esa foto. Prueba con otra.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Sin el atributo capture, el teléfono ofrece tomar la foto o elegirla de la galería.
export const photoPickerHtml = () => html`
  <div class="photo-picker">
    <span data-photo-preview></span>
    <span class="photo-actions">
      <label class="btn btn-sm btn-tinted"><span data-photo-label></span><input type="file" accept="image/*" class="sr-only" data-photo-input aria-label="Foto del producto"></label>
      <button type="button" class="link link-danger" data-photo-remove>Quitar</button>
    </span>
  </div>
`;

export function bindPhotoPicker(container, initial = '') {
  let value = initial;
  let chosenByUser = false;
  const render = () => {
    setHTML(container.querySelector('[data-photo-preview]'), value
      ? html`<img class="catalog-photo" src="${value}" alt="Foto del producto">`
      : html`<span class="photo-empty">Sin foto</span>`);
    container.querySelector('[data-photo-label]').textContent = value ? 'Cambiar foto' : 'Agregar foto';
    container.querySelector('[data-photo-remove]').hidden = !value;
  };
  container.querySelector('[data-photo-input]').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      value = await fileToPhoto(file);
      chosenByUser = true;
      render();
    } catch (error) { showError(error); }
  });
  container.querySelector('[data-photo-remove]').addEventListener('click', () => {
    value = '';
    chosenByUser = true;
    render();
  });
  render();
  return {
    get value() { return value; },
    // La foto del catálogo nunca reemplaza una que la persona ya eligió.
    suggest(image) {
      if (chosenByUser) return;
      value = image;
      render();
    },
  };
}

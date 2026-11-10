// Sugerencias debajo del campo Nombre al registrar un producto.
import { html } from './core.js';
import { searchProductNames, SOLD_BY_WEIGHT_CATEGORIES } from './product-names.js';
import { setHTML } from './ui.js';

export const nameSuggestHtml = () => html`<div class="name-suggest" data-name-suggest hidden></div>`;

export function bindNameSuggest(form) {
  const box = form.querySelector('[data-name-suggest]');
  const input = form.elements.name;
  let results = [];

  const render = () => {
    results = searchProductNames(input.value);
    box.hidden = !results.length;
    setHTML(box, results.map((item, index) => html`
      <button type="button" data-index="${index}"><span>${item.name}</span><small>${item.category}</small></button>
    `).map(String).join(''));
  };

  input.addEventListener('input', render);
  box.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    const { name, category } = results[Number(button.dataset.index)];
    input.value = name;
    box.hidden = true;
    // No cambia una categoría que la persona ya eligió.
    if (!form.elements.categoryChoice.value) form.elements.categoryChoice.value = category;
    // Cada sugerencia define su unidad, para no heredar la de otra elegida antes.
    if (form.elements.unit) form.elements.unit.value = SOLD_BY_WEIGHT_CATEGORIES.includes(category) && !/\d/.test(name) ? 'kg' : 'pza';
    form.elements.price.focus();
  });
}

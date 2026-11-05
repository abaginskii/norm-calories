/* Меню добавления, которое открывается кнопкой «+» в таббаре. */

import { openSheet, icon } from './ui.js';
import { mealForNow } from './store.js';
import { openFoodPicker, openQuickAdd, openProductEditor } from './views/picker.js';
import { openScanner } from './scan.js';
import { openAIEstimate, openAIHint } from './ai.js';

const TILES = [
  { id: 'scan', icon: 'barcode', title: 'Сканер', sub: 'штрихкод продукта' },
  { id: 'search', icon: 'search', title: 'Найти', sub: 'в базе продуктов' },
  { id: 'ai-photo', icon: 'camera', title: 'AI по фото', sub: 'оценка блюда' },
  { id: 'ai-text', icon: 'text', title: 'AI по описанию', sub: 'посчитать по тексту' },
  { id: 'hint', icon: 'sparkles', title: 'Что добрать', sub: 'совет по норме' },
  { id: 'quick', icon: 'flame', title: 'Быстрый ввод', sub: 'только калории' },
];

export function openAddMenu({ iso }) {
  const sheet = openSheet({ title: 'Добавить', subtitle: 'Как запишем еду?', body: '', footer: '' });

  sheet.setBody(`
    <div class="add-menu">
      ${TILES.map((tile) => `
        <button class="add-tile" type="button" data-tile="${tile.id}">
          <span class="add-tile__icon">${icon(tile.icon)}</span>
          <span class="add-tile__title">${tile.title}</span>
          <span class="add-tile__sub">${tile.sub}</span>
        </button>`).join('')}
    </div>
    <p class="tiny muted center mt-16">AI работает на вашем ключе Gemini</p>
  `);

  sheet.body.querySelectorAll('[data-tile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tile;
      const meal = mealForNow();
      sheet.close();
      if (id === 'scan') {
        openScanner({ iso, meal, createProduct: (code) => openProductEditor({ barcode: code }) });
      } else if (id === 'search') {
        openFoodPicker({ iso, meal });
      } else if (id === 'ai-photo') {
        openAIEstimate({ iso, meal, mode: 'photo' });
      } else if (id === 'ai-text') {
        openAIEstimate({ iso, meal, mode: 'text' });
      } else if (id === 'hint') {
        openAIHint({ iso });
      } else if (id === 'quick') {
        openQuickAdd({ iso, meal });
      }
    });
  });

  return sheet;
}

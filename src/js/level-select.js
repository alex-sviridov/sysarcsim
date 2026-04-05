import { loadLevels, LEVELS } from './levels.js';
import { loadElemDefs } from './config.js';

window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadElemDefs(), loadLevels()]);

  const list = document.getElementById('level-list');

  LEVELS.forEach((level, index) => {
    const li = document.createElement('li');
    li.className = 'level-card';

    const demandCount = level.demands?.length ?? 0;
    const availCount  = level.available?.length ?? 0;

    li.innerHTML = `
      <a class="level-card-link" href="game.html?level=${encodeURIComponent(level.slug)}">
        <div class="level-card-number">${String(index + 1).padStart(2, '0')}</div>
        <div class="level-card-body">
          <div class="level-card-title">${level.title}</div>
          <div class="level-card-description">${level.description}</div>
          <div class="level-card-meta">
            <span>${demandCount} demand${demandCount !== 1 ? 's' : ''}</span>
            <span>${availCount} component${availCount !== 1 ? 's' : ''}</span>
            ${level.elementsLimit > 0 ? `<span>limit: ${level.elementsLimit}</span>` : ''}
          </div>
        </div>
        <div class="level-card-arrow">→</div>
      </a>
    `;

    list.appendChild(li);
  });
});

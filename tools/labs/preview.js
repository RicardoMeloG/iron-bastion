import { createGameConfig, createInitialState, placeTower } from '../../src/core/index.js';
import { TowerPanelPresenter } from '../../src/ui/tower-panel-presenter.js';
import { TowerPreview } from '../../src/render/tower-preview.js';
import { TowerRenderer } from '../../src/render/tower-renderer.js';

const config = createGameConfig();
const state = createInitialState(config);
const params = new URLSearchParams(window.location.search);
const level = Math.max(0, Math.min(4, Number(params.get('level') ?? 0)));
const credits = Math.max(0, Number(params.get('credits') ?? 250));

const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
tower.level = level;
let invested = config.towerDefinitions[tower.towerTypeId].economy.baseCost;
for (let index = 0; index < level; index++) {
  invested += config.towerDefinitions[tower.towerTypeId].levels[index].upgradeCost ?? 0;
}
tower.invested = invested;
state.credits = credits;
state.selectedTowerId = tower.id;

window.doUpgrade = () => {};
window.askSell = () => {};

const towerPreview = new TowerPreview(document.getElementById('preview-3d'), (towerTypeId, towerLevel) => {
  const renderer = new TowerRenderer(null, config.towerDefinitions);
  return renderer.buildMesh(towerTypeId, towerLevel);
});
const panelPresenter = new TowerPanelPresenter(document, towerPreview);
panelPresenter.render(state);

function renderLoop(time) {
  requestAnimationFrame(renderLoop);
  const elapsed = time / 1000;
  towerPreview.render(elapsed);
}

renderLoop(0);

import { getWood, getMoney } from '../economy.js';

export function updateResourcePanel() {
  document.getElementById('resource-wood').textContent = getWood();
  document.getElementById('resource-money').textContent = getMoney();
}

import { getWood, getMoney, getFood } from '../economy.js';

export function updateResourcePanel() {
  document.getElementById('resource-wood').textContent = getWood();
  document.getElementById('resource-money').textContent = getMoney();
  document.getElementById('resource-food').textContent = getFood();
}

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export const MODE_ICON = { plane: 'plane', train: 'train', bus: 'bus', car: 'car', local: 'local' };
export const MODE_WORD = { plane: 'самолёт', train: 'поезд', bus: 'автобус', car: 'авто', local: 'трансфер' };
export const MODE_INSTR = { plane: 'самолётом', train: 'поездом', bus: 'автобусом', car: 'на попутке', local: 'трансфером' };

export function modeTag(mode, text) {
  return `<span class="mode m-${mode}">${icon(MODE_ICON[mode])}${text ?? MODE_WORD[mode]}</span>`;
}

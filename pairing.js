// A pair is committed only after an explicit selection on both sides, in either order.
export function selectPair(state, side, index, optionCount) {
  const next = { selected: [...state.selected], activeLeft: state.activeLeft, activeRight: state.activeRight };
  const size = side === 'left' ? next.selected.length : optionCount;
  if (!['left', 'right'].includes(side) || !Number.isInteger(index) || index < 0 || index >= size) return next;
  const key = side === 'left' ? 'activeLeft' : 'activeRight';
  next[key] = next[key] === index ? null : index;
  if (Number.isInteger(next.activeLeft) && Number.isInteger(next.activeRight)) {
    const left = next.activeLeft, right = next.activeRight;
    const previousOwner = next.selected.indexOf(right);
    const previousRight = next.selected[left];
    // Swapping two existing pairs preserves completion instead of unexpectedly clearing a row.
    if (previousOwner >= 0 && previousOwner !== left) next.selected[previousOwner] = previousRight;
    next.selected[left] = right;
    next.activeLeft = null; next.activeRight = null;
  }
  return next;
}
export function pairsComplete(selected, leftCount, optionCount) {
  return selected.length === leftCount && selected.every(n => Number.isInteger(n) && n >= 0 && n < optionCount) && new Set(selected).size === leftCount;
}

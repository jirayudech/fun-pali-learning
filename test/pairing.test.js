import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPair, pairsComplete } from '../pairing.js';
const initial = () => ({ selected: [null, null, null], activeLeft: null, activeRight: null });
const click = (state, side, index) => selectPair(state, side, index, 3);
test('either selection order completes the same pair without auto-selecting another row', () => {
  let s = click(initial(), 'left', 0);
  s = click(s, 'right', 1);
  assert.deepEqual(s, { selected: [1, null, null], activeLeft: null, activeRight: null });
  let reversed = click(initial(), 'right', 1);
  reversed = click(reversed, 'left', 0);
  assert.deepEqual(s, reversed);
});
test('clicking a right item alone cannot steal an existing pair', () => {
  const s = click({ selected: [1, 0, null], activeLeft: null, activeRight: null }, 'right', 1);
  assert.deepEqual(s.selected, [1, 0, null]);
  assert.equal(s.activeRight, 1);
});
test('the partially matched screenshot can be corrected and completed', () => {
  let s = { selected: [1, 0, null], activeLeft: null, activeRight: null };
  s = click(click(s, 'left', 1), 'right', 2);
  s = click(click(s, 'right', 0), 'left', 2);
  assert.deepEqual(s.selected, [1, 2, 0]);
  assert.equal(pairsComplete(s.selected, 3, 3), true);
});
test('changing a completed pair swaps its partner instead of disabling completion', () => {
  let s = { selected: [1, 0, 2], activeLeft: null, activeRight: null };
  s = click(click(s, 'left', 1), 'right', 2);
  assert.deepEqual(s.selected, [1, 2, 0]);
  assert.equal(pairsComplete(s.selected, 3, 3), true);
});
test('deselecting, incomplete, duplicate and invalid pairs never submit', () => {
  let s = click(initial(), 'left', 1);
  s = click(s, 'left', 1);
  assert.equal(s.activeLeft, null);
  assert.deepEqual(click(s, 'right', 20), s);
  for (const answers of [[1, null, 0], [0, 0, 1], [0, 1, 3], [0, 1]]) assert.equal(pairsComplete(answers, 3, 3), false);
});

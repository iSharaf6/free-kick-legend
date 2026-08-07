import test from 'node:test';
import assert from 'node:assert/strict';

import { ordinal, outcomeBannerStyle, scorerCardCopy } from '../src/systems/OutcomePresentation.js';

test('goal scorer card copy is stable for every football ordinal edge case', () => {
  assert.equal(ordinal(1), '1ST');
  assert.equal(ordinal(2), '2ND');
  assert.equal(ordinal(3), '3RD');
  assert.equal(ordinal(11), '11TH');
  assert.equal(ordinal(22), '22ND');
  assert.deepEqual(
    scorerCardCopy({ scorerName: 'Malik Rook', shirtNumber: 9, goalNumber: 1 }),
    {
      heading: 'GOAL SCORED!',
      player: '#9  MALIK ROOK',
      detail: '1ST GOAL OF THE MATCH'
    }
  );
  assert.deepEqual(
    scorerCardCopy({
      scorerName: 'Malik Rook',
      shirtNumber: 9,
      scoreDelta: 1454,
      shotLabel: 'clean finish',
      contextLabel: '1 goal · x1 combo · 59 sec'
    }),
    {
      heading: '+1454 · CLEAN FINISH',
      player: '#9  MALIK ROOK',
      detail: '1 GOAL · X1 COMBO · 59 SEC'
    }
  );
});

test('every outcome receives the same outlined display system and a safe font size', () => {
  const labels = [
    'GOAL!', 'SAVED!', 'CAUGHT!', 'BLOCKED!', 'OFF TARGET',
    'OFF THE POST!', 'OFF THE BAR!', 'WALL FLATTENED!'
  ];
  const styles = labels.map((label) => outcomeBannerStyle(label));
  assert.ok(styles.every((style) => style.text && style.fill.length === 3));
  assert.ok(styles.every((style) => style.fontSize >= 18 && style.fontSize <= 44));
  assert.ok(styles.find((style) => style.text === 'GOAL!').fontSize >
    styles.find((style) => style.text === 'WALL FLATTENED!').fontSize);
});

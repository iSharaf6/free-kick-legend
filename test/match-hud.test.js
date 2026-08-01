import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_HUD_LAYOUT,
  RESULT_THEMES,
  getResultTheme,
  pressureSegmentColor
} from '../src/art/MatchHud.js';

const GAME_W = 480;
const GAME_H = 270;

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('broadcast HUD stays inside the logical game canvas', () => {
  for (const [name, box] of Object.entries(MATCH_HUD_LAYOUT)) {
    assert.ok(box.x >= 0 && box.y >= 0, `${name} starts inside the canvas`);
    assert.ok(box.x + box.w <= GAME_W, `${name} fits horizontally`);
    assert.ok(box.y + box.h <= GAME_H, `${name} fits vertically`);
  }
});

test('primary panels and bottom controls preserve distinct readable zones', () => {
  assert.equal(overlaps(MATCH_HUD_LAYOUT.topLeft, MATCH_HUD_LAYOUT.topCenter), false);
  assert.equal(overlaps(MATCH_HUD_LAYOUT.topCenter, MATCH_HUD_LAYOUT.topRight), false);
  assert.equal(overlaps(MATCH_HUD_LAYOUT.pressureMeter, MATCH_HUD_LAYOUT.objectiveLabel), false);
  assert.equal(overlaps(MATCH_HUD_LAYOUT.objectiveLabel, MATCH_HUD_LAYOUT.objectiveValue), false);
});

test('result outcomes use deliberate success, danger and neutral treatments', () => {
  assert.equal(getResultTheme('GOAL'), RESULT_THEMES.GOAL);
  assert.equal(getResultTheme('CAUGHT'), RESULT_THEMES.SAVE);
  assert.equal(getResultTheme('WALL'), RESULT_THEMES.WALL);
  assert.equal(getResultTheme('POST'), RESULT_THEMES.POST);
  assert.equal(getResultTheme('UNKNOWN'), RESULT_THEMES.MISS);
  assert.notEqual(RESULT_THEMES.GOAL.fill, RESULT_THEMES.WALL.fill);
});

test('pressure segments move from green through amber to red', () => {
  const colors = Array.from({ length: 10 }, (_, index) => pressureSegmentColor(index, 10));
  assert.equal(colors[0], 0x49a760);
  assert.equal(colors[5], 0xf3c449);
  assert.equal(colors.at(-1), 0xd73324);
  assert.ok(new Set(colors).size >= 5);
});

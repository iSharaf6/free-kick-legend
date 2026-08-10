import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/scenes/MenuScene.js', import.meta.url), 'utf8');

test('menu hero defines a tapered, translucent and dithered turf shadow', () => {
  const palette = source.match(/const MENU_SHADOW_COLORS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
  const builder = source.slice(
    source.indexOf('export function buildMenuGroundShadowLayout'),
    source.indexOf('function paintShadowPolygon')
  );
  const painter = source.slice(
    source.indexOf('export function addMenuGroundShadow'),
    source.indexOf('function levelId')
  );

  assert.ok(palette.length > 0);
  assert.doesNotMatch(palette, /0x0{6}/i, 'the bespoke shadow never falls back to pure black');
  assert.match(builder, /const layers = \[/);
  assert.match(builder, /const contacts = Object\.freeze\(\[/);
  assert.match(builder, /const dither = Object\.freeze\(\[/);
  assert.match(builder, /left \+ 7, top/);
  assert.match(builder, /right, centerY/);
  assert.match(painter, /paintShadowPolygon/);
  assert.match(painter, /layout\.dither\.forEach/);
  assert.match(painter, /menu-kicker-ground-shadow/);
});

test('menu hero disables the shared scaled bitmap before adding its contact shadow', () => {
  const makeHero = source.match(/makeHero\(equippedKit[\s\S]*?\n  syncAmbientMotion/)?.[0] ?? '';
  assert.match(makeHero, /this\.kicker\.shadow\?\.setVisible\?\.\(false\)/);
  assert.match(makeHero, /this\.kicker\.shadow\?\.setAlpha\?\.\(0\)/);
  assert.match(makeHero, /this\.menuKickerShadow = addMenuGroundShadow/);
  assert.match(makeHero, /depth: 130/);
});

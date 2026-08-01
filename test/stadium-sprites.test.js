import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test('security steward atlas contains six equal runtime frames', () => {
  const dimensions = pngDimensions(new URL(
    '../public/assets/hd/security-guards-sheet-hd.png',
    import.meta.url
  ));
  assert.deepEqual(dimensions, { width: 88 * 6, height: 204 });
});

test('CALYNX board mark keeps its compact pixel-sprite dimensions', () => {
  const dimensions = pngDimensions(new URL(
    '../public/assets/hd/calynx-logo-pixel.png',
    import.meta.url
  ));
  assert.deepEqual(dimensions, { width: 66, height: 20 });
});

test('Islam Sharaf ships a complete fixed-canvas striker pose set', () => {
  const kits = ['home', 'crimson', 'emerald', 'sunrise', 'monochrome', 'royal'];
  for (const kit of kits) {
    for (const pose of ['idle', 'ready', 'strike', 'follow', 'celebrate']) {
      const dimensions = pngDimensions(new URL(
        `../public/assets/hd/kicker-hd-character-islam-sharaf-kit-${kit}-${pose}.png`,
        import.meta.url
      ));
      assert.deepEqual(dimensions, { width: 256, height: 256 });
    }
  }
});

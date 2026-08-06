import { assetUrl } from './assetBase.js';

const DEFAULT_FRAME = Object.freeze({ frameWidth: 320, frameHeight: 280 });

// Boot only the atlases needed to render a complete, readable first save.
// The specialised variations stream once play has begun and fall back to the
// core motion sheet until ready, keeping the title screen off the 17 MB path.
export const KEEPER_SHEETS = Object.freeze([
  { key: 'keeper-anim-hd', file: 'keeper-animation-sheet-hd.png', initial: true },
  { key: 'keeper-dive-motion-hd', file: 'keeper-dive-motion-sheet-hd.png', initial: true },
  { key: 'keeper-low-save-hd', file: 'keeper-low-save-sheet-hd.png', initial: true },
  { key: 'keeper-handling-hd', file: 'keeper-handling-sheet-hd.png', initial: true },
  { key: 'keeper-practical-low-hd', file: 'keeper-practical-low-sheet-hd.png', initial: true },
  { key: 'keeper-footwork-hd', file: 'keeper-footwork-sheet-hd.png' },
  { key: 'keeper-return-hd', file: 'keeper-return-sheet-hd.png' },
  { key: 'keeper-high-claim-hd', file: 'keeper-high-claim-sheet-hd.png', frameHeight: 360 },
  { key: 'keeper-low-smother-hd', file: 'keeper-low-smother-sheet-hd.png' },
  { key: 'keeper-mid-catch-hd', file: 'keeper-mid-catch-sheet-hd.png' },
  { key: 'keeper-upper-parry-hd', file: 'keeper-upper-parry-sheet-hd.png' },
  { key: 'keeper-top-tip-hd', file: 'keeper-top-tip-sheet-hd.png' },
  { key: 'keeper-reflex-foot-hd', file: 'keeper-reflex-foot-sheet-hd.png' },
  { key: 'keeper-situational-punch-hd', file: 'keeper-situational-punch-sheet-hd.png' },
  { key: 'keeper-distribution-hd', file: 'keeper-distribution-sheet-hd.png' },
  { key: 'keeper-foot-distribution-hd', file: 'keeper-foot-distribution-sheet-hd.png' },
  { key: 'keeper-reactions-hd', file: 'keeper-reactions-sheet-hd.png' },
  { key: 'keeper-mid-dive-hd', file: 'keeper-mid-dive-sheet-hd.png' },
  { key: 'keeper-practical-recovery-hd', file: 'keeper-practical-recovery-sheet-hd.png' }
]);

export function queueKeeperSheets(scene, { initial }) {
  let queued = 0;
  for (const sheet of KEEPER_SHEETS) {
    if (Boolean(sheet.initial) !== Boolean(initial) || scene.textures?.exists?.(sheet.key)) continue;
    scene.load.spritesheet(sheet.key, assetUrl(`hd/${sheet.file}`), {
      ...DEFAULT_FRAME,
      frameHeight: sheet.frameHeight ?? DEFAULT_FRAME.frameHeight
    });
    queued++;
  }
  return queued;
}

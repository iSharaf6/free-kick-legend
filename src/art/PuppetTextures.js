const ART_SCALE = 2;

function px(value) {
  return Math.round(value * ART_SCALE);
}

function makeTexture(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(graphics);
  graphics.generateTexture(key, px(width), px(height));
  graphics.destroy();
}

function rect(graphics, color, x, y, width, height, alpha = 1) {
  graphics.fillStyle(color, alpha);
  graphics.fillRect(px(x), px(y), px(width), px(height));
}

function headTexture(scene, key, palette) {
  makeTexture(scene, key, 12, 14, (g) => {
    // Hair silhouette, ears, jaw, nose, eyes and three-tone skin shading.
    rect(g, palette.hair, 2, 0, 8, 2);
    rect(g, palette.hair, 1, 2, 10, 4);
    rect(g, palette.hairHi, 3, 1, 5, 1);
    rect(g, palette.skinDark, 0, 5, 2, 4);
    rect(g, palette.skinDark, 10, 5, 2, 4);
    rect(g, palette.skin, 2, 4, 8, 7);
    rect(g, palette.skinHi, 3, 4, 4, 3);
    rect(g, palette.skinDark, 7, 7, 3, 4);
    rect(g, 0x221713, 3, 6, 2, 1);
    rect(g, 0x221713, 8, 6, 1, 1);
    rect(g, palette.skinDark, 5, 8, 3, 1);
    rect(g, 0x5f2c26, 4, 10, 4, 1);
    rect(g, palette.skinDark, 3, 11, 6, 2);
    rect(g, palette.skin, 4, 11, 4, 3);
  });
}

function torsoTexture(scene, key, palette) {
  makeTexture(scene, key, 18, 24, (g) => {
    rect(g, palette.outline, 2, 1, 14, 22);
    rect(g, palette.primaryDark, 1, 4, 16, 9);
    rect(g, palette.primary, 3, 2, 12, 19);
    rect(g, palette.primaryHi, 4, 3, 4, 16);
    rect(g, palette.trim, 3, 2, 12, 2);
    rect(g, palette.trim, 3, 19, 12, 2);
    rect(g, palette.crest, 12, 6, 2, 3);
    rect(g, palette.crestHi, 12, 6, 1, 1);
    rect(g, palette.number, 7, 8, 4, 7);
    rect(g, palette.primaryDark, 8, 9, 2, 5);
    rect(g, palette.outline, 4, 21, 10, 3);
  });
}

function upperArmTexture(scene, key, palette) {
  makeTexture(scene, key, 7, 16, (g) => {
    rect(g, palette.outline, 1, 0, 5, 16);
    rect(g, palette.primaryDark, 0, 2, 7, 7);
    rect(g, palette.primary, 2, 1, 4, 8);
    rect(g, palette.primaryHi, 2, 2, 1, 6);
    rect(g, palette.trim, 1, 7, 5, 2);
    rect(g, palette.skinDark, 1, 9, 5, 7);
    rect(g, palette.skin, 2, 9, 3, 6);
    rect(g, palette.skinHi, 2, 10, 1, 4);
  });
}

function lowerArmTexture(scene, key, palette) {
  makeTexture(scene, key, 6, 16, (g) => {
    rect(g, palette.outline, 1, 0, 4, 16);
    rect(g, palette.skinDark, 0, 1, 6, 12);
    rect(g, palette.skin, 2, 1, 3, 11);
    rect(g, palette.skinHi, 2, 2, 1, 7);
    rect(g, palette.glove, 0, 11, 6, 5);
    rect(g, palette.gloveHi, 1, 11, 3, 2);
    rect(g, palette.outline, 1, 15, 4, 1);
  });
}

function upperLegTexture(scene, key, palette) {
  makeTexture(scene, key, 8, 18, (g) => {
    rect(g, palette.outline, 1, 0, 6, 18);
    rect(g, palette.shortsDark, 0, 1, 8, 9);
    rect(g, palette.shorts, 2, 1, 5, 8);
    rect(g, palette.trim, 1, 8, 6, 2);
    rect(g, palette.skinDark, 1, 10, 6, 8);
    rect(g, palette.skin, 2, 10, 4, 7);
    rect(g, palette.skinHi, 2, 11, 1, 5);
  });
}

function lowerLegTexture(scene, key, palette) {
  makeTexture(scene, key, 7, 19, (g) => {
    rect(g, palette.outline, 1, 0, 5, 19);
    rect(g, palette.sockDark, 0, 1, 7, 12);
    rect(g, palette.sock, 2, 1, 4, 11);
    rect(g, palette.sockHi, 2, 2, 1, 7);
    rect(g, palette.trim, 1, 3, 5, 2);
    rect(g, palette.boot, 1, 12, 6, 5);
    rect(g, palette.boot, 0, 15, 7, 3);
    rect(g, palette.bootHi, 2, 13, 3, 1);
    rect(g, palette.stud, 1, 18, 2, 1);
    rect(g, palette.stud, 5, 18, 2, 1);
  });
}

function makeSet(scene, name, palette) {
  const prefix = `puppet-${name}`;
  headTexture(scene, `${prefix}-head`, palette);
  torsoTexture(scene, `${prefix}-torso`, palette);
  upperArmTexture(scene, `${prefix}-upper-arm`, palette);
  lowerArmTexture(scene, `${prefix}-lower-arm`, palette);
  upperLegTexture(scene, `${prefix}-upper-leg`, palette);
  lowerLegTexture(scene, `${prefix}-lower-leg`, palette);
}

const SKIN = {
  skin: 0xc98255,
  skinHi: 0xe5a06e,
  skinDark: 0x82472f,
  hair: 0x17191d,
  hairHi: 0x392b25
};

// Generates small but high-density source textures. Every art pixel maps to
// roughly one physical display pixel in a normal match, which keeps the puppet
// crisp while still giving the face, kit, gloves, socks and boots real detail.
export function makePuppetTextures(scene) {
  makeSet(scene, 'wall', {
    ...SKIN,
    outline: 0x08121f,
    primary: 0x173f70,
    primaryHi: 0x2d6091,
    primaryDark: 0x0c2748,
    trim: 0xf0c43f,
    crest: 0xf0c43f,
    crestHi: 0xffed94,
    number: 0xf3e7c3,
    shorts: 0x122f55,
    shortsDark: 0x091c34,
    sock: 0xf2f0df,
    sockHi: 0xffffff,
    sockDark: 0xb8b7aa,
    boot: 0x11151b,
    bootHi: 0x48535f,
    stud: 0xe0a834,
    glove: 0x9a5636,
    gloveHi: 0xd38658
  });

  makeSet(scene, 'keeper', {
    ...SKIN,
    outline: 0x11130f,
    primary: 0xd97922,
    primaryHi: 0xf7aa3d,
    primaryDark: 0x8d3818,
    trim: 0x1a2d3a,
    crest: 0xf2d04b,
    crestHi: 0xffee9a,
    number: 0x132533,
    shorts: 0x243743,
    shortsDark: 0x101e27,
    sock: 0x263945,
    sockHi: 0x4f6570,
    sockDark: 0x14242c,
    boot: 0x101418,
    bootHi: 0x536069,
    stud: 0xe0a834,
    glove: 0xf1eee0,
    gloveHi: 0xffffff
  });
}


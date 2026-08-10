// Shared matchday colours for procedural icons and interface chrome. Character,
// keeper and crowd PNGs keep their own much richer material ramps; this palette
// only provides a clean navy/cobalt/cyan/gold frame around that authored art.

export const PAL = {
  // environment
  ink: 0x030714,
  night: 0x07132c,
  nightHi: 0x163b70,
  sky: 0x0b2147,
  skyHi: 0x246799,
  flood: 0xf7fbff,
  grass: 0x2d874b,
  grassDark: 0x185b38,
  grassDither: 0x5caf5c,
  grassShadow: 0x10472e,
  line: 0xf7fbff,

  // interface
  panel: 0x0b2147,
  panelHi: 0x163b70,
  panelMuted: 0x091a35,
  border: 0x3478b8,
  borderDark: 0x17385f,
  cream: 0xf7fbff,
  muted: 0x9ccce8,
  gold: 0xffc928,
  goldDark: 0xe09b13,
  red: 0xff5b4d,
  orange: 0xff8a32,
  green: 0x16a768,
  greenHi: 0x36d886,
  blue: 0x1769d2,
  blueHi: 0x35bdf6,
  cyan: 0x38d3e8
};

export const INK = {
  W: 0xf7fbff, // clean stadium white
  K: PAL.ink,
  G: 0x9ccce8, // cool light shade
  N: 0x0a1118, // boots / deepest outline
  H: 0x261a16, // hair
  S: 0xb8734d, // skin mid
  T: 0x74452f, // skin shadow / dark variant
  L: 0xdf9a6f, // skin highlight
  M: PAL.red, // coral kit
  D: 0x8c342b, // coral shade
  Y: PAL.gold,
  O: 0xc47a24,
  E: 0xfff1c7,
  B: PAL.blue,
  C: PAL.blueHi,
  R: 0x7d2630,
  P: PAL.green
};

function pixelMap(width, rows) {
  return rows.map((row) => {
    if (row.length > width) throw new Error(`pixel row exceeds ${width}px: "${row}"`);
    return row.padEnd(width, '.');
  });
}

export function textureFromMap(scene, key, rows, inkOverride = {}) {
  const w = rows[0].length;
  for (const row of rows) {
    if (row.length !== w) throw new Error(`pixel map "${key}" row width mismatch: "${row}"`);
  }
  const ink = { ...INK, ...inkOverride };
  const g = scene.add.graphics();
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const color = ink[ch];
      if (color === undefined) throw new Error(`pixel map "${key}" unknown ink "${ch}"`);
      g.fillStyle(color, 1);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.generateTexture(key, w, rows.length);
  g.destroy();
}

export const MAPS = {
  ball: [
    '....WWWW....',
    '..WWWKKWWW..',
    '.WWWWKKWWWW.',
    '.WKKWWWWKKW.',
    'WKKWWWWWWKKW',
    'WKKWWKKWWKKW',
    'WWWWWKKWWWWW',
    'WWWWWWWWWWWG',
    '.WWWKKWWWWG.',
    '.WWWKKWWWGG.',
    '..WWWWWWGG..',
    '....WGGG....'
  ],

  ballBasketball: [
    '....WWWW....',
    '..WWWWWWWW..',
    '.WWWKWWKWWW.',
    '.WWWKWWKWWW.',
    'WWWKWWKWWWWW',
    'KKKKKKKKKKKK',
    'WWWKWWKWWWWW',
    'WWWKWWKWWWWG',
    '.WWKWWWWKWG.',
    '.WWKWWWWKGG.',
    '..WWWWWWGG..',
    '....WGGG....'
  ],

  ballGolf: [
    '....WWWW....',
    '..WWGWWGWW..',
    '.WGWWGWWGWG.',
    '.WWWGWWGWWW.',
    'WGWWGWWGWWWW',
    'WWWGWWGWWWGW',
    'GWWGWWGWWWWW',
    'WWGWWGWWGWGG',
    '.WWWGWWGWWG.',
    '.WGWWGWWWGG.',
    '..WWGWWGGG..',
    '....WGGG....'
  ],

  // Existing gameplay silhouettes retain their original dimensions so the
  // pseudo-3D scale maths in Wall and Goalkeeper remains compatible.
  defender: [
    '.....HHHH.....',
    '....HHHHHH....',
    '....HSSLSH....',
    '....SSLLSS....',
    '....SNSSNS....',
    '....TSSSST....',
    '.....TSSS.....',
    '...MMMMMMMM...',
    '..MMLMMMMRMM..',
    '..MWWYWWWWWM..',
    '..MWWYWWWWDM..',
    '..MMMMMMMDDD..',
    '..SMMMMMMMMD..',
    '..SWWWWWWWWS..',
    '..TWWWWWWWWT..',
    '...MMMMMMDD...',
    '...BBBBBBBB...',
    '...BBCCCCBB...',
    '...BBB..BBB...',
    '...BBB..BBB...',
    '...SSS..SSS...',
    '...TSS..SST...',
    '...WWW..WWW...',
    '...WWW..WWW...',
    '...WWW..WWW...',
    '...NNN..NNN...',
    '...NNN..NNN...',
    '..NNNN..NNNN..'
  ],

  keeperIdle: [
    '.EE..........EE.',
    '.EE..........EE.',
    '.YY...HHHH...YY.',
    '.YY..HHHHHH..YY.',
    '..YY.HSSLSH.YY..',
    '..YY.SSLLSS.YY..',
    '..YY.SNSSNS.YY..',
    '...Y.TSSSST.Y...',
    '...YY.TSSS.YY...',
    '...YYYYYYYYYY...',
    '...YOOYYOOOYY...',
    '...YYOYYOYYOY...',
    '...YOYYOYYOYY...',
    '...YYYYYYYYYY...',
    '...YYYYYYYYYY...',
    '....YYYYYYYY....',
    '....OOOOOOOO....',
    '....OOOYYOOO....',
    '....OOO..OOO....',
    '....TSS..SST....',
    '....SSS..SSS....',
    '....SSS..SSS....',
    '....WWW..WWW....',
    '....YYY..YYY....',
    '....YOO..OOY....',
    '....YYY..YYY....',
    '....NNN..NNN....',
    '...NNNN..NNNN...'
  ],

  keeperDive: [
    '......................EE....',
    '....................YYYEE...',
    '...........YYYYYYYYYHHHH....',
    '...NNYYYYYYYYYYYYYYYSSLS....',
    '..NNWWYYYYOOYYYYYYYYSSSS....',
    '..NNWWYYYYYYYYYYYYYYYYEE....',
    '...NNYYYYYYYYYYOOY..........',
    '......YYYYYYYYY.............',
    '........YYYYY...............'
  ],

  keeperCatch: [
    '................',
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HSSLSH.....',
    '.....SSLLSS.....',
    '.....SNSSNS.....',
    '.....TSSSST.....',
    '......TSSS......',
    '...YYYYYYYYYY...',
    '...YEEWWWWEEY...',
    '...YEWWKKWWEY...',
    '...YEWWWWWWEY...',
    '...YYEEWWEEYY...',
    '...YYYYYYYYYY...',
    '....YYYYYYYY....',
    '....OOOOOOOO....',
    '....OOOYYOOO....',
    '....OOO..OOO....',
    '....TSS..SST....',
    '....SSS..SSS....',
    '....SSS..SSS....',
    '....WWW..WWW....',
    '....YYY..YYY....',
    '....YOO..OOY....',
    '....YYY..YYY....',
    '....NNN..NNN....',
    '...NNNN..NNNN...'
  ],

  shadow: [
    '..KKKKKK..',
    '.KKKKKKKK.',
    '.KKKKKKKK.',
    '..KKKKKK..'
  ],

  // Original fictional striker, shown from a three-quarter/back match camera.
  kickerIdle: pixelMap(24, [
    '........HHHHHH',
    '.......HHHHHHHH',
    '......HHHSSSHHH',
    '......HHSSLLSHH',
    '.......SSLLLSS',
    '.......TSSSST',
    '........TSSS',
    '.......BBBBBB',
    '.....SBBBBBBBBS',
    '....SSBBCYCCBBSS',
    '....TBBBYYBBBBST',
    '....TBBBBBBBBBST',
    '.....BBDDDDDBB',
    '.....BBBBBBBBB',
    '......BBBBBBB',
    '......KKKKKKK',
    '.....KKKKKKKKK',
    '.....KKK..KKKK',
    '.....KKK..KKKK',
    '.....SSS...SSS',
    '.....TSS...SST',
    '.....WWW...WWW',
    '.....WWW...WWW',
    '.....WYW...WYW',
    '.....WWW...WWW',
    '.....NNN...NNN',
    '....NNNN...NNNN'
  ]),

  kickerReady: pixelMap(28, [
    '.........HHHHHH',
    '........HHHHHHHH',
    '.......HHHSSSHHH',
    '.......HHSSLLSHH',
    '........SSLLLSS',
    '........TSSSST',
    '.........TSSS',
    '......SSBBBBBB',
    '.....SSBBBBBBBBS',
    '....STBBBCYCCBBBSS',
    '...STTBBBBYYBBBBBST',
    '...STTBBBBBBBBBBBST',
    '....TBBBBBDDDDDBB',
    '.....BBBBBBBBBBB',
    '......BBBBBBBBB',
    '......KKKKKKKK',
    '.....KKKKKKKKKK',
    '.....KKKK...KKK',
    '.....KKK....KKK',
    '.....SSS....SSS',
    '.....TSS....SST',
    '.....WWW....WWW',
    '.....WWW....WWW',
    '.....WYW....WYW',
    '.....WWW....WWW',
    '.....NNN....NNN',
    '....NNNN....NNNN'
  ]),

  kickerStrike: pixelMap(34, [
    '..........HHHHHH',
    '.........HHHHHHHH',
    '........HHHSSSHHH',
    '........HHSSLLSHH',
    '.........SSLLLSS',
    '.........TSSSST',
    '..........TSSS',
    '.......SSBBBBBB',
    '......SSBBBBBBBBS',
    '.....STBBBCYCCBBBSS',
    '....STTBBBBYYBBBBBST',
    '....STTBBBBBBBBBBBST',
    '.....TBBBBBDDDDDBB',
    '......BBBBBBBBBBB',
    '.......BBBBBBBBB',
    '.......KKKKKKKK',
    '......KKKKKKKKKK',
    '......KKKK....KKKSSSS',
    '......KKK.....KKSSSSSWWW',
    '......SSS.......TSSSWWWWNNN',
    '......TSS.........TTWWWNNNN',
    '......WWW............NNNN',
    '......WWW',
    '......WYW',
    '......WWW',
    '......NNN',
    '.....NNNN'
  ]),

  kickerCelebrate: pixelMap(28, [
    'S......................S',
    'SS....................SS',
    '.SS......HHHHHH......SS',
    '..SS....HHHHHHHH....SS',
    '...SS..HHHSSSHHH...SS',
    '....SS.HHSSLLSHH..SS',
    '.....SS.SSLLLSS.SS',
    '......SSTSSSSTSS',
    '.......BBTSSSBB',
    '......BBBBBBBBBB',
    '.....BBBBCYCCBBBB',
    '.....BBBBYYBBBBB',
    '.....BBBBBBBBBBB',
    '......BBDDDDDBB',
    '......BBBBBBBBB',
    '.......KKKKKKK',
    '......KKKKKKKKK',
    '......KKK..KKKK',
    '......KKK..KKKK',
    '......SSS...SSS',
    '......TSS...SST',
    '......WWW...WWW',
    '......WWW...WWW',
    '......WYW...WYW',
    '......WWW...WWW',
    '......NNN...NNN',
    '.....NNNN...NNNN'
  ]),

  iconStar: pixelMap(9, [
    '....Y',
    '....Y',
    'Y.YYYYY.Y',
    '.YYYYYYY',
    '..YYYYY',
    '..YYYYY',
    '..YY.YY',
    '.YY...YY'
  ]),
  iconCoin: pixelMap(9, [
    '...YYY',
    '.YYYYYY',
    'YYOYYOYY',
    'YYOYYOYY',
    'YYOYYOYY',
    'YYOYYOYY',
    '.YYYYYY',
    '...YYY'
  ]),
  iconLock: pixelMap(9, [
    '..GGGG',
    '.GG..GG',
    '.GG..GG',
    '.GG..GG',
    'GGGGGGGG',
    'GGGKKGGG',
    'GGGKKGGG',
    'GGGGGGGG'
  ]),
  iconCup: pixelMap(13, [
    '..YYYYYYYYY',
    '.YYYYYYYYYYY',
    'YY.YYYYYYY.YY',
    'YY.YYYYYYY.YY',
    '.YYYYYYYYYYY',
    '..YYYYYYYYY',
    '....YYYYY',
    '.....YYY',
    '.....YYY',
    '....YYYYY',
    '...YYYYYYY'
  ]),
  iconLocker: pixelMap(11, [
    'KKKKKKKKKKK',
    'KBBBBBBBBBK',
    'KBBBKBBBBBK',
    'KBBBKBBBBBK',
    'KBBBKBBBBBK',
    'KBBBKBBBBBK',
    'KBBBKBBBBBK',
    'KBBBKBYBBBK',
    'KBBBKBBBBBK',
    'KKKKKKKKKKK'
  ]),
  iconPlay: pixelMap(9, [
    'BB',
    'BBBB',
    'BBBBBB',
    'BBBBBBBB',
    'BBBBBB',
    'BBBB',
    'BB'
  ]),
  iconClock: pixelMap(9, [
    '..GGGG',
    '.GG..GG',
    'GGG..GGG',
    'GGG.GGGG',
    'GGG..GGG',
    'GGG..GGG',
    '.GGGGGG',
    '..GGGG'
  ]),
  iconSound: pixelMap(11, [
    '...GG',
    '.GGGG...G',
    'GGGGG....G',
    'GGGGG.....G',
    'GGGGG.....G',
    '.GGGG....G',
    '...GG...G'
  ]),
  iconMute: pixelMap(11, [
    '...GG....M',
    '.GGGG...M',
    'GGGGG..M',
    'GGGGG.M',
    'GGGGGM',
    '.GGGGM',
    '...GGM..M'
  ]),
  iconBack: pixelMap(9, [
    '...GG',
    '..GG',
    '.GG',
    'GGGGGGGG',
    '.GG',
    '..GG',
    '...GG'
  ]),
  iconCheck: pixelMap(9, [
    '.......P',
    '......PP',
    'P....PPP',
    'PP..PPP',
    '.PPPPP',
    '..PPP',
    '...P'
  ]),
  iconKit: pixelMap(11, [
    'SSBBBBBSS',
    'SBBBBBBBS',
    'BBBBBBBBB',
    '.BBBBBBB',
    '.BBBYBBB',
    '.BBBYBBB',
    '.BBBBBBB',
    '.BBBBBBB',
    '.BBBBBBB'
  ]),
  iconTrail: pixelMap(12, [
    'C',
    '.CC',
    '...CCC',
    '......CCC',
    '.........CCC',
    '......CCC',
    '...CCC',
    '.CC',
    'C'
  ])
};

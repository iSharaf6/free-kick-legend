export function ordinal(value) {
  const number = Math.max(1, Math.round(Number(value) || 1));
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}TH`;
  if (number % 10 === 1) return `${number}ST`;
  if (number % 10 === 2) return `${number}ND`;
  if (number % 10 === 3) return `${number}RD`;
  return `${number}TH`;
}

export function scorerCardCopy({
  scorerName,
  shirtNumber,
  goalNumber = 1,
  scoreDelta = 0,
  shotLabel = 'GOAL SCORED',
  contextLabel = ''
} = {}) {
  const name = String(scorerName || 'KICK DISTRICT').trim().toUpperCase();
  const number = Math.max(0, Math.round(Number(shirtNumber) || 0));
  const points = Math.max(0, Math.round(Number(scoreDelta) || 0));
  const result = String(shotLabel || 'GOAL SCORED').trim().toUpperCase();
  return Object.freeze({
    heading: points ? `+${points} · ${result}` : `${result}!`,
    player: `#${number}  ${name}`,
    detail: String(contextLabel || `${ordinal(goalNumber)} GOAL OF THE MATCH`).trim().toUpperCase()
  });
}

export function outcomeBannerStyle(label, fallbackColor = '#f0e8d0') {
  const text = String(label || '').trim().toUpperCase();
  const positive = text.includes('GOAL') || text === 'TOP BINS!' || text === 'WORLD CLASS!' || text.includes('FLATTENED');
  const frame = text.includes('POST') || text.includes('BAR');
  const neutral = text.includes('TARGET');
  const stadiumCelebration = text === 'GOAL!' || text === 'TOP BINS!' || text === 'WORLD CLASS!';
  const fill = positive
    ? ['#fff6bd', '#ffd12f', '#ef9200']
    : frame
      ? ['#fff0bc', '#ffb43e', '#db621b']
      : neutral
        ? ['#ffffff', '#ced8df', '#7f919e']
        : ['#ffe4d2', '#ff8b61', '#d94534'];
  return Object.freeze({
    text,
    stadiumCelebration,
    // A 24px stadium callout stays clear of the crossbar and first crowd tier.
    // Long outcome copy still steps down to preserve the existing safe width.
    fontSize: Math.max(18, Math.min(24, Math.floor(184 / Math.max(text.length * 0.62, 1)))),
    fill,
    extrusion: positive ? '#d86a00' : frame ? '#b24c1e' : neutral ? '#526b7a' : '#a92f28',
    glow: positive ? 0xffa51d : frame ? 0xff6e2c : neutral ? 0x7396ad : 0xff493b,
    fallbackColor,
    holdMs: stadiumCelebration ? 1180 : positive ? 900 : 620
  });
}

// Generates icon16.png, icon32.png, icon48.png, icon128.png
// Run: node generate_icons.js
// No external dependencies — built-in zlib + fs only.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── 16×16 pixel grid ─────────────────────────────────────────────────────────
const GRID = [
  '....BBBBBBBB....', // 0  beret top
  '...BBBBBBBBBB...', // 1  beret wider
  '..BBGBBBBBBBBB..', // 2  beret + badge
  '.DDDDDDDDDDDDDD.', // 3  beret brim
  '....WWWWWWWW....', // 4  skull top
  '...WWWWWWWWWW...', // 5  skull upper
  '..WWWWWWWWWWWW..', // 6  skull wide
  '..WKKKWWWKKKWW..', // 7  eye sockets top
  '..WKrRWWWKrRWW..', // 8  red eyes
  '..WKKKWWWKKKWW..', // 9  eye sockets bottom
  '..WWWK.KWWWWW...', // 10 nose holes
  '...WTWTWTWTWW...', // 11 gum + teeth
  '....T.T.T.T.....', // 12 teeth bottom
  '................', // 13
  '................', // 14
  '................', // 15
];

// RGBA values per palette character ('.' = transparent)
const PALETTE = {
  'B': [0x5a, 0x7a, 0x32, 0xff],
  'D': [0x2d, 0x3d, 0x15, 0xff],
  'G': [0xff, 0xd7, 0x00, 0xff],
  'W': [0xf0, 0xed, 0xe0, 0xff],
  'K': [0x11, 0x11, 0x11, 0xff],
  'r': [0xff, 0x44, 0x44, 0xff],
  'R': [0xcc, 0x00, 0x00, 0xff],
  'T': [0xff, 0xff, 0xff, 0xff],
  '.': [0x00, 0x00, 0x00, 0x00],
};

// ── PNG encoder ───────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  // One filter byte (0 = None) per row
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4));
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Renderer ──────────────────────────────────────────────────────────────────
// pixelSize must be an integer: 1→16px, 2→32px, 3→48px, 8→128px

function render(pixelSize) {
  const size = 16 * pixelSize;
  const rgba = new Uint8Array(size * size * 4); // all transparent

  GRID.forEach((row, gridRow) => {
    [...row].forEach((ch, gridCol) => {
      const [r, g, b, a] = PALETTE[ch] ?? PALETTE['.'];
      for (let dy = 0; dy < pixelSize; dy++) {
        for (let dx = 0; dx < pixelSize; dx++) {
          const idx = ((gridRow * pixelSize + dy) * size + (gridCol * pixelSize + dx)) * 4;
          rgba[idx]     = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = a;
        }
      }
    });
  });

  return rgba;
}

// ── Generate ──────────────────────────────────────────────────────────────────

const SIZES = [[16, 1], [32, 2], [48, 3], [128, 8]];

console.log('Generating pixel art icons...\n');

for (const [iconSize, pixelSize] of SIZES) {
  const rgba = render(pixelSize);
  const png  = encodePNG(rgba, iconSize);
  const out  = path.join(__dirname, `icon${iconSize}.png`);
  fs.writeFileSync(out, png);
  console.log(`  ✓  icon${iconSize}.png  (${png.length} bytes)`);
}

console.log('\nDone. Reload the extension in chrome://extensions');

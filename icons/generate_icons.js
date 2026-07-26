// Generates icon16.png, icon32.png, icon48.png, icon128.png
// Run: node generate_icons.js
// No external dependencies — built-in zlib + fs only.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── 16×16 pixel grid ─────────────────────────────────────────────────────────
// Idle/calm state — the toolbar icon always shows the calm face.
// See assets/mascot-idle.svg / mascot-alert.svg for the animated, stateful versions.
const GRID = [
  '....SSSSSSSS....', // 0  head top
  '...SSSSSSSSSS...', // 1  head wider
  '...SSSSSSSSSS...', // 2  forehead
  '..ESSKKKKKKSSE..', // 3  ears + screen frame top
  '..ESSPPPPPPSSE..', // 4  ears + screen bg
  '..ESSPYPPYPSSE..', // 5  ears + eyes
  '..ESSPPPPPPSSE..', // 6  ears + screen bg
  '...SSKKKKKKSS...', // 7  screen frame bottom
  '..DSSSSSSSSSSD..', // 8  shoulders
  '..DSSSSLLSSSSD..', // 9  chassis + status light
  '..DSSSSSSSSSSD..', // 10 chassis lower
  '..EDDDDDDDDDDE..', // 11 wheels top
  '..EDDDDDDDDDDE..', // 12 wheels bottom
  '....DDDDDDDD....', // 13 ground shadow
  '................', // 14
  '................', // 15
];

// RGBA values per palette character ('.' = transparent)
const PALETTE = {
  'S': [0x9a, 0xa8, 0xb3, 0xff],
  'D': [0x4a, 0x50, 0x58, 0xff],
  'E': [0xcc, 0x00, 0x00, 0xff],
  'K': [0x11, 0x11, 0x11, 0xff],
  'P': [0xbf, 0xe6, 0xf5, 0xff],
  'Y': [0x1c, 0x3a, 0x4a, 0xff],
  'L': [0x2e, 0xe6, 0xc8, 0xff],
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

// Small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1..15 — enough for a
// "bytecoin:" + address URI. A port of Qr.cs from BCN Wallet for Windows, which follows Project Nayuki's
// reference code. Plain ES2017, no dependencies (runs in SeaMonkey too).
'use strict';
const QR = (function () {
  // ECC codewords per block and number of blocks for level M, index = version
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
  const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver]; }

  function mul(x, y) {  // GF(2^8) with polynomial 0x11D
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    const r = new Uint8Array(degree);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < degree) r[j] ^= r[j + 1];
      }
      root = mul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = new Uint8Array(div.length);
    for (let k = 0; k < data.length; k++) {
      const f = data[k] ^ r[0];
      r.copyWithin(0, 1);
      r[r.length - 1] = 0;
      for (let i = 0; i < r.length; i++) r[i] ^= mul(div[i], f);
    }
    return r;
  }
  function addEcc(data, ver) {
    const nb = BLOCKS[ver], ecl = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const gen = rsDivisor(ecl), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dlen = shortLen - ecl + (i < nShort ? 0 : 1);
      const dat = data.subarray(k, k + dlen);
      k += dlen;
      const ecc = rsRemainder(dat, gen);
      const blk = new Uint8Array(shortLen + 1);
      blk.set(dat, 0);
      blk.set(ecc, i < nShort ? dlen + 1 : dlen);
      blocks.push(blk);
    }
    const res = [];
    for (let i = 0; i < shortLen + 1; i++)
      for (let j = 0; j < nb; j++)
        if (i !== shortLen - ecl || j >= nShort) res.push(blocks[j][i]);
    return res;
  }

  function encode(text) {
    const data = new TextEncoder().encode(text);
    let ver = 1;
    for (; ver <= 15; ver++) if (4 + (ver < 10 ? 8 : 16) + data.length * 8 <= dataCodewords(ver) * 8) break;
    if (ver > 15) throw new Error('text too long for QR');
    const bits = [];
    const append = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    append(4, 4);
    append(data.length, ver < 10 ? 8 : 16);
    for (let i = 0; i < data.length; i++) append(data[i], 8);
    const capBits = dataCodewords(ver) * 8;
    append(0, Math.min(4, capBits - bits.length));
    append(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) append(pad, 8);
    const cw = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bits.length; i++) if (bits[i]) cw[i >> 3] |= 1 << (7 - (i & 7));
    const all = addEcc(cw, ver);

    const size = ver * 4 + 17;
    const m = new Uint8Array(size * size), fn = new Uint8Array(size * size);
    const set = (x, y, v) => { m[y * size + x] = v ? 1 : 0; fn[y * size + x] = 1; };

    function drawFormat(mask) {
      const d = (0 << 3) | mask;  // level M = 0b00
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      const bit = (i) => (b >>> i) & 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, 1);
    }
    // function patterns: timing, finders, alignment, format, version
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = [];
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2;
      const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
      pos[0] = 6;
      for (let i = n - 1, p = ver * 4 + 10; i >= 1; i--, p -= step) pos[i] = p;
    }
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const vbits = ver * 4096 + rem;  // (ver << 12) | rem, 18 bits
      for (let i = 0; i < 18; i++) {
        const bit = Math.floor(vbits / Math.pow(2, i)) & 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    // data in the zigzag order
    for (let right = size - 1, i = 0; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y * size + x] && i < all.length * 8) { m[y * size + x] = (all[i >> 3] >>> (7 - (i & 7))) & 1; i++; }
      }
    }
    const applyMask = (mask) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (fn[y * size + x]) continue;
        let inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (inv) m[y * size + x] ^= 1;
      }
    };
    // simplified penalty (runs + 2x2 blocks + balance); any mask gives a valid symbol
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        let runX = 1, runY = 1;
        for (let x = 0; x < size; x++) {
          const v = m[y * size + x];
          if (v) dark++;
          if (x > 0) {
            if (v === m[y * size + x - 1]) { runX++; if (runX === 5) p += 3; else if (runX > 5) p++; } else runX = 1;
            if (m[x * size + y] === m[(x - 1) * size + y]) { runY++; if (runY === 5) p += 3; else if (runY > 5) p++; } else runY = 1;
          }
          if (x > 0 && y > 0 && v === m[y * size + x - 1] && v === m[(y - 1) * size + x] && v === m[(y - 1) * size + x - 1]) p += 3;
        }
      }
      const total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return p + Math.max(0, k) * 10;
    };
    let best = 0, bestPen = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask); drawFormat(mask);
      const p = penalty();
      if (p < bestPen) { bestPen = p; best = mask; }
      applyMask(mask);
    }
    applyMask(best); drawFormat(best);
    return { size, modules: m };
  }

  // Dark modules on a white square with a 4-module quiet zone, as one SVG path (no inline script or style).
  function svg(text) {
    const q = encode(text), n = q.size + 8, NS = 'http://www.w3.org/2000/svg';
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++)
      if (q.modules[y * q.size + x]) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('role', 'img');
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#ffffff');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', '#101b28');
    el.append(bg, path);
    return el;
  }

  return { encode, svg };
})();

// resources/make-tray.mjs
// 生成菜单栏模板图标（纯黑前景 + 透明背景），无第三方依赖。
// 输出 tray.png(22×22) 与 tray@2x.png(44×44)，绘制「文」字形，代表翻译。
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

// 逻辑坐标系 44×44 内的「A文」翻译标记笔画（线段端点 + 半宽）
// 左 = 拉丁字母 A，右 = 汉字「文」，组合寓意「翻译」。
const STROKES = [
  // A（左）
  { a: [4, 35],   b: [11.5, 9], w: 2.7 },  // 左撇
  { a: [19, 35],  b: [11.5, 9], w: 2.7 },  // 右撇
  { a: [7, 26.5], b: [16, 26.5], w: 2.4 }, // 横杠
  // 文（右）
  { a: [30, 7],   b: [33, 11.5], w: 2.4 }, // 顶点
  { a: [24, 16],  b: [40, 16],   w: 2.7 }, // 横
  { a: [35.5, 19],b: [24, 37],   w: 2.7 }, // 撇
  { a: [28.5, 19],b: [40, 37],   w: 2.7 }, // 捺
];

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 在 44×44 逻辑空间，对某点求覆盖率（0..1），含抗锯齿软边
function coverage(lx, ly) {
  let min = Infinity;
  for (const s of STROKES) {
    const d = distToSegment(lx, ly, s.a, s.b) - s.w;
    if (d < min) min = d;
  }
  // 软边：距离边界 ±0.75 逻辑单位内线性过渡
  if (min <= -0.75) return 1;
  if (min >= 0.75) return 0;
  return (0.75 - min) / 1.5;
}

function renderRGBA(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const scale = 44 / size;
  const SS = 3; // 每像素 3×3 超采样
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const lx = (x + (sx + 0.5) / SS) * scale;
          const ly = (y + (sy + 0.5) / SS) * scale;
          acc += coverage(lx, ly);
        }
      }
      const a = Math.round((acc / (SS * SS)) * 255);
      const i = (y * size + x) * 4;
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = a;
    }
  }
  return buf;
}

// --- 最小 PNG 编码器 ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [size, name] of [[22, 'tray.png'], [44, 'tray@2x.png']]) {
  const png = encodePNG(renderRGBA(size), size);
  writeFileSync(join(DIR, name), png);
  console.log('✓ 生成', name, png.length, 'bytes');
}

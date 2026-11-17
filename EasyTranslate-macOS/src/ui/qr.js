// 二维码识别（jsQR）：自动缩放大图，多次尝试以提高识别率
import jsQR from 'jsqr';

function scan(source, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(source, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  return jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' });
}

/** @param {ImageBitmap|HTMLCanvasElement|OffscreenCanvas} source */
export function decodeQrFrom(source, w = source.width, h = source.height) {
  for (const side of [1200, 2000, 800, 3200]) {
    if (side > Math.max(w, h) * 1.01 && side !== 1200) continue;
    const r = scan(source, w, h, side);
    if (r?.data) return r.data;
  }
  return '';
}

export async function decodeQrBlob(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    return decodeQrFrom(bmp);
  } finally {
    bmp.close();
  }
}

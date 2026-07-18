import { nativeImage } from 'electron'

/** @type {Record<string, number[][]>} */
const DIGITS = {
  '0': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '1': [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  '2': [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  '3': [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '4': [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  '5': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '6': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '7': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  '8': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '9': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '+': [
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
  ],
}

/**
 * @param {import('electron').NativeImage} base
 * @param {number} count
 * @returns {import('electron').NativeImage}
 */
export function withTrayBadge(base, count) {
  const size = 32
  const img = base.isEmpty()
    ? nativeImage.createEmpty()
    : base.resize({ width: size, height: size })
  if (count <= 0 || img.isEmpty()) {
    return img.resize({ width: 16, height: 16 })
  }

  const buf = Buffer.from(img.toBitmap())
  const label = count > 9 ? '9+' : String(Math.floor(count))
  const badgeR = 9
  const cx = size - badgeR - 1
  const cy = size - badgeR - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= badgeR * badgeR) {
        const i = (y * size + x) * 4
        buf[i] = 0x22
        buf[i + 1] = 0x22
        buf[i + 2] = 0xe0
        buf[i + 3] = 0xff
      }
    }
  }

  const glyphs =
    label === '9+'
      ? [DIGITS['9'], DIGITS['+']]
      : label.split('').map((ch) => DIGITS[ch]).filter(Boolean)

  const scale = label.length > 1 ? 1 : 2
  const glyphW = 3 * scale
  const glyphH = 5 * scale
  const gap = scale
  const totalW = glyphs.reduce(
    (sum, _g, idx) => sum + glyphW + (idx ? gap : 0),
    0,
  )
  let ox = Math.round(cx - totalW / 2)
  const oy = Math.round(cy - glyphH / 2)

  for (const glyph of glyphs) {
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (!glyph[gy][gx]) continue
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = ox + gx * scale + sx
            const y = oy + gy * scale + sy
            if (x < 0 || y < 0 || x >= size || y >= size) continue
            const i = (y * size + x) * 4
            buf[i] = 0xff
            buf[i + 1] = 0xff
            buf[i + 2] = 0xff
            buf[i + 3] = 0xff
          }
        }
      }
    }
    ox += glyphW + gap
  }

  return nativeImage
    .createFromBitmap(buf, { width: size, height: size })
    .resize({ width: 16, height: 16 })
}

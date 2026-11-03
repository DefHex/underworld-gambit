// Minimal PNG reader/writer (no dependencies). Reads 8-bit, non-interlaced gray, RGB, indexed,
// gray+alpha and RGBA images; writes the palette-index images the game loads.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Decodes a PNG into RGBA pixels (and palette indices for indexed images). */
export function readPng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let header;
  let palette = null;
  let transparency = null;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        bitDepth: body[8], colorType: body[9], interlace: body[12],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  const { width, height, bitDepth, colorType, interlace } = header;
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG: depth ${bitDepth}, interlace ${interlace}`);
  const channels = CHANNELS[colorType];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left), du = Math.abs(estimate - up), dul = Math.abs(estimate - upLeft);
        value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      out[x] = value & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 3) {
      const index = pixels[s];
      rgba.set([palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], transparency && index < transparency.length ? transparency[index] : 255], d);
    } else if (colorType === 0) rgba.set([pixels[s], pixels[s], pixels[s], 255], d);
    else if (colorType === 4) rgba.set([pixels[s], pixels[s], pixels[s], pixels[s + 1]], d);
    else if (colorType === 2) rgba.set([pixels[s], pixels[s + 1], pixels[s + 2], 255], d);
    else rgba.set(pixels.subarray(s, s + 4), d);
  }
  return { width, height, rgba };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function encode(width, height, colorType, channels, pixels, extraChunks = []) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter: indexed sprite sheets compress fine without one
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    SIGNATURE, chunk('IHDR', header), ...extraChunks,
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Index image whose palette is the identity gray ramp (entry i = rgb(i,i,i)) with index 0 transparent.
 * A browser decodes it to red = index, which the game's palette shader turns back into colors.
 */
export function writeIndexPng(width, height, indices) {
  const ramp = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i++) ramp.fill(i, i * 3, i * 3 + 3);
  return encode(width, height, 3, 1, indices, [chunk('PLTE', ramp), chunk('tRNS', Buffer.from([0]))]);
}

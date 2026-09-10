import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const iconsDirectory = join(scriptDirectory, '..', 'public', 'icons');
const scale = 4;

mkdirSync(iconsDirectory, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  const typeBuffer = Buffer.from(type);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  pixels.set(color, (y * size + x) * 4);
}

function insideRoundedSquare(x, y, size, radius) {
  const nearX = x < radius ? radius : x >= size - radius ? size - radius - 1 : x;
  const nearY = y < radius ? radius : y >= size - radius ? size - radius - 1 : y;
  return Math.hypot(x - nearX, y - nearY) <= radius;
}

function drawLine(pixels, size, fromX, fromY, toX, toY, width, color) {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const x = Math.round(fromX + (toX - fromX) * ratio);
    const y = Math.round(fromY + (toY - fromY) * ratio);
    const radius = width / 2;
    for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py += 1) {
      for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px += 1) {
        if (Math.hypot(px - x, py - y) <= radius) setPixel(pixels, size, px, py, color);
      }
    }
  }
}

function drawCircle(pixels, size, centerX, centerY, radius, color) {
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      if (Math.hypot(x - centerX, y - centerY) <= radius) setPixel(pixels, size, x, y, color);
    }
  }
}

function createIcon(size) {
  const renderSize = size * scale;
  const pixels = Buffer.alloc(renderSize * renderSize * 4);
  const dark = [15, 23, 42, 255];
  const white = [248, 250, 252, 255];
  const green = [34, 197, 94, 255];
  const radius = renderSize * 0.19;

  for (let y = 0; y < renderSize; y += 1) {
    for (let x = 0; x < renderSize; x += 1) {
      if (insideRoundedSquare(x, y, renderSize, radius)) setPixel(pixels, renderSize, x, y, dark);
    }
  }

  const unit = renderSize / 100;
  const stroke = Math.max(3, Math.round(7 * unit));
  drawLine(pixels, renderSize, 35 * unit, 29 * unit, 18 * unit, 50 * unit, stroke, white);
  drawLine(pixels, renderSize, 18 * unit, 50 * unit, 35 * unit, 71 * unit, stroke, white);
  drawLine(pixels, renderSize, 65 * unit, 29 * unit, 82 * unit, 50 * unit, stroke, white);
  drawLine(pixels, renderSize, 82 * unit, 50 * unit, 65 * unit, 71 * unit, stroke, white);
  drawLine(pixels, renderSize, 50 * unit, 27 * unit, 50 * unit, 73 * unit, stroke, green);
  drawLine(pixels, renderSize, 50 * unit, 51 * unit, 62 * unit, 39 * unit, stroke, green);
  drawCircle(pixels, renderSize, 50 * unit, 25 * unit, 7 * unit, green);
  drawCircle(pixels, renderSize, 62 * unit, 38 * unit, 7 * unit, green);
  drawCircle(pixels, renderSize, 50 * unit, 75 * unit, 7 * unit, green);

  const downsampled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < scale; sampleY += 1) {
        for (let sampleX = 0; sampleX < scale; sampleX += 1) {
          const offset = (((y * scale + sampleY) * renderSize) + x * scale + sampleX) * 4;
          for (let channel = 0; channel < 4; channel += 1) sums[channel] += pixels[offset + channel];
        }
      }
      const outputOffset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) downsampled[outputOffset + channel] = Math.round(sums[channel] / (scale * scale));
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rawRows = [];
  for (let y = 0; y < size; y += 1) rawRows.push(Buffer.from([0]), downsampled.subarray(y * size * 4, (y + 1) * size * 4));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rawRows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(join(iconsDirectory, `icon-${size}.png`), createIcon(size));
console.log('Generated LeetGitSync production icons in public/icons/.');

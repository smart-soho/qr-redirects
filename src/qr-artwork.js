import QRCode from 'qrcode';

export const STYLE_OPTIONS = {
  module_style: ['square', 'rounded', 'dots'],
  marker_border: ['square', 'rounded'],
  marker_center: ['square', 'circle']
};

const safeStyle = (key, value) => STYLE_OPTIONS[key].includes(value) ? value : STYLE_OPTIONS[key][0];
const safeColour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
const roundedRectPath = (x, y, width, height, radius) => `M${x + radius} ${y} H${x + width - radius} Q${x + width} ${y} ${x + width} ${y + radius} V${y + height - radius} Q${x + width} ${y + height} ${x + width - radius} ${y + height} H${x + radius} Q${x} ${y + height} ${x} ${y + height - radius} V${y + radius} Q${x} ${y} ${x + radius} ${y} Z`;

export function artworkSvg(link, size = 1200) {
  const qr = QRCode.create(`https://smartqr.uk/${link.path}`, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const margin = 4;
  const total = count + margin * 2;
  const foreground = safeColour(link.foreground, '#111827');
  const background = safeColour(link.background, '#FFFFFF');
  const transparent = !!link.transparent_background;
  const modules = safeStyle('module_style', link.module_style);
  const border = safeStyle('marker_border', link.marker_border);
  const center = safeStyle('marker_center', link.marker_center);
  const finderOrigins = [[0, 0], [count - 7, 0], [0, count - 7]];
  const inFinder = (x, y) => finderOrigins.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const shapes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision">`];
  if (!transparent) shapes.push(`<rect width="${total}" height="${total}" fill="${background}"/>`);

  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (!qr.modules.get(x, y) || inFinder(x, y)) continue;
      const left = x + margin, top = y + margin;
      if (modules === 'dots') shapes.push(`<circle cx="${left + .5}" cy="${top + .5}" r=".46" fill="${foreground}"/>`);
      else shapes.push(`<rect x="${left}" y="${top}" width="1" height="1" rx="${modules === 'rounded' ? '.32' : '0'}" fill="${foreground}"/>`);
    }
  }

  for (const [fx, fy] of finderOrigins) {
    const x = fx + margin, y = fy + margin;
    const outerRadius = border === 'rounded' ? 1.35 : 0;
    const innerRadius = border === 'rounded' ? .75 : 0;
    shapes.push(`<path fill-rule="evenodd" d="${roundedRectPath(x, y, 7, 7, outerRadius)} ${roundedRectPath(x + 1, y + 1, 5, 5, innerRadius)}" fill="${foreground}"/>`);
    if (center === 'circle') shapes.push(`<circle cx="${x + 3.5}" cy="${y + 3.5}" r="1.5" fill="${foreground}"/>`);
    else shapes.push(`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${border === 'rounded' ? '.45' : '0'}" fill="${foreground}"/>`);
  }
  shapes.push('</svg>');
  return shapes.join('');
}

export const svgDataUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export async function artworkPng(link, size = 1200) {
  const svg = artworkSvg(link, size);
  const image = new Image();
  image.src = svgDataUrl(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable.');
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

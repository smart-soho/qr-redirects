// Validation shared by the dashboard (src/) and the Pages Function (functions/).
export const RESERVED = new Set(['api', 'admin', 'assets', 'src', 'node_modules', 'favicon.ico', 'smartsoho-logo.svg']);
export const PATH_FORMAT_MESSAGE = 'Use letters, numbers, dashes or underscores in the scan link.';
const PATH_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
const trimPath = value => typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : '';

export function pathError(value) {
  const path = trimPath(value);
  if (path === 'by.html') return null; // Keep this printed legacy URL intact.
  if (!path || path.length > 180 || !PATH_PATTERN.test(path)) return PATH_FORMAT_MESSAGE;
  const first = path.split('/')[0];
  if (RESERVED.has(first.toLowerCase())) return `"${first}" is reserved by the app. Choose a different scan link.`;
  return null;
}
export const normalisePath = value => pathError(value) ? null : trimPath(value);

export function validTarget(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
export const validColour = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

export function luminance(hex) {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
export function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
// Returns a message when the pair is unlikely to scan reliably. Transparent codes are judged on white.
export function colourError(foreground, background, transparent = false) {
  const surface = transparent ? '#FFFFFF' : background;
  if (contrast(foreground, surface) < 4.5) return 'Choose QR and background colours with more contrast so the code can be scanned.';
  if (luminance(foreground) >= luminance(surface)) return 'Use a QR colour darker than the background. Many scanners cannot read inverted codes.';
  return null;
}

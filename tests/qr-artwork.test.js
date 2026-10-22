import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkSvg } from '../src/qr-artwork.js';

test('QR artwork styles change module and marker shapes while keeping a full quiet zone', () => {
  const base = { path: 'campaign', foreground: '#111827', background: '#FFFFFF' };
  const square = artworkSvg(base, 1200);
  const styled = artworkSvg({ ...base, module_style: 'dots', marker_border: 'rounded', marker_center: 'circle' }, 1200);
  assert.match(square, /^<svg[^>]+width="1200" height="1200"/);
  assert.match(square, /<rect width="[0-9]+" height="[0-9]+" fill="#FFFFFF"\/>/);
  assert.match(styled, /<circle cx="[0-9.]+" cy="[0-9.]+" r="\.46"/);
  assert.match(styled, /fill-rule="evenodd"/);
  assert.match(styled, /r="1\.5" fill="#111827"/);
  assert.notEqual(square, styled);
});

test('transparent QR artwork omits opaque background and keeps finder centres clear', () => {
  const svg = artworkSvg({ path: 'campaign', foreground: '#111827', background: '#FF0000', transparent_background: true }, 1200);
  assert.doesNotMatch(svg, /fill="#FF0000"/);
  assert.doesNotMatch(svg, /<rect width="[0-9]+" height="[0-9]+"/);
  assert.match(svg, /fill-rule="evenodd"/);
});

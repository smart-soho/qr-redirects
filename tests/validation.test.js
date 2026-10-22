import test from 'node:test';
import assert from 'node:assert/strict';
import { pathError, normalisePath, colourError } from '../shared/validation.js';

test('reserved scan links get a specific message', () => {
  assert.match(pathError('Admin'), /"Admin" is reserved/);
  assert.match(pathError('api/links'), /reserved/);
  assert.match(pathError('bad link!'), /letters, numbers/);
  assert.equal(pathError('campaign/spring'), null);
  assert.equal(normalisePath('/Admin/'), null);
});
test('QR colours must be dark on a lighter background', () => {
  assert.equal(colourError('#111827', '#FFFFFF'), null);
  assert.match(colourError('#FFFFFF', '#111827'), /darker than the background/);
  assert.match(colourError('#777777', '#888888'), /more contrast/);
  assert.equal(colourError('#111827', '#000000', true), null, 'transparent codes are judged on white');
  assert.match(colourError('#FFFFFF', '#000000', true), /more contrast/);
});

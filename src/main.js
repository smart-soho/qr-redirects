import { artworkSvg, artworkPng, svgDataUrl } from './qr-artwork.js';
import { apiRequest } from './api.js';
import { pathError, colourError, validTarget } from '../shared/validation.js';
import './style.css';

const DEMO = import.meta.env.DEV;
const demoSeed = [
  { path: 'ARC/BASEcamp/flythrough', name: 'ARC BASEcamp flythrough', target: 'https://26669701.fs1.hubspotusercontent-eu1.net/hubfs/26669701/ONE%20TAKE_1%20%281%29.mp4' },
  { path: 'Borough-yards/RentSpace/YourPopUpSpaceQR', name: 'Borough Yards — Your Pop Up Space', target: 'https://www.boroughyards.com/' },
  { path: 'Borough-yards/ScanWin', name: 'Borough Yards — ScanWin', target: 'https://boroughyards-ftw.base44.app/' },
  { path: 'storeProperty/metal', name: 'Store Property — Metal', target: 'https://storehousew1.com/' },
  { path: 'by.html', name: 'Borough Yards — FTW', target: 'https://ftw.boroughyards.com/' }
].map(item => ({ ...item, foreground: '#111827', background: '#FFFFFF', updated_at: '2026-10-21 10:00:00' }));
const state = { links: [], selected: null, panel: false, query: '', busy: false, message: '', error: '', qr: '', pathEdit: false, pathDirty: false, designOpen: false };
const defaults = () => ({ name: '', target: '', path: '', foreground: '#111827', background: '#FFFFFF', transparent_background: false, module_style: 'square', marker_border: 'square', marker_center: 'square', size: 1200 });
let draft = defaults();
const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const scanUrl = path => `https://smartqr.uk/${path}`;
const formatDate = date => date ? new Date(date.replace(' ', 'T') + (date.includes('Z') ? '' : 'Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Today';
const slugify = name => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const validPath = path => !pathError(path);
const validUrl = validTarget;
const plusIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const downloadIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>';
const styleLabels = { square: 'Square', rounded: 'Rounded', dots: 'Dots', circle: 'Circle' };
function styleThumbnail(key, value) {
  if (key === 'module_style') return `<svg viewBox="0 0 42 42" aria-hidden="true">${[0, 1, 2].flatMap(y => [0, 1, 2].map(x => value === 'dots' ? `<circle cx="${11 + x * 10}" cy="${11 + y * 10}" r="3.5"/>` : `<rect x="${7 + x * 10}" y="${7 + y * 10}" width="8" height="8" rx="${value === 'rounded' ? 3 : 0}"/>`)).join('')}</svg>`;
  if (key === 'marker_border') return `<svg viewBox="0 0 42 42" aria-hidden="true"><rect x="6" y="6" width="30" height="30" rx="${value === 'rounded' ? 8 : 0}" fill="none" stroke="currentColor" stroke-width="5"/></svg>`;
  return `<svg viewBox="0 0 42 42" aria-hidden="true"><rect x="5" y="5" width="32" height="32" rx="5" fill="none" stroke="currentColor" stroke-width="3" opacity=".45"/>${value === 'circle' ? '<circle cx="21" cy="21" r="8"/>' : '<rect x="13" y="13" width="16" height="16" rx="2"/>'}</svg>`;
}
function styleChoices(key, title, options) {
  return `<fieldset class="style-choice"><legend>${title}</legend><div class="style-options">${options.map(value => `<label class="style-option"><input type="radio" name="${key}" value="${value}" ${draft[key] === value ? 'checked' : ''}><span class="style-tile">${styleThumbnail(key, value)}</span><span class="style-label">${styleLabels[value]}</span></label>`).join('')}</div></fieldset>`;
}

function render() {
  const matches = state.links.filter(link => `${link.name} ${link.path} ${link.target}`.toLowerCase().includes(state.query.toLowerCase()));
  app.innerHTML = `<div class="shell ${state.panel ? 'panel-open' : ''}">
    <main class="content"><div class="topbar"><div class="brand"><img class="brand-logo" src="/smartsoho-logo.svg" alt="Smart Soho"><span class="brand-product">Smart QR</span></div>${DEMO ? '' : '<form method="post" action="/admin/logout" class="signout"><button class="text-action" type="submit">Sign out</button></form>'}</div><div class="content-inner">
      ${DEMO ? '<div class="demo-note">Preview mode — changes are saved in this browser only.</div>' : ''}
      <header class="page-head"><div><h1>Your QR codes</h1><p>Create a code, then change its destination whenever you need to.</p></div><button class="button primary create-top" id="create">${plusIcon} Create QR code</button></header>
      <div class="list-tools"><label class="search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input id="search" type="search" placeholder="Search QR codes" value="${esc(state.query)}" aria-label="Search QR codes"></label><span class="count">${matches.length} ${matches.length === 1 ? 'code' : 'codes'}</span></div>
      ${!state.panel && state.error ? `<div class="alert error" role="alert">${esc(state.error)}<button class="alert-close" id="dismiss" aria-label="Dismiss">×</button></div>` : ''}
      ${!state.panel && state.message ? `<div class="alert success" role="status">${esc(state.message)}<button class="alert-close" id="dismiss" aria-label="Dismiss">×</button></div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Destination</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${matches.length ? matches.map(link => `<tr class="${state.selected === link.path && state.panel ? 'selected' : ''}"><td><button class="name-button" data-edit="${esc(link.path)}">${esc(link.name)}</button></td><td class="destination" title="${esc(link.target)}">${validUrl(link.target) ? `<a class="destination-link" href="${esc(link.target)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(link.name)} destination in a new tab">${esc(link.target)}</a>` : esc(link.target)}</td><td class="updated">${formatDate(link.updated_at)}</td><td><div class="row-actions"><button class="row-action" data-edit="${esc(link.path)}" aria-label="Edit ${esc(link.name)}">Edit</button><button class="row-download" data-download="${esc(link.path)}" aria-label="Download ${esc(link.name)} QR code as PNG" title="Download PNG">${downloadIcon}</button></div></td></tr>`).join('') : `<tr><td colspan="4" class="empty">${state.query ? 'No matching QR codes.' : 'No QR codes yet. Create your first one.'}</td></tr>`}
      </tbody></table></div><p class="table-help">Choose Edit to update a destination, or the download icon to save a PNG.</p>
      </div></main>${state.panel ? panelMarkup() : ''}</div>`;
  bind();
  if (state.panel) updatePreview();
}

function panelMarkup() {
  const editing = !!state.selected;
  const pathLine = draft.path ? `smartqr.uk/<strong id="path-display">${esc(draft.path)}</strong>` : 'Your link appears here when you add a name';
  return `<div class="mobile-scrim" id="scrim"></div><aside class="editor" aria-label="${editing ? 'Edit' : 'Create'} QR code">
    <div class="editor-head"><div><h2>${editing ? 'Update QR code' : 'Create QR code'}</h2><p>${editing ? 'Edit where this code takes people.' : 'Add a destination to get started.'}</p></div><button class="icon-button" id="close" aria-label="Close editor">×</button></div>
    <div class="editor-scroll"><form id="qr-form">
      <label class="field"><span>Name</span><input name="name" id="name" maxlength="100" required placeholder="e.g. Autumn event brochure" value="${esc(draft.name)}"></label>
      <label class="field"><span>Destination URL</span><input name="target" type="url" id="target" required placeholder="https://example.com/page" value="${esc(draft.target)}"><small>${editing ? 'You can change this whenever you like.' : 'The page people will see after scanning.'}</small></label>
      <div class="scan-summary"><div class="scan-head"><span>Scan link</span><button type="button" class="text-action" id="${editing ? 'copy-current' : 'toggle-path'}">${editing ? 'Copy link' : state.pathEdit ? 'Done' : 'Change'}</button></div><div class="scan-url" id="scan-url">${pathLine}</div><small>${editing ? 'This link stays the same when you update the destination.' : 'We make this link from the name. You can change it before saving.'}</small></div>
      ${!editing && state.pathEdit ? `<label class="field path-field"><span>Custom scan link</span><div class="prefix-input"><span>smartqr.uk/</span><input name="path" id="path" required pattern="[A-Za-z0-9_/-]+" value="${esc(draft.path)}"></div></label>` : ''}
      <div class="preview-head"><span>QR preview</span><small>Ready for print and screens</small></div><div class="qr-preview ${draft.transparent_background ? 'transparent' : ''}" id="preview">${state.qr ? `<img src="${state.qr}" alt="Preview of QR code for ${esc(draft.path)}">` : '<span>Your QR code will appear here.</span>'}</div>
      <details class="advanced" id="design-options" ${state.designOpen ? 'open' : ''}><summary>Customise QR artwork <span aria-hidden="true">⌄</span></summary><div class="advanced-content">${styleChoices('module_style', 'Dots', ['square', 'rounded', 'dots'])}${styleChoices('marker_border', 'Marker border', ['square', 'rounded'])}${styleChoices('marker_center', 'Marker centre', ['square', 'circle'])}<div class="color-grid"><label class="field color-field"><span>QR colour</span><span class="color-input"><input id="foreground" name="foreground" type="color" value="${esc(draft.foreground)}"><span>${esc(draft.foreground.toUpperCase())}</span></span></label><label class="field color-field background-field ${draft.transparent_background ? 'is-disabled' : ''}"><span>Background</span><span class="color-input"><input id="background" name="background" type="color" value="${esc(draft.background)}" ${draft.transparent_background ? 'disabled' : ''}><span>${esc(draft.background.toUpperCase())}</span></span></label></div><label class="transparent-toggle"><input id="transparent-background" type="checkbox" ${draft.transparent_background ? 'checked' : ''}><span>Transparent background</span></label><p class="transparency-hint">Use a light, plain surface so the QR code remains easy to scan.</p><label class="field size-field"><span>Download size <em>${draft.size} × ${draft.size} px</em></span><input id="size" name="size" type="range" min="600" max="2400" step="200" value="${draft.size}"></label></div></details>
    </form></div><div class="editor-footer">${state.error ? `<p class="panel-notice error" role="alert">${esc(state.error)}</p>` : ''}${state.message ? `<p class="panel-notice success" role="status">${esc(state.message)}</p>` : ''}<button class="button primary save" type="submit" form="qr-form" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : editing ? 'Save changes' : 'Create QR code'}</button>${editing ? `<div class="export-buttons"><button class="button secondary" id="png">${downloadIcon} Download PNG</button><button class="button secondary" id="svg">${downloadIcon} Download SVG</button></div>` : '<p class="save-hint">Downloads will be available after you create the code.</p>'}</div>
    </aside>`;
}

function bind() {
  document.querySelector('#create')?.addEventListener('click', newLink);
  document.querySelector('#close')?.addEventListener('click', closePanel);
  document.querySelector('#scrim')?.addEventListener('click', closePanel);
  document.querySelector('#dismiss')?.addEventListener('click', () => { state.message = ''; state.error = ''; render(); });
  document.querySelector('#search')?.addEventListener('input', event => { state.query = event.target.value; const start = event.target.selectionStart; render(); const input = document.querySelector('#search'); input.focus(); input.setSelectionRange(start, start); });
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editLink(button.dataset.edit)));
  document.querySelectorAll('[data-download]').forEach(button => button.addEventListener('click', () => { const link = state.links.find(item => item.path === button.dataset.download); if (link) downloadLink(link, 'png'); }));
  document.querySelector('#qr-form')?.addEventListener('submit', save);
  document.querySelector('#toggle-path')?.addEventListener('click', () => { state.pathEdit = !state.pathEdit; render(); if (state.pathEdit) document.querySelector('#path')?.focus(); });
  document.querySelector('#copy-current')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(scanUrl(draft.path)); notify('Scan link copied.'); } catch { notify('Could not copy the link.', true); } });
  document.querySelector('#design-options')?.addEventListener('toggle', event => { state.designOpen = event.target.open; });
  document.querySelectorAll('.style-option input').forEach(input => input.addEventListener('change', event => { draft[event.target.name] = event.target.value; updatePreview(); }));
  document.querySelector('#transparent-background')?.addEventListener('change', event => {
    draft.transparent_background = event.target.checked;
    document.querySelector('#background').disabled = draft.transparent_background;
    document.querySelector('.background-field').classList.toggle('is-disabled', draft.transparent_background);
    updatePreview();
  });
  ['name', 'target', 'path', 'foreground', 'background', 'size'].forEach(id => document.querySelector(`#${id}`)?.addEventListener('input', event => {
    draft[id] = event.target.value;
    if (id === 'name' && !state.selected && !state.pathDirty) { draft.path = slugify(draft.name); const field = document.querySelector('#path'); if (field) field.value = draft.path; }
    if (id === 'path') state.pathDirty = true;
    if (id === 'foreground' || id === 'background') event.target.nextElementSibling.textContent = event.target.value.toUpperCase();
    if (id === 'size') document.querySelector('.size-field em').textContent = `${draft.size} × ${draft.size} px`;
    if (id === 'name' || id === 'path') document.querySelector('#scan-url').innerHTML = draft.path ? `smartqr.uk/<strong id="path-display">${esc(draft.path)}</strong>` : 'Your link appears here when you add a name';
    if (['name', 'path', 'foreground', 'background'].includes(id)) updatePreview();
  }));
  document.querySelector('#png')?.addEventListener('click', () => download('png'));
  document.querySelector('#svg')?.addEventListener('click', () => download('svg'));
}
function closePanel() { state.panel = false; state.error = ''; state.message = ''; render(); }
function notify(message, error = false) { state.message = error ? '' : message; state.error = error ? message : ''; render(); }
function newLink() { state.selected = null; state.panel = true; state.pathDirty = false; state.pathEdit = false; state.designOpen = false; state.message = ''; state.error = ''; state.qr = ''; draft = defaults(); render(); document.querySelector('#name')?.focus(); }
function editLink(path) { const link = state.links.find(item => item.path === path); if (!link) return; state.selected = path; state.panel = true; state.pathDirty = true; state.pathEdit = false; state.designOpen = false; state.message = ''; state.error = ''; state.qr = ''; draft = { ...defaults(), ...link }; render(); }
function updatePreview() {
  const preview = document.querySelector('#preview');
  if (!preview) return;
  preview.classList.toggle('transparent', !!draft.transparent_background);
  if (!validPath(draft.path)) { preview.innerHTML = '<span>Your QR code will appear here.</span>'; return; }
  const snapshot = { ...draft };
  try {
    const qr = svgDataUrl(artworkSvg(snapshot, 420));
    state.qr = qr; preview.innerHTML = `<img src="${qr}" alt="Preview of QR code for ${esc(snapshot.path)}">`;
  } catch { preview.innerHTML = '<span>QR preview unavailable.</span>'; }
}
async function save(event) {
  event.preventDefault();
  if (!draft.name.trim()) return notify('Enter a name.', true);
  if (!validUrl(draft.target)) return notify('Enter a valid http or https destination URL.', true);
  const pathProblem = pathError(draft.path);
  if (pathProblem) return notify(pathProblem, true);
  const colourProblem = colourError(draft.foreground, draft.background, draft.transparent_background);
  if (colourProblem) return notify(colourProblem, true);
  if (!state.selected && state.links.some(link => link.path === draft.path)) return notify('That scan link is already in use.', true);
  state.busy = true; document.querySelector('.save').disabled = true; document.querySelector('.save').textContent = 'Saving…';
  try {
    const payload = { name: draft.name, target: draft.target, path: draft.path, foreground: draft.foreground, background: draft.background, transparent_background: !!draft.transparent_background, module_style: draft.module_style, marker_border: draft.marker_border, marker_center: draft.marker_center };
    if (DEMO) {
      const existing = state.links.findIndex(link => link.path === draft.path);
      const link = { ...payload, updated_at: new Date().toISOString() };
      if (existing >= 0) state.links[existing] = link; else state.links.unshift(link);
      localStorage.setItem('smartqr-demo-links', JSON.stringify(state.links));
    } else {
      await apiRequest(state.selected ? `/api/links/${state.selected.split('/').map(encodeURIComponent).join('/')}` : '/api/links', { method: state.selected ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      await loadLinks();
    }
    state.selected = draft.path; state.panel = true; state.busy = false; notify('Saved. Your QR code is ready to download.');
  } catch (error) { state.busy = false; notify(error.message, true); }
}
async function download(type) {
  if (!state.selected || !validPath(draft.path)) return;
  await downloadLink(draft, type);
}
async function downloadLink(link, type) {
  try {
    const content = type === 'svg' ? artworkSvg(link, Number(link.size || 1200)) : await artworkPng(link, Number(link.size || 1200));
    const anchor = document.createElement('a'); anchor.href = type === 'svg' ? URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' })) : content;
    anchor.download = `${link.path.replaceAll('/', '-')}.${type}`; document.body.append(anchor); anchor.click(); anchor.remove();
    if (type === 'svg') setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  } catch { notify('Could not create the download.', true); }
}
async function loadLinks() {
  if (DEMO) { try { state.links = JSON.parse(localStorage.getItem('smartqr-demo-links')) || demoSeed; } catch { state.links = demoSeed; } return; }
  state.links = (await apiRequest('/api/links')).links;
}
loadLinks().then(render).catch(error => { state.error = error.message; render(); });

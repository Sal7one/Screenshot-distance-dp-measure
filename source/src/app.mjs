import { calibrate, measure, stepSize, boundedGuide, nearestEdge, measurementReport } from './measurement.mjs';
import { ScreenshotCanvas } from './canvas.mjs';
import { loadScreenshot, edgeScores } from './image-file.mjs';
import { exportJson, exportPng } from './export.mjs';

const $ = id => document.getElementById(id);
const newSlot = () => ({ image: null, width: 0, height: 0, name: '', url: null,
  axis: 'y', guides: { x: [0, 0], y: [0, 0] }, selectedGuide: 0, generation: 0,
  calibration: { method: 'width', widthDp: '', cropped: false, referenceWidth: '', dpi: '', resize: '1' },
  invalidGuides: false, guideDrafts: { x: [null, null], y: [null, null] } });
const slots = { a: newSlot(), b: newSlot() };
let selected = 'a', comparing = false, tool = 'guides', pickerTarget = 'a', busyCount = 0;
const current = () => slots[selected];
const number = value => Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });

function message(text, error = false) { $('message').textContent = text; $('message').hidden = !text; $('message').classList.toggle('error', error); }
function select(id) {
  if (selected !== id) {
    for (const view of Object.values(views)) view.cancelDraft();
    selected = id; update(true);
  }
}
function guide(id, index, value) {
  const s = slots[id]; s.guides[s.axis][index] = value; s.selectedGuide = index; s.guideDrafts[s.axis][index] = null;
  s.invalidGuides = s.guideDrafts[s.axis].some(draft => draft !== null && (draft === '' || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > (s.axis === 'y' ? s.height : s.width)));
  if (id !== selected) selected = id;
  update();
}
const views = Object.fromEntries(['a', 'b'].map(id => [id, new ScreenshotCanvas($(`canvas-${id}`), () => slots[id], (index, value) => guide(id, index, value), () => select(id), viewLabels)]));

function field(id, value, force) {
  if (force || document.activeElement !== $(id)) $(id).value = value;
}
function viewLabels() {
  const s = current(), v = views[selected];
  $('zoom-label').value = s.image ? `${Math.round(v.view.scale * 100)}%` : 'Fit';
}
function update(force = false) {
  const s = current(), ready = !!s.image, c = calibrate(s.calibration, s.width), m = measure(s.guides[s.axis], c);
  for (const id of ['a', 'b']) {
    $(`source-${id}`).classList.toggle('active', selected === id);
    $(`source-${id}`).setAttribute('aria-pressed', String(selected === id));
    $(`source-${id}`).querySelector('span').textContent = slots[id].image ? slots[id].name : id === 'a' ? 'Screenshot' : 'Add another';
    $(`pane-${id}`).hidden = !comparing && selected !== id;
    $(`pane-label-${id}`).hidden = !comparing;
  }
  $('empty').hidden = ready || comparing;
  $('compare').disabled = !slots.a.image || !slots.b.image;
  $('compare').setAttribute('aria-pressed', String(comparing));
  $('compare').textContent = comparing ? 'Single view' : 'Compare A/B';
  $('result-source').textContent = selected.toUpperCase();
  $('result-source').style.color = selected === 'a' ? '#f5c04e' : '#8e9bff';
  $('image-meta').textContent = ready ? `${selected.toUpperCase()} · ${s.width} × ${s.height} image px` : 'No image selected';
  $('result-dp').value = ready && !s.invalidGuides && m.dp !== null ? number(m.dp) : '—';
  $('result-px').value = ready && !s.invalidGuides ? number(m.px) : '—';
  $('rounding').textContent = ready && m.dp !== null ? `· 1px ≈ ${number(m.dpPerPixel)}dp` : '';
  $('formula').textContent = !ready ? 'Open a screenshot to begin.' : s.invalidGuides ? 'Correct the boundary coordinate to continue.' : c.factor === null ? c.reason : `${number(m.px)} × ${c.factor.toFixed(6)} = ${number(m.dp)} dp\n${c.formula}`;
  const state = !ready ? 'No image selected.' : c.factor === null ? c.reason : `1 image px = ${c.factor.toFixed(6)} dp · zoom does not change this`;
  $('calibration-state').textContent = state;
  $('calibration-state').classList.toggle('invalid', c.factor === null);
  $('width-fields').hidden = s.calibration.method !== 'width'; $('dpi-fields').hidden = s.calibration.method !== 'dpi';
  $('crop-fields').hidden = !s.calibration.cropped;
  for (const [id, key] of [['method','method'], ['width-dp','widthDp'], ['reference-width','referenceWidth'], ['dpi','dpi'], ['resize','resize']]) field(id, s.calibration[key], force);
  $('cropped').checked = s.calibration.cropped;
  for (const axis of ['x', 'y']) $(`axis-${axis}`).setAttribute('aria-pressed', String(s.axis === axis));
  for (const name of ['guides', 'pan']) $(`tool-${name}`).setAttribute('aria-pressed', String(tool === name));
  for (let i = 0; i < 2; i++) {
    const input = $(`guide-${i + 1}`), draft = s.guideDrafts[s.axis][i]; field(input.id, ready ? draft ?? Number(s.guides[s.axis][i].toFixed(3)) : '', force);
    input.max = s.axis === 'y' ? s.height : s.width; input.min = 0;
    input.setAttribute('aria-invalid', String(draft !== null && (draft === '' || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > Number(input.max))));
    $(`place-${i + 1}`).classList.toggle('primary', views[selected].place === i);
  }
  field('selected-guide', s.selectedGuide, force);
  const canExport = ready && !s.invalidGuides && !busyCount;
  for (const id of ['guide-1', 'guide-2', 'place-1', 'place-2', 'snap', 'zoom-out', 'zoom-in', 'fit', 'actual']) $(id).disabled = !ready;
  const nudgeOk = ready && ($('nudge-unit').value === 'px' || c.factor !== null);
  $('nudge-minus').disabled = $('nudge-plus').disabled = !nudgeOk;
  $('export-json').disabled = $('export-png').disabled = !canExport;
  $('open').disabled = $('empty-open').disabled = busyCount > 0;
  $('demo').disabled = $('empty-demo').disabled = busyCount > 0;
  $('comparison-summary').hidden = !slots.a.image || !slots.b.image;
  const summary = $('comparison-values'); summary.replaceChildren();
  if (slots.a.image && slots.b.image) {
    const results = {};
    for (const id of ['a', 'b']) {
      const other = slots[id]; results[id] = other.invalidGuides ? { px: null, dp: null } : measure(other.guides[other.axis], calibrate(other.calibration, other.width));
      const box = document.createElement('div'), title = document.createElement('span'), value = document.createElement('strong');
      box.className = 'value'; title.textContent = `SOURCE ${id.toUpperCase()} · ${other.axis === 'y' ? 'VERTICAL' : 'HORIZONTAL'}`;
      value.textContent = results[id].dp === null ? results[id].px === null ? 'Invalid guides' : `${number(results[id].px)}px · uncalibrated` : `${number(results[id].dp)}dp`;
      box.append(title, value); summary.append(box);
    }
    if (results.a.dp !== null && results.b.dp !== null && slots.a.axis === slots.b.axis) {
      const box = document.createElement('div'), title = document.createElement('span'), value = document.createElement('strong');
      box.className = 'value'; title.textContent = 'ABSOLUTE DIFFERENCE'; value.textContent = `${number(Math.abs(results.a.dp - results.b.dp))}dp`; box.append(title, value); summary.append(box);
    }
  }
  for (const v of Object.values(views)) v.draw(); viewLabels();
}

async function openFile(file, target = selected) {
  const old = slots[target], ticket = ++old.generation; busyCount++; update();
  message(`Opening screenshot ${target.toUpperCase()}…`);
  let loaded;
  try {
    loaded = await loadScreenshot(file);
    if (old.generation !== ticket) { URL.revokeObjectURL(loaded.url); return; }
    const next = { ...newSlot(), ...loaded, generation: ticket };
    next.guides = { x: [loaded.width * .35, loaded.width * .65], y: [loaded.height * .4, loaded.height * .6] };
    views[target].cancelDraft();
    slots[target] = next; if (old.url) URL.revokeObjectURL(old.url);
    selected = target; update(true); views[target].resize(); views[target].fit();
    message(`${target.toUpperCase()} opened · ${loaded.width} × ${loaded.height}px. Enter its captured screen width in dp, then place the guides.`);
  } catch (error) { if (old.generation === ticket) message(error.message || 'The image could not be opened.', true); }
  finally { busyCount--; update(); }
}
function pick() { pickerTarget = selected; $('file-input').value = ''; $('file-input').click(); }
for (const id of ['open', 'empty-open']) $(id).addEventListener('click', pick);
$('file-input').addEventListener('change', () => { const file = $('file-input').files[0]; if (file) openFile(file, pickerTarget); });
for (const id of ['a', 'b']) $(`source-${id}`).addEventListener('click', () => { select(id); if (!slots[id].image) pick(); });
$('compare').addEventListener('click', () => { comparing = !comparing; update(); requestAnimationFrame(() => { for (const v of Object.values(views)) { v.resize(); v.fit(); } }); });
for (const name of ['guides', 'pan']) $(`tool-${name}`).addEventListener('click', () => {
  for (const v of Object.values(views)) { v.cancelDraft(); v.setTool(name); } tool = name; update();
});
for (const axis of ['x', 'y']) $(`axis-${axis}`).addEventListener('click', () => {
  views[selected].cancelDraft(); current().axis = axis;
  const s = current(); s.invalidGuides = s.guideDrafts[axis].some(draft => draft !== null && (draft === '' || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > (axis === 'y' ? s.height : s.width))); update(true);
});
for (const [id, key] of [['method','method'], ['width-dp','widthDp'], ['reference-width','referenceWidth'], ['dpi','dpi'], ['resize','resize']]) $(id).addEventListener(id === 'method' ? 'change' : 'input', () => { current().calibration[key] = $(id).value; update(); });
$('cropped').addEventListener('change', () => { current().calibration.cropped = $('cropped').checked; update(); });
for (let i = 0; i < 2; i++) {
  $(`guide-${i + 1}`).addEventListener('input', () => {
    const input = $(`guide-${i + 1}`), value = Number(input.value), s = current(), limit = s.axis === 'y' ? s.height : s.width;
    const valid = input.value !== '' && Number.isFinite(value) && value >= 0 && value <= limit;
    s.guideDrafts[s.axis][i] = input.value;
    s.invalidGuides = s.guideDrafts[s.axis].some(draft => draft !== null && (draft === '' || !Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > limit));
    if (valid) { s.guides[s.axis][i] = value; s.selectedGuide = i; }
    update();
  });
  $(`place-${i + 1}`).addEventListener('click', () => { tool = 'guides'; for (const v of Object.values(views)) v.setTool(tool); views[selected].place = i; current().selectedGuide = i; message(`Tap the ${current().axis === 'y' ? 'horizontal' : 'vertical'} boundary for guide ${i + 1}, or drag it.`); update(true); });
}
$('selected-guide').addEventListener('change', () => { current().selectedGuide = Number($('selected-guide').value); });
$('nudge-unit').addEventListener('change', () => update());
function nudge(direction, multiplier = 1) {
  const s = current(), c = calibrate(s.calibration, s.width); if (!s.image || $('nudge-unit').value === 'dp' && c.factor === null) return;
  const index = s.selectedGuide, value = s.guides[s.axis][index] + direction * multiplier * stepSize($('nudge-unit').value, c);
  guide(selected, index, boundedGuide(value, s.axis === 'y' ? s.height : s.width)); update(true);
}
$('nudge-minus').addEventListener('click', () => nudge(-1)); $('nudge-plus').addEventListener('click', () => nudge(1));
for (const id of ['a','b']) $(`canvas-${id}`).addEventListener('keydown', e => {
  if (['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)) { e.preventDefault(); select(id); nudge(e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey ? 10 : 1); }
  if (e.key === 'Escape') { views[id].cancelDraft(); update(true); }
});
$('snap').addEventListener('click', () => {
  const s = current();
  try {
    const index = s.selectedGuide, old = s.guides[s.axis][index];
    const edge = nearestEdge(edgeScores(s, s.axis), old);
    if (edge === null) message('No strong contrast boundary within 24px. Place the guide manually.');
    else { guide(selected, index, edge); update(true); message(`Guide ${index + 1} snapped from ${number(old)} to ${edge}px. This is a contrast suggestion; inspect the visible edge.`); }
  } catch (error) { message(`Could not inspect pixels: ${error.message}`, true); }
});
$('zoom-in').addEventListener('click', () => views[selected].zoom(1.3)); $('zoom-out').addEventListener('click', () => views[selected].zoom(1 / 1.3));
$('fit').addEventListener('click', () => views[selected].fit()); $('actual').addEventListener('click', () => { views[selected].actual(); message('1:1 view = one source-image pixel per browser CSS pixel. It does not set Android dp.'); });
$('export-json').addEventListener('click', () => { try { exportJson(current()); message('JSON report prepared with source dimensions, boundaries and calibration. Browser download requested.'); } catch (error) { message(error.message, true); } });
$('export-png').addEventListener('click', async () => {
  const frozen = { ...current(), calibration: { ...current().calibration }, guides: { x: [...current().guides.x], y: [...current().guides.y] } };
  busyCount++; update();
  try { await exportPng(frozen); message('Annotated PNG prepared. Browser download requested; the original screenshot is unchanged.'); } catch (error) { message(error.message, true); } finally { busyCount--; update(); }
});
const area = $('canvas-area');
area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dropping'); });
area.addEventListener('dragleave', e => { if (!area.contains(e.relatedTarget)) area.classList.remove('dropping'); });
area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dropping'); const file = e.dataTransfer.files[0]; if (file) openFile(file); });
document.addEventListener('paste', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  const item = [...(e.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (item) { e.preventDefault(); openFile(item.getAsFile()); }
});

async function demo() {
  const target = selected;
  const c = document.createElement('canvas'); c.width = 768; c.height = 1380;
  const g = c.getContext('2d'); g.scale(2, 2); g.fillStyle = '#111'; g.fillRect(0,0,384,690);
  g.fillStyle = '#a39588'; g.font = '11px system-ui'; g.fillText('CALIBRATED EXAMPLE · 384dp wide', 22,35);
  g.fillStyle = '#f7efe7'; g.font = 'bold 28px system-ui'; g.fillText('Account',22,80);
  g.fillStyle = '#232323'; g.beginPath(); g.roundRect(16,100,352,72,24); g.fill();
  g.beginPath(); g.roundRect(16,184,352,72,24); g.fill();
  g.fillStyle = '#f5c04e'; g.font = '25px system-ui'; g.fillText('G',34,144); g.fillStyle = '#8e9bff'; g.fillText('+',35,229);
  g.fillStyle = '#fff'; g.font = '16px system-ui'; g.fillText('Manage your account',70,142); g.fillText('Get a Plus plan',70,225);
  g.fillStyle = '#a39588'; g.font = '12px system-ui'; g.fillText('The visible gap is exactly 12dp.',22,295); g.fillText('768 image pixels ÷ 384dp = 2px per dp.',22,320);
  g.fillStyle = '#1a1613'; g.beginPath(); g.roundRect(16,365,352,250,22); g.fill();
  g.fillStyle = '#ff7a3d'; g.font = 'bold 36px system-ui'; g.fillText('24px → 12dp',36,435);
  g.fillStyle = '#cfc2b5'; g.font = '13px system-ui'; g.fillText('Try zooming. The measurement stays put.',36,472); g.fillText('Drag the guides or type exact coordinates.',36,497); g.fillText('Replace this with your own screenshot.',36,522);
  const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
  await openFile(new File([blob], 'example-384dp.png', { type:'image/png' }), target);
  const s = slots[target];
  if (s.name !== 'example-384dp.png') return;
  s.calibration.widthDp = '384'; s.guides.y = [344,368]; update(true);
  message('Known example: a 24px gap on a 768px-wide screenshot of a 384dp screen is exactly 12dp. Your own screenshot needs its own calibration.');
}
for (const id of ['demo','empty-demo']) $(id).addEventListener('click', demo);
update(true);

import { clamp, boundedGuide, fitTransform, toSource, toView, zoomAt, calibrate, measure } from './measurement.mjs';

const colors = ['#f5c04e', '#8e9bff'];
const margin = 28;

export class ScreenshotCanvas {
  constructor(canvas, getSlot, onGuide, onSelect, onView) {
    this.canvas = canvas;
    this.getSlot = getSlot;
    this.onGuide = onGuide;
    this.onSelect = onSelect;
    this.onView = onView;
    this.view = { scale: 1, x: 0, y: 0 };
    this.width = 0; this.height = 0; this.pointers = new Map();
    this.tool = 'guides'; this.place = null;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('lostpointercapture', e => this.up(e, true));
    canvas.addEventListener('wheel', e => {
      if (!this.getSlot().image) return;
      e.preventDefault(); this.onSelect();
      this.view = zoomAt(this.view, this.point(e), Math.exp(-clamp(e.deltaY, -200, 200) * .002));
      this.draw(); this.onView();
    }, { passive: false });
  }

  point(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const old = { width: this.width, height: this.height };
    this.width = r.width; this.height = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
    // Preserve the source under the centre across pane/orientation changes.
    if (old.width > 0 && old.height > 0) {
      this.view.x += (this.width - old.width) / 2;
      this.view.y += (this.height - old.height) / 2;
    } else if (this.getSlot().image) this.fit(false);
    this.draw(); this.onView();
  }
  fit(redraw = true) {
    const slot = this.getSlot();
    if (slot.image && this.width > 0) this.view = fitTransform(slot.width, slot.height, this.width, this.height);
    if (redraw) { this.draw(); this.onView(); }
  }
  zoom(ratio) { this.view = zoomAt(this.view, { x: this.width / 2, y: this.height / 2 }, ratio); this.draw(); this.onView(); }
  actual() {
    const center = toSource({ x: this.width / 2, y: this.height / 2 }, this.view);
    this.view = { scale: 1, x: this.width / 2 - center.x, y: this.height / 2 - center.y };
    this.draw(); this.onView();
  }
  // 1:1 here is one source pixel per CSS pixel, never an Android density guess.
  setTool(tool) { this.tool = tool; this.canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair'; }

  down(e) {
    const s = this.getSlot(); if (!s.image || e.button > 0) return;
    this.onSelect(); this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.point(e); this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // A second finger cancels a guide draft before beginning view-only zoom.
      if (this.drag?.type === 'guide') this.onGuide(this.drag.index, this.drag.original);
      const [a, b] = [...this.pointers.values()];
      this.drag = { type: 'pinch', view: { ...this.view }, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      return;
    }
    if (this.pointers.size > 2) return;
    const coordinate = s.axis === 'y' ? p.y : p.x;
    const positions = s.guides[s.axis].map(v => s.axis === 'y' ? toView({ x: 0, y: v }, this.view).y : toView({ x: v, y: 0 }, this.view).x);
    const distances = positions.map(v => Math.abs(coordinate - v));
    const near = distances[0] <= distances[1] ? 0 : 1;
    const index = this.place ?? (distances[near] <= (e.pointerType === 'touch' ? 26 : 12) ? near : null);
    if (index !== null && this.tool !== 'pan') {
      this.drag = { type: 'guide', index, original: s.guides[s.axis][index], axis: s.axis };
      const source = toSource(p, this.view);
      this.onGuide(index, boundedGuide(source[s.axis], s.axis === 'y' ? s.height : s.width));
      this.place = null;
    } else this.drag = { type: 'pan', origin: p, view: { ...this.view } };
  }
  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.point(e); this.pointers.set(e.pointerId, p);
    const s = this.getSlot(), d = this.drag; if (!d) return;
    if (d.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.view = zoomAt(d.view, d.center, Math.hypot(a.x - b.x, a.y - b.y) / d.distance);
      this.view.x += center.x - d.center.x; this.view.y += center.y - d.center.y;
    } else if (d.type === 'guide' && s.axis === d.axis) {
      const source = toSource(p, this.view);
      this.onGuide(d.index, boundedGuide(source[s.axis], s.axis === 'y' ? s.height : s.width));
    } else if (d.type === 'pan') this.view = { ...d.view, x: d.view.x + p.x - d.origin.x, y: d.view.y + p.y - d.origin.y };
    this.draw(); this.onView();
  }
  up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    if (cancelled && this.drag?.type === 'guide') this.onGuide(this.drag.index, this.drag.original);
    this.pointers.delete(e.pointerId);
    // Prevent the remaining pinch finger from unexpectedly moving a guide.
    this.drag = null;
    if (!this.pointers.size) this.onView();
  }
  cancelDraft() {
    if (this.drag?.type === 'guide') this.onGuide(this.drag.index, this.drag.original);
    this.drag = null; this.pointers.clear(); this.place = null;
  }

  draw() {
    if (!this.width || !this.height) return;
    const c = this.canvas.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0c0a09'; c.fillRect(0, 0, this.width, this.height);
    const s = this.getSlot(); if (!s.image) return;
    const v = this.view;
    c.save(); c.beginPath(); c.rect(margin, margin, this.width - margin, this.height - margin); c.clip();
    c.imageSmoothingEnabled = v.scale < 2;
    c.drawImage(s.image, v.x, v.y, s.width * v.scale, s.height * v.scale);
    c.strokeStyle = '#3f3630'; c.lineWidth = 1; c.strokeRect(v.x, v.y, s.width * v.scale, s.height * v.scale);
    const positions = s.guides[s.axis].map(value => s.axis === 'y' ? v.y + value * v.scale : v.x + value * v.scale);
    c.fillStyle = '#f5c04e14';
    if (s.axis === 'y') c.fillRect(Math.max(margin, v.x), Math.min(...positions), s.width * v.scale, Math.abs(positions[1] - positions[0]));
    else c.fillRect(Math.min(...positions), Math.max(margin, v.y), Math.abs(positions[1] - positions[0]), s.height * v.scale);
    for (let i = 0; i < 2; i++) {
      const p = positions[i]; c.strokeStyle = colors[i]; c.lineWidth = 1.5; c.beginPath();
      if (s.axis === 'y') { c.moveTo(margin, p); c.lineTo(this.width, p); }
      else { c.moveTo(p, margin); c.lineTo(p, this.height); } c.stroke();
      const x = s.axis === 'y' ? margin + 14 : p, y = s.axis === 'y' ? p : margin + 14;
      c.fillStyle = colors[i]; c.beginPath(); c.arc(x, y, 11, 0, 2 * Math.PI); c.fill();
      c.fillStyle = '#110e0c'; c.font = '11px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), x, y);
    }
    const m = measure(s.guides[s.axis], calibrate(s.calibration, s.width));
    const label = s.invalidGuides ? 'Check guides' : m.dp === null ? `${m.px.toFixed(2)} px` : `${m.dp.toFixed(2)} dp`;
    const labelWidth = c.measureText(label).width + 18;
    const mid = (positions[0] + positions[1]) / 2;
    const lx = s.axis === 'y' ? this.width - labelWidth - 14 : clamp(mid - labelWidth / 2, margin + 10, this.width - labelWidth - 10);
    const ly = s.axis === 'y' ? clamp(mid, margin + 18, this.height - 18) : this.height - 22;
    c.fillStyle = '#110e0cee'; c.fillRect(lx, ly - 12, labelWidth, 24);
    c.fillStyle = '#f7efe7'; c.fillText(label, lx + labelWidth / 2, ly);
    c.restore();
    this.ruler(c, 'x'); this.ruler(c, 'y');
    c.fillStyle = '#1a1613'; c.fillRect(0, 0, margin, margin); c.fillStyle = '#a39588';
    c.font = '9px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('px', 14, 14);
  }
  ruler(c, axis) {
    const horizontal = axis === 'x', length = horizontal ? this.width : this.height;
    const origin = horizontal ? this.view.x : this.view.y, scale = this.view.scale;
    const size = horizontal ? this.getSlot().width : this.getSlot().height;
    c.fillStyle = '#1a1613'; c.fillRect(horizontal ? margin : 0, horizontal ? 0 : margin, horizontal ? length : margin, horizontal ? margin : length);
    const raw = 65 / scale, power = 10 ** Math.floor(Math.log10(raw));
    const multiple = raw / power <= 1 ? 1 : raw / power <= 2 ? 2 : raw / power <= 5 ? 5 : 10;
    const step = multiple * power;
    const start = Math.ceil(Math.max(0, (margin - origin) / scale) / step) * step;
    const end = Math.min(size, (length - origin) / scale);
    c.strokeStyle = '#51443a'; c.fillStyle = '#a39588'; c.font = '9px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let value = start, count = 0; value <= end && count < 100; value += step, count++) {
      const p = origin + value * scale; c.beginPath();
      if (horizontal) { c.moveTo(p, margin - 5); c.lineTo(p, margin); c.stroke(); c.fillText(Number(value.toFixed(2)).toString(), p, 12); }
      else { c.moveTo(margin - 5, p); c.lineTo(margin, p); c.stroke(); c.save(); c.translate(12, p); c.rotate(-Math.PI / 2); c.fillText(Number(value.toFixed(2)).toString(), 0, 0); c.restore(); }
    }
  }
}

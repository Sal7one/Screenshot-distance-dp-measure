// Coordinates are boundaries in the decoded source image, never browser pixels.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

export function calibrate(input, imageWidth) {
  if (input.method === 'pixels') return { factor: null, reason: 'Pixel-only · add calibration to measure dp.' };
  if (input.method === 'width') {
    const widthDp = Number(input.widthDp);
    const referenceWidth = input.cropped ? Number(input.referenceWidth) : imageWidth;
    if (!positive(widthDp) || widthDp > 10000) return { factor: null, reason: 'Enter the full captured screen width in dp (up to 10,000).' };
    if (!positive(referenceWidth)) return { factor: null, reason: 'Enter the full screenshot width in pixels at the same resize scale as this crop.' };
    if (input.cropped && referenceWidth < imageWidth) return { factor: null, reason: 'The full screenshot cannot be narrower than this crop.' };
    return { factor: widthDp / referenceWidth, widthDp, referenceWidth,
      formula: `dp = image px × ${widthDp} ÷ ${referenceWidth}` };
  }
  if (input.method === 'dpi') {
    const dpi = Number(input.dpi), resize = Number(input.resize);
    if (!positive(dpi) || dpi > 10000 || !positive(resize) || resize < .001 || resize > 100) return { factor: null, reason: 'Enter logical DPI (up to 10,000) and a uniform resize factor from 0.001 to 100.' };
    return { factor: 160 / (dpi * resize), dpi, resize,
      formula: `dp = image px × 160 ÷ (${dpi} × ${resize})` };
  }
  return { factor: null, reason: 'Choose a calibration method.' };
}

export function measure(guides, calibration) {
  const px = Math.abs(guides[1] - guides[0]);
  return { px, dp: calibration.factor === null ? null : px * calibration.factor,
    // A one-pixel selection/edge uncertainty, not a statistical confidence interval.
    dpPerPixel: calibration.factor };
}

export function stepSize(unit, calibration) {
  return unit === 'dp' && calibration.factor !== null ? 1 / calibration.factor : 1;
}

export function fitTransform(sourceWidth, sourceHeight, width, height) {
  const scale = Math.min((width - 64) / sourceWidth, (height - 64) / sourceHeight);
  const safe = Math.max(0.001, scale);
  return { scale: safe, x: (width - sourceWidth * safe) / 2, y: (height - sourceHeight * safe) / 2 };
}

export const toSource = (point, view) => ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });
export const toView = (point, view) => ({ x: point.x * view.scale + view.x, y: point.y * view.scale + view.y });

export function zoomAt(view, point, ratio) {
  const source = toSource(point, view);
  const scale = clamp(view.scale * ratio, 0.001, 64);
  return { scale, x: point.x - source.x * scale, y: point.y - source.y * scale };
}

export function boundedGuide(value, size) {
  return clamp(Number.isFinite(value) ? value : 0, 0, size);
}

// A local contrast suggestion. It never infers a layout spacer from an image.
// scores[n] is the mean absolute RGB change across the boundary before pixel n.
export function nearestEdge(scores, guide, radius = 24) {
  const start = Math.max(1, Math.ceil(guide - radius));
  const end = Math.min(scores.length - 1, Math.floor(guide + radius));
  let best = null, strength = 6;
  for (let i = start; i <= end; i++) {
    const score = scores[i] - Math.abs(i - guide) * 0.025;
    if (score > strength) { strength = score; best = i; }
  }
  return best;
}

export function measurementReport(slot) {
  const calibration = calibrate(slot.calibration, slot.width);
  return { schemaVersion: 1, image: { name: slot.name, width: slot.width, height: slot.height },
    axis: slot.axis, guides: [...slot.guides[slot.axis]],
    calibration: { ...slot.calibration }, conversion: calibration,
    measurement: measure(slot.guides[slot.axis], calibration),
    meaning: 'Distance between selected visible boundaries. Does not recover declared padding or spacers.',
    precision: 'dp is derived from supplied calibration. Decimal places do not imply subpixel certainty.' };
}

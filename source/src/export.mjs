import { measurementReport } from './measurement.mjs';

const download = (blob, name) => {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  // Keep the URL long enough for mobile browsers to begin their download.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
const filename = (name) => name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'screenshot';

export function exportJson(slot) {
  download(new Blob([JSON.stringify(measurementReport(slot), null, 2) + '\n'], { type: 'application/json' }), `${filename(slot.name)}-measurement.json`);
}

export async function exportPng(slot) {
  const report = measurementReport(slot), c = document.createElement('canvas');
  // Pad narrow crops so calibration is still legible in the exported report.
  const width = Math.max(640, slot.width), fontSize = Math.max(16, Math.min(32, width / 40));
  c.width = width; c.height = 1;
  const g = c.getContext('2d');
  if (!g) throw new Error('The browser could not allocate the PNG report. Try the JSON report.');
  g.font = `${fontSize}px ui-monospace,monospace`;
  const dp = report.measurement.dp === null ? 'dp uncalibrated' : `${report.measurement.dp.toFixed(2)} dp (calibration-derived)`;
  const lines = [
    `HEARTH SCREENSHOT RULER · ${report.measurement.px.toFixed(2)} image px · ${dp}`,
    `${slot.width} × ${slot.height} px · ${slot.axis === 'y' ? 'vertical' : 'horizontal'} · boundaries ${report.guides.map(v => v.toFixed(2)).join(' → ')}`,
    report.conversion.formula || report.conversion.reason,
    'Zoom excluded. Visible distance does not reveal declared layout spacers.',
    'Calibration and pixel-edge selection determine accuracy.'
  ];
  const wrapped = [];
  // Wrap by measured text width, including unusually narrow screenshots.
  for (const line of lines) {
    let current = '';
    for (const word of line.split(' ')) {
      if (current && g.measureText(`${current} ${word}`).width > width - 40) { wrapped.push(current); current = word; }
      else current += (current ? ' ' : '') + word;
    }
    wrapped.push(current);
  }
  c.height = slot.height + Math.ceil((wrapped.length + 2) * fontSize * 1.6);
  g.fillStyle = '#110e0c'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(slot.image, 0, 0, slot.width, slot.height);
  const colors = ['#f5c04e', '#8e9bff'];
  report.guides.forEach((value, index) => {
    g.strokeStyle = colors[index]; g.lineWidth = Math.max(1, slot.width / 600); g.beginPath();
    if (slot.axis === 'y') { g.moveTo(0, value); g.lineTo(slot.width, value); }
    else { g.moveTo(value, 0); g.lineTo(value, slot.height); } g.stroke();
  });
  g.font = `${fontSize}px ui-monospace,monospace`; g.fillStyle = '#f7efe7';
  wrapped.forEach((line, index) => g.fillText(line, 20, slot.height + fontSize * (1.7 + index * 1.6)));
  const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
  c.width = 0; c.height = 0;
  if (!blob) throw new Error('The browser could not encode this PNG. Use the JSON report or a smaller screenshot.');
  download(blob, `${filename(slot.name)}-measured.png`);
}

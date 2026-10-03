import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, measure, stepSize, zoomAt, toSource, toView, fitTransform, nearestEdge, measurementReport } from '../src/measurement.mjs';
import { imageDimensions } from '../src/image-file.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('width calibration uses decoded screenshot pixels, including shared-image resize', () => {
  const c = calibrate({ method: 'width', widthDp: 384, cropped: false }, 591);
  near(measure([364,383], c).dp, 19 * 384 / 591);
  near(measure([682,713], c).dp, 31 * 384 / 591);
  const resized = calibrate({ method:'width', widthDp:384, cropped:false }, 1182);
  near(measure([728,766], resized).dp, measure([364,383], c).dp);
});
test('uncalibrated never fabricates dp; minimum width is not DPI', () => {
  assert.equal(calibrate({ method:'width', widthDp:'' }, 591).factor, null);
  assert.equal(calibrate({ method:'dpi', dpi:'', resize:1 }, 591).factor, null);
  const dpi = calibrate({ method:'dpi', dpi:450, resize:1 }, 1080);
  near(measure([0,11.25], dpi).dp, 4);
  near(measure([0,11.25], calibrate({ method:'dpi', dpi:384, resize:1 },1080)).dp, 4.6875);
});
test('crop reference uses the full image width at the same resize scale', () => {
  const full = calibrate({ method:'width', widthDp:384, cropped:false },1080);
  const crop = calibrate({ method:'width', widthDp:384, cropped:true, referenceWidth:1080 },200);
  near(measure([80,91.25], crop).dp, 4);
  near(measure([80,91.25], full).dp, 4);
  const resizedCrop = calibrate({ method:'width', widthDp:384, cropped:true, referenceWidth:540 },100);
  near(measure([40,45.625], resizedCrop).dp, 4);
  assert.equal(calibrate({ method:'width', widthDp:384, cropped:true, referenceWidth:'' },200).factor,null);
  assert.equal(calibrate({ method:'width', widthDp:384, cropped:true, referenceWidth:100 },200).factor,null);
});
test('DPI resize and width calibration are equivalent for a known screen', () => {
  const dpi = calibrate({ method:'dpi', dpi:450, resize:.5 },540);
  const width = calibrate({ method:'width', widthDp:384, cropped:false },540);
  near(dpi.factor, width.factor);
  assert.equal(calibrate({ method:'dpi', dpi:450, resize:0 },1080).factor, null);
});
test('zoom round trips source boundaries and cannot change measured distance', () => {
  const source = { x:135, y:344 }, initial = fitTransform(768,1380,850,600);
  const c = calibrate({ method:'width', widthDp:384 },768);
  for (const ratio of [.2,1,3,16]) {
    const view = zoomAt(initial, { x:425,y:300 },ratio);
    const point = toSource(toView(source,view),view); near(point.x,source.x); near(point.y,source.y);
    const g1 = toSource(toView({x:20,y:344},view),view).y, g2 = toSource(toView({x:20,y:368},view),view).y;
    near(measure([g1,g2],c).dp,12);
    near(toSource({x:425,y:300},view).y, toSource({x:425,y:300},initial).y);
  }
});
test('guides can cross, dp nudge follows calibration, pixel-only stays explicit', () => {
  const c = calibrate({method:'width',widthDp:384},768);
  near(measure([368,344],c).dp,12); near(stepSize('dp',c),2);
  assert.equal(measure([0,24],calibrate({method:'pixels'},768)).dp,null);
});
test('edge suggestion finds a real nearby boundary and refuses flat/noisy backgrounds', () => {
  const scores = new Float64Array(100); scores[40]=30; scores[60]=50;
  assert.equal(nearestEdge(scores,39,5),40);
  assert.equal(nearestEdge(scores,20,5),null);
  assert.equal(nearestEdge(new Float64Array(100),50),null);
});
test('report pins image dimensions, exact source bounds and calibration', () => {
  const report = measurementReport({ name:'screenshot.png', width:768,height:1380, axis:'y',guides:{y:[344,368]}, calibration:{method:'width',widthDp:384,cropped:false} });
  near(report.measurement.dp,12); assert.equal(report.image.width,768); assert.deepEqual(report.guides,[344,368]);
  assert.match(report.meaning,/Does not recover/);
});
test('raster header dimensions checked before decoding; malformed/unsupported is rejected', () => {
  const png = new Uint8Array(24),v = new DataView(png.buffer); v.setUint32(0,0x89504e47);v.setUint32(4,0x0d0a1a0a);v.setUint32(12,0x49484452);v.setUint32(16,591);v.setUint32(20,1280);
  assert.deepEqual(imageDimensions(png),{width:591,height:1280});
  const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xc0,0,8,8,5,0,2,79,1]);
  assert.deepEqual(imageDimensions(jpeg),{width:591,height:1280});
  const webp = new Uint8Array(30); webp.set(new TextEncoder().encode('RIFF'),0); webp.set(new TextEncoder().encode('WEBPVP8X'),8);webp[24]=255;webp[25]=1;webp[27]=255;webp[28]=3;
  assert.deepEqual(imageDimensions(webp),{width:512,height:1024});
  assert.throws(()=>imageDimensions(new TextEncoder().encode('<svg/>')));
  assert.throws(()=>imageDimensions(png.slice(0,20)));
});

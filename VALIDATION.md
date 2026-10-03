# Validation and handoff

Checked on 3 October 2026. Source behavior, host tests and browser observations
are separate below. No private screenshots are included in this repository.

## Implemented

The app reads bounded local PNG/JPEG/WebP images, keeps A/B measurements in
decoded source coordinates, and converts distances using explicit calibration.
It supports guide placement/coordinates, pixel/dp nudging, optional contrast
snap, zoom/pan, two-source comparison, and annotated PNG/JSON download requests.
The generated `index.html` contains its own CSS and JavaScript; no runtime asset
or service request is required. Content-security hashes are regenerated with it.

## Host checks

| Check | Result |
|---|---|
| `node --test source/tests/measurement.test.mjs` | 9 passed, 0 failed |
| `python3 -m unittest discover -s tests -v` | 5 passed, 0 failed |
| `python3 scripts/build.py --check` | Committed HTML matches source |
| Bundled JavaScript `node --check` | Passed in the packaging suite |

Measurement tests cover screen-width and logical-DPI conversion, crop/resize
invariance, unavailable calibration, bounds, signed source differences and edge
suggestion. Packaging checks cover deterministic output, embedded content hashes,
missing exports, module cycles/path escape and unsupported module syntax.

## Browser observations

The single-file page was served as one static HTML file and exercised through
the desktop in-app browser:

| Journey | Observed result |
|---|---|
| Built-in 768px/384dp example, guides 344 and 368 | 24px = 12dp |
| Increase display zoom from 31% to 52% | Measurement remains 12dp |
| Open a synthetic 200×400 crop, full-width reference 1080px/384dp, guides 100 and 140 | 40px = 14.22dp |
| Inline script/style and local image decoding under generated CSP | Functional, no console errors/warnings observed |

The original modular source was also exercised at a 390px viewport without
horizontal document overflow, with A/B calibrated parity, invalid-input recovery,
PNG/WebP imports and failed unsupported-image replacement. Its annotated PNG and
JSON downloads completed in desktop Firefox, and the synthetic annotated PNG was
decoded independently. These observations are from the source before packaging;
they are not a second full export journey on this bundled HTML.

Opening `file://` in the controlled browser was blocked by the browser tool's URL
policy. Offline opening is supported by the packaging structure but was not
observed through that browser; it is not recorded as a passing browser check.

## Deployment

The Pages workflow tests and builds a clean `_site/` containing only the generated
HTML and `.nojekyll`. Check the latest successful deployment in the repository's
Actions tab; a git push alone is not evidence that Pages is live.

## Still unmeasured or unavailable

- Real Android/iOS touch, screen-reader behavior and pinch gestures.
- Extreme-size memory pressure, browser-specific download restrictions and local
  file opening across browser families.
- Calibration cannot infer an app's hidden spacer/padding or reconstruct Android
  density from a physical device name or the browser's pixel ratio.
- No cm/in, HEIF/video, automatic layout recognition or persisted sessions.

## Working process

1. Inspect Git status and preserve unrelated work.
2. Edit `source/`, keeping conversion independent of display zoom. Do not add
   screenshot transmission, remote dependencies or guessed density defaults.
3. Run the measurement tests and packaging tests. Rebuild `index.html`; run
   `--check` before committing source and generated output together.
4. Serve the generated file, try the known example, import a synthetic screenshot,
   check zoom/calibration and any changed actions. Do not publish personal images.
5. Push to `main`, inspect the Pages workflow and check the public app. Describe
   source changes, test results and device observations separately.

The app is an extracted measurement utility; its deployment does not establish
anything about Hearth's Android editing or native-processing capabilities.

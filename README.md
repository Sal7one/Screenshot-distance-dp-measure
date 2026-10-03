# Screenshot-distance-dp-measure

A browser screenshot ruler for measuring **visible spacing** in source pixels
and Android dp. Open a screenshot, calibrate its scale, and put two guides on
the boundaries you want to compare.

**[Pages URL after setup](https://sal7one.github.io/Screenshot-distance-dp-measure/)**

The code is published. Pages still needs an owner to enable it in repository
settings; the available publishing credential cannot change those settings.

## One file, no backend

[`index.html`](index.html) is self-contained: HTML, CSS and JavaScript are embedded.
Download it and open it in your browser, or host it as a GitHub Pages site. There
is no npm install, external font, CDN, account, analytics or image upload server.
Images stay in this browser tab. Closing/reloading the tab clears them.

The maintainable source is in [`source/`](source/); `index.html` is generated from
those separate modules. Do not edit the generated HTML by hand.

## Measure a gap

1. Choose, drop or paste a PNG, JPEG or WebP screenshot.
2. Enter the **full captured screen width in dp**. For a complete portrait
   screenshot, Android Developer Options → Minimum width often matches it.
   Landscape and split-screen captures need their actual captured width.
3. If the image is cropped, enable **This image is a crop** and enter the full
   screenshot's pixel width **at the crop's resize scale**. Cropping alone keeps
   pixels the same size; resizing a crop needs the matching reference scale.
4. Drag the two guides, use Place, or type their coordinates. Switch between
   vertical and horizontal distance. Nudge by one image pixel or one dp.
5. Zoom/pan to inspect edges; zoom does not change the measurement.
6. Add B to compare two independently calibrated gaps side by side.
7. Download an annotated PNG or JSON report before closing the tab.

The built-in example has a **24px gap on a 768px-wide image of a 384dp screen**:
`24 × 384 / 768 = 12dp`.

An alternative mode uses the screenshot device's **logical DPI** and its uniform
resize factor: `dp = imagePx × 160 / (logicalDpi × resizeFactor)`.
Minimum width **384dp is not 384DPI**. Physical panel PPI and the browser's pixel
ratio cannot supply Android layout density.

Guides mark pixel boundaries: rows 364–382 occupy `[364,383)` and span 19px.
The readout shows the formula and the dp size of one image pixel. Decimal places
do not imply subpixel accuracy. A visible gap includes whatever the screenshot
actually shows; it cannot identify hidden padding or a spacer declared in code.

## Controls and limits

- Mouse wheel or pinch zoom; Pan moves the view. 1:1 is one image pixel per
  browser CSS pixel. Canvas arrow keys nudge the selected guide; Shift ×10.
- Optional edge snap suggests nearby contrast within 24 source pixels. Check it:
  text, shadows and rounded corners can be mistaken for the intended boundary.
- A/B sources keep their own guides and calibration. Display fit scales can
  differ; the numeric comparison uses calibrated distances.
- PNG/JPEG/WebP only, up to 32MiB encoded, 20MP and 20,000px per axis. A failed
  replacement keeps the prior image. HEIF and video are not supported.
- No cm/in, automatic layout recognition, persistent sessions or Android device
  density detection. Real phone pinch/accessibility and extreme-size memory
  behavior have not been measured.

## Develop

Python 3.10+ builds the page using only the standard library. Node 20+ runs the
contract tests; there are no package dependencies.

```sh
node --test source/tests/measurement.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 scripts/build.py --check
python3 -m http.server 8768 --bind 127.0.0.1
```

Open `http://localhost:8768/`. A hosted site only needs `index.html` and
`.nojekyll`; the Python build/server does not run on GitHub Pages.

| Path | Responsibility |
|---|---|
| `source/index.html`, `source/styles.css` | Responsive presentation using Hearth's palette |
| `source/src/measurement.mjs` | Pure source-coordinate conversion, measurements and report contract |
| `source/src/canvas.mjs` | Image/ruler drawing, guide drafts and view gestures |
| `source/src/image-file.mjs` | Header bounds, local browser decode and contrast sampling |
| `source/src/app.mjs` | A/B state, calibration, errors and working UI actions |
| `source/src/export.mjs` | Frozen annotated PNG/JSON download requests |
| `scripts/build.py` | Deterministic packaging and content-security hashes |
| `.github/workflows/pages.yml` | Test/build/deploy the single-file site |

## GitHub Pages

In this repository, choose **Settings → Pages → Source → GitHub Actions**.
Then choose **Actions → Test and deploy screenshot ruler → Run workflow → main**.
Future pushes to `main` deploy automatically. Alternatively,
choose **Deploy from a branch → main → / (root)**; the committed `index.html`
is already built. Do not upload personal screenshots to the repository.

## Validation

[`VALIDATION.md`](VALIDATION.md) separates source, host/browser checks and
unmeasured device behavior. This tool was extracted from Hearth's standalone
measurement utility; no Android, NDK, model, FFmpeg or research-clone source is
included.

References:
[Android dp/density conversion](https://developer.android.com/training/multiscreen/screendensities),
[MDN pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events),
[MDN browser pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio),
[GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

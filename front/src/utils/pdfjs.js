/**
 * pdf.js, loaded once per session.
 *
 * The API and its worker come to about half a megabyte gzipped — larger than
 * most of the documents they open, so the download is what a reader waits for,
 * not the file. Keeping the promise at module scope means the second PDF costs
 * nothing, and `loadPdfjs()` can be called speculatively (a hover over a PDF in
 * the curriculum) to overlap that download with the reader still deciding.
 */
let pdfjsModule = null

export function loadPdfjs() {
  pdfjsModule ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
  ]).then(([pdfjs, worker]) => {
    // A worker port rather than a URL: the bundler owns the file's final name,
    // and a hardcoded path breaks the moment the hash changes.
    pdfjs.GlobalWorkerOptions.workerPort = new worker.default()
    return pdfjs
  })
  return pdfjsModule
}

// Copied out of the package at install time (scripts/copy-pdfjs-assets.mjs).
// Without them pdf.js has nowhere to fetch a standard-14 font or a CJK
// character map from, and this SPA's nginx answers unknown paths with
// index.html — a 200 of HTML is a slower failure than a clean miss.
export const PDF_ASSET_OPTIONS = {
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
}

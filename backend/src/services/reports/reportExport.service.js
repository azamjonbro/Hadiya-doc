import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

// PDFKit's built-in Helvetica is WinAnsi-only, so it renders Cyrillic — and
// the Uzbek/Russian report labels and department names that come with it —
// as garbage. DejaVu is bundled (see assets/fonts/LICENSE.txt) and embedded
// into every PDF so the file reads the same everywhere it is opened.
const FONT_REGULAR = fileURLToPath(new URL('../../assets/fonts/DejaVuSans.ttf', import.meta.url))
const FONT_BOLD = fileURLToPath(new URL('../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url))

function escapeCsvValue(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function toCsv({ columns, rows }) {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(','))
  // Leading BOM so Excel opens UTF-8 CSVs (Cyrillic/Uzbek department names,
  // course titles, etc.) without mangling the characters.
  return '﻿' + [header, ...lines].join('\r\n')
}

async function toXlsxBuffer({ columns, rows }, sheetName) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)) // Excel's sheet-name length limit
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRows(rows)
  return workbook.xlsx.writeBuffer()
}

// PDFKit has no built-in table layout — this hand-rolls a simple paginated
// grid: header row repeated on each page, row height measured per-row from
// the tallest cell so wrapped text never overlaps the next row.
function streamPdf({ columns, rows }, title, res, { generatedAtLabel = 'Generated at' } = {}) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.pipe(res)

  const startX = doc.page.margins.left
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colWidth = usableWidth / columns.length
  const cellPadding = 4

  // A fixed YYYY-MM-DD HH:mm stamp rather than a locale-formatted one: the
  // cell dates use the same shape, and it does not depend on which ICU data
  // the server happens to be built with.
  const generatedAt = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`

  doc.fontSize(16).font('bold').text(title, startX, doc.page.margins.top)
  doc.fontSize(9).font('body').text(`${generatedAtLabel}: ${generatedAt}`, startX, doc.y)

  function drawHeaderRow(y) {
    doc.font('bold').fontSize(9)
    // Measured rather than assumed to be one line, the way the data rows
    // below already are. Translated headers are longer than the English ones
    // they were laid out against ("Avg skipped (sec)" becomes "O'rtacha
    // o'tkazib yuborilgan (sek)"), so they wrap — and a fixed 14pt header
    // height drew the rule through the second line and let the first data row
    // land on top of it.
    const height = Math.max(
      14,
      ...columns.map((c) => doc.heightOfString(c.header, { width: colWidth - cellPadding }))
    )
    columns.forEach((c, i) => {
      doc.text(c.header, startX + i * colWidth, y, { width: colWidth - cellPadding })
    })
    doc
      .moveTo(startX, y + height)
      .lineTo(startX + usableWidth, y + height)
      .strokeColor('#cccccc')
      .stroke()
    return y + height + 4
  }

  let y = drawHeaderRow(doc.y + 10)
  doc.font('body').fontSize(8)

  for (const row of rows) {
    const cellHeights = columns.map((c) =>
      doc.heightOfString(String(row[c.key] ?? ''), { width: colWidth - cellPadding })
    )
    const height = Math.max(12, ...cellHeights) + cellPadding

    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = drawHeaderRow(doc.page.margins.top)
      doc.font('body').fontSize(8)
    }

    columns.forEach((c, i) => {
      doc.text(String(row[c.key] ?? ''), startX + i * colWidth, y, { width: colWidth - cellPadding })
    })
    y += height
  }

  doc.end()
}

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

export const reportExportService = {
  contentType(format) {
    return CONTENT_TYPES[format]
  },
  toCsv,
  toXlsxBuffer,
  streamPdf,
}

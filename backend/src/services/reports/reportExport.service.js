import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

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
function streamPdf({ columns, rows }, title, res) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
  doc.pipe(res)

  const startX = doc.page.margins.left
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colWidth = usableWidth / columns.length
  const cellPadding = 4

  doc.fontSize(16).font('Helvetica-Bold').text(title, startX, doc.page.margins.top)
  doc.fontSize(9).font('Helvetica').text(new Date().toLocaleString(), startX, doc.y)

  function drawHeaderRow(y) {
    doc.font('Helvetica-Bold').fontSize(9)
    columns.forEach((c, i) => {
      doc.text(c.header, startX + i * colWidth, y, { width: colWidth - cellPadding })
    })
    doc
      .moveTo(startX, y + 14)
      .lineTo(startX + usableWidth, y + 14)
      .strokeColor('#cccccc')
      .stroke()
    return y + 18
  }

  let y = drawHeaderRow(doc.y + 10)
  doc.font('Helvetica').fontSize(8)

  for (const row of rows) {
    const cellHeights = columns.map((c) =>
      doc.heightOfString(String(row[c.key] ?? ''), { width: colWidth - cellPadding })
    )
    const height = Math.max(12, ...cellHeights) + cellPadding

    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = drawHeaderRow(doc.page.margins.top)
      doc.font('Helvetica').fontSize(8)
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

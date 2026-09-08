import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { env } from '../../config/env.js'
import { S3StorageProvider } from '../../storage/S3StorageProvider.js'
import { CertificateTemplate } from '../../models/certificateTemplate.model.js'

/**
 * Draws a certificate as a PDF and stores it.
 *
 * PDFKit's built-in Helvetica is WinAnsi-only, so it renders Cyrillic — and
 * the Uzbek names that come with it — as garbage. DejaVu is bundled and
 * embedded, the same fonts and for the same reason as the report exports.
 */
const FONT_REGULAR = fileURLToPath(new URL('../../assets/fonts/DejaVuSans.ttf', import.meta.url))
const FONT_BOLD = fileURLToPath(new URL('../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url))

const certificateStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)
const imageStorage = new S3StorageProvider(env.S3_BUCKET_IMAGES)

/**
 * Where a certificate can be checked without signing in. The QR encodes it,
 * which is the whole point of printing one: somebody holding the paper can
 * confirm it without an account.
 */
export function verificationUrl(serial) {
  return `${env.APP_URL}/verify/${serial}`
}

// A layout that reads as a certificate with no template configured at all.
// A blank page would be a worse first impression than a plain one, and an
// install has no templates until somebody makes one.
const FALLBACK_FIELDS = [
  { key: 'fullName', x: 50, y: 42, fontSize: 30, bold: true, align: 'center' },
  { key: 'courseTitle', x: 50, y: 55, fontSize: 18, align: 'center' },
  { key: 'issuedAt', x: 50, y: 68, fontSize: 12, align: 'center' },
  { key: 'serial', x: 50, y: 90, fontSize: 9, align: 'center', color: '#666666' },
  { key: 'qr', x: 88, y: 72, size: 10 },
]

function formatDate(value) {
  if (!value) return ''
  // A fixed YYYY-MM-DD rather than a locale format: a certificate is read
  // years later, possibly in another country, and an ambiguous 03/04/2026
  // is worse than a shape everyone can parse.
  return new Date(value).toISOString().slice(0, 10)
}

function valueFor(key, certificate) {
  switch (key) {
    case 'fullName':
      return certificate.fullName
    case 'courseTitle':
      return certificate.sourceTitle
    case 'issuedAt':
      return formatDate(certificate.issuedAt)
    case 'validUntil':
      return certificate.validUntil ? formatDate(certificate.validUntil) : ''
    case 'serial':
      return certificate.serial
    case 'score':
      return certificate.score ?? ''
    default:
      return ''
  }
}

async function loadBackground(backgroundKey) {
  if (!backgroundKey) return null
  try {
    const stream = await imageStorage.getObject(backgroundKey)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch {
    // A missing background must not stop a certificate being issued — the
    // text is the certificate, the picture is decoration.
    return null
  }
}

export async function renderCertificatePdf(certificate, template) {
  const layout = template ?? {}
  const fields = layout.fields?.length ? layout.fields : FALLBACK_FIELDS
  const background = await loadBackground(layout.backgroundKey)

  const doc = new PDFDocument({
    size: layout.pageSize || 'A4',
    layout: layout.orientation || 'landscape',
    margin: 0,
  })
  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)

  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve) => doc.on('end', resolve))

  const { width, height } = doc.page
  if (background) doc.image(background, 0, 0, { width, height })

  for (const field of fields) {
    const x = (field.x / 100) * width
    const y = (field.y / 100) * height

    if (field.key === 'qr') {
      const size = ((field.size ?? 12) / 100) * width
      // Rendered as a data URL and drawn, rather than written to a temp
      // file: the whole PDF is produced in memory and never touches disk.
      const qr = await QRCode.toBuffer(verificationUrl(certificate.serial), {
        margin: 0,
        width: Math.round(size * 2),
      })
      doc.image(qr, x - size / 2, y, { width: size, height: size })
      continue
    }

    const text = valueFor(field.key, certificate)
    if (!text) continue

    doc.font(field.bold ? 'bold' : 'body').fontSize(field.fontSize ?? 16).fillColor(field.color ?? '#111111')
    // Positioned from the field's own point, with the text box spanning the
    // page: `align` then places it, so moving a field in the editor moves
    // exactly what the operator dragged.
    const boxWidth = width * 0.9
    doc.text(text, (width - boxWidth) / 2, y, { width: boxWidth, align: field.align ?? 'center' })
  }

  doc.end()
  await done
  return Buffer.concat(chunks)
}

export const certificateRenderService = {
  /**
   * Renders and stores one certificate, returning the storage key.
   *
   * Stored in the materials bucket — private, served only through a
   * short-lived signed URL. A certificate carries a full name and what the
   * person was trained on; it is not public just because it can be verified
   * by serial.
   */
  async render(certificate) {
    const template = certificate.templateId
      ? await CertificateTemplate.findById(certificate.templateId).lean()
      : await CertificateTemplate.findOne({ isDefault: true }).lean()

    const pdf = await renderCertificatePdf(certificate, template)
    const key = `certificates/${certificate.serial}.pdf`
    await certificateStorage.putObject(key, pdf, 'application/pdf')
    return key
  },
}

import { Certificate } from '../models/certificate.model.js'
import { CertificateTemplate } from '../models/certificateTemplate.model.js'
import { certificateService } from '../services/certificates/certificate.service.js'
import { certificateRenderService } from '../services/certificates/certificateRender.service.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { S3StorageProvider } from '../storage/S3StorageProvider.js'
import { publicImageUrl } from '../services/uploads/imageUpload.service.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { ApiError } from '../utils/ApiError.js'

const certificateStorage = new S3StorageProvider(env.S3_BUCKET_MATERIALS)

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

/** What a signed-in owner or admin may see. Still no pdfKey — see below. */
function toDetail(certificate, now = new Date()) {
  const revoked = Boolean(certificate.revokedAt)
  const expired = Boolean(certificate.validUntil && certificate.validUntil < now)
  return {
    id: String(certificate._id),
    serial: certificate.serial,
    fullName: certificate.fullName,
    title: certificate.sourceTitle,
    sourceType: certificate.sourceType,
    sourceId: certificate.sourceId ? String(certificate.sourceId) : null,
    score: certificate.score ?? '',
    issuedAt: certificate.issuedAt,
    validUntil: certificate.validUntil,
    status: revoked ? 'REVOKED' : expired ? 'EXPIRED' : 'VALID',
    revokedAt: certificate.revokedAt ?? null,
    revokedReason: certificate.revokedReason ?? '',
    // Whether a download exists, not where it is. The storage key never
    // leaves the server: it is a bucket path, and handing it out invites
    // somebody to try the next one.
    hasPdf: Boolean(certificate.pdfKey) && !revoked,
  }
}

function withBackgroundUrl(template) {
  return { ...template, backgroundUrl: publicImageUrl(template.backgroundKey) }
}

export const certificateController = {
  listMine: asyncHandler(async (req, res) => {
    const rows = await certificateService.listForUser(req.user.id)
    sendSuccess(res, { items: rows.map((row) => toDetail(row)) })
  }),

  list: asyncHandler(async (req, res) => {
    const { status, search, limit, cursor } = req.validatedQuery
    const { items, nextCursor } = await certificateService.list({
      // null means unscoped; an array is the complete allow-list. Passed
      // straight through so this endpoint cannot show a manager somebody
      // they are not allowed to see people-data for (2.2).
      scopedUserIds: req.scopedUserIds ?? null,
      status,
      search,
      limit,
      cursor,
    })
    sendSuccess(res, { items: items.map((row) => toDetail(row)), nextCursor })
  }),

  /**
   * Hands back a short-lived signed URL rather than proxying the bytes.
   *
   * The PDF sits in the private materials bucket; five minutes is long
   * enough for a browser to follow the redirect and short enough that a URL
   * pasted into a chat is dead by the time anyone reads it.
   */
  download: asyncHandler(async (req, res) => {
    const certificate = await Certificate.findById(req.params.id).lean()
    if (!certificate) throw ApiError.notFound('Certificate not found')

    // Owner, or somebody with the read-all permission the route already
    // checked. A scoped admin is fenced the same way the list is.
    const isOwner = String(certificate.userId) === String(req.user.id)
    if (!isOwner) {
      const allowed = req.scopedUserIds ?? null
      const canSeeAll = req.user.permissions?.includes('certificate:read:all')
      const withinScope = allowed ? allowed.some((id) => String(id) === String(certificate.userId)) : true
      if (!canSeeAll || !withinScope) throw ApiError.forbidden('Not your certificate')
    }

    // A revoked certificate has no download. The record stays so the QR
    // still answers "this was withdrawn", but handing out the PDF would let
    // it keep circulating as if it were live.
    if (certificate.revokedAt) throw ApiError.forbidden('This certificate has been revoked')

    let { pdfKey } = certificate
    if (!pdfKey) {
      // The render job failed or has not run yet. Drawing it now costs one
      // request a second rather than telling the owner their certificate
      // does not exist when it plainly does.
      pdfKey = await certificateRenderService.render(certificate)
      await Certificate.updateOne({ _id: certificate._id }, { $set: { pdfKey } })
    }

    const url = await certificateStorage.getSignedUrl(
      pdfKey,
      DOWNLOAD_URL_TTL_SECONDS,
      `${certificate.serial}.pdf`
    )
    sendSuccess(res, { url, expiresIn: DOWNLOAD_URL_TTL_SECONDS })
  }),

  revoke: asyncHandler(async (req, res) => {
    const certificate = await certificateService.revoke(req.user, req.params.id, req.body.reason)
    if (!certificate) throw ApiError.notFound('Certificate not found')
    sendSuccess(res, { certificate: toDetail(certificate.toObject ? certificate.toObject() : certificate) })
  }),

  listTemplates: asyncHandler(async (_req, res) => {
    const items = await CertificateTemplate.find().sort({ isDefault: -1, createdAt: -1 }).lean()
    // The editor draws the background behind the draggable fields, so it
    // needs a URL, not the key it stores. Resolved here rather than in the
    // frontend so there is one copy of "where the images bucket lives".
    sendSuccess(res, { items: items.map(withBackgroundUrl) })
  }),

  createTemplate: asyncHandler(async (req, res) => {
    if (req.body.isDefault) await CertificateTemplate.updateMany({}, { $set: { isDefault: false } })
    const template = await CertificateTemplate.create({ ...req.body, createdBy: req.user.id })
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'CERTIFICATE_TEMPLATE_CREATED',
      entity: 'CertificateTemplate',
      entityId: template._id.toString(),
      metadata: { name: template.name },
    })
    sendSuccess(res, { template: withBackgroundUrl(template.toObject()) }, 'Created', 201)
  }),

  updateTemplate: asyncHandler(async (req, res) => {
    // One default at a time, cleared before the write so a failed update
    // cannot leave the install with none.
    if (req.body.isDefault) {
      await CertificateTemplate.updateMany({ _id: { $ne: req.params.id } }, { $set: { isDefault: false } })
    }
    const template = await CertificateTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    )
    if (!template) throw ApiError.notFound('Template not found')
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'CERTIFICATE_TEMPLATE_UPDATED',
      entity: 'CertificateTemplate',
      entityId: template._id.toString(),
      metadata: { fields: Object.keys(req.body) },
    })
    sendSuccess(res, { template: withBackgroundUrl(template.toObject()) })
  }),

  deleteTemplate: asyncHandler(async (req, res) => {
    // Refused while a certificate still points at it: the row records which
    // design produced it, and orphaning that turns a re-render into a
    // different-looking certificate for the same serial.
    const inUse = await Certificate.countDocuments({ templateId: req.params.id })
    if (inUse > 0) {
      throw ApiError.badRequest(
        'This template has already issued certificates and cannot be deleted',
        'TEMPLATE_IN_USE'
      )
    }
    const template = await CertificateTemplate.findByIdAndDelete(req.params.id)
    if (!template) throw ApiError.notFound('Template not found')
    await auditLogRepository.record({
      actor: req.user.id,
      action: 'CERTIFICATE_TEMPLATE_DELETED',
      entity: 'CertificateTemplate',
      entityId: String(req.params.id),
      metadata: { name: template.name },
    })
    sendSuccess(res, { deleted: true })
  }),

  /**
   * The public check (AT-12). No auth, no session, no PII beyond the name
   * already printed on the paper the enquirer is holding.
   *
   * A miss is a plain 404 with no hint about whether the serial is malformed
   * or merely unknown — the difference is exactly what an enumeration script
   * would use to steer.
   */
  verify: asyncHandler(async (req, res) => {
    const certificate = await certificateService.findBySerial(req.params.serial)
    const view = certificateService.toPublicVerification(certificate)
    if (!view) throw ApiError.notFound('Certificate not found', 'CERTIFICATE_NOT_FOUND')
    sendSuccess(res, { certificate: view })
  }),
}

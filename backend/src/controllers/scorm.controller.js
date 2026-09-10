import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { scormPackageService } from '../services/scorm/scormPackage.service.js'
import { scormRuntimeService } from '../services/scorm/scormRuntime.service.js'
import { renderScormPlayer } from '../services/scorm/scormPlayerPage.js'
import { verifyLaunchToken } from '../services/scorm/scormToken.js'
import { userRepository } from '../repositories/user.repository.js'

export const scormController = {
  listByTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.listByTopic(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.upload(req.user, req.params.id, req.body, req.file), 'Package uploaded', 201)
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.getById(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.update(req.user, req.params.id, req.body), 'Package updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await scormPackageService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Package deleted')
  }),

  reprocess: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.reprocess(req.user, req.params.id), 'Package queued again')
  }),

  launch: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.launch(req.user, req.params.id))
  }),

  progress: asyncHandler(async (req, res) => {
    sendSuccess(res, await scormPackageService.progressFor(req.user.id, req.params.id))
  }),

  /**
   * The launcher page, served from the API's own origin so that
   * `window.parent.API` is legal for the content inside it (see
   * scormPlayerPage.js). Authorised by the token in the path, because a
   * browser attaches no Authorization header to an iframe.
   */
  player: asyncHandler(async (req, res) => {
    const { userId } = verifyLaunchToken(req.params.token, req.params.id)
    const user = await userRepository.findById(userId)
    const context = await scormPackageService.playerContext(req.params.id, userId, user?.fullName ?? '')

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Never cached: the page carries a token and the learner's own state.
    res.setHeader('Cache-Control', 'no-store')
    res.send(
      renderScormPlayer({
        packageId: req.params.id,
        token: context.token,
        version: context.version,
        launchUrl: context.launchUrl,
        statePath: context.statePath,
        learner: context.learner,
        state: context.state,
        masteryScore: context.masteryScore,
      })
    )
  }),

  /**
   * One file out of the package. The token sits in the path rather than the
   * query so the content's own relative links keep carrying it.
   */
  file: asyncHandler(async (req, res) => {
    verifyLaunchToken(req.params.token, req.params.id)
    const { body, contentType } = await scormPackageService.openFile(req.params.id, req.params[0])

    res.setHeader('Content-Type', contentType)
    // A package's files are immutable once extracted — the prefix contains
    // the package id — so the browser may keep them for the sitting. Private
    // because the URL is only valid with this learner's token in it.
    res.setHeader('Cache-Control', 'private, max-age=3600')
    body.pipe(res)
  }),

  readState: asyncHandler(async (req, res) => {
    const { userId } = verifyLaunchToken(req.query.token, req.params.id)
    const row = await scormPackageService.byId(req.params.id)
    const state = await scormRuntimeService.load(userId, row)
    sendSuccess(res, { cmi: state.cmi ?? {}, completionStatus: state.completionStatus, successStatus: state.successStatus })
  }),

  writeState: asyncHandler(async (req, res) => {
    const { userId } = verifyLaunchToken(req.query.token, req.params.id)
    const row = await scormPackageService.byId(req.params.id)
    const state = await scormRuntimeService.commit(userId, row, req.body)
    sendSuccess(res, {
      completionStatus: state.completionStatus,
      successStatus: state.successStatus,
      scoreRaw: state.scoreRaw,
      completed: Boolean(state.completedAt),
    })
  }),
}

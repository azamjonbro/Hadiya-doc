import { orgHierarchyService } from '../services/org/orgHierarchy.service.js'
import { birthdaysService } from '../services/org/birthdays.service.js'
import { directoryService } from '../services/org/directory.service.js'
import { userRepository } from '../repositories/user.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { PERMISSIONS } from '@lms/shared'

// Anyone may look at their own line and their own reports; seeing someone
// else's subtree is a read of other people's data and needs user:read.
function assertMayView(actor, targetId) {
  if (String(actor.id) === String(targetId)) return
  if (actor.permissions?.includes(PERMISSIONS.USER_READ)) return
  throw ApiError.forbidden('You can only view your own place in the hierarchy')
}

export const orgController = {
  /**
   * Where the caller (or a named user) sits: the managers above them and
   * their direct reports. This is the "my team" question, and the answer
   * fits on a screen — unlike the chart below.
   */
  hierarchy: asyncHandler(async (req, res) => {
    const targetId = req.query.userId ?? req.user.id
    assertMayView(req.user, targetId)

    const user = await userRepository.findById(String(targetId))
    if (!user) throw ApiError.notFound('User not found')

    const [managers, reports] = await Promise.all([
      orgHierarchyService.managerChain(user._id),
      orgHierarchyService.directReports(user._id),
    ])

    sendSuccess(res, {
      user: { id: user._id.toString(), fullName: user.fullName, position: user.position ?? '' },
      // Nearest manager first, so a client can render "reports to X, who
      // reports to Y" without re-sorting.
      managers: managers.map((row) => ({
        id: String(row._id),
        fullName: row.fullName,
        position: row.position ?? '',
        depth: row.depth,
      })),
      reports: reports.map((row) => ({
        id: String(row._id),
        fullName: row.fullName,
        position: row.position ?? '',
        department: row.department ?? '',
        avatar: row.avatar ?? '',
      })),
    })
  }),

  /**
   * The whole subtree under someone, nested.
   *
   * Defaults to the roots of the organisation, which is what an admin
   * opening the chart wants. Anyone without user:read gets their own
   * subtree, which is the only one they are entitled to.
   */
  chart: asyncHandler(async (req, res) => {
    const canSeeEveryone = req.user.permissions?.includes(PERMISSIONS.USER_READ)
    if (req.query.rootId) {
      assertMayView(req.user, req.query.rootId)
      sendSuccess(res, { roots: [await orgHierarchyService.subtree(req.query.rootId)] })
      return
    }

    if (!canSeeEveryone) {
      sendSuccess(res, { roots: [await orgHierarchyService.subtree(req.user.id)] })
      return
    }

    const roots = await orgHierarchyService.roots()
    const trees = []
    for (const root of roots) {
      trees.push(await orgHierarchyService.subtree(root._id))
    }
    sendSuccess(res, { roots: trees })
  }),

  // Colleagues' birthdays around today (portal §9). Open to every employee,
  // like the chat directory: names and departments are already shared, and
  // the year is not in the answer.
  birthdays: asyncHandler(async (req, res) => {
    sendSuccess(res, await birthdaysService.around())
  }),

  // The employee directory and the head-count tree (portal §8). Same
  // reasoning as birthdays: nothing here is beyond what the chat contacts
  // list already shows every employee.
  directory: asyncHandler(async (req, res) => {
    sendSuccess(res, await directoryService.list(req.validatedQuery))
  }),

  structure: asyncHandler(async (req, res) => {
    sendSuccess(res, await directoryService.structure())
  }),
}

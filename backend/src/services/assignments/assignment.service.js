import { Assignment } from '../../models/assignment.model.js'
import { Submission } from '../../models/submission.model.js'
import { Rubric } from '../../models/rubric.model.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { ApiError } from '../../utils/ApiError.js'
import { toPublicAssignment } from './submission.service.js'

/** Authoring homework, and the rubrics it is marked against. */
export const assignmentService = {
  async list({ courseId, topicId } = {}) {
    const filter = {}
    if (courseId) filter.courseId = courseId
    if (topicId) filter.topicId = topicId
    const rows = await Assignment.find(filter).sort({ order: 1, createdAt: 1 }).lean()

    // The counts a reviewer looks for before opening anything: how much is
    // waiting, and how much is done.
    const counts = await Submission.aggregate([
      { $match: { assignmentId: { $in: rows.map((row) => row._id) } } },
      { $group: { _id: { assignmentId: '$assignmentId', status: '$status' }, count: { $sum: 1 } } },
    ])
    const byAssignment = new Map()
    for (const row of counts) {
      const key = String(row._id.assignmentId)
      const entry = byAssignment.get(key) ?? { submitted: 0, graded: 0 }
      if (row._id.status === 'SUBMITTED') entry.submitted += row.count
      if (row._id.status === 'GRADED') entry.graded += row.count
      byAssignment.set(key, entry)
    }

    return {
      items: rows.map((row) => ({
        ...toPublicAssignment(row),
        ...(byAssignment.get(String(row._id)) ?? { submitted: 0, graded: 0 }),
      })),
    }
  },

  async create(actor, payload) {
    const assignment = await Assignment.create({ ...payload, createdBy: actor.id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSIGNMENT_CREATED',
      entity: 'Assignment',
      entityId: assignment._id.toString(),
      metadata: { title: assignment.title, courseId: String(assignment.courseId) },
    })
    return toPublicAssignment(assignment.toObject())
  },

  async update(actor, id, payload) {
    const assignment = await Assignment.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedBy: actor.id } },
      { new: true, runValidators: true }
    )
    if (!assignment) throw ApiError.notFound('Assignment not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSIGNMENT_UPDATED',
      entity: 'Assignment',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    // Changing the due date does not restamp anybody's `late` flag. That
    // was decided when the work was handed in, and rewriting it now would
    // change a fact about the past by editing the future.
    return toPublicAssignment(assignment.toObject())
  },

  /**
   * Deleting one is refused once anybody has handed work in.
   *
   * The submissions are somebody's work and their mark for it; dropping the
   * assignment would orphan both.
   */
  async remove(actor, id) {
    const submissions = await Submission.countDocuments({ assignmentId: id, status: { $ne: 'DRAFT' } })
    if (submissions > 0) {
      throw ApiError.badRequest(
        `${submissions} submission(s) have been handed in — unpublish it instead of deleting it`,
        'ASSIGNMENT_HAS_SUBMISSIONS'
      )
    }
    const assignment = await Assignment.findByIdAndDelete(id)
    if (!assignment) throw ApiError.notFound('Assignment not found')
    // Drafts go with it: an unsubmitted draft on a deleted assignment is
    // unreachable either way.
    await Submission.deleteMany({ assignmentId: id })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'ASSIGNMENT_DELETED',
      entity: 'Assignment',
      entityId: String(id),
      metadata: { title: assignment.title },
    })
    return { deleted: true }
  },

  async listRubrics() {
    const items = await Rubric.find().sort({ name: 1 }).lean()
    return {
      items: items.map((rubric) => ({
        id: String(rubric._id),
        name: rubric.name,
        description: rubric.description ?? '',
        criteria: rubric.criteria.map((criterion) => ({
          id: String(criterion._id),
          label: criterion.label,
          description: criterion.description ?? '',
          maxScore: criterion.maxScore,
          levels: criterion.levels ?? [],
        })),
        // The rubric's own total, so the editor can warn when it does not
        // match the assignment's maxScore.
        totalScore: rubric.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0),
      })),
    }
  },

  async createRubric(actor, payload) {
    const rubric = await Rubric.create({ ...payload, createdBy: actor.id })
    return { id: String(rubric._id), name: rubric.name }
  },

  async removeRubric(actor, id) {
    const inUse = await Assignment.countDocuments({ rubricId: id })
    if (inUse > 0) {
      throw ApiError.badRequest(`${inUse} assignment(s) are marked with this rubric`, 'RUBRIC_IN_USE')
    }
    const rubric = await Rubric.findByIdAndDelete(id)
    if (!rubric) throw ApiError.notFound('Rubric not found')
    return { deleted: true }
  },
}

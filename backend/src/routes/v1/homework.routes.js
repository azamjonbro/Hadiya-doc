import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { assignmentController } from '../../controllers/assignment.controller.js'
import {
  createAssignmentSchema,
  updateHomeworkSchema,
  submitWorkSchema,
  gradeSubmissionSchema,
  createRubricSchema,
  listAssignmentsQuerySchema,
  gradingQueueQuerySchema,
} from '../../validators/assignment.validator.js'

/**
 * Homework.
 *
 * Its own file rather than an addition to assignments.routes.js, which is
 * course-to-person assignment and has nothing to do with this. The naming
 * collision comes from the spec (§6.3); the three meanings of "assignment"
 * in this codebase are spelled out in assignment.model.js.
 */
export const homeworkRouter = Router()

homeworkRouter.use(authenticate)

// --- The reviewer's side. Declared first: 'queue', 'submissions' and
// 'rubrics' are literal segments and must not be read as assignment ids.
homeworkRouter.get(
  '/queue',
  requirePermission(PERMISSIONS.QUIZ_GRADE),
  validateQuery(gradingQueueQuerySchema),
  assignmentController.queue
)
homeworkRouter.get('/submissions/:submissionId', assignmentController.submission)
homeworkRouter.post(
  '/submissions/:submissionId/grade',
  requirePermission(PERMISSIONS.QUIZ_GRADE),
  validateBody(gradeSubmissionSchema),
  assignmentController.grade
)

homeworkRouter.get('/rubrics', requirePermission(PERMISSIONS.QUIZ_GRADE), assignmentController.listRubrics)
homeworkRouter.post(
  '/rubrics',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(createRubricSchema),
  assignmentController.createRubric
)
homeworkRouter.delete('/rubrics/:id', requirePermission(PERMISSIONS.COURSE_UPDATE), assignmentController.removeRubric)

// --- Authoring.
homeworkRouter.get(
  '/',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(listAssignmentsQuerySchema),
  assignmentController.list
)
homeworkRouter.post(
  '/',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(createAssignmentSchema),
  assignmentController.create
)
homeworkRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateHomeworkSchema),
  assignmentController.update
)
homeworkRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_UPDATE), assignmentController.remove)

// --- The learner's side. No permission beyond being signed in: handing in
// your own work is not an administrative act.
homeworkRouter.get('/:id/mine', assignmentController.mine)
homeworkRouter.post('/:id/draft', validateBody(submitWorkSchema), assignmentController.saveDraft)
homeworkRouter.post('/:id/submit', validateBody(submitWorkSchema), assignmentController.submit)

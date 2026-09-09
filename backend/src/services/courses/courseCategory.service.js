import { CourseCategory } from '../../models/courseCategory.model.js'
import { courseRepository } from '../../repositories/course.repository.js'
import { auditLogRepository } from '../../repositories/auditLog.repository.js'
import { slugify } from '../../utils/slugify.js'
import { ApiError } from '../../utils/ApiError.js'

function toPublic(category, courseCount = undefined) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    color: category.color,
    parentId: category.parentId ? category.parentId.toString() : null,
    order: category.order ?? 0,
    ...(courseCount === undefined ? {} : { courseCount }),
  }
}

async function uniqueSlugFor(name) {
  const base = slugify(name)
  let slug = base
  let counter = 2
  while (await CourseCategory.findOne({ slug })) {
    slug = `${base}-${counter}`
    counter += 1
  }
  return slug
}

export const courseCategoryService = {
  /**
   * The catalog's category list, each with how many courses sit in it.
   *
   * The count is here rather than left to the client because the filter is
   * unusable without it: a category with nothing in it looks like a broken
   * filter when clicking it returns an empty page.
   */
  async list() {
    const categories = await CourseCategory.find().sort({ order: 1, name: 1 }).lean()
    const counts = await Promise.all(categories.map((category) => courseRepository.countByCategory(category._id)))
    return { items: categories.map((category, index) => toPublic(category, counts[index])) }
  },

  async create(actor, payload) {
    const category = await CourseCategory.create({
      ...payload,
      slug: await uniqueSlugFor(payload.name),
      createdBy: actor.id,
    })
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_CATEGORY_CREATED',
      entity: 'CourseCategory',
      entityId: category._id.toString(),
      metadata: { name: category.name },
    })
    return toPublic(category)
  },

  async update(actor, id, payload) {
    const category = await CourseCategory.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true })
    if (!category) throw ApiError.notFound('Category not found')
    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_CATEGORY_UPDATED',
      entity: 'CourseCategory',
      entityId: id,
      metadata: { fields: Object.keys(payload) },
    })
    return toPublic(category)
  },

  /**
   * Deleting a category leaves its courses uncategorised rather than
   * refusing or cascading.
   *
   * Refusing would strand the operator: the only way out is to re-file
   * forty courses by hand before they can drop a category made by mistake.
   * Cascading would delete the courses, which is obviously wrong. Clearing
   * the reference is the only option that loses nothing.
   */
  async remove(actor, id) {
    const category = await CourseCategory.findById(id)
    if (!category) throw ApiError.notFound('Category not found')

    const cleared = await courseRepository.clearCategory(id)
    await CourseCategory.updateMany({ parentId: id }, { $set: { parentId: null } })
    await CourseCategory.deleteOne({ _id: id })

    await auditLogRepository.record({
      actor: actor.id,
      action: 'COURSE_CATEGORY_DELETED',
      entity: 'CourseCategory',
      entityId: id,
      metadata: { name: category.name, coursesUncategorised: cleared },
    })
    return { deleted: true, coursesUncategorised: cleared }
  },
}

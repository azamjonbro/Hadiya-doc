import { Schema, model } from 'mongoose'

/**
 * A project: a folder for learning materials (the reference's «Проекты»).
 *
 * Courses used to live in one flat library, and once three teams were
 * authoring at the same time nobody could tell whose draft was whose. A
 * project is the container that keeps them apart — the sales team's courses
 * in one, the jewellery department's in another. It owns nothing else: a
 * course keeps its own targeting, status and assignments whichever project
 * it sits in, and moving it between projects changes none of that.
 *
 * Membership is who *works* in the folder, not who can *learn* from it.
 * VIEW members see the project's materials in the admin library; EDIT
 * members may also add to it. Learners never see projects at all.
 */
const memberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    access: { type: String, enum: ['VIEW', 'EDIT'], default: 'EDIT' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },
    // The owner is a member too, implicitly and permanently: the one person
    // who cannot be removed from the list and the only one (besides an
    // admin) who may rename or delete the project.
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

projectSchema.index({ ownerId: 1 })
projectSchema.index({ 'members.userId': 1 })

export const Project = model('Project', projectSchema)

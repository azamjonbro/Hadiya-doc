// Projects — folders for the admin library (project.model.js).
//
// Three things hold the feature together, and each is pinned here:
//
//   1. **Visibility is membership.** An author sees the projects they own
//      or were added to and nothing else; an admin sees the lot. A folder
//      list that leaked other teams' drafts would defeat the point of
//      having folders.
//   2. **Only the owner (or an admin) changes the folder.** An EDIT member
//      may file courses into it; renaming, deleting and the member list are
//      the owner's. A VIEW member may not even file.
//   3. **Deleting a folder releases its courses.** They fall back into the
//      general library, assignments intact — the one failure mode that must
//      never happen is a course vanishing because someone tidied up.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Project } from '../src/models/project.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { projectService } from '../src/services/projects/project.service.js'
import { courseRepository } from '../src/repositories/course.repository.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const userIds = []
const projectIds = []
const courseIds = []

let owner
let editor
let viewer
let stranger

const admin = () => ({ id: owner._id.toString(), permissions: ['course:read', 'course:create', 'course:delete'] })
const asAuthor = (user) => ({ id: user._id.toString(), permissions: ['course:read', 'course:create'] })

async function makeUser(name) {
  const role = (await Role.findOne({ name: 'EMPLOYEE' })) ?? (await Role.findOne())
  assert.ok(role, 'roles are missing — boot the server once')
  const [firstName, lastName] = name.split(' ')
  const user = await User.create({
    firstName,
    lastName,
    fullName: name,
    jshshir: `2${stamp}${String(userIds.length).padStart(4, '0')}`.slice(0, 14),
    passwordHash: await hashPassword('ProjectTest123!'),
    roleId: role._id,
  })
  userIds.push(user._id)
  return user
}

async function makeCourse(title, projectId = null) {
  const course = await Course.create({
    title,
    slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${stamp}`,
    createdBy: owner._id,
    status: 'DRAFT',
    projectId,
  })
  courseIds.push(course._id)
  return course
}

describe('projects · library folders', () => {
  before(async () => {
    await connectDatabase()
    owner = await makeUser('Project Owner')
    editor = await makeUser('Project Editor')
    viewer = await makeUser('Project Viewer')
    stranger = await makeUser('Project Stranger')
  })

  after(async () => {
    await Course.deleteMany({ _id: { $in: courseIds } })
    await Project.deleteMany({ _id: { $in: projectIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    await redisConnection.quit()
  })

  test('a project made from "+" is named after its owner, like the reference', async () => {
    const project = await projectService.create(asAuthor(owner))
    projectIds.push(new mongoose.Types.ObjectId(project.id))
    assert.equal(project.name, 'Yangi loyiha (Project Owner)')
    assert.equal(project.access, 'OWNER')
    assert.equal(project.owner.fullName, 'Project Owner')
    assert.equal(project.members.length, 0)
  })

  describe('membership decides who sees it', () => {
    let project

    before(async () => {
      project = await projectService.create(asAuthor(owner), { name: `Sales ${stamp}` })
      projectIds.push(new mongoose.Types.ObjectId(project.id))
      project = await projectService.addMembers(asAuthor(owner), project.id, {
        userIds: [editor._id.toString(), viewer._id.toString()],
        access: 'EDIT',
      })
      project = await projectService.setMemberAccess(asAuthor(owner), project.id, viewer._id.toString(), 'VIEW')
    })

    test('the owner and members list it, a stranger does not, an admin always does', async () => {
      const names = async (actor) => (await projectService.list(actor)).map((p) => p.name)
      assert.ok((await names(asAuthor(owner))).includes(project.name))
      assert.ok((await names(asAuthor(editor))).includes(project.name))
      assert.ok((await names(asAuthor(viewer))).includes(project.name))
      assert.ok(!(await names(asAuthor(stranger))).includes(project.name))
      assert.ok((await names({ id: stranger._id.toString(), permissions: ['course:delete'] })).includes(project.name))
    })

    test('each person is told their own access', async () => {
      assert.equal((await projectService.getById(asAuthor(editor), project.id)).access, 'EDIT')
      assert.equal((await projectService.getById(asAuthor(viewer), project.id)).access, 'VIEW')
      await assert.rejects(projectService.getById(asAuthor(stranger), project.id), /Project not found/)
    })

    test('adding the same person again changes their access instead of duplicating the row', async () => {
      const updated = await projectService.addMembers(asAuthor(owner), project.id, {
        userIds: [viewer._id.toString()],
        access: 'EDIT',
      })
      const rows = updated.members.filter((m) => m.id === viewer._id.toString())
      assert.equal(rows.length, 1)
      assert.equal(rows[0].access, 'EDIT')
      await projectService.setMemberAccess(asAuthor(owner), project.id, viewer._id.toString(), 'VIEW')
    })

    test('an editor may file a course, a viewer may not, and only the owner renames', async () => {
      await projectService.assertCanFile(asAuthor(editor), project.id)
      await assert.rejects(projectService.assertCanFile(asAuthor(viewer), project.id), /only view/)
      await assert.rejects(projectService.rename(asAuthor(editor), project.id, 'Nope'), /owner/)
      const renamed = await projectService.rename(asAuthor(owner), project.id, `Sales team ${stamp}`)
      assert.equal(renamed.name, `Sales team ${stamp}`)
    })

    test('a member may leave; the owner may remove anyone', async () => {
      const left = await projectService.removeMember(asAuthor(viewer), project.id, viewer._id.toString())
      assert.ok(!left.members.some((m) => m.id === viewer._id.toString()))
      await assert.rejects(projectService.removeMember(asAuthor(stranger), project.id, editor._id.toString()), /owner/)
      await projectService.removeMember(asAuthor(editor), project.id, editor._id.toString())
      // Gone, so leaving twice has nothing to remove.
      await assert.rejects(projectService.removeMember(asAuthor(editor), project.id, editor._id.toString()), /Member not found/)
    })
  })

  describe('courses are filed, filtered, and released', () => {
    test('the list filter shows a project its own courses, and the general library the rest', async () => {
      const project = await projectService.create(asAuthor(owner), { name: `Filter ${stamp}` })
      projectIds.push(new mongoose.Types.ObjectId(project.id))
      const filed = await makeCourse(`Filed course ${stamp}`, project.id)
      const loose = await makeCourse(`Loose course ${stamp}`)

      const inProject = (await courseRepository.listPage({ projectId: project.id, limit: 50 })).map((r) => String(r._id))
      assert.deepEqual(inProject, [String(filed._id)])

      const unfiled = (await courseRepository.listPage({ projectId: 'none', search: `course ${stamp}`, limit: 50 })).map((r) =>
        String(r._id)
      )
      assert.ok(unfiled.includes(String(loose._id)))
      assert.ok(!unfiled.includes(String(filed._id)))

      // The general library must also still see a course written before the
      // field existed — stored with no projectId at all.
      const legacy = await Course.collection.insertOne({
        title: `Legacy course ${stamp}`,
        slug: `legacy-project-course-${stamp}`,
        status: 'DRAFT',
        createdBy: owner._id,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      courseIds.push(legacy.insertedId)
      const again = (await courseRepository.listPage({ projectId: 'none', search: `course ${stamp}`, limit: 50 })).map((r) =>
        String(r._id)
      )
      assert.ok(again.includes(String(legacy.insertedId)))

      // Deleting the folder returns its course to the general library.
      const result = await projectService.remove(admin(), project.id)
      assert.equal(result.coursesReleased, 1)
      const after = await Course.findById(filed._id)
      assert.equal(after.projectId, null)
      assert.equal(await Project.findById(project.id), null)
    })
  })
})

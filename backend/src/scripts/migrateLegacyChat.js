/**
 * One-off migration for the chat rework.
 *
 * The previous model stored one support thread per employee
 * (`{ employeeId }`, replied to by "any admin/manager"), which has no
 * equivalent under direct messaging: the staff side of those threads was a
 * shared pool, not a specific second participant, so the pair that a
 * `participants` document needs simply is not recorded anywhere.
 *
 * Rather than invent a counterpart, this pins each legacy thread to the
 * admin/manager who actually last replied in it. Threads where no staff
 * member ever replied have no counterpart at all and are reported, not
 * deleted — deciding to discard them is the operator's call, and the
 * `--drop-orphans` flag makes that explicit.
 *
 * Run with:
 *   npm --prefix backend run migrate:chat -- --dry-run   # report only
 *   npm --prefix backend run migrate:chat                # report + convert
 *   npm --prefix backend run migrate:chat -- --drop-orphans
 */
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { logger } from '../config/logger.js'
import { Conversation, participantsKeyFor } from '../models/conversation.model.js'
import { ChatMessage } from '../models/chatMessage.model.js'

const dropOrphans = process.argv.includes('--drop-orphans')
// Same flag, same spelling, same meaning as every other migration script:
// report what would change and write nothing (14.5). It covers the index
// drop too — dropping an index is a write, and a dry run that quietly
// rebuilt the collection's indexes would be lying about "nothing written".
const dryRun = process.argv.includes('--dry-run')

// The old schema's `employeeId` unique index survives a schema change —
// Mongoose creates indexes but never drops the ones it no longer declares.
// Left in place it is fatal rather than merely stale: new conversations
// have no employeeId at all, and a non-sparse unique index treats every
// missing field as the same null, so the *second* direct conversation ever
// created would fail with a duplicate key error.
async function dropStaleIndexes() {
  const indexes = await Conversation.collection.indexes()
  for (const index of indexes) {
    if (index.name === 'employeeId_1') {
      if (dryRun) {
        logger.info('[dry-run] would drop stale index conversations.employeeId_1')
        continue
      }
      await Conversation.collection.dropIndex(index.name)
      logger.info('Dropped stale index conversations.employeeId_1')
    }
  }
}

async function main() {
  await connectDatabase()
  await dropStaleIndexes()

  const legacy = await Conversation.find({ participantsKey: { $exists: false } }).lean()
  if (!legacy.length) {
    logger.info('No legacy conversations found — nothing to migrate')
    return
  }

  logger.info(`Found ${legacy.length} legacy conversation(s)`)

  let converted = 0
  const orphans = []

  for (const conversation of legacy) {
    const employeeId = conversation.employeeId
    if (!employeeId) {
      orphans.push(conversation._id)
      continue
    }

    // The staff counterpart is whoever last wrote in the thread who was
    // not the employee — the only record of a specific second person.
    const staffReply = await ChatMessage.findOne({
      conversationId: conversation._id,
      senderId: { $ne: employeeId },
    })
      .sort({ createdAt: -1 })
      .lean()

    if (!staffReply) {
      orphans.push(conversation._id)
      continue
    }

    const staffId = staffReply.senderId
    const participantsKey = participantsKeyFor(employeeId, staffId)

    // A pair may already exist if the same two people also have a thread
    // created under the new model; keep the new one and fold the old
    // messages into it rather than violating the unique index.
    const existing = await Conversation.findOne({ participantsKey })
    if (existing && String(existing._id) !== String(conversation._id)) {
      converted += 1
      if (dryRun) continue
      await ChatMessage.updateMany(
        { conversationId: conversation._id },
        { $set: { conversationId: existing._id } }
      )
      await Conversation.deleteOne({ _id: conversation._id })
      continue
    }

    converted += 1
    if (dryRun) continue
    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          type: 'DIRECT',
          participants: [employeeId, staffId],
          participantsKey,
          reads: [
            { userId: employeeId, readAt: conversation.employeeLastReadAt ?? null },
            { userId: staffId, readAt: conversation.staffLastReadAt ?? null },
          ],
          lastMessageKind: 'TEXT',
        },
        $unset: { employeeId: '', employeeLastReadAt: '', staffLastReadAt: '' },
      }
    )
  }

  logger.info(`${dryRun ? '[dry-run] would convert' : 'Converted'} ${converted} conversation(s)`)

  if (orphans.length) {
    if (dropOrphans && dryRun) {
      logger.info(`[dry-run] would drop ${orphans.length} conversation(s) with no staff counterpart`)
    } else if (dropOrphans) {
      await ChatMessage.deleteMany({ conversationId: { $in: orphans } })
      await Conversation.deleteMany({ _id: { $in: orphans } })
      logger.info(`Dropped ${orphans.length} conversation(s) with no staff counterpart`)
    } else {
      logger.warn(
        `${orphans.length} conversation(s) have no staff reply and cannot be converted. ` +
          'They will keep the unique index on participantsKey from building. ' +
          'Re-run with --drop-orphans to remove them.',
        { ids: orphans.map(String) }
      )
    }
  }

  if (dryRun) logger.info('--dry-run: nothing written')
}

main()
  .catch((error) => {
    logger.error('Chat migration failed', { error: error instanceof Error ? error.message : error })
    process.exitCode = 1
  })
  .finally(() => mongoose.connection.close())

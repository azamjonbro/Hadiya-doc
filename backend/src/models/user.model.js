import { Schema, model } from 'mongoose'

// An employee is identified by the document they already carry: the JSHSHIR is
// the canonical handle, the passport series is an equivalent alternative to
// type at the login screen. Both replace the old free-text `username`.
//
// `passportSeries` and `email` are optional, so their uniqueness is enforced by
// a *partial* index rather than `sparse`: a sparse index still stores explicit
// nulls, which would make the second employee without an email collide with the
// first. The partial filter indexes only documents where the field is a string.
const userSchema = new Schema(
  {
    // The two halves an admin actually types. `fullName` stays because every
    // list, report, chat header and export in the app reads it; it is composed
    // from these two on write (see composeFullName in @lms/shared) rather than
    // being a third thing anyone can edit.
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    fullName: { type: String, required: true, trim: true },
    jshshir: { type: String, required: true, unique: true, trim: true },
    passportSeries: { type: String, default: undefined, trim: true, uppercase: true },
    email: { type: String, default: undefined, trim: true, lowercase: true },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    // Which office the employee belongs to — a separate axis from
    // `department`. A branch is *where* ("Toshkent"), a department is *what*
    // ("Marketing"), and a course can target either or both.
    branch: { type: String, default: '' },
    department: { type: String, default: '' },
    // Below the department in the org chart — a department is "Marketing", a
    // subdivision is the team inside it. Stored by name for the same reason
    // branch and department are: the curated list exists to keep spellings
    // consistent, not to own the value.
    subdivision: { type: String, default: '' },
    position: { type: String, default: '' },
    country: { type: String, default: '' },
    address: { type: String, default: '' },
    gender: { type: String, enum: ['MALE', 'FEMALE', ''], default: '' },
    birthDate: { type: Date, default: null },
    hireDate: { type: Date, default: null },
    // Set when someone leaves. It is what archives the account: the service
    // deactivates on write, so "left the company" and "cannot sign in" cannot
    // disagree. Optional — an employee who is still here simply has none.
    terminationDate: { type: Date, default: null },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },

    // Which language this person is written to in. Separate from whatever
    // the browser is set to: a notification is composed on the server, often
    // hours later by a cron job with no browser anywhere in sight.
    locale: { type: String, enum: ['uz', 'ru', 'en'], default: 'uz' },

    // Only the channels this person has actually switched off, keyed by
    // notification type: { COURSE_ASSIGNED: { email: false } }.
    //
    // Not a full matrix of every type × channel. That would be rows that all
    // say the same thing, and it goes stale the moment a type is added —
    // every existing user would be missing the new row and the code would
    // have to guess whether missing means on or off. Storing deviations makes
    // a new type default to on for everyone, which is what we want. See
    // isChannelEnabled in @lms/shared.
    // Mixed rather than a Map-of-Maps: Mongoose does not nest Maps cleanly,
    // and the shape is validated where it is written (the zod schema on
    // PUT /users/me/notification-prefs) rather than by the ODM.
    //
    // An empty object is stripped on save (Mongoose's `minimize`), so a
    // fresh account has no field at all while a migrated one has `{}`. Both
    // mean the same thing and every reader goes through isChannelEnabled,
    // which treats absent as "nothing switched off" — the design already
    // depends on that, so the two states are not worth reconciling.
    notificationPrefs: { type: Schema.Types.Mixed, default: () => ({}) },

    // Set when the employee links their Telegram account (1.8). Null means
    // not linked, which is the only state that exists until then.
    telegramChatId: { type: String, default: null },
  },
  { timestamps: true }
)

userSchema.index(
  { passportSeries: 1 },
  { unique: true, partialFilterExpression: { passportSeries: { $type: 'string' } } }
)
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })

export const User = model('User', userSchema)

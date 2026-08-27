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
  },
  { timestamps: true }
)

userSchema.index(
  { passportSeries: 1 },
  { unique: true, partialFilterExpression: { passportSeries: { $type: 'string' } } }
)
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })

export const User = model('User', userSchema)

# 10–16. MATRITSALAR

---

# 10. PERMISSIONS MATRITSASI

## 10.1 Yangi ruxsat kalitlari

Mavjud 24 kalit **saqlanadi**. Quyidagilar qo'shiladi
(`packages/shared/permissions.js`):

```js
// Learning paths
PATH_CREATE: 'path:create',        PATH_READ:   'path:read',
PATH_UPDATE: 'path:update',        PATH_DELETE: 'path:delete',
PATH_ASSIGN: 'path:assign',

// Sertifikatlar
CERTIFICATE_TEMPLATE_MANAGE: 'certificate:template:manage',
CERTIFICATE_ISSUE:  'certificate:issue',    // qo'lda berish
CERTIFICATE_REVOKE: 'certificate:revoke',
CERTIFICATE_READ_OWN: 'certificate:read:own',
CERTIFICATE_READ_ALL: 'certificate:read:all',

// Savollar / testlar
QUESTION_BANK_MANAGE: 'question:bank:manage',
QUIZ_MANAGE: 'quiz:manage',       QUIZ_TAKE: 'quiz:take',
QUIZ_STATS_VIEW: 'quiz:stats:view',

// Topshiriqlar
ASSIGNMENT_MANAGE: 'assignment:manage',
ASSIGNMENT_SUBMIT: 'assignment:submit',
ASSIGNMENT_GRADE:  'assignment:grade',

// Live training
EVENT_MANAGE:   'event:manage',            // mavjud EVENT_CREATE dan kengroq
EVENT_REGISTER: 'event:register',
EVENT_ATTENDANCE_MARK: 'event:attendance:mark',

// Onboarding
ONBOARDING_MANAGE: 'onboarding:manage',
ONBOARDING_VIEW_TEAM: 'onboarding:view:team',

// Knowledge base
KB_READ: 'kb:read',               KB_CREATE: 'kb:create',
KB_UPDATE: 'kb:update',           KB_DELETE: 'kb:delete',
KB_REVIEW: 'kb:review',

// Kompetensiya / 360 / OJT / rivojlanish
COMPETENCY_MANAGE: 'competency:manage',
REVIEW360_MANAGE: 'review360:manage',   REVIEW360_RESPOND: 'review360:respond',
REVIEW360_VIEW_RESULTS: 'review360:view:results',
OJT_MANAGE: 'ojt:manage',               OJT_OBSERVE: 'ojt:observe',
PLAN_MANAGE: 'plan:manage',             PLAN_REVIEW: 'plan:review',
PLAN_READ_OWN: 'plan:read:own',

// Compliance / automation
COMPLIANCE_VIEW: 'compliance:view',
AUTOMATION_MANAGE: 'automation:manage',
REPORT_SCHEDULE: 'report:schedule',

// Media / sozlamalar / integratsiya
MEDIA_MANAGE: 'media:manage',
SETTINGS_MANAGE: 'settings:manage',
BRANDING_MANAGE: 'branding:manage',
API_KEY_MANAGE: 'apikey:manage',
WEBHOOK_MANAGE: 'webhook:manage',
SSO_MANAGE: 'sso:manage',

// AI
AI_GENERATE_CONTENT: 'ai:generate:content',
AI_TRANSLATE: 'ai:translate',

// Kontent tasdiqlash
CONTENT_REVIEW: 'content:review',
CONTENT_PUBLISH: 'content:publish',

// Org
ORG_HIERARCHY_MANAGE: 'org:hierarchy:manage',
TEAM_VIEW: 'team:view',           // manager scope'i
```

Jami: 24 (mavjud) + 45 (yangi) = **69 ruxsat kaliti**.

## 10.2 Rol × ruxsat matritsasi (seed default'lari)

`✔` = bor · `·` = yo'q · `~` = scope bilan cheklangan (o'z jamoasi / o'z kursi)

| Ruxsat guruhi | SUPER­ADMIN | ADMIN | MANAGER | MENTOR | AUTHOR | EMPLOYEE |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `user:create/update/delete` | ✔ | ✔ | ~ | · | · | · |
| `user:read` | ✔ | ✔ | ~ | ~ | · | · |
| `role:manage` | ✔ | · | · | · | · | · |
| `org:hierarchy:manage` | ✔ | ✔ | · | · | · | · |
| `team:view` | ✔ | ✔ | ✔ | ✔ | · | · |
| `course:create/update/delete` | ✔ | ✔ | · | · | ~ | · |
| `course:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `course:assign` | ✔ | ✔ | ~ | · | · | · |
| `path:create/update/delete` | ✔ | ✔ | · | · | ~ | · |
| `path:read` / `path:assign` | ✔ | ✔ | ✔/~ | ✔/· | ✔/· | ✔/· |
| `video:upload/manage` | ✔ | ✔ | ✔ | · | ✔ | · |
| `video:view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `question:bank:manage` / `quiz:manage` | ✔ | ✔ | · | · | ✔ | · |
| `quiz:take` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `quiz:stats:view` | ✔ | ✔ | ~ | ~ | ~ | · |
| `assignment:manage` | ✔ | ✔ | ~ | · | ✔ | · |
| `assignment:submit` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `assignment:grade` | ✔ | ✔ | ~ | ~ | ✔ | · |
| `certificate:template:manage` | ✔ | ✔ | · | · | · | · |
| `certificate:issue/revoke` | ✔ | ✔ | · | · | · | · |
| `certificate:read:own` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `certificate:read:all` | ✔ | ✔ | ~ | · | · | · |
| `event:manage` / `event:attendance:mark` | ✔ | ✔ | ~ | ~ | · | · |
| `event:read` / `event:register` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `onboarding:manage` | ✔ | ✔ | · | · | · | · |
| `onboarding:view:team` | ✔ | ✔ | ✔ | ✔ | · | · |
| `kb:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `kb:create/update` | ✔ | ✔ | · | · | ✔ | · |
| `kb:delete` / `kb:review` | ✔ | ✔ | · | · | · | · |
| `competency:manage` | ✔ | ✔ | · | · | · | · |
| `review360:manage` | ✔ | ✔ | · | · | · | · |
| `review360:respond` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `review360:view:results` | ✔ | ✔ | ~ | · | · | ~ (o'ziniki) |
| `ojt:manage` | ✔ | ✔ | ~ | · | · | · |
| `ojt:observe` | ✔ | ✔ | ✔ | ✔ | · | · |
| `plan:manage` / `plan:review` | ✔ | ✔ | ~ | ~ | · | · |
| `plan:read:own` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `news:create/manage` | ✔ | ✔ | ~/· | · | · | · |
| `news:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `task:create` / `task:manage:all` | ✔ | ✔ | ✔/~ | ✔/· | · | · |
| `task:read:own` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `analytics:view:all` | ✔ | ✔ | ~ | · | ~ | · |
| `analytics:view:own` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `report:export` / `report:schedule` | ✔ | ✔ | ~/· | · | · | · |
| `compliance:view` | ✔ | ✔ | ~ | · | · | · |
| `automation:manage` | ✔ | ✔ | · | · | · | · |
| `content:review` / `content:publish` | ✔ | ✔ | · | · | ·/~ | · |
| `media:manage` | ✔ | ✔ | · | · | ✔ | · |
| `settings:manage` / `branding:manage` | ✔ | · | · | · | · | · |
| `apikey:manage` / `webhook:manage` / `sso:manage` | ✔ | · | · | · | · | · |
| `audit:read` | ✔ | ✔ | · | · | · | · |
| `ai:generate:content` / `ai:translate` | ✔ | ✔ | · | · | ✔ | · |
| `ai:chat` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `chat:support` / `chat:group:manage` | ✔ | ✔ | ✔ | ✔ | · | · |
| `notification:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `proctor:view` (yangi) | ✔ | ✔ | ~ | · | · | · |
| `face:enroll:others` (yangi) | ✔ | · | · | · | · | · |

## 10.3 Scope qoidalari (`~` nimani anglatadi)

| Rol | Scope ta'rifi | Amalga oshirish |
|---|---|---|
| MANAGER | `managedUserIds` = `$graphLookup` bo'yicha `managerId` daraxti + o'z `department` (agar `managerId` hali to'ldirilmagan bo'lsa — fallback) | `scopeToManagedUsers.middleware.js`, 5 daq Redis kesh |
| MENTOR | Faqat `onboardingEnrollment.mentorId = self` bo'lgan xodimlar | Service ichida filtr |
| AUTHOR | Faqat `course.authorIds` yoki `createdBy` o'zi bo'lgan kurslar | Service ichida filtr |
| EMPLOYEE | Faqat o'zi (`actor.id === targetId`) | Mavjud naqsh (`quiz.service.getAttemptsForUser`) |

> ⚠️ **Amalga oshirish qoidasi (mavjud kodda buzilgan joyni tuzatadi):** har bir
> `~` scope **server tomonda** majburlanadi. Hozir `/bos` UI SUPERADMIN'ga
> yopiq, lekin ADMIN/MANAGER API'ni chaqira oladi — bu Phase 1 da yopiladi.

---

# 11. NOTIFICATION MATRITSASI

Kanallar: **IA** = in-app · **EM** = e-mail · **PU** = web push · **TG** = Telegram
`D` = default yoqilgan · `O` = ixtiyoriy (foydalanuvchi yoqadi) · `—` = mavjud emas

| # | Hodisa (`type`) | Kimga | IA | EM | PU | TG | Trigger joyi |
|---|---|---|:--:|:--:|:--:|:--:|---|
| 1 | `COURSE_ASSIGNED` ✅mavjud | Xodim | D | D | D | O | `courseAssignment.service.assign()` |
| 2 | `COURSE_DEADLINE_APPROACHING` ✅ | Xodim | D | D | D | O | `reminderJob` (7/3/1 kun) |
| 3 | `COURSE_OVERDUE` 🆕 | Xodim + rahbar | D | D | O | O | `reminderJob` |
| 4 | `COURSE_EXPIRED` ✅ | Xodim | D | D | — | — | `reminderJob` |
| 5 | `COURSE_COMPLETED` 🆕 | Xodim + rahbar | D | O | O | O | `course.service` completion hook |
| 6 | `PATH_ASSIGNED` 🆕 | Xodim | D | D | D | O | `pathEnrollment.service` |
| 7 | `PATH_DEADLINE_APPROACHING` 🆕 | Xodim | D | D | D | O | `reminderJob` |
| 8 | `PATH_COMPLETED` 🆕 | Xodim + rahbar | D | D | O | O | `pathProgress.service` |
| 9 | `QUIZ_PASSED` 🆕 | Xodim | D | O | O | O | `quiz.service.submit()` |
| 10 | `QUIZ_FAILED` 🆕 | Xodim | D | O | O | O | `quiz.service.submit()` |
| 11 | `QUIZ_ATTEMPTS_EXHAUSTED` 🆕 | Xodim + rahbar | D | D | O | O | `quiz.service.submit()` |
| 12 | `ASSIGNMENT_ASSIGNED` 🆕 | Xodim | D | D | D | O | `assignment.service` |
| 13 | `ASSIGNMENT_SUBMITTED` 🆕 | Tekshiruvchi | D | D | O | O | `submission.service` |
| 14 | `ASSIGNMENT_GRADED` 🆕 | Xodim | D | D | D | O | `grading.service` |
| 15 | `ASSIGNMENT_RETURNED` 🆕 | Xodim | D | D | D | O | `grading.service` |
| 16 | `TASK_ASSIGNED` ✅ | Xodim | D | D | D | O | `task.service` |
| 17 | `TASK_DEADLINE_APPROACHING` ✅ | Xodim | D | D | D | O | `reminderJob` |
| 18 | `TASK_OVERDUE` ✅ | Xodim + rahbar | D | D | O | O | `reminderJob` |
| 19 | `CERTIFICATE_ISSUED` 🆕 | Xodim | D | D | D | O | `certificateQueue` |
| 20 | `CERTIFICATE_EXPIRING` 🆕 | Xodim + rahbar | D | D | O | O | `complianceQueue` (30/7 kun) |
| 21 | `CERTIFICATE_EXPIRED` 🆕 | Xodim + rahbar + admin | D | D | O | O | `complianceQueue` |
| 22 | `CERTIFICATE_REVOKED` 🆕 | Xodim | D | D | — | — | `certificate.service` |
| 23 | `ONBOARDING_STARTED` 🆕 | Xodim + mentor + rahbar | D | D | D | O | `onboardingQueue` |
| 24 | `ONBOARDING_STEP_DUE` 🆕 | Xodim | D | D | D | O | `onboardingQueue` |
| 25 | `ONBOARDING_STEP_OVERDUE` 🆕 | Xodim + mentor | D | D | O | O | `onboardingQueue` |
| 26 | `ONBOARDING_COMPLETED` 🆕 | Rahbar + HR | D | D | — | — | `onboardingEnrollment.service` |
| 27 | `EVENT_INVITED` 🆕 | Ishtirokchi | D | D | D | O | `event.service` |
| 28 | `EVENT_REMINDER` 🆕 | Ro'yxatdagilar | D | D | D | D | `reminderJob` (`remindBeforeMinutes`) |
| 29 | `EVENT_RESCHEDULED` 🆕 | Ro'yxatdagilar | D | D | D | D | `event.service` diff |
| 30 | `EVENT_CANCELLED` 🆕 | Ro'yxatdagilar | D | D | D | D | `event.service` |
| 31 | `EVENT_WAITLIST_PROMOTED` 🆕 | Xodim | D | D | D | O | `eventRegistration.service` |
| 32 | `NEWS_PUBLISHED` 🆕 | Maqsadli auditoriya | D | O | O | O | `news.service` publish |
| 33 | `ANNOUNCEMENT` 🆕 | Tanlangan | D | D | D | D | `news.service` (urgent bayrog'i) |
| 34 | `KB_ARTICLE_REVIEW_DUE` 🆕 | Tekshiruvchi | D | D | — | — | `complianceQueue` |
| 35 | `BADGE_EARNED` 🆕 | Xodim | D | O | O | O | `badge.service` |
| 36 | `LEVEL_UP` 🆕 | Xodim | D | O | O | O | `level.service` |
| 37 | `REVIEW360_INVITED` 🆕 | Baholovchi | D | D | O | O | `reviewCycle.service` |
| 38 | `REVIEW360_REMINDER` 🆕 | Baholovchi | D | D | O | O | `reminderJob` |
| 39 | `REVIEW360_RESULTS_READY` 🆕 | Baholanuvchi + rahbar | D | D | — | — | `reviewAggregation.service` |
| 40 | `OJT_SESSION_SCHEDULED` 🆕 | Xodim + trener | D | D | D | O | `ojtSession.service` |
| 41 | `PLAN_REVIEW_DUE` 🆕 | Rahbar | D | D | — | — | `reminderJob` |
| 42 | `COMPLIANCE_RETRAINING_DUE` 🆕 | Xodim + rahbar | D | D | D | O | `complianceQueue` |
| 43 | `REPORT_READY` 🆕 | So'ragan | D | D | — | — | `exportQueue` |
| 44 | `SCHEDULED_REPORT` 🆕 | Qabul qiluvchilar | — | D | — | — | `scheduledReportQueue` |
| 45 | `ATTENTION_ALERT` ✅ | Rahbar + SUPERADMIN | D | O | — | — | `videoAnalytics` |
| 46 | `PROCTOR_ALERT` 🆕 | Rahbar + SUPERADMIN | D | D | — | — | `proctorSnapshot.service` |
| 47 | `FACE_SELF_ENROLLMENT` ✅ | SUPERADMIN | D | O | — | — | `faceVerification.service` |
| 48 | `FACE_VERIFICATION_LOCKED` ✅ | Xodim + SUPERADMIN | D | D | — | — | `faceGate.service` |
| 49 | `ACCOUNT_CREATED` 🆕 | Xodim | — | D | — | — | `user.service.create()` (parol bilan) |
| 50 | `PASSWORD_RESET` 🆕 | Xodim | — | D | — | — | `auth.service` — **hozir buzilgan, bu tuzatadi** |
| 51 | `LOGIN_FROM_NEW_DEVICE` 🆕 | Xodim | D | D | — | — | `auth.service` |
| 52 | `WEEKLY_DIGEST` 🆕 | Xodim | — | O | — | O | `deliveryQueue` (haftalik) |

**Shablon qoidasi:** har bir tur uchun 3 til × ishlatiladigan kanallar =
`NotificationTemplate` yozuvi. Til — `user.locale`. Placeholder'lar
`{{...}}` shaklida, ruxsat etilgan ro'yxat bilan (injection'ga qarshi).

**Foydalanuvchi sozlamalari:** `user.notificationPrefs[type][channel] = boolean`.
`D` kanallar default `true`, `O` kanallar default `false`. Ba'zi turlar
(`ACCOUNT_CREATED`, `PASSWORD_RESET`, `CERTIFICATE_EXPIRED`,
`COMPLIANCE_RETRAINING_DUE`) **o'chirilmaydi** — `mandatory: true` bayrog'i bilan.

---

# 12. AUTOMATION MATRITSASI

| # | Avtomatlashtirish | Trigger | Shart | Amal | Amalga oshirish |
|---|---|---|---|---|---|
| 1 | Kurs publish → auto-assign ✅ | `course.status → PUBLISHED` | `autoAssign=true` | Maqsadli auditoriyaga assignment | `course.service` (**mavjud**) |
| 2 | Guruhga kurs qo'shish ✅ | `group.courseIds` o'zgardi | — | A'zolarga assignment (`groupId` bilan) | `group.service` (**mavjud**) |
| 3 | Deadline eslatmasi ✅ | Kunlik | `deadline - now ≤ 7/3/1 kun` | Notify | `reminderJob` (**kengaytiriladi**) |
| 4 | Termination → deaktivatsiya ✅ | `terminationDate` o'rnatildi | — | `isActive=false`, sessiyalarni bekor qilish | `user.service` (**mavjud**) |
| 5 | **Enrollment rule** 🆕 | User create/update + kunlik | `match{}` mos keladi | `grant{}` bo'yicha assignment/path | `enrollmentRuleQueue` |
| 6 | **Onboarding boshlash** 🆕 | Kunlik 03:00 | `hireDate === bugun` va mos dastur bor | `OnboardingEnrollment` yaratish, qadamlarga muddat qo'yish, notify | `onboardingQueue` |
| 7 | **Onboarding qadami muddati** 🆕 | Kunlik | `step.dueAt` yaqin/o'tgan | Notify (xodim + mentor) | `onboardingQueue` |
| 8 | **Sertifikat berish** 🆕 | Kurs/path tugadi | `certificateTemplateId != null` | PDF render + `Certificate` + notify | `certificateQueue` |
| 9 | **Sertifikat muddati** 🆕 | Kunlik 02:00 | `expiresAt - now ≤ 30/7 kun` | Notify | `complianceQueue` |
| 10 | **Qayta o'qitish** 🆕 | Kunlik 02:00 | `RecurringAssignment.nextRunAt ≤ now` | Yangi assignment + notify + `nextRunAt` surish | `complianceQueue` |
| 11 | **Sertifikat tugadi → qayta o'qitish** 🆕 | Kunlik | `expiresAt < now` | Manba kursni qayta biriktirish | `complianceQueue` |
| 12 | **Badge berish** 🆕 | Ball/progress hodisasi | `Badge.criteria` bajarildi | `UserBadge` + notify | `badge.service` (hodisa hook'i) |
| 13 | **Rejalashtirilgan hisobot** 🆕 | Har soat | `cron` mos | Hisobot → fayl → e-mail | `scheduledReportQueue` |
| 14 | **Tadbir eslatmasi** 🆕 | Har 15 daq | `startAt - now ∈ remindBeforeMinutes` | Notify | `reminderJob` |
| 15 | **Waitlist ko'tarish** 🆕 | Ro'yxatdan chiqish | Navbatda odam bor | Birinchisini `REGISTERED` qilish + notify | `eventRegistration.service` |
| 16 | **Dinamik guruh yangilash** 🆕 | User o'zgardi + kunlik | `group.type=DYNAMIC` | `memberIds` qayta hisoblash, farq bo'yicha assignment | `enrollmentRuleQueue` |
| 17 | **Tavsiyalar** 🆕 | Kunlik | — | Har bir foydalanuvchi uchun `Recommendation` qayta hisoblash | `recommendationQueue` |
| 18 | **Media tozalash** 🆕 | Haftalik | Fayl 30 kundan beri havolasiz | Hisobot → keyingi haftada o'chirish | `mediaCleanupQueue` |
| 19 | **Webhook yetkazish** 🆕 | Domen hodisasi | Faol webhook bor | POST + HMAC + 5× retry | `webhookQueue` |
| 20 | **Search indeks** 🆕 | Kontent o'zgardi | — | `contentText` ajratish va yangilash | `searchIndexQueue` |
| 21 | **Backup** 🆕 | Kunlik 01:00 | — | `mongodump` → shifrlash → S3 | `backupQueue` |
| 22 | **KB qayta ko'rish** 🆕 | Kunlik | `nextReviewAt ≤ now` | Tekshiruvchiga notify | `complianceQueue` |
| 23 | **Dashboard agregatsiyasi** ✅ | Har 5 daq | — | Kesh yangilash | `dashboardAggregationQueue` (**mavjud**) |
| 24 | **Video ishlov berish** ✅ | Upload tugadi | — | ffprobe → transcode → HLS | `videoProcessingQueue` (**mavjud**) |

---

# 13. REPORTING MATRITSASI

| # | Hisobot | Holat | Asosiy ustunlar | Filtrlar | Eksport |
|---|---|---|---|---|---|
| 1 | Employee progress | ✅ **mavjud** | F.I.O, JSHSHIR, bo'lim, faol, biriktirilgan/tugallangan/kechikkan kurslar, o'rtacha %, ko'rilgan daqiqa | sana, rol, user, kurs | CSV/XLSX/PDF |
| 2 | Course progress | ✅ **mavjud** | Kurs, biriktirilgan, tugallangan, o'rtacha %, kechikkan | sana, kurs | ✅ |
| 3 | Video analytics | ✅ **mavjud** | Video, ko'rishlar, o'rtacha %, tashlab ketish, seek | sana, kurs | ✅ |
| 4 | News analytics | ✅ **mavjud** | Maqola, ochilish, o'qilgan %, vaqt | sana | ✅ |
| 5 | Task analytics | ✅ **mavjud** | Vazifa, kim, status, muddat | sana, status | ✅ |
| 6 | **Certificate register** | 🆕 CRITICAL | Serial, xodim, kurs, berilgan, tugaydi, holat | sana, kurs, holat, bo'lim | ✅ + **audit-ready** |
| 7 | **Compliance matrix** | 🆕 CRITICAL | Xodim × majburiy kurs kesishmasi (tugallandi/kechikdi/muddati o'tdi) | bo'lim, filial, kurs, sana | ✅ |
| 8 | **Learning path progress** | 🆕 HIGH | Path, xodim, %, joriy item, muddat | path, bo'lim | ✅ |
| 9 | **Quiz / assessment results** | 🆕 HIGH | Test, xodim, urinishlar, eng yaxshi/oxirgi ball, o'tdi | test, kurs, sana | ✅ |
| 10 | **Question difficulty** | 🆕 HIGH | Savol, urinishlar, to'g'ri %, o'rtacha vaqt | test, bank | ✅ |
| 11 | **Event attendance** | 🆕 HIGH | Tadbir, ro'yxatdan o'tgan, kelgan, kelmagan, % | sana, trener | ✅ |
| 12 | **Assignment grading** | 🆕 HIGH | Topshiriq, xodim, topshirilgan, ball, tekshiruvchi | kurs, holat | ✅ |
| 13 | **Onboarding status** | 🆕 HIGH | Xodim, dastur, %, kechikkan qadamlar, mentor | dastur, bo'lim | ✅ |
| 14 | **Login activity** | 🆕 MEDIUM | Xodim, oxirgi kirish, kirishlar soni, qurilma | sana, bo'lim | ✅ |
| 15 | **Competency profile** | 🆕 MEDIUM | Xodim × kompetensiya, joriy/maqsad | bo'lim, kompetensiya | ✅ |
| 16 | **360 results** | 🆕 MEDIUM | Baholanuvchi, kompetensiya, o'z/rahbar/hamkasb o'rtachasi | sikl | ✅ (anonimlik: N≥3) |
| 17 | **OJT results** | 🆕 MEDIUM | Xodim, checklist, o'rtacha ball, kuzatuvlar | trener, sana | ✅ |
| 18 | **KB analytics** | 🆕 MEDIUM | Maqola, ko'rishlar, o'qilgan %, vaqt | kategoriya, sana | ✅ |
| 19 | **Storage usage** | 🆕 MEDIUM | Tur, fayllar soni, hajm, orphan | — | ✅ |
| 20 | **Audit log** | 🆕 CRITICAL | Vaqt, actor, amal, obyekt, IP | sana, actor, amal, obyekt | ✅ |
| 21 | **Department performance** | 🆕 HIGH | Bo'lim, xodimlar, o'rtacha %, tugatish, kechikkan | filial, sana | ✅ |
| 22 | **Manager scorecard** | 🆕 HIGH | Rahbar, jamoa hajmi, tugatish %, kechikkan, o'rtacha ball | filial | ✅ |

**Umumiy filtrlar (barcha hisobotlar uchun):** `dateFrom`, `dateTo`, `branch`,
`department`, `groupId`, `roleId`, `managerId`, `userId`, `courseId`, `pathId`, `status`.

**Umumiy imkoniyatlar:** CSV / XLSX / PDF, 3 til (`reportI18n` **mavjud**),
5000 satrdan katta bo'lsa async `exportJob` + "tayyor" bildirishnomasi,
rejalashtirilgan yuborish, drill-down (jadval satridan detal sahifasiga).

---

# 14. AI FEATURE MATRITSASI

**Mavjud baza:** `@anthropic-ai/sdk`, `ai/anthropicClient.js`, model
`claude-opus-5`, `aiChat.service.js` (kirish huquqi bo'yicha scope'langan),
`aiChatRateLimit.middleware.js`, `AiChatMessage` modeli.
Yangi AI funksiyalari **shu infratuzilma ustiga** quriladi.

| # | Funksiya | Holat | Model / usul | Kirish/chiqish | Xavfsizlik qoidasi | Prio |
|---|---|---|---|---|---|---|
| 1 | Kurs AI-yordamchisi | ✅ **mavjud** | `claude-opus-5`, kurs/mavzu/video scope'i | Chat | Scope har so'rovda DB'dan qayta hisoblanadi | KEEP |
| 2 | **Kurs generatori** | 🆕 | Structured output (tool use) | PDF/DOCX/PPTX → kurs strukturasi (mavzular + darslar) | Natija **har doim `DRAFT`**; inson tasdiqlaydi | HIGH |
| 3 | **Manba matnini ajratish** | 🆕 | `pdfjs` / `mammoth` (**front'da mavjud**) serverga ko'chiriladi | Fayl → toza matn + slayd chegaralari | Fayl hajmi/turi cheklovi (mavjud `file-type`) | HIGH |
| 4 | **Dars matni generatsiyasi** | 🆕 | Claude | Struktura tugunni → `Lesson.blocks[]` | Manbadan tashqariga chiqmaslik ko'rsatmasi | HIGH |
| 5 | **Test generatsiyasi** | 🆕 | Claude + JSON sxema | Dars matni → `Question[]` (turlar bilan) | Har bir savol `DRAFT`, muallif tekshiradi | HIGH |
| 6 | **Tarjima (uz↔ru↔en)** | 🆕 | Claude | Kontent + struktura → `ContentTranslation` | **Struktura saqlanadi** (bloklar, savol ID'lari o'zgarmaydi) | HIGH |
| 7 | **Qayta yozish / soddalashtirish** | 🆕 | Claude | Matn bo'lagi → variantlar | Editor ichida, saqlashdan oldin ko'rsatiladi | MEDIUM |
| 8 | **Xulosalash** | 🆕 | Claude | Uzun material → qisqa xulosa | KB va kurs sahifasida | MEDIUM |
| 9 | **Bo'lim/blokni qayta generatsiya** | 🆕 | Claude | Bitta blok + kontekst | Qolgan struktura tegilmaydi | MEDIUM |
| 10 | **Video transkripsiyasi** | 🆕 | Tashqi ASR (Whisper-ga o'xshash) | Audio → VTT | **Video ichidan qidiruvni ochadi**; o'zbek tili sifati sinovdan o'tkaziladi | MEDIUM |
| 11 | **Subtitr tarjimasi** | 🆕 | Claude | VTT → VTT (boshqa til) | Vaqt belgilari saqlanadi | MEDIUM |
| 12 | **Rasm generatsiyasi** | 🆕 | Tashqi provider | Prompt → rasm | Faqat admin; media kutubxonaga saqlanadi | LOW |
| 13 | **Role-play / dialog simulyatsiyasi** | 🆕 | Claude (ko'p qadamli) | Ssenariy → interaktiv dialog + baholash | Ball qo'yish rubrikaga tayanadi | LOW |
| 14 | **Tavsiyalarni tushuntirish** | 🆕 | Claude | Tavsiya → "nega bu kurs" matni | Qoidaga asoslangan tavsiya ustidan | LOW |
| 15 | **AI hisobot xulosasi** | 🆕 | Claude | Dashboard raqamlari → matnli xulosa | **Faqat agregat raqamlar** yuboriladi, shaxsiy ma'lumot emas | LOW |

## 14.1 AI xavfsizlik va xarajat qoidalari

1. **Shaxsiy ma'lumot yuborilmaydi.** JSHSHIR, passport, telefon, manzil —
   hech qachon prompt'ga kirmaydi. Kurs generatsiyasida faqat kontent matni.
2. **Scope qayta hisoblanadi.** Mavjud `aiChat.service.resolveScope()` naqshi
   barcha yangi AI endpoint'lariga qo'llanadi.
3. **Har doim DRAFT.** Hech qanday AI natijasi to'g'ridan-to'g'ri
   `PUBLISHED` bo'lmaydi. `AiGenerationJob.resultRef` → admin ko'radi →
   tahrirlaydi → publish qiladi.
4. **Manba ko'rsatiladi.** Generatsiya qilingan har bir dars/savol qaysi
   manba faylning qaysi qismidan olinganini saqlaydi (`sourceRef`).
5. **Xarajat nazorati.** `AiGenerationJob.tokensUsed` + `cost` yoziladi;
   oylik limit `Settings.ai.monthlyTokenBudget`; limit oshsa yangi job'lar
   rad etiladi (`429 AI_BUDGET_EXCEEDED`).
6. **Rate limiting.** Mavjud `aiChatRateLimit` naqshi barcha AI
   endpoint'lariga; generatsiya job'lari uchun bir vaqtda 2 tadan ko'p emas.
7. **Audit.** Har bir AI chaqiruvi `AI_GENERATION_REQUESTED` sifatida
   `auditLogs`ga yoziladi (prompt'ning o'zi emas, faqat metadata).

---

# 15. MOBILE FEATURE MATRITSASI

**Strategiya:** native ilova **qurilmaydi** — PWA yetarli va bitta kod
bazasi saqlanadi (§1.5).

| # | Imkoniyat | Holat | Amalga oshirish | Prio |
|---|---|---|---|---|
| 1 | Responsive layout | ✅ | Tailwind, `BottomNav`, mobil grid | KEEP |
| 2 | Mobil video player | ✅ | `hls.js` | KEEP |
| 3 | Mobil test / topshiriq | ✅ | Ishlaydi | KEEP |
| 4 | Mobil chat + ovozli xabar | ✅ | `VoiceRecorder`, `VoicePlayer` | KEEP |
| 5 | **PWA manifest + o'rnatish** | 🆕 | `vite-plugin-pwa`, ikonkalar, `standalone` | HIGH |
| 6 | **App shell keshi** | 🆕 | Workbox precache | HIGH |
| 7 | **Offline kontent (matn/PDF)** | 🆕 | `CacheFirst` + IndexedDB; "Oflayn uchun saqlash" tugmasi | HIGH |
| 8 | **Offline progress navbati** | 🆕 | IndexedDB navbat + `clientEventId` (idempotent) | HIGH |
| 9 | **Background Sync** | 🆕 | Background Sync API; qo'llab-quvvatlanmasa — onlayn bo'lganda `flush()` | HIGH |
| 10 | **Web push** | 🆕 | VAPID + `PushSubscription` + service worker | HIGH |
| 11 | **Offline video** | 🆕 | HLS segmentlarini keshlash (chegaralangan: 1 kurs, N GB) | MEDIUM |
| 12 | **Mobil OJT formasi** | 🆕 | Offline-birinchi kuzatuv formasi (do'kon/zavod uchun) | MEDIUM |
| 13 | **Kamera bilan davomat (QR)** | 🆕 | Tadbir davomatini QR skan bilan belgilash | MEDIUM |
| 14 | **Mobil sertifikat** | 🆕 | PDF ko'rish + ulashish (Web Share API) | MEDIUM |
| 15 | Offline test | ✖ | **Ataylab qilinmaydi** — server taymer va focus-loss nazorati oflayn ishonchli emas | — |
| 16 | Offline face verification | ✖ | **Ataylab qilinmaydi** — biometrik tekshiruv serverda | — |

## 15.1 Offline sinxronizatsiya qoidalari

- Har bir oflayn hodisa `clientEventId` (UUID) oladi; server `unique` indeks
  bilan takrorlanishni rad etadi → tarmoq uzilishi progressni dublikat qilmaydi.
- Konflikt yechimi: **server ustun** (`videoProgress` merge algoritmi
  allaqachon intervallarni birlashtiradi — oflayn segmentlar shunchaki
  qo'shiladi, hech narsa yo'qolmaydi).
- Oflayn navbat hajmi cheklanadi (1000 hodisa); to'lsa eng eskisi tashlanadi
  va foydalanuvchi ogohlantiriladi.
- Sinxronizatsiya holati UI'da ko'rinadi ("3 ta o'zgarish yuborilmoqda").

---

# 16. XAVFSIZLIK CHECKLIST

`✅` = bajarilgan · `⚠️` = qisman · `❌` = yo'q

## 16.1 Autentifikatsiya va sessiya

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 1 | argon2id parol hashlash | ✅ | KEEP |
| 2 | Access token qisqa muddatli, xotirada | ✅ | KEEP |
| 3 | Refresh token httpOnly + Secure + SameSite=strict | ✅ | KEEP |
| 4 | Refresh rotation + reuse detection | ✅ | KEEP |
| 5 | Sessiyalar DB'da hash'langan | ✅ | KEEP |
| 6 | Login rate limit + slow-down | ✅ | KEEP |
| 7 | Account lockout | ✅ | KEEP |
| 8 | CAPTCHA | ✅ | KEEP |
| 9 | Face verification (biometrik 2FA) | ✅ | KEEP |
| 10 | **TOTP 2FA** | ❌ | ADD — face'ga muqobil sifatida |
| 11 | **Parol tiklash yetkazilishi** | ❌ | **CRITICAL** — token faqat logga yoziladi |
| 12 | **Yangi qurilmadan kirish xabari** | ❌ | ADD |
| 13 | **Parol siyosati** (uzunlik, murakkablik, tarix) | ⚠️ | EXTEND — hozir faqat minimal uzunlik |
| 14 | Sessiyalarni ko'rish/bekor qilish (foydalanuvchi) | ❌ | ADD — "Faol sessiyalar" sahifasi |

## 16.2 Avtorizatsiya

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 15 | Permission-based RBAC | ✅ | KEEP |
| 16 | Dinamik rollar (kod o'zgarishisiz) | ✅ | KEEP |
| 17 | Resource-level tekshiruv (IDOR) | ✅ | KEEP |
| 18 | **ADMIN/MANAGER API scope'i UI bilan mos** | ❌ | **CRITICAL REFACTOR** |
| 19 | **Manager scope'i (`managedUserIds`)** | ❌ | ADD |
| 20 | Frontend guard'lar faqat UX (server takrorlaydi) | ✅ | KEEP |
| 21 | **API kalitlari uchun scope** | ❌ | ADD (Phase 6) |

## 16.3 Kirish/chiqish ma'lumotlari

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 22 | zod validatsiya (barcha yozuv endpoint'lari) | ✅ | KEEP |
| 23 | Fayl magic-byte tekshiruvi | ✅ | KEEP |
| 24 | Fayl hajmi chegarasi | ✅ | KEEP |
| 25 | Server-generated storage key (path traversal yo'q) | ✅ | KEEP |
| 26 | XSS — Vue auto-escape + plain-text kontent | ✅ | KEEP |
| 27 | **Rich HTML sanitizatsiyasi** (KB/dars uchun) | ❌ | ADD — `sanitize-html` allowlist, `<script>`/`on*`/`javascript:` bloklanadi |
| 28 | **Embed allowlist** (iframe) | ❌ | ADD — faqat tasdiqlangan domenlar, `sandbox` atributi |
| 29 | **ReDoS** — `course.repository` regex'ni escape qilmaydi | ⚠️ | **FIX** — `$text`ga o'tish yoki escape (`user.repository` naqshi) |
| 30 | CSRF double-submit (`/auth/refresh`) | ✅ | KEEP |
| 31 | CORS allowlist | ✅ | KEEP |
| 32 | helmet security headers | ✅ | KEEP |
| 33 | **CSP** (SCORM iframe uchun sozlanadi) | ⚠️ | EXTEND — `frame-src` allowlist |

## 16.4 Ma'lumot himoyasi

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 34 | Yopiq bucket + signed URL | ✅ | KEEP |
| 35 | **Signed URL host bug'i** | ❌ | **CRITICAL FIX** |
| 36 | Video per-segment auth + watermark | ✅ | KEEP |
| 37 | Face embedding `select: false` | ✅ | KEEP |
| 38 | Proctor rasmlari — audit-logli kirish, 180 kun TTL | ✅ | KEEP |
| 39 | **At-rest shifrlash** | ❌ | ADD (MEDIUM) — hech bo'lmaganda backup arxivlari |
| 40 | **Sertifikatning ommaviy sahifasida PII yo'q** | 🆕 | Qoida: faqat ism + kurs + sana; JSHSHIR **hech qachon** |
| 41 | **AI prompt'larida PII yo'q** | 🆕 | §14.1 qoidasi |
| 42 | **360 anonimligi** (N≥3 chegara) | 🆕 | Agregatsiya darajasida majburlanadi |
| 43 | TTL: analytics 180 kun, proctor 180 kun | ✅ | KEEP |
| 44 | **Data retention siyosati** (qolgan hammasi uchun) | ❌ | ADD — chiqib ketgan xodim ma'lumoti N yildan keyin anonimlashtiriladi |
| 45 | **Backup + tiklashni sinash** | ❌ | **CRITICAL ADD** |

## 16.5 Kuzatuv va audit

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 46 | Audit log yozilishi (60+ action) | ✅ | KEEP |
| 47 | **Audit log ko'rish (endpoint + UI)** | ❌ | **CRITICAL ADD** |
| 48 | **Hisobot eksporti audit qilinadi** | ❌ | ADD |
| 49 | **API foydalanish audit qilinadi** | ❌ | ADD (Phase 6) |
| 50 | Request logging (winston) | ✅ | KEEP |
| 51 | **Error tracking (Sentry)** | ❌ | ADD |
| 52 | **Uptime / metrics monitoring** | ❌ | ADD |
| 53 | **Sirlar logga tushmaydi** | ✅ | KEEP — parol/token hech qachon loglanmaydi |
| 54 | **API kaliti to'liq loglanmaydi** (faqat prefiks) | 🆕 | Qoida |

## 16.6 Infratuzilma

| # | Nazorat | Holat | Amal |
|---|---|---|---|
| 55 | HTTPS / TLS | ✅ | KEEP |
| 56 | `trust proxy: 1` (haqiqiy IP) | ✅ | KEEP |
| 57 | Rate limiting (11 limiter) | ✅ | KEEP |
| 58 | **Ajratilgan server** | ❌ | **HIGH** — hozir 1.9 GB RAM, 6 begona sayt bilan; Phase 5+ buni ko'tarmaydi |
| 59 | **Socket.io Redis adapter** | ❌ | ADD — bir nechta instansiya uchun |
| 60 | **Sirlar boshqaruvi** | ⚠️ | `.env` fayli; hech bo'lmaganda huquqlar `600` va backup'da shifrlangan |

## 16.7 Yangi funksiyalar uchun xavfsizlik qabul mezonlari

Har bir yangi endpoint uchun **majburiy**:
1. zod validator mavjud
2. `requirePermission()` yoki aniq asoslangan ochiqlik
3. Resource-level tekshiruv (agar `:id` bo'lsa)
4. 401/403 testi `security.test.js` naqshida
5. Yozuv amali `auditLogs`ga tushadi
6. Rate limiter biriktirilgan (yozuv va qimmat o'qish amallari uchun)

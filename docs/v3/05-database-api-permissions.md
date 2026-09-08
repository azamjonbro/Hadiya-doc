# 6. DATABASE 1×1

> Format: iSpring konsepti → bizdagi entity → yetishmayotgan maydonlar →
> noto'g'ri maydonlar → yetishmayotgan bog'lanish → indeks → migratsiya →
> orqaga moslik → xavf.

| # | iSpring entity | Bizda | Yetishmayotgan maydonlar | Muammoli joy | Migratsiya | Orqaga moslik | Xavf |
|---|---|---|---|---|---|---|---|
| 1 | User | `users` (39 maydon) | `managerId`, `employeeNumber`, `locale`, `notificationPrefs`, `customFields`, `emailVerifiedAt`, `totpSecret`, `externalIds[]`, `telegramChatId`, `deletedAt` | `deletedAt` yo'q — foydalanuvchi o'chirilmaydi, faqat `isActive=false` | `$set` default'lar + `managerId` backfill | ✅ To'liq | Past |
| 2 | Organization | **yo'q** | butun entity | Multi-tenant emas | Har modelga `orgId` | ⚠️ Katta | **Yuqori** — faqat real ehtiyoj bo'lsa |
| 3 | Department | `orgList` (`type=DEPARTMENT`) + `user.department` (nom) | `parentId` (daraxt) | Nom bo'yicha bog'lanish: bo'lim nomi o'zgarsa hamma yozuv qoladi | Rename skripti | ✅ | O'rta |
| 4 | Group | `groups` | `type: STATIC\|DYNAMIC`, `rule{}` | `memberIds[]` embed — o'nlab a'zo uchun to'g'ri, minglab uchun emas | `$set type='STATIC'` | ✅ | Past |
| 5 | Manager | **yo'q** | `users.managerId` | Ierarxiya qurib bo'lmaydi | Backfill (XLSX/HR) | ✅ | Past |
| 6 | Role | `roles` | `scope` (`ALL\|DEPARTMENT\|SELF`) | Scope kodda `roleName` bilan (§1.5) | `$set scope` | ✅ | **Yuqori** — xavfsizlik |
| 7 | Permission | `permissions` + `packages/shared` | +45 kalit | Katalog kolleksiyasi seed qilinadimi — tekshirish kerak | Seed | ✅ | Past |
| 8 | Course | `courses` (14 maydon) | `categoryId`, `tags[]`, `level`, `authorIds[]`, `estimatedMinutes`, `prerequisiteCourseIds[]`, `certificateTemplateId`, `completionRule{}`, `navigationMode`, `validityDays`, `version`, `allowSelfEnroll` | — | `$set` default'lar | ✅ (`navigationMode='SEQUENTIAL'` = hozirgi xatti-harakat) | Past |
| 9 | CourseCategory | **yo'q** | butun entity | — | Yangi kolleksiya | ✅ | Past |
| 10 | CourseVersion | **yo'q** | butun entity | Kurs o'zgarsa tugatganlar holati aniqlanmagan | Yangi | ✅ | O'rta |
| 11 | Lesson | **yo'q** | butun entity | Matnli dars imkonsiz | Yangi | ✅ | Past |
| 12 | ContentItem | **yo'q** (4 alohida model) | umumiy baza | `topicContent.service.js` qo'lda birlashtiradi; har yangi tur 4 joyni o'zgartiradi | Bosqichma-bosqich | ⚠️ Ehtiyot | **Yuqori** |
| 13 | Video | `videos` | `subtitles[]`, `chapters[]`, `transcriptKey` | — | `$set []` | ✅ | Past |
| 14 | Document | `materials` (`FILE/PRESENTATION/MULTIMEDIA`) | `allowDownload`, `altText`, `pageCount` | `totalPages` klientdan keladi (`materialProgress.model.js` izohida asoslangan) | `$set true` | ✅ | Past |
| 15 | Quiz | `quizzes` (video) + `assessments` (topic) | `maxAttempts`, `timeLimitMinutes`, `shuffle*`, `pools[]`, `partialCredit`, `revealMode`, `scorePolicy`, `focusLossLimit` | **Ikkita deyarli bir xil model** | M1 birlashtirish | ⚠️ API 1 reliz ikkala format | **Yuqori** |
| 16 | Question | **embed** (`quiz.questions[]`, `assessment.questions[]`) | `type`, `payload`, `points`, `penalty`, `explanation`, `tags`, `difficulty`, `media` | Sxema **ikki faylda dublikat**; savol testlar orasida qayta ishlatilmaydi | M1 | ⚠️ | **Yuqori** |
| 17 | QuestionBank | **yo'q** | butun entity | — | Yangi (M1 avtomatik yaratadi) | ✅ | Past |
| 18 | QuizAttempt | `quizAttempts` + `assessmentAttempts` | `attemptNo`, `sessionId`, `perQuestion[]`, `gradedBy`, `gradedAt`, `payload` | `selectedOptionIndex: Number` — faqat MCQ'ga yaraydi | Eski attemptlar **tegilmaydi** | ✅ | O'rta |
| 19 | LearningPath | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 20 | PathEnrollment | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 21 | Assignment (uy vazifasi) | **yo'q** (`tasks` boshqa narsa) | butun entity | `Task` bilan chalkashtirmaslik kerak | Yangi | ✅ | Past |
| 22 | Submission | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 23 | Event | `events` (8 maydon) | `mode`, `trainerIds[]`, `capacity`, `registeredCount`, `meeting{}`, `remindBeforeMinutes[]`, `linkedCourseId`, `requiresRegistration`, `status` | `participants[]` — `ObjectId[]`, holat saqlab bo'lmaydi | M6: `participants[]` → `EventRegistration` | ✅ | Past |
| 24 | EventRegistration | **yo'q** | butun entity | — | M6 | ✅ | Past |
| 25 | Certificate | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 26 | CertificateTemplate | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 27 | KnowledgeBase / KbArticle | **yo'q** (`news` boshqa narsa) | butun entity | `news.content` ataylab plain-text; KB uchun HTML kerak → **sanitizatsiya majburiy** | Yangi | ✅ | O'rta (XSS) |
| 28 | ReviewCycle | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 29 | Competency | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 30 | DevelopmentPlan | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 31 | Notification | `notifications` | `channels[]`, `deliveredAt{}`, `templateKey`, `payload{}` | Matn **hujjatga yozib qo'yilgan** → keyin tarjima qilib bo'lmaydi | `$set` | ✅ | Past |
| 32 | NotificationTemplate | **yo'q** | butun entity | — | M9 seed (25 tur × 3 til × 3 kanal) | ✅ | Past |
| 33 | AuditLog | `auditLogs` | — (sxema yaxshi) | **Ko'rish yo'li yo'q**; TTL yo'q → cheksiz o'sish | Faqat indeks | ✅ | Past |
| 34 | ApiKey | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 35 | Webhook | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 36 | ScheduledReport | **yo'q** | butun entity | — | Yangi | ✅ | Past |
| 37 | AutomationRule | **yo'q** | butun entity | Har avtomatlashtirish qo'lda kodlangan | Yangi | ✅ | Past |
| 38 | MediaAsset | **yo'q** | butun entity | Fayl egasiga bog'langan; o'chirilganda S3'da qoladi (`course.service.js:378`) | Yangi + orphan skan | ✅ | O'rta |

## 6.1 Mavjud modellardagi topilgan muammolar

| # | Model | Muammo | Dalil | Prio |
|---|---|---|---|---|
| 1 | `quiz` + `assessment` | Bir xil `optionSchema`/`questionSchema` ikki faylda | `quiz.model.js:3-21` ≡ `assessment.model.js:6-24` | HIGH |
| 2 | `auditLogs` | **TTL indeks yo'q** — bu kolleksiya cheksiz o'sadi (60+ action, har login, har kurs o'zgarishi) | `auditLog.model.js:16-17` — faqat 2 ta oddiy indeks | HIGH |
| 3 | `notifications` | TTL yo'q — o'qilgan bildirishnomalar abadiy qoladi | `notification.model.js` | MEDIUM |
| 4 | `events.participants` | `ObjectId[]` — ro'yxat holati, davomat, waitlist saqlab bo'lmaydi | `event.model.js:10` | HIGH |
| 5 | `courses.branches` / `targetRoles` / `department` | Nom bo'yicha (string) — filial/bo'lim nomi o'zgarsa kurs targeting'i **jimgina buziladi** | `course.model.js:14-22` | MEDIUM |
| 6 | Audit maydonlari nomuvofiq | `createdBy/updatedBy`: course/topic/video/material/assessment/group/quiz da bor; `task`, `event`, `news` da qisman; `quizAttempt`, `notification` da yo'q | — | MEDIUM |
| 7 | `deletedAt` faqat 2 modelda | `courses`, `news`. `users`, `topics`, `videos`, `materials` da yo'q → topic o'chirilsa qaytarib bo'lmaydi | — | MEDIUM |
| 8 | `videoAnalyticsEvents` | ✅ TTL 180 kun **bor** — to'g'ri qilingan | `data-model.md` + model | — |
| 9 | `pointsLedger` | ✅ Sparse unique indeks — idempotentlik kafolatlangan | `pointsLedger.model.js:20-21` | — |

## 6.2 Yetishmayotgan indekslar

| Kolleksiya | Kerakli indeks | Nima uchun |
|---|---|---|
| `courses` | `{title:'text', description:'text', tags:'text'}` | Hozir `RegExp` → to'liq skan |
| `users` | `{fullName:'text', email:'text'}` | Global qidiruv |
| `users` | `{managerId:1}` | Ierarxiya `$graphLookup` |
| `auditLogs` | `{timestamp:1}` TTL (masalan 730 kun) | Cheksiz o'sishni to'xtatish |
| `auditLogs` | `{action:1, timestamp:-1}` | Audit UI filtri |
| `notifications` | `{createdAt:1}` TTL (o'qilganlar uchun) | O'sishni cheklash |
| `courseAssignments` | `{courseId:1, status:1}` | Kurs bo'yicha hisobot |
| `quizAttempts` | `{quizId:1, createdAt:-1}` | Savol qiyinligi statistikasi |
| `materialProgress` | `{materialId:1}` | Material bo'yicha hisobot |

---

# 7. API 1×1

## 7.1 Mavjud API sifatining bahosi

| Mezon | Holat | Dalil |
|---|---|---|
| Autentifikatsiya | ✅ | `authenticate` har router'da |
| Avtorizatsiya | ✅ | `requirePermission` / `requireSelfOrPermission` / `requireRole` |
| Validatsiya | ✅ | 24 zod validator, `validateBody`/`validateQuery` |
| Xato kodlari | ✅ | `ApiError` + `code` (`ASSIGNMENT_ALREADY_EXISTS`, `PREVIOUS_VIDEO_INCOMPLETE`, ...) |
| Pagination | ✅ | Kursor **va** raqamli rejim |
| Rate limit | ✅ | 11 alohida limiter |
| Audit | ◐ | Yozuv amallari uchun bor; **eksport va o'qish uchun yo'q** |
| Idempotency | ✗ | `Idempotency-Key` yo'q — oflayn va public API uchun kerak |
| Filtrlash / saralash | ◐ | Filtr bor, **saralash parametri deyarli yo'q** |
| OpenAPI | ✗ | Faqat qo'lda yozilgan `docs/api-contract.md` |
| Versiyalash | ✅ | `/api/v1` |

## 7.2 API GAP'lar (UI bor, API yo'q / API bor, UI yo'q)

| Tur | Endpoint | Izoh |
|---|---|---|
| **API bor, UI yo'q** | `GET /events/:id` | Tadbir tafsiloti sahifasi yo'q |
| **API bor, UI yo'q** | `PATCH /events/:id` | Tadbirni tahrirlab bo'lmaydi |
| **API bor, UI yo'q** | `DELETE /events/:id` | Tadbirni o'chirib bo'lmaydi |
| **Ikkalasi ham yo'q** | `PATCH /roles/:id` | Rolning ruxsatlarini o'zgartirib bo'lmaydi (§1.14) |
| **API bor, ishlatilmaydi** | `audit:read` ruxsati | Hech qanday route uni tekshirmaydi |
| **API bor, prod'da buzilgan** | `GET /materials/:id/download-url` | Presign host (§1.1) |

## 7.3 REFACTOR talab qiladigan endpoint'lar

| Endpoint | Muammo | Kerakli o'zgarish |
|---|---|---|
| `GET /reports/:type/export` | Scope yo'q, audit yo'q, `MAX_ROWS` jimgina kesadi | `actor` uzatish; audit; kesilganini javobda ko'rsatish yoki async job |
| `GET /dashboard` | Scope yo'q | `?scope=` + actor bo'yicha majburlash |
| `GET /gamification/leaderboard` | `jshshir` oshkor | DTO'dan olib tashlash |
| `GET /courses` (`?search=`) | Escape'siz regex → ReDoS | `$text` |
| `POST /videos/:id/quiz/submit` | Chegara yo'q, javob kaliti har doim qaytadi | `maxAttempts` + `revealMode` |
| `POST /courses/:id/enroll` | `allowSelfEnroll` tekshirilmaydi | Kurs bayrog'i |

---

# 8. PERMISSION 1×1

## 8.1 Hozirgi holat

7 rol so'ralgan, bizda **6 ta seed rol** bor va ulardan ikkitasi (`CALL_OPERATOR`,
`SELLER`) `EMPLOYEE` bilan **bir xil ruxsat to'plamiga** ega
(`permissions.js:96-98`) — ya'ni amalda **4 xil ruxsat darajasi** bor.
`INSTRUCTOR`, `AUTHOR`, `MENTOR` **yo'q**.

## 8.2 Rol × amal matritsasi (kerakli holat)

`✔` to'liq · `~` scope bilan · `·` yo'q

| Feature | Amal | SUPER | ADMIN | MANAGER | INSTRUCTOR | AUTHOR | MENTOR | LEARNER |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Course | View | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ |
| | Create/Edit | ✔ | ✔ | · | · | ~ | · | · |
| | Delete | ✔ | ✔ | · | · | · | · | · |
| | Publish | ✔ | ✔ | · | · | · | · | · |
| | Assign | ✔ | ✔ | ~ | ~ | · | · | · |
| Learning path | View | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ |
| | Create/Edit/Delete | ✔ | ✔ | · | · | ~ | · | · |
| | Assign | ✔ | ✔ | ~ | · | · | · | · |
| Question bank | Manage | ✔ | ✔ | · | ~ | ✔ | · | · |
| Quiz | Configure | ✔ | ✔ | · | ~ | ✔ | · | · |
| | Grade (essay) | ✔ | ✔ | ~ | ~ | ✔ | · | · |
| | View stats | ✔ | ✔ | ~ | ~ | ~ | ~ | ·(o'ziniki) |
| Assignment | Manage | ✔ | ✔ | ~ | ~ | ✔ | · | · |
| | Submit | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| | Grade | ✔ | ✔ | ~ | ~ | ✔ | ~ | · |
| Certificate | Configure template | ✔ | ✔ | · | · | · | · | · |
| | Issue/Revoke | ✔ | ✔ | · | · | · | · | · |
| | View own | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| | View all | ✔ | ✔ | ~ | · | · | · | · |
| Event | Create/Edit | ✔ | ✔ | ~ | ~ | · | · | · |
| | Mark attendance | ✔ | ✔ | ~ | ✔ | · | · | · |
| | Register | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| User | View | ✔ | ✔ | ~ | · | · | ~ | ·(o'zi) |
| | Create/Edit | ✔ | ✔ | ~ | · | · | · | · |
| | Delete | ✔ | ✔ | · | · | · | · | · |
| | Import | ✔ | ✔ | · | · | · | · | · |
| Role | View | ✔ | ✔ | · | · | · | · | · |
| | Configure | ✔ | · | · | · | · | · | · |
| Onboarding | Manage | ✔ | ✔ | · | · | · | · | · |
| | View team | ✔ | ✔ | ~ | · | · | ~ | ·(o'zi) |
| KB | Read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ |
| | Create/Edit | ✔ | ✔ | · | · | ✔ | · | · |
| | Review/Publish | ✔ | ✔ | · | · | · | · | · |
| 360 | Manage cycle | ✔ | ✔ | · | · | · | · | · |
| | Respond | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| | View results | ✔ | ✔ | ~ | · | · | · | ~(o'ziniki) |
| OJT | Manage checklist | ✔ | ✔ | ~ | · | · | · | · |
| | Observe | ✔ | ✔ | ✔ | ✔ | · | ✔ | · |
| Dev plan | Manage | ✔ | ✔ | ~ | · | · | ~ | · |
| | View own | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Report | View | ✔ | ✔ | ~ | ~ | ~ | ~ | ·(o'ziniki) |
| | Export | ✔ | ✔ | ~ | · | · | · | · |
| | Schedule | ✔ | ✔ | · | · | · | · | · |
| Compliance | View | ✔ | ✔ | ~ | · | · | · | · |
| Automation | Configure | ✔ | ✔ | · | · | · | · | · |
| Media | Manage | ✔ | ✔ | · | · | ✔ | · | · |
| Settings/Branding | Configure | ✔ | · | · | · | · | · | · |
| API key / Webhook / SSO | Manage | ✔ | · | · | · | · | · | · |
| Audit log | View | ✔ | ✔ | · | · | · | · | · |
| AI generate | Use | ✔ | ✔ | · | · | ✔ | · | · |
| Proctor snapshot | View | ✔ | ✔ | ~ | · | · | · | · |

## 8.3 Majburiy scope qoidalari (server tomonda)

| # | Qoida | Hozirgi holat | Kerakli o'zgarish |
|---|---|---|---|
| 1 | **MANAGER boshqa bo'lim xodimini ko'rmasligi** | ✅ users/tasks/groups/assignments/leaderboard da; ❌ **reports/dashboard da yo'q** | `reportDataService.build(actor,...)`, `dashboard?scope=` |
| 2 | **AUTHOR faqat o'z kursini tahrirlashi** | ❌ rol yo'q; `course:create` bo'lgan har kim har qanday kursni tahrirlaydi | `AUTHOR` roli + `course.authorIds` + service ichida tekshiruv |
| 3 | **INSTRUCTOR faqat o'ziga biriktirilgan kurs/tadbirni boshqarishi** | ❌ rol yo'q | `INSTRUCTOR` roli + `event.trainerIds` |
| 4 | **LEARNER faqat o'z ma'lumotini ko'rishi** | ✅ `requireSelfOrPermission` + service ichida `isSelf` tekshiruvlari | — |
| 5 | **ADMIN scope'i API va UI'da bir xil** | ❌ `/bos` faqat SUPERADMIN'ga ochiq, API esa ADMIN/MANAGER'ga | Ruxsatlarni UI bilan moslashtirish |
| 6 | **Scope rol nomiga emas, ruxsatga bog'lanishi** | ❌ 14 joyda `roleName === 'MANAGER'` | `role.scope` yoki `*:read:department` kalitlari |

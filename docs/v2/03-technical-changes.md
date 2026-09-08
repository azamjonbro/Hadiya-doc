# 3–9. TEXNIK O'ZGARISHLAR — DB / Backend / Frontend / API

---

# 3. YETISHMAYOTGAN FUNKSIYALAR (ADD)

Prioritet bo'yicha guruhlangan. Har biri **funksional talab** sifatida
yozilgan — "qo'shish kerak" emas, "qanday ishlashi kerak".

## 3.1 CRITICAL

### 3.1.1 Sertifikatlar
**Funksional talab.** Xodim kursni yoki learning path'ni tugatganda
(`CourseAssignment.status → COMPLETED`), agar kursda
`certificateTemplateId` o'rnatilgan bo'lsa, tizim **avtomatik ravishda**
sertifikat yaratadi: `Certificate` yozuvi + PDF render + S3'ga saqlash +
`CERTIFICATE_ISSUED` bildirishnomasi. Sertifikat noyob `serial` (ULID)
oladi. Har bir sertifikat `GET /public/certificates/:serial` sahifasida
autentifikatsiyasiz tekshiriladi (rate-limited, faqat ism/kurs/sana
ko'rsatiladi — JSHSHIR **hech qachon** ko'rsatilmaydi). PDF'da QR kod shu
sahifaga yo'naltiradi. Agar shablonda `validityMonths` bo'lsa,
`expiresAt` hisoblanadi va compliance job muddat tugashidan 30/7 kun
oldin eslatadi.

**Idempotentlik:** `{userId, courseId, sourceCompletionAt}` bo'yicha unique
indeks — bir tugatish uchun ikkinchi sertifikat berilmaydi.

### 3.1.2 Notification delivery qatlami (e-mail + push + Telegram)
**Funksional talab.** `notificationService.notify()` hozir faqat DB yozadi va
socket'ga uzatadi. Yangi arxitektura: `notify()` → `Notification` yozadi →
socket → **`deliveryQueue`ga job qo'yadi**. Delivery worker foydalanuvchining
`notificationPrefs` sozlamasini o'qiydi va yoqilgan kanallarga yuboradi
(e-mail, web push, Telegram). Har bir kanal **mustaqil retry** (BullMQ,
exponential backoff, 5 urinish) va `MailLog`/`DeliveryLog` yozuvi bilan.
Matn `NotificationTemplate` dan olinadi: `{type, lang, channel}` bo'yicha,
placeholder'lar bilan (`{{userName}}`, `{{courseTitle}}`, `{{deadline}}`).
Foydalanuvchi tili — `user.locale` (yangi maydon, default `uz`).

**Muhim:** hozirgi bildirishnoma matnlari kodda **inglizcha hardcoded**
(`reminderJob.js`) — bu shablon tizimiga ko'chirilishi shart.

### 3.1.3 Learning paths
**Funksional talab.** Path — tartiblangan `items[]` to'plami; har bir item
`COURSE`, `ASSESSMENT`, `EVENT`, `ASSIGNMENT` yoki `KB_ARTICLE` bo'lishi
mumkin. `path.sequential=true` bo'lsa, item ochilishi oldingi **majburiy**
item tugallanishini talab qiladi (`courseSequence.js` naqshi ko'chiriladi —
server tomonda, kirish nuqtasida). `PathEnrollment` har bir foydalanuvchi
uchun progressni saqlaydi; progress = tugallangan majburiy item'lar / jami
majburiy item'lar. Path deadline'i `reminderJob`ga ulanadi. Path tugaganda
sertifikat beriladi (agar shablon bog'langan bo'lsa).

### 3.1.4 Test tizimini qayta qurish (Question modeli)
**Funksional talab.** Yagona `Question` kolleksiyasi, `type` diskriminatori
bilan (13 tur). Savol `QuestionBank`ga tegishli va **bir necha testda qayta
ishlatilishi mumkin**. `Quiz`/`Assessment` endi savollarni embed qilmaydi —
ular `questionIds[]` yoki `pools[]{bankId, count, tags[]}` saqlaydi.
Attempt boshlanganda server savollarni tanlaydi (pool'dan tasodifiy),
tartibni aralashtiradi (attempt ichida barqaror `seed` bilan) va
`AttemptQuestionSet` sifatida muzlatadi — reload bir xil savollarni
qaytaradi. Ball: `question.points` × to'g'rilik (qisman ball
multi-response uchun: `max(0, to'g'ri − noto'g'ri) / jami_to'g'ri`).
`maxAttempts` server tomonda majburlanadi (409 `ATTEMPTS_EXHAUSTED`).
`revealMode` (`NEVER | AFTER_ATTEMPT | AFTER_PASS`) natijalarni ko'rsatishni
boshqaradi.

**Migratsiya:** mavjud `Quiz.questions[]` va `Assessment.questions[]`
→ `Question` yozuvlariga ko'chiriladi (`type=SINGLE_CHOICE`), har bir test
uchun avtomatik `QuestionBank` yaratiladi. Mavjud attempt'lar tegilmaydi.

### 3.1.5 Global search
**Funksional talab.** `GET /search?q=&types=&limit=` — kurs, dars, material,
KB maqola, foydalanuvchi, sertifikat bo'ylab parallel qidiradi, **har bir
natija so'rovchining kirish huquqi bo'yicha filtrlanadi** (mavjud
`courseVisibility` / `materialAccess` qayta ishlatiladi — hech qachon
"topildi, lekin ochib bo'lmaydi" holati bo'lmasligi kerak). Mongo `$text`
indekslari (`default_language: 'none'` — o'zbek stemmer'i yo'q, shuning
uchun to'liq so'z mosligi + prefix). Frontend: `⌘K`/`Ctrl+K` palitra.

### 3.1.6 Audit log ko'rish
**Funksional talab.** `GET /audit-logs?actor=&entity=&action=&from=&to=&cursor=`
— faqat `audit:read` ruxsati bilan. `AuditLogView` sahifasi: filtrlar,
kursorli pagination, JSON metadata'ni ochish, CSV/XLSX eksport (eksportning
o'zi ham `REPORT_EXPORTED` sifatida audit qilinadi).

### 3.1.7 Course metadata (kategoriya, teg, daraja, muallif)
**Funksional talab.** `CourseCategory` daraxti (`parentId`), `course.tags[]`,
`course.level`, `course.authorIds[]`, `course.estimatedMinutes`.
Katalog sahifasi shu o'lchamlar bo'yicha filtrlaydi va saralaydi.
`estimatedMinutes` — video davomiyligi + material sahifalari × 1.5 daq +
test vaqt chegarasi yig'indisi, kontent o'zgarganda qayta hisoblanadi.

### 3.1.8 Bulk user import (XLSX)
**Funksional talab.** Admin XLSX yuklaydi → server **dry-run** qiladi:
har bir satr uchun validatsiya (JSHSHIR 14 raqam, takrorlanmaslik,
rol/bo'lim/filial mavjudligi), natija sifatida "yaratiladi / yangilanadi /
xato" hisoboti qaytadi. Admin tasdiqlaganidan keyingina yozuv boshlanadi
(BullMQ job, progress bilan). Xatolar satr raqami bilan XLSX sifatida
yuklab olinadi. Parollar avtomatik generatsiya qilinadi va faqat import
hisobotida bir marta ko'rsatiladi.

### 3.1.9 Backup strategiyasi
**Funksional talab.** Kunlik `mongodump` → shifrlangan arxiv → alohida S3
bucket (30 kun saqlash, 7 kunlik nuqtaviy tiklash). Haftada bir marta
**tiklashni sinash** (avtomatlashtirilgan: dump'ni vaqtinchalik bazaga
tiklab, hujjatlar sonini tekshirish). S3 bucket'lari uchun versioning.
Tiklash tartibi `docs/deployment.md`ga yoziladi va **kvartalda bir marta
qo'lda sinaladi**.

### 3.1.10 Material download URL bug'i
**Funksional talab (tuzatish).** Hozir presigned URL `127.0.0.1:9000`
ustidan imzolanadi va brauzerda ishlamaydi. Yechim: `S3_PUBLIC_ENDPOINT`
env o'zgaruvchisi (masalan `https://media.sds-max.uz`) — imzo shu host
ustidan qo'yiladi. Muqobil (kichikroq fayllar uchun): `GET /materials/:id/stream`
— API o'zi oqim uzatadi, `Content-Disposition` bilan; bu `allowDownload=false`
holatini ham hal qiladi.

## 3.2 HIGH — qisqacha ro'yxat

| # | Funksiya | Bir jumlalik talab |
|---|---|---|
| 1 | `user.managerId` + ierarxiya | Har bir xodimning rahbari ko'rsatiladi; `$graphLookup` bilan butun jamoa (bevosita + bilvosita) hisoblanadi va manager scope'i shu ro'yxatga tayanadi |
| 2 | Manager dashboard | `GET /dashboard/team` — faqat o'z jamoasi kesimida kartalar, kechikkanlar ro'yxati, top/past ko'rsatkichlar |
| 3 | Onboarding dasturi | `hireDate` kuni mos `OnboardingProgram` avtomatik biriktiriladi; qadamlar `hireDate + dueDays` bo'yicha muddat oladi; mentor va rahbar xabardor qilinadi |
| 4 | Knowledge base | Kategoriya daraxti + full-text qidiruv + rolga ko'rinish + versiyalash; maqola bir klik bilan darsga aylantiriladi |
| 5 | Assignments (topshiriq topshirish) | Xodim fayl/matn/havola topshiradi → `SUBMITTED` → tekshiruvchi ball va izoh qo'yadi → `GRADED` yoki `RETURNED` (qayta topshirish uchun) |
| 6 | Live training | Sig'imli ro'yxatdan o'tish, waitlist, davomat belgilash, eslatmalar, meeting havolasi; tadbir tugashi kursga progress berishi mumkin |
| 7 | Yagona kalendar | Tadbir + kurs deadline + topshiriq muddati + imtihon bitta `GET /calendar` javobida; `.ics` obunasi |
| 8 | Enrollment rules | Qoida: `{targetRoles, departments, branches, positions} → {courseIds, pathIds, deadline: +N kun}`; foydalanuvchi yaratilganda/o'zgarganda qayta baholanadi |
| 9 | Compliance / recurring | `RecurringAssignment`: har `N` oyda qayta biriktiriladi; sertifikat muddati tugashi ham trigger; compliance dashboard'i kurs×xodim matritsasi |
| 10 | Rejalashtirilgan hisobotlar | `ScheduledReport`: cron + filtrlar + qabul qiluvchilar → BullMQ → eksport → e-mail |
| 11 | SCORM 1.2/2004 import | Zip → `imsmanifest.xml` parse → S3'ga yoyish → iframe'da SCORM API adapteri → `ScormState` (CMI) serverda saqlanadi → `cmi.completion_status` kurs progressiga ulanadi |
| 12 | Public API + API kalitlari + OpenAPI | `/api/public/v1/*`, `Authorization: ApiKey <key>`, scope'lar, per-key rate limit, `zod`dan generatsiya qilingan OpenAPI hujjat |
| 13 | Webhooks | `course.completed`, `certificate.issued`, `user.created` va h.k.; HMAC-SHA256 imzo, 5 marta retry, `WebhookDelivery` jurnali |
| 14 | SSO (OIDC + JWT) | Tashqi IdP'dan kelgan token tekshiriladi → JIT foydalanuvchi yaratish → claim'lardan rol/bo'lim mapping |
| 15 | PWA + push | Manifest, service worker, Workbox precache, VAPID web push |
| 16 | Badge dvigateli | `Badge.criteria` (deklarativ qoida) → hodisa yuz berganda baholanadi → `UserBadge` + bildirishnoma |
| 17 | Settings modeli | `.env` o'rniga DB'dagi singleton `Settings` (Redis'da keshlangan), admin UI orqali tahrirlanadi; sirlar (`*_SECRET`, `*_KEY`) **`.env`da qoladi** |
| 18 | Ruxsat matritsasi UI | Rol × ruxsat checkbox grid; tizim rollari qulflangan |
| 19 | Media kutubxona | Barcha yuklangan fayllarning yagona ro'yxati, papkalar, qidiruv, "qayerda ishlatilgan", orphan tozalash |
| 20 | Subtitr / transkripsiya | ffmpeg pipeline'ga qo'shiladi; VTT saqlanadi; **video ichidan qidirish** shu orqali ochiladi |

## 3.3 MEDIUM / LOW
Matritsadagi (§2) `MEDIUM`/`LOW` belgilangan barcha qatorlar — Phase 6–10'ga
tarqatilgan (§17 ga qarang).

---

# 4. O'ZGARTIRISH TALAB QILADIGAN FUNKSIYALAR (EXTEND / REFACTOR)

## 4.1 REFACTOR (arxitektura o'zgaradi) — 6 ta

| # | Nima | Nega | Qanday | Xavf |
|---|---|---|---|---|
| 1 | **Question modeli** (`Quiz.questions[]`, `Assessment.questions[]` → `Question` + `QuestionBank`) | 13 savol turi va savol banki embed sxema ustiga qurib bo'lmaydi; ikkita model dublikat | Yangi kolleksiyalar + migratsiya skripti; eski attempt'lar tegilmaydi; API `questions[]`ni oldingidek qaytaradi (moslik) | O'rta — migratsiya bir martalik, dry-run bilan |
| 2 | **Notification delivery** (`notify()` → queue → kanal) | E-mail/push'siz LMS ishlamaydi; matnlar hardcoded | `deliveryQueue` + `NotificationTemplate` + `notificationPrefs`; `notify()` imzosi o'zgarmaydi | Past — additive |
| 3 | **ContentItem polimorfizmi** (`Video`/`Material`/`Assessment`/`Lesson` uchun umumiy baza) | Har yangi kontent turi 4 joyni o'zgartirishni talab qiladi (`topicContent`, progress, lock, completion) | Umumiy `ContentItem` (order, status, required, points, type) + har tur uchun detal kolleksiya; `topicContent.service` bitta so'rovga aylanadi | O'rta-yuqori — bosqichma-bosqich, avval yangi `Lesson` shu naqshda quriladi |
| 4 | **Admin API ruxsatlari** (ADMIN/MANAGER API'ga to'liq kira oladi, UI esa yopiq) | HOLAT.md'da "hal qilinmagan qaror" deb qayd etilgan xavfsizlik nomuvofiqligi | Ruxsat ro'yxatlarini UI bilan moslashtirish; MANAGER scope'i `managedUserIds` ga qisqartiriladi | O'rta — mavjud foydalanuvchilarga ta'sir qiladi, avval audit log bilan tekshiriladi |
| 5 | **Kurs qidiruvi** (`RegExp` → `$text`) | `new RegExp(search)` — indekssiz to'liq skan; katalog o'sganda sekinlashadi. (`user.repository` escape qiladi, `course.repository` **escape qilmaydi** — ReDoS xavfi) | `$text` indeks (title, description, tags); fallback prefix qidiruv | Past |
| 6 | **Signed URL host'i** | Loopback manzil bilan imzolanadi — brauzerda ishlamaydi | `S3_PUBLIC_ENDPOINT` yoki API stream | Past |

## 4.2 EXTEND (mavjud kod kengaytiriladi) — asosiylari

| Nima | Hozir | Qo'shiladi |
|---|---|---|
| `Course` modeli | title, slug, description, cover, banner, status, targeting | `categoryId`, `tags[]`, `level`, `authorIds[]`, `estimatedMinutes`, `prerequisiteCourseIds[]`, `certificateTemplateId`, `completionRule{}`, `navigationMode`, `validityDays`, `version` |
| `User` modeli | 20 maydon | `managerId`, `employeeNumber`, `locale`, `notificationPrefs{}`, `customFields{}`, `emailVerifiedAt`, `totpSecret`, `externalIds[]` |
| `Event` modeli | title, type, vaqt, joy, `participants[]` | `mode`, `trainerIds[]`, `capacity`, `meeting{}`, `remindBeforeMinutes[]`, `linkedCourseId` + alohida `EventRegistration` |
| `Group` modeli | statik a'zolar ro'yxati | `type: STATIC\|DYNAMIC`, `rule{}` (dinamik guruh) |
| `reminderJob` | kurs deadline + task | + tadbir eslatmasi, sertifikat muddati, onboarding qadami, compliance, path deadline; **bosqichli eslatma** (`remindAt: [7, 3, 1]` kun) |
| `reportData.service` | 5 tur, 4 filtr | + 8 yangi tur (`certificate`, `path-progress`, `event-attendance`, `login-activity`, `assignment-grading`, `compliance`, `onboarding`, `competency`); + `branch`, `groupId`, `pathId`, `managerId` filtrlari |
| `dashboardAggregation` | 10 karta + 5 ranked list | + test statistikasi, sertifikat, tadbir, path, compliance; + `scope` (company / branch / department / team) |
| `PERMISSIONS` | 24 kalit | + ~40 kalit (§10) |
| Rate limiting | 11 limiter | + per-API-key limiter, + eksport limiter |
| `assessmentSession` | faqat `Assessment` | `Quiz`ga ham kengaytiriladi (yagona `TestSession`) |
| Attention/face policy | kurs darajasida | learning path va tadbir darajasiga ham |

---

# 5. O'ZGARTIRILMAYDIGAN FUNKSIYALAR (KEEP)

Bu ro'yxatdagi kod **tegilmaydi**. Har biri yo iSpring darajasida, yo undan
yuqori. Yangi funksiyalar ular ustiga quriladi, ularni almashtirmaydi.

| Domen | Nima saqlanadi |
|---|---|
| **Video** | tus resumable upload, ffmpeg HLS pipeline, sifat darajalari, signed playback token, per-segment auth, watermark, `videoStream.service` |
| **Video analytics** | `watchedSegments` merge algoritmi, `uniqueWatchedSeconds`, anti-skip, tab-switch hisobi, `videoSession`, TTL'li raw event kolleksiyasi, batching |
| **Attention / proctoring** | `useAttentionMonitor`, MediaPipe kalibratsiya/kuzatuv kadensi, `proctorSnapshot` (yopiq bucket, 180 kun TTL, audit-logli kirish), `attentionPolicy` |
| **Face verification** | `faceProfile` (`select:false` embedding), challenge token oqimi, kunlik gate, lockout, `facePolicy` |
| **Auth** | argon2id, JWT + refresh rotation + reuse detection, CSRF double-submit, captcha, lockout, `Session` modeli |
| **RBAC** | Dinamik `roles` kolleksiyasi, permission-based middleware, resource-level tekshiruvlar, `packages/shared` yagona vokabulyar |
| **Sequential lock** | `courseSequence.js` — token berishda majburlanadi |
| **Assessment sessiyasi** | Server taymer, focus-loss hisobi, `TERMINATED` sabablari |
| **Material progress** | `viewedPages` to'plami (high-water mark emas) |
| **Points** | `PointsLedger` idempotentligi (sparse unique indeks) |
| **Chat** | DM, guruh, ovozli xabar, fayl, realtime, admin support inbox |
| **News + analytics** | Targeting, scroll milestone'lari, `timeSpentSeconds`, `NewsView` |
| **Soft delete / trash** | `deletedAt/deletedBy`, `trash.service`, tiklash |
| **Hisobot eksporti** | `reportExport.service` (CSV/XLSX/PDF), `reportI18n` (3 til), `MAX_ROWS` chegarasi |
| **Dashboard keshi** | `dashboardCache` + BullMQ pre-aggregation + `stale` bayrog'i |
| **Storage abstraksiyasi** | `StorageProvider` interfeysi, `S3StorageProvider` |
| **Arxitektura qatlamlari** | controller → service → repository → model; `ApiError`; `asyncHandler`; zod validatorlar |
| **UI tizimi** | `components/ui/*` (24 komponent), empty/loading/error holatlari, toast, confirm, dark/light |
| **i18n** | uz/ru/en, 1393 kalit, `reportI18n` |
| **Fayl xavfsizligi** | magic-byte tekshiruv (`file-type`), server-generated storage key, hajm chegaralari |

---

# 6. DATABASE O'ZGARISHLARI

## 6.1 Umumiy qoidalar (barcha yangi modellar uchun)

1. **Audit maydonlari majburiy:** `createdAt`, `updatedAt` (`{timestamps:true}`),
   `createdBy`, `updatedBy` (ObjectId → User). Foydalanuvchi yarata oladigan
   va o'chira oladigan har bir entity uchun `deletedAt`, `deletedBy` ham.
2. **Mavjud ma'lumot mosligi:** hech bir yangi maydon `required: true`
   bo'lmaydi, agar u eski hujjatlarda bo'lmasa — har doim `default` bilan.
   Migratsiya `$set` bilan backfill qiladi, sxema esa eski hujjatni ham
   o'qiy oladi.
3. **Har bir yangi kolleksiya hech bo'lmaganda bitta compound indeksga ega**
   bo'lishi kerak — uning eng ko'p ishlatiladigan so'rovi uchun.
4. **Nom bo'yicha bog'lanish** (`department`, `branch`, `position`) mavjud
   naqsh sifatida saqlanadi; yangi modellar ham shu nomlarni ishlatadi.
5. **Migratsiya skriptlari** `backend/src/scripts/` da, mavjud
   (`migrateUsernameToJshshir.js`, `backfillEmployeeNames.js`) naqshda:
   idempotent, `--dry-run` bayrog'i bilan, `console` hisobot bilan.

## 6.2 Mavjud modellarga qo'shiladigan maydonlar

### `users`
```js
managerId:        { type: ObjectId, ref: 'User', default: null },   // index
employeeNumber:   { type: String,  default: '' },
locale:           { type: String,  enum: ['uz','ru','en'], default: 'uz' },
emailVerifiedAt:  { type: Date,    default: null },
totpSecret:       { type: String,  default: null, select: false },
notificationPrefs:{ type: Object,  default: {} },  // { COURSE_ASSIGNED: {email:true, push:true, telegram:false}, ... }
customFields:     { type: Object,  default: {} },
externalIds:      { type: [{ provider: String, subject: String }], default: [] },
telegramChatId:   { type: String,  default: null },
deletedAt:        { type: Date,    default: null },
deletedBy:        { type: ObjectId, ref: 'User', default: null },
```
Indekslar: `{managerId:1}`, `{'externalIds.provider':1,'externalIds.subject':1}` unique partial,
`{fullName:'text', jshshir:'text', email:'text'}` (global qidiruv uchun).

### `courses`
```js
categoryId:            { type: ObjectId, ref: 'CourseCategory', default: null },
tags:                  { type: [String], default: [] },
level:                 { type: String, enum: ['BEGINNER','INTERMEDIATE','ADVANCED',''], default: '' },
authorIds:             { type: [ObjectId], ref: 'User', default: [] },
estimatedMinutes:      { type: Number, default: 0 },
prerequisiteCourseIds: { type: [ObjectId], ref: 'Course', default: [] },
certificateTemplateId: { type: ObjectId, ref: 'CertificateTemplate', default: null },
navigationMode:        { type: String, enum: ['SEQUENTIAL','FREE'], default: 'SEQUENTIAL' },
validityDays:          { type: Number, default: null },
version:               { type: Number, default: 1 },
completionRule: {
  requireAllRequired:  { type: Boolean, default: true },
  minScorePercent:     { type: Number,  default: null },
  requireFinalTest:    { type: Boolean, default: false },
},
allowSelfEnroll:       { type: Boolean, default: true },
```
Indekslar: `{categoryId:1, status:1}`, `{tags:1}`, `{title:'text', description:'text', tags:'text'}`.
> ⚠️ `navigationMode` default `SEQUENTIAL` — mavjud xatti-harakat aynan shunday, ya'ni backfill'siz ham eski kurslar bir xil ishlaydi.

### `events`
```js
mode:                 { type: String, enum: ['ONLINE','OFFLINE','HYBRID'], default: 'OFFLINE' },
trainerIds:           { type: [ObjectId], ref: 'User', default: [] },
capacity:             { type: Number, default: null },      // null = cheksiz
registeredCount:      { type: Number, default: 0 },         // denormalizatsiya, atomik $inc
meeting:              { provider: String, url: String, externalId: String },
remindBeforeMinutes:  { type: [Number], default: [1440, 60] },
linkedCourseId:       { type: ObjectId, ref: 'Course', default: null },
requiresRegistration: { type: Boolean, default: false },
status:               { type: String, enum: ['SCHEDULED','CANCELLED','COMPLETED'], default: 'SCHEDULED' },
```

### `groups`
```js
type: { type: String, enum: ['STATIC','DYNAMIC'], default: 'STATIC' },
rule: { type: Object, default: null },   // { branches:[], departments:[], positions:[], roles:[] }
```

### `materials`
```js
allowDownload: { type: Boolean, default: true },
altText:       { type: String,  default: '' },
```

### `notifications`
```js
channels:  { type: [String], default: ['IN_APP'] },   // IN_APP, EMAIL, PUSH, TELEGRAM
deliveredAt: { type: Object, default: {} },           // { EMAIL: Date, PUSH: Date }
templateKey: { type: String, default: '' },
payload:     { type: Object, default: {} },           // placeholder qiymatlari
```

## 6.3 Yangi kolleksiyalar

> Quyida faqat **maydonlar va indekslar** berilgan. Har birida §6.1 dagi
> audit maydonlari nazarda tutiladi.

### Phase 1 — Core

**`courseCategories`** — `name`, `nameKey` (unique, `Branch` naqshi), `parentId`, `order`, `icon`
· indeks: `{parentId:1, order:1}`, `{nameKey:1}` unique

**`certificateTemplates`** — `name`, `backgroundKey` (S3), `pageSize` (`A4_LANDSCAPE`),
`fields[]{key, label, x, y, fontSize, fontFamily, color, align}`, `validityMonths`,
`isDefault`, `qrEnabled`, `qrX`, `qrY`
· `key` qiymatlari: `learnerName | courseTitle | completedAt | scorePercent | instructorName | serial | issuedAt | expiresAt`

**`certificates`** — `serial` (ULID, unique), `userId`, `sourceType` (`COURSE|PATH|EVENT|EXTERNAL`),
`sourceId`, `templateId`, `learnerName`, `sourceTitle`, `scorePercent`, `issuedAt`,
`expiresAt`, `pdfKey`, `revokedAt`, `revokedReason`, `renewedFromId`
· indeks: `{serial:1}` unique · `{userId:1, issuedAt:-1}` · `{userId:1, sourceType:1, sourceId:1}` unique partial (`revokedAt: null`) · `{expiresAt:1}` (compliance job)

**`externalCertificates`** — `userId`, `title`, `issuer`, `issuedAt`, `expiresAt`,
`fileKey`, `verifiedBy`, `verifiedAt`
· indeks: `{userId:1, issuedAt:-1}`

**`questionBanks`** — `name`, `description`, `courseId` (null = global), `tags[]`
· indeks: `{courseId:1}`

**`questions`** — `bankId`, `type` (13 qiymat), `text`, `explanation`, `points`,
`penalty`, `tags[]`, `difficulty`, `media{key,type,altText}`, `payload` (turga xos)
· `payload` shakllari:
```
SINGLE_CHOICE / MULTI_CHOICE : { options: [{id, text, isCorrect, feedback}] }
TRUE_FALSE                   : { correct: Boolean }
SHORT_ANSWER                 : { accepted: [String], caseSensitive: Boolean }
NUMERIC                      : { value: Number, tolerance: Number }
MATCHING                     : { pairs: [{left, right}] }
SEQUENCE                     : { items: [String] }          // to'g'ri tartibda
FILL_BLANK                   : { template: String, blanks: [{accepted:[String]}] }
SELECT_LIST                  : { blanks: [{options:[String], correctIndex}] }
HOTSPOT                      : { imageKey, areas: [{x,y,w,h,isCorrect}] }
LIKERT                       : { scale: Number, labels: [String] }
DRAG_DROP / DRAG_WORDS       : { zones: [{id,label}], items: [{id,text,zoneId}] }
ESSAY                        : { minWords, maxWords, rubricId }
```
· indeks: `{bankId:1, type:1}`, `{tags:1}`, `{text:'text'}`

**`quizzes`** (mavjud `quiz` + `assessment` o'rniga umumlashtiriladi) —
`scope` (`VIDEO|TOPIC|COURSE|PATH`), `scopeId`, `title`, `questionIds[]`,
`pools[]{bankId, count, tags[]}`, `passScorePercent`, `maxAttempts`,
`timeLimitMinutes`, `shuffleQuestions`, `shuffleOptions`, `partialCredit`,
`revealMode`, `scorePolicy` (`LAST|BEST|FIRST|AVERAGE`), `focusLossLimit`,
`pointsEnabled`, `points`, `status`, `order`
· indeks: `{scope:1, scopeId:1}`

**`testSessions`** (mavjud `assessmentSession` umumlashtirilgan) —
`userId`, `quizId`, `courseId`, `startedAt`, `expiresAt`, `focusLossCount`,
`status`, `endedReason`, `endedAt`, `questionSet[]{questionId, optionOrder[]}`, `seed`
· indeks: `{userId:1, quizId:1, status:1}`

**`quizAttempts`** (mavjud kengaytiriladi) — `+ answers[].payload` (turga xos javob),
`+ perQuestion[]{questionId, awarded, max, correct}`, `+ sessionId`, `+ attemptNo`, `+ gradedBy`, `+ gradedAt`

**`learningPaths`** — `title`, `slug`, `description`, `cover`, `kind`
(`GENERAL|ONBOARDING|CERTIFICATION|DEVELOPMENT`), `status`, `sequential`,
`items[]{type, refId, order, required, prerequisiteIds[]}`,
`sections[]{title, order, itemIds[]}`, `targetRoles[]`, `branches[]`,
`department`, `certificateTemplateId`, `validityDays`
· indeks: `{slug:1}` unique, `{status:1, kind:1}`

**`pathEnrollments`** — `userId`, `pathId`, `assignedBy`, `groupId`, `mandatory`,
`startAt`, `deadline`, `expiresAt`, `status`, `itemStates[]{refId, status, completedAt}`,
`completionPercent`, `completedAt`, `deadlineReminderSentAt`
· indeks: `{userId:1, pathId:1}` unique, `{deadline:1, status:1}`

**`settings`** — singleton (`_id: 'global'`): `branding{}`, `mail{}`,
`notifications{}`, `gamification{}`, `grading{}`, `locale{}`, `security{}`
· Redis'da 60 s keshlanadi; sirlar bu yerda **saqlanmaydi**

**`notificationTemplates`** — `type`, `channel`, `lang`, `subject`, `body`, `isSystem`
· indeks: `{type:1, channel:1, lang:1}` unique

**`mailLogs`** / **`deliveryLogs`** — `notificationId`, `userId`, `channel`,
`status` (`QUEUED|SENT|FAILED|BOUNCED`), `error`, `attempts`, `sentAt`
· indeks: `{userId:1, createdAt:-1}`, TTL 90 kun

**`pushSubscriptions`** — `userId`, `endpoint` (unique), `keys{p256dh,auth}`, `userAgent`, `lastSeenAt`

### Phase 2 — Learning management

**`assignments`** (uy vazifasi) — `topicId`, `courseId`, `title`, `instructions`,
`submissionTypes[]` (`FILE|TEXT|LINK`), `dueAt`, `allowLate`, `lateWindowHours`,
`maxAttempts`, `rubricId`, `maxScore`, `reviewerIds[]`, `status`, `order`
· indeks: `{topicId:1, order:1}`

**`submissions`** — `assignmentId`, `userId`, `attemptNo`, `text`, `files[]{key,name,size,mime}`,
`links[]`, `submittedAt`, `status` (`DRAFT|SUBMITTED|GRADED|RETURNED`),
`score`, `feedback`, `rubricScores[]`, `gradedBy`, `gradedAt`
· indeks: `{assignmentId:1, userId:1, attemptNo:1}` unique, `{status:1, gradedAt:1}`

**`rubrics`** — `name`, `criteria[]{label, description, maxScore, levels[]{label,score}}`

**`eventRegistrations`** — `eventId`, `userId`, `status`
(`REGISTERED|WAITLIST|CANCELLED|ATTENDED|NO_SHOW`), `registeredAt`,
`attendedAt`, `markedBy`, `waitlistPosition`
· indeks: `{eventId:1, userId:1}` unique, `{eventId:1, status:1}`

**`onboardingPrograms`** — `name`, `description`, `targetRoles[]`, `departments[]`,
`positions[]`, `branches[]`, `steps[]{type, refId, title, dueDays, required, ownerRole}`,
`autoStart`, `status`
· `step.type`: `COURSE|PATH|TASK|EVENT|ASSIGNMENT|KB_ARTICLE|MANUAL`

**`onboardingEnrollments`** — `userId`, `programId`, `mentorId`, `managerId`,
`startedAt`, `dueAt`, `stepStates[]{stepId, status, dueAt, completedAt, completedBy}`,
`completionPercent`, `status`
· indeks: `{userId:1, programId:1}` unique, `{status:1, dueAt:1}`

**`enrollmentRules`** — `name`, `active`, `match{roles[],departments[],branches[],positions[],groups[]}`,
`grant{courseIds[],pathIds[],deadlineDays,mandatory}`, `lastEvaluatedAt`
· indeks: `{active:1}`

**`recurringAssignments`** — `courseId`/`pathId`, `audience{}` (enrollmentRule bilan bir xil),
`intervalMonths`, `dueDays`, `nextRunAt`, `lastRunAt`, `active`
· indeks: `{active:1, nextRunAt:1}`

**`scheduledReports`** — `name`, `reportType`, `filters{}`, `format`, `lang`,
`cron`, `recipientUserIds[]`, `recipientEmails[]`, `active`, `lastRunAt`, `lastStatus`
· indeks: `{active:1}`

**`exportJobs`** — `userId`, `reportType`, `filters{}`, `format`, `status`,
`fileKey`, `rowCount`, `error`, `expiresAt` (TTL 7 kun)

### Phase 3 — Advanced learning

**`kbCategories`** — `name`, `nameKey`, `parentId`, `order`, `icon`
**`kbArticles`** — `title`, `slug`, `categoryId`, `kind` (`ARTICLE|FAQ|POLICY|SOP|GUIDE`),
`contentHtml` (sanitize'langan), `summary`, `tags[]`, `attachments[]`,
`targetRoles[]`, `branches[]`, `departments[]`, `allowDownload`, `status`,
`publishedAt`, `reviewerId`, `reviewedAt`, `nextReviewAt`, `version`
· indeks: `{slug:1}` unique, `{categoryId:1, status:1}`, `{title:'text', summary:'text', contentText:'text', tags:'text'}`
**`kbArticleVersions`** — `articleId`, `version`, `snapshot{}`, `createdBy`
**`kbViews`** — `NewsView` naqshi: `userId`, `articleId`, `openCount`, `maxScrollDepth`, `timeSpentSeconds`, `completed`
**`kbComments`** — `articleId`, `userId`, `text`, `parentId`, `resolvedAt`

**`badges`** — `code`, `name{uz,ru,en}`, `description{}`, `iconKey`, `criteria{}`, `points`, `active`
· `criteria` shakli: `{ metric: 'videosCompleted'|'quizzesPassed'|'totalPoints'|'coursesCompleted'|'streakDays'|'certificatesEarned', op: 'gte', value: N }`
**`userBadges`** — `userId`, `badgeCode`, `awardedAt` · indeks: `{userId:1, badgeCode:1}` unique

**`recommendations`** — `userId`, `items[]{type, refId, reason, score}`, `generatedAt` (TTL 7 kun)

### Phase 4 — Assessment & performance

**`competencies`** — `name`, `description`, `categoryId`, `levels[]{label, description, score}`
**`userCompetencies`** — `userId`, `competencyId`, `currentScore`, `targetScore`, `source`, `assessedAt`
· indeks: `{userId:1, competencyId:1}` unique

**`reviewTemplates`** — `name`, `competencyIds[]`, `questions[]` (Likert + ochiq savol), `relations[]`
**`reviewCycles`** — `name`, `templateId`, `opensAt`, `closesAt`, `subjectIds[]`, `status`, `minResponsesForAnonymity` (default 3)
**`reviewAssignments`** — `cycleId`, `subjectId`, `reviewerId`, `relation` (`SELF|MANAGER|PEER|SUBORDINATE`), `status`
· indeks: `{cycleId:1, reviewerId:1}`, `{cycleId:1, subjectId:1}`
**`reviewResponses`** — `assignmentId`, `answers[]`, `submittedAt` · reviewer identifikatori **agregatsiyada ochilmaydi**

**`ojtChecklists`** — `name`, `positionTargets[]`, `criteria[]{competencyId, label, maxScore, weight}`
**`ojtSessions`** — `checklistId`, `employeeId`, `trainerId`, `scheduledAt`, `startedAt`, `completedAt`, `status`, `averageScore`
**`ojtObservations`** — `sessionId`, `observedAt`, `scores[]{criterionId, score, comment}`, `overallComment`, `observerId`

**`developmentPlans`** — `userId`, `templateId`, `periodFrom`, `periodTo`,
`goals[]{title, competencyId, items[]{type,refId}, plannedPoints, dueAt, status}`,
`plannedPoints`, `achievedPoints`, `status`, `managerId`, `mentorId`
**`planReviews`** — `planId`, `reviewerId`, `role`, `comment`, `rating`, `createdAt`

### Phase 5–7 — AI, enterprise, authoring

**`aiGenerationJobs`** — `userId`, `kind` (`COURSE|QUIZ|TRANSLATION|TEXT`),
`sourceKeys[]`, `params{}`, `status`, `resultRef`, `tokensUsed`, `cost`, `error`
**`contentTranslations`** — `entityType`, `entityId`, `lang`, `fields{}`, `source` (`HUMAN|AI`), `reviewedBy`, `reviewedAt`
· indeks: `{entityType:1, entityId:1, lang:1}` unique

**`apiKeys`** — `name`, `keyHash`, `prefix`, `scopes[]`, `rateLimitPerMinute`, `lastUsedAt`, `expiresAt`, `revokedAt`
**`webhooks`** — `url`, `events[]`, `secret`, `active`, `failureCount`
**`webhookDeliveries`** — `webhookId`, `event`, `payload`, `status`, `responseCode`, `attempts`, `nextRetryAt` (TTL 30 kun)
**`ssoConfigs`** — `provider`, `issuer`, `clientId`, `clientSecretRef`, `mapping{}`, `active`

**`lessons`** — `topicId`, `courseId`, `title`, `blocks[]{type, order, payload}`,
`estimatedMinutes`, `status`, `order`, `required`, `pointsEnabled`, `points`
· `block.type`: `TEXT|IMAGE|VIDEO_REF|AUDIO_REF|FILE_REF|EMBED|QUIZ_REF|CALLOUT|DIVIDER|TABS|ACCORDION|CODE`
**`lessonProgress`** — `userId`, `lessonId`, `courseId`, `scrolledPercent`, `blocksSeen[]`, `timeSpentSeconds`, `completedAt`
· indeks: `{userId:1, lessonId:1}` unique

**`scormPackages`** — `courseId`, `topicId`, `version` (`1.2|2004`), `entryPath`, `storagePrefix`, `manifest{}`
**`scormStates`** — `userId`, `packageId`, `cmi{}`, `completionStatus`, `successStatus`, `scoreRaw`, `totalTime`, `suspendData`
· indeks: `{userId:1, packageId:1}` unique
**`xapiStatements`** — `actor{}`, `verb{}`, `object{}`, `result{}`, `context{}`, `stored` · TTL 365 kun

**`mediaAssets`** — `key`, `folderId`, `type`, `mimeType`, `size`, `width`, `height`,
`duration`, `altText`, `usageRefs[]{entityType, entityId}`, `uploadedBy`
· indeks: `{folderId:1}`, `{key:1}` unique, `{'usageRefs.entityId':1}`

## 6.4 Migratsiya strategiyasi

| # | Migratsiya | Turi | Qaytarib bo'ladimi |
|---|---|---|---|
| M1 | `Quiz.questions[]` + `Assessment.questions[]` → `Question` + `QuestionBank`; `Quiz`/`Assessment` → yagona `quizzes` | Ma'lumot ko'chirish | ✅ Ha — eski kolleksiyalar `_legacy` suffiksi bilan saqlanadi, 2 relizdan keyin o'chiriladi |
| M2 | `user.managerId` backfill (XLSX import yoki HR ma'lumotidan) | Backfill | ✅ |
| M3 | `course.navigationMode='SEQUENTIAL'`, `completionRule` default'lari | `$set` backfill | ✅ |
| M4 | `user.locale='uz'`, `notificationPrefs` default'lari | `$set` backfill | ✅ |
| M5 | `assessmentSession` → `testSession` (nom o'zgarishi + `questionSet` bo'sh) | Rename + backfill | ✅ |
| M6 | `Event.participants[]` → `EventRegistration` yozuvlari (`status=REGISTERED`) | Ko'chirish | ✅ |
| M7 | `badgeDefinitions.js` (hardcoded) → `badges` kolleksiyasi seed'i | Seed | ✅ |
| M8 | Text indekslar yaratish (`courses`, `users`, `kbArticles`) | Indeks | ✅ (background: true) |
| M9 | Bildirishnoma matnlari → `notificationTemplates` seed (uz/ru/en × 25 tur × 3 kanal) | Seed | ✅ |

**Qoida:** har bir migratsiya `--dry-run` bilan boshlanadi, natijasi hisobot
sifatida chiqadi, va **faqat backup olingandan keyin** ishga tushiriladi.

---

# 7. BACKEND O'ZGARISHLARI

Mavjud qatlamlash (`controller → service → repository → model`) **saqlanadi**.
Har bir yangi domen aynan shu naqshda quriladi: `models/X.model.js`,
`repositories/X.repository.js`, `services/<domain>/X.service.js`,
`controllers/X.controller.js`, `routes/v1/x.routes.js`, `validators/x.validator.js`.

## 7.1 Yangi servislar (domen bo'yicha)

| Papka | Servislar |
|---|---|
| `services/certificates/` | `certificate.service.js`, `certificateTemplate.service.js`, `certificateRender.service.js` (pdfkit), `certificateVerify.service.js` |
| `services/notifications/` | `notification.service.js` (mavjud, kengaytiriladi), `notificationTemplate.service.js`, `delivery.service.js`, `mail.service.js`, `push.service.js`, `telegram.service.js`, `preferences.service.js` |
| `services/paths/` | `learningPath.service.js`, `pathEnrollment.service.js`, `pathProgress.service.js`, `pathSequence.js` |
| `services/questions/` | `question.service.js`, `questionBank.service.js`, `questionGrading.js` (13 tur uchun baholash), `questionSelection.js` (pool + shuffle) |
| `services/quizzes/` | `quiz.service.js` (**refactor**), `testSession.service.js`, `quizStats.service.js` |
| `services/assignments/` | `assignment.service.js`, `submission.service.js`, `grading.service.js`, `rubric.service.js` |
| `services/events/` | `event.service.js` (mavjud), `eventRegistration.service.js`, `attendance.service.js`, `meetingProvider/{zoom,googleMeet}.js` |
| `services/calendar/` | `calendar.service.js` (agregator), `ical.service.js` |
| `services/onboarding/` | `onboardingProgram.service.js`, `onboardingEnrollment.service.js` |
| `services/kb/` | `kbArticle.service.js`, `kbCategory.service.js`, `kbVersion.service.js`, `kbSearch.service.js` |
| `services/search/` | `globalSearch.service.js` |
| `services/org/` | `orgList.service.js` (mavjud), `orgHierarchy.service.js`, `managerScope.js` |
| `services/gamification/` | `points.service.js` (mavjud), `badge.service.js`, `level.service.js`, `leaderboard.service.js` |
| `services/compliance/` | `recurringAssignment.service.js`, `complianceReport.service.js` |
| `services/automation/` | `enrollmentRule.service.js`, `automationEngine.js` |
| `services/competency/` | `competency.service.js`, `userCompetency.service.js` |
| `services/reviews/` | `reviewCycle.service.js`, `reviewAssignment.service.js`, `reviewAggregation.service.js` (anonimlik chegarasi) |
| `services/ojt/` | `ojtChecklist.service.js`, `ojtSession.service.js`, `ojtObservation.service.js` |
| `services/plans/` | `developmentPlan.service.js`, `planReview.service.js` |
| `services/ai/` | `aiChat.service.js` (mavjud), `aiCourse.service.js`, `aiQuiz.service.js`, `aiTranslate.service.js`, `aiText.service.js`, `sourceExtract.service.js` (pdf/docx/pptx→matn) |
| `services/integrations/` | `apiKey.service.js`, `webhook.service.js`, `sso.service.js`, `oidcClient.js` |
| `services/scorm/` | `scormImport.service.js`, `scormRuntime.service.js`, `xapi.service.js` |
| `services/media/` | `mediaAsset.service.js`, `mediaCleanup.service.js`, `imageOptimize.service.js` |
| `services/settings/` | `settings.service.js` (Redis keshli singleton) |
| `services/users/` | `user.service.js` (mavjud), `userImport.service.js`, `customField.service.js` |
| `services/reports/` | mavjud + `scheduledReport.service.js`, `exportJob.service.js`, `reportDefinition.service.js` |

## 7.2 Yangi middleware'lar

| Fayl | Vazifa |
|---|---|
| `apiKeyAuth.middleware.js` | `Authorization: ApiKey <key>` → `ApiKey` hash bo'yicha izlash, scope tekshirish, `lastUsedAt` yangilash |
| `apiKeyRateLimit.middleware.js` | Per-key Redis limiter (mavjud `rateLimit` naqshi) |
| `scopeToManagedUsers.middleware.js` | MANAGER uchun `req.managedUserIds` ni hisoblab qo'yish (`$graphLookup` + 5 daq Redis kesh) |
| `publicEndpointGuard.middleware.js` | Sertifikat tekshiruv sahifasi uchun: auth'siz, lekin qattiq rate limit + minimal ma'lumot |
| `idempotency.middleware.js` | `Idempotency-Key` sarlavhasi (offline sinxronizatsiya va public API uchun) |

## 7.3 Yangi background job'lar (BullMQ)

Mavjud naqsh (`jobs/*Queue.js` + `repeat: {every: N}` + `jobId`) saqlanadi.

| Queue | Trigger | Vazifa |
|---|---|---|
| `deliveryQueue` | `notify()` chaqiruvidan | E-mail / push / Telegram yuborish, retry (5×, exponential) |
| `certificateQueue` | Kurs/path tugaganda | PDF render → S3 → `Certificate` yangilash → notify |
| `complianceQueue` | Kunlik 02:00 | Sertifikat muddati, takroriy o'qitish, `nextRunAt` bo'yicha qayta biriktirish |
| `scheduledReportQueue` | Har soat | `cron` mos keladigan `ScheduledReport`larni bajarish |
| `exportQueue` | Foydalanuvchi so'rovi | Katta eksportlar (>5000 satr) — fayl tayyor bo'lganda notify |
| `enrollmentRuleQueue` | User create/update + kunlik | Qoidalarni qayta baholash, yangi assignment yaratish |
| `onboardingQueue` | Kunlik 03:00 | `hireDate` bo'yicha yangi onboarding boshlash, kechikkan qadamlarni eslatish |
| `aiGenerationQueue` | Foydalanuvchi so'rovi | Kurs/test/tarjima generatsiyasi (uzoq davom etadi) |
| `mediaCleanupQueue` | Haftalik | Orphan fayllarni topish (DB'da havolasi yo'q) → hisobot → 30 kundan keyin o'chirish |
| `webhookQueue` | Domen hodisasi | Webhook yetkazish + retry |
| `searchIndexQueue` | Kontent o'zgarganda | Matn ajratish (PDF/DOCX) → `contentText` maydonini yangilash |
| `backupQueue` | Kunlik 01:00 | `mongodump` → shifrlash → S3 |

## 7.4 Mavjud kodga aniq o'zgarishlar

| Fayl | O'zgarish |
|---|---|
| `services/notifications/notification.service.js` | `notify()` oxirida `deliveryQueue.add()`; `templateKey` + `payload` qabul qilish |
| `jobs/reminderJob.js` | Hardcoded inglizcha matnlarni `templateKey`ga almashtirish; tadbir/sertifikat/onboarding/path eslatmalarini qo'shish; bosqichli eslatma (`[7,3,1]` kun) |
| `services/quizzes/quiz.service.js` | `Question` modeliga o'tish; `maxAttempts` guard; `revealMode`; qisman ball; `testSession` bilan integratsiya |
| `services/assessments/assessment.service.js` | `quiz.service`ga birlashtiriladi; `ASSESSMENT_TIME_LIMIT_MINUTES` konstantasi `quiz.timeLimitMinutes` maydoniga ko'chadi |
| `services/courses/course.service.js` | `completionRule` bo'yicha tugatishni hisoblash; tugaganda `certificateQueue` + `COURSE_COMPLETED` notify |
| `services/courses/courseSequence.js` | `navigationMode==='FREE'` bo'lsa lock'ni o'tkazib yuborish |
| `services/courses/courseVisibility.js` | `LearningPath` va `KbArticle` uchun ham qayta ishlatiladigan qilib umumlashtirish (`isVisibleToActor(actor, doc)`) |
| `repositories/course.repository.js` | `buildFilter` — `RegExp` → `$text`; `categoryId`, `tags`, `level`, `authorId` filtrlari |
| `services/reports/reportData.service.js` | 8 yangi hisobot turi; `branch`/`groupId`/`pathId`/`managerId` filtrlari |
| `analytics/dashboardAggregation.js` | Test/sertifikat/tadbir/path/compliance metrikalari; `scope` parametri |
| `realtime/socket.js` | `socket.io-redis-adapter` qo'shish (bir nechta instansiya uchun) |
| `packages/shared/permissions.js` | ~40 yangi ruxsat kaliti (§10) + yangi rollar (`AUTHOR`, `MENTOR`) |
| `app.js` | `/api/public/v1` router; `/api/docs` (OpenAPI); helmet CSP sozlash (SCORM iframe uchun) |
| `config/env.js` | `SMTP_*`, `VAPID_*`, `TELEGRAM_BOT_TOKEN`, `S3_PUBLIC_ENDPOINT`, `OIDC_*`, `SENTRY_DSN` |

## 7.5 Testlar (hozir deyarli yo'q — 3 fayl)

Har bir yangi domen uchun **majburiy minimum**:
- Baholash mantiqi: `questionGrading` — 13 savol turi × to'g'ri/noto'g'ri/qisman
- Progress: `watchedSegments` merge (mavjud algoritm uchun ham regressiya testi)
- Kirish nazorati: har bir yangi endpoint uchun 401/403 testi (mavjud `security.test.js` naqshi)
- Idempotentlik: sertifikat berish, ball berish, webhook yetkazish
- Migratsiyalar: `--dry-run` natijasi kutilganidek

---

# 8. FRONTEND O'ZGARISHLARI

## 8.1 Yangi umumiy komponentlar (avval qurilishi shart)

Bularsiz har bir yangi sahifada kod takrorlanadi:

| Komponent | Nima uchun |
|---|---|
| `ui/DataTable.vue` | Saralash, ustun tanlash, satr tanlash, bulk bar, kursorli pagination, bo'sh/yuklanmoqda holatlari. **12+ sahifada ishlatiladi** |
| `ui/FilterBar.vue` | Sana oralig'i, ko'p tanlovli select'lar, saqlangan filtrlar, URL sinxronizatsiyasi |
| `ui/RichTextEditor.vue` | KB, dars, e'lon, topshiriq ko'rsatmasi uchun (sanitize'langan HTML) |
| `ui/FileDropzone.vue` | Drag-and-drop, progress, ko'p fayl, tur/hajm validatsiyasi |
| `ui/SortableList.vue` | Kontent tartibi, path item'lari, onboarding qadamlari |
| `ui/Chart.vue` | Yagona grafik abstraksiyasi (mavjud `TrendChart` shu ostiga ko'chadi): line, bar, donut, radar |
| `ui/CommandPalette.vue` | ⌘K global qidiruv |
| `ui/StepWizard.vue` | Mavjud `CourseBuilderView` stepper'i umumlashtiriladi |
| `ui/UserPicker.vue` | Foydalanuvchi/guruh/bo'lim tanlash (autocomplete) |
| `ui/EmptyState`, `Skeleton`, `ErrorState`, `Modal`, `Drawer`, `Tabs` | **Mavjud — qayta ishlatiladi** |

## 8.2 Yangi sahifalar

### Xodim tomoni (`front/src/views/`)
| Sahifa | Marshrut |
|---|---|
| `PathsView`, `PathDetailView` | `/paths`, `/paths/:id` |
| `CertificatesView` | `/certificates` |
| `KbView`, `KbArticleView` | `/kb`, `/kb/:slug` |
| `CalendarView` | `/calendar` (mavjud `EventsView` shu ichiga kiradi) |
| `EventDetailView` | `/events/:id` (ro'yxatdan o'tish) |
| `AssignmentView` | `/assignments/:id` (topshirish) |
| `OnboardingView` | `/onboarding` |
| `DevelopmentPlanView` | `/development-plan` |
| `LessonView` | `/lessons/:id` (blokli dars o'quvchisi) |
| `Review360View` | `/reviews/:id` |
| `OjtSessionView` | `/ojt/:id` (mobil-birinchi) |
| `LearningHistoryView` | `/history` |
| `ScormPlayerView` | `/scorm/:id` |

### Admin tomoni (`front/src/admin/views/`)
| Sahifa | Marshrut |
|---|---|
| `PathsListView`, `PathBuilderView` | `/bos/paths`, `/bos/paths/:id` |
| `CertificateTemplatesView`, `CertificateTemplateEditor` | `/bos/certificates` |
| `QuestionBanksView`, `QuestionBankEditor` | `/bos/question-banks` |
| `QuizEditorView` | `/bos/quizzes/:id` (13 savol turi) |
| `KbAdminView`, `KbArticleEditor` | `/bos/kb` |
| `EventsAdminView`, `EventDetailAdminView` | `/bos/events` (davomat) |
| `AssignmentsGradingView` | `/bos/grading` (tekshirish navbati) |
| `OnboardingProgramsView` | `/bos/onboarding` |
| `EnrollmentRulesView` | `/bos/automation` |
| `ComplianceView` | `/bos/compliance` (kurs × xodim matritsasi) |
| `AuditLogView` | `/bos/audit` |
| `RolesPermissionsView` | `/bos/roles` |
| `SettingsAdminView` | `/bos/settings/system` (mavjud `SettingsView` kengayadi) |
| `MediaLibraryView` | `/bos/media` |
| `ManagerDashboardView` | `/bos/team` (MANAGER uchun asosiy sahifa) |
| `ScheduledReportsView` | `/bos/reports/scheduled` |
| `ReportBuilderView` | `/bos/reports/builder` |
| `OrgChartView` | `/bos/org-chart` |
| `CompetenciesView` | `/bos/competencies` |
| `ReviewCyclesView` | `/bos/reviews-360` |
| `OjtChecklistsView` | `/bos/ojt` |
| `ApiKeysView`, `WebhooksView` | `/bos/integrations` |
| `AiStudioView` | `/bos/ai` (kurs generatsiyasi) |
| `BadgesView` | `/bos/gamification` |

## 8.3 State (Pinia) — kengaytirish

Hozir 4 store bor. Yangi domenlar uchun kerak:
`settings` (branding + global sozlamalar, bir marta yuklanadi),
`notifications` (mavjud composable store'ga ko'chadi),
`search` (oxirgi qidiruvlar, palitra holati),
`catalog` (kategoriya/teg ro'yxati — keshlanadi),
`offline` (sinxronizatsiya navbati holati).

**Qoida:** faqat **bir nechta sahifa o'rtasida bo'linadigan** holat store'ga
kiradi; sahifa ichidagi holat `ref` bo'lib qoladi (mavjud naqsh to'g'ri).

## 8.4 PWA

`vite-plugin-pwa` qo'shiladi: manifest (nom, ikonkalar 192/512, `display: standalone`,
`theme_color`), Workbox strategiyalari — app shell precache, API `NetworkFirst`,
media `CacheFirst`. Offline navbat: IndexedDB (`idb`), Background Sync API,
`clientEventId` bilan idempotent yuborish.

## 8.5 Accessibility ishlari

Barcha yangi komponentlar uchun **qabul mezoni**: klaviatura bilan to'liq
boshqarish, `:focus-visible` ko'rinadigan halqa, modal/drawer'da focus-trap +
Escape, forma maydonlarida `label`/`aria-describedby`, rasm yuklashda `altText`
majburiy, video pleyerda klaviatura shortcut'lari va subtitr tugmasi.
CI'ga `axe-core` smoke testi qo'shiladi.

## 8.6 O'chiriladigan kod

`admin/` papkasi (front ichiga birlashtirilgan, HOLAT.md'da qayd etilgan) —
**o'chiriladi**. `deploy/spring/` va `deploy/qollanma.techinfo.uz/` eskirgan
(deploy maqsadi home server'ga ko'chgan) — arxivga.

---

# 9. API O'ZGARISHLARI

## 9.1 Qoidalar

- Mavjud `/api/v1` **buzilmaydi**. Yangi endpoint'lar qo'shiladi, mavjudlari
  faqat **additive** o'zgaradi (yangi ixtiyoriy query parametrlari, javobda
  yangi maydonlar).
- Javob envelope'i o'zgarmaydi (`{ data, meta }` / `ApiError` formati).
- Pagination har doim kursorli (mavjud `nextCursor` naqshi).
- Yangi tashqi API — alohida prefiks: `/api/public/v1` (API-key auth).
- OpenAPI hujjati `zod` sxemalaridan generatsiya qilinadi → `GET /openapi.json`,
  `GET /api/docs`.

## 9.2 Yangi endpoint'lar (domen bo'yicha)

```
# Sertifikatlar
GET    /certificate-templates              POST /certificate-templates
PATCH  /certificate-templates/:id          DELETE /certificate-templates/:id
POST   /certificate-templates/:id/preview  -> PDF namuna
GET    /certificates?userId=&courseId=     GET /certificates/:id
GET    /certificates/:id/pdf               POST /certificates/:id/revoke
GET    /users/:id/certificates
POST   /users/:id/external-certificates    DELETE /external-certificates/:id
GET    /public/certificates/:serial        # auth'siz, rate-limited

# Learning paths
GET|POST   /learning-paths                 GET|PATCH|DELETE /learning-paths/:id
POST   /learning-paths/:id/items           PATCH /learning-paths/:id/items/reorder
GET    /learning-paths/:id/enrollments     POST /learning-paths/:id/enrollments
POST   /learning-paths/:id/enroll          # self-enroll
GET    /learning-paths/:id/progress        GET /learning-paths/:id/users/:userId/progress

# Savollar / testlar
GET|POST /question-banks                   GET|PATCH|DELETE /question-banks/:id
GET|POST /question-banks/:id/questions     PATCH|DELETE /questions/:id
POST   /questions/import                   # XLSX/GIFT
GET|POST /quizzes                          GET|PATCH|DELETE /quizzes/:id
POST   /quizzes/:id/start                  POST /quizzes/:id/answer   # oraliq saqlash
POST   /quizzes/:id/focus-loss             POST /quizzes/:id/submit
GET    /quizzes/:id/attempts               GET /quizzes/:id/attempts/:userId
GET    /quizzes/:id/stats                  # savol-ba-savol qiyinlik

# Topshiriqlar (uy vazifasi)
GET|POST /topics/:id/assignments           GET|PATCH|DELETE /assignments/:id
POST   /assignments/:id/submissions        GET /assignments/:id/submissions
POST   /submissions/:id/grade              POST /submissions/:id/return
GET    /grading/queue?reviewerId=

# Live training
POST   /events/:id/register                DELETE /events/:id/register
GET    /events/:id/registrations           POST /events/:id/attendance
POST   /events/:id/cancel                  GET /events/:id/report

# Kalendar
GET    /calendar?from=&to=&scope=me|team|all
GET    /calendar.ics?token=

# Onboarding
GET|POST /onboarding/programs              GET|PATCH|DELETE /onboarding/programs/:id
POST   /onboarding/programs/:id/enroll     GET /onboarding/enrollments?userId=
PATCH  /onboarding/enrollments/:id/steps/:stepId

# Knowledge base
GET|POST /kb/categories                    GET|PATCH|DELETE /kb/categories/:id
GET|POST /kb/articles                      GET|PATCH|DELETE /kb/articles/:id
GET    /kb/articles/:id/versions           POST /kb/articles/:id/restore/:version
GET    /kb/search?q=                       POST /kb/articles/:id/comments
GET    /kb/articles/:id/report

# Qidiruv
GET    /search?q=&types=&limit=            GET /search/suggest?q=

# Audit
GET    /audit-logs?actor=&entity=&action=&from=&to=&cursor=
GET    /audit-logs/export?format=

# Org
GET    /org/hierarchy                      GET /org/chart
GET    /dashboard/team                     # manager dashboard

# Sozlamalar / branding
GET|PUT /settings                          GET /settings/public   # auth'siz branding
GET|PUT /notification-templates            GET|PUT /users/me/notification-prefs

# Gamification
GET|POST /badges                           PATCH|DELETE /badges/:id
GET    /users/:id/badges

# Compliance / automation
GET|POST /enrollment-rules                 PATCH|DELETE /enrollment-rules/:id
POST   /enrollment-rules/:id/evaluate      # qo'lda ishga tushirish
GET|POST /recurring-assignments            GET /compliance/matrix
GET|POST /scheduled-reports                POST /scheduled-reports/:id/run
GET    /export-jobs/:id                    GET /export-jobs/:id/download

# Foydalanuvchilar
POST   /users/import/dry-run               POST /users/import/commit
POST   /users/bulk/update                  GET|POST /custom-fields
PATCH  /users/me                           POST /auth/verify-email
POST   /auth/2fa/setup                     POST /auth/2fa/verify

# Kompetensiya / 360 / OJT / rivojlanish
GET|POST /competencies                     GET /users/:id/competency-profile
GET|POST /review-cycles                    GET /review-cycles/:id/assignments
POST   /review-assignments/:id/respond     GET /review-cycles/:id/report
GET|POST /ojt/checklists                   GET|POST /ojt/sessions
POST   /ojt/sessions/:id/observations
GET|POST /development-plans                POST /development-plans/:id/reviews

# AI
POST   /ai/courses/generate                GET /ai/jobs/:id
POST   /ai/quizzes/generate                POST /ai/translate
POST   /ai/text/transform                  POST /ai/summarize

# Media
GET|POST /media                            DELETE /media/:id
GET    /media/folders                      GET /media/:id/usage

# Kontent
GET|POST /topics/:id/lessons               GET|PATCH|DELETE /lessons/:id
POST   /lessons/:id/progress
POST   /topics/:id/scorm                   GET /scorm/:id/launch
POST   /scorm/:id/commit                   # SCORM API adapteri
POST   /xapi/statements

# Integratsiyalar
GET|POST /api-keys                         DELETE /api-keys/:id
GET|POST /webhooks                         POST /webhooks/:id/test
GET    /webhooks/:id/deliveries
POST   /auth/sso/jwt                       GET /auth/oidc/start
GET    /auth/oidc/callback

# Push
POST   /push/subscribe                     DELETE /push/subscribe
```

## 9.3 Mavjud endpoint'larga additive o'zgarishlar

| Endpoint | Qo'shiladi |
|---|---|
| `GET /courses` | `?categoryId= &tags= &level= &authorId= &q=` (text search); javobda `category`, `tags`, `level`, `estimatedMinutes`, `certificateAvailable` |
| `GET /courses/:id` | `prerequisites[]{id,title,met}`, `completionRule`, `navigationMode` |
| `GET /users` | `?managerId= &scope=my-team &hasCertificate=`; javobda `managerName` |
| `GET /users/:id` | `certificates[]`, `competencies[]`, `onboarding{}`, `developmentPlan{}` |
| `GET /reports` | 8 yangi `type`; `?branch= &groupId= &pathId= &managerId=` |
| `GET /dashboard` | `?scope=company\|branch\|department\|team`; yangi kartalar |
| `GET /notifications` | `?type=` filtri; javobda `channels`, `deliveredAt` |
| `GET /events/calendar` | `/calendar` bilan almashtiriladi (eskisi 1 reliz saqlanadi, `Deprecation` sarlavhasi bilan) |
| `POST /videos/:id/quiz` | Yangi `Question` formatini qabul qiladi; eski format ham 1 reliz qabul qilinadi va konvertatsiya qilinadi |
| `GET /materials/:id/download-url` | `allowDownload=false` bo'lsa 403; o'rniga `/materials/:id/stream` |

## 9.4 Public API (tashqi tizimlar uchun)

`/api/public/v1` — faqat quyidagi resurslar, faqat `ApiKey` scope'lari bilan:
```
users        : read, write   (HR tizimidan sinxronizatsiya)
groups       : read, write
courses      : read
enrollments  : read, write   (kurs biriktirish)
progress     : read
certificates : read
reports      : read          (oldindan belgilangan turlar)
events       : read, write
webhooks     : —             (chiquvchi)
```
Har bir chaqiruv `API_CALL` sifatida `auditLogs`ga yoziladi (kalit prefiksi bilan,
to'liq kalit **hech qachon** loglanmaydi).

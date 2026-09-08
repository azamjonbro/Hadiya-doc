# 17–18. PHASE-BY-PHASE YO'L XARITASI VA QABUL MEZONLARI

**Umumiy qoidalar (mavjud loyiha ish tartibidan olingan):**
- Har bir phase **tekshiriladigan qismlarga** bo'linadi; katta bog'liq bo'lmagan
  fayl to'plami bir zarbada tashlanmaydi.
- Hech qanday kritik funksiya TODO bilan yarim ulangan holda qoldirilmaydi.
- Har bir phase oxirida: migratsiya `--dry-run` → backup → migratsiya →
  smoke test → deploy.
- Har bir phase o'z qisqa dizayn qaydini oladi (koddan oldin).

**Tahminiy hajm** — bitta to'liq bandlik dasturchi uchun. Ikki kishi bilan
Phase 1–4 ni parallel olib borish mumkin (backend/frontend bo'linishi).

---

## PHASE 0 — Poydevor tuzatishlar (1 hafta) 🔴 BLOKLOVCHI

> Bu phase yangi funksiya qo'shmaydi. U **mavjud tizimning buzilgan
> joylarini** tuzatadi. Busiz keyingi phase'lar ustiga qurish xavfli.

| # | Ish | Nima uchun |
|---|---|---|
| 1 | Signed URL host bug'i (`S3_PUBLIC_ENDPOINT`) | Material yuklab olish **hozir ishlamaydi** |
| 2 | Kunlik backup + tiklashni sinash | Hozir hech qanday backup yo'q |
| 3 | ADMIN/MANAGER API ruxsatlarini UI bilan moslashtirish | Hujjatlashtirilgan xavfsizlik nomuvofiqligi |
| 4 | `course.repository` regex escape (ReDoS) | `user.repository` allaqachon escape qiladi, bu qilmaydi |
| 5 | Sentry / error tracking | Xatolar faqat log faylida ko'rinadi |
| 6 | `admin/` papkasini o'chirish, eskirgan deploy hujjatlarini arxivlash | Chalkashlik manbai |
| 7 | Socket.io Redis adapter | Bitta instansiyadan chiqishga tayyorgarlik |
| 8 | Test poydevori: `questionGrading`, `watchedSegments`, RBAC smoke testlari | 3 test fayli yetarli emas |

**Qabul mezonlari (Phase 0):**
- [ ] Yuklangan PDF brauzerda ochiladi va yuklab olinadi (production'da)
- [ ] `mongodump` kunlik ishlaydi, S3'ga tushadi, va **tiklash bir marta muvaffaqiyatli sinovdan o'tgan**
- [ ] MANAGER roli boshqa bo'lim xodimining ma'lumotini API orqali **ola olmaydi** (test bilan isbotlangan)
- [ ] `GET /courses?search=` 200 ms ichida javob beradi (1000 kurs bilan)
- [ ] Sentry'da sun'iy xato ko'rinadi
- [ ] `npm test` ≥ 30 ta test bilan o'tadi

---

## PHASE 1 — Core LMS (6–8 hafta) 🔴 CRITICAL

**Maqsad:** platformani "korporativ LMS" deb atash mumkin bo'ladigan minimal
to'plam: sertifikat, e-mail, test tizimi, kurs metadatasi, audit ko'rinishi.

### DB modellari
`courseCategories`, `certificateTemplates`, `certificates`, `externalCertificates`,
`questionBanks`, `questions`, `quizzes` (umumlashtirilgan), `testSessions`,
`notificationTemplates`, `mailLogs`, `settings`
**Kengaytirish:** `courses` (+11 maydon), `users` (+8 maydon), `notifications` (+4 maydon)

### Backend
`services/certificates/*` (4 servis), `services/questions/*` (4 servis),
`services/quizzes/*` (refactor + `testSession`), `services/notifications/*`
(delivery, mail, template, preferences), `services/settings/`,
`services/users/userImport.service.js`, `services/org/orgHierarchy.service.js`
**Queue:** `deliveryQueue`, `certificateQueue`, `backupQueue`
**Middleware:** `scopeToManagedUsers`, `publicEndpointGuard`

### Endpoint'lar
Sertifikatlar (9), savol banki + test (12), audit (2), kategoriyalar (4),
import (2), sozlamalar (3), bildirishnoma sozlamalari (2), org ierarxiya (2),
`GET /public/certificates/:serial`

### Frontend
**Yangi umumiy komponentlar:** `DataTable`, `FilterBar`, `FileDropzone`,
`SortableList`, `StepWizard`, `UserPicker`
**Xodim:** `CertificatesView`
**Admin:** `CertificateTemplatesView` + editor, `QuestionBanksView`,
`QuizEditorView`, `AuditLogView`, `RolesPermissionsView`, `SettingsAdminView`,
`ManagerDashboardView`, foydalanuvchi import sehrgari
**Kengaytirish:** `CoursesListView` (kategoriya/teg/daraja filtrlari),
`UsersListView` (bulk update, manager ustuni), `SettingsView` (bildirishnoma sozlamalari)

### Ruxsatlar
`certificate:*` (5), `question:bank:manage`, `quiz:manage`, `quiz:take`,
`quiz:stats:view`, `settings:manage`, `branding:manage`, `team:view`,
`org:hierarchy:manage`, `proctor:view`, `face:enroll:others`

### Bildirishnoma hodisalari
`COURSE_COMPLETED`, `QUIZ_PASSED`, `QUIZ_FAILED`, `QUIZ_ATTEMPTS_EXHAUSTED`,
`CERTIFICATE_ISSUED`, `CERTIFICATE_EXPIRING`, `CERTIFICATE_EXPIRED`,
`CERTIFICATE_REVOKED`, `ACCOUNT_CREATED`, `PASSWORD_RESET`,
`LOGIN_FROM_NEW_DEVICE`, `COURSE_OVERDUE`

### Background job'lar
`deliveryQueue` (retry 5×), `certificateQueue`, `backupQueue`,
`reminderJob` kengaytirish (bosqichli 7/3/1 kun)

### Migratsiyalar
M1 (savollar), M2 (`managerId` backfill), M3 (`course` default'lari),
M4 (`user.locale` + prefs), M5 (`assessmentSession` → `testSession`),
M9 (bildirishnoma shablonlari seed'i)

### ✅ Qabul mezonlari (Phase 1)
- [ ] Xodim kursni tugatganda **60 soniya ichida** sertifikat oladi; PDF'da to'g'ri ism, kurs, sana, serial va QR bor
- [ ] QR kodni skanerlash ochiq tekshiruv sahifasini ochadi; sahifada **JSHSHIR ko'rinmaydi**
- [ ] Bekor qilingan sertifikat tekshiruv sahifasida "Bekor qilingan" deb ko'rsatiladi
- [ ] Parolni tiklash so'rovi **e-mail bilan** keladi va ishlaydi (uch tilda)
- [ ] Foydalanuvchi `Sozlamalar → Bildirishnomalar` da e-mail kanalini o'chira oladi va keyingi bildirishnoma e-mail bilan kelmaydi; `PASSWORD_RESET` esa **baribir keladi**
- [ ] Test 13 savol turining kamida 6 tasini (single, multi, true/false, short answer, numeric, matching) qo'llab-quvvatlaydi; qisman ball to'g'ri hisoblanadi
- [ ] `maxAttempts=2` qo'yilgan testda 3-urinish **409** bilan rad etiladi
- [ ] Savol banki 50 savoldan tasodifiy 10 tasini tanlaydi; sahifani yangilash **bir xil** 10 savolni qaytaradi
- [ ] Eski `Quiz`/`Assessment` yozuvlari migratsiyadan keyin ishlaydi; eski attempt'lar ko'rinadi
- [ ] Kurs katalogi kategoriya, teg va daraja bo'yicha filtrlanadi
- [ ] 300 satrli XLSX import: dry-run xatolarni satr raqami bilan ko'rsatadi; tasdiqlashdan keyin foydalanuvchilar yaratiladi va parollar bir marta ko'rsatiladi
- [ ] `/bos/audit` sahifasi filtrlar bilan ishlaydi va CSV eksport beradi; eksportning o'zi audit'ga tushadi
- [ ] MANAGER `/bos/team` da faqat o'z jamoasini ko'radi (API darajasida ham)
- [ ] Barcha yangi endpoint'lar uchun 401/403 testlari o'tadi

---

## PHASE 2 — Learning management (6–8 hafta) 🟠 HIGH

**Maqsad:** menejerni tizimga har kuni kirituvchi funksiyalar.

### DB modellari
`learningPaths`, `pathEnrollments`, `assignments`, `submissions`, `rubrics`,
`eventRegistrations`, `onboardingPrograms`, `onboardingEnrollments`,
`enrollmentRules`, `pushSubscriptions`
**Kengaytirish:** `events` (+9 maydon), `groups` (+2 maydon)

### Backend
`services/paths/*`, `services/assignments/*`, `services/events/*` (registration,
attendance, meeting provider), `services/calendar/*`, `services/onboarding/*`,
`services/automation/enrollmentRule.service.js`, `services/notifications/push.service.js`
**Queue:** `onboardingQueue`, `enrollmentRuleQueue`

### Endpoint'lar
Path (10), topshiriq + topshirish + baholash (8), tadbir ro'yxat/davomat (6),
kalendar (2), onboarding (6), enrollment rules (4), push (2)

### Frontend
**Xodim:** `PathsView`, `PathDetailView`, `AssignmentView`, `CalendarView`,
`EventDetailView`, `OnboardingView`
**Admin:** `PathsListView`, `PathBuilderView`, `AssignmentsGradingView`,
`EventsAdminView`, `OnboardingProgramsView`, `EnrollmentRulesView`
**Komponent:** `ui/Chart.vue` (yagona grafik abstraksiyasi)

### Ruxsatlar
`path:*` (5), `assignment:*` (3), `event:manage`, `event:register`,
`event:attendance:mark`, `onboarding:manage`, `onboarding:view:team`, `automation:manage`

### Bildirishnoma hodisalari
`PATH_*` (3), `ASSIGNMENT_*` (4), `EVENT_*` (5), `ONBOARDING_*` (4)

### Migratsiyalar
M6 (`Event.participants` → `EventRegistration`)

### ✅ Qabul mezonlari (Phase 2)
- [ ] 4 kursdan iborat ketma-ket path yaratiladi; 2-kurs 1-kurs tugamaguncha **API darajasida** ochilmaydi
- [ ] Path progressi majburiy item'lar bo'yicha to'g'ri hisoblanadi; ixtiyoriy item progressni o'zgartirmaydi
- [ ] Path tugaganda sertifikat avtomatik beriladi
- [ ] Xodim topshiriqqa fayl va matn yuklaydi → tekshiruvchi navbatida ko'rinadi → ball va izoh bilan baholanadi → xodim bildirishnoma oladi
- [ ] Qaytarilgan topshiriq qayta topshiriladi va yangi `attemptNo` oladi
- [ ] Sig'imi 10 bo'lgan tadbirga 12 kishi yoziladi: 10 tasi `REGISTERED`, 2 tasi `WAITLIST`; kimdir bekor qilsa birinchi navbatdagi avtomatik ko'tariladi va xabar oladi
- [ ] Tadbir vaqti o'zgarsa barcha ro'yxatdagilar 1 daqiqa ichida xabar oladi
- [ ] Davomat belgilanadi; `event-attendance` hisoboti to'g'ri raqam beradi
- [ ] `GET /calendar` bitta javobda tadbir + kurs deadline + topshiriq muddatini qaytaradi
- [ ] `hireDate` bugungi kun bo'lgan yangi xodim uchun onboarding **avtomatik** boshlanadi; qadamlar `hireDate + dueDays` muddat oladi; mentor va rahbar xabardor bo'ladi
- [ ] Enrollment rule: "Toshkent filiali + Sotuv bo'limi → 'Sotuv asoslari' kursi, 14 kun muddat" — yangi xodim yaratilganda avtomatik biriktiriladi
- [ ] Web push obuna bo'lgan qurilmaga deadline eslatmasi keladi

---

## PHASE 3 — Advanced learning (5–6 hafta) 🟠 HIGH

### DB modellari
`kbCategories`, `kbArticles`, `kbArticleVersions`, `kbViews`, `kbComments`,
`badges`, `userBadges`, `recurringAssignments`, `recommendations`, `lessons`, `lessonProgress`

### Backend
`services/kb/*`, `services/search/globalSearch.service.js`,
`services/gamification/badge.service.js` + `level.service.js`,
`services/compliance/*`, `services/recommendation.service.js`, `lesson.service.js`
**Queue:** `complianceQueue`, `searchIndexQueue`, `recommendationQueue`

### Endpoint'lar
KB (12), global qidiruv (2), badge (4), compliance (3), recurring (3),
dars (4), tavsiyalar (1)

### Frontend
**Xodim:** `KbView`, `KbArticleView`, `LessonView`, `ui/CommandPalette`
**Admin:** `KbAdminView` + editor, `BadgesView`, `ComplianceView`,
`ui/RichTextEditor`
**Kengaytirish:** learner dashboard'ga tavsiyalar bloki

### Ruxsatlar
`kb:*` (5), `compliance:view`

### Bildirishnoma hodisalari
`NEWS_PUBLISHED`, `ANNOUNCEMENT`, `KB_ARTICLE_REVIEW_DUE`, `BADGE_EARNED`,
`LEVEL_UP`, `COMPLIANCE_RETRAINING_DUE`

### Migratsiyalar
M7 (badge'lar seed), M8 (text indekslar, `background: true`)

### ✅ Qabul mezonlari (Phase 3)
- [ ] KB maqolasi kategoriya daraxtida joylashadi, rolga qarab ko'rinadi, versiyalanadi va oldingi versiyaga qaytariladi
- [ ] `⌘K` global qidiruv kurs, dars, KB maqola va foydalanuvchini topadi; **kirish huquqi yo'q natija ko'rsatilmaydi**
- [ ] Qidiruv uz/ru/en so'zlar bilan ishlaydi
- [ ] Badge mezoni admin panelida o'zgartiriladi; shart bajarilganda badge avtomatik beriladi va bildirishnoma keladi
- [ ] "Har 12 oyda qayta o'qitish" qoidasi: muddat kelganda yangi assignment avtomatik yaratiladi
- [ ] Compliance matritsasi kurs × xodim kesimida to'g'ri holat ko'rsatadi va eksport qilinadi
- [ ] Blokli dars (matn + rasm + video havolasi + test) yaratiladi va progress o'qilgan bloklar bo'yicha hisoblanadi
- [ ] Xodim dashboard'ida kamida 3 ta asoslangan tavsiya ko'rinadi ("nega" izohi bilan)

---

## PHASE 4 — Advanced assessment (5–6 hafta) 🟡 MEDIUM

### DB modellari
`competencies`, `userCompetencies`, `reviewTemplates`, `reviewCycles`,
`reviewAssignments`, `reviewResponses`, `ojtChecklists`, `ojtSessions`,
`ojtObservations`, `developmentPlans`, `planReviews`

### Backend
`services/competency/*`, `services/reviews/*`, `services/ojt/*`, `services/plans/*`

### Endpoint'lar
Kompetensiya (4), 360 (8), OJT (6), rivojlanish rejasi (5)

### Frontend
**Xodim:** `Review360View`, `OjtSessionView` (mobil-birinchi), `DevelopmentPlanView`
**Admin:** `CompetenciesView`, `ReviewCyclesView`, `OjtChecklistsView`
**Komponent:** radar chart (`ui/Chart` ichida)

### Ruxsatlar
`competency:manage`, `review360:*` (3), `ojt:manage`, `ojt:observe`,
`plan:manage`, `plan:review`, `plan:read:own`

### Bildirishnoma hodisalari
`REVIEW360_INVITED`, `REVIEW360_REMINDER`, `REVIEW360_RESULTS_READY`,
`OJT_SESSION_SCHEDULED`, `PLAN_REVIEW_DUE`

### ✅ Qabul mezonlari (Phase 4)
- [ ] 360 sikli ochiladi; baholovchilar `managerId` ierarxiyasidan **avtomatik** aniqlanadi (self / manager / peer / subordinate)
- [ ] Anonim javoblar 3 tadan kam bo'lsa natija **ko'rsatilmaydi** ("yetarli javob yo'q")
- [ ] Kompetensiya profili radar chart'da o'z/rahbar/hamkasb o'rtachalarini ko'rsatadi
- [ ] OJT sessiyasi telefonda to'ldiriladi; bir sessiyada 3 ta kuzatuv yoziladi; o'rtacha ball va mezon bo'yicha taqsimot ko'rinadi
- [ ] Rivojlanish rejasida maqsad, kurs va muddat bor; rahbar review qoldiradi; erishilgan ballar `PointsLedger`dan avtomatik hisoblanadi

---

## PHASE 5 — AI (4–5 hafta) 🟡 MEDIUM

### DB modellari
`aiGenerationJobs`, `contentTranslations`

### Backend
`services/ai/aiCourse.service.js`, `aiQuiz.service.js`, `aiTranslate.service.js`,
`aiText.service.js`, `sourceExtract.service.js`
**Queue:** `aiGenerationQueue`

### Endpoint'lar
`POST /ai/courses/generate`, `POST /ai/quizzes/generate`, `POST /ai/translate`,
`POST /ai/text/transform`, `POST /ai/summarize`, `GET /ai/jobs/:id`

### Frontend
`AiStudioView` (admin), editor ichida AI panel, tarjima boshqaruvi

### Ruxsatlar
`ai:generate:content`, `ai:translate`

### ✅ Qabul mezonlari (Phase 5)
- [ ] 30 sahifali PDF yuklanadi → 5–8 mavzuli kurs strukturasi generatsiya qilinadi → admin tahrirlaydi → publish qiladi
- [ ] Har bir generatsiya qilingan dars manba faylning qaysi qismidan olingani (`sourceRef`) bilan belgilanadi
- [ ] Generatsiya qilingan hech narsa **avtomatik publish bo'lmaydi**
- [ ] Kurs uzbekchadan ruschaga tarjima qilinadi; **struktura, blok tartibi va savol ID'lari o'zgarmaydi**
- [ ] Oylik token limiti oshsa yangi job `429` bilan rad etiladi
- [ ] AI prompt'larida JSHSHIR/telefon/manzil **yo'qligi** test bilan tekshiriladi
- [ ] Har bir AI chaqiruvi audit log'da ko'rinadi

---

## PHASE 6 — Enterprise (5–6 hafta) 🟡 MEDIUM

### DB modellari
`apiKeys`, `webhooks`, `webhookDeliveries`, `ssoConfigs`

### Backend
`services/integrations/*`, `apiKeyAuth.middleware.js`,
`apiKeyRateLimit.middleware.js`, `idempotency.middleware.js`,
OpenAPI generatsiyasi (`zod-to-openapi`)
**Queue:** `webhookQueue`

### Endpoint'lar
`/api/public/v1/*` (8 resurs), API kalitlari (3), webhook (4), SSO (3),
`GET /openapi.json`, `GET /api/docs`

### Frontend
`ApiKeysView`, `WebhooksView`, SSO sozlash, branding sozlamalari

### Ruxsatlar
`apikey:manage`, `webhook:manage`, `sso:manage`

### ✅ Qabul mezonlari (Phase 6)
- [ ] API kaliti yaratiladi, scope'lar tanlanadi; kalit **bir marta** ko'rsatiladi va DB'da hash sifatida saqlanadi
- [ ] Scope'dan tashqari resursga murojaat `403` beradi
- [ ] Per-key rate limit ishlaydi; oshsa `429`
- [ ] `course.completed` webhook'i HMAC imzo bilan yetkaziladi; qabul qiluvchi 500 qaytarsa 5 marta exponential backoff bilan qayta urinadi; `WebhookDelivery` jurnali to'ldiriladi
- [ ] OIDC orqali kirish: yangi foydalanuvchi JIT yaratiladi, roli va bo'limi claim'lardan mapping qilinadi
- [ ] `/api/docs` da barcha public endpoint'lar to'g'ri sxema bilan ko'rinadi
- [ ] Har bir public API chaqiruvi audit log'da (kalit prefiksi bilan) ko'rinadi

---

## PHASE 7 — Authoring (6–8 hafta) 🟢 LOW-MEDIUM

### DB modellari
`scormPackages`, `scormStates`, `xapiStatements`, `mediaAssets`, `blockTemplates`

### Backend
`services/scorm/*`, `services/media/*`, ffmpeg pipeline kengaytirish
(subtitr, trim, MP4 eksport)
**Queue:** `mediaCleanupQueue`

### Endpoint'lar
SCORM (5), xAPI (2), media (5), dars bloklari (mavjud `lessons` kengayadi)

### Frontend
`MediaLibraryView`, `ScormPlayerView`, blok editor kengaytmasi, ekran yozib
olish, subtitr editori

### ✅ Qabul mezonlari (Phase 7)
- [ ] SCORM 1.2 paketi yuklanadi, ochiladi va o'ynaydi; `cmi.completion_status` serverda saqlanadi va kurs progressiga ta'sir qiladi
- [ ] Sahifani yangilash SCORM holatini tiklaydi (`suspend_data`)
- [ ] Media kutubxonada har bir fayl uchun "qayerda ishlatilgan" ko'rinadi
- [ ] Havolasiz fayllar haftalik hisobotda chiqadi va 30 kundan keyin o'chiriladi
- [ ] Videoga VTT subtitr qo'shiladi va pleyerda yoqiladi
- [ ] Ekrandan yozib olingan video mavjud tus/transcode pipeline'idan o'tadi

---

## PHASE 8 — Analytics (4–5 hafta) 🟡 MEDIUM

### DB modellari
`scheduledReports`, `exportJobs`, `reportDefinitions`

### Backend
`services/reports/scheduledReport.service.js`, `exportJob.service.js`,
`reportDefinition.service.js`; `dashboardAggregation` kengaytirish (`scope`)
**Queue:** `scheduledReportQueue`, `exportQueue`

### Endpoint'lar
Rejalashtirilgan hisobotlar (4), eksport job (2), report definition (4),
8 yangi hisobot turi

### Frontend
`ScheduledReportsView`, `ReportBuilderView`, `OrgChartView`,
dashboard `scope` almashtirgichi, grafiklar hisobotlarda

### Ruxsatlar
`report:schedule`

### ✅ Qabul mezonlari (Phase 8)
- [ ] 22 hisobot turining hammasi ishlaydi va uch formatda eksport qilinadi
- [ ] 50 000 satrli eksport async job'ga tushadi; tayyor bo'lganda bildirishnoma keladi; havola 7 kundan keyin ishlamaydi
- [ ] Haftalik rejalashtirilgan hisobot belgilangan vaqtda e-mail bilan keladi
- [ ] Dashboard `scope=department` da faqat o'sha bo'lim raqamlarini ko'rsatadi
- [ ] Org chart 500 xodim bilan 2 soniyada chiziladi
- [ ] Custom report builder'da tanlangan maydonlar **whitelist**dan tashqariga chiqmaydi

---

## PHASE 9 — Mobile / PWA (3–4 hafta) 🟠 HIGH (lekin oxirida — barqaror API kerak)

### Backend
`idempotency.middleware.js` (Phase 6 dan), `clientEventId` unique indekslari,
signed URL TTL sozlamalari

### Frontend
`vite-plugin-pwa`, service worker, Workbox strategiyalari, IndexedDB navbat,
Background Sync, sinxronizatsiya holati UI

### ✅ Qabul mezonlari (Phase 9)
- [ ] Ilova telefonga o'rnatiladi va o'z ikonkasi bilan ochiladi
- [ ] Internet o'chirilganda oldindan saqlangan kurs matni va PDF ochiladi
- [ ] Oflayn ko'rilgan video progressi onlayn bo'lganda yuboriladi va **dublikat qilmaydi** (`clientEventId`)
- [ ] Sinxronizatsiya holati UI'da ko'rinadi
- [ ] Push bildirishnoma ilova yopiq bo'lganda ham keladi
- [ ] Lighthouse PWA audit ≥ 90 ball

---

## PHASE 10 — E-commerce (OPTIONAL, 4 hafta) ⚪ LOW

Faqat pullik tashqi kurslar biznes qarori qabul qilinsa. Mahalliy to'lov
provayderlari (Payme / Click / Uzum). Oldindan hech qanday model qurilmaydi.

---

## 17.1 Umumiy vaqt jadvali

| Phase | Hajm | Kümülyativ | Prioritet |
|---|---|---|---|
| 0 — Poydevor tuzatishlar | 1 hafta | 1 hafta | 🔴 BLOKLOVCHI |
| 1 — Core LMS | 6–8 hafta | ~9 hafta | 🔴 CRITICAL |
| 2 — Learning management | 6–8 hafta | ~17 hafta | 🟠 HIGH |
| 3 — Advanced learning | 5–6 hafta | ~23 hafta | 🟠 HIGH |
| 4 — Advanced assessment | 5–6 hafta | ~29 hafta | 🟡 MEDIUM |
| 5 — AI | 4–5 hafta | ~34 hafta | 🟡 MEDIUM |
| 6 — Enterprise | 5–6 hafta | ~40 hafta | 🟡 MEDIUM |
| 7 — Authoring | 6–8 hafta | ~47 hafta | 🟢 LOW-MED |
| 8 — Analytics | 4–5 hafta | ~52 hafta | 🟡 MEDIUM |
| 9 — Mobile / PWA | 3–4 hafta | ~56 hafta | 🟠 HIGH |

**Bitta dasturchi:** ~13 oy. **Ikki dasturchi (backend + frontend):** ~7–8 oy.

**Muhim eslatma:** Phase 9 (PWA) prioriteti HIGH, lekin oxirida turibdi —
chunki oflayn sinxronizatsiya **barqaror API** talab qiladi. Agar mobil
ehtiyoj shoshilinch bo'lsa, uni Phase 3 dan keyin ko'chirish mumkin, lekin
u holda Phase 4–8 dagi har bir yangi endpoint uchun oflayn qo'llab-quvvatlash
qayta ko'rib chiqilishi kerak bo'ladi.

# 18. OUR SYSTEM SUPERIORITIES · 19. iSPRING SUPERIORITIES · 20–23. P0–P3 GAPS · 24. NOT APPLICABLE

---

# 18. OUR SYSTEM SUPERIORITIES

> ⚠️ **Metodologik ogohlantirish.** Foydalanuvchi qoidasi: *"iSpring source'siz
> 'iSpring'da bor' dema"*. Bu qoida **teskari tomonga ham** amal qiladi —
> manba bo'lmasa "iSpring'da yo'q" ham deyilmaydi. Matritsada `OURS+` deb
> belgilangan **43 qatordan faqat 9 tasi** rasmiy manbada iSpring'da
> yo'qligi bilan tasdiqlangan. Qolgan 34 tasi ikki toifaga bo'linadi.

## 18.1 A-toifa — manba bilan tasdiqlangan ustunlik (9 ta)

Bu qobiliyatlar iSpring'ning rasmiy materiallarida (S1, S2 — 5 yillik reliz
jurnali) **umuman uchramaydi**. iSpring bularni 2021-09 dan 2026-09 gacha
hech qachon e'lon qilmagan.

| # | Qobiliyat | Bizning implementatsiya | Nega ustunlik |
|---|---|---|---|
| 1 | **Kamera diqqat monitoringi** | `attentionPolicy.model.js` — 8 sozlanadigan maydon, GLOBAL→COURSE meros; MediaPipe brauzerda, kadr qurilmadan chiqmaydi | O'quvchi ekranga qarab turganini o'lchaydi. iSpring reliz jurnalida bunday funksiya yo'q |
| 2 | **Diqqatsizlik oralig'ini progressdan ayirish** | `videoEventProcessor.js:172-174` — `subtractSegments` + `policy.requireRewatch` | Qaramagan sekundlar ko'rilgan hisoblanmaydi. Sanoatda noyob |
| 3 | **Proctoring — begona yuz aniqlash** | `proctorSnapshot.service.js` — yopiq bucket, 180 kun TTL, audit-logli ko'rish, rahbarga xabar | iSpring'da proctoring umuman yo'q |
| 4 | **Face verification gate** | `faceGate.service.js` + `FACE_GATE_ACTIONS` — video, material, test uchun; `verifyEveryOpen` rejimi | Kim o'qiyotganini biometrik tasdiqlash |
| 5 | **Server tomonda test sessiyasi** | `assessmentSession.model.js` — taymer stamplanadi, reload tiklamaydi; focus-loss serverda sanaladi | iSpring "attempts" ni cheklaydi, lekin sessiya yaxlitligi tasdiqlanmagan |
| 6 | **Savollar sessiya boshlanmaguncha berilmaydi** | `assessment.service.js:194-212` — o'quvchiga faqat brifing | Savollarni oldindan yig'ib olish yo'li yopiq |
| 7 | **Tashlab ketilgan sessiya nol ball bilan yoziladi** | `assessment.service.js:243-248` `closeExpiredSession` | "O'qib chiqib, javobini topib, qaytish" yo'li yopiq |
| 8 | **Soft delete + trash + muddat bo'yicha avtomatik tozalash** | `trash.service.js` — `listExpired(before)` | iSpring'da tiklanadigan o'chirish e'lon qilinmagan |
| 9 | **Ovozli xabar messenger ichida** | `VoiceRecorder.vue`, `VoicePlayer.vue`, `chatUpload.service.js` | iSpring messenger'ida (S2 2023-07-12) matn va guruh chat bor, ovoz e'lon qilinmagan |

## 18.2 B-toifa — implementatsiya darajasidagi ustunlik (10 ta)

iSpring'da **ham bor**, lekin bizning implementatsiyamiz o'lchov aniqligi
yoki majburlash darajasi bo'yicha kuchliroq. Bu "ular qila olmaydi" emas,
"biz qattiqroq qilamiz" degani.

| # | Qobiliyat | Farq |
|---|---|---|
| 1 | **Watched-segments anti-skip** | iSpring'da "detailed viewing statistics" bor (S1). Bizda foiz **birlashtirilgan, kesishmaydigan intervallar** yig'indisidan serverda hisoblanadi (`watchedSegments.js`) — sudrab tugatib bo'lmaydi |
| 2 | **Hujjat o'qish progressi** | iSpring'da progress kuzatuvi bor. Bizda **ko'rilgan sahifalar to'plami** (`materialProgress.viewedPages`) — 40-slaydga sakrash 40% bermaydi |
| 3 | **Sequential lock majburlash nuqtasi** | iSpring'da gated content bor (S2 2025-04-29). Bizda qulf **playback token berilishida** tekshiriladi (`courseSequence.js:79`) — URL yozib chetlab o'tib bo'lmaydi |
| 4 | **Kurs targeting** | iSpring: guruh + smart filter. Bizda `rol AND filial AND bo'lim` uchta o'lcham bir vaqtda (`courseVisibility.js:20-38`) |
| 5 | **Ball idempotentligi** | Sparse unique indeks (`pointsLedger.model.js:20-21`) — qayta ko'rish yoki qayta topshirish ikkinchi marta ball bermaydi |
| 6 | **Rate limiting granularligi** | 11 alohida limiter (login, AI, upload, material, video-stream, chat, analytics, ...) |
| 7 | **Refresh token reuse detection** | `session.model.js` `replacedBy` zanjiri — o'g'irlangan token butun sessiya oilasini bekor qiladi |
| 8 | **Fayl magic-byte tekshiruvi** | `file-type` bilan haqiqiy tur tekshiriladi, kengaytmaga ishonilmaydi |
| 9 | **Hisobot lokalizatsiyasi** | `reportI18n.js` — ustun sarlavhalari va enum qiymatlari 3 tilda |
| 10 | **Video segment darajasidagi auth** | Har HLS segment `videoPlaybackToken.middleware.js` dan o'tadi |

## 18.3 C-toifa — VERIFY qilinishi kerak (24 ta)

Bu qobiliyatlar bizda **kuchli**, lekin iSpring'da bor-yo'qligi rasmiy
manbada tasdiqlanmagan. Sotuvchi bilan aniqlanmaguncha **ustunlik deb
da'vo qilinmaydi**.

`Watermark` · `Chat qidiruvi` · `Storage provider abstraksiyasi` ·
`Bo'linma (subdivision)` · `Task fan-out (USER/POSITION/ALL)` ·
`Assignment startAt` · `Audit jurnali yozuvi (60+ action)` ·
`IDOR test qamrovi` · `argon2id` · `CSRF double-submit` ·
`Brute-force lockout + CAPTCHA` · `Realtime socket bildirishnoma` ·
`News o'qish kuzatuvi (scroll milestone)` · `Kontent samaradorligi
(mostSkipped/mostPaused)` · `Drill-down chuqurligi` ·
`Pre-aggregation dashboard` · `Video worker alohida jarayonda` ·
`Kesh + queue + indeks naqshlari` · `Avtomatik deaktivatsiya
(terminationDate)` · `Trash avtomatik tozalash` · va boshqalar.

---

# 19. iSPRING SUPERIORITIES

> Manba bilan tasdiqlangan, biz sezilarli ortda qolgan joylar.

| # | Qobiliyat | iSpring | Biz | Manba |
|---|---|---|---|---|
| 1 | **Miqyos** | XLSX import 150 000 foydalanuvchigacha | Import umuman yo'q; kod ~5 000 gacha ishonchli | S1 |
| 2 | **Lokalizatsiya** | 30 til UI + AI 70+ til + **o'zbek tili (2026-08)** | 3 til UI, kontent bir tilli | S1, S2 |
| 3 | **Hisobotlar** | 25+ tayyor hisobot, saqlash/eksport/e-mail/rejalashtirish, BI eksport | 5 hisobot, faqat fayl, rejalashtirish yo'q | S6 |
| 4 | **Mobil** | Native iOS+Android, oflayn o'qish, avtomatik sinxronizatsiya | Faqat responsive web | S1 |
| 5 | **Sertifikat** | Shablon, avtomatik berish, 4 status, muddat, avtomatik re-enrollment, hisobot | Umuman yo'q | S2, S3 |
| 6 | **Development plan + onboarding** | Modul: rolga qarab yo'l, checklist, mentor, milestone, avtomatik biriktirish | Umuman yo'q | S1, S2 |
| 7 | **Knowledge base** | Spaces, maqolalar, teg, bookmark, reyting, kursga sinxronlash, PDF eksport | Umuman yo'q | S1, S2 |
| 8 | **360° va OJT** | 360 sikllar, before/after, bo'lim hisoboti; OJT checklist + shkala + ko'p kuzatuv | Umuman yo'q | S1, S2 |
| 9 | **Pages (scrollable courses)** | Blok shablonlari, flashcard, jadval, labeled graphics, TTS, ichida quiz | Matnli dars umuman yo'q | S1, S2 |
| 10 | **AI authoring** | Kurs generatori, savol generatsiyasi, rasm, tarjima | Faqat chat assistenti | S1, S2 |
| 11 | **Savol tizimi** | Bank, random pool, aralashtirish, urinish chegarasi, drag-drop, Likert, import/eksport | Bitta to'g'ri javobli MCQ, cheksiz urinish | S2, S8 |
| 12 | **Live training** | Ro'yxat, waitlist, ko'p kunlik sessiya, davomat hisoboti, Zoom/Meet/Teams | Faqat kalendar yozuvi | S1, S2 |
| 13 | **Bildirishnoma** | E-mail (tugatish, test, o'qilmagan chat), tadbir eslatmalari, sozlanadigan chastota | Faqat in-app, 9 tur, inglizcha hardcoded | S1, S2 |
| 14 | **Integratsiyalar** | REST+SOAP API, Entra ID, BambooHR, Salesforce, Albato, Udemy, LinkedIn Learning, GoodHabitz | Hech biri | S1, S2, S8 |
| 15 | **SSO** | JWT SSO + Microsoft Entra ID | Yo'q | S1, S2 |
| 16 | **Branding** | Logo, favicon, rang sxemasi, domain alias, white-label (portal + mobil) | Yo'q | S1, S2 |
| 17 | **Compliance audit pack** | Completion report + individual transcript + timestamped log, bir klik eksport | Yo'q | S7 |
| 18 | **Org chart va People** | Interaktiv org chart, People bo'limi, Company bo'limi | Yo'q | S2 |
| 19 | **Supervisor dashboard** | Bo'lim guruhlash, saralash, mobil vidjet | Yo'q | S2, S6 |
| 20 | **Custom profil maydonlari** | Bor, filtr va hisobotda ishlaydi | Yo'q | S2 |

---

# 20–23. GAPS — P0 dan P3 gacha

> **209 capability** ish talab qiladi (155 `NONE` + 54 `PARTIAL`). Ular
> **62 ta ish birligiga** guruhlangan — har biri bitta izchil deliverable.
> Har bir birlik uchun: model · servis · endpoint · UI · ruxsat ·
> bildirishnoma · avtomatlashtirish · qabul testi.

## 20. P0 — xavfsizlik, ma'lumot sizishi, buzilgan yadro oqimi (7 ta)

### P0-1 · Hisobot va dashboard scope'i
**Muammo:** `report.controller.js:20` — `reportDataService.build(type, filters, lang)`
`actor` qabul qilmaydi. MANAGER'da `report:export` bor → butun kompaniya
F.I.O + JSHSHIR + bo'lim + progressini XLSX qilib oladi. `GET /users` esa
uni o'z bo'limiga qamaydi (`user.service.js:159-163`) — to'g'ridan-to'g'ri zid.
· **Servis:** `reportData.service.js` — `build(actor, ...)`; har builder boshida
`scopeUserIds(actor)` → mavjud `intersectIds()` (`:33-45`) bilan kesishtirish
· **Endpoint:** `GET /reports/:type/export`, `GET /dashboard?scope=`
· **Ruxsat:** `report:export` saqlanadi, scope ruxsatdan olinadi
· **Audit:** `REPORT_EXPORTED` (tur, filtr, qatorlar soni)
· **Test:** AT-P0-1

### P0-2 · Scope'ni rol nomidan ruxsatga ko'chirish
**Muammo:** 14 joyda `actor.roleName === ROLES.MANAGER`
(`user.service.js:74,87,159`, `task.service.js:62,86,314`, `group.service.js:58,65,126,149,193`,
`courseAssignment.service.js:28,139`, `points.service.js:79,90`).
`POST /roles` bilan yaratilgan custom rol **hech qanday chegaraga tushmaydi** —
loyihaning o'z hujjati (`docs/auth-rbac.md`) rol qo'shishni "ma'lumot
operatsiyasi" deb ataydi.
· **Model:** `role.model.js` — `+scope: 'ALL'|'DEPARTMENT'|'TEAM'|'SELF'`
· **Middleware:** `scopeToManagedUsers.middleware.js` → `req.scopedUserIds` (Redis 5 daq)
· **Migratsiya:** mavjud rollarga `scope` backfill (MANAGER→DEPARTMENT, qolgani→ALL)
· **Test:** AT-P0-2

### P0-3 · Leaderboard JSHSHIR oshkorligi
**Muammo:** `points.service.js:104` har qatorda `jshshir` qaytaradi;
`gamification.routes.js` faqat `authenticate` bilan → har bir xodim
hamkasblarining 14 xonali raqamini oladi.
· **Servis:** DTO'dan olib tashlash; `ANALYTICS_VIEW_ALL` bo'lganda shartli
qo'shish (`quiz.service.js:22-36` `includeAnswers` naqshi)
· **Test:** AT-P0-3

### P0-4 · Kurs tugatishning ikki xil hisoblanishi
**Muammo:** `course.service.js:116` video+material+testni sanaydi;
`videoEventProcessor.js:238-252` assignment statusini **faqat videoga** qarab
qo'yadi va `publishedVideoIds.length > 0` sharti bor.
**Oqibat:** (a) videosiz kurs hech qachon `COMPLETED` bo'lmaydi;
(b) majburiy test yiqilsa ham kurs tugallanadi.
· **Model:** `course.completionRule{requireAllRequired, minScorePercent, requireFinalTest}`
· **Servis:** yangi `courses/courseCompletion.service.js` — yagona `evaluate(userId, courseId)`;
`videoEventProcessor` dagi blok **olib tashlanadi** va shu servisga chaqiruvga almashadi;
`materialProgress.service` va `assessment.gradeAndRecord` ham chaqiradi
· **Bildirishnoma:** `COURSE_COMPLETED`
· **Avtomatlashtirish:** → `certificateQueue` (P1-3), → path progressi (P1-2)
· **Test:** AT-P0-4a…d

### P0-5 · Material yetkazish (audio + yuklab olish + katta fayl)
**Muammo:** `materialAccess.service.js:52-67` presigned URL loopback host
ustidan imzolanadi. Ta'sir **aniq**: `MaterialViewer.vue:401` (audio) va `:450`
(yuklab olish) buzilgan; `:417` (`getContent` — PDF/DOCX/XLSX/PPTX) ishlaydi.
`PARSE_MAX_BYTES` dan katta fayl **umuman ochilmaydi**.
· **Env:** `S3_PUBLIC_ENDPOINT` · **Storage:** `S3StorageProvider.getSignedUrl`
· **Test:** AT-P0-5

### P0-6 · Backup va tiklash
**Muammo:** hech qanday avtomatik zaxira yo'q, tiklash tartibi hujjatlashtirilmagan.
· **Job:** `jobs/backupQueue.js` — kunlik `mongodump` → shifrlash → alohida S3 (30 kun)
· **Hujjat:** `docs/deployment.md` — tiklash tartibi
· **Test:** AT-P0-6 (haqiqiy tiklash sinovi)

### P0-7 · ReDoS kurs qidiruvida
**Muammo:** `course.repository.js:91` `new RegExp(search.trim(),'i')` —
escape'siz. `user.repository.js:101` escape qiladi, bu qilmaydi.
`news.repository.js:42` ham escape'siz.
· **Yechim:** darhol escape; keyin `$text` (P1-9)
· **Test:** AT-P0-7

---

## 21. P1 — iSpring'ning yirik qobiliyat gaplari (21 ta)

| # | Ish birligi | Model | Servis | Endpoint | UI | Ruxsat | Notify | Job | Test |
|---|---|---|---|---|---|---|---|---|---|
| P1-1 | **E-mail yetkazish qatlami** | `notificationTemplate`, `mailLog`, `user.notificationPrefs`, `user.locale` | `mail`, `delivery`, `notificationTemplate`, `preferences` | `GET/PUT /users/me/notification-prefs` | Settings tab | `settings:manage` | 52 tur | `deliveryQueue` (5× retry) | AT-P1-1a…d |
| P1-2 | **Learning path** | `learningPath`, `pathEnrollment` | `learningPath`, `pathEnrollment`, `pathProgress`, `pathSequence` | `/learning-paths` (10) | `PathsView`, `PathDetailView`, `PathsListView`, `PathBuilderView` | `path:*` (5) | `PATH_ASSIGNED/DEADLINE/COMPLETED` | `reminderJob` | AT-P1-2a…c |
| P1-3 | **Sertifikat** | `certificateTemplate`, `certificate`, `externalCertificate` | `certificate`, `certificateTemplate`, `certificateRender`, `certificateVerify` | `/certificate-templates`, `/certificates`, `GET /public/certificates/:serial` | `CertificatesView`, `CertificateTemplatesView` | `certificate:*` (5) | `ISSUED/EXPIRING/EXPIRED/REVOKED` | `certificateQueue` | AT-P1-3a…d |
| P1-4 | **Question modeli + bank** | `question`, `questionBank`, `quizzes` (birlashgan), `testSession` | `question`, `questionBank`, `questionGrading`, `questionSelection` | `/question-banks`, `/questions`, `/quizzes` | `QuestionBanksView`, `QuizEditorView` | `question:bank:manage`, `quiz:manage` | — | — | AT-P1-4a…e |
| P1-5 | **Urinish chegarasi + ball siyosati** | `quiz.maxAttempts`, `scorePolicy`, `quizAttempt.attemptNo` | `quiz.service` guard | 409 `ATTEMPTS_EXHAUSTED` | Qolgan urinishlar | — | `QUIZ_ATTEMPTS_EXHAUSTED` | — | AT-P1-5a,b |
| P1-6 | **`managerId` + ierarxiya** | `user.managerId` | `orgHierarchy` (`$graphLookup`) | `GET /org/hierarchy`, `/org/chart` | `OrgChartView` | `org:hierarchy:manage` | — | — | AT-P1-6 |
| P1-7 | **Manager dashboard** | — | `managerDashboard` | `GET /dashboard/team` | `ManagerDashboardView`; `/bos` guard'i qayta ko'riladi | `team:view` | — | — | AT-P1-7 |
| P1-8 | **XLSX bulk import** | `importJob` | `userImport` (dry-run + commit) | `POST /users/import/{dry-run,commit}` | Import sehrgari | `user:create` | `ACCOUNT_CREATED` | BullMQ | AT-P1-8a,b |
| P1-9 | **Global qidiruv + `$text`** | text indekslar | `globalSearch` | `GET /search`, `/search/suggest` | `CommandPalette` (⌘K) | — | — | `searchIndexQueue` | AT-P1-9a,b |
| P1-10 | **Audit log ko'rish** | `auditLog` +TTL +`{action,timestamp}` | `auditLog` | `GET /audit-logs`, `/export` | `AuditLogView` | `audit:read` | — | — | AT-P1-10 |
| P1-11 | **Knowledge base** | `kbCategory`, `kbArticle`, `kbArticleVersion`, `kbView`, `kbComment` | `kbArticle`, `kbCategory`, `kbVersion`, `kbSearch` | `/kb/*` (12) | `KbView`, `KbArticleView`, `KbAdminView` | `kb:*` (5) | `KB_ARTICLE_REVIEW_DUE` | `complianceQueue` | AT-P1-11 |
| P1-12 | **Live training to'liq** | `event` (+9 maydon), `eventRegistration` | `eventRegistration`, `attendance`, `meetingProvider` | `/events/*` (6) | `EventDetailView`, `EventsAdminView` | `event:manage/register/attendance:mark` | `EVENT_*` (5) | `reminderJob` | AT-P1-12a,b |
| P1-13 | **Uy vazifasi (Assignment)** | `assignment`, `submission`, `rubric` | `assignment`, `submission`, `grading` | `/assignments/*` (8) | `AssignmentView`, `AssignmentsGradingView` | `assignment:*` (3) | `ASSIGNMENT_*` (4) | — | AT-P1-13 |
| P1-14 | **Onboarding + development plan** | `onboardingProgram`, `onboardingEnrollment`, `developmentPlan`, `planReview` | `onboardingProgram`, `onboardingEnrollment`, `developmentPlan` | `/onboarding/*`, `/development-plans` | `OnboardingView`, `OnboardingProgramsView`, `DevelopmentPlanView` | `onboarding:manage`, `plan:*` | `ONBOARDING_*` (4) | `onboardingQueue` | AT-P1-14 |
| P1-15 | **Compliance + re-enrollment** | `recurringAssignment` | `recurringAssignment`, `complianceReport` | `/recurring-assignments`, `/compliance/matrix` | `ComplianceView` | `compliance:view` | `COMPLIANCE_RETRAINING_DUE` | `complianceQueue` | AT-P1-15 |
| P1-16 | **Kurs metadatasi** | `courseCategory`, `course` +11 maydon | `category` | `/course-categories`, `?categoryId&tags&level` | Katalog filtri | — | — | — | AT-P1-16 |
| P1-17 | **Enrollment rules** | `enrollmentRule` | `enrollmentRule` | `/enrollment-rules` | `EnrollmentRulesView` | `automation:manage` | — | `enrollmentRuleQueue` | AT-P1-17 |
| P1-18 | **Rol tahriri + ruxsat UI** | `role.scope` | `role` | `PATCH /roles/:id` | `RolesPermissionsView` | `role:manage` | — | — | AT-P1-18 |
| P1-19 | **Hisobot: 17 yangi tur + ko'rish + async** | `exportJob`, `scheduledReport` | `reportData` builders, `exportJob`, `scheduledReport` | `/scheduled-reports`, `/export-jobs` | `ReportsView` jadval+grafik, `ScheduledReportsView` | `report:schedule` | `REPORT_READY`, `SCHEDULED_REPORT` | `exportQueue`, `scheduledReportQueue` | AT-P1-19 |
| P1-20 | **Matnli dars (Lesson/Page)** | `lesson`, `lessonProgress` | `lesson` | `/topics/:id/lessons` | `LessonView`, blok editori | `course:update` | — | — | AT-P1-20 |
| P1-21 | **PWA + oflayn + push** | `pushSubscription`, `+clientEventId` | `push` | `/push/subscribe` | manifest, SW, IndexedDB | — | Push kanali | Background Sync | AT-P1-21 |

## 22. P2 — muhim yaxshilanish (19 ta)

| # | Ish birligi | Asosiy o'zgarish |
|---|---|---|
| P2-1 | Badge dvigateli | `badge`, `userBadge` modellari; `criteria` + `BADGE_EARNED` notify |
| P2-2 | SCORM 1.2/2004 import | `scormPackage`, `scormState`, iframe API adapter, helmet CSP `frame-src` |
| P2-3 | xAPI LRS | `xapiStatement`, `POST /xapi/statements` |
| P2-4 | Public API + kalitlar | `apiKey`, `apiKeyAuth`, per-key limit, `/api/public/v1` |
| P2-5 | OpenAPI hujjati | `zod-to-openapi` → `/openapi.json`, `/api/docs` |
| P2-6 | OIDC SSO + JIT | `ssoConfig`, claim → rol/bo'lim mapping |
| P2-7 | Settings + branding | `settings` singleton — `attentionPolicy` meros naqshini umumlashtirish |
| P2-8 | Media kutubxona + orphan tozalash | `mediaAsset`, `mediaCleanupQueue` (`course.service.js:378` qarzi) |
| P2-9 | Kompetensiya + 360° | `competency`, `reviewCycle`, `reviewAssignment`, `reviewResponse`; anonimlik N≥3 |
| P2-10 | OJT | `ojtChecklist`, `ojtSession`, `ojtObservation`; mobil forma |
| P2-11 | Dinamik guruhlar | `group.type`, `group.rule{}` |
| P2-12 | Custom profil maydonlari | `customFieldDef`, `user.customFields` |
| P2-13 | Kontent turlari: URL + embed | `ContentItem type=LINK/EMBED`, allowlist + sandbox |
| P2-14 | Subtitr / VTT | ffmpeg pipeline + `<track>` (a11y uchun **majburiy**) |
| P2-15 | Accessibility | modal focus-trap, ARIA, `:focus-visible`, `altText`, kontrast, `axe-core` CI |
| P2-16 | Yagona kalendar + iCal | `calendar.service` agregator |
| P2-17 | Performance tuzatishlar | N+1 (`reminderJob:18-50`), to'liq skan (`dashboardAggregation:98`), leaderboard xotira (`points.service:92`), Socket.io Redis adapter |
| P2-18 | Yuklab olishni cheklash | `material.allowDownload`; `openStream` **allaqachon tayyor** |
| P2-19 | Drag-drop tartiblash | Batch reorder endpoint + `SortableList` |

## 23. P3 — nice-to-have (15 ta)

`Kurs versiyalash` · `Kurs nusxalash` · `Autosave` · `Newsfeed izohlari` ·
`Emoji reaksiya` · `@mention` · `Tavsiya tizimi` · `Level dvigateli` ·
`Tug'ilgan kun tabrigi` · `Yangi xodim kartasi` · `Ekran yozib olish` ·
`Transkripsiya` · `Branching scenario` · `Rasm optimizatsiyasi` ·
`Storage sarfi ko'rsatkichi`

---

# 24. NOT APPLICABLE — asoslangan rad javoblari

| # | iSpring qobiliyati | Nega bizga tegishli emas | Muqobil | Qayta ko'rish sharti |
|---|---|---|---|---|
| 1 | **Native mobil ilova** (iOS/Android + white-label) | Ikkinchi kod bazasi, ikkita reliz sikli, App Store review — bitta kompaniya ichida ishlatiladigan mahsulot uchun sof xarajat | PWA (P1-21) + Telegram kanali | Dala sharoitida oflayn OJT real ehtiyoj bo'lsa |
| 2 | **Multi-tenant (Organization izolyatsiyasi)** | 39 kolleksiyaga `orgId` qo'shish va har so'rovga scope — katta xarajat, bitta kompaniya uchun nol qiymat | `Branch` allaqachon ko'p ofisni qoplaydi | Platforma boshqa kompaniyalarga sotilsa |
| 3 | **SOAP API** | Eskirgan protokol; hech bir mahalliy HR tizimi talab qilmaydi | REST public API (P2-4) | Mijoz aniq talab qilsa |
| 4 | **cmi5** | Rasmiy manbada iSpring uchun ham tasdiqlanmagan; mahalliy amaliyotda ishlatilmaydi | SCORM 1.2/2004 (P2-2) + xAPI (P2-3) | — |
| 5 | **PowerPoint desktop add-in** | iSpring Suite — alohida desktop mahsulot. Bizda desktop yo'q va bo'lmaydi | Brauzerda PPTX → dars bloki | — |
| 6 | **Tayyor kurslar kutubxonasi / marketplace** (iSpring Academy, Udemy, LinkedIn Learning, GoodHabitz) | Ichki korporativ platforma; tashqi kontent sotib olinmaydi | — | HR tashqi kontent budjeti ochsa |
| 7 | **E-commerce** | Kurslar ichkarida bepul; to'lov provayderi PCI mas'uliyatini olib keladi | Rezervda | Kurslar tashqariga sotilsa |
| 8 | **Oflayn test topshirish** | Server taymeri va focus-loss nazorati — bizning imtihon yaxlitligimizning asosi (§18.1 №5–7). Oflayn bu kafolatlarni yo'qotadi | Test faqat onlayn; oflayn — o'qish materiali | — |
| 9 | **Oflayn biometrik tekshiruv** | Descriptor'ni qurilmaga chiqarishni talab qiladi — biometrik ma'lumot xavfsizligini pasaytiradi | Onlayn gate | — |
| 10 | **24/7 support + SLA** | Bu mahsulot qobiliyati emas, xizmat modeli | Ichki IT | — |

> **Muhim:** №1 va №2 — eng qimmat rad javoblari. Ikkalasi ham **qaytarib
> bo'lmaydigan** qaror emas: PWA keyinchalik Capacitor bilan native'ga
> o'ralishi mumkin, `orgId` esa yangi kolleksiyalarga boshidan qo'shilsa
> keyinchalik migratsiya arzonlashadi. **Tavsiya:** barcha yangi modellarga
> `orgId` maydonini **hozirdan `default: null`** bilan qo'shib qo'yish —
> bugun hech narsani o'zgartirmaydi, ertaga multi-tenant qarori arzonlashadi.

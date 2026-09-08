# 25. DEPENDENCY GRAPH · 26. ROADMAP · 27. ACCEPTANCE TESTS · 28. REGRESSION TESTS · 30. MASTER CHECKLIST

---

# 25. DEPENDENCY GRAPH

```
ZANJIR A — SCOPE VA SHAXS  (uchta P0 shu yerda)
  P0-2 role.scope + scopeToManagedUsers
    ├─→ P0-1 hisobot va dashboard scope'i
    ├─→ P1-6 user.managerId + $graphLookup
    │     ├─→ P1-7 manager dashboard
    │     ├─→ P2-9 360° (baholovchilarni avtomatik aniqlash)
    │     └─→ P1-14 onboarding (mentor/rahbar biriktirish)
    └─→ P1-18 rol tahriri + ruxsat matritsasi UI

ZANJIR B — YETKAZISH  (eng ko'p boshqa ishni ochadi)
  P1-1 mail.service + deliveryQueue + NotificationTemplate + prefs
    ├─→ parolni tiklash ISHLAYDI          (hozir logger'ga yoziladi)
    ├─→ P1-8 XLSX import (hisob ma'lumoti yuborish)
    ├─→ P1-12 tadbir eslatmalari
    ├─→ P1-15 compliance eslatmalari
    ├─→ P1-3 sertifikat bildirishnomasi
    ├─→ P1-19 rejalashtirilgan hisobot
    ├─→ P2-1 badge berilganda xabar
    └─→ P1-21 web push (kanal sifatida)

ZANJIR C — TUGATISH VA ISBOT
  P0-4 completionRule (yagona servis)
    ├─→ P1-3 sertifikat (avtomatik berish)
    │     └─→ P1-15 compliance / re-enrollment
    │           └─→ audit pack hisoboti
    └─→ P1-2 learning path progressi
          └─→ path sertifikati

ZANJIR D — BAHOLASH
  P1-4 Question + QuestionBank + questionGrading
    ├─→ P1-5 maxAttempts + scorePolicy
    ├─→ savol qiyinligi statistikasi (P1-19)
    ├─→ essay → P1-13 assignment grading
    └─→ AI quiz generatsiyasi (P2)

ZANJIR E — KONTENT
  P1-20 Lesson (blokli matn dars)
    ├─→ blok editori + drag-drop (P2-19)
    ├─→ AI kurs generatsiyasi (P2)
    └─→ P2-2 SCORM (ContentItem sifatida)

ZANJIR F — QIDIRUV
  P0-7 regex escape  →  P1-9 $text indeks
    ├─→ global search + ⌘K
    └─→ P1-11 knowledge base qidiruvi
```

**Bog'liqliksiz (istalgan vaqtda, parallel):** P0-3 (leaderboard PII) ·
P0-5 (presign host) · P0-6 (backup) · P0-7 (ReDoS) · P1-10 (audit UI) ·
P2-17 (performance) · frontend poydevor komponentlari (`DataTable`, `FilterBar`, `Chart`).

---

# 26. IMPLEMENTATION ROADMAP

| Blok | Hafta | Tarkib | Parity ta'siri |
|---|:--:|---|---|
| **B0** | 1 | P0-3, P0-5, P0-6, P0-7 + audit UI (P1-10) + performance (P2-17) + frontend poydevor | 37 → 39 |
| **B1** | 3 | P0-2 → P0-1 (scope zanjiri) | 39 → 42 |
| **B2** | 3 | P1-1 yetkazish qatlami (B1 bilan **parallel**) | 42 → 48 |
| **B3** | 4 | P0-4 → P1-3 sertifikat | 48 → 56 |
| **B4** | 4 | P1-4 → P1-5 baholash (B3 bilan **parallel**) | 56 → 63 |
| **B5** | 4 | P1-2 learning path + P1-17 enrollment rules | 63 → 69 |
| **B6** | 4 | P1-6, P1-7, P1-8, P1-18 (shaxs va boshqaruv) | 69 → 74 |
| **B7** | 4 | P1-12 live training + P1-13 assignment + kalendar | 74 → 79 |
| **B8** | 4 | P1-9 qidiruv + P1-11 knowledge base | 79 → 83 |
| **B9** | 3 | P1-14 onboarding + development plan | 83 → 86 |
| **B10** | 3 | P1-15 compliance + P1-16 kurs metadatasi | 86 → 89 |
| **B11** | 3 | P1-19 hisobot (17 tur + ko'rish + async + reja) | 89 → 92 |
| **B12** | 4 | P1-20 Lesson + P2-2 SCORM + P2-14 subtitr | 92 → 94 |
| **B13** | 3 | P1-21 PWA + oflayn + push | 94 → 96 |
| **B14** | 4 | P2 qolgani: API, SSO, media, badge, 360, OJT, a11y | 96 → 98 |

**Bitta dasturchi:** ~47 hafta (≈11 oy) · **Ikki dasturchi** (B1‖B2, B3‖B4): ~32 hafta (≈7,5 oy)

> **Parity ta'siri** — `docs/v4/03-parity-matrix.md` dagi vaznlangan
> shkalada hisoblangan taxmin. B0–B4 tugagach (≈15 hafta) parity **37 → 63**
> ga chiqadi: bu iSpring bilan haqiqiy raqobatga kiradigan nuqta.

---

# 27. ACCEPTANCE TESTS

> Format: **BERILGAN → HARAKAT → KUTILGAN** (HTTP · DB · audit · bildirishnoma · hisobot ta'siri).
> `backend/test/` ga `security.test.js` naqshida yoziladi.

## P0 testlari

**AT-P0-1 · Hisobot scope'i**
BERILGAN: MANAGER "Sotuv"da; kompaniyada 500 xodim, "Sotuv"da 40 ta.
HARAKAT: `GET /reports/employee-progress/export?format=xlsx`.
KUTILGAN: faylda **aynan 40 qator**; boshqa bo'lim xodimi yo'q;
`auditLogs` da `REPORT_EXPORTED` (tur, filtr, `rowCount:40`).
*Hozir: 500 qator qaytadi.*

**AT-P0-2 · Custom rol ham scope'lanadi**
BERILGAN: `POST /roles {name:'SUPERVISOR', permissions:['user:read'], scope:'DEPARTMENT'}`.
HARAKAT: shu roldagi foydalanuvchi `GET /users`.
KUTILGAN: faqat o'z bo'limi. *Hozir: butun kompaniya (`roleName !== 'MANAGER'`).*

**AT-P0-3 · Leaderboard PII**
HARAKAT: EMPLOYEE bilan `GET /gamification/leaderboard`.
KUTILGAN: `fullName`, `avatar`, `department`, `totalPoints` bor; **`jshshir` yo'q**.
`ANALYTICS_VIEW_ALL` bilan chaqirilganda bo'lishi mumkin.

**AT-P0-4a · Videosiz kurs tugallanadi**
BERILGAN: kursda 1 taqdimot (10 sahifa) + 1 assessment, video yo'q.
HARAKAT: xodim 10 sahifani ko'radi va testdan o'tadi.
KUTILGAN: `completionPercent:100`; `CourseAssignment.status='COMPLETED'`;
`COURSE_COMPLETED` bildirishnomasi; hisobotda `completedCourses` +1.
*Hozir: abadiy `ACTIVE` (`publishedVideoIds.length > 0` sharti).*

**AT-P0-4b · Majburiy test yiqilsa kurs tugallanmaydi**
BERILGAN: 2 video + 1 majburiy assessment; `requireAllRequired:true`.
HARAKAT: videolar tugatiladi, testdan yiqiladi.
KUTILGAN: `status='ACTIVE'`; sertifikat **berilmaydi**.

**AT-P0-4c · Progress va status hech qachon zid emas**
KUTILGAN: `completionPercent===100` ⟺ `status==='COMPLETED'`.

**AT-P0-4d · Yangi majburiy video qo'shilsa**
KUTILGAN: `COMPLETED` assignment `ACTIVE` ga qaytadi; berilgan sertifikat
**bekor qilinmaydi** (o'sha paytdagi holatni aks ettiradi).

**AT-P0-5 · Material yetkazish**
KUTILGAN: production'da audio material o'ynaydi; PDF yuklab olinadi;
`PARSE_MAX_BYTES` dan katta PDF yuklab olish orqali ochiladi.

**AT-P0-6 · Backup va tiklash**
KUTILGAN: kunlik dump S3'da; **bitta tiklash haqiqatan bajarilgan** va
hujjat sanasi bilan qayd etilgan; tiklangan bazada hujjatlar soni mos.

**AT-P0-7 · ReDoS**
HARAKAT: `GET /courses?search=(a%2B)%2B%24`.
KUTILGAN: javob **< 200 ms**; CPU o'smaydi.

## P1 testlari (tanlangan)

**AT-P1-1a** Parolni tiklash **e-mail bilan** keladi, foydalanuvchi tilida,
1 soat amal qiladi, ikkinchi marta 400.
**AT-P1-1b** `notificationPrefs.COURSE_ASSIGNED.email=false` → in-app bor,
e-mail yo'q, `deliveryLogs` da `EMAIL` yozuvi yo'q.
**AT-P1-1c** `PUT /users/me/notification-prefs {PASSWORD_RESET:{email:false}}`
→ **400 `MANDATORY_NOTIFICATION`**.
**AT-P1-1d** SMTP 500 qaytarsa 5× exponential retry; `mailLogs.status='FAILED'`;
**in-app bildirishnoma baribir yetkazilgan**.

**AT-P1-2a** 4 kursli `sequential` path: 2-kurs video token'i to'g'ridan-to'g'ri
so'ralganda **403 `PREVIOUS_PATH_ITEM_INCOMPLETE`**.
**AT-P1-2b** 3 majburiy + 2 ixtiyoriy: majburiylar tugagach
`completionPercent:100`, path sertifikati beriladi.

**AT-P1-3a** Kurs tugagach **60 soniya ichida** sertifikat; PDF'da to'g'ri
ism, kurs, sana, serial, QR.
**AT-P1-3b** Tugatish hodisasi ikki marta ishga tushsa — **bitta** sertifikat
(unique partial indeks `{userId,sourceType,sourceId}` `revokedAt:null`).
**AT-P1-3c** `GET /public/certificates/:serial` auth'siz 200; javobda ism,
kurs, sana, holat; **`jshshir`/`email`/`phone`/`userId` yo'q**; 10 so'rov/daq
dan keyin 429; noto'g'ri serial 404.
**AT-P1-3d** `revokedAt` bo'lsa `status:'REVOKED'`, PDF havolasi berilmaydi.

**AT-P1-4a** 50 savollik bankdan `pools[{count:10}]` — `start` → savollarni
yozib olish → reload → yana `start`: **aynan bir xil 10 savol, bir xil tartibda**.
**AT-P1-4b** `MULTI_CHOICE`, 4 variant, 2 to'g'ri, `points:10`,
`partialCredit:true`: 1 to'g'ri + 1 noto'g'ri → 0; 2+0 → 10; 1+0 → 5.
**AT-P1-4c** M1 migratsiyasidan keyin eski `Quiz` va 20 `QuizAttempt`
o'zgarmagan holda ko'rinadi; `_legacy` kolleksiyalar saqlanadi.
**AT-P1-4d** O'quvchi javobida `isCorrect` **hech qachon** yo'q.
**AT-P1-4e** `revealMode:'NEVER'` da submit javobida
`correctOptionIndexByQuestion` **yo'q**.

**AT-P1-5a** `maxAttempts:2`, 2 urinish bor → 3-urinish **409
`ATTEMPTS_EXHAUSTED`**; attempt yaratilmaydi; audit yoziladi;
`QUIZ_ATTEMPTS_EXHAUSTED` bildirishnomasi; hisobotdagi ball o'zgarmaydi.
**AT-P1-5b** `maxAttempts:1`, ikkita tab bir vaqtda submit → **aynan bitta**
attempt, ikkinchisi 409.

**AT-P1-8a** 300 satrli XLSX, 3 takroriy JSHSHIR, 2 noto'g'ri bo'lim:
`dry-run` hech nima yaratmaydi; `{willCreate:295, errors:[{row,field,code}]}`;
xato hisoboti XLSX bo'lib yuklanadi.
**AT-P1-8b** `commit` → 295 foydalanuvchi; parollar **javobda bir marta**;
`USERS_IMPORTED` + har biriga `USER_CREATED` audit; `ACCOUNT_CREATED` e-maili.

**AT-P1-9a** `⌘K` qidiruv kurs, dars, KB, foydalanuvchini topadi.
**AT-P1-9b** "Rahbariyat"ga cheklangan kurs oddiy xodim qidiruvida
**nomi bilan ham ko'rinmaydi**.

**AT-P1-12a** `capacity:10`, 10 kishi ro'yxatda → 11-kishi `WAITLIST`,
`waitlistPosition:1`; kimdir bekor qilsa avtomatik `REGISTERED` +
`EVENT_WAITLIST_PROMOTED`.
**AT-P1-12b** `PATCH /events/:id {startAt}` → barcha `REGISTERED` va
`WAITLIST` 1 daqiqa ichida `EVENT_RESCHEDULED` oladi (mandatory).

**AT-P1-15** `intervalMonths:12`, 12 oy oldin tugatgan xodim: kunlik
`complianceQueue` yangi assignment yaratadi (deadline +30 kun),
`COMPLIANCE_RETRAINING_DUE` yuboradi, `nextRunAt` +12 oyga suriladi.

**AT-P1-21** Oflayn 5 daqiqa video, 12 hodisa navbatda; sinxronizatsiya
**ikki marta** ishga tushadi → `uniqueWatchedSeconds` aynan 300 s ga oshadi
(600 emas); `videoAnalyticsEvents` da 12 yozuv (24 emas) — `clientEventId`
unique indeksi.

---

# 28. REGRESSION TESTS

> Bular yangi feature emas — **§18 dagi ustunliklarimizni** refactor'lardan
> himoya qiladi. Har bir blokdan keyin ishlashi shart.

| # | Test | Nimani himoya qiladi | Manba |
|---|---|---|---|
| RT-01 | Videoni oxiriga sudrash foizni oshirmaydi | `watchedSegments` merge | `analytics/watchedSegments.js` |
| RT-02 | `requireRewatch:true` da diqqatsizlik oralig'i progressdan ayiriladi | `subtractSegments` | `videoEventProcessor.js:172` |
| RT-03 | Assessment reload yangi 15 daqiqa bermaydi | `expiresAt` bir marta stamplanadi | `assessmentSession.model.js` |
| RT-04 | Tashlab ketilgan sessiya nol ballli attempt yozadi | `closeExpiredSession` | `assessment.service.js:243` |
| RT-05 | Ikkinchi focus-loss sessiyani tugatadi va javoblarni baholaydi | `ASSESSMENT_FOCUS_LOSS_LIMIT` | `assessment.service.js:265` |
| RT-06 | Savollar `start` dan oldin berilmaydi | learner shoxi | `assessment.service.js:194` |
| RT-07 | Oldingi darsni tugatmasdan token berilmaydi | `assertVideoUnlocked` | `courseSequence.js:79` |
| RT-08 | O'quvchiga `isCorrect` yuborilmaydi | `includeAnswers` | `quiz.service.js:22` |
| RT-09 | Bir video uchun ball ikki marta berilmaydi | sparse unique | `pointsLedger.model.js:20` |
| RT-10 | 40-sahifaga sakrash 40% bermaydi | `viewedPages` to'plami | `materialProgress.model.js` |
| RT-11 | Face embedding hech qanday javobda yo'q | `select:false` | `faceProfile.model.js` |
| RT-12 | Trashdagi kurs assignment'i ro'yxatda ko'rinmaydi | live filtri | `courseAssignment.service.js:158` |
| RT-13 | Face gate uch harakatda ham 403 beradi, `details.action` mos | `FACE_GATE_ACTIONS` | 3 servis |
| RT-14 | MANAGER boshqa bo'lim xodimiga 403 | `assertManagerCanView` | `user.service.js:87` |
| RT-15 | Refresh token qayta ishlatilsa butun sessiya oilasi bekor | `replacedBy` | `session.model.js` |
| RT-16 | Begona yuz snapshot'i faqat audit-logli endpoint orqali | — | `proctorSnapshot.service.js` |
| RT-17 | Trash muddati o'tgan yozuvni avtomatik tozalaydi | `listExpired` | `trash.service.js` |
| RT-18 | `terminationDate` qo'yilsa hisob darhol nofaol | — | `user.service.js:296` |

---

# 30. MASTER IMPLEMENTATION CHECKLIST

> Ketma-ket. `[P]` = parallel qilinadi.

### B0 — bir hafta, hammasi bog'liqliksiz
- [ ] `[P]` P0-3 `points.service.js:104` — `jshshir` DTO'dan · **AT-P0-3**
- [ ] `[P]` P0-7 `course.repository.js:91` + `news.repository.js:42` regex escape · **AT-P0-7**
- [ ] `[P]` P0-5 `S3_PUBLIC_ENDPOINT` + `S3StorageProvider.getSignedUrl` · **AT-P0-5**
- [ ] `[P]` P0-6 `jobs/backupQueue.js` + `docs/deployment.md` + tiklash sinovi · **AT-P0-6**
- [ ] `[P]` P1-10 `audit.routes.js` + `auditLog.service.js` + `AuditLogView.vue` + TTL indeks
- [ ] `[P]` P2-17 N+1 (`reminderJob:18-50` → `$in`+`bulkWrite`), `dashboardAggregation:98` → aggregation, `points.service:92` → `$sort`+`$limit`, `socket.io-redis-adapter`
- [ ] `[P]` `ui/DataTable.vue`, `ui/FilterBar.vue`, `ui/Chart.vue`, `ui/FileDropzone.vue`, `ui/SortableList.vue`, `ui/UserPicker.vue` — mavjud `UsersListView` va `TasksListView` shularga ko'chiriladi
- [ ] `[P]` Sentry/GlitchTip · `admin/` papkasini o'chirish
- [ ] `[P]` RT-01…RT-18 regressiya testlarini yozish

### B1 — scope zanjiri
- [ ] P0-2 `role.model.js +scope` · `scopeToManagedUsers.middleware.js` · 14 joyni almashtirish · migratsiya · **AT-P0-2**
- [ ] P0-1 `reportData.service.build(actor,...)` · `dashboard?scope=` · `REPORT_EXPORTED` audit · **AT-P0-1**

### B2 — yetkazish (B1 bilan parallel)
- [ ] P1-1a `mail.service.js` + `jobs/deliveryQueue.js` + `mailLog.model.js` · **AT-P1-1d**
- [ ] P1-1b `notificationTemplate.model.js` + M9 seed (25 tur × 3 til × 3 kanal)
- [ ] P1-1c `user +locale +notificationPrefs` · `GET/PUT /users/me/notification-prefs` · **AT-P1-1b,c**
- [ ] P1-1d `notify()` → `deliveryQueue.add()`; `reminderJob.js:22` hardcoded matnlarni `templateKey` ga
- [ ] P1-1e Parolni tiklash e-maili (`auth.service.js:212`) · **AT-P1-1a**
- [ ] P1-1f Yetishmayotgan trigger'lar: `COURSE_COMPLETED`, `QUIZ_PASSED/FAILED`, `NEWS_PUBLISHED`, `ACCOUNT_CREATED`, `LOGIN_FROM_NEW_DEVICE`

### B3 — tugatish + sertifikat
- [ ] P0-4 `courses/courseCompletion.service.js` · `course.completionRule` · `videoEventProcessor:238-252` olib tashlash · **AT-P0-4a…d**
- [ ] P1-3a `certificateTemplate`, `certificate`, `externalCertificate` modellari
- [ ] P1-3b `certificateRender.service.js` (`pdfkit` + DejaVu — **mavjud**) + `jobs/certificateQueue.js` · **AT-P1-3a,b**
- [ ] P1-3c `GET /public/certificates/:serial` (auth'siz, rate-limited, PII'siz) · **AT-P1-3c,d**
- [ ] P1-3d `CertificatesView.vue`, `CertificateTemplatesView.vue` + pozitsiya editori

### B4 — baholash (B3 bilan parallel)
- [ ] P1-4a `question.model.js` (13 tur `payload`) + `questionBank.model.js`
- [ ] P1-4b `questionGrading.js` — har tur uchun · **AT-P1-4b**
- [ ] P1-4c `quiz`/`assessment` → yagona `quizzes` + `testSession`; M1, M5 · **AT-P1-4c**
- [ ] P1-4d `questionSelection.js` — pool + shuffle + attempt'da muzlatish · **AT-P1-4a**
- [ ] P1-5 `maxAttempts` atomik guard + `scorePolicy` + `revealMode` · **AT-P1-5a,b, AT-P1-4d,e**
- [ ] P1-4e `QuestionBanksView.vue`, `QuizEditorView.vue`; video quiz'ga ham `testSession`

### B5–B14
- [ ] B5 P1-2 learning path (10 endpoint, 4 sahifa) · **AT-P1-2a,b** · P1-17 enrollment rules
- [ ] B6 P1-6 `managerId`+`$graphLookup` · P1-7 manager dashboard · P1-8 XLSX import (**AT-P1-8a,b**) · P1-18 rol tahriri
- [ ] B7 P1-12 live training (**AT-P1-12a,b**) · P1-13 assignment · P2-16 yagona kalendar
- [ ] B8 P1-9 `$text` + global search (**AT-P1-9a,b**) · P1-11 knowledge base + `sanitize-html`
- [ ] B9 P1-14 onboarding + development plan
- [ ] B10 P1-15 compliance + re-enrollment (**AT-P1-15**) · P1-16 kurs metadatasi
- [ ] B11 P1-19 hisobot: 17 tur + ekranda ko'rish + `exportQueue` + `scheduledReport`
- [ ] B12 P1-20 Lesson + blok editori · P2-2 SCORM (+ helmet CSP `frame-src`) · P2-14 subtitr
- [ ] B13 P1-21 PWA + oflayn + push · **AT-P1-21**
- [ ] B14 P2 qolgani: P2-4 public API, P2-6 OIDC, P2-8 media kutubxona, P2-1 badge, P2-9 360°, P2-10 OJT, P2-15 a11y

### Infratuzilma (koddan tashqarida, bloklovchi)
- [ ] **INF-1** Ajratilgan server: 4 vCPU / 8 GB RAM / 200 GB SSD — B12 va AI ishlari buni talab qiladi
- [ ] **INF-2** Media uchun ochiq host (`media.sds-max.uz`) — P0-5 bilan
- [ ] **INF-3** SMTP provayder hisobi — B2 uchun **shart**
- [ ] **INF-4** CDN — HLS segmentlar

### Yangi model qoidasi (arzon sug'urta)
- [ ] Barcha **yangi** modellarga `orgId: {type: ObjectId, default: null}` qo'shish —
      bugun hech narsani o'zgartirmaydi, ertaga multi-tenant qarori arzonlashadi (§24 №2)

---

# 29. VERIFY RO'YXATI — sotuvchi bilan aniqlanishi kerak

> Bu 20 savol javob olguncha, ularga tegishli parity qarorlari **vaqtinchalik**.

1. Webhooks bormi (chiquvchi, hodisaga asoslangan)?
2. cmi5 qo'llab-quvvatlanadimi?
3. SAML SSO bormi (JWT va Entra ID'dan tashqari)?
4. Sertifikatning ommaviy tekshiruv sahifasi / QR bormi?
5. To'liq savol turlari ro'yxati qanday?
6. Essay savoli va qo'lda baholash bormi?
7. Qisman ball (partial scoring) bormi?
8. Savolga alohida og'irlik (points) berish mumkinmi?
9. WCAG 2.1 AA muvofiqlik bayonoti bormi?
10. Admin harakatlari uchun audit jurnali bormi?
11. 2FA / TOTP bormi?
12. Video watermark yoki DRM bormi?
13. Proctoring / kamera nazorati bormi?
14. Rate limiting va brute-force himoyasi qanday?
15. Kurs versiyalash bormi?
16. Kontent tasdiqlash (review/approval) oqimi bormi?
17. Hisobot scope'i qanday majburlanadi (rol × bo'lim)?
18. LMS ichida ekran yozib olish bormi?
19. Branching scenario LMS ichidami yoki faqat Suite'da?
20. Enrollment tasdiqlash (rahbar approval) oqimi bormi?

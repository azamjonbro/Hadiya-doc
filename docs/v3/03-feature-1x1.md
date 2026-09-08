# 4. 1×1 FEATURE COMPARISON — chuqur format

> **Format haqida.** So'ralgan 25 maydonli format har bir feature uchun ~40
> satr oladi. 612 feature uchun bu ~25 000 satr bo'lardi va o'qib bo'lmasdi.
> Shuning uchun bu yerda **qaror talab qiladigan 24 feature** to'liq formatda
> berilgan — har bir asosiy domendan eng og'ir biri. Qolgan featurelar
> `docs/v2/02-feature-matrix.md` dagi 12 ustunli qisqa formatda, va §1 dagi
> tuzatishlar ular uchun ham amal qiladi.

---

## F-01 · COURSE COMPLETION

**DOMAIN:** Course Management
**FEATURE:** Kurs tugatilganini aniqlash

**iSPRING:** Kurs darajasida sozlanadigan qoida: barcha majburiy elementlar /
belgilangan foiz / yakuniy testdan o'tish. Element turi ahamiyatsiz — video,
hujjat, SCORM, topshiriq bir xil hisobga olinadi. Tugatish sertifikat
berilishini, path'da keyingi qadamni va compliance holatini boshqaradi.

**OUR SYSTEM:** **Ikki xil, bir-biriga zid hisob.**
`course.service.js:110-140` `computeCourseProgress` — video (1/0) + material
(o'qilgan sahifa ulushi) + assessment (o'tilgan bo'lsa 1) o'rtachasi;
UI shuni ko'rsatadi. `analytics/videoEventProcessor.js:238-252` — assignment
statusini `COMPLETED` qiladi va **faqat published videolarga** qaraydi.

**STATUS:** REFACTOR · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Xodim kurs sahifasida 100% ko'radi, "Mening kurslarim"da
esa u hamon "davom etmoqda" bo'lib turadi (yoki aksincha).
**BUSINESS LOGIC:** Videosiz kurs (`publishedVideoIds.length > 0` sharti)
**hech qachon** tugallanmaydi. Majburiy test yiqilgan bo'lsa ham videolar
tugagach kurs tugallanadi.
**DATABASE:** `courses.completionRule{requireAllRequired, minScorePercent, requireFinalTest}` yo'q.
**BACKEND:** Tugatish mantiqi ikkita faylga tarqalgan; bittasi analitika
ishlov beruvchisi ichida.
**API:** `GET /courses/:id/progress` progressni beradi, lekin `assignment.status`
bilan mos kelishi kafolatlanmagan.
**FRONTEND:** `CourseDetailView.vue` progress foizini ko'rsatadi, status'ni emas.
**PERMISSIONS:** `getProgressForUser` `analytics:view:all` bilan — to'g'ri.
**NOTIFICATIONS:** Tugatishda **hech qanday bildirishnoma yo'q**.
**AUTOMATION:** Tugatish hech narsani ishga tushirmaydi (sertifikat yo'q,
path yo'q).
**REPORTING:** `employeeProgress` `assignment.status === 'COMPLETED'` ni
sanaydi — ya'ni **noto'g'ri raqamni** sanaydi.
**MOBILE:** Ta'sir bir xil. **MULTILINGUAL:** Ta'sirsiz.
**SECURITY:** Xavfsizlik muammosi emas, yaxlitlik muammosi.
**EDGE CASES:** (a) faqat material+test kursi — abadiy ACTIVE; (b) video
`DRAFT`ga qaytarilsa tugallangan kurs qayta ochiladi; (c) yangi video
qo'shilsa `COMPLETED` assignment `ACTIVE`ga qaytmaydi.
**WHAT WE DO BETTER:** Progress hisobida material sahifa ulushi bilan
kiritilishi — iSpring hujjatni all-or-nothing sanaydi.
**WHAT iSPRING DOES BETTER:** Bitta, sozlanadigan, kontent turidan qat'i nazar
ishlaydigan qoida.
**GAP:** Yagona `completionRule` va uni baholaydigan bitta servis.
**REQUIRED CHANGE:** `services/courses/courseCompletion.service.js` yaratish;
`videoEventProcessor` dagi blokni olib tashlab, uni shu servisga chaqiruvga
almashtirish; `materialProgress` va `assessmentAttempt` yozuvlaridan ham
chaqirish; `courses.completionRule` maydonini qo'shish.
**ACCEPTANCE CRITERIA:** Quyidagi §10 AT-01…AT-04.
**COMPLEXITY:** M
**DEPENDENCIES:** —  (bu boshqa hamma narsaning **oldida** turadi: sertifikat,
path, compliance shundan oziqlanadi)

---

## F-02 · QUIZ ATTEMPT LIMIT

**DOMAIN:** Assessments
**FEATURE:** Urinishlar sonini cheklash

**iSPRING:** Test darajasida `maxAttempts`; chegara tugaganda yangi urinish
boshlanmaydi; qaysi urinish hisobga olinishi (oxirgi/eng yaxshi/birinchi)
alohida sozlanadi; rahbar qo'shimcha urinish berishi mumkin.

**OUR SYSTEM:** **Chegara umuman yo'q.** `quiz.service.js:88-133` `submit()`
har chaqiruvda yangi `QuizAttempt` yozadi. Yagona shart — videoning tugallangani
(`:92-95`). `assessment.service.js` da ham chegara yo'q.

**STATUS:** ADD · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Xodim testni cheksiz qayta topshiradi; javoblar
`getAttemptsForUser` orqali ko'rinmasa ham, tasodifiy tanlash bilan 100% ga
chiqish vaqt masalasi.
**BUSINESS LOGIC:** Test o'lchov vositasi bo'lishdan to'xtaydi.
**DATABASE:** `quizzes.maxAttempts` yo'q; `quizAttempts.attemptNo` yo'q.
**BACKEND:** `submit()` da guard yo'q.
**API:** `POST /videos/:id/quiz/submit` har doim 200 qaytaradi.
**FRONTEND:** `VideoQuizView.vue` qolgan urinishlarni ko'rsatmaydi.
**PERMISSIONS:** —  **NOTIFICATIONS:** Chegara tugaganda xabar yo'q.
**AUTOMATION:** —  **REPORTING:** "O'rtacha ball" cheksiz urinishlar ustidan
hisoblanadi va ma'nosini yo'qotadi.
**MOBILE / MULTILINGUAL:** Ta'sirsiz.
**SECURITY:** Rate limit bor, lekin u soatiga necha marta emas, umuman necha
marta degan savolga javob bermaydi.
**EDGE CASES:** Bir vaqtda ikkita tab'dan yuborilgan submit — hozir ikkala
attempt ham yoziladi; chegara qo'yilganda **atomik** tekshirish kerak.
**WHAT WE DO BETTER:** Assessment tomonida sessiya modeli bor — chegarani
o'sha yerga bog'lash oson.
**WHAT iSPRING DOES BETTER:** Chegara + ball siyosati + qo'shimcha urinish berish.
**GAP:** `maxAttempts`, `scorePolicy`, `attemptNo`, qo'shimcha urinish berish.
**REQUIRED CHANGE:** `quizzes.maxAttempts` va `scorePolicy` maydonlari;
`submit()` boshida `countByUserAndQuiz` bilan atomik guard →
`409 ATTEMPTS_EXHAUSTED`; hisobotda `scorePolicy` bo'yicha bitta ball.
**ACCEPTANCE CRITERIA:** AT-05, AT-06.
**COMPLEXITY:** S  **DEPENDENCIES:** F-03 (Question modeli) bilan birga
qilingani ma'qul, lekin mustaqil ham qilinadi.

---

## F-03 · QUESTION MODEL

**DOMAIN:** Question Banks
**FEATURE:** Savol turi, qayta ishlatish, tasodifiy tanlash

**iSPRING:** 14+ savol turi; savollar bankda yashaydi va ko'p testda
ishlatiladi; teg va qiyinlik bo'yicha pool'dan tasodifiy tanlash; savol og'irligi;
qisman ball; savol va variantlarni aralashtirish; izoh va per-variant feedback.

**OUR SYSTEM:** Bitta to'g'ri javobli MCQ, test hujjati ichiga **embed**
qilingan. `quiz.model.js:3-21` va `assessment.model.js:6-24` da **bir xil**
`optionSchema`/`questionSchema` ikki marta yozilgan. `quiz.service.js:56-60`
bir nechta to'g'ri javobni **ataylab rad etadi**:
```js
if (correctCount !== 1) throw ApiError.badRequest(`"${question.text}" savolida faqat bitta to'g'ri javob bo'lishi kerak`)
```

**STATUS:** REFACTOR · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Muallif savolni ikkinchi testda qayta ishlatolmaydi —
qayta yozadi. Hamma bir xil savollarni ko'radi.
**BUSINESS LOGIC:** Baholash `options.findIndex(o => o.isCorrect)` ga
qurilgan (`quiz.service.js:105-108`) — boshqa turlar shu mantiqqa sig'maydi.
**DATABASE:** `Question`, `QuestionBank` kolleksiyalari yo'q; savollar
`quizzes.questions[]` va `assessments.questions[]` ichida dublikat sxema bilan.
**BACKEND:** Baholash ikki joyda (`quiz.service.js`, `assessment.service.js` +
`employeeInsights.gradeAnswers`) — **uch marta** takrorlangan.
**API:** `PUT /videos/:id/quiz` savollarni butun massiv sifatida qabul qiladi.
**FRONTEND:** `VideoQuizEditor.vue`, `AssessmentEditor.vue` — ikki alohida editor.
**PERMISSIONS:** `video:manage` / `course:create` — yetarli.
**NOTIFICATIONS / AUTOMATION:** —
**REPORTING:** Savol-ba-savol qiyinlik statistikasi hisoblab bo'lmaydi (savolning
barqaror identifikatori test hujjati ichida, testlar orasida umumiy emas).
**MOBILE:** Yangi turlar (drag-drop, hotspot) mobil UI talab qiladi.
**MULTILINGUAL:** Savol matni bir tilli.
**SECURITY:** ✅ To'g'ri qilingan: `isCorrect` faqat `canManage` bo'lganda
qaytariladi (`quiz.service.js:22-36`) — javob kaliti o'quvchiga ketmaydi.
**EDGE CASES:** Savol o'chirilsa eski attempt'lardagi `questionId` osilib qoladi
— `gradeAnswers` uni `''` bilan ko'rsatadi, ya'ni tarix buziladi.
**WHAT WE DO BETTER:** Javob kalitini yashirish qat'iy; assessment savollari
sessiya boshlanmaguncha umuman berilmaydi.
**WHAT iSPRING DOES BETTER:** Deyarli hamma narsa — turlar, bank, pool,
aralashtirish, og'irlik, qisman ball, feedback.
**GAP:** Yagona `Question` + `QuestionBank` + `questionGrading` moduli.
**REQUIRED CHANGE:** §6 (DB) dagi `questions` sxemasi; `Quiz`/`Assessment`
→ yagona `quizzes` kolleksiyasi; migratsiya M1; API eski formatni 1 reliz
qabul qilib konvertatsiya qiladi.
**ACCEPTANCE CRITERIA:** AT-07, AT-08, AT-09.
**COMPLEXITY:** L  **DEPENDENCIES:** — (mustaqil boshlanadi)

---

## F-04 · CERTIFICATE

**DOMAIN:** Certificates
**FEATURE:** Sertifikat berish va tekshirish

**iSPRING:** Vizual shablon editori; kurs/path tugaganda avtomatik berish;
noyob raqam; QR bilan ochiq tekshiruv sahifasi; amal muddati; yangilash;
tashqi sertifikatlarni yuklash.

**OUR SYSTEM:** **Yo'q.** `grep -ri certificate backend/src front/src packages`
→ 0 natija.

**STATUS:** ADD · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Xodim o'qishni tugatadi va qo'lida hech narsa qolmaydi.
**BUSINESS LOGIC:** Compliance audit uchun "kim, qachon, nimani tugatdi"
degan rasmiy hujjat yo'q.
**DATABASE:** `certificateTemplates`, `certificates`, `externalCertificates` kerak.
**BACKEND:** `pdfkit` **allaqachon dependency** (`backend/package.json`), va
DejaVu shriftlari `src/assets/fonts/` da turibdi (hisobot PDF eksporti uchun
qo'yilgan) — ya'ni PDF render qismi noldan emas.
**API:** §9 dagi 9 endpoint + `GET /public/certificates/:serial`.
**FRONTEND:** `CertificatesView` (xodim), `CertificateTemplatesView` + editor (admin).
**PERMISSIONS:** `certificate:template:manage`, `:issue`, `:revoke`,
`:read:own`, `:read:all`.
**NOTIFICATIONS:** `CERTIFICATE_ISSUED`, `_EXPIRING`, `_EXPIRED`, `_REVOKED`.
**AUTOMATION:** F-01 (tugatish) hook'idan `certificateQueue`.
**REPORTING:** "Certificate register" — audit-ready hisobot.
**MOBILE:** PDF ko'rish + Web Share.
**MULTILINGUAL:** Shablon `{lang}` bo'yicha; ism va kurs nomi qanday yozilgan
bo'lsa shunday.
**SECURITY:** ⚠️ **Ochiq tekshiruv sahifasi PII chiqarmasligi shart** —
faqat ism, kurs, sana, holat. JSHSHIR hech qachon. Rate limit majburiy
(serial'ni brute-force qilishga qarshi ULID ishlatiladi).
**EDGE CASES:** (a) bir tugatishga ikki sertifikat — `{userId, sourceType,
sourceId}` unique partial indeks (`revokedAt: null`) bilan oldi olinadi;
(b) kurs o'zgargandan keyin eski sertifikat — `Certificate` snapshot
saqlaydi (`sourceTitle`, `scorePercent`), kursga havola qilmaydi;
(c) xodim ishdan ketgan — sertifikat qoladi, tekshiruv sahifasi ishlaydi.
**WHAT WE DO BETTER:** — (hozircha hech nima)
**WHAT iSPRING DOES BETTER:** Hammasi.
**GAP:** Butun domen.
**REQUIRED CHANGE:** §6 va §9.
**ACCEPTANCE CRITERIA:** AT-10…AT-13.
**COMPLEXITY:** L  **DEPENDENCIES:** F-01 (tugatish qoidasi) → F-04.

---

## F-05 · NOTIFICATION DELIVERY

**DOMAIN:** Notifications / Email / Push
**FEATURE:** Bildirishnomani foydalanuvchiga yetkazish

**iSPRING:** 40+ trigger; e-mail, mobil push, in-app; shablon tahrirlanadi;
foydalanuvchi kanalni tanlaydi; digest; bounce boshqaruvi.

**OUR SYSTEM:** Faqat **in-app + Socket.io**.
`notification.service.js:22-48` — `notify()` DB'ga yozadi va
`emitNotification()` bilan socket'ga uzatadi. Xolos. 9 trigger turi.
`nodemailer`/`smtp`/`sendMail` kod bazasida **umuman yo'q**.

**STATUS:** REFACTOR + ADD · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Ilovaga kirmagan xodim deadline'ni bilmaydi. Parolni
tiklash amalda ishlamaydi — `auth.service.js:212` izohi buni tan oladi:
*"No email/SMS provider is wired up yet — logged so the flow is usable"*.
**BUSINESS LOGIC:** Compliance eslatmalari yetib bormaydi → majburiy o'qish
majburiy bo'lmay qoladi.
**DATABASE:** `notificationTemplates`, `mailLogs`, `pushSubscriptions`,
`users.notificationPrefs`, `users.locale` kerak.
**BACKEND:** `deliveryQueue` (BullMQ — naqsh mavjud), `mail.service`,
`push.service`, `telegram.service`.
**API:** `GET|PUT /users/me/notification-prefs`, `POST /push/subscribe`.
**FRONTEND:** `SettingsView` ga bildirishnoma tab'i; service worker.
**PERMISSIONS:** Shablon tahriri `settings:manage`.
**NOTIFICATIONS:** Bu **o'zi** shu domen.
**AUTOMATION:** Retry 5×, exponential backoff.
**REPORTING:** Yetkazish jurnali (`deliveryLogs`).
**MOBILE:** Push shu ishning yarmi.
**MULTILINGUAL:** ⚠️ Hozirgi matnlar **kodda inglizcha hardcoded**:
`reminderJob.js:22` `title: \`Deadline approaching: ${course?.title}\`` —
uch tilli UI'ga ega tizimda bu jiddiy nomuvofiqlik.
**SECURITY:** E-mail'da to'liq havola bilan token yuboriladi — TTL 1 soat,
bir martalik, `passwordResetTokenHash` allaqachon `user.model.js` da bor.
**EDGE CASES:** (a) e-mail maydoni ixtiyoriy — e-mailsiz xodimga Telegram yoki
faqat in-app; (b) `mandatory: true` turlarni o'chirib bo'lmaydi
(`PASSWORD_RESET`, `CERTIFICATE_EXPIRED`, `COMPLIANCE_RETRAINING_DUE`);
(c) bounce → `user.emailBounced` bayrog'i, keyingi urinishlar to'xtaydi.
**WHAT WE DO BETTER:** Realtime socket push — iSpring'da in-app bildirishnoma
sahifa yangilanishini kutadi.
**WHAT iSPRING DOES BETTER:** Kanallar, shablonlar, sozlamalar, digest.
**GAP:** Butun yetkazish qatlami.
**REQUIRED CHANGE:** `notify()` imzosi o'zgarmaydi — oxiriga
`deliveryQueue.add()` qo'shiladi; matn `templateKey` + `payload` ga ko'chadi.
**ACCEPTANCE CRITERIA:** AT-14…AT-17.
**COMPLEXITY:** M  **DEPENDENCIES:** — (eng tez qaytim beradigan ish)

---

## F-06 · MANAGER SCOPE

**DOMAIN:** Managers / Permissions
**FEATURE:** Rahbar faqat o'z odamlarini ko'rishi

**iSPRING:** `manager` maydoni orqali haqiqiy ierarxiya; rahbar bevosita va
bilvosita bo'ysunuvchilarini ko'radi; manager dashboard; jamoa hisoboti;
o'qishni tasdiqlash.

**OUR SYSTEM:** **Bo'lim (department) darajasida, beshta domenda ishlaydi**
(§1.3 jadvali), lekin uchta jiddiy chegarasi bor.

**STATUS:** EXTEND + REFACTOR · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Rahbar o'z bo'limidagi **hammani** ko'radi — jumladan
boshqa rahbarlarni va o'ziga bo'ysunmaydiganlarni. "Mening jamoam" degan
tushuncha yo'q.
**BUSINESS LOGIC:** Ierarxiya yo'qligi 360°, development plan va onboarding
(mentor/rahbar biriktirish) uchun to'siq.
**DATABASE:** `users.managerId` yo'q → `$graphLookup` qilib bo'lmaydi.
**BACKEND:** ⚠️ **Uchta teshik:**
1. `reports.routes.js` — scope yo'q, MANAGER butun kompaniyani eksport qiladi (§1.4)
2. `dashboard.routes.js` — scope yo'q (§1.4)
3. Scope `roleName === 'MANAGER'` ga bog'langan — custom rol chetlab o'tadi (§1.5)
**API:** `GET /dashboard/team`, `GET /org/hierarchy` yo'q.
**FRONTEND:** Manager dashboard yo'q; `/bos` faqat SUPERADMIN'ga ochiq
(`router/index.js` `meta:{admin:true}` → `auth.isSuperAdmin`) — ya'ni MANAGER
UI'da hech narsa ko'rmaydi, lekin API'ga kira oladi.
**PERMISSIONS:** Scope ruxsat kaliti emas, rol nomi bilan — **noto'g'ri qatlam**.
**NOTIFICATIONS:** Rahbarga eskalatsiya bor (`attentionReport.service.js:11`
`SUPERVISOR_ROLES`, `proctorSnapshot.service.js:198`) — lekin u ham bo'lim
bo'yicha, ierarxiya bo'yicha emas.
**AUTOMATION:** — **REPORTING:** Yuqoridagi teshik.
**MOBILE / MULTILINGUAL:** Ta'sirsiz.
**SECURITY:** §1.4 va §1.5 — ikkalasi ham CRITICAL.
**EDGE CASES:** (a) bo'limi bo'sh rahbar — `task.service.js:63-71` buni
`403` bilan to'g'ri hal qiladi; (b) xodim boshqa bo'limga o'tsa eski
rahbar hisobotdan yo'qoladi — kerakli xatti-harakat; (c) rahbarning
o'zi hisobotda chiqadimi — hozir ha.
**WHAT WE DO BETTER:** Scope tekshiruvlari **service ichida**, controller'da
emas — ya'ni har bir kirish nuqtasi bir xil qoidadan o'tadi.
**WHAT iSPRING DOES BETTER:** Haqiqiy ierarxiya va manager dashboard.
**GAP:** `managerId` + `$graphLookup` + scope'ni ruxsatga ko'chirish +
hisobot/dashboard'ga yoyish.
**REQUIRED CHANGE:** `users.managerId`; `services/org/orgHierarchy.service.js`;
`middlewares/scopeToManagedUsers.middleware.js` (Redis 5 daq kesh);
`reportDataService.build(actor, ...)` imzosini o'zgartirish;
`user:read:department` / `user:read:all` ruxsat kalitlari.
**ACCEPTANCE CRITERIA:** AT-18…AT-21.
**COMPLEXITY:** M  **DEPENDENCIES:** F-06 → 360°, development plan,
onboarding, manager dashboard — hammasi shundan keyin.

---

## F-07 · LEARNING PATH

**DOMAIN:** Learning Paths
**FEATURE:** Ko'p kursli dastur

**iSPRING:** Bo'limlarga bo'lingan path; majburiy/ixtiyoriy element; ketma-ketlik;
muddat; avtomatik biriktirish; tugatishda sertifikat.
**OUR SYSTEM:** **Yo'q.** `grep -ri "learningPath\|learning path"` → 0.
**STATUS:** ADD · **PRIORITY:** CRITICAL

**USER EXPERIENCE:** Onboarding "5 ta kursni shu tartibda o'ting" deb aytolmaydi.
**BUSINESS LOGIC:** —
**DATABASE:** `learningPaths`, `pathEnrollments`.
**BACKEND:** ✅ Ikkita mavjud narsa **to'g'ridan-to'g'ri qayta ishlatiladi**:
`courseSequence.js` (lock hisoblash naqshi) va `courseVisibility.js`
(rol AND filial AND bo'lim targeting) — noldan yozilmaydi.
**API:** 10 endpoint (§9). **FRONTEND:** 2 xodim + 2 admin sahifa.
**PERMISSIONS:** `path:create/read/update/delete/assign`.
**NOTIFICATIONS:** `PATH_ASSIGNED`, `PATH_DEADLINE_APPROACHING`, `PATH_COMPLETED`.
**AUTOMATION:** `enrollmentRule` va `reminderJob` ga ulanadi.
**REPORTING:** "Learning path progress" hisoboti.
**MOBILE:** Progress ko'rsatkichi. **MULTILINGUAL:** Path nomi bir tilli.
**SECURITY:** Lock **server tomonda** — `courseSequence` naqshi majburiy
(kirish nuqtasida, UI'da emas).
**EDGE CASES:** (a) path ichidagi kurs o'chirilsa — element `orphan` bo'ladi,
progress qayta hisoblanadi (`courseAssignment.service.js:158-166` da
trashed kursni filtrlash naqshi bor); (b) xodim kursni path'dan tashqarida
tugatgan bo'lsa — path uni tugallangan deb hisoblashi kerak.
**WHAT WE DO BETTER:** — **WHAT iSPRING DOES BETTER:** Butun domen.
**GAP:** Butun domen. **COMPLEXITY:** L
**DEPENDENCIES:** F-01 (tugatish) → F-07 → onboarding, sertifikatsiya.

---

## F-08 · REPORT SCOPE

**DOMAIN:** Reporting / Security
**FEATURE:** Hisobotda kim nimani ko'rishi

**iSPRING:** Har bir hisobot chaqiruvchining scope'i bilan avtomatik
chegaralanadi (tashkilot → bo'lim → jamoa).
**OUR SYSTEM:** ❌ **Chegaralanmaydi.** §1.4 ga qarang.
**STATUS:** REFACTOR · **PRIORITY:** CRITICAL

**BACKEND:** `reportDataService.build(type, filters, lang)` — `actor` yo'q.
**API:** `GET /reports/:type/export` `report:export` bilan; MANAGER'da u bor.
**SECURITY:** MANAGER butun kompaniyaning F.I.O + **JSHSHIR** + bo'lim +
progressini XLSX qilib yuklab oladi. Bu `GET /users` dagi qat'iy bo'lim
chegarasi bilan to'g'ridan-to'g'ri zid.
**EDGE CASES:** Eksport hozir audit'ga **yozilmaydi** ham — ya'ni bu sodir
bo'lganini keyin aniqlab bo'lmaydi.
**REQUIRED CHANGE:** `build(actor, type, filters, lang)`; har bir builder
boshida `scopeUserIds(actor)` bilan `intersectIds` (funksiya
`reportData.service.js:33-45` da **allaqachon bor**); eksportni
`REPORT_EXPORTED` sifatida audit qilish.
**ACCEPTANCE CRITERIA:** AT-19, AT-22.
**COMPLEXITY:** S  **DEPENDENCIES:** F-06.

---

## F-09 · PII IN LEADERBOARD

**DOMAIN:** Security / Gamification
**FEATURE:** Leaderboard qatoridagi ma'lumot

**iSPRING:** Leaderboard ism va avatar ko'rsatadi; hujjat raqami hech qachon.
**OUR SYSTEM:** ❌ `points.service.js:104` har qatorda `jshshir` qaytaradi,
endpoint esa ruxsatsiz (`gamification.routes.js` faqat `authenticate`).
**STATUS:** REFACTOR · **PRIORITY:** CRITICAL
**SECURITY:** Har bir xodim hamma hamkasbining 14 xonali JSHSHIR raqamini
oladi. Frontend ko'rsatmasligi nazorat emas.
**REQUIRED CHANGE:** `jshshir` ni DTO'dan olib tashlash; faqat
`ANALYTICS_VIEW_ALL` bo'lganda qo'shish (`quiz.service.js:22-36` dagi
`includeAnswers` naqshi bilan bir xil).
**ACCEPTANCE CRITERIA:** AT-23.
**COMPLEXITY:** S  **DEPENDENCIES:** —

---

## F-10 · GLOBAL SEARCH

**DOMAIN:** Search
**iSPRING:** Bitta qidiruv maydoni kurs, dars, KB, foydalanuvchi bo'ylab;
facet filtr; autocomplete.
**OUR SYSTEM:** Har entity o'z ichida `RegExp` bilan:
`course.repository.js:91` `filter.title = new RegExp(search.trim(), 'i')` —
**escape qilinmagan** (`user.repository.js:101` esa `replace(/[.*+?^${}()|[\]\\]/g,'\\$&')` bilan escape qiladi).
**STATUS:** ADD (global) + REFACTOR (kurs qidiruvi) · **PRIORITY:** CRITICAL
**SECURITY:** Escape qilinmagan regex → ReDoS: `(a+)+$` kabi so'rov CPU'ni band qiladi.
**BACKEND:** `$text` indeks yo'q — har qidiruv to'liq skan.
**EDGE CASES:** Natija **kirish huquqi bo'yicha filtrlanishi shart** — aks holda
qidiruv yopiq kurslarning nomini oshkor qiladi.
**REQUIRED CHANGE:** `courses`, `users`, `kbArticles` uchun `$text`
(`default_language:'none'` — o'zbek stemmer'i yo'q); `search.service.js`
fan-out + `courseVisibility` bilan filtrlash; `⌘K` palitra.
**ACCEPTANCE CRITERIA:** AT-24, AT-25.  **COMPLEXITY:** M  **DEPENDENCIES:** —

---

## F-11 · AUDIT LOG VISIBILITY

**DOMAIN:** Security / Administration
**iSPRING:** Filtrlanadigan audit jurnali + eksport.
**OUR SYSTEM:** Yozuv **juda yaxshi** — 60+ action turi, `actor/action/entity/
entityId/metadata/ip/userAgent/timestamp`, ikkita indeks. Lekin
`routes/v1/index.js` da **audit router yo'q**, admin nav'da sahifa yo'q,
`audit:read` ruxsati hech qayerda ishlatilmaydi.
**STATUS:** ADD (ko'rish) · **PRIORITY:** CRITICAL
**GAP:** Ma'lumot bor, unga yetish yo'li yo'q → audit paytida foydasiz.
**REQUIRED CHANGE:** `GET /audit-logs` (filtr + kursor) + `AuditLogView` +
eksport; eksportning o'zini audit qilish.
**EDGE CASES:** `metadata` `Mixed` — UI uni JSON sifatida ko'rsatishi va
katta obyektni qisqartirishi kerak.
**COMPLEXITY:** M  **DEPENDENCIES:** —

---

## F-12 · BULK USER IMPORT

**DOMAIN:** User Management
**iSPRING:** XLSX/CSV import, ustun mapping, dry-run, xato hisoboti, yangilash rejimi.
**OUR SYSTEM:** Yo'q. Bulk amallar bor, lekin ular **mavjud** foydalanuvchilar
ustidan (`bulk/message`, `bulk/deactivate`) — yaratish yo'q.
**STATUS:** ADD · **PRIORITY:** CRITICAL
**BACKEND:** ✅ `exceljs` **allaqachon** backend dependency; `partitionBulkTargets`
(`user.service.js:99-152`) — satr-ba-satr sabab qaytarish naqshi tayyor.
**EDGE CASES:** (a) takroriy JSHSHIR — `duplicateIdentityError` maydonni
nomlab beradi, import hisobotida shu ishlatiladi; (b) mavjud xodim —
yangilash yoki o'tkazib yuborish tanlanadi; (c) parollar — generatsiya
qilinadi va **faqat import hisobotida bir marta** ko'rsatiladi.
**COMPLEXITY:** M  **DEPENDENCIES:** F-05 (yangi xodimga hisob ma'lumotini
yuborish uchun e-mail kerak).

---

## F-13…F-24 · qisqartirilgan chuqur tahlil

> Quyidagilar uchun to'liq 25 maydonli tahlil `docs/v2` dagi tegishli
> bo'limlarda va §5–§9 matritsalarida berilgan; bu yerda faqat **v2 dan
> keyin o'zgargan** yoki **yangi dalil topilgan** jihatlar.

| # | Feature | v3 dagi yangilik |
|---|---|---|
| F-13 | **Material download** | Faqat audio + yuklab olish + katta fayl buzilgan; hujjat ko'rish ishlaydi (§1.1). `allowDownload=false` rejimi uchun **`openStream` allaqachon tayyor** → EXTEND, ADD emas |
| F-14 | **Settings modeli** | `attentionPolicy`/`facePolicy` da GLOBAL→COURSE meros naqshi mavjud (§1.8) → umumlashtirish, noldan qurish emas |
| F-15 | **Onboarding** | `Task` fan-out (`audienceType: USER/POSITION/ALL`, `batchId`) va `user.hireDate` mavjud → qadam biriktirish infratuzilmasi bor |
| F-16 | **Live training** | `Event` modeli bor, lekin `event.service.js` da **bironta `notify()` chaqiruvi yo'q**; `GET/PATCH/DELETE /events/:id` API bor, **UI yo'q** (§1.14) |
| F-17 | **Knowledge base** | `NewsView` (scroll milestone, `timeSpentSeconds`, `maxScrollDepth`) → KB analitikasi noldan emas; `courseVisibility` → ko'rinish nazorati noldan emas |
| F-18 | **Badge dvigateli** | `badgeDefinitions.js` — 5 ta hardcoded, `computeEarnedBadges` o'qishda hisoblaydi, **hech qanday bildirishnoma yo'q**, `UserBadge` yozuvi yo'q → "qachon oldi" savoliga javob yo'q |
| F-19 | **SCORM** | Yo'q. Lekin `helmet()` default CSP `frame-src` ni cheklaydi → SCORM iframe uchun CSP sozlash **alohida ish** |
| F-20 | **PWA / offline** | `manifest`/`serviceWorker`/`workbox` — 0 natija. `videoProgress` merge algoritmi oflayn segmentlarni **tabiiy ravishda** qabul qiladi → sinxronizatsiya konflikti yo'q |
| F-21 | **Rol tahriri** | `PATCH /roles/:id` **na backend, na frontendda** bor → mavjud rolning ruxsatini o'zgartirib bo'lmaydi (§1.14) |
| F-22 | **Kontent tasdiqlash** | iSpring'da muallif→tekshiruvchi zanjiri bor; bizda `DRAFT`→`PUBLISHED` bitta odam qo'lida. Compliance uchun `content:review` kerak |
| F-23 | **Self-enroll tasdiqlash** | `courseAssignment.service.js:88-124` — self-enroll darhol amalga oshadi, tasdiqlash yo'q. iSpring'da rahbar tasdig'i sozlanadi |
| F-24 | **Orphan media** | `course.service.js:378-381` izohida ochiq tan olingan qarz (§1.13) → `mediaCleanupQueue` |

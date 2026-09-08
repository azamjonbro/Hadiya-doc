# 20. ACCEPTANCE TESTS

> Har bir CRITICAL va HIGH feature uchun bajariladigan test. Format:
> **BERILGAN** (boshlang'ich holat) → **HARAKAT** → **KUTILGAN** (HTTP, DB,
> audit, bildirishnoma, hisobot ta'siri). Bular `backend/test/` ga
> `security.test.js` naqshida yoziladi.

---

## Kurs tugatish (F-01)

**AT-01 · Videosiz kurs tugallanadi**
BERILGAN: kursda 1 published taqdimot (10 sahifa) va 1 published assessment, video yo'q. Xodim biriktirilgan.
HARAKAT: xodim 10 sahifani ko'radi va assessmentdan o'tadi.
KUTILGAN: `GET /courses/:id/progress` → `completionPercent: 100`; `CourseAssignment.status === 'COMPLETED'`; `COURSE_COMPLETED` bildirishnomasi yuboriladi; `employee-progress` hisobotida `completedCourses` 1 ga oshadi.
*(Hozir: assignment abadiy `ACTIVE` qoladi — `videoEventProcessor.js:245` `publishedVideoIds.length > 0` sharti.)*

**AT-02 · Majburiy test yiqilsa kurs tugallanmaydi**
BERILGAN: kursda 2 video + 1 majburiy assessment; `completionRule.requireAllRequired = true`.
HARAKAT: xodim ikkala videoni tugatadi, assessmentdan yiqiladi.
KUTILGAN: `CourseAssignment.status === 'ACTIVE'`; `completionPercent < 100`; sertifikat **berilmaydi**.
*(Hozir: videolar tugagach assignment `COMPLETED` bo'ladi.)*

**AT-03 · Progress va status doim mos**
BERILGAN: istalgan kurs va xodim.
HARAKAT: `GET /courses/:id/progress` va `GET /users/:id/courses` ni ketma-ket chaqirish.
KUTILGAN: `completionPercent === 100` ⟺ `status === 'COMPLETED'`. Ikkalasi hech qachon zid bo'lmaydi.

**AT-04 · Kursga yangi majburiy video qo'shilsa**
BERILGAN: xodimda `COMPLETED` assignment.
HARAKAT: admin kursga yangi published `required` video qo'shadi.
KUTILGAN: assignment `ACTIVE` ga qaytadi; xodimga `COURSE_REOPENED` bildirishnomasi; sertifikat berilgan bo'lsa **bekor qilinmaydi** (o'sha paytdagi holatni aks ettiradi), lekin yangi tugatishda yangisi beriladi.

---

## Test urinishlari (F-02)

**AT-05 · Urinish chegarasi majburlanadi**
BERILGAN: `quiz.maxAttempts = 2`; xodimda 2 ta yakunlangan urinish.
HARAKAT: `POST /quizzes/:id/start` (yoki `/submit`).
KUTILGAN: **HTTP 409** `ATTEMPTS_EXHAUSTED`; yangi `QuizAttempt` **yaratilmaydi**; `auditLogs` ga `QUIZ_ATTEMPT_BLOCKED` yoziladi; xodimga `QUIZ_ATTEMPTS_EXHAUSTED` bildirishnomasi; rahbarga xabar; hisobotdagi ball **o'zgarmaydi**.

**AT-06 · Bir vaqtda ikki tab'dan yuborish**
BERILGAN: `maxAttempts = 1`; ikkita brauzer tab'i bir vaqtda `submit` yuboradi.
KUTILGAN: aynan **bitta** `QuizAttempt` yoziladi; ikkinchisi 409 oladi. (Atomik `findOneAndUpdate` yoki unique indeks `{userId, quizId, attemptNo}`.)

---

## Savol modeli (F-03)

**AT-07 · Pool'dan tanlangan savollar reloadda o'zgarmaydi**
BERILGAN: 50 savolli bank; `quiz.pools = [{bankId, count: 10}]`; `shuffleQuestions = true`.
HARAKAT: `POST /quizzes/:id/start` → savollarni yozib olish → sahifani yangilash → yana `start`.
KUTILGAN: **aynan bir xil 10 savol, aynan bir xil tartibda**; `TestSession.questionSet` o'zgarmaydi; yangi sessiya yaratilmaydi.

**AT-08 · Ko'p javobli savolda qisman ball**
BERILGAN: `MULTI_CHOICE`, 4 variant, 2 tasi to'g'ri, `points = 10`, `partialCredit = true`.
HARAKAT: xodim 1 to'g'ri + 1 noto'g'ri belgilaydi.
KUTILGAN: `awarded = max(0, 1 − 1) / 2 × 10 = 0`; 2 to'g'ri + 0 noto'g'ri bo'lsa `awarded = 10`; 1 to'g'ri + 0 noto'g'ri bo'lsa `awarded = 5`.

**AT-09 · Migratsiyadan keyin eski test ishlaydi**
BERILGAN: M1 migratsiyasidan oldin yozilgan `Quiz` va 20 ta `QuizAttempt`.
HARAKAT: M1 ni bajarish → `GET /videos/:id/quiz` → `GET /videos/:id/quiz/attempts/:userId`.
KUTILGAN: savollar bir xil matn va tartibda qaytadi; eski attemptlarning ball va javob tafsiloti **o'zgarmagan** holda ko'rinadi; `_legacy` kolleksiyalar saqlanadi.

---

## Sertifikat (F-04)

**AT-10 · Avtomatik berish**
BERILGAN: kursda `certificateTemplateId` o'rnatilgan.
HARAKAT: xodim kursni `completionRule` bo'yicha tugatadi.
KUTILGAN: **60 soniya ichida** `Certificate` yozuvi paydo bo'ladi; `pdfKey` to'ldiriladi; PDF'da to'g'ri ism, kurs nomi, sana, serial va QR; `CERTIFICATE_ISSUED` bildirishnomasi (in-app + e-mail); `auditLogs` da `CERTIFICATE_ISSUED`.

**AT-11 · Idempotentlik**
HARAKAT: tugatish hodisasini ikki marta ishga tushirish (masalan job qayta urinadi).
KUTILGAN: aynan **bitta** `Certificate`; ikkinchi urinish jimgina to'xtaydi (unique partial indeks `{userId, sourceType, sourceId}` `revokedAt: null` bilan).

**AT-12 · Ochiq tekshiruv sahifasi PII chiqarmaydi**
HARAKAT: `GET /public/certificates/:serial` (autentifikatsiyasiz).
KUTILGAN: HTTP 200; javobda **ism, kurs nomi, berilgan sana, holat** bor; **`jshshir`, `passportSeries`, `email`, `phone`, `userId` yo'q**; noto'g'ri serial → 404 (mavjudligini oshkor qilmaydi); 10 so'rov/daqiqadan keyin 429.

**AT-13 · Bekor qilingan sertifikat**
BERILGAN: `revokedAt` o'rnatilgan sertifikat.
HARAKAT: `GET /public/certificates/:serial`.
KUTILGAN: HTTP 200, `status: 'REVOKED'` va bekor qilingan sana; PDF havolasi **berilmaydi**.

---

## Bildirishnoma yetkazish (F-05)

**AT-14 · Parolni tiklash amalda ishlaydi**
HARAKAT: `POST /auth/password-reset/request {jshshir}`.
KUTILGAN: HTTP 200 (foydalanuvchi mavjudligidan qat'i nazar — enumeration yo'q); e-mail **haqiqatan yuboriladi**; xat foydalanuvchining `locale` tilida; havola 1 soat amal qiladi; ikkinchi marta ishlatilsa 400; `mailLogs` da `SENT` yozuvi.

**AT-15 · Foydalanuvchi kanalni o'chiradi**
BERILGAN: `notificationPrefs.COURSE_ASSIGNED.email = false`.
HARAKAT: xodimga kurs biriktiriladi.
KUTILGAN: in-app bildirishnoma **bor**; e-mail **yuborilmaydi**; `deliveryLogs` da `EMAIL` yozuvi yo'q.

**AT-16 · Majburiy turni o'chirib bo'lmaydi**
HARAKAT: `PUT /users/me/notification-prefs {PASSWORD_RESET: {email: false}}`.
KUTILGAN: HTTP 400 `MANDATORY_NOTIFICATION`; sozlama saqlanmaydi.

**AT-17 · Yetkazish muvaffaqiyatsiz bo'lsa qayta urinadi**
BERILGAN: SMTP server 500 qaytaradi.
HARAKAT: bildirishnoma yuboriladi.
KUTILGAN: BullMQ 5 marta exponential backoff bilan qayta uriniladi; `mailLogs.attempts = 5`, `status = 'FAILED'`, `error` to'ldirilgan; **in-app bildirishnoma baribir yetkazilgan** (e-mail muvaffaqiyatsizligi asosiy oqimni buzmaydi).

---

## Manager scope (F-06, F-08)

**AT-18 · Boshqa bo'lim xodimining progressi**
BERILGAN: MANAGER "Sotuv" bo'limida; maqsad xodim "Marketing" da.
HARAKAT: `GET /users/:targetId/performance`.
KUTILGAN: **HTTP 403** `DEPARTMENT_SCOPE_FORBIDDEN`; ma'lumot qaytmaydi; `auditLogs` da `ACCESS_DENIED` yoziladi.
*(Hozir: 403 to'g'ri qaytadi ✅ — bu test mavjud xatti-harakatni **muhrlaydi**.)*

**AT-19 · Hisobot eksporti scope bilan chegaralanadi**
BERILGAN: MANAGER "Sotuv" bo'limida; kompaniyada 500 xodim, "Sotuv"da 40 ta.
HARAKAT: `GET /reports/employee-progress/export?format=xlsx`.
KUTILGAN: faylda **aynan 40 qator**; boshqa bo'lim xodimlari yo'q; `auditLogs` da `REPORT_EXPORTED` (tur, filtr, qatorlar soni bilan).
*(Hozir: 500 qator qaytadi — §1.4 CRITICAL.)*

**AT-20 · Dashboard scope bilan chegaralanadi**
HARAKAT: MANAGER `GET /dashboard`.
KUTILGAN: `cards.totalEmployees` faqat o'z bo'limi; `charts.employeeProgress` faqat o'z odamlari.

**AT-21 · Custom rol ham scope'lanadi**
BERILGAN: `POST /roles {name: 'SUPERVISOR', permissions: ['user:read']}` bilan yaratilgan rol; unga `scope: 'DEPARTMENT'`.
HARAKAT: shu roldagi foydalanuvchi `GET /users`.
KUTILGAN: faqat o'z bo'limi qaytadi.
*(Hozir: butun kompaniya qaytadi — §1.5 CRITICAL, chunki scope `roleName === 'MANAGER'` ga bog'langan.)*

**AT-22 · Eksport chegarasi jimgina kesmaydi**
BERILGAN: 8 000 xodim.
HARAKAT: `GET /reports/employee-progress/export`.
KUTILGAN: yo to'liq 8 000 qator (async job orqali), yo javobda `truncated: true, totalRows: 8000, exportedRows: 5000` va foydalanuvchiga ogohlantirish.

---

## PII va qidiruv (F-09, F-10)

**AT-23 · Leaderboard JSHSHIR chiqarmaydi**
HARAKAT: EMPLOYEE roli bilan `GET /gamification/leaderboard`.
KUTILGAN: har qatorda `fullName`, `avatar`, `department`, `totalPoints` bor; **`jshshir` yo'q**. `ANALYTICS_VIEW_ALL` bilan chaqirilganda `jshshir` bo'lishi mumkin.
*(Hozir: har doim qaytadi — §1.6 CRITICAL.)*

**AT-24 · Qidiruv kirish huquqini hurmat qiladi**
BERILGAN: "Maxfiy strategiya" nomli kurs faqat "Rahbariyat" bo'limiga ko'rinadi.
HARAKAT: oddiy xodim `GET /search?q=maxfiy`.
KUTILGAN: natijalar orasida u kurs **yo'q** — hatto nomi ham ko'rinmaydi.

**AT-25 · ReDoS himoyasi**
HARAKAT: `GET /courses?search=(a%2B)%2B%24` (ya'ni `(a+)+$`).
KUTILGAN: javob 200 ms ichida qaytadi; CPU o'sib ketmaydi; natija bo'sh yoki literal moslik.
*(Hozir: `course.repository.js:91` escape qilmaydi.)*

---

## Learning path (F-07)

**AT-26 · Ketma-ket path server tomonda bloklanadi**
BERILGAN: 4 kursli `sequential: true` path; xodim 1-kursni tugatmagan.
HARAKAT: 2-kursning video token'ini to'g'ridan-to'g'ri so'rash: `POST /video-access/:videoId/token`.
KUTILGAN: **HTTP 403** `PREVIOUS_PATH_ITEM_INCOMPLETE`; token berilmaydi. (UI'ni chetlab o'tish ishlamaydi.)

**AT-27 · Ixtiyoriy element progressni o'zgartirmaydi**
BERILGAN: path'da 3 majburiy + 2 ixtiyoriy kurs.
HARAKAT: xodim 3 majburiyni tugatadi, ixtiyoriylarni tegmaydi.
KUTILGAN: `completionPercent === 100`; `PathEnrollment.status === 'COMPLETED'`; path sertifikati beriladi.

---

## Import, audit, tadbir

**AT-28 · XLSX import dry-run**
BERILGAN: 300 satrli fayl, shundan 3 tasi takroriy JSHSHIR, 2 tasi noto'g'ri bo'lim.
HARAKAT: `POST /users/import/dry-run`.
KUTILGAN: hech qanday `User` yaratilmaydi; javobda `willCreate: 295, willUpdate: 0, errors: [{row, field, code}]` — xato satrlari **satr raqami bilan**; xato hisoboti XLSX sifatida yuklab olinadi.

**AT-29 · Import commit**
HARAKAT: dry-run natijasini tasdiqlab `POST /users/import/commit`.
KUTILGAN: 295 foydalanuvchi yaratiladi; generatsiya qilingan parollar **faqat javobda bir marta**; `auditLogs` da bitta `USERS_IMPORTED` (soni bilan) + har foydalanuvchi uchun `USER_CREATED`; har biriga `ACCOUNT_CREATED` e-maili.

**AT-30 · Audit log ko'rinadi va eksport auditlanadi**
HARAKAT: `GET /audit-logs?action=COURSE_DELETED&from=...` → keyin `GET /audit-logs/export?format=csv`.
KUTILGAN: filtr ishlaydi, kursor bilan sahifalanadi; eksportdan keyin jurnalda **yangi `AUDIT_EXPORTED` yozuvi** paydo bo'ladi.

**AT-31 · Tadbir waitlist**
BERILGAN: `capacity = 10`; 10 kishi ro'yxatdan o'tgan.
HARAKAT: 11-kishi `POST /events/:id/register`.
KUTILGAN: HTTP 200, `status: 'WAITLIST'`, `waitlistPosition: 1`. Keyin ro'yxatdagi biri bekor qilsa → 11-kishi avtomatik `REGISTERED` bo'ladi va `EVENT_WAITLIST_PROMOTED` bildirishnomasi oladi.

**AT-32 · Tadbir vaqti o'zgarsa hamma xabar oladi**
HARAKAT: `PATCH /events/:id {startAt: yangi}`.
KUTILGAN: barcha `REGISTERED` va `WAITLIST` ishtirokchilar 1 daqiqa ichida `EVENT_RESCHEDULED` oladi (in-app + e-mail + push, `mandatory`).

---

## Material, compliance, oflayn

**AT-33 · Yuklab olish taqiqlangan material**
BERILGAN: `material.allowDownload = false`.
HARAKAT: `GET /materials/:id/download-url?disposition=attachment`.
KUTILGAN: **HTTP 403** `DOWNLOAD_NOT_ALLOWED`; `GET /materials/:id/content` esa ishlaydi (ko'rish mumkin, saqlash mumkin emas).

**AT-34 · Takroriy o'qitish avtomatik**
BERILGAN: `RecurringAssignment {intervalMonths: 12, dueDays: 30}`; xodim 12 oy oldin tugatgan.
HARAKAT: `complianceQueue` kunlik ishlaydi.
KUTILGAN: yangi `CourseAssignment` (deadline = bugun + 30 kun); `COMPLIANCE_RETRAINING_DUE` bildirishnomasi; `nextRunAt` +12 oyga suriladi; compliance matritsasida holat `DUE` ga o'zgaradi.

**AT-35 · Oflayn progress dublikat qilmaydi**
BERILGAN: xodim internetsiz 5 daqiqa video ko'radi; navbatda 12 hodisa.
HARAKAT: internet qaytadi, sinxronizatsiya ikki marta ishga tushadi (masalan tab ikki marta ochilgan).
KUTILGAN: `videoProgress.uniqueWatchedSeconds` aynan 300 s ga oshadi, 600 s ga emas; `clientEventId` unique indeksi ikkinchi partiyani rad etadi; `videoAnalyticsEvents` da 12 yozuv, 24 emas.

**AT-36 · Face gate uch harakatda ham ishlaydi**
BERILGAN: `FACE_VERIFICATION_REQUIRED = true`, xodim bugun tekshirilmagan.
HARAKAT: (a) video token so'rash, (b) `GET /materials/:id/content`, (c) `POST /assessments/:id/start`.
KUTILGAN: uchalasi ham **403** `FACE_VERIFICATION_REQUIRED`, `details.action` mos ravishda `video` / `material` / `assessment`.
*(Hozir: bu xatti-harakat ishlaydi — test uni muhrlaydi.)*

---

## Regressiya testlari (mavjud kuchli tomonlarni himoya qiladi)

> Bular yangi feature emas — ular **bizning ustunligimizni buzilishdan
> saqlaydi**. Har bir refactor'dan keyin ishlashi shart.

| # | Test | Nimani himoya qiladi |
|---|---|---|
| **AT-R1** | Videoni oxiriga sudrash `completionPercent` ni oshirmaydi | `watchedSegments` merge |
| **AT-R2** | `requireRewatch = true` bo'lganda diqqatsizlik oralig'i progressdan ayiriladi | `subtractSegments` |
| **AT-R3** | Assessment sahifasini yangilash yangi 15 daqiqa bermaydi | `expiresAt` bir marta stamplanadi |
| **AT-R4** | Assessmentni tashlab ketish nol ballli attempt yozadi | `closeExpiredSession` |
| **AT-R5** | Ikkinchi focus-loss sessiyani tugatadi va javoblarni baholaydi | `ASSESSMENT_FOCUS_LOSS_LIMIT` |
| **AT-R6** | Oldingi darsni tugatmasdan keyingisining token'i berilmaydi | `courseSequence.assertVideoUnlocked` |
| **AT-R7** | O'quvchiga `isCorrect` hech qachon yuborilmaydi | `toPublicQuiz({includeAnswers})` |
| **AT-R8** | Assessment savollari `start` dan oldin berilmaydi | `getById` learner shoxi |
| **AT-R9** | Bir video uchun ball ikki marta berilmaydi | `pointsLedger` sparse unique |
| **AT-R10** | Hujjatning 40-sahifasiga sakrash 40% bermaydi | `viewedPages` to'plami |
| **AT-R11** | Face embedding hech qanday javobda ko'rinmaydi | `select: false` |
| **AT-R12** | Trashdagi kursning assignment'i ro'yxatda ko'rinmaydi | `listForUser` filtri |

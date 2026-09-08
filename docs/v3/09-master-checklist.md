# 21. MASTER CHECKLIST — iSpring parity uchun barcha o'zgarishlar

> Ketma-ket bajariladigan ro'yxat. Tartib **bog'liqlik grafi** (§19) bo'yicha,
> "prioritet" bo'yicha emas — ya'ni yuqoridan pastga ishlash mumkin.
> Har bir band: nima qilinadi · qaysi fayllar · qabul mezoni.
> `[P]` = parallel qilinishi mumkin (oldingi bandni kutmaydi).

---

## BLOK 0 — Xavfsizlik va infratuzilma tuzatishlari (1 hafta)

> Yangi feature emas. Beshta CRITICAL xavfsizlik teshigi va uchta
> infratuzilma qarzi. Hammasi bog'liqliksiz — bir kunda ham bo'linadi.

- [x] **0.1** `[P]` **Leaderboard'dan JSHSHIR'ni olib tashlash**
  · `services/gamification/points.service.js:104` — `jshshir` ni `merged` dan
  chiqarish; `ANALYTICS_VIEW_ALL` bo'lganda shartli qo'shish
  (`quiz.service.js:22-36` `includeAnswers` naqshi)
  · Qabul: **AT-23**

- [x] **0.2** `[P]` **Kurs qidiruvidagi ReDoS**
  · `repositories/course.repository.js:91` — `user.repository.js:101` dagi
  escape'ni qo'llash (vaqtinchalik), `$text` gacha
  · `repositories/news.repository.js:42` — xuddi shunday
  · Qabul: **AT-25**

- [x] **0.3** **Hisobot va dashboard scope'i**
  · `services/reports/reportData.service.js` — `build(actor, type, filters, lang)`;
  har builder boshida `scopeUserIds(actor)` → mavjud `intersectIds()` (`:33-45`)
  · `controllers/report.controller.js:20` — `req.user` uzatish
  · `analytics/dashboardAggregation.js` — `scope` parametri
  · `routes/v1/dashboard.routes.js` — `?scope=` validatsiyasi
  · Qabul: **AT-19, AT-20**
  · Bajarildi (`dfd80c6`, `b6e0379`) — bir farq bilan: hisobotlar haqiqatan
  scope'lanadi, dashboard esa hozircha scope'lanmaydi, balki `analytics:view:all`
  bo'lmagan chaqiruvchiga **403** qaytaradi. Bo'limga qisqartirilgan dashboard
  alohida endpoint sifatida **2.5 (Manager dashboard)** da quriladi.

- [x] **0.4** **Eksportni audit qilish**
  · `report.controller.js` — `REPORT_EXPORTED` (tur, filtr, qatorlar soni)
  · Qabul: **AT-30**

- [x] **0.5** `[P]` **Presigned URL host**
  · `config/env.js` — `S3_PUBLIC_ENDPOINT`
  · `storage/S3StorageProvider.js` — `getSignedUrl` shu host ustidan imzolaydi
  · Qabul: audio material prod'da o'ynaydi; yuklab olish ishlaydi
  · Bajarildi (`9e7114a`) — o'zgaruvchi allaqachon `S3_SIGNING_ENDPOINT` deb
  atalgan edi, lekin `backend/.env.example` da yo'q edi va serverda domen
  ko'chgach eski `qollanma.techinfo.uz` bo'lib qolgandi. Endi: hujjatlashtirildi,
  boot noto'g'ri/loopback qiymatni rad etadi va domen mos kelmasa ogohlantiradi,
  `npm --prefix backend run check:signing` esa haqiqiy obyektga imzolangan
  havolani olib tekshiradi (prod'da `lms-materials` → 200).

- [x] **0.6** `[P]` **Backup + tiklash sinovi**
  · `jobs/backupQueue.js` — kunlik `mongodump` → shifrlash → S3 (30 kun)
  · `docs/deployment.md` — tiklash tartibi
  · Qabul: bitta tiklash **haqiqatan sinovdan o'tgan** va hujjatlashtirilgan
  · Bajarildi — `mongodump --archive --gzip` → AES-256-GCM (`backupCrypto.js`)
  → `S3_BUCKET_BACKUPS`, kunlik 03:20 (Asia/Tashkent), 30 kun saqlash.
  Tiklash sinovi hujjatda emas, `test/backup.test.js` da: jonli MongoDB'ga
  seed → dump → shifrlash → saqlash → deshifrlash → **boshqa nomdagi bazaga
  `mongorestore`** → hujjat, sana va unique indeks solishtiriladi (17 test
  o'tdi). `npm run backup:now/list/restore` operator skriptlari qo'shildi;
  `backup:restore` jonli baza nomiga `--force` siz tiklashdan bosh tortadi.
  · Chetlanishlar:
    1. **Standart holatda o'chirilgan** (`BACKUP_ENABLED=false`) — kalitsiz
    ishlaydigan backup har kecha jimgina xato beradi, shuning uchun
    `BACKUP_ENABLED=true` + noto'g'ri kalit = boot rad etiladi, prod'da esa
    o'chiq bo'lsa boot ogohlantirishi chiqadi.
    2. S3 legi lokal sinalmadi (MinIO Docker'siz ko'tarilmaydi) — testda
    `S3StorageProvider` bilan bir xil shakldagi fayl-tizim stub'i ishlatilgan.
    Serverda `npm run backup:now` bilan haqiqiy MinIO'ga tekshirish kerak.
    3. Saqlash tozalash eng yangi arxivni **hech qachon** o'chirmaydi — aks
    holda bir oy ishlamagan backup oxirgi yaroqli nusxani ham o'chirib
    yuborardi.

- [x] **0.7** `[P]` **Audit log ko'rish**
  · `routes/v1/audit.routes.js` (`GET /audit-logs`, `GET /audit-logs/export`)
  · `controllers/auditLog.controller.js`, `services/audit/auditLog.service.js`
  · `models/auditLog.model.js` — `{action:1, timestamp:-1}` indeksi + TTL 730 kun
  · `front/src/admin/views/AuditLogView.vue` + nav
  · Qabul: **AT-30**
  · Bajarildi — `audit:read` (ADMIN + SUPERADMIN) bilan yopilgan; filtr:
  amal, kim, sana oralig'i; CSV eksport kursor bilan oqim sifatida yoziladi
  (butun kolleksiya xotiraga yig'ilmaydi) va eksportning o'zi
  `AUDIT_LOG_EXPORTED` sifatida yoziladi. TTL 730 kun + `{action, timestamp}`
  indeksi qo'shildi.

- [x] **0.8** `[P]` **Error tracking + Socket.io Redis adapter + dead code**
  · Sentry/GlitchTip `config/logger.js` yoniga
  · `realtime/socket.js` — `socket.io-redis-adapter`
  · `admin/` papkasini o'chirish; `deploy/spring/`, `deploy/qollanma.techinfo.uz/` arxivga
  · Bajarildi — uchta mustaqil ish bo'lgani uchun **uchta commit**:
  `03c9fc0` (error tracking), `f8d7502` (realtime), `3dba3e6` (o'lik kod).
  · **Error tracking** — `config/errorTracking.js` + winston transport'i.
  Har bir `logger.error(...)` Sentry yoki GlitchTip'ga ketadi. `@sentry/node`
  olinmadi: uning qiymati auto-instrumentation'da, u esa http/express'ni
  patch qiladi — yonida oltita begona sayt turgan serverda kerak emas.
  Envelope formati testda tasdiqlangan (`test/errorTracking.test.js`, 21 test),
  chunki noto'g'ri format 200 oladi va hodisa jimgina yo'qoladi.
  `SENTRY_DSN` bo'lmasa butunlay o'chiq.
  · **Realtime** — `@socket.io/redis-adapter`. Bu haqiqiy prod xatosi edi:
  `ecosystem.config.cjs` cluster rejimida ishlaydi, xabar POST'ni qabul
  qilgan worker'dagi socket'largagina yetardi. Presence ham xuddi shunday
  buzilgan edi va adapter uni tuzatmaydi — `isUserOnline()` sinxron
  bo'lishi shart, shuning uchun 15 soniyalik sweep butun klaster ko'rinishini
  qayta yig'adi. Ikkita jarayonda tekshirildi (`test/socketCluster.test.js`):
  adapter'siz 4 testdan 2 tasi tushadi, adapter bilan 4/4.
  · **O'lik kod** — `admin/` (143 fayl, 25 MB) o'chirildi, `deploy/` →
  `docs/archive/deploy/`. Yonida nginx, docker-compose, workspace va hujjat
  havolalari ham tozalandi.
  · Chetlanish: `admin/` ni o'chirish **yashirin xatoni ochdi** —
  `front/src/composables/useVideoUpload.js` `tus-js-client` ni import
  qiladi, lekin `front/package.json` uni e'lon qilmagan edi; u faqat
  `admin/` e'lon qilgani uchun hoisting orqali topilardi. Endi front'da
  e'lon qilingan, build o'tadi.

- [ ] **0.9** `[P]` **N+1 tuzatishlar**
  · `jobs/reminderJob.js:18-50` — kurslarni `$in` bilan bir so'rovda; `bulkWrite`
  · `analytics/dashboardAggregation.js:98` — `User.find({})` o'rniga aggregation
  · `services/analytics/employeeInsights.service.js:126` — `listByCourses($in)`
  · `services/gamification/points.service.js:92` — aggregation pipeline'da `$sort`+`$limit`

- [ ] **0.10** `[P]` **Frontend poydevor komponentlari**
  · `ui/DataTable.vue`, `ui/FilterBar.vue`, `ui/FileDropzone.vue`,
  `ui/SortableList.vue`, `ui/Chart.vue`, `ui/UserPicker.vue`
  · Qabul: mavjud `UsersListView` va `TasksListView` shularga ko'chiriladi va
  qisqaradi (ish haqiqatan qayta ishlatilayotganini isbotlaydi)

---

## BLOK 1 — Yetkazish qatlami (Zanjir B, 3 hafta)

> Eng ko'p boshqa ishni ochadi: parol tiklash, hisob yaratish, deadline,
> tadbir, compliance, sertifikat — hammasi shundan o'tadi.

- [x] **1.1** **`mail.service` + `deliveryQueue`**
  · `services/notifications/mail.service.js` (nodemailer/SES)
  · `jobs/deliveryQueue.js` — BullMQ, 5× exponential retry
  · `models/mailLog.model.js` (TTL 90 kun)
  · `config/env.js` — `SMTP_*`
  · Qabul: **AT-17**
  · Bajarildi (`ed07e2c`) — nodemailer, SMTP orqali. 5 urinish, 30s dan
  eksponensial (~7,5 daqiqa). `MailLog` yozuvi **navbatga qo'yilganda**
  yaziladi, urinish paytida emas — Redis ishni yo'qotsa ham iz qoladi.
  Manzil va mavzu saqlanadi, **matn saqlanmaydi** (90 kunlik arxiv xavf).
  · AT-17 tekshirildi — soxta transport emas, haqiqiy soketdagi haqiqiy SMTP
  suhbati. Relay `fail` so'zi bor manzilni rad etadi, qolganini qabul qiladi,
  shuning uchun bitta server ikkala yo'lni ham qamraydi: `attempts=5`,
  `status=FAILED`, `error` ichida relayning o'z `500` i; muvaffaqiyat yo'lida
  `SENT` + `messageId`. 6 test o'tdi.
  · Chetlanishlar:
    1. Urinish **siyosati** (5×, eksponensial, 30s) prod `enqueueMail()`
    yaratgan ishda tekshiriladi; urinish **xatti-harakati** esa 25ms backoff
    bilan alohida navbatda — haqiqiy 7,5 daqiqani kutadigan testni hech kim
    ishga tushirmaydi.
    2. SMTP sozlanmagan bo'lsa bu **xato emas, holat**: yuborish `SKIPPED`
    deb yoziladi, `FAILED` emas. Lekin `SMTP_HOST` bor-u `MAIL_FROM` yo'q
    bo'lsa boot rad etiladi — yarim sozlangan holat eng yomoni.
    3. AT-17 ning "in-app bildirishnoma baribir yetkazilgan" qismi hali
    tekshirilmadi — `notify()` navbatga **1.4** da ulanadi.

- [x] **1.2** **`NotificationTemplate` + i18n**
  · `models/notificationTemplate.model.js` (`{type, channel, lang}` unique)
  · `services/notifications/notificationTemplate.service.js` — placeholder allowlist
  · Migratsiya **M9**: 25 tur × 3 til × 3 kanal seed
  · `jobs/reminderJob.js` — hardcoded inglizcha matnlarni `templateKey` ga almashtirish
  · `services/courses/course.service.js:186-196`, `courseAssignment.service.js:79` — xuddi shunday
  · Bajarildi (`85ac0f9`) — M9 lokalda ishga tushirildi, 225 qator
  (25 × 3 × 3). Takroriy ishga tushirish xavfsiz; admin tahrirlagan qator
  `customized: true` oladi va qayta yozilmaydi.
  · **Placeholder allowlist — bu xavfsizlik chorasi**, hujjat emas. Shablon
  adminlar tahrirlaydigan qator, `vars` esa chaqiruvchi servis uzatgan
  narsa (ko'pincha Mongoose hujjati). Allowlist bo'lmasa shablonni
  tahrirlay oladigan odam `{{passwordHash}}` ni xatga chiqarardi.
  · Chaqiruv joylari ko'chirildi: `reminderJob.js` (to'rttasi ham),
  `course.service.js`, `courseAssignment.service.js` va **`group.service.js`**
  — oxirgisi checklistda yo'q edi, lekin xuddi shu inglizcha satrni ishlatardi.
  · Chetlanishlar:
    1. **Fallback tili — o'zbekcha, ingliz emas.** Ruscha tarjima yo'q bo'lsa
    hamma o'qiydigan tilga tushadi.
    2. Har bir til uchun **default qiymat** qo'shildi (`belgilanmagan`,
    `не указан`). Muddatsiz kurs biriktirilganda sodda variant
    "Tugatish muddati: ." deb chiqardi. Default — bu ibora, shuning uchun
    kodda emas, har bir tilda turadi. Modelda `defaults` maydoni.
    3. Sanalar `utils/notificationFormat.js` orqali `APP_TIMEZONE` da
    formatlanadi. Ilgari `toLocaleDateString()` argumentsiz chaqirilardi —
    u **serverning** zonasida formatlaydi, ya'ni `2026-10-01T20:00Z`
    Toshkentda allaqachon 2-oktabr; muddat qaysi mashina yuborganiga qarab
    boshqacha o'qilardi.
    4. `notify()` ga `templateKey` + `vars` qo'shildi va IN_APP render
    qilinadi. **EMAIL qismi 1.4 da.** Aniq `title` berilsa u baribir
    ustun — shablon hali ifodalay olmaydigan chaqiruv joylari buzilmasin.

- [x] **1.3** **Foydalanuvchi sozlamalari**
  · `models/user.model.js` — `+locale`, `+notificationPrefs`, `+telegramChatId`
  · Migratsiya **M4** (`locale='uz'`, default prefs)
  · `GET|PUT /users/me/notification-prefs`
  · `mandatory` turlar ro'yxati (§9.3)
  · `front/src/views/SettingsView.vue` — bildirishnoma tab'i
  · Qabul: **AT-15, AT-16**
  · Bajarildi (`63828b2`) — M4 lokalda ishga tushirildi (4 hisob).
  `PUT /users/me/locale` ham qo'shildi: til brauzerda emas, **hisobda**
  turishi kerak, chunki bildirishnoma serverda, ko'pincha cron ichida
  yig'iladi — u yerda brauzer yo'q.
  · §9.3 ro'yxati `packages/shared/src/notificationPrefs.js` da: ikkala
  tomonga ham kerak — API o'chirishni rad etadi, sozlamalar ekrani esa
  o'sha tugmani qulflab ko'rsatishi kerak. Ikkita nusxa bir-biridan
  uzoqlashardi va bu UI xatosiga o'xshab ko'rinardi.
  · **AT-16 tekshirildi** — HTTP 400, `MANDATORY_NOTIFICATION`, va hech
  narsa saqlanmaydi (rad etilgan so'rovning to'g'ri yarmi ham emas).
  · **AT-15 qisman** — sozlama saqlanadi, kanalni qayta yoqish qatorni
  o'chiradi (`true` saqlanmaydi), in-app o'chirilsa yetkazilmaydi.
  **E-mail qismi 1.4 da** — `notify()` hali navbatga qo'ymaydi.
  · UI brauzerda jonli API bilan tekshirildi: 27 qator, 8 tasi qulfli va
  o'chirilgan, toggle ikkala yo'nalishda ham bazaga yetib bordi.
  · Chetlanishlar:
    1. Sozlamalar **faqat chetlanish** sifatida saqlanadi
    (`{COURSE_ASSIGNED:{email:false}}`), to'liq matritsa emas — yangi tur
    qo'shilganda u hamma uchun avtomatik yoqiq bo'ladi.
    2. **1.2 seed'i §9.3 bilan solishtirildi** (1.2 uni o'qimagan edi):
    `COMPLIANCE_REASSIGNED` → `COMPLIANCE_RETRAINING_DUE`, va
    `CERTIFICATE_EXPIRED` + `EVENT_RESCHEDULED` qo'shildi. **25 tur → 27.**
    Majburiy turda shablon bo'lmasa xat "PASSWORD_RESET" sarlavhasi bilan
    kelardi. Migratsiya endi tashlab yuborilgan turning qatorlarini ham
    o'chiradi (qo'lda tahrirlanganini qoldiradi).
    3. `notify()` endi har bir bildirishnoma uchun qabul qiluvchini o'qiydi
    (til + sozlama). Bu bulk sikllarda qo'shimcha so'rov — ataylab: muqobili
    "bu odam e-mail xohlaydimi" degan savolni buni bilishi shart bo'lmagan
    servislarga tarqatish edi. Kerak bo'lsa yechim `notifyMany()`.

- [x] **1.4** **`notify()` ni queue'ga ulash**
  · `services/notifications/notification.service.js:22-48` — oxiriga
  `deliveryQueue.add()`; imzo o'zgarmaydi (`templateKey`, `payload` qo'shiladi)
  · Bajarildi (`06eb619`) — imzo haqiqatan o'zgarmadi, mavjud chaqiruvchilar
  tegilmadi. Yubormaslikning to'rtta sababi bor va faqat bittasi qaror:
  hisob yo'q, manzil yo'q, foydalanuvchi shu turni o'chirgan, yoki EMAIL
  shabloni yo'q. Qolganlari xato emas, deployment holati.
  · **Tartib ataylab:** in-app avval yoziladi va push qilinadi, keyin xat
  navbatga qo'yiladi va u `try/catch` ichida. Xat — tizimdagi eng sekin va
  eng ishonchsiz narsa; relay o'chgan bo'lsa u kurs biriktirishni bekor
  qilmasligi kerak.
  · **Shu band ikkita ochiq qolgan bandni yopdi:**
    - **AT-15** e-mail yarmi — `COURSE_ASSIGNED.email=false` bo'lsa in-app
    keladi, `MailLog` yozuvi yozilmaydi; yoqiq bo'lsa yoziladi va mavzu
    hisobning tilida render qilinadi.
    - **AT-17** ikkinchi yarmi — yetkazib bo'lmaydigan xat in-app
    bildirishnomani yo'qotmaydi.
  · Yana tekshirildi: majburiy tur bazadagi sozlama teskari bo'lsa ham
  yuboriladi. API bunday qatorni yozishdan bosh tortadi, lekin eski
  build yoki qo'lda tahrir yozgan qator parolni tiklashni o'chirmasligi kerak.
  · `APP_URL` qo'shildi — EMAIL shablonlarining yakuniy havolasi. Bu xat
  in-app versiyadan farqli o'laroq olib yuradigan yagona narsa, chunki
  o'quvchi ilovada emas.

- [x] **1.5** **Parolni tiklash e-maili**
  · `services/auth/auth.service.js:204-215` — `logger.info` o'rniga `notify()`
  · Qabul: **AT-14**
  · Bajarildi (`2697b34`) — AT-14 haqiqiy SMTP suhbati bilan uchidan-uchiga
  tekshirildi: noma'lum identifikator hech narsa navbatga qo'ymaydi
  (enumeration yo'q), mavzu hisobning tilida (`locale='ru'` → ruscha),
  havola 1 soat, bazada token emas sha-256 hash, relay xatni oladi va yozuv
  `SENT` ga o'tadi, ikkinchi marta ishlatilsa 400. 8 test.
  · Chetlanishlar:
    1. **Muddat 30 daqiqadan 1 soatga uzaytirildi** — AT-14 shuni talab
    qiladi, va 30 daqiqa navbat qayta urinishi + odam xatni yig'ilishdan
    keyin o'qishi uchun yetmaydi.
    2. **Token endi shartsiz log qilinmaydi** — logdagi reset token bu
    logdagi parol. SMTP sozlanmagan va prod bo'lmagan holatdagina
    chiqariladi, va nima uchun chiqarilayotgani yozib qo'yilgan.
    3. Bu `notify()` chaqiruvi **await qilinadi** (boshqalaridan farqli):
    xatni navbatga qo'yish — bu endpoint qiladigan yagona ish, shuning
    uchun xatolik 200 ortida yashirinmasligi kerak.

- [ ] **1.6** **Hisob yaratish e-maili + yetishmayotgan trigger'lar**
  · `ACCOUNT_CREATED` (`user.service.js:302` dan keyin)
  · `COURSE_COMPLETED` (`videoEventProcessor.js:250` — 2.1 dan keyin)
  · `QUIZ_PASSED` / `QUIZ_FAILED` (`quiz.service.js:125`)
  · `NEWS_PUBLISHED` (`news.service.js` publish)
  · `LOGIN_FROM_NEW_DEVICE` (`auth.service.js` issueSession)

- [ ] **1.7** `[P]` **Web push**
  · `models/pushSubscription.model.js`, `services/notifications/push.service.js` (VAPID)
  · `POST|DELETE /push/subscribe`

- [ ] **1.8** `[P]` **Telegram kanali** — mahalliy sharoitda e-maildan ishonchliroq
  · `services/notifications/telegram.service.js` + ulash oqimi

---

## BLOK 2 — Shaxs, ierarxiya va scope (Zanjir A, 3 hafta · BLOK 1 bilan parallel)

- [ ] **2.1** **`users.managerId` + ierarxiya**
  · `models/user.model.js` — `+managerId`, `+employeeNumber`, indeks `{managerId:1}`
  · Migratsiya **M2** (HR ma'lumoti yoki XLSX'dan backfill)
  · `services/org/orgHierarchy.service.js` — `$graphLookup`, `managedUserIds(actorId)`
  · `GET /org/hierarchy`, `GET /org/chart`

- [ ] **2.2** **Scope'ni rol nomidan ruxsatga ko'chirish** 🔴
  · `models/role.model.js` — `+scope: 'ALL'|'DEPARTMENT'|'TEAM'|'SELF'`
  · `middlewares/scopeToManagedUsers.middleware.js` — `req.scopedUserIds` (Redis 5 daq)
  · 14 joyda `actor.roleName === ROLES.MANAGER` → `actor.scope !== 'ALL'`
  (fayllar: `user.service.js`, `task.service.js`, `group.service.js`,
  `courseAssignment.service.js`, `points.service.js`)
  · Qabul: **AT-21**

- [ ] **2.3** **`PATCH /roles/:id` + ruxsat matritsasi UI**
  · `routes/v1/roles.routes.js` — `PATCH` (tizim rollari qulflangan)
  · `front/src/admin/views/RolesPermissionsView.vue` — rol × ruxsat grid
  · Qabul: mavjud rolning ruxsatini o'zgartirib bo'ladi, uni o'chirmasdan

- [ ] **2.4** **Yangi rollar** — `AUTHOR`, `INSTRUCTOR`, `MENTOR`
  · `packages/shared/src/roles.js`, `permissions.js` (+45 kalit, §8.2 matritsasi)
  · `seed/seedRolesAndSuperAdmin.js`

- [ ] **2.5** **Manager dashboard**
  · `GET /dashboard/team`, `front/src/admin/views/ManagerDashboardView.vue`
  · `/bos` guard'ini qayta ko'rib chiqish: MANAGER o'z bo'limi sahifalarini ko'radi
  · Qabul: MANAGER UI'da ko'rgani = API'da ola olgani

- [ ] **2.6** **Bulk XLSX import**
  · `services/users/userImport.service.js` (dry-run + commit, `exceljs` mavjud)
  · `models/importJob.model.js`, `POST /users/import/{dry-run,commit}`
  · `front/src/admin/views/UsersListView.vue` — import sehrgari
  · Qabul: **AT-28, AT-29**

---

## BLOK 3 — Tugatish va sertifikat (Zanjir D, 4 hafta)

- [ ] **3.1** 🔴 **Yagona tugatish servisi**
  · `services/courses/courseCompletion.service.js` — yagona `evaluate(userId, courseId)`
  · `models/course.model.js` — `+completionRule{}`
  · `analytics/videoEventProcessor.js:238-252` — blokni **olib tashlab**,
  shu servisga chaqiruvga almashtirish
  · `services/materials/materialProgress.service.js` va
  `services/assessments/assessment.service.js` (`gradeAndRecord`) — shu servisni chaqirish
  · Qabul: **AT-01, AT-02, AT-03, AT-04**

- [ ] **3.2** **Sertifikat modellari va render**
  · `models/certificateTemplate.model.js`, `certificate.model.js`, `externalCertificate.model.js`
  · `services/certificates/certificateRender.service.js` (`pdfkit` + DejaVu — mavjud)
  · `jobs/certificateQueue.js`
  · Qabul: **AT-10, AT-11**

- [ ] **3.3** **Sertifikat API va UI**
  · `routes/v1/certificates.routes.js` (9 endpoint)
  · `GET /public/certificates/:serial` — auth'siz, rate-limited, PII'siz
  · `front/src/views/CertificatesView.vue`,
  `front/src/admin/views/CertificateTemplatesView.vue` + pozitsiya editori
  · Qabul: **AT-12, AT-13**

- [ ] **3.4** **Kurs metadatasi**
  · `models/courseCategory.model.js`
  · `models/course.model.js` — `+categoryId, tags[], level, authorIds[],
  estimatedMinutes, prerequisiteCourseIds[], certificateTemplateId,
  navigationMode, validityDays, version, allowSelfEnroll`
  · Migratsiya **M3**
  · `repositories/course.repository.js` — `$text` indeks + yangi filtrlar
  · `front/src/admin/views/CoursesListView.vue`, `CourseBuilderView.vue` — filtr va maydonlar

- [ ] **3.5** **Kursni nusxalash** — `POST /courses/:id/duplicate` (deep copy)

---

## BLOK 4 — Baholash tizimi (Zanjir C, 4 hafta · BLOK 3 bilan parallel)

- [ ] **4.1** 🔴 **`Question` + `QuestionBank`**
  · `models/question.model.js` (13 tur, `payload` sxemalari — `docs/v2/03` §6.3)
  · `models/questionBank.model.js`
  · `services/questions/questionGrading.js` — har tur uchun baholash

- [ ] **4.2** 🔴 **`Quiz`/`Assessment` birlashtirish**
  · `models/quiz.model.js` — `scope: VIDEO|TOPIC|COURSE|PATH`, `questionIds[]`,
  `pools[]`, `maxAttempts`, `timeLimitMinutes`, `shuffle*`, `partialCredit`,
  `revealMode`, `scorePolicy`, `focusLossLimit`
  · `models/testSession.model.js` (`assessmentSession` umumlashtirilgan) — `+questionSet[]`, `+seed`
  · Migratsiya **M1** (`_legacy` bilan) va **M5**
  · Qabul: **AT-09**

- [ ] **4.3** **Urinish chegarasi va tanlash**
  · `services/quizzes/quiz.service.js` — atomik `maxAttempts` guard
  · `services/questions/questionSelection.js` — pool + shuffle + attempt'da muzlatish
  · Qabul: **AT-05, AT-06, AT-07**

- [ ] **4.4** **Baholash siyosati va feedback**
  · `partialCredit`, `question.points`, `question.explanation`, `revealMode`, `scorePolicy`
  · Qabul: **AT-08**

- [ ] **4.5** **Editor va statistika**
  · `front/src/admin/views/QuestionBanksView.vue`, `QuizEditorView.vue` (13 tur)
  · `GET /quizzes/:id/stats` — savol qiyinligi
  · Video quiz'ga ham `testSession` (taymer + focus-loss) — hozir faqat assessment'da

---

## BLOK 5 — Learning path va onboarding (4 hafta)

- [ ] **5.1** **Learning path**
  · `models/learningPath.model.js`, `pathEnrollment.model.js`
  · `services/paths/pathSequence.js` — `courseSequence.js` naqshi
  · `services/courses/courseVisibility.js` → umumiy `isVisibleToActor(actor, doc)`
  · Qabul: **AT-26, AT-27**

- [ ] **5.2** **Path UI** — `PathsView`, `PathDetailView`, `PathsListView`, `PathBuilderView`

- [ ] **5.3** **Enrollment rules** — `models/enrollmentRule.model.js`,
  `jobs/enrollmentRuleQueue.js` (user create/update + kunlik)

- [ ] **5.4** **Onboarding**
  · `models/onboardingProgram.model.js`, `onboardingEnrollment.model.js`
  · `jobs/onboardingQueue.js` — `hireDate` bo'yicha avtomatik boshlash
  · `Task` fan-out (`audienceType`, `batchId`) qadamlar uchun qayta ishlatiladi

- [ ] **5.5** **Dinamik guruhlar** — `group.type`, `group.rule{}`

---

## BLOK 6 — Live training, kalendar, topshiriq (3 hafta)

- [ ] **6.1** **Tadbir kengaytmasi**
  · `models/event.model.js` — `+mode, trainerIds[], capacity, registeredCount,
  meeting{}, remindBeforeMinutes[], linkedCourseId, requiresRegistration, status`
  · `models/eventRegistration.model.js`, Migratsiya **M6**
  · Qabul: **AT-31**

- [ ] **6.2** **Tadbir bildirishnomalari** — `event.service.js` ga `notify()`
  (yaratildi / o'zgardi / bekor qilindi / eslatma / waitlist ko'tarildi)
  · Qabul: **AT-32**

- [ ] **6.3** **Tadbir UI** — `EventDetailView` (xodim, ro'yxatdan o'tish),
  `EventsAdminView` (davomat). ⚠️ `PATCH`/`DELETE /events/:id` API **allaqachon bor**, UI yo'q (§1.14)

- [ ] **6.4** **Yagona kalendar** — `services/calendar/calendar.service.js`
  (tadbir + kurs deadline + topshiriq + path), `GET /calendar`, `.ics`

- [ ] **6.5** **Uy vazifasi (Assignment)**
  · `models/assignment.model.js`, `submission.model.js`, `rubric.model.js`
  · `services/assignments/*`, baholash navbati UI

---

## BLOK 7 — Qidiruv, KB, compliance, gamification (4 hafta)

- [ ] **7.1** **Global qidiruv** — `$text` indekslar (`courses`, `users`,
  `kbArticles`), `services/search/globalSearch.service.js` (kirish huquqi
  bo'yicha filtr), `ui/CommandPalette.vue`
  · Qabul: **AT-24**

- [ ] **7.2** **Knowledge base** — `kbCategory`, `kbArticle`, `kbArticleVersion`,
  `kbView`, `kbComment`; `sanitize-html` allowlist; `NewsView` naqshi analitika uchun

- [ ] **7.3** **Compliance** — `models/recurringAssignment.model.js`,
  `jobs/complianceQueue.js`, `ComplianceView` (kurs × xodim matritsasi)
  · Qabul: **AT-34**

- [ ] **7.4** **Badge dvigateli** — `models/badge.model.js`, `userBadge.model.js`,
  `services/gamification/badge.service.js` (criteria + notify), Migratsiya **M7**
  · `badgeDefinitions.js` seed'ga aylanadi

- [ ] **7.5** **Material yuklab olish nazorati** — `material.allowDownload`;
  `getDownloadUrl` 403; `openStream` **allaqachon tayyor** (§1.1)
  · Qabul: **AT-33**

- [ ] **7.6** **Settings modeli** — `models/settings.model.js` (singleton),
  `attentionPolicy`/`facePolicy` dagi **GLOBAL→COURSE meros naqshini
  umumlashtirish** (§1.8), branding, Redis kesh

---

## BLOK 8 — Hisobot, analitika (3 hafta)

- [ ] **8.1** **17 yangi hisobot turi** — `reportData.service.js` builders
- [ ] **8.2** **Hisobotni ekranda ko'rish** — `ReportsView` da jadval + grafik (FL-29)
- [ ] **8.3** **Async eksport** — `models/exportJob.model.js`, `jobs/exportQueue.js`,
  `MAX_ROWS` kesilganini ochiq ko'rsatish
  · Qabul: **AT-22**
- [ ] **8.4** **Rejalashtirilgan hisobotlar** — `scheduledReport.model.js`, cron job
- [ ] **8.5** **Dashboard kengaytmasi** — test, sertifikat, tadbir, path,
  compliance metrikalari; `scope` almashtirgichi

---

## BLOK 9 — Kontent va authoring (6 hafta)

- [ ] **9.1** **`ContentItem` polimorf bazasi** (bosqichma-bosqich, `Lesson` bilan boshlanadi)
- [ ] **9.2** **`Lesson` + blok editor** — 12 blok turi, drag-drop, autosave
- [ ] **9.3** **SCORM 1.2/2004 import** — `scormPackage`, `scormState`,
  iframe API adapter, helmet CSP `frame-src` sozlash
- [ ] **9.4** **Subtitr / VTT** — ffmpeg pipeline'ga qo'shish, pleyerda `<track>`
  (**accessibility uchun majburiy**)
- [ ] **9.5** **Media kutubxona** — `mediaAsset`, papkalar, "qayerda ishlatilgan",
  `jobs/mediaCleanupQueue.js` (orphan — `course.service.js:378` dagi qarz)
- [ ] **9.6** **Rasm optimizatsiyasi** — `sharp` → webp

---

## BLOK 10 — AI (4 hafta)

- [ ] **10.1** `models/aiGenerationJob.model.js`, `jobs/aiGenerationQueue.js`
- [ ] **10.2** `services/ai/sourceExtract.service.js` (pdf/docx/pptx → matn, serverga)
- [ ] **10.3** `aiCourse.service.js` — struktura + dars (natija har doim `DRAFT`)
- [ ] **10.4** `aiQuiz.service.js` — yangi `Question` modeliga
- [ ] **10.5** `aiTranslate.service.js` + `models/contentTranslation.model.js`
  (struktura va ID'lar saqlanadi)
- [ ] **10.6** Token byudjeti (`Settings.ai.monthlyTokenBudget`), AI audit,
  PII himoyasi testi

---

## BLOK 11 — Korxona (5 hafta)

- [ ] **11.1** `models/apiKey.model.js`, `middlewares/apiKeyAuth.middleware.js`,
  per-key rate limit, `/api/public/v1`
- [ ] **11.2** `models/webhook.model.js`, `webhookDelivery.model.js`,
  `jobs/webhookQueue.js` (HMAC + 5× retry)
- [ ] **11.3** OpenAPI — `zod-to-openapi`, `GET /openapi.json`, `/api/docs`
- [ ] **11.4** OIDC SSO — `services/integrations/oidcClient.js`, JIT provisioning,
  claim → rol/bo'lim mapping
- [ ] **11.5** `middlewares/idempotency.middleware.js` (`Idempotency-Key`)
- [ ] **11.6** TOTP 2FA, foydalanuvchi sessiyalari sahifasi

---

## BLOK 12 — Mobil va accessibility (4 hafta)

- [ ] **12.1** PWA — `vite-plugin-pwa`, manifest, Workbox
- [ ] **12.2** Oflayn kontent — IndexedDB, "oflayn saqlash"
- [ ] **12.3** Oflayn sinxronizatsiya — `clientEventId` unique indeks,
  Background Sync
  · Qabul: **AT-35**
- [ ] **12.4** Accessibility — modal focus-trap, ARIA, `:focus-visible`,
  `altText`, rang kontrastini o'lchash, `axe-core` CI
- [ ] **12.5** Video pleyer — klaviatura shortcut'lari, subtitr tugmasi

---

## BLOK 13 — Kengaytirilgan baholash (5 hafta)

- [ ] **13.1** `models/competency.model.js`, `userCompetency.model.js`
- [ ] **13.2** 360° — `reviewTemplate`, `reviewCycle`, `reviewAssignment`,
  `reviewResponse`; baholovchilar `managerId` dan avtomatik; anonimlik N≥3
- [ ] **13.3** OJT — `ojtChecklist`, `ojtSession`, `ojtObservation`, mobil forma
- [ ] **13.4** Development plan — `developmentPlan`, `planReview`;
  `PointsLedger` CPE uchun qayta ishlatiladi

---

## BLOK 14 — Regressiya himoyasi (doimiy)

- [ ] **14.1** `test/regression.test.js` — **AT-R1…AT-R12** (§20)
- [ ] **14.2** `test/grading.test.js` — 13 savol turi × to'g'ri/noto'g'ri/qisman
- [ ] **14.3** `test/completion.test.js` — AT-01…AT-04
- [ ] **14.4** `test/scope.test.js` — AT-18…AT-21
- [ ] **14.5** Har migratsiya uchun `--dry-run` testi

---

## Infratuzilma qarori (koddan tashqarida, lekin bloklovchi)

- [ ] **INF-1** 🔴 **Ajratilgan server** — hozir 1.9 GB RAM, olti begona sayt
  bilan bir VM'da. BLOK 9 (SCORM, ffmpeg subtitr) va BLOK 10 (AI) buni
  ko'tarmaydi. Tavsiya: **4 vCPU / 8 GB RAM / 200 GB SSD**, object storage alohida.
- [ ] **INF-2** Media uchun ochiq host (`media.sds-max.uz`) — 0.5 bilan bog'liq
- [ ] **INF-3** CDN — HLS segmentlar va statik fayllar uchun
- [ ] **INF-4** SMTP provayder hisobi — BLOK 1 uchun shart

---

## Yakuniy jamlanma

| Blok | Hafta | Kümülyativ | Nima ochiladi |
|---|---|---|---|
| 0 · Xavfsizlik + infratuzilma | 1 | 1 | 5 CRITICAL teshik yopiladi |
| 1 · Yetkazish | 3 | 4 | Parol tiklash, eslatmalar, sertifikat yo'li |
| 2 · Shaxs va scope | 3 | 4 (parallel) | 360°, onboarding, manager dashboard yo'li |
| 3 · Tugatish + sertifikat | 4 | 8 | Compliance, path yo'li |
| 4 · Baholash | 4 | 8 (parallel) | AI quiz, savol analitikasi yo'li |
| 5 · Path + onboarding | 4 | 12 | Sertifikatsiya dasturlari |
| 6 · Live training + topshiriq | 3 | 15 | — |
| 7 · Qidiruv + KB + compliance | 4 | 19 | — |
| 8 · Hisobot | 3 | 22 | — |
| 9 · Kontent + authoring | 6 | 28 | AI kurs generatsiyasi yo'li |
| 10 · AI | 4 | 32 | — |
| 11 · Korxona | 5 | 37 | HR integratsiyasi |
| 12 · Mobil + a11y | 4 | 41 | — |
| 13 · Kengaytirilgan baholash | 5 | 46 | — |

**Bitta dasturchi:** ~46 hafta (≈11 oy).
**Ikki dasturchi (BLOK 1‖2, 3‖4 parallel):** ~30 hafta (≈7 oy).

**Parity darajasi bloklar bo'yicha:**
BLOK 0–3 tugagach ≈ **55/100** · BLOK 0–8 tugagach ≈ **78/100** ·
Hammasi tugagach ≈ **95/100** + biz kuchli bo'lgan 8 qobiliyat (§18.2)
o'z joyida qoladi.

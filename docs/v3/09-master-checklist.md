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

- [x] **1.6** **Hisob yaratish e-maili + yetishmayotgan trigger'lar**
  · `ACCOUNT_CREATED` (`user.service.js:302` dan keyin)
  · `COURSE_COMPLETED` (`videoEventProcessor.js:250` — 2.1 dan keyin)
  · `QUIZ_PASSED` / `QUIZ_FAILED` (`quiz.service.js:125`)
  · `NEWS_PUBLISHED` (`news.service.js` publish)
  · `LOGIN_FROM_NEW_DEVICE` (`auth.service.js` issueSession)
  · Bajarildi (`d7c945a`) — beshtasi ham. 11 test, hammasi bitta qoidaga
  qurilgan: **ikki marta chiqadigan bildirishnoma umuman chiqmaydiganidan
  yomonroq** — ikkinchisi birinchisini e'tiborsiz qoldirishga o'rgatadi.
  · `ACCOUNT_CREATED` JSHSHIR ni olib yuradi, **parolni hech qachon emas** —
  pochtadagi parol undan foydalanuvchi odamdan uzoqroq yashaydi.
  · `LOGIN_FROM_NEW_DEVICE`: qurilma `userAgent` bo'yicha aniqlanadi va
  savol **sessiya yozilishidan oldin** beriladi — aks holda hozir
  yaratilayotgan yozuvning o'zi "bu qurilma tanish" dalili bo'lib qolardi.
  `refresh` chiqarib tashlangan: u har 15 daqiqada bir xil mashinada
  sodir bo'ladi va ogohlantirishni ma'nosizlantirardi.
  · `NEWS_PUBLISHED` faqat `DRAFT → PUBLISHED` o'tishida. Chop etilgan
  maqoladagi xatoni tuzatish uni qayta e'lon qilmaydi.
  · Chetlanishlar:
    1. `COURSE_COMPLETED` uchun checklistda "2.1 dan keyin" deb yozilgan
    edi, lekin trigger nuqtasi (`videoEventProcessor.js` dagi
    `ACTIVE → COMPLETED`) allaqachon mavjud va `managerId` ga bog'liq emas —
    shuning uchun hozir qo'shildi. 3.1 (yagona tugatish servisi) kelganda
    bu chaqiruv o'sha yerga ko'chishi kerak.
    2. Test uchun `sessionRepository.hasSeenUserAgent()` va
    `userRepository.listActiveByNewsTargets()` qo'shildi — yangilik
    **ro'yxatlarni** (bir nechta bo'lim, bir nechta rol) mo'ljallaydi,
    kursning bitta bo'limidan farqli; bo'sh ro'yxat "hamma" degani.
    3. `NEWS_PUBLISHED` fan-out — har bir xodim uchun alohida sikl. Bu
    ataylab: hammaga e'lon hammaga bildirishnoma degani. Qabul qiluvchilar
    soni log qilinadi — batching kerak bo'lsa birinchi qaraladigan raqam.

- [x] **1.7** `[P]` **Web push**
  · `models/pushSubscription.model.js`, `services/notifications/push.service.js` (VAPID)
  · `POST|DELETE /push/subscribe`
  · Bajarildi (`44a64ca`) — VAPID kalitlari bo'lmasa o'chiq (SMTP kabi);
  bitta kalit ikkinchisisiz bo'lsa boot rad etiladi. 15 test + endpointlar
  HTTP orqali sinaldi (401, 400, subscribe, list, unsubscribe).
  · Fikrning ko'p qismi **obunani qachon tashlash kerak** degan savolda.
  Noto'g'ri sababdan o'chirilsa, odam bildirishnoma olishni jimgina
  to'xtatadi va buni bilishning yo'li yo'q. Shuning uchun:
  `404`/`410` (vendor "yo'q" dedi) → o'chiriladi; boshqasi (503, timeout,
  liftdagi telefon) → qoladi va sanaladi; ketma-ket 20 marta → baribir
  o'chiriladi.
  · `subscribe()` **endpoint bo'yicha** upsert qiladi, foydalanuvchi bo'yicha
  emas: brauzer o'z jadvali bilan qayta obuna bo'ladi va har safar takror
  qator qolib, ikki marta push kelardi. Qayta obuna `failureCount` ni ham
  nolga tushiradi — brauzer o'zi tirikligini aytyapti.
  · `unsubscribe` endpoint berilganda ham `userId` bilan cheklangan —
  endpoint bearer'ga o'xshash satr, va bir hisob boshqasining brauzerini
  o'chira olmasligi kerak.
  · Chetlanishlar:
    1. **Brauzer tomoni kirmadi** — service worker va ruxsat so'rovi. U
    PWA ishiga (12.1) tegishli. Shu paytgacha API tayyor va
    `GET /push/public-key` `enabled:false` qaytaradi, ya'ni klient hali
    ishlatib bo'lmaydigan ruxsatni so'ramaydi.
    2. Har bir push `tag: type` bilan yuboriladi — ikkinchi "muddat
    yaqinlashdi" ekranda birinchisining o'rniga tushadi, ustiga emas.

- [ ] **1.8** `[P]` **Telegram kanali** — mahalliy sharoitda e-maildan ishonchliroq
  · `services/notifications/telegram.service.js` + ulash oqimi
  · ⏸️ **2026-09-09: foydalanuvchi so'rovi bilan to'xtatildi** — "telegram
  bog'lama shartmas". Yozilgan kod commit qilinmadi, `git stash` da turibdi:
  `stash@{0}` "1.8 Telegram channel — parked at the user's request".
  · Ichida bor edi: `telegram.service.js` (bot API, kod bilan ulash oqimi),
  `telegram.controller.js`, `POST /telegram/webhook` (Telegram echo qiladigan
  maxfiy sarlavha bilan himoyalangan), `TELEGRAM` to'rtinchi kanal sifatida
  (27 × 3 × 4 = 324 shablon qatori), va sozlamalar ekranidagi to'rtinchi
  ustun. Bazadagi 81 ta `TELEGRAM` qatori ham qaytarib olindi (324 → 243).
  · Qayta boshlansa: `git stash pop` va `npm run migrate:templates`.

---

## BLOK 2 — Shaxs, ierarxiya va scope (Zanjir A, 3 hafta · BLOK 1 bilan parallel)

- [x] **2.1** **`users.managerId` + ierarxiya**
  · `models/user.model.js` — `+managerId`, `+employeeNumber`, indeks `{managerId:1}`
  · Migratsiya **M2** (HR ma'lumoti yoki XLSX'dan backfill)
  · `services/org/orgHierarchy.service.js` — `$graphLookup`, `managedUserIds(actorId)`
  · `GET /org/hierarchy`, `GET /org/chart`
  · Bajarildi (`c234587`) — 21 test, endpointlar HTTP orqali, M2 ning ikkala
  yo'li ham sinaldi (dry-run mos kelmagan qatorni ko'rsatdi, tsiklli variant
  yozishdan bosh tortdi va nol bo'lmagan kod bilan chiqdi).
  · `managedUserIds` **tranzitiv** — direktor o'z lidlarini *va* ular
  ostidagi hammani boshqaradi. Bir bosqichli versiya butun bo'limni o'z
  direktoridan yashirardi. Bu 2.2 dagi scope'ning poydevori, ya'ni bu
  yerdagi xato — ruxsat xatosi.
  · Kesh 5 daqiqa. Odam ko'chirilganda **ikkala zanjir** (eski va yangi
  boshliqlar) tozalanadi, faqat odamning o'zi emas — javob har ikki uchning
  ustidagi barcha boshliqlar uchun o'zgardi.
  · Chetlanishlar:
    1. **Tsikllarga alohida e'tibor.** Bir-biriga bo'ysunadigan ikki odam —
    bu HR eksportidagi bitta xato satr, va undan keyingi har bir yurish
    yo ilib qoladi yo jimgina `maxDepth` da kesiladi. Yozish yo'li ularni
    rad etadi (kolleksiyada hech qachon bo'lmaydi), `$graphLookup` da esa
    baribir `maxDepth: 15` turadi — ilib qoladigan o'qishni faqat yozish
    yo'liga ishonib qoldirib bo'lmaydi.
    2. M2 **butun rejani** tsiklga tekshiradi, satrma-satr emas: `A→B` va
    `B→A` alohida-alohida to'g'ri, faqat juftlik xato.
    3. `GET /org/*` route darajasida emas, **controller ichida** yopilgan:
    ikkalasi ham standart holatda chaqiruvchining o'zi haqida javob beradi
    va `user:read` faqat boshqa odam so'ralganda tekshiriladi. Route'ni
    yopish xodimga o'z boshlig'ini ko'rishni taqiqlardi — bu maxfiy
    ma'lumot emas, shartnomasida yozilgan.

- [x] **2.2** **Scope'ni rol nomidan ruxsatga ko'chirish** 🔴
  · `models/role.model.js` — `+scope: 'ALL'|'DEPARTMENT'|'TEAM'|'SELF'`
  · `middlewares/scopeToManagedUsers.middleware.js` — `req.scopedUserIds` (Redis 5 daq)
  · 14 joyda `actor.roleName === ROLES.MANAGER` → `actor.scope !== 'ALL'`
  (fayllar: `user.service.js`, `task.service.js`, `group.service.js`,
  `courseAssignment.service.js`, `points.service.js`)
  · Qabul: **AT-21**
  · Bajarildi (`b4da574`) — 11 chaqiruv joyi `hasUnscopedAccess(actor)` ga
  ko'chdi; endi kodda hech qayerda rolning **nomini** bilish shart emas.
  · **AT-21 HTTP orqali tekshirildi**: shu maqsadda yaratilgan rol bilan —
  `DEPARTMENT` faqat o'z bo'limini ko'radi, xuddi shu ruxsat `ALL` da
  hammani ko'radi, bo'lim ro'yxati ham xuddi shunday cheklanadi.
  · **Eng muhim xavfsizlik xossasi: mavjud hech kimning chegarasi
  siljimadi.** `MANAGER` `DEPARTMENT` sifatida seed qilinadi — bu qattiq
  yozilgan tekshiruvlar aynan qilgan ishi — va `security.test.js` dagi
  manager-scope testlari o'zgarishsiz o'tadi.
  · **Hamma default tor tomonga**, chunki bu yerdagi har bir default
  "sizib chiqadi" bilan "bezovta qiladi" o'rtasidagi tanlov:
    - scope aytilmagan yangi rol — `SELF`, `ALL` emas;
    - 2.2 dan oldin yozilgan rol hujjatida maydon umuman yo'q →
    `resolveRoleScope` uni **nomidan** hal qiladi, notanish nom → `SELF`;
    - 2.2 dan oldin berilgan tokenda `scope` da'vosi yo'q va ular yana 15
    daqiqa amal qiladi → o'sha tor yo'l bilan hal qilinadi, `ALL` emas;
    - `ALL` dan boshqa har bir scope **fail-closed**: bo'limi yo'q
    `DEPARTMENT` aktyor hech kimga emas, hammaga emas, cheklanadi.
  · `TEAM` — 2.1 ning foydasi shu yerda: u bo'lim maydonidan emas, org
  chartdan hal qilinadi, ya'ni boshqa bo'limdagi jamoa rahbari ham o'z
  odamlarini ko'radi.
  · Chetlanish: `scopeToManagedUsers` middleware'i **faqat hisobot
  router'iga** ulandi, hamma joyga emas. `reportData.build` chegarani o'zi
  ham hisoblab oladi (middleware bermаsa) — u yerdagi mavjud izoh "yangi
  hisobot buni qo'llashni unuta olmaydi" deydi, va bu route'ning
  middleware'ni ulashni eslab qolishidan **kuchliroq kafolat**. Uni
  tartib uchun zaiflashtirish noto'g'ri savdo bo'lardi.

- [x] **2.3** **`PATCH /roles/:id` + ruxsat matritsasi UI**
  · `routes/v1/roles.routes.js` — `PATCH` (tizim rollari qulflangan)
  · `front/src/admin/views/RolesPermissionsView.vue` — rol × ruxsat grid
  · Qabul: mavjud rolning ruxsatini o'zgartirib bo'ladi, uni o'chirmasdan
  · Bajarildi (`e2f23ea`) — 12 test + brauzerda jonli API bilan tekshirildi:
  grid 29 ruxsatni chiqardi, `user:read` yoqildi va `course:read` o'chirildi,
  ikkalasi ham bazaga yetdi; oltita o'rnatilgan rol to'g'ri scope yorlig'i
  bilan va tahrirlash tugmasisiz ko'rindi.
  · **Qabul sharti ayni shu edi:** ilgari rolning ruxsatini o'zgartirishning
  yagona yo'li uni o'chirib qayta yaratish edi — API esa kimdir ushlab
  turgan rolni o'chirishdan bosh tortadi. Ya'ni amaldagi tartib: hamma
  xodimni boshqa rolga ko'chirish → o'chirish → qayta yaratish → hammasini
  qaytarish.
  · Ruxsatlar ro'yxati **butunlay almashtiriladi**, birlashtirilmaydi: grid
  butun qatorni yuboradi, va birlashtirish katakchani o'chirishni ta'sirsiz
  qilardi — ruxsat UI'si uchun bu eng yomon xatti-harakat, chunki ishlagandek
  ko'rinadi.
  · Chetlanishlar:
    1. **O'rnatilgan rollar qulflangan** (o'chirish yo'li bilan bir xil
    qoida). `SUPERADMIN` dan `role:manage` ni olib tashlay oladigan admin
    hammani rol boshqaruvidan abadiy qulflab qo'yardi — UI orqali qaytish
    yo'li yo'q.
    2. Audit yozuvi **nima o'zgarganini** yozadi (qo'shilgan/olib tashlangan
    kalitlar, scope oldin/keyin), shunchaki "o'zgardi" emas.
    3. `GET /roles/permissions` katalogni `permissions` kolleksiyasidan
    o'qiydi, `ALL_PERMISSIONS` dan to'g'ridan-to'g'ri emas — kolleksiyada
    tavsif bor va u har boot'da o'sha konstantadan seed qilinadi, ya'ni
    ikkalasi bir-biridan uzoqlasha olmaydi.

- [x] **2.4** **Yangi rollar** — `AUTHOR`, `INSTRUCTOR`, `MENTOR`
  · `packages/shared/src/roles.js`, `permissions.js` (+45 kalit, §8.2 matritsasi)
  · `seed/seedRolesAndSuperAdmin.js`
  · Bajarildi (`c33d8f8`) — 15 test; ishga tushirilgan serverga qarshi
  tekshirildi: 9 rol seed qilindi, 71 katalog qatori, AUTHOR 30 /
  INSTRUCTOR 27 / MENTOR 22 ruxsat, to'g'ri scope bilan.
  · **Nima uchun kerak edi:** ilgari birovga kurs yozdirishning yagona yo'li
  uni ADMIN qilish edi — bu esa unga har bir xodim yozuvini ham beradi.
  · `AUTHOR` materialni yozadi (kurs, path, savol banki, media, AI), lekin
  **`course:publish` va `course:delete` yo'q**: kurs yozish va uni butun
  kompaniyaga majburiy qilish — boshqa-boshqa qarorlar. `user:read` umuman
  yo'q.
  · `INSTRUCTOR` o'qitadi (tadbir, davomat, baholash, biriktirish), lekin
  `course:create` yo'q — o'zi o'qitadigan materialni yozmaydi.
  · `MENTOR` — uchtasidan **yagona** xodim yozuvini o'qiy oladigani, va
  aynan shuning uchun **yagona `TEAM` scope'lisi**: chegarasiz `user:read`
  bu butun kompaniya.
  · Chetlanishlar:
    1. **45 emas, 42 kalit qo'shildi** — API key / webhook / SSO ni bitta
    `integration:manage` ga birlashtirdim (ular bir xil qaror: kompaniyadan
    tashqaridagi narsaga gapirish huquqi), va allaqachon mavjud kalitlarni
    takrorlamadim. Jami 71 kalit.
    2. Kalitlarning bir qismi **keyingi bloklardagi** funksiyalarni
    qo'riqlaydi (path, savol banki, sertifikat, KB, 360°, OJT, compliance,
    automation). Ular hozir yozildi, chunki rollar hozir yozildi — teshigi
    bor ruxsat ro'yxati keyinroq esga olinishi kerak bo'ladigan qarz.
    Hech narsa tekshirmaydigan kalit hech narsa bermaydi: ruxsat faqat
    uni so'raydigan route tomonidan o'qiladi.
    3. Mavjud rollar ham matritsaga moslandi: `ADMIN` §8.2 SUPERADMIN'ga
    ajratgan **to'rtta kalitdan** boshqa hammasini oldi; `MANAGER` `~`
    qatorlarini oldi (chegara `role.scope` orqali, alohida kalit orqali
    emas); `EMPLOYEE` faqat o'z o'qishiga tegishlilarini oldi.
  · Yo'l-yo'lakay: `dump.rdb` (Redis snapshot'i) `.gitignore` ga qo'shildi —
  u repo ildizidan ishga tushirilgan `redis-server` dan qolib ketardi.

- [x] **2.5** **Manager dashboard**
  · `GET /dashboard/team`, `front/src/admin/views/ManagerDashboardView.vue`
  · `/bos` guard'ini qayta ko'rib chiqish: MANAGER o'z bo'limi sahifalarini ko'radi
  · Qabul: MANAGER UI'da ko'rgani = API'da ola olgani
  · Bajarildi (`c92de0c`) — **0.3 dagi chetlanish shu bilan yopildi**:
  hisobotlar scope'langan, dashboard esa yo'q edi va scope'li chaqiruvchi
  403 olardi, ketadigan joyi yo'q.
  · Jamoa dashboardi **jonli hisoblanadi**, umumiy keshdan o'qilmaydi.
  Kompaniya dashboardi oldindan agregatlanadi, chunki hamma admin bir xil
  javobni xohlaydi; jamoa esa o'nlab odam va **har bir rahbar boshqacha
  javob** kutadi — keshlash har bir rahbarga bitta yozuv, har biri 5
  daqiqagacha eskirgan, va bu millisekundlik so'rovni tejash uchun.
  · U ataylab **kichikroq** narsa: rahbarga kim orqada qolgani va nima
  muddati o'tgani kerak; "eng ko'p pauza qilingan video" — kontent muallifi
  savoli, boshqaruv savoli emas. Xodimlar **eng orqada qolgani birinchi**
  tartibida — sahifa aynan shu savol uchun ochiladi.
  · **Eshik ham ko'chdi:** `/bos` faqat SUPERADMIN uchun edi, ya'ni UI
  API'dan tor edi — rahbar endpointlarni chaqira olardi, lekin ularni
  chaqiradigan sahifalarni ocha olmasdi. Endi kirish "biror admin sahifasi
  talab qiladigan ruxsat bormi" bo'yicha, har bir sahifa esa o'z
  `meta.permission` ini tekshiradi. Qabul sharti aynan shu.
  · Chetlanishlar:
    1. Scope'li foydalanuvchi kompaniya dashboardiga tushsa **jamoa
    sahifasiga yo'naltiriladi** — 403 beradigan sahifani yuklashiga yo'l
    qo'yilmaydi.
    2. **Test yozayotganda haqiqiy imtiyoz xatosi topildi:** scope
    middleware'i ro'yxatni faqat aktyor `id` si bo'yicha keshlardi. Bitta
    odam turli scope bilan kelishi mumkin (2.3 da rol tahrirlangan, rol
    almashtirilgan, yoki eski token) — va keshlangan `DEPARTMENT` ro'yxati
    `TEAM` so'roviga qaytarilardi, ya'ni **haqli bo'lganidan kengroq**.
    Kalitga scope qo'shildi.

- [x] **2.6** **Bulk XLSX import**
  · `services/users/userImport.service.js` (dry-run + commit, `exceljs` mavjud)
  · `models/importJob.model.js`, `POST /users/import/{dry-run,commit}`
  · `front/src/admin/views/UsersListView.vue` — import sehrgari
  · Qabul: **AT-28, AT-29**
  · Bajarildi (`de4a1d0`) — **BLOK 2 yopildi**. 17 test, xotirada haqiqiy
  300 satrli `.xlsx` yasab, endpoint ishlatadigan **o'sha parser** orqali
  o'qilgan holda. Servisga oddiy massiv beradigan test aynan buziladigan
  qismni o'tkazib yuborardi.
  · **AT-28**: `willCreate 295`, `willUpdate 0`, beshta xato — har biri
  **fayldagi satr raqami** bilan; hech narsa yozilmaydi; hisobot XLSX
  bo'lib yuklab olinadi. **AT-29**: 295 hisob, parollar faqat javobda,
  bitta `USERS_IMPORTED` (soni bilan) + har biriga `USER_CREATED`, va har
  biriga `ACCOUNT_CREATED`. Endpointlar HTTP orqali ham sinaldi.
  · **Dry-run — funksiyaning mazmuni**, xushmuomalalik emas: uch yuz kishilik
  HR eksportida xato bo'ladi, va ularni bittalab 400 orqali topish ish
  usuli emas.
  · Commit dry-run tahlil qilgan qatorlardan ishlaydi, qayta yuklashdan
  emas: operator **aniq bir ro'yxatni** tasdiqladi, qayta tahlil esa
  oraliqda kimdir bo'lim qo'shgan bo'lsa boshqacha natija berishi mumkin.
  `ImportJob` shuning uchun bor va **2 soatlik TTL** bilan — tahlil
  qilingan import bu har bir xodimning shaxsiy ma'lumotlari nusxasi.
  · Chetlanishlar:
    1. Filial, bo'lim, bo'linma va lavozim **ro'yxatda bo'lishi shart**.
    Ro'yxatda yo'q qiymat deyarli har doim xato yozuv, va uni qabul qilish
    odamni o'z jamoasidan filtrlab tashlaydigan ikkinchi imlo yaratadi.
    2. **Fayl ichidagi** takrorlar ham tekshiriladi — ular bazadagi
    to'qnashuvlar kabi tez-tez uchraydi va yozish paytida ancha chalkash
    xato beradi.
    3. Rahbar bog'lanishi hamma hisob yaratilgandan **keyin bitta o'tishda**
    biriktiriladi: rahbar o'ziga bo'ysunuvchidan pastroq satrda bo'lishi
    mumkin.
    4. **Test yana haqiqiy kamchilikni ochdi:** olingan e-maillar oddiy
    `Set` da saqlanardi, shuning uchun bir xil faylni qayta import qilishda
    (odamlarni yangilashning odatiy yo'li) har bir satrning **o'z** e-maili
    o'ziga to'qnashuv deb hisoblanardi — 295 yangilanish o'rniga 295 xato.
    Endi egasi bo'yicha: qiymat faqat **boshqa** odamda bo'lsa band.
    5. `user:import` alohida ruxsat (§8.2): bitta hisob yaratish va uch yuz
    hisob yaratish — boshqa-boshqa qarorlar; `MANAGER` da birinchisi bor,
    ikkinchisi yo'q.

---

## BLOK 3 — Tugatish va sertifikat (Zanjir D, 4 hafta)

- [x] **3.1** 🔴 **Yagona tugatish servisi**
  · `services/courses/courseCompletion.service.js` — yagona `evaluate(userId, courseId)`
  · `models/course.model.js` — `+completionRule{}`
  · `analytics/videoEventProcessor.js:238-252` — blokni **olib tashlab**,
  shu servisga chaqiruvga almashtirish
  · `services/materials/materialProgress.service.js` va
  `services/assessments/assessment.service.js` (`gradeAndRecord`) — shu servisni chaqirish
  · Qabul: **AT-01, AT-02, AT-03, AT-04**
  · Bajarildi (`3eb0b23`) — 12 test. To'rtala qabul testi **bitta xatoning
  uch tomoni** edi: tugatish ikki joyda hisoblanardi va ular kelishmasdi.
  · `videoEventProcessor` faqat videolardan hal qilardi, `publishedVideoIds
  .length > 0` sharti ostida — shuning uchun taqdimot va testdan iborat kurs
  **hech qachon** tugamasdi (AT-01), videolari bitgan kurs esa majburiy
  testi yiqilgan holda tugardi (AT-02), va o'quvchi 100% ni ko'rib turib
  `ACTIVE` assignment ushlab turardi (AT-03).
  · Endi `courseCompletion.service.js` yagona javob. Video protsessoridagi
  blok **o'chirildi**, material progressi va baholash ham shu servisni
  chaqiradi, `course.service` esa foizni ikkinchi marta hisoblamaydi —
  **AT-03 shuning uchun kelishuv bilan emas, konstruksiya bilan to'g'ri**.
  · `course.completionRule`: `minPercent` (kursning qanchasi) va
  `requireAllRequired` (foizdan qat'i nazar bajarilishi shart bo'lganlar).
  Kurs 60% da o'tishi va baribir xavfsizlik testini talab qilishi mumkin.
  Ikkalasi ham qat'iy holatga default, ya'ni mavjud kurslarda hech narsa
  o'zgarmaydi.
  · Chetlanishlar:
    1. **Bo'sh kurs tugallanmaydi.** Bu hech narsa uchun sertifikat berish
    bo'lardi — AT-01 ga teskari xato, va xuddi shunday noto'g'ri.
    2. Tugatish **faqat published** elementlar bo'yicha hal qilinadi.
    Qoralama dars o'quvchini 80% da ushlab turmasligi kerak.
    3. **Qayta ochilganda (AT-04) o'quvchiga sababi aytiladi.** Jimgina
    orqaga qaytarish platformа progressni yo'qotgandek ko'rinardi. Berilgan
    sertifikat **bekor qilinmaydi**: u berilgan paytdagi haqiqatni yozgan,
    va o'quvchi aralashmagan o'zgarish uchun uni orqaga qaytarish insofsizlik
    bo'lardi. Qayta tugatganda yangisi beriladi.
    4. `completedAt` qayta ochilganda tozalanadi — tugallanmagan kursdagi
    tugatish sanasi keyinchalik hisobot takrorlaydigan kichik yolg'on.
    5. Dars nashr qilinganda **butun kurs bo'yicha qayta hisoblanadi**, chunki
    bu so'rov yubormayotgan odamlar uchun ham javobni o'zgartiradi. Faqat
    `PUBLISHED` ga o'tishda yoki `required` o'zgarganda — videoning nomini
    tahrirlash hamma o'quvchini aylanib chiqmasligi kerak.
    6. Yangi `COURSE_REOPENED` bildirishnoma turi qo'shildi (27 → 28 tur).

- [x] **3.2** **Sertifikat modellari va render**
  · `models/certificateTemplate.model.js`, `certificate.model.js`, `externalCertificate.model.js`
  · `services/certificates/certificateRender.service.js` (`pdfkit` + DejaVu — mavjud)
  · `jobs/certificateQueue.js`
  · Qabul: **AT-10, AT-11**
  · Bajarildi (`ef84b79`) — 19 test. 3.1 shuni mumkin qildi: "kurs tugadi"
  endi ishonchli hodisa, unga narsa osish mumkin.
  · **Uchta model orasidagi chegara — dizaynning o'zi:**
    - `Certificate` ism va kurs nomini **berilgan paytda ko'chirib oladi**,
    render paytida qo'shmaydi. Sertifikat o'zi berilgan kundagi haqiqatni
    bildiradi; ikki yildan keyin qayta nomlangan kurs hammaning sertifikatini
    jimgina qayta yozmasligi kerak.
    - `CertificateTemplate` — fon rasmi + **foizda joylashgan** maydonlar.
    Hujjat formati emas: HR tayyor JPEG beradi va keyin ismni ikki santimetr
    chapga surishni xohlaydi; buni `.docx` shabloni bilan ifodalashga har bir
    urinish oxiri XML tahrirlashga olib keladi. Foiz A4 ni A5 ga
    almashtirilganda ham omon qoladi.
    - `ExternalCertificate` — **ataylab alohida kolleksiya**. Bizniki
    platforma ishlab chiqargan va tekshira oladigan dalil; u esa kimdir
    qo'lda kiritgan va rasm biriktirgan da'vo. Ularni birlashtirish
    tasdiqlanmagan yuklamani compliance hisobotida platforma bergandek
    ko'rsatardi.
  · **AT-11 unique partial indeks bilan majburlanadi**, `check-then-write`
  bilan emas: chaqiruvchi qayta uriniladigan navbat, va ikkita worker bir
  millisekundda tekshiruvdan o'tishi mumkin. Duplicate-key xatosi qayta
  urinishning **kutilgan** natijasi va mavjud sertifikatni qaytaradi.
  `revokedAt: null` bo'yicha partial — bekor qilingan sertifikat qayta
  berishni to'smaydi (kurs qayta ochilib, qayta tugatilganda aynan shu
  kerak). **O'nta bir vaqtdagi urinish bittani beradi** — test shuni
  tekshiradi.
  · Chetlanishlar:
    1. **Serial tasodifiy, ketma-ket emas.** U QR ichida, tekshirish
    havolasida va qog'ozda — hisoblagich bo'lsa, login talab qilmaydigan
    sahifa orqali butun shtatni sanab chiqish mumkin bo'lardi. `0/O` va
    `1/I/L` ishlatilmaydi: skanerlay olmagan odam uni qog'ozdan ko'chiradi.
    2. **Avval beriladi, keyin render qilinadi**, va yozuv PDF paydo
    bo'lishidan oldin saqlanadi. Render yiqilsa sertifikat baribir berilgan
    va qayta urinish faqat chizishi kerak; teskari tartib shrift xatosi
    tufayli berishning o'zini yo'qotardi.
    3. `toPublicVerification` — **ataylab proyeksiya**, qator emas:
    `userId`, `courseId`, `pdfKey` yo'q. Faqat so'rovchi allaqachon
    qo'lida ushlab turgan qog'ozdagi ism. AT-12 endpointi 3.3 da shunga
    quriladi.
    4. **S3 yuklash lokal sinalmadi** (MinIO Docker'siz ko'tarilmaydi) —
    `renderCertificatePdf` baytlari bo'yicha sinaldi, `render()` esa uning
    ustiga faqat `putObject` qo'shadi.
    5. `course.certificateTemplateId` maydoni 3.4 ro'yxatidan **erta**
    qo'shildi — 3.2 dagi berish yo'lida o'qiydigan narsa bo'lmasdi.

- [x] **3.3** **Sertifikat API va UI**
  · `routes/v1/certificates.routes.js` (9 endpoint)
  · `GET /public/certificates/:serial` — auth'siz, rate-limited, PII'siz
  · `front/src/views/CertificatesView.vue`,
  `front/src/admin/views/CertificateTemplatesView.vue` + pozitsiya editori
  · Qabul: **AT-12, AT-13**
  → Ochiq endpoint alohida router'da (`publicCertificatesRouter`) va
    `/api/v1/public/certificates` ostiga ulandi. Sababi: uni
    `authenticate` ishlaydigan router'ga qo'ysak, kelajakda kimdir
    `router.use(authenticate)` qo'shib qo'ysa, QR kod jimgina buziladi —
    endi bunday bo'lishi mumkin emas, chunki u router'da `authenticate`
    umuman yo'q. Login o'rniga daqiqasiga 10 ta so'rov limiti turadi.
  → `toPublicVerification` `status: VALID | EXPIRED | REVOKED` qaytaradi
    (AT-13 matni shuni talab qiladi); bekor qilingan muddati o'tgandan
    ustun — tekshiruvchiga kuchliroq javob kerak. Bekor qilish **sababi**
    ochiq javobda yo'q: unda odam ismi yoki hodisa tafsiloti bo'lishi
    mumkin.
  → Yuklab olish PDF'ni proksi qilmaydi, 5 daqiqalik imzolangan URL
    beradi; `pdfKey` hech qachon javobga chiqmaydi (chelak yo'lini
    berish — qo'shni kalitni sinab ko'rishga taklif).
  → Test: `test/certificatePublic.test.js` — jonli HTTP orqali, chunki
    noto'g'ri joyga ulangan route har qanday mock'dan o'tib ketadi.
    Tekshiriladi: token'siz 200, javobda JSHSHIR/email/userId/pdfKey/
    bo'lim yo'q, noma'lum seriya 404, 12 urinishdan oldin 429.

- [x] **3.4** **Kurs metadatasi**
  · `models/courseCategory.model.js`
  · `models/course.model.js` — `+categoryId, tags[], level, authorIds[],
  estimatedMinutes, prerequisiteCourseIds[], certificateTemplateId,
  navigationMode, validityDays, version, allowSelfEnroll`
  · Migratsiya **M3**
  · `repositories/course.repository.js` — `$text` indeks + yangi filtrlar
  · `front/src/admin/views/CoursesListView.vue`, `CourseBuilderView.vue` — filtr va maydonlar
  → M3 nega kerak: Mongoose default'lari **allaqachon saqlangan**
    hujjatlarga tegmaydi. Eski kursda `level` maydoni umuman yo'q, va
    `{ level: 'BEGINNER' }` yo'q maydonga mos kelmaydi — ya'ni backfill
    bo'lmasa, har bir eski kurs filtrlangan katalogdan jimgina yo'qoladi
    (filtrsizida esa turaveradi). Test shu holatni qamrab oladi.
  → Migratsiya har maydon uchun alohida `updateMany` qiladi,
    `$exists:false` bilan. Bitta umumiy `$set` 80% ga sozlangan
    `completionRule`ni default'ga qaytarib yuborardi — bu migratsiya
    niqobidagi ma'lumot yo'qotish. Qayta ishga tushirish xavfsiz.
  → Default'lar hozirgi xatti-harakatni aynan saqlaydi:
    `navigationMode='SEQUENTIAL'` (courseSequence.js allaqachon shunday
    qulflaydi), `allowSelfEnroll=false`, `validityDays=0`, `version=1`.
    Ya'ni migratsiya bazaning **aytganini** o'zgartiradi, **qilganini**
    emas.
  → `$text` indeks (`course_text`, title×10 / tags×4 / description×1)
    qo'shildi, lekin katalog ro'yxati hamon substring bilan qidiradi:
    `$text` faqat butun so'zga mos keladi, ro'yxat esa harf-harf
    yoziladi — «mehn» «mehnat muhofazasi»ni topolmay qolardi. Indeks 7.1
    global qidiruv uchun, `searchText()` orqali.
  → Kategoriya o'chirilsa kurslar **kategoriyasiz** qoladi (o'chmaydi va
    o'chirishga to'sqinlik ham qilmaydi) — aks holda xato yaratilgan
    kategoriyani o'chirish uchun 40 ta kursni qo'lda ko'chirish kerak
    bo'lardi.
  → `completionRule` o'zgarsa `evaluateCourse()` chaqiriladi: «tugagan»
    ta'rifini o'zgartirish kimlar tugatganini o'zgartiradi (AT-04 bilan
    bir xil sabab).

- [x] **3.5** **Kursni nusxalash** — `POST /courses/:id/duplicate` (deep copy)
  → Ko'chiriladi: mavzular, videolar, hujjatlar, testlar (savollari bilan),
    video quiz'lari va kursning attention override'i. **Ko'chirilmaydi:**
    tayinlov, progress, urinishlar, Q&A, sharh, ball. Nusxa — hech kim
    o'qimagan kurs; kimningdir «tugatgan» holatini ko'chirish
    hisobotlarga soxta tugatish qo'shardi.
  → Media **qayta yuklanmaydi, havola qilinadi**: video gigabaytlarcha,
    HLS esa mingta segment. Sillabusning tahrirlanadigan nusxasi uchun
    ularni ko'chirish bir bosishni bir soatlik uzatishga aylantirardi.
    Ishlaydi, chunki striming segmentlarni manifest kalitidan oladi,
    video `_id` dan emas (`videoStream.service.js`).
  → Shu ulashuv tufayli `video.service.remove` va
    `material.service.remove` endi o'chirishdan oldin havolani sanaydi:
    aks holda bir nusxadan darsni o'chirish ikkinchisining pleyerini
    bo'shatib qo'yardi.
  → Savollarning embed `_id` lari yangidan beriladi. Mongoose berilgan
    subdocument `_id` ni saqlab qoladi, urinish esa javob bergan savol
    id'sini yozadi — bir xil id ikkita testda «qaysi savolda hamma
    adashadi» tahlilini jimgina qo'shib yuborardi.
  → Nusxa har doim `DRAFT` va `version: 1`. Aks holda bitta bosish tirik
    kursning yarim tahrirlangan dublikatini nishondagi hammaga chiqarardi.

---

## BLOK 4 — Baholash tizimi (Zanjir C, 4 hafta · BLOK 3 bilan parallel)

- [x] **4.1** 🔴 **`Question` + `QuestionBank`**
  · `models/question.model.js` (13 tur, `payload` sxemalari — `docs/v2/03` §6.3)
  · `models/questionBank.model.js`
  · `services/questions/questionGrading.js` — har tur uchun baholash
  → Enum'da **14** qiymat bor, spec esa «13 tur» deydi:
    `DRAG_WORDS` — bu `DRAG_DROP` ning gap ichidagi ko'rinishi. Payload
    ham, baholash ham bir xil, faqat editor boshqa; spec ularni bitta
    deb sanaydi.
  → `payload` — `Mixed`. 14 turning umumiy strukturasi yo'q, va mongoose
    subdocument bo'yicha discriminate qilolmaydi. Shakl **zod** bilan
    `question.validator.js` da, ya'ni yomon payload **kirgan joyda**
    tekshiriladi. Aks holda u keyinroq validatsiya xatosi emas, balki
    hammani jimgina «noto'g'ri» deb baholaydigan savol bo'lardi. Test
    `PAYLOAD_SCHEMAS` kalitlari `QUESTION_TYPES` bilan **aynan** mos
    kelishini tekshiradi — yangi tur sxemasiz qo'shilsa test yiqiladi.
  → Baholash toza funksiyalar: baza yo'q, soat yo'q, so'rov yo'q. 48 ta
    test har turni alohida qamraydi, shuning uchun yiqilgan test qaysi
    tur ekanini aytadi.
  → Ikkita tuzoq yopildi: (1) `MULTI_CHOICE` da barcha katakchani
    belgilash **0** beradi — noto'g'ri tanlov to'g'risini so'ndiradi;
    aks holda bu har qanday testdagi eng oson to'liq ball. (2) buzuq
    javob **exception emas, 0**: javob brauzerdan keladi va u yerda
    throw qilish butun topshiriqni yiqitib, o'quvchining qolgan
    javoblarini ham yo'qotadi.
  → `LIKERT` — so'rov elementi: `max: 0`, foizga umuman kirmaydi.
    `ESSAY` — `needsReview: true`, odam ko'rmaguncha ball yo'q (noto'g'ri
    deb belgilanmaydi). Noma'lum tur ham `needsReview`, chunki jimgina
    0 qo'yish buzuq savolni ko'rinmas qiladi.
  → Jarima (`penalty`) faqat **butunlay** noto'g'ri javobga qo'llanadi:
    to'rtta juftlikdan uchtasini topganni jarimalash qisman ballni
    javob bermaslikdan yomonroq qilardi.

- [x] **4.2** 🔴 **`Quiz`/`Assessment` birlashtirish**
  · `models/quiz.model.js` — `scope: VIDEO|TOPIC|COURSE|PATH`, `questionIds[]`,
  `pools[]`, `maxAttempts`, `timeLimitMinutes`, `shuffle*`, `partialCredit`,
  `revealMode`, `scorePolicy`, `focusLossLimit`
  · `models/testSession.model.js` (`assessmentSession` umumlashtirilgan) — `+questionSet[]`, `+seed`
  · Migratsiya **M1** (`_legacy` bilan) va **M5**
  · Qabul: **AT-09**
  → **Kolleksiya nomi `testQuizzes`, `quizzes` emas.** `quizzes` — tirik
    eski model, AT-09 esa eski endpoint'lar shu reliz davomida
    o'zgarmasdan javob berishini talab qiladi. Birlashgan yozuvlarni o'sha
    kolleksiyaga yozish bitta kolleksiyada ikkita sxema degani bo'lardi va
    har bir eski o'qish ularni ajratishi kerak bo'lardi. Eski
    kolleksiyalar keyingi relizda, ularni hech kim o'qimay qolgach,
    tashlanadi.
  → M1 **hech narsani o'zgartirmaydi va nomini almashtirmaydi** — faqat
    oldinga nusxalaydi. Eski endpoint'lar eski kolleksiyalarni o'qiyverdi,
    ular uchun hech narsa sodir bo'lmagan. AT-09 shu sabab bajariladi.
  → Yangi `Question` **eski embed savolning `_id` sini saqlab qoladi**.
    Bu shunchaki qulaylik emas: eski attempt `answers[].questionId` ni
    yozgan, va endi u haqiqiy `Question` hujjatiga ishora qiladi —
    mapping jadvali umuman kerak emas.
  → M1 hech narsani jimgina yoqmaydi: `shuffle*`, `partialCredit`,
    `maxAttempts`, `timeLimitMinutes`, `focusLossLimit` — hammasi eski
    xatti-harakatdagidek. Migratsiya testni **nima ekanini** o'zgartirsa,
    uni allaqachon topshirayotganlar uchun boshqa test bo'lib qolardi.
  → Ko'p to'g'ri javobli eski savol `MULTI_CHOICE` deb yoziladi. Eski
    grader baribir bitta indeksni solishtirardi, ya'ni u savol
    allaqachon xato baholanayotgan edi; bu saqlangan ballni
    o'zgartirmaydi, faqat yangi grader xatoni takrorlamaydi.
  → M5: `attemptNo` yozilish tartibidan to'ldiriladi (`createdAt`, teng
    bo'lsa `_id` bilan — beqaror sort bitta odamga ikkita «2-urinish»
    berardi), `testQuizId` qo'yiladi, `assessmentSessions` →
    `testSessions` ga **nusxalanadi**. `expiresAt` o'zgarmaydi: uni
    «hozir»dan qayta hisoblash davom etayotgan topshiriqqa yangi taymer
    berardi — server tomonidagi deadline aynan shundan saqlaydi.
  → `quizAttempts`/`assessmentAttempts` faqat **qo'shimcha** maydonlar
    oldi (`payload`, `perQuestion[]`, `sessionId`, `attemptNo`,
    `testQuizId`, `needsReview`, `gradedBy/At`); `selectedOptionIndex` va
    `videoId` ixtiyoriy bo'ldi. Mavjud yozuvlarga tegilmadi.

- [x] **4.3** **Urinish chegarasi va tanlash**
  · `services/quizzes/quiz.service.js` — atomik `maxAttempts` guard
  · `services/questions/questionSelection.js` — pool + shuffle + attempt'da muzlatish
  · Qabul: **AT-05, AT-06, AT-07**
  → Guard **yangi** `services/quizzes/testQuiz.service.js` da, eski
    `quiz.service.js` da emas. Eskisi legacy video quiz'ga xizmat qiladi:
    unda `maxAttempts` ham, taymer ham, pool ham yo'q, va u endpoint'lar
    almashguncha aynan hozirgidek ishlashi kerak (AT-09). Ikkala qoidani
    bitta faylga tiqish — migratsiya aynan o'zi saqlashi kerak bo'lgan
    narsani buzadigan yo'l.
  → AT-06 ni «yaxshiroq tekshirish» bilan hal qilib bo'lmaydi: ikkala tab
    ham mavjud urinishlarni sanaydi, ikkalasi ham bir xil javob oladi va
    ikkalasi ham «yana bitta mumkin» deb xulosa qiladi — sanash va yozish
    ikki xil amal. Shuning uchun qaror **unique indeks**da:
    `{userId, testQuizId, attemptNo}` (partial, `testQuizId` bor
    yozuvlarda). Yutqazgani 11000 oladi va 409 ga aylanadi.
  → AT-07: paper sessiyada **muzlatiladi**. `questionSet` saqlanmasa,
    reload — qayta tanlov, ya'ni o'quvchi F5 bosib oson variant «ovlashi»
    mumkin, va yuborilgan javobni solishtirishga narsa qolmaydi. Tanlov
    seed bilan: bir seed — bir xil paper, ya'ni bir oydan keyin «nega
    unga aynan shu 5 ta savol tushdi?» degan savolga sessiya yozuvidan
    javob berish mumkin.
  → `SEQUENCE` va `MATCHING` **har doim** aralashtirib ko'rsatiladi
    (`shuffleOptions` dan qat'i nazar): ular payload'ni to'g'ri tartibda
    saqlaydi, saqlangan holicha yuborish esa savolni «submit bosing»ga
    aylantiradi. Test buni tekshiradi.
  → Bank yupqalashib qolsa (savollar nafaqaga chiqarilgan) test
    **qisqaroq** bo'ladi, xato emas — lekin `shortfalls` log'ga yoziladi,
    aks holda 10 ta savol sozlangan joyda 5 ta savolli test jimgina
    chiqib ketardi.
  → Vaqti tugagan sessiya urinish sifatida **yoziladi** (0 ball). Aks
    holda taymerli testni boshlab, ketib qolib, keyin bepul qaytadan
    boshlash mumkin bo'lardi. Kechikkan yuborishga 30 soniya imtiyoz —
    sekin tarmoq aldov emas.
  → Yon ta'sir: `test/certificatePublic.test.js` endi har ishga tushishda
    o'z IP'sini taqdim etadi (`X-Forwarded-For`). Aks holda bir daqiqa
    ichidagi ikkinchi run birinchisi bo'shatgan rate-limit chelagini
    meros qilib olardi va hamma assertion koddagi sababsiz 429 da
    yiqilardi.

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

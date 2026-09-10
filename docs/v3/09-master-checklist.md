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

- [x] **0.9** `[P]` **N+1 tuzatishlar**
  · `jobs/reminderJob.js:18-50` — kurslarni `$in` bilan bir so'rovda; `bulkWrite`
  · `analytics/dashboardAggregation.js:98` — `User.find({})` o'rniga aggregation
  · `services/analytics/employeeInsights.service.js:126` — `listByCourses($in)`
  · `services/gamification/points.service.js:92` — aggregation pipeline'da `$sort`+`$limit`
  · Bajarildi — to'rttala manba ham yopildi, ustiga beshinchisi qo'shildi:
    1. **Eslatma sweep'i** — kurs sarlavhalari bitta `$in` bilan olinadi,
    belgilash esa `updateMany` bilan. `bulkWrite` emas: har qatorga bir xil
    maydonga bir xil vaqt yoziladi, ya'ni bulkWrite ko'taradigan qatorga xos
    hech narsa yo'q. Belgilash `finally` ichida — yetkazish yarmida yiqilsa,
    xabar tekkan odamlar qayta-qayta (har 15 daqiqada) ogohlantirilmasin.
    2. **`notificationService.notifyMany()`** — kod o'zi taklif qilgan tuzatish
    (`notification.service.js` dagi izoh: "the fix is a notifyMany() that loads
    the recipients in one query"). Sweep har bir bildirishnoma uchun oluvchi
    hisobini alohida o'qirdi; endi butun to'plam uchun bitta o'qish.
    `notify()` ning tanasi `deliver()` ga ajratildi, boshqa hech narsa
    o'zgarmadi.
    3. **Dashboard gistogrammasi** — `employeeProgressBuckets()` aggregation'i
    (`$lookup` + `$switch` + `$group`); butun xodimlar ro'yxati endi Node'ga
    ko'chirilmaydi. Filtr parametri qo'shildi — testga kerak, dashboard uni
    ishlatmaydi.
    4. **`videoRepository.listByCourses($in)`** — `getPerformance` o'ttiz
    topshiriqli xodim uchun o'ttizta so'rov yuborardi.
    5. **Leaderboard** — `pointsLedgerRepository.rankUsers()`: `$group` →
    `$lookup` (users) → `$facet{rows:[$sort,$limit], total:[$count]}`.
    Yonida **jimgina xato** ham tuzaldi: eski kod `listActive` dan 500 ta
    xodim olardi, ya'ni 500 dan katta kompaniyada "top 20" aslida alifbo
    bo'yicha birinchi 500 tasining top 20 si edi.
  · Sinov: `backend/test/nPlusOne.test.js` (15 test). Mezon "kam so'rov" emas,
  **"katta to'plamda ham xuddi shuncha so'rov"** — mongoose'ning `debug`
  ilgagi haqiqatan yuborilgan buyruqlarni sanaydi, shuning uchun kelajakda
  kimdir sikl ichiga yana bir o'qish qo'shsa test tushadi.
  · Chetlanish: `test/roleScope.test.js` dagi "scope ALL hammani ko'radi"
  testi 100 qatorlik birinchi sahifada aniq bir odam bo'lishiga tayanardi —
  parallel ishlaydigan boshqa test fayli o'nlab xodim yaratsa tushardi.
  Ismi bo'yicha qidiruvga o'tkazildi va yoniga fence hali ham ushlab
  turishini tekshiradigan ikkinchi test qo'shildi.

- [x] **0.10** `[P]` **Frontend poydevor komponentlari**
  · `ui/DataTable.vue`, `ui/FilterBar.vue`, `ui/FileDropzone.vue`,
  `ui/SortableList.vue`, `ui/Chart.vue`, `ui/UserPicker.vue`
  · Qabul: mavjud `UsersListView` va `TasksListView` shularga ko'chiriladi va
  qisqaradi (ish haqiqatan qayta ishlatilayotganini isbotlaydi)
  · Bajarildi. Har bir komponent **allaqachon bir necha joyda takrorlangan
  markup**dan olindi, "keyin kerak bo'lar" degan taxmindan emas:

  | Komponent | Nechta joyda takrorlangan edi | Hozir kim ishlatadi |
  |---|---|---|
  | `DataTable` | jadval qobig'i 6 ta ekranda so'zma-so'z | UsersList, AuditLog |
  | `FilterBar` | filtr qatori 4 ta ekranda | UsersList, AuditLog, Reports |
  | `UserPicker` | xodim qidiruvi 6 ta faylda | Tasks, AuditLog, Reports |
  | `FileDropzone` | 3 ta ekran fayl oladi, faqat 1 tasi drop'ni qabul qilardi | Material, Video |
  | `SortableList` | Tasks o'z drag holatini yozgan, PathBuilder'da drag umuman yo'q edi | Tasks, PathBuilder |
  | `Chart` | bitta chart bor edi va u faqat bitta shaklni chizardi | HomeView (chiziq + ustun) |

  · Uchtasi nusxalarning hech birida bo'lmagan narsani qiladi:
    - `UserPicker` so'rovni debounce qiladi va **kechikib kelgan javobni
    tashlaydi** — ro'yxatning eski natijaga qaytib "sakrashi" shundan edi.
    - `SortableList` dragenter/dragleave ni sanaydi, shuning uchun kursor
    kartalar ustidan o'tganda drop belgisi o'chib-yonmaydi; yonida
    yuqori/past tugmalari saqlangan — sudrash qulaylik, yagona yo'l emas.
    - `FileDropzone` — material formasi va import ustasida fayl tashlash
    brauzerni yarim to'ldirilgan formadan olib ketardi.
  · **Qator soni halol hisobi:** iste'molchilar −201 qator, komponentlar
  +782 (o'chirilgan `TrendChart` hisobga olingan). Ya'ni birinchi bosqichda
  kod **ko'paydi** — yutuq keyingi ekranda, u endi bularning hech birini
  yozmaydi. PathBuilder (+6) va HomeView (+15) esa qisqarmadi, chunki
  **yangi imkoniyat oldi**: sudrab tartiblash va formatlanadigan diagramma.
  · Yonida bitta o'qish xatosi tuzatildi: dashboard'dagi «xodimlar taqsimoti»
  0-25/25-50/50-75/75-100 shkalasidagi to'rtta bucket, lekin reyting ro'yxati
  sifatida chizilardi — reyting qiymat bo'yicha saralaydi, ya'ni bir xil
  raqamlar har kuni boshqa tartibda chiqib, taqsimotning shakli
  o'qilmasdi. Endi ustunli diagramma.

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

- [x] **4.4** **Baholash siyosati va feedback**
  · `partialCredit`, `question.points`, `question.explanation`, `revealMode`, `scorePolicy`
  · Qabul: **AT-08**
  → `scorePolicy` — «qaysi urinish hisoblanadi» degan savolga javob.
    Eski modellarda bu savol umuman yo'q edi: ular doim eng oxirgi
    yozuvni o'qirdi, ya'ni `LAST` amalda yagona siyosat edi. `BEST` —
    ko'pchilik trening uchun to'g'risi (muhimi o'rgangani, uch marta
    urinishi emas), `FIRST` — sertifikatsiya organi talab qiladigani,
    `AVERAGE` — ba'zilari talab qiladigani.
  → «O'tdi» hisoblanadigan ball bo'yicha aniqlanadi, biror urinish
    o'tgan-o'tmaganiga qarab emas — aks holda `FIRST` va `AVERAGE`
    bezakdan boshqa narsa bo'lmasdi.
  → Urinish yo'q bo'lsa ball `null`, `0` emas: 0 «topshirdi va yiqildi»
    degan ma'noni beradi, bu «hali topshirmagan»dan butunlay boshqa
    narsa.
  → `revealMode`: ikkala eski model ham javoblarni **darhol**
    ko'rsatardi. Mashq uchun to'g'ri, qayta topshirish mumkin bo'lgan
    test uchun esa xato — yiqilasan, javob kalitini o'qiysan, hammasini
    bilib qayta topshirasan.
  → `AFTER_LAST_ATTEMPT` cheksiz urinishda `AFTER_PASS` ga tushadi. Hech
    qachon bajarilmaydigan qoida — qattiq siyosat emas, bug.
  → Ochilmagan holatda ham **ballar ko'rsatiladi**, faqat to'g'ri javob
    va izoh berilmaydi: ballarni ham yashirish odamni «yiqildim»mi yoki
    «buzuq»mi ajrata olmaydigan holatga qo'yadi.
  → `quiz:grade` huquqi bo'lgan odam qoidaga bo'ysunmaydi — u tekshirish
    uchun qaraydi, javob kalitini «ovlash» uchun emas.

- [x] **4.5** **Editor va statistika**
  · `front/src/admin/views/QuestionBanksView.vue`, `QuizEditorView.vue` (13 tur)
  · `GET /quizzes/:id/stats` — savol qiyinligi
  · Video quiz'ga ham `testSession` (taymer + focus-loss) — hozir faqat assessment'da
  → Statistika **o'rtacha ball emas, har savol bo'yicha to'g'ri javob
    ulushi** beradi. «Bu guruh mavzuni o'zlashtirmagan» bilan «bu savol
    noto'g'ri yozilgan»ni ajratadigan raqam aynan shu; ilgari attempt
    faqat umumiy ballni saqlagani uchun ikkalasiga ham javob yo'q edi.
  → Muallif belgilagan qiyinlik va amaldagi qiyinlik yonma-yon
    ko'rsatiladi — ularning **kelishmasligi** signal. 5+ marta berilgan
    va ≤20% to'g'ri javob olgan savol alohida flag qilinadi.
  → Ko'rsatkichlar `perQuestion[]` dan, ya'ni baholash paytida
    yozilganidan hisoblanadi — hozirgi savoldan qayta hisoblanmaydi.
    Javob kalitini tuzatgan muallif hammaning o'tmishini qayta
    yozmasligi kerak.
  → Editor 14 turni bitta komponentda boshqaradi: hammasi kichik
    ro'yxatni tahrirlab, uning bir qismini «to'g'ri» deb belgilaydi;
    farq faqat qaysi qismida, va bu bitta `switch` ga sig'adi.
  → Tur o'zgarganda payload **noldan** yaratiladi, birlashtirilmaydi —
    aks holda `MATCHING` savol ustida eski `options` massivi qolib
    ketardi.
  → Variant `id` lari qayta raqamlanmaydi: attempt'dagi javob shu id ga
    ishora qiladi, va tartibni o'zgartirish o'tmishdagi javobni boshqa
    variantga ko'chirib yuborardi.
  → O'chirish qoidalari: test topshirilgan bo'lsa o'chirilmaydi (bu
    urinishlar majburiy kursni o'tganlik yozuvi), savol test unga
    to'g'ridan-to'g'ri ishora qilsa o'chirilmaydi (pool boshqa gap —
    undan bitta savol kamaysa hech narsa buzilmaydi).
  → Video quiz endi sessiya oladi: birlashgan modelda `scope: VIDEO`
    ham xuddi `TOPIC` kabi `TestSession` orqali o'tadi, ya'ni taymer va
    focus-loss ikkalasida ham ishlaydi. Test buni tekshiradi: deadline
    server tomonda muhrlanadi, reload uni yangilamaydi, limitdan oshgan
    focus-loss sessiyani yopadi va urinishni **0 ball bilan yozadi**
    (aks holda testni boshlab, tab almashtirib, bepul qaytadan boshlash
    mumkin bo'lardi).

---

## BLOK 5 — Learning path va onboarding (4 hafta)

- [x] **5.1** **Learning path**
  · `models/learningPath.model.js`, `pathEnrollment.model.js`
  · `services/paths/pathSequence.js` — `courseSequence.js` naqshi
  · `services/courses/courseVisibility.js` → umumiy `isVisibleToActor(actor, doc)`
  · Qabul: **AT-26, AT-27**
  → AT-26 — bu **chetlab o'tish** testi: qulf faqat video baytlari
    beriladigan joyda tursa haqiqiy. Yon paneldagi kulrang qator —
    bezak, URL yozib o'tib ketiladi. Shuning uchun tekshiruv
    `videoAccess` da, token muhrlanishidan oldin. Path qulfi kurs
    qulfidan **oldin** tekshiriladi: «oldingi kursni tugating» —
    ochilishi kerak bo'lmagan kursning «oldingi darsini tugating»idan
    foydaliroq javob.
  → Faqat **o'zi yozilgan** path'lar tekshiriladi. Boshqa birovning
    dasturida uchraydigan kurs uni qulflab qo'ymasligi kerak.
  → AT-27 — foiz faqat **majburiy** elementlar ustidan hisoblanadi.
    Ixtiyoriyni sanash majburiy kursni tashlab 100% ga chiqishga yo'l
    ochardi; maxrajda qoldirish esa hammasini bajargan odamni abadiy
    60% da ushlab turardi.
  → Bo'sh path ham, faqat ixtiyoriy elementlardan iborat path ham
    «tugagan» emas — aks holda hech narsa uchun sertifikat berilardi.
  → Ko'rinish qoidasi `services/access/visibility.js` ga chiqarildi.
    Path ham aynan o'sha uchta maydonni o'qiydi, va ikkinchi nusxa —
    ular bo'sh `branches` massivi nimani anglatishi haqida
    kelishmovchilikka tushadigan yo'l (bir tomoni hammadan yashiradi,
    ikkinchisi hammaga ko'rsatadi).
  → Path'ga yozilish uning kurslarini ham tayinlaydi: aks holda path —
    o'quvchi ocholmaydigan ro'yxat.
  → Sertifikat navbati endi `sourceType` ni oladi (`COURSE|PATH`), va
    `certificateService.issueForPath` qo'shildi. Eski relizdan Redis'da
    qolgan job'lar hamon `courseId` ni tashiydi — worker ikkalasini ham
    o'qiydi, navbat bo'shaguncha.
  → Kurs tugaganda uni o'z ichiga olgan path'lar **o'sha so'rovda**
    qayta hisoblanadi — sahifa ochilishini kutmaydi.

- [x] **5.2** **Path UI** — `PathsView`, `PathDetailView`, `PathsListView`, `PathBuilderView`
  → 5.1 da endpoint yo'q edi (faqat modellar va qoidalar), shuning uchun
    `routes/v1/paths.routes.js` shu bandda qo'shildi: katalog, detal,
    o'zi yozilish, tayinlash, CRUD va progress jadvali.
  → Qulf holati **server**dan keladi va sahifada ko'rsatiladi. Sabab —
    qulfning o'zi serverda (AT-26), lekin uni ekranda ko'rsatmaslik
    odamni 403 ga borib urilishga majbur qilardi. Ya'ni bu ikki xil
    qulf emas, bitta qulfning ko'rinadigan tomoni.
  → O'chirilgan kurs bosqichda **«yo'q» deb ko'rsatiladi**, jimgina
    tashlab yuborilmaydi: administrator teshikni ko'rishi kerak.
  → Bosqichlar tartibi saqlashda massiv pozitsiyasidan qayta yoziladi.
    Eski `order` qiymatlarini yuborish serverni ekranda ko'rinmaydigan
    raqamlar bo'yicha tartiblashga qoldirardi.
  → Path elementlari o'zgarsa, unga yozilgan **hamma** qayta hisoblanadi
    — «tugagan» ta'rifi o'zgargani uchun (AT-04 bilan bir xil sabab).
  → Path o'chirilganda yozilishlar saqlanadi: martda tugatgan odamning
    sertifikati bor, va compliance hisoboti uni yozilishdan tushuntiradi.

- [x] **5.3** **Enrollment rules** — `models/enrollmentRule.model.js`,
  `jobs/enrollmentRuleQueue.js` (user create/update + kunlik)
  → Qoida **faqat qo'shadi**. Kimdir mos kelmay qolsa (bo'limi
    o'zgardi), kurslari **tortib olinmaydi**: u kursning yarmiga yetgan
    bo'lishi mumkin, va o'qishni bekor qilish fonda ishlaydigan job
    qabul qiladigan qaror emas — bu ataylab qilinadigan, audit'ga
    yoziladigan amal.
  → Idempotent bo'lishi shart, chunki kechayu-kunduzgi sweep har bir
    qoidani har bir mos odamga qayta qo'llaydi. «Allaqachon tayinlangan»
    — no-op, **deadline ham qayta yozilmaydi**: aks holda muddat har
    kuni oldinga surilib ketardi.
  → Bo'sh `match` **rad etiladi**. U butun kompaniyaga qo'llanardi —
    ba'zan kerak, lekin hech qachon tasodifan emas.
  → Qoida `active: false` bilan yaratiladi. Saqlangan zahoti yuzlab
    odamga kurs tayinlaydigan narsa tasodifan yoqiladigan bo'lmasligi
    kerak; yoqilganda esa darhol qo'llanadi (sweep kutilmaydi).
  → `assignedBy` — qoidani **yozgan odam**, `null` emas. U qoidani
    yaratib va yoqib, bu tayinlovlarga ruxsat bergan; muallifi yo'q
    tayinlovni bir yildan keyin audit tushuntirib berolmaydi.
  → Foydalanuvchi o'zgarganda faqat qoida mos keladigan **to'rt maydon**
    (`roleId`, `department`, `branch`, `position`) o'zgargan bo'lsa
    navbatga qo'yiladi — telefon raqami tahriri uchun job kerak emas.
  → `preview` — quruq yurgizish: to'rt yuz odamni qamrab olishini
    tayinlashdan **oldin** bilish kerak (import sehrgaridagi kabi).

- [x] **5.4** **Onboarding**
  · `models/onboardingProgram.model.js`, `onboardingEnrollment.model.js`
  · `jobs/onboardingQueue.js` — `hireDate` bo'yicha avtomatik boshlash
  · `Task` fan-out (`audienceType`, `batchId`) qadamlar uchun qayta ishlatiladi
  → Nega path emas: path — kurslar ketma-ketligi, onboarding esa
    **qilinishi kerak bo'lgan ishlar** ketma-ketligi, va ularning faqat
    bir qismi kurs. «Noutbukni olib keling» uchun kurs o'ylab topish
    kerak bo'lardi, shuning uchun alohida model va turlangan qadamlar.
  → «Bajarildi» har turda boshqacha, va bu ataylab: `COURSE` — o'quvchi
    kursni tugatgani bilan **o'z-o'zidan** belgilanadi (hech kim qaytib
    kelib belgilashi shart emas); `TASK` — haqiqiy `Task` hujjati,
    broadcast'dagi o'sha `audienceType`/`batchId` bilan, ya'ni odamning
    oddiy vazifalar ro'yxatida o'z muddati va eslatmalari bilan turadi;
    `MANUAL` — shunchaki belgilash.
  → Egalik (`ownerRole`) muhim: yangi xodim «IT hisob ochildi»ni
    belgilay olmaydi. Belgilashga ruxsat berish — ro'yxatni
    afsonaga aylantiradigan yo'l. Test buni tekshiradi (`NOT_STEP_OWNER`).
  → Muddat **ishga kirgan sanadan** hisoblanadi, job ishlagan kundan
    emas: bir hafta kech kiritilgan odam jimgina bir hafta ko'proq vaqt
    olmasligi kerak. `dueAt` bir marta muhrlanadi — o'qishda qayta
    hisoblash dasturni tahrirlaganda hammaning, hatto oylar oldin
    tugatganlarning ham muddatini surib yuborardi.
  → `managerId` yozilishga **ko'chiriladi**: ro'yxat egasi — birinchi kuni
    kim rahbar bo'lsa o'sha; uchinchi haftadagi qayta tashkil etish uni
    egasiz qoldirmasligi kerak.
  → Dastur `DRAFT` va `autoStart: false` bilan yaratiladi (enrollment
    rule bilan bir xil sabab).
  → Bitta qadam yaratilmasa (masalan kurs o'chirilgan), qolganlari
    baribir yaratiladi — bitta xato butun birinchi haftani tashlab
    ketmasligi kerak.

- [x] **5.5** **Dinamik guruhlar** — `group.type`, `group.rule{}`
  → Qo'lda yuritiladigan «Mehnat bo'limidagilar hammasi» ro'yxati bir
    hafta ichida noto'g'ri bo'lib qoladi — kimdir ko'chadi, guruhni esa
    hech kim eslamaydi. Qoida sifatida u konstruksiya bo'yicha to'g'ri;
    narxi — `memberIds` keshga aylanadi va odamlar o'zgarganda qayta
    qurilishi kerak.
  → Kesh saqlanadi (har o'qishda hisoblanmaydi), chunki `memberIds` ni
    platformaning qolgan qismi allaqachon o'qiydi: enrollment rules,
    guruhga kurs berish, chat auditoriyasi. Ularning hammasini qoidani
    yechishga o'tkazish dinamik guruhni hamma joyda statikdan boshqacha
    tutardi.
  → Dinamik guruhga qo'lda a'zo qo'shish **rad etiladi**, keyin
    «qaytarilmaydi»: ruxsat berilsa, qo'shilgan odam keyingi refresh'da
    izsiz yo'qolardi va buni qo'shgan odam bilmay qolardi
    (`GROUP_IS_DYNAMIC`).
  → So'rov `type: 'DYNAMIC'` bo'yicha, `$ne: 'STATIC'` emas: 5.5 dan
    oldin yaratilgan guruhlarda `type` maydoni **umuman yo'q**, va
    inkorli so'rov ularni ham qamrab olib, qo'lda yig'ilgan a'zolikni
    bo'shatib yuborardi. Test aynan shuni tekshiradi (M3 dagi tuzoqning
    aynan o'zi).
  → Qoida o'zgarsa a'zolik **o'sha so'rovda** qayta quriladi — aks holda
    hozirgina tahrirlagan odam eski ro'yxatni ko'rib, yana tahrirlardi.
  → Foydalanuvchi o'zgarganda faqat **javobi o'zgargan** guruhlar qayta
    quriladi, va bu mavjud per-user job'ga ulandi (trigger aynan bir xil
    to'rt maydon). Ikkinchi navbat bir xil odamni o'qish uchun poyga
    qilardi.
  → Yon ta'sir: `test/quizMigration.test.js` da global `Question`
    sanog'i bor edi — test fayllari parallel ishlaydi va boshqalari
    ham savol yaratadi. Sanoq shu testning o'z bankiga toraytirildi.

---

## BLOK 6 — Live training, kalendar, topshiriq (3 hafta)

- [x] **6.1** **Tadbir kengaytmasi**
  · `models/event.model.js` — `+mode, trainerIds[], capacity, registeredCount,
  meeting{}, remindBeforeMinutes[], linkedCourseId, requiresRegistration, status`
  · `models/eventRegistration.model.js`, Migratsiya **M6**
  · Qabul: **AT-31**
  → `participants` **qoladi** va endi u — taklif ro'yxati, ro'yxatdan
    o'tganlar ro'yxati emas. Taklif qilingan bo'lish va joy egallash —
    ikki xil fakt; ularni chalkashtirish sig'imni majburlab
    bo'lmaydigan qiladi.
  → Har odam uchun alohida yozuv (`eventRegistration`), massiv emas:
    kim keldi, kim navbatda nechanchi, kim belgiladi — massiv bularning
    hech birini ko'tarolmaydi, navbatga esa tartib kerak.
  → Butun xususiyat bitta savolda: xona 10 kishilik bo'lsa, 11-odam
    nima bo'ladi. Rad etish — u kelmoqchi ekanini yo'qotadi; kiritish —
    xonani to'ldiradi. Shuning uchun navbat, va navbat **o'zi
    siljiydi**: kimdir bekor qilishi bilan birinchi odam ko'tariladi.
    Kechqurun ishlaydigan job'ga qoldirilsa, soat 09:00 da bo'shagan
    joy kun bo'yi bo'sh turardi.
  → `registeredCount` — katalog uchun kesh, oshirilmaydi balki har
    o'zgarishdan keyin yozuvlardan **qayta hisoblanadi**, ya'ni ko'pi
    bilan bitta yozuvga adashadi.
  → Davomat belgilash joy **bo'shatmaydi**: tadbir o'tib bo'lgan, va
    tugagan sessiyaga navbatdan odam ko'tarish bema'nilik.
  → Meeting **passcode** faqat joyi borlarga va tashkilotchiga
    beriladi. Katalog javobidagi passcode — sahifani ochgan har bir
    brauzerdagi passcode, jumladan kiritilmaganlarniki.
  → M6 ikki qismdan: `$exists:false` backfill (M3 dagi bilan bir xil
    sabab) va `participants` ni ro'yxatdan o'tish yozuvlariga
    aylantirish. Ular `REGISTERED` qilib yoziladi, sig'imga qaramay:
    o'sha paytda navbat degan narsa yo'q edi, va orqaga qarab navbat
    o'ylab topish odamga o'zi qatnashgan joyni yo'qotgandek qilib
    ko'rsatardi.
  → Yo'l-yo'lakay topildi: `EVENT_CANCELLED` va `EVENT_RESCHEDULED`
    shablonlari **allaqachon bor ekan** — men dublikat qo'shib
    yuborgandim (object literal'da keyingisi yutadi). Dublikatlar
    olib tashlandi, mavjudlari qoldi; ular `startsAt`/`previousStartsAt`
    placeholder'larini ishlatadi, 6.2 da shuni hisobga olish kerak.

- [x] **6.2** **Tadbir bildirishnomalari** — `event.service.js` ga `notify()`
  (yaratildi / o'zgardi / bekor qilindi / eslatma / waitlist ko'tarildi)
  · Qabul: **AT-32**
  → Auditoriya — `REGISTERED` **va** `WAITLIST`. Navbatdagini tashlab
    ketish — ko'rinishidan to'g'ri, aslida xato: payshanbaga navbatda
    turgan odam payshanbasini shunga moslab qo'ygan, va dushanbaga
    ko'chirilgan sessiya unga ham xuddi shunday tegishli.
  → `EVENT_CANCELLED` va `EVENT_RESCHEDULED` **majburiy** turlar (§9.3,
    allaqachon ro'yxatda edi): tadbir bildirishnomalarini o'chirgan odam
    ham oladi. Nosozlik ssenariysi — bo'lmaydigan sessiyaga yo'lga
    chiqish.
  → Bekor qilish ko'chirishdan **ustun**: «vaqti o'zgardi» va keyin
    «bo'lmaydi» — bitta tadbir haqidagi ikkita qarama-qarshi xabar.
  → Ko'chirilganda `remindersSentFor` **tozalanadi**: seshanbadan
    jumaga ko'chgan tadbir qaytadan eslatishi kerak, dedup markerlari
    esa «allaqachon eslatgan» derdi.
  → Eslatmalar alohida navbat olmadi, mavjud 15 daqiqalik deadline
    sweep'iga ulandi — u allaqachon kerakli aniqlikda ishlaydi, va
    ikkinchi scheduler umumiy 1.9 GB serverni o'z jadvali bo'yicha
    uyg'otadigan yana bitta job bo'lardi.
  → Eng katta offset birinchi tekshiriladi: o'zining 24 soatlik oynasi
    ichida yaratilgan tadbir 1440-eslatmani **hozir** yuboradi, 60 ga
    yetguncha kutmaydi.
  → `minutesBefore` shablonga uzatilmaydi: `EVENT_REMINDER` ning
    placeholder allowlist'ida u yo'q, va render allowlist'dan tashqari
    placeholder'ni rad etadi. Offset **qachon** yuborilishini
    belgilaydi, matnni emas.

- [x] **6.3** **Tadbir UI** — `EventDetailView` (xodim, ro'yxatdan o'tish),
  `EventsAdminView` (davomat). ⚠️ `PATCH`/`DELETE /events/:id` API **allaqachon bor**, UI yo'q (§1.14)
  → §1.14 dagi qarz yopildi: tahrirlash formasi bu sahifaning davomat
    varaqasi kabi asosiy qismi — tadbirni yaratib, keyin **hech qachon
    tuzatib bo'lmasligi** aynan shundan edi.
  → Navbatdagiga «siz navbatdasiz» emas, «siz **3-o'rindasiz**» deyiladi.
    Birinchisi qaror qabul qilib bo'lmaydigan ma'lumot.
  → Ro'yxatdan o'tish tugmasi joy bor-yo'qligini o'zi hal qilmaydi —
    javobni **server** beradi: sahifa ochilgandan beri xona to'lgan
    bo'lishi mumkin.
  → Davomat varaqasida faqat **joyi bo'lganlar** belgilanadi. Navbatda
    turgan odam ichkariga kiritilmagan, uni «kelmadi» deb yozish soxta
    yozuv bo'lardi.
  → Varaqa ochilganda allaqachon yozilgan holatdan to'ldiriladi, aks
    holda qayta ochish hammani jimgina «kelmadi» ga tushirardi.
  → Vaqt tanlagichga ISO satr emas, **lokal** «YYYY-MM-DDTHH:mm»
    beriladi: `Z` bilan ISO lokal deb o'qilib, tadbirni ofset chamasi
    surib yuborardi.

- [x] **6.4** **Yagona kalendar** — `services/calendar/calendar.service.js`
  (tadbir + kurs deadline + topshiriq + path), `GET /calendar`, `.ics`
  → To'rtta kolleksiyadan bitta ko'rinish. Xodimning majburiyatlari
    tarqoq: mashg'ulot `events` da, kurs muddati tayinlovda, vazifa
    vazifada, dastur muddati yozilishda — to'rt ekran, ya'ni birortasini
    o'tkazib yuborishning to'rtta imkoni.
  → Servis **hech narsa yozmaydi**. Kalendar yozuvi — o'zi kelib
    chiqqan narsaning ko'rinishi; kurs muddatini surish — tayinlov
    ustidagi amal, kalendar ustidagi emas.
  → Navbatdagi joy ham kalendarda, lekin **belgilangan holda**: faqat
    navbatda turgan narsangga borib qolish — aynan shu oldini oladigan
    xato.
  → Muddatlar **kun bo'yi** (`VALUE=DATE`), moment emas: «juma kuni»
    tugaydigan kurs 23:59 ga qadalsa, Outlook'da kechki uchrashuv bo'lib
    ko'rinadi.
  → `.ics` da vergul va nuqtali vergul — maydon ajratgichlari.
    Ekranlanmasa, ichida vergul bor kurs nomi yozuvni **jimgina kesib
    tashlaydi** (xato bermaydi). Qatorlar 75 oktetda buklanadi, satr
    oxiri CRLF — ba'zi parserlar aks holda faylni butunlay rad etadi.
  → `UID` barqaror: qayta import qilinganda mijoz mavjud yozuvni
    yangilaydi, ikkinchi nusxa qo'shmaydi.
  → **Cheklov:** hozircha `.ics` — yuklab olish, obuna emas. Obuna
    bo'ladigan havola URL ichida uzoq muddatli token talab qiladi, va
    odamning butun kalendarini ko'rsatadigan havolani **bekor qilish**
    yo'li ham kerak. Uni shu endpoint'ning yon ta'siri sifatida emas,
    alohida qilish to'g'ri.

- [x] **6.5** **Uy vazifasi (Assignment)**
  · `models/assignment.model.js`, `submission.model.js`, `rubric.model.js`
  · `services/assignments/*`, baholash navbati UI
  → Uchta narsa «assignment» deb ataladi va ular **boshqa-boshqa**:
    `Assignment` (uy vazifasi), `CourseAssignment` (kurs odamga
    berilgani), `Task` (topshiriq). Izoh `assignment.model.js` da —
    hech kim ochmaydigan hujjatda emas. API yo'li ham shu sabab
    `/homework`.
  → Har urinish **alohida yozuv**: tekshiruvchi qaytaradi, o'quvchi
    tuzatadi — bu normal sikl, va birinchi urinishning ustiga yozish
    ham nima xato bo'lganini, ham tuzatilganini yo'qotadi.
  → Kechikish **bir marta**, topshirish paytida hal qilinadi. O'qishda
    qayta hisoblansa, muddatni keyin uzaytirish hammaning ishini
    «kechikmagan» qilib qo'yardi, qisqartirish esa o'z vaqtida
    topshirilganini kechikkan qilardi — ikkalasi ham o'tmish haqidagi
    faktni kelajakni tahrirlab o'zgartirish.
  → Qayta topshirish avvalgi **hukmni tozalaydi**: o'sha ball hozirgina
    almashtirilgan ishga tegishli edi.
  → Qoralama urinish sifatida sanalmaydi (aks holda ishini saqlagani
    uchun jazolangan bo'lardi) va tekshirish navbatida **ko'rinmaydi**
    (tugallanmagan ishni baholash).
  → Ball rubrikadan **hosil qilinadi**, alohida raqamdan emas: o'zi
    tuzilgan mezonlarga qarama-qarshi jami — o'quvchining bahoga
    ishonchini yo'qotishning eng tez yo'li.
  → «Qaytarish» va «baholash» — ikki xil holat. `GRADED` ko'rgan odam
    buni yakuniy deb o'ylaydi; `RETURNED` esa qiladigan ish borligini
    aytadi.
  → Navbat **eng eskisi birinchi**. Yangisi birinchi bo'lsa, eng eski
    ish abadiy kutadi — va aynan uning muallifi ballini ikki marta
    so'ragan bo'ladi.
  → ⚠️ Yo'l-yo'lakay: `routes/v1/assignments.routes.js` ni
    **ustiga yozib yuborgandim** (u allaqachon bor edi —
    `courseAssignment` PATCH/DELETE uchun). Server ishga tushmay
    qoldi, xato shundan topildi; asl fayl `ada315f` dan tiklandi,
    homework esa `homework.routes.js` ga ko'chirildi.

---

## BLOK 7 — Qidiruv, KB, compliance, gamification (4 hafta)

- [x] **7.1** **Global qidiruv** — `$text` indekslar (`courses`, `users`,
  `kbArticles`), `services/search/globalSearch.service.js` (kirish huquqi
  bo'yicha filtr), `ui/CommandPalette.vue`
  · Qabul: **AT-24**
  → Qidiruv natijasi **o'zi ham sizib chiqish**: ro'yxatdagi «Maxfiy
    strategiya» xodimga kurs borligini, taxminan nima haqidaligini va
    kimlar uchunligini aytadi — u kursni ochmasdan ham. Shuning uchun
    AT-24 detal sahifasini yashirishdan qattiqroq.
  → Filtr **so'rovdan keyin, har qator uchun** qo'llanadi va kataloglar
    ishlatadigan **aynan o'sha funksiyalarni** chaqiradi
    (`isCourseVisibleToActor`, `isVisibleToActor`). So'rov ichida
    filtrlash — ko'rinish qoidasining ikkinchi implementatsiyasi, va
    ular vaqt o'tib bir-biridan uzoqlashadi; o'shanda qidiruv qutisi
    to'siqni aylanib o'tish yo'liga aylanadi.
  → Shu sabab `limit × 4` olib kelinadi: ko'rinish tekshiruvi qatorlarni
    tashlaydi, aniq `limit` so'ralsa, o'ntadan yettitasi filtrlanib,
    uchtasi qaytardi.
  → `$text` emas, substring: command palette harf-harf yoziladi, to'liq
    matn indeksi esa butun so'zga mos keladi — «mehn» hech narsa
    topmasdi.
  → Odamlar bo'yicha **ikkita** to'siq: `user:read` huquqi «umuman
    qidira oladimi» degan savolga, scope esa «kimlarni» degan savolga
    javob beradi — TEAM scope'li rahbar familiya yozib butun
    kompaniyani ochib olmasligi kerak (2.2).
  → **JSHSHIR va pasport bo'yicha qidirilmaydi.** Ular identifikator,
    qidiruv atamasi emas; ular bo'yicha moslashtirish palette'ni
    birovning JSHSHIR'ini bittalab taxmin qilib tasdiqlash vositasiga
    aylantirardi.
  → AT-25 ham shu yerda tekshiriladi: `(a+)+$` literal matn sifatida
    qaraladi (`escapeRegex`), 2 soniyadan kam vaqtda bo'sh natija.

- [x] **7.2** **Knowledge base** — `kbCategory`, `kbArticle`, `kbArticleVersion`,
  `kbView`, `kbComment`; `sanitize-html` allowlist; `NewsView` naqshi analitika uchun
  → **Tartib o'zgartirildi:** 7.2 dan boshlandi, 7.1 dan emas. Global
    qidiruv `kbArticles` ustidan ham ishlashi kerak, ya'ni 7.1 ni oldin
    qilsak, qidiruvni ikki marta yozishga to'g'ri kelardi.
  → Nega bu yerda HTML: news ataylab **oddiy matn** (shuning uchun
    sanitizatsiya kerak emas edi), lekin sarlavha, ro'yxat va jadval
    kerak bo'ladigan protsedurani oddiy matnda yozdirish — tirelardan
    iborat devor. HTML tanlangani sanitizatsiyani **majburiy** qiladi:
    kontent `v-html` bilan qaytariladi, ya'ni server qabul qilgan narsani
    har bir o'quvchining brauzeri bajaradi.
  → **Allowlist, blocklist emas.** Blocklist — kimdir o'ylab topgan
    hujumlar ro'yxati; qolgani (yangi atribut, SVG handler, `data:` URL)
    o'tib ketaveradi. Allowlist teskarisi: ro'yxatda yo'q narsa
    tashlanadi, ya'ni noma'lum usul **avtomatik** rad etiladi.
  → `style` atributi ham taqiqlangan: u butun sahifani qoplaydigan
    qatlam yoki soxta dialog chizishning odatiy yo'li.
  → Havolalar muallif nima yozganidan qat'i nazar `target="_blank"` va
    `rel="noopener noreferrer"` bilan majburlanadi.
  → `bodyText` — markup'siz nusxa, matn indeksi uchun. HTML'ni
    indekslash `<strong>` ni so'z deb hisoblaydi va teg chegarasidan
    bo'lingan iborani topolmaydi.
  → Ko'rinmaydigan maqola **404**, 403 emas: 403 maqola borligini
    tasdiqlaydi — sarlavhani yashirishdan maqsad aynan shu edi (AT-24
    qoidasi bir daraja pastda).
  → Ko'rish bir marta sanaladi (qayta ochish — o'sha odam), «foydali
    bo'ldimi» esa javobni **almashtiradi**, ustiga qo'shmaydi.
  → Versiya **kontentni** kuzatadi: teg qo'shish protsedura'ning yangi
    versiyasi emas.

- [x] **7.3** **Compliance** — `models/recurringAssignment.model.js`,
  `jobs/complianceQueue.js`, `ComplianceView` (kurs × xodim matritsasi)
  · Qabul: **AT-34**
  → Sikl **har odam uchun alohida**, uning o'z tugatgan sanasidan
    hisoblanadi. Umumiy kompaniya sanasi bo'lsa, o'tgan hafta tugatgan
    odam ham yanvarda «muddati keldi» bo'lardi — bu ham noto'g'ri, ham
    compliance jadvallarining tashlab yuborilish sababi.
  → Sweep faqat **qo'shadi**. U hech kimni «nomuvofiq» deb belgilamaydi,
    sertifikat olib qo'ymaydi, tayinlovni yopmaydi: avtomatik compliance
    tizimining nosozlik ssenariysi — u jimgina kimnidir eskirgan deb
    hal qiladi, odam esa buni auditordan eshitadi.
  → Allaqachon `ACTIVE` bo'lganga tegilmaydi: qayta tayinlash muddatini
    nolga qaytarardi va platforma progressni yo'qotgandek ko'rinardi.
  → Tugatgan sana `completedAt` dan, u bo'lmasa **sertifikat berilgan
    sanadan** o'qiladi — platforma tayinlovlarni kuzatishdan oldin
    o'tilgan o'qishlar shu tarzda hisobga olinadi.
  → Oy oxiri sanasi **surilib ketmaydi**: 31-yanvar + 1 oy sukut
    bo'yicha 3-mart bo'ladi, ya'ni yillik sikl har qisqa oydan
    o'tganda ikki kunga oldinga siljirdi.
  → Matritsada har katak holat **va sanani** tashiydi: «DUE» yonida
    «qachondan» bo'lmasa, bu hech kim qila olmaydigan qizil kvadrat.
  → Qoida qo'llanmaydigan odam `NOT_APPLICABLE` — «muvofiq» emas. Uni
    yashil qilish qamrovni oshirib ko'rsatardi. Hech qanday qoida
    tegishli bo'lmagan odam matritsadan **umuman chiqarib tashlanadi**:
    yuzta kulrang qator muhimlarini yashiradi.
  → Qoida `active: false` bilan yaratiladi (enrollment rule va
    onboarding dasturi bilan bir xil sabab).

- [x] **7.4** **Badge dvigateli** — `models/badge.model.js`, `userBadge.model.js`,
  `services/gamification/badge.service.js` (criteria + notify), Migratsiya **M7**
  · `badgeDefinitions.js` seed'ga aylanadi
  → Ilgari nishon — har o'qishda qayta hisoblanadigan qattiq kodlangan
    qoida edi. Ikki muammosi keyin chiqadi: yangi nishon uchun deploy
    kerak, va **qachon** olingani hech qayerda yozilmaydi — ya'ni uni
    e'lon qilib bo'lmaydi, timeline'da ko'rsatib bo'lmaydi, va umumiy
    ko'rsatkich tushib ketsa u jimgina yo'qoladi.
  → Shuning uchun berish **bir tomonlama va yozib qo'yiladi**: nishon —
    biror narsa sodir bo'lganining yozuvi, hozirgi holatni aks ettiruvchi
    status emas. Ball tuzatilsa ham qaytarib olinmaydi.
  → `criteria` — funksiya emas, **e'lon qilingan qoida**: funksiyani
    saqlab ham, administrator yozib ham bo'lmaydi. Metrikalar to'plami
    ataylab kichik va yopiq — bu yerda ifoda tili hech kim tekshira
    olmaydigan ikkinchi, yomonroq so'rov dvigateli bo'lardi.
  → M7 beshta kod-nishonni **kodini saqlab** hujjatga aylantiradi
    (klient sarlavha va ikonkani koddan oladi) va allaqachon loyiq
    bo'lganlarga beradi — aks holda deploy kunida hamma nishonini
    yo'qotardi. Backfill'da bildirishnoma **o'chirilgan**: to'rt yuz
    odamga oylardan beri egalik qilgan nishoni haqida xabar yuborish —
    to'rt yuzta shovqin.
  → 🔴 **Yo'l-yo'lakay topilgan prod xatosi:** `pointsLedger` dagi
    ikkita unique indeks `sparse` deb e'lon qilingan edi. **Compound
    indeksda `sparse` faqat barcha maydonlar yo'q bo'lsa hujjatni
    o'tkazib yuboradi**, `userId` esa doim bor — va `assessmentId`
    yo'qligi emas, `null` bo'lgani uchun bir odamning ikkita video
    yozuvi ham `{userId, assessmentId: null}` deb indekslanib to'qnashardi.
    `pointsService.award` duplicate-key'ni «allaqachon to'langan» deb
    yutadi, ya'ni **birinchi videodan keyin har bir ball jimgina
    yo'qolardi** — odam boshiga bitta video va bitta assessment, umrbod.
    `partialFilterExpression` ga o'tkazildi
    (`migrate:points-indexes` mavjud bazalarda eski indekslarni
    almashtiradi), va uchta regressiya testi qo'shildi.

- [x] **7.5** **Material yuklab olish nazorati** — `material.allowDownload`;
  `getDownloadUrl` 403; `openStream` **allaqachon tayyor** (§1.1)
  · Qabul: **AT-33**
  → Bu **DRM emas**, va kodda ham shunday yozilgan. U yuklab olish
    tugmasini olib tashlaydi va `attachment` URL'ini rad etadi; faylni
    o'qiy oladigan odamning uni saqlab qolishini to'xtata olmaydi —
    skrinshot, brauzer keshi va telefon kamerasi joyida. Qiladigan
    ishi: «iltimos, tarqatmang» ni tavsifdagi eslatma emas, majburlangan
    sukut holatiga aylantirish.
  → `inline` baribir beriladi. Sabab aniq: pleyerda faqat **audio**
    presigned URL ishlatadi (PDF/docx/xlsx `/content` orqali oqadi), va
    cheklangan yozuv ham eshitilishi kerak. `<audio src>` esa
    Authorization sarlavhasini yubormaydi, ya'ni proksi yo'l unga
    yaramaydi.
  → Xodimlar (course:create) uchun istisno: faylni yuklagan odam uni
    qaytarib ololishi kerak — bayroqni ham o'sha qo'ygan.
  → Default `true`. Teskarisi mavjud har bir hujjatni jimgina
    qulflardi. DTO ham `!== false` deb o'qiydi: 7.5 dan oldin
    yuklangan materialda maydon **umuman yo'q**, va `undefined` ni
    `false` deb o'qish o'sha hujjatlarning tugmasini yashirardi.
  → Multipart hamma narsani satr qilib yuboradi — `"false"` esa
    truthy. Validator uni `z.union([boolean, 'true'|'false'])` bilan
    aylantiradi; buni controller'da qilib esdan chiqarish har bir
    cheklangan yuklamani jimgina ochiq qilardi.

- [x] **7.6** **Settings modeli** — `models/settings.model.js` (singleton),
  `attentionPolicy`/`facePolicy` dagi **GLOBAL→COURSE meros naqshini
  umumlashtirish** (§1.8), branding, Redis kesh
  → Naqsh `packages/shared/src/layeredSettings.js` ga chiqarildi:
    `resolveLayered`, `pickStoredLayer`, `splitLayerPatch`. Uchta joyda
    bir xil sakkiz qator bor edi va ular **kelishardi** — aynan shuning
    uchun birlashtirishga arziydi: keyingisi xotiradan yozilardi, va
    qiziq savolning (`false` — «o'chirilgan»mi yoki «meros»mi?) faqat
    bitta to'g'ri javobi bor.
  → `null`/`undefined` — meros; `false` va `0` — **haqiqiy qiymatlar**
    va pastdagi qatlamni bosadi. Tekshiruvni o'chirgan kurs uni global
    siyosatdan jimgina qaytarib olmasligi kerak. Test ikkala yo'nalishni
    ham tekshiradi.
  → Settings — **singleton** (`_id: 'global'`), key/value jadval emas:
    sozlamalar birga o'qiladi, bitta ekrandan yoziladi, va bo'sh
    kalitlar jadvali «nima sozlanadi» degan savolni koddan javob berib
    bo'lmaydigan qiladi.
  → 🔒 **Bu hujjatda sir saqlanmaydi.** SMTP paroli, S3 kaliti, JWT
    secret, API token — hammasi environment'da qoladi. Bu hujjatni admin
    ekrani o'qiydi, har bir backup'ga tushadi va API qaytaradi — bular
    credential turmasligi kerak bo'lgan uchta joy. Bu yerda sozlamaning
    **shakli** turadi («pochta yoqilgan, mana shu manzildan»), uni
    autentifikatsiya qiladigan narsa emas. Test buni majburlaydi: har bir
    maydon nomining oxiri `password|secret|token|apikey|credential|
    privatekey` bo'lsa yiqiladi.
  → Kesh 60 soniya, kurs metadatasidagi 5 daqiqa emas: kompaniya nomini
    o'zgartirgan administrator uni **darhol** ko'rishni kutadi; besh
    daqiqa kutish — «saqlash tugmasi ishlamayapti» degan xulosaga
    olib boradigan yo'l. Yozuvda kesh bekor qilinadi.
  → Patch **bo'lim-bo'lim** birlashtiriladi: ikki ekrandagi ikki
    administrator bir-birining aloqasiz bo'limini bosib ketmasligi kerak,
    va yuborilmagan maydon «tegmang» degani, «tozalang» emas.
  → Audit log **qaysi maydonlar** o'zgarganini yozadi, qiymatlarini emas:
    sozlama diff'i ertami-kechmi log'ga tushmasligi kerak bo'lgan narsani
    olib kelardi.
  → `GET /settings/public` — yagona token'siz bo'lim (branding + til):
    login sahifasiga kompaniya nomi va logotipi kerak, unda esa hali
    hech kim kirmagan.

---

## BLOK 8 — Hisobot, analitika (3 hafta)

- [x] **8.1** **17 yangi hisobot turi** — `reportData.service.js` builders
  → 17 ta qo'shildi, jami **22** ta: sertifikatlar reyestri, yo'nalish
    progressi, test natijalari, savol qiyinligi, compliance holati,
    adaptatsiya, tadbir davomati, uy vazifalari, yetkazish jurnali, KB
    statistikasi, guruh/bo'lim progressi, muddati o'tganlar, tayinlovlar
    auditi, nishonlar, kirish faoliyati, materiallardan foydalanish.
  → Umumiy yordamchilar `reportHelpers.js` ga chiqarildi. Nusxalash oson
    yo'l va noto'g'ri yo'l edi: `intersectIds` — bu **kirish to'sig'i**,
    va to'siqning ikkita nusxasi — ertami-kechmi noto'g'ri bo'ladigan
    bitta nusxa.
  → Test har bir builder'ni alohida emas, **shartnomani** tekshiradi:
    (a) hammasi `totalRows` va `truncated` qaytaradi — buni unutgan
    builder AT-22 tuzatgan xatoni o'z hisoboti uchun qaytarib keladi;
    (b) hammasi tarjima qilingan sarlavha beradi, kalit emas;
    (c) **bo'sh scope hech narsa qaytaradi, hamma narsa emas** — xavfli
    yo'nalish aynan shu: «id yo'q» ni «filtr yo'q» deb o'qigan builder
    rahbarga butun kompaniyani ko'rsatadi.
  → Ingliz tilida `col.*` kalitlari **ataylab takrorlanmagan**:
    builder'lar inglizcha matnni fallback sifatida uzatadi
    (`t('col.serial', 'Serial')`), va qirq beshta satrni ikkinchi marta
    yozish sarlavhani o'zgartirish uchun ikkita joy degani — biri
    albatta unutiladi.
  → `populate()` uchun ishlatiladigan modellar **side effect uchun**
    import qilindi: Mongoose'da ro'yxatdan o'tmagan model populate'da
    runtime xatosi beradi («Schema hasn't been registered»), va bu
    ro'yxat aynan shu xato orqali topildi.
  → ⚠️ **Yon topilma:** 38 ta test fayli bitta MongoDB/Redis ustida
    parallel ishlab, natijalar **har ishga tushirishda o'zgaradigan**
    bo'lib qoldi (timeout, tugagan rate-limit, bir zumda to'g'ri bo'lgan
    sanoq). Hech biri haqiqiy emas edi. `--test-concurrency=2` bilan
    to'plam barqaror (677 test, ~90 soniya); sabab va HTTP testlarining
    talablari `backend/TESTING.md` da yozildi.
- [x] **8.2** **Hisobotni ekranda ko'rish** — `ReportsView` da jadval + grafik (FL-29)
  · Bajarildi — `GET /reports/:type/preview` JSON qaytaradi (fayl emas), va
  `ReportsView` da har bir hisobotning yonida «Ko'rish» tugmasi: modal ichida
  `DataTable` (0.10) + `Chart` (0.10), sonli ustunni tanlash mumkin.
  · **To'rtinchi chegara.** Preview `PREVIEW_MAX_ROWS = 100` bilan cheklangan
  — eksportning 5 000 va 100 000 idan boshqa sabab bilan: bu qatorlar
  brauzerdagi jadvalga tushadi, 5 000 qator esa javob bermaydigan tab
  degani. Chegara mijozdan **olinmaydi** (`omit({format:true})` sxemasi
  `maxRows` ni qabul qilmaydi) — aks holda mijoz o'z chegarasini ko'tarib,
  preview'ni cheksiz o'qishga aylantirardi. Farq jimgina qolmaydi: ekran
  ham xuddi fayl kabi «100 / 114» deb aytadi.
  · **Yonida topilgan xato:** `report:view` ruxsati beshta rolga berilgan
  edi, lekin **hech qayerda tekshirilmasdi** — butun `/reports` router'i
  `report:export` talab qilardi. Ya'ni **AUTHOR, INSTRUCTOR va MENTOR**
  (view bor, export yo'q) hisobot marshrutlarining birontasiga ham kira
  olmasdi, garchi ruxsatlari «ko'rishi mumkin» deb tursa ham. Endi:
  katalog va preview — `report:view` **yoki** `report:export`; eksport va
  navbat — faqat `report:export`. Buning uchun `requireAnyPermission()`
  qo'shildi (`requirePermission(a, b)` ni o'quvchi «ikkalasi ham kerak»
  deb o'qishi mumkin edi).
  · Ekranda ko'rish ham audit qilinadi (`REPORT_VIEWED`) — eksportni audit
  qilishga arzigan narsa fayl emas, xodim ma'lumotining chiqishi edi, u
  esa ikkala yo'lda ham chiqadi.
  · Sinov: `test/reportPermissions.test.js` (8 test, HTTP orqali) —
  ko'ruvchi ko'radi, yuklab ololmaydi, navbatga qo'ya olmaydi; eksport
  huquqi borga ikkalasi ham ochiq; tokensiz 401; audit yozuvi bor.
  `reportExport.test.js` ga preview chegarasi va scope fence'i qo'shildi.
- [x] **8.3** **Async eksport** — `models/exportJob.model.js`, `jobs/exportQueue.js`,
  `MAX_ROWS` kesilganini ochiq ko'rsatish
  · Qabul: **AT-22**
  → **Tartib o'zgartirildi:** 8.3 birinchi qilindi, 8.1 dan oldin. AT-22
    har bir hisobotning javob shaklini o'zgartiradi (`totalRows`,
    `truncated`), ya'ni 17 ta yangi builder'ni oxirgi shartnomaga qarab
    yozgan ma'qul — keyin retrofit qilishdan ko'ra.
  → **Chegara muammo emas edi, sukut muammo edi.** 5 000 qatorda kesib,
    hech narsa demaslik: 8 000 xodimlik eksport 5 000 qatorli faylga
    aylanadi va u **to'liqdek ko'rinadi** — yetishmayotgan 3 000 odam
    umuman mavjud bo'lmagan odamlardan farq qilmaydi.
  → Har bir builder endi `totalRows` ni **alohida count so'rovi bilan**
    qaytaradi: chegaraning butun maqsadi 8 000 qatorni xotiraga
    yuklamaslik, ya'ni halol raqam faqat count'dan kelishi mumkin.
    Agregatsiyali builder'larda `$facet` — guruhlash bosqichi eng qimmat
    joyi, va raqam bilish uchun uni ikki marta bajarish har bir
    eksportning narxini ikkilantirardi.
  → Fayl javobida sarlavhalar: `X-Report-Truncated`,
    `X-Report-Total-Rows`, `X-Report-Exported-Rows` — tanada aytish
    mumkin emas, chunki tana faylning o'zi. CORS `exposedHeaders` ga ham
    qo'shildi, aks holda ular brauzerga yetib borib **ko'rinmas** bo'lardi.
  → Async yo'l: `POST /reports/:type/export-job` → worker quradi →
    `GET /reports/export-jobs/:id` tayyor bo'lganda 5 daqiqalik
    imzolangan havola beradi. Xodimlar ro'yxati eksporti — aynan URL
    orqali ulashib bo'lmasligi kerak bo'lgan fayl.
  → Scope **so'rov paytida** hal qilinadi, worker ishga tushganda emas:
    job odam **so'ragan paytda ko'ra olgan** narsani eksport qilishi
    kerak; keyin scope kengaysa, fayl u bilan birga jimgina
    kengaymasligi kerak.
  → Async chegara ham bor (`ASYNC_MAX_ROWS`), shunchaki kattaroq: spinner
    kutayotgan odam yo'q, lekin cheksiz eksport umumiy serverni xotiradan
    chiqarishning yo'li.
  → TTL indeksi hujjatni o'chiradi, lekin Mongo'ning TTL monitori
    **storage'dagi obyekt haqida hech narsa bilmaydi** — shuning uchun
    kunlik cleanup job fayllarni o'chiradi, aks holda har bir eksport
    bucket'da abadiy qolardi.
  → ⚠️ **2026-09-10 da qayta ko'rildi va tugatildi.** Band `[x]` turgan edi,
    lekin serverdagi ikkala yarim ham foydalanuvchiga yetib bormasdi:
    1. **Async eksport har chaqiruvda 500 qaytarardi.** BullMQ Redis
    kalitlarini `:` bilan ajratadi va shu belgi bor custom job id'ni rad
    etadi; `queueExport` esa `export:${id}` uzatardi — `add()` istisno
    tashlardi, marshrut 500 berardi, **hech qachon bironta eksport
    qurilmagan**. Test buni ko'rmagan, chunki u `exportJobService.create()`
    da to'xtardi — u Mongo qatorini yozadi va navbatga umuman tegmaydi.
    Endi test `queueExport` ning o'zidan o'tadi, id'da `:` yo'qligini va
    ikki marta navbatga qo'yish bitta ish ekanini tekshiradi.
    2. **Kesilganlik ogohlantirishi hisoblanardi, yuborilardi va tashlab
    yuborilardi.** Brauzer `X-Report-Truncated` ni umuman o'qimasdi, ya'ni
    8.3 oldini olish uchun yozilgan holat — «5 000 qatorli fayl to'liqdek
    ko'rinadi» — interfeysda hamon sodir bo'lardi. Endi yuklab olish
    serverning javobini qaytaradi, kesilgan eksport o'z qatorida shuni
    aytadi va yonida «to'liq eksportni navbatga qo'y» tugmasi turadi;
    navbatdagilar uchun alohida panel (holat, qator soni, so'ralganda
    yangi imzolangan havola — sahifa yuklanganda emas, u 5 daqiqada
    o'ladi).
  → Yo'lda ikkita narsa topildi:
    - **Yiqilgan eksport sababni bo'sh yozardi.** Ishlamayotgan MinIO
    `AggregateError [ECONNREFUSED]` tashlaydi va uning `message` maydoni
    bo'sh satr; o'sha qator esa yiqilishning yagona izi edi — «FAILED» va
    boshqa hech narsa. `utils/errorMessage.js` umumiy javob bo'ldi.
    - **Ekran 5 ta hisobot turini taklif qilardi, serverda 22 ta bor edi.**
    8.1 dagi o'n yettita hisobot mavjud, sinalgan va **hech qayerdan
    ochib bo'lmaydigan** holatda turgan ekan. Ro'yxat endi API'dan
    keladi, o'n yettita nom uch tilga tarjima qilindi.
- [x] **8.4** **Rejalashtirilgan hisobotlar** — `scheduledReport.model.js`, cron job
  · Bajarildi — `ScheduledReport` modeli, soatlik sweep (`scheduledReportQueue`),
  `/reports/schedules` CRUD + «hozir ishga tushirish», va `ReportsView` dagi
  panel. `report:schedule` ruxsati ham shu bilan birinchi marta ish boshladi.
  · **Rejalashtirilayotgan narsa — eksport, yetkazish emas.** Sweep 8.3 dagi
  aynan o'sha `ExportJob` ni quradi, oluvchilar esa «tayyor» xabarini oladi.
  Fayl pochtaga **ilova qilinmaydi** va doimiy URL sifatida berilmaydi:
  xodimlar ro'yxati eksporti — aynan login ortida qolishi kerak bo'lgan fayl,
  va pochtada yashaydigan imzolangan havola — yuborilgan sababidan uzoq
  yashaydigan havola.
  · **Eng nozik joyi — «keyingi safar qachon».** Uni hech kim kuzatmaydi,
  ya'ni xato «hisobot jimgina kelmay qo'ydi» yoki «har soatda kelaveradi»
  ko'rinishida chiqadi. Shuning uchun:
    - Vaqt **mahalliy** (`APP_TIMEZONE`), UTC emas — 07:00 da kelishi kerak
    hisobot 03:00 da kelsa, uni hech kim ertalab o'qimaydi.
    `utils/timezone.js` ga `zonedTimeToUtc` qo'shildi: ikki bosqichli, ya'ni
    DST almashadigan kunlarda ham to'g'ri (New York bilan tekshirildi).
    - Keyingi vaqt **kun-kun oldinga yurib** topiladi, oy arifmetikasi bilan
    emas — «31-fevral» ham, soat siljiydigan kun ham o'sha arifmetikada
    yashiringan bo'lardi.
    - Javob **qat'iy kelajakda**: hozirgi lahzani qaytarsa, sweep o'sha
    rejani har o'tishda qayta qurardi.
    - `dayOfMonth` **28 da to'xtaydi**. «31-kun» yilning besh oyida yo'q, va
    uni qabul qilishning har bir usuli — kutilmagan natija: tashlab ketilsa
    hisobot fevralni jimgina o'tkazib yuboradi, qisqartirilsa «31» aslida
    «28» degani bo'lib qoladi. Rad etish — kun tanlayotgan odam buni
    **tanlash paytida** biladigan yagona variant.
  · Sinov: `test/scheduledReports.test.js` (18 test) — kunlik/haftalik/oylik
  hisob, fevral, «qat'iy kelajak», soat mahalliyligi; HTTP orqali ruxsat,
  31-kunning rad etilishi, o'zganing rejasiga tegib bo'lmasligi; sweep
  muddati kelganini quradi, kelmaganiga tegmaydi, o'chirilganini o'tkazib
  yuboradi va **bitta buzuq reja qolganlarini to'xtatmaydi**.
  · Yo'lda topilgan ikki teshik yopildi:
    1. Sweep faqat navbatga qo'yardi, ya'ni o'chirilgan hisobot turiga
    ishora qiluvchi eski reja worker ichida yiqilardi va **reja buni bilmasdi**
    — abadiy «muvaffaqiyatli» deb turardi. Endi tur sweep paytida ham
    tekshiriladi, va worker'dagi yiqilish `scheduleId` orqali rejaga
    qaytib yoziladi.
    2. Oluvchi «tayyor» xabarini olardi-yu, faylni ocholmasdi — `get()`
    faqat so'ragan odamni qo'yardi. Endi reja oluvchilari ham ochadi
    (marshrut baribir `report:export` talab qiladi), va **havola berilgan
    lahza auditga yoziladi** — aks holda async yo'l xodimlar ro'yxatini
    audit jurnalida ko'rinmasdan olib ketish usuli edi.
- [x] **8.5** **Dashboard kengaytmasi** — test, sertifikat, tadbir, path,
  compliance metrikalari; `scope` almashtirgichi
  · Bajarildi — `analytics/dashboardExtra.js` (8.1 dagi `reportBuilders.extra.js`
  naqshi bo'yicha alohida faylda, chunki asosiy agregatsiyani ikki barobar
  uzaytirish uni o'qib bo'lmaydigan qilardi).
  · **Oltita yangi karta:** test urinishlari va o'tish foizi, berilgan
  sertifikatlar va muddati yaqinlashganlari, yaqin tadbirlar, faol
  yo'nalishlar (+ tugatilganlar va compliance qoidalari).
  · **To'rtta yangi grafik:** yo'nalish progressi, tadbir davomati,
  sertifikatlar oylik trendi, test qiyinligi.
  · Har birida bitta o'ylangan qaror bor:
    - `validUntil: null` sertifikat **muddati tugamaydi**, ya'ni «muddati
    yaqinlashgan» sanog'iga kirmaydi — aks holda bu hech narsa haqidagi
    ogohlantirish bo'lardi.
    - Davomat maxrajiga **navbatdagilar va bekor qilganlar kirmaydi**: joy
    tegmagan odam kelmagan hisoblanmaydi, aks holda uzun navbati bor to'la
    tadbir «yomon davomat» bo'lib ko'rinardi.
    - Davomat faqat **o'tib bo'lgan** tadbirlar uchun so'raladi.
    - Test qiyinligi **3 dan kam urinishli testlarni tashlaydi** — bitta
    odamning bitta yiqilishi qiyinlik signali emas.
    - Sertifikat trendi **nol bilan to'ldiriladi**: trend chizig'idagi
    bo'shliq «ma'lumot yo'q» deb o'qiladi, «hech narsa bo'lmagan» deb emas.
    - Nol urinishda o'tish foizi **0%**, `NaN` emas — yangi o'rnatilgan
    tizimda ham sahifa chizilishi kerak.
  · **Scope almashtirgichi** — `DashboardScopeSwitch.vue`, ikkala dashboardda
  ham. Bitta payload va filtr emas, ikkita ekran: kompaniya dashboardi —
  hamma bo'yicha keshlangan agregatsiya, jamoa dashboardi — nomma-nom
  ro'yxat uchun jonli hisob; ular boshqa savolga javob beradi va shakllari
  ham boshqacha.
  · Shu bilan **0.3 dagi chetlanish yopildi**: bo'limga cheklangan rahbar
  kompaniya dashboardiga kirsa, ilgari 403 xatosi ko'rinardi va yo'l shu
  yerda tugardi. Endi 403 xato sifatida emas, tushuntirish va jamoa
  dashboardiga havola sifatida ko'rsatiladi.
  · Sinov: `test/dashboardMetrics.test.js` (8 test). Da'volar **delta**
  bo'yicha — bu umumiy dev bazaga qarshi ishlaydi va boshqa fayllar ayni
  paytda ma'lumot yaratib-o'chirib turadi, ya'ni «aynan to'qqizta sertifikat
  bor» degan test kodga aloqasi yo'q sabablarga ko'ra tushadigan test.
  · Yonida: `refresh-cw` ikoni mavjud emas ekan va manager dashboardida
  **bo'sh joy** chizilardi — 0.10 da `Icon` ga qo'shilgan ogohlantirish
  buni topdi.

---

## BLOK 9 — Kontent va authoring (6 hafta)

- [x] **9.1** **`ContentItem` polimorf bazasi** (bosqichma-bosqich, `Lesson` bilan boshlanadi)
  · Bajarildi — baza yarmi oldingi sessiyada yozilgan edi
  (`services/courses/contentItem.js`: umumiy ko'rinish darvozasi va
  reorder), lekin **`nextOrder()` ning birorta chaqiruvchisi yo'q edi** va u
  yozilgan to'rtinchi kontent turi mavjud emasdi. Endi:
    1. **`Lesson`** — `models/lesson.model.js`, blok subschema'si bilan.
    Blok turlari: `HEADING`, `TEXT` (boy HTML), `IMAGE`, `DIVIDER`.
    O'n ikkitasi emas: API qabul qiladigan har bir blok turi validatsiya,
    sanitatsiya va ko'rsatishni talab qiladi, sakkiztasini hech kim
    ko'rsata olmaydigan holda yozib qo'yish — o'qilmaydigan kontentni
    saqlash bo'lardi. Validator `discriminatedUnion`, ya'ni 9.2 da har bir
    yangi tur bitta band, qayta yozish emas.
    2. **Blok `_id` saqlanadi** va o'qish progressi shunga yoziladi — muallif
    xatoni tuzatsa yoki bloklarni surib qo'ysa, hech kimning joyi
    yo'qolmaydi. Tahrirda mijoz `id` ni qaytaradi (`lessonBlocks.js`).
    3. **`TEXT` bloki KB allowlist'i bilan tozalanadi** (`kbSanitize.js` dan
    import, nusxa emas): bir xil xavf — xodim yozgan HTML `v-html` bilan
    ko'rsatiladi, ya'ni server qabul qilgan narsani har bir o'quvchining
    brauzeri bajaradi. Ikkita allowlist bo'lsa, biri qattiqlashtirilgan kuni
    ikkinchisi hozir xavfli deb topilgan narsani qabul qilishda davom etadi.
    4. **`lessonProgress`** — ko'rilgan bloklar to'plami (materialProgress
    naqshi). Foiz **saqlanmaydi, hisoblanadi** (`lessonCompletion()`):
    bo'luvchi — darsning hozirgi blok ro'yxati, muallif esa uni
    o'zgartiradi; saqlangan foiz blok qo'shilgan zahoti eskiradigan
    ikkinchi javob bo'lardi (3.1 ning darsi).
    5. **Tugatishga ulandi** — `collectCourseItems()` da dars hujjat kabi
    hisoblanadi (o'qilgan bloklar ulushi). AT-01/AT-04: faqat darsdan
    iborat kurs tugaydi; ikkinchi majburiy dars **chiqarilganda** kurs
    qayta ochiladi, qoralama esa hech kimni ushlab turmaydi.
    6. **`nextOrder()` ulandi** — dars, material, test va tus video yaratish
    yo'llari endi mavzuning **umumiy** ketma-ketligi oxiriga tushadi.
    Ilgari har turi 0 dan boshlanardi, shuning uchun uchta video va uchta
    fayl bo'lgan mavzuda ikkita element 0 da, ikkitasi 1 da turardi.
    7. **Kurs nusxalash darslarni ham oladi** (`courseDuplicate`), blok
    id'lari yangidan yaratiladi — bo'lishilgan id'lar asl kursdagi o'qish
    joyini nusxaga ham hisoblab yuborardi.
  · **Yon topilma va tuzatish:** `reorderContent()` to'liq bo'lmagan
  ro'yxatni jimgina qabul qilardi — HTTP sinovida oltitadan ikkitasini
  yuborib ko'rdim, o'sha ikkitasi 0 dan raqamlandi va qolganlar joyida
  qoldi, ya'ni funksiya tuzatish uchun yozilgan to'qnashuv qaytib keldi.
  Endi `INCOMPLETE_ORDER` (400) — mijoz ro'yxatini yangilashi kerak.
  Endpoint'ning UI chaqiruvchisi yo'q, shuning uchun buzilgan narsa yo'q.
  · **Tekshirildi** — `backend/test/lesson.test.js` (23 test, jonli
  MongoDB): sanitatsiya (onclick, `<script>`, `javascript:` URL, `data:`
  URL), umumiy ketma-ketlik, to'liqsiz reorder, begona mavzudagi id,
  qoralama 404 (403 emas), bo'sh darsni chiqarish taqiqi, progress (25 →
  50 → 100), `LESSON_NOT_AT_END`, `UNKNOWN_BLOCK`, tahrirdan keyin joy
  saqlanishi, tugatish va nusxalash. HTTP orqali ham (4100-portda alohida
  server, foydalanuvchining 4000-portidagi jarayoniga tegmasdan):
  401 tokensiz, 403 xodim PATCH qilganda, 404 qoralamaga, 400 noto'g'ri
  blok turiga. Sinov ma'lumotlari o'chirildi.
  · **Chetlanishlar:**
    1. **Frontend deyarli tegilmagan.** `TopicContentPanel` da `LESSON`
    qatori faqat **o'qish uchun** qo'shildi (ikoni, sarlavha, blok soni,
    holat) — ilgari u yerda bo'sh satr chizilardi. Blok editori, dars
    yaratish va chiqarish tugmalari, o'quvchi ko'rinishi — **9.2**.
    Shuning uchun dars hozircha faqat API orqali yaratiladi.
    2. **Chiqarilgan darsni o'quvchi hali o'qiy olmaydi** (ko'rinish 9.2
    da). Dars standart holatda `DRAFT`, lekin muallif uni chiqarsa,
    kurs foizida hisoblanadi va ochib bo'lmaydi. Bilib qabul qilingan
    murosa: tugatish mantig'ini keyinroq ulash 3.1 ning "bitta javob"
    qoidasini buzardi.
    3. **Video va materialni o'chirishda kurs qayta baholanmaydi.** Dars
    o'chirilganda baholanadi (o'chirish kursni kimlar uchundir tugallashi
    mumkin). Bu ikkisidagi bo'shliq eski, bu yerda o'tib ketishda
    tuzatilmadi.
    4. Blok `IMAGE` URL'i faqat sxema bo'yicha tekshiriladi (http/https);
    o'z saqlagichimizga bog'lash media kutubxonasi (**9.5**) bilan keladi.
- [x] **9.2** **`Lesson` + blok editor** — 12 blok turi, drag-drop, autosave
  · Bajarildi — 9.1 ning to'rt blok turi o'n ikkitaga yetdi, ustiga editor va
  o'quvchi sahifasi qo'shildi.
  · **O'n ikki tur:** `HEADING TEXT QUOTE CALLOUT CODE` (yozma),
  `IMAGE GALLERY EMBED` (media), `VIDEO FILE` (kurs kontentiga havola),
  `TABLE DIVIDER` (struktura). Ataylab yo'q: `LINK` — bu bitta havolasi
  bo'lgan `TEXT` bloki; **sahifa ichidagi quiz** — u urinish, baholash va
  o'tish balini talab qiladi, bularning hammasi `Assessment` da bor (4.2),
  shuning uchun dars testga **havola qiladi**, ichida tutmaydi.
  · **`VIDEO`/`FILE` — havola, nusxa emas.** Dars kurs allaqachon
  saqlayotgan videoni id bilan nomlaydi, ya'ni u curriculumdagi bir xil
  qator, bir xil ishlov holati va bir xil o'ynatish qoidalari bilan.
  Muhimi: havola **kim ko'rishini ham belgilaydi**, shuning uchun
  `assertReferences()` boshqa kursning kontentiga havolani rad etadi
  (`REFERENCE_NOT_IN_COURSE`) — aks holda A kursi muallifi B kursining
  boshqa filialga yo'naltirilgan videosini o'z darsiga qo'yib, B kursi
  qo'ygan har bir qoidani id orqali chetlab o'tardi. O'qishda havolalar
  bitta `$in` so'rovi bilan ochiladi; o'quvchi ko'rmasligi kerak bo'lgan
  narsa `unavailable: true` bo'lib qaytadi va o'rniga placeholder chiziladi.
  · **`EMBED` — host allowlist + `sandbox`.** Iframe — sahifaning bir
  qismini boshqa saytga berish; bizning chrome ichida u ishonchli login
  formasi chizishi, sahifani shaffof qatlam bilan yopishi yoki har bir
  o'quvchini uchinchi tomonga xabar qilishi mumkin, "muallif tashladi" esa
  o'quvchining roziligi emas. Shuning uchun: faqat YouTube, Vimeo,
  Google Docs/Drive; faqat `https`; URL **normalizatsiya qilinadi** —
  muallif brauzer satridan `youtube.com/watch?v=…` tashlaydi, bu esa
  freymda ochilmaydi, saqlanadigan qiymat `youtube-nocookie.com/embed/…`
  (vaqt belgisi ham saqlanadi). Freymda `allow-same-origin` yo'q va
  `allow-popups` ataylab berilmagan.
  · **`CODE` sanitatsiya qilinmaydi** — bu yagona shunday blok. Kod namunasi
  tegdan gapirsa, HTML sanitizeri uni yeb qo'yadi; shuning uchun matn
  o'zgarmagan holda saqlanadi va o'quvchi tomonida `textContent` sifatida
  chiziladi, hech qachon markup sifatida emas.
  · **Editor** (`LessonEditor.vue`): drag-drop (`SortableList`, klaviatura
  uchun yuqori/past tugmalari ham), blok nusxalash, har tur uchun o'z
  formasi, `RichText` (contenteditable + `execCommand`; kutubxona
  qo'shilmadi — server baribir allowlist bilan tozalaydi, va pastdagi
  "Chetlanishlar" ga qara), **avtosaqlash** oxirgi tahrirdan 1,2 s keyin,
  sarlavhada holat ("08:02 da saqlandi" / xato matni), **preview** esa
  o'quvchining aynan o'sha `LessonBlock.vue` komponenti bilan chiziladi —
  o'z markupi bilan preview ertami-kechmi yolg'on gapiradi.
  · **Ikki nozik joy avtosaqlash tufayli:**
    1. **Blok id'lari qaytib keladi va qoladi.** Progress id'larga yoziladi,
    ya'ni har saqlashda yangi id berilsa, hammaning joyi nolga tushadi.
    `adoptIds()` javobni **yuborilgan** massivga qarab moslashtiradi, chunki
    to'ldirilmagan bloklar saqlashga qo'shilmaydi — mahalliy uchinchi blok
    javobdagi uchinchi bo'lishi shart emas.
    2. **To'ldirilmagan blok yuborilmaydi.** Validator bo'sh `TEXT` ni rad
    etadi (to'g'ri — bo'sh blok o'qilmaydigan kontent), lekin muallif
    blokni **avval qo'shib**, keyin to'ldiradi; oradagi har avtosaqlashda
    400 kelsa, editor buzuq ko'rinadi. Shuning uchun yarim yozilgan blok
    saqlashdan chetda qoladi, sarlavha esa nechtasi kutayotganini aytadi.
  · **O'quvchi sahifasi** (`LessonView.vue`, `/lessons/:id`): bloklar
  ketma-ket chiziladi, progress **skroll joyi bilan emas, ekranga chiqqan
  bloklar bilan** o'lchanadi (`IntersectionObserver`, 1,5 s ga batch
  qilinadi) — skrollni pastga tortgan odam faqat pastini ko'rgan bo'ladi.
  Sahifadan chiqishda oxirgi partiya yuboriladi. Curriculumda dars qatori
  "9 blok · 6 daq. · 9/9 · 100%" ko'rinishida.
  · **Tekshirildi.** Backend: `test/lesson.test.js` 29 test (12 turning
  round-trip'i, embed normalizatsiyasi va allowlist, `http` embed rad
  etilishi, begona kursga havola, havolani ochish va `unavailable`,
  nusxalashda `videoId`/`materialId` qayta yo'naltirilishi). Frontend:
  **yangi** `front/test/lessonBlocks.test.js` — 14 test (repozitoriyda
  birinchi front testi; shu sabab editor mantig'i `utils/lessonBlocks.js`
  ga chiqarildi, komponentda emas). Va **haqiqiy brauzerda** (headless
  Chrome, CDP): o'quvchi kirdi → dars sahifasi 9 blokni chizdi → embed
  `youtube-nocookie` ga aylangan, jadval 6 katak, kod o'zgarmagan →
  oxirigacha skroll → server 9/9, 100%, `completed: true` → curriculum
  qatori "9/9 · 100%", kurs 100% (1/1) bo'ldi; admin tomonida "Dars"
  tugmasi → editor ochildi → 12 blok tugmasi → matn yozildi → 1,2 s dan
  keyin "saqlandi" va serverda 1 blok. Konsolda birorta xato yoki
  ogohlantirish yo'q. Skrinshotlar ko'rildi. Sinov ma'lumotlari o'chirildi.
  · **Chetlanishlar:**
    1. **`RichText` `document.execCommand` ishlatadi** — rasman
    deprecated, lekin hamma brauzerda ishlaydigan yagona formatlash API'si.
    To'rt tugma uchun uchinchi tomon editorini (yuz kilobayt va o'z HTML
    dialekti bilan) qo'shish oqlanmadi; xavfsizlik chegarasi baribir
    serverda. Paste faqat oddiy matn sifatida tushadi, aks holda ekranda
    ko'rinadigan narsa saqlanadigan narsadan farq qilardi.
    2. **`VIDEO`/`FILE` tanlagichi faqat shu mavzuning kontentini
    ko'rsatadi.** Backend butun kursga ruxsat beradi; boshqa mavzudan
    tanlash uchun UI hozircha yo'q (bitta so'rov, keng tarqalgan holat).
    3. **Blok shablonlari, flashcard, labeled graphics yo'q** — parity
    matritsasida `PARTIAL` bo'lib turadi, yangi blok turlari kerak.
    4. **Media hali kutubxonaga bog'lanmagan** — `IMAGE`/`GALLERY` URL'i
    faqat sxema bo'yicha tekshiriladi (`http(s)`), o'z saqlagichimizga
    bog'lash va orphan tozalash **9.5** da.
    5. Kurs sarlavhasidagi statistika hamon "0 video" deb sanaydi (dars
    hisoblanmaydi); curriculumdagi element soni esa to'g'ri. Sarlavha
    dizayni 9.2 doirasidan tashqarida, tegilmadi.
- [x] **9.3** **SCORM 1.2/2004 import** — `scormPackage`, `scormState`,
  iframe API adapter, helmet CSP `frame-src` sozlash
  · Bajarildi — paket mavzudagi **beshinchi** kontent turi bo'ldi
  (`contentItem.js` shartnomasiga qo'shildi: umumiy ketma-ketlik, reorder,
  qoralama ko'rinishi, tugatish qoidasi).
  · **Import oqimi:** zip yuklanadi (magic-byte tekshiruvi, 300 MB chegara)
  → S3 ga qo'yiladi → **worker** ochadi (`extractScorm.js`) → manifest
  o'qiladi → fayllar `packages/<id>/` ga yoziladi → `READY`. So'rov kutmaydi:
  300 MB kurs brauzer taymautidan uzoq, yuklash esa allaqachon muvaffaqiyatli.
  Xato bo'lsa sabab **qatorda** saqlanadi va admin panelida ko'rinadi
  ("paket ochilmadi" degan log muallifga yordam bermaydi); arxiv saqlanib
  qoladi, shuning uchun `Qayta urinish` 300 MB ni qayta yuklamaydi.
  · **Manifest haqiqiy parser bilan o'qiladi** (`fast-xml-parser`, prefikslar
  olib tashlanadi): versiya (`schemaversion`, bo'lmasa namespace'lardan),
  boshlang'ich fayl (**barg** item → resource href; keyin `sco` tipidagi
  resource; keyin har qanday href), o'tish bali (1.2 `masteryscore`, 2004
  `minNormalizedMeasure` 0–1 shkalada). Regexp bilan qilinmadi: manifest
  o'nlab authoring vositasidan chiqadi va biri `adlcp:scormtype`, boshqasi
  `adlcp:scormType` yozadi. **Sequencing ataylab o'qilmadi** — 2004
  sequencing o'zi bir qoidalar dvigateli, yarmini bajarib "qo'lladim" deyish
  birinchi resursni ochib kontentga o'zi navigatsiya qilishga ruxsat
  berishdan yomonroq.
  · **Ikkita versiya, bitta ichki model** (`scormCmi.js`): 1.2 da
  `cmi.core.lesson_status` bitta element bilan ikki savolga javob beradi,
  2004 da `completion_status` va `success_status` ajratilgan; ball va vaqt
  formatlari ham boshqacha. Kirishda bir marta tarjima qilinadi, shundan
  keyin hisobot, curriculum qatori va tugatish qoidasi bir xil uch maydonni
  o'qiydi. **1.2 tuzoqi:** yiqilgan test `lesson_status=failed` deb xabar
  qiladi — bu **tugagan urinish**, shuning uchun `meetsPackage()` uni
  tugatish deb hisoblamaydi (aks holda AT-02 dagi xato qaytardi), va o'tish
  bali bo'lsa ball taqqoslanadi (min/max shkalasi bilan).
  · **`window.parent.API` muammosi va yechimi.** SCORM kontenti LMS'ni
  oyna zanjiri bo'ylab yuqoriga chiqib topadi; boshqa origin'dagi oynadan
  xossa o'qish esa taqiqlanadi. SPA `spring.sds-max.uz` da, paket fayllari
  API da — ya'ni **SPA runtime API'ni tuta olmaydi**. Shuning uchun API o'zi
  kichik **launcher sahifa** beradi (`scormPlayerPage.js`): u SPA'ning
  iframe'ida turadi, `window.API` (1.2) va `window.API_1484_11` (2004) ni
  e'lon qiladi va paketni **ikkinchi**, o'zi bilan bir origin'dagi
  iframe'ga joylaydi. SPA holatni `postMessage` orqali biladi va
  o'zgarganini eshitgach **API'dan qayta o'qiydi** — xabar "nimadir
  o'zgardi" deydi, haqiqatni API aytadi.
  · **Token URL yo'lida, query'da emas.** Paket o'z assetlarini eksport
  vaqtida yozilgan nisbiy havolalar bilan yuklaydi va brauzer iframe
  ichidagi rasmga `Authorization` sarlavhasini qo'shmaydi. Cookie prod'da
  ishlardi, lokalda esa yo'q (SameSite=None → Secure → https). Shuning
  uchun `/scorm/:id/f/:token/...` — token **katalog yo'lining** bir qismi,
  ya'ni paketning nisbiy havolalari ham uni olib yuradi. Imzo
  `VIDEO_TOKEN_SECRET` bilan, `scope: 'scorm'` claim bilan (video tokeni
  paketni ochmasin).
  · **🔴 Yo'l-yo'lakay topilgan xavfsizlik teshigi va tuzatilishi.**
  Paket API origin'ida JS ishlatadi. `csrf_token` cookie'si `path=/` bo'lib
  **JS uchun o'qiladigan** edi (double-submit shunday ishlaydi), refresh
  cookie'si esa so'rovga o'zi qo'shiladi — ya'ni yuklangan paket
  `document.cookie` dan tokenni o'qib, `POST /auth/refresh` qilib,
  kursni o'tayotgan odam nomidan **tirik access token** olishi mumkin edi.
  Endi cookie `path=/api/v1/auth` ga toraytirildi: `document.cookie` faqat
  o'qiyotgan hujjat yo'liga mos cookie'ni ko'rsatadi, so'rov esa baribir
  olib boradi. SPA bu cookie'ni hech qachon o'qimagan (token login javob
  tanasida keladi), eski sessiyalar uchun `path=/` dagi nusxa avval
  o'chiriladi — aks holda bir xil nomli ikki cookie tasodifiy 403 berardi.
  · **CSP va freym sarlavhalari** (`scormFrame.middleware.js`): faqat shu
  ikki route uchun `X-Frame-Options` olib tashlanadi va `frame-ancestors`
  qo'yiladi (`'self'` + ilova origin'lari). `form-action 'none'`,
  `base-uri 'none'`, `object-src 'none'`; skript va media cheklanmaydi —
  eksport qilingan kurs aynan JavaScript, uni buzadigan siyosat funksiyani
  ishlatilmaydigan qiladi.
  · **Tekshirildi.** `test/scorm.test.js` — 28 test: manifest (1.2, 2004,
  namespace'lar, versiya fallback, "bu paket emas"), zip-slip
  (`../`, URL-kodlangan, `C:\`), o'ram papkasi, eng ustki manifest, prefiks
  ichida qolish, manifest ko'rsatgan fayl yo'qligi, faqat zip, ketma-ketlik,
  token (mos kelmagan paket, buzuq token), READY bo'lmagan paketni
  chiqarish/ochish taqiqi, CMI ikki versiyada, mastery, commit merge,
  "tugagan tugagan bo'lib qoladi", AT-01/AT-02.
  · **Va haqiqiy brauzerda** (headless Chrome, CDP), MinIO yo'qligi uchun
  ~60 satrli S3-mos stub bilan: haqiqiy SCORM 1.2 paketi yuklandi →
  **worker** ochdi (4 fayl, versiya 1.2, mastery 80, sarlavha manifestdan) →
  chiqarildi → o'quvchi `/scorm/:id` ni ochdi → paket ichidagi SCO
  `window.parent.API` ni **topdi**, `student_name` = "E2E Scorm",
  `mastery_score` = 80, `entry` = `resume`, `suspend_data` = "slide=1"
  (ya'ni **resume ishlaydi**) → tugatish tugmasi bosildi → server:
  `completed`, `passed`, ball 90, vaqt 270 s → kurs 100% va "Kurs
  tugallandi" bildirishnomasi. Konsolda faqat brauzerning `favicon.ico`
  404 i. Skrinshot ko'rildi. Sinov ma'lumotlari o'chirildi.
  · **Chetlanishlar:**
    1. **Qolgan xavf: paket API origin'ida ishlaydi.** Cookie yo'li
    yopilgani bilan kontent hamon shu origin'dan token talab qilmaydigan
    endpointlarga murojaat qila oladi. To'g'ri yechim — paket fayllari
    uchun **alohida host** (masalan `scorm-content.sds-max.uz`), bu DNS
    yozuvini talab qiladi va bu sessiyada qilib bo'lmaydi. Paketni faqat
    `course:update` bo'lgan xodim yuklaydi, o'quvchi emas.
    2. **Sequencing va bir nechta SCO qo'llanmaydi** — birinchi resurs
    ochiladi, keyin kontentning o'zi navigatsiya qiladi. Ko'p-SCO paketda
    holat bitta yozuvda yig'iladi.
    3. **`cmi.interactions` va `cmi.objectives` saqlanadi, lekin hisobotga
    chiqmaydi** — savol-savol analitika 13.x da.
    4. **Lokalda MinIO yo'q**, shuning uchun S3 legi haqiqiy MinIO'da
    sinalmagan; e2e stub bilan qilindi. Serverda birinchi paketni yuklab
    tekshirish kerak (`lms-scorm` bucket avtomatik yaratilmaydi — MinIO'da
    bucket policy'lari qo'lda sozlangan).
    5. **Zip xotirada ochiladi** (jszip): shuning uchun worker konkurentligi
    1 va ochilgan hajm sakkiz baravar chegara bilan cheklangan (zip bomba).
    Oqimli ochish kerak bo'lsa — `yauzl`, lekin hozircha kerak emas.
- [x] **9.4** **Subtitr / VTT** — ffmpeg pipeline'ga qo'shish, pleyerda `<track>`
  (**accessibility uchun majburiy**)
  · Bajarildi — subtitr ikki yo'l bilan keladi: **videoning ichidan** va
  **qo'lda yuklab**.
    1. **Pipeline** (`processVideo.js`): `ffprobe` subtitr oqimlarini ham
    qaytaradi, matnli kodeklar (`subrip`, `mov_text`, `ass`…) `-c:s webvtt`
    bilan chiqariladi. Bitmap subtitrlar (DVD/PGS) **o'tkazib yuboriladi** —
    ular matnning rasmi, OCR kerak; butun videoni shu sabab yiqitish
    ma'nosiz. Chiqarish transcode'dan **keyin** qilinadi: buzuq subtitr
    oqimi videoni renditionlaridan mahrum qilmasin.
    2. **Qo'lda yuklash**: `.vtt` yoki `.srt`. SRT rad etilmaydi, **o'girib
    olinadi** (`subtitleFormat.js`) — hamma narsa SRT eksport qiladi
    (transkripsiya xizmati, tarjimonning Subtitle Edit'i, video bilan
    kelgan .srt), va vergul o'rniga nuqta deb muallifni qaytarish
    funksiyaning obro'siga tushardi.
  · **Ikki jimgina buziladigan joy test bilan qadab qo'yildi:**
    - VTT fayl **o'z sarlavhasini** saqlab qolsa, ikkita `WEBVTT` bo'lib,
    ikkinchisi birinchi qatorning **matni** bo'lib chiqadi — ekranda
    "WEBVTT" deb turadigan subtitr. Endi sarlavha bir marta yoziladi.
    - **Qatorsiz fayl rad etiladi.** Hech narsa ko'rsatmaydigan trek
    yo'qidan yomon: o'quvchi subtitrni yoqadi va platforma buzuq deb
    xulosa qiladi.
    - BOM (Windows vositalari qo'shadi) olib tashlanadi; `MM:SS.mmm`
    shakldagi vaqt belgisi uch qismli shaklga keltiriladi (ba'zi pleyerlar
    birinchisini o'qimaydi).
  · **Xizmat qilish:** `<track>` elementi `Authorization` sarlavhasini
  olib yurmaydi — brauzer uni o'zi yuklaydi, xuddi segment kabi. Shuning
  uchun trek **o'sha qisqa muddatli playback tokeni** bilan beriladi:
  `/video-stream/:videoId/subtitles/:trackId?token=`. Route generik
  `/:videoId/:quality/:file` dan **oldin** qo'yilgan (aks holda "subtitles"
  rendition deb o'qilardi). `<video>` ga `crossorigin="anonymous"` qo'shildi
  — bo'lmasa brauzer boshqa origin'dagi trekni umuman yuklamaydi.
  · **Pleyerda maxsus UI yo'q** va bu ataylab: pleyer native `controls`
  ishlatadi, ya'ni `<track>` qo'shilishi bilan brauzerning o'z CC menyusi
  paydo bo'ladi — o'zimiz yozgan menyu klaviatura va skrin-riderlar uchun
  yomonroq bo'lardi.
  · **Qoidalar:** bir tilga bitta trek (ikkinchi yuklash **almashtiradi** —
  menyuda ikki xil "O'zbek" bo'lib, farqini bilib bo'lmaydi va ikkinchi
  yuklash deyarli har doim tuzatish); bir vaqtda faqat bitta standart
  trek; standartni o'chirsa keyingisi ko'tariladi (aks holda video
  o'zidan yonmaydigan subtitr bilan qoladi).
  · **Tekshirildi.** `test/subtitles.test.js` — 13 test (SRT→VTT, ikki
  sarlavha muammosi, qatorsiz fayl, til kodlari `RU`/`ru-ru`, bitmap
  kodeklar, birinchi trek standart bo'lishi, almashtirish, bitta standart,
  o'chirishda ko'tarilish, qoralama videoning treklari, id bo'yicha o'qish).
  Va **haqiqiy ffmpeg bilan**: ichida `subrip` (til `uzb`) oqimi bor MKV
  yasab, to'liq pipeline stub S3 ustida ishga tushirildi → video READY,
  `subtitles[0]` = `uzb`, `EMBEDDED`, 2 qator, standart, VTT obyekti
  o'z kaliti bilan joyida.
  · **Chetlanishlar:**
    1. **Avtomatik transkripsiya yo'q** — nutqni matnga o'giradigan xizmat
    ulanmagan. Bu 9.4 doirasida ham emasdi; kerak bo'lsa BLOK 10 (AI) ga
    tegishli.
    2. **Kodlash aniqlanmaydi**: fayl UTF-8 deb o'qiladi. Legacy Windows
    kodlashdagi fayl rad etilmaydi, "mojibake" bo'lib ko'rinadi —
    kodlashni taxmin qilish o'zi xatolar manbai, va bugun hamma vosita
    UTF-8 yozadi.
    3. **`und` tili o'zgartirilmaydi** — konteyner tilni aytmagan bo'lsa,
    shundayligicha saqlanadi va muallif keyin nomini o'zgartiradi. O'zbekni
    "ruscha" deb belgilab qo'yish "noma'lum" dan yomonroq.
- [x] **9.5** **Media kutubxona** — `mediaAsset`, papkalar, "qayerda ishlatilgan",
  `jobs/mediaCleanupQueue.js` (orphan — `course.service.js:378` dagi qarz)
  · Bajarildi — ikki qism: **kutubxona** (muallif uchun) va **egasiz
  fayllarni tozalash** (server uchun).
  · **Kutubxona.** Ilgari har bir rasm **har ishlatilgan joyi uchun qayta
  yuklanardi**, chunki saqlagichdagi faylni topib olishning yo'li yo'q edi;
  "bu rasm hali ishlatilyaptimi?" degan savolga javob ham yo'q edi, shuning
  uchun hech narsa o'chirilmasdi va bucket faqat o'sardi. Endi
  `mediaAsset` — rasm yuklanganda ro'yxatga olinadi (`imageUpload.service`),
  papka (oddiy yorliq: `brand/2026`), nom, hajm. `ImageUploadField` ga
  "kutubxonadan tanlash" qo'shildi, admin panelida `/bos/media` sahifasi.
  · **"Qayerda ishlatilgan" — hisoblab emas, so'rab.** Muqobil variant har
  bir yozuvchi (kurs, yangilik, blok editori, sertifikat dizayneri, avatar)
  yangilaydigan hisoblagich edi; bunday hisoblagichlar **jimgina**
  adashadi, va "2 joyda" deb turgan holda javob nol bo'lishi — o'chirish
  tugmasini xavfli qiladigan narsa. So'rov sekinroq va to'g'ri. Ikki
  shaklda qidiriladi: ko'p maydon **URL** saqlaydi, sertifikat shabloni esa
  **kalit** (u fonni serverda chizadi va brauzer URL'iga muhtoj emas).
  · **O'chirish qo'riqchisi:** ishlatilayotgan fayl `MEDIA_IN_USE` (400) va
  qayerda ishlatilgani bilan qaytariladi; UI nechta joyni aytib, keyin
  `force` bilan o'chiradi va bu audit jurnaliga yoziladi. Aks holda kurs
  muqovasi ostidan rasm olib qo'yiladi va **o'chirgan odam buni hech qachon
  bilmaydi** — buni boshqa kimdir topadi.
  · **Egasiz fayllar (qarz yopildi).** `course.service.js` dagi izoh
  to'g'ri edi: "bu faqat bazadagi qatorlarni o'chiradi… har bir video uchun
  butun kalit prefiksini aylanib chiqish kerak va bu yarim tugagan holda
  qoldirilmasligi kerak". Shuning uchun bu **alohida, qayta ishga
  tushirilishi mumkin** pass: `mediaCleanup.service.js` beshta bucketni
  o'z qoidasi bilan tekshiradi — maydонda saqlangan kalit (originals,
  materials, SCORM arxivi), qator id'si bilan nomlangan prefiks
  (renditionlar, SCORM paketlari), yoki o'n ikki joyga yozilgan URL
  (rasmlar).
  · **Ikki qoida buni xavfsiz qiladi:**
    1. **Grace davri** (`MEDIA_ORPHAN_GRACE_DAYS`, standart 7 kun).
    Yuklash **avval obyektni, keyin qatorni** yozadi — grace bo'lmasa,
    yuklash bilan poyga qilgan sweep bir zumdan keyin paydo bo'ladigan
    qatorning faylini o'chiradi. Bu yerdagi yagona "joy bo'shatish emas,
    ishni yo'qotish" turidagi nosozlik.
    2. **Standart holatda faqat hisobot.** Har bir chaqiruvchi o'chirishni
    **aniq so'rashi** kerak (`?apply=true`, `--apply`,
    `MEDIA_CLEANUP_DELETE`). Kechasi ishlaydigan job standart holatda
    hisobot yozadi — buzg'unchi jadval ishi kimningdir qarori bo'lishi
    kerak, standart emas (`BACKUP_ENABLED` bilan bir xil shakl).
  · Yana ikkita ehtiyot: **kutubxonadagi ishlatilmayotgan asset egasiz
  emas** (muallif keyinroq ishlatish uchun yuklagan — sweep o'z
  kutubxonasini yeb qo'ymasin), va **tanish bo'lmagan kalit shakli
  tegilmaydi** (sweep tushunganini o'chiradi, tushuntira olmaganini emas).
  Bucket ro'yxatlanmasa — o'sha bo'lim uchun xato yoziladi, butun sweep
  yiqilmaydi.
  · **Ishga tushirish:** kechasi 04:40 (backup 03:20 da, ikkisi bir xil
  baytlar uchun poyga qilmasin), `POST /media/cleanup` (faqat SUPERADMIN,
  rol bo'yicha — bu platformada hech kim so'ramagan baytlarni o'chiradigan
  yagona chaqiruv) va `npm run media:orphans [-- --apply]`.
  · **Tekshirildi.** `test/mediaLibrary.test.js` — 10 test: papka
  normalizatsiyasi (`../../etc` → `etc`), bir kalitga ikki qator
  bo'lmasligi, papka/qidiruv filtri, kurs muqovasi + dars bloki +
  sertifikat foni bo'yicha usage, `MEDIA_IN_USE` va `force`, o'chib ketgan
  videoning renditionlari, **yangi obyektga tegmaslik**, ishlatilmayotgan
  kutubxona asseti, SCORM prefiksi va arxivi, "hisobot o'chirmaydi".
  HTTP orqali: ro'yxat, papkalar, hisobot (beshta bo'lim), tokensiz 401,
  va rasm yuklanganda kutubxonada paydo bo'lishi.
  · **Chetlanishlar:**
    1. **Faqat rasmlar kutubxonada.** Video, material va SCORM o'z
    joylarida boshqariladi (ular kontent, kutubxona esa qayta ishlatiladigan
    aktivlar uchun). Sweep esa **beshtasini ham** tekshiradi.
    2. **Rasm o'lchamlari (`width`/`height`) yozilmaydi** — buning uchun
    rasmni ochib o'qish kerak, bu esa **9.6** (`sharp`) bilan keladi.
    3. **Sweep prodda hali ishga tushirilmadi** — birinchi hisobotni
    `npm run media:orphans` bilan qo'lda ko'rish kerak: bu deployment
    sweep paydo bo'lishidan oldin ham to'plab kelgan.
- [x] **9.6** **Rasm optimizatsiyasi** — `sharp` → webp
  · Bajarildi — yuklangan har bir rasm **WebP ga qayta kodlanadi**
  (`imageOptimize.js`), o'lchami 2560px bilan cheklanadi va yoniga
  480px'lik **thumbnail** yasaladi.
  · **Nima uchun muhim:** telefondan olingan surat — 2–4 MB JPEG, xuddi
  shu rasm ko'rsatiladigan o'lchamda esa bir necha yuz kilobayt. Buni eng
  ko'p sezadigan odam — **mobil internetda kurs katalogini ochayotgan
  xodim**: hozirgacha har bir muqova to'liq kamera o'lchamida yuklanardi.
  Sinovda 4000×3000 JPEG 88% kichrayди.
  · **Uch qoida:**
    1. **O'tkazib yuborish emas, qayta kodlash.** Qaytadigan baytlar —
    bizning dekoder butun faylni o'qib chiqqandan keyin yasagan baytlar.
    Shu bilan birga **EXIF ham olib tashlanadi**: ish joyining surati GPS
    koordinatasi va qurilma nomini olib yuradi, kurs muqovasi esa buni
    e'lon qilishi kerak emas. (`withExif` bilan yasalgan fikstura ustida
    test bor.)
    2. **O'lcham cheklanadi, lekin kattalashtirilmaydi**
    (`withoutEnlargement`): 64px logotip 2560px ga cho'zilsa, xiralashgan
    va qirq baravar katta fayl bo'lardi.
    3. **Animatsiya saqlanadi.** Animatsion GIF faqat birinchi kadr bilan
    o'girilsa — bu ishonarli hajmdagi **buzuq rasm**, ya'ni umuman
    o'girmagandan yomonroq. Shuning uchun `animated: true`, va **thumbnail
    esa ataylab statik** (kutubxona gridida qirqta animatsiya birga
    o'ynashi kerak emas).
  · **9.5 dagi bo'shliq yopildi:** `mediaAsset` endi `width`, `height`,
  `thumbUrl` va **asl** hajm/mime'ni ham saqlaydi — "bu ilgari 4 MB JPEG
  edi" degan raqamsiz konvertatsiya o'zini oqlayotganini ko'rish mumkin
  emas. Kutubxona gridi va tanlagich thumbnail'ni ishlatadi, bo'lmasa
  to'liq rasmga qaytadi (9.6 dan oldin yuklangan rasmlarda thumbnail yo'q;
  butun bucket'ni qayta kodlash migratsiyaga arzimaydi).
  · **Sweep bilan kelishuv:** thumbnail hech qayerda alohida havola
  qilinmaydi, ya'ni egasiz ko'rinardi — endi uni **egasi bo'lgan qator**
  himoya qiladi (`mediaCleanup` `thumbKey` ni ham hisobga oladi).
  · **Tekshirildi.** `test/imageOptimize.test.js` — 7 test: kamera
  o'lchamidagi JPEG → yarmidan kichik WebP va 2560px chegara, kichik
  rasm kattalashmasligi, EXIF yo'qolishi, animatsion GIF kadrlari,
  thumbnail (kichik, statik, majburiy emas), yuklash yo'li (ikkita obyekt,
  `image/webp`, `mediaAsset` da o'lchamlar va asl hajm) va rasm bo'lmagan
  faylning baribir rad etilishi.
  · **Chetlanishlar:**
    1. **Asl fayl saqlanmaydi** — faqat WebP qoladi. WebP 2026 da hamma
    joyda qo'llab-quvvatlanadi, ikki nusxa saqlash esa bu bandning maqsadiga
    qarshi. Kimga asl kerak bo'lsa — o'zining nusxasi bor.
    2. **`sharp` — native modul.** Serverda `npm install` prebuilt binarni
    oladi (linux arm64/x64), ya'ni deploy'da qo'shimcha qadam yo'q, lekin
    boshqa arxitekturaga ko'chirilganda buni tekshirish kerak.
    3. **Mavjud rasmlar qayta kodlanmagan** — faqat yangi yuklanganlar.
    Kerak bo'lsa, `mediaAsset` bo'yicha aylanib chiqadigan migratsiya
    yozish mumkin; hozircha foydasi migratsiya xarajatidan kam.

---

## BLOK 10 — AI (4 hafta)

- [x] **10.1** `models/aiGenerationJob.model.js`, `jobs/aiGenerationQueue.js`
  · Bajarildi — generatsiya **ish (job)**, so'rov emas: bir kurs konspekti
  o'n soniyalab model vaqti, ya'ni har qanday proksi taymautidan uzun.
  Muallif darhol id oladi va holatni kuzatadi (video yuklash va SCORM
  importidagi bir xil shakl).
  · Uch narsa shundan kelib chiqadi: xato **muallif o'qiydigan joyda**
  saqlanadi ("faylda matn yo'q" foydali, 500 esa yo'q); har bir ishning
  **token sarfi** yoziladi — bu 10.6 dagi byudjetni umuman mumkin qiladigan
  narsa; va ish tugaganda **manba matni `params` dan o'chiriladi** (u bitta
  prompt uchun kirish edi, har bir yuklangan qo'llanmaning nusxasini
  saqlash — o'quvchisi yo'q saqlash xarajati).
  · **Navbat bitta urinish bilan** (`attempts: 1`): har bir qayta urinish —
  yana bir pullik model chaqiruvi, va bu yerdagi xatolar o'tkinchi emas
  (matnsiz manba, parse bo'lmagan javob, rad javobi). Qayta urinish bir xil
  xatoni ikki baravar narxda qaytarardi.
  · **Ikki marta yetkazilgan ish ikki marta yozmaydi** — `PENDING` bo'lmagan
  ish o'tkazib yuboriladi (test bilan qadalgan): aks holda bitta navbat
  takrori bir xil kursni ikki marta yaratib, ikki marta pul sarflardi.
- [x] **10.2** `services/ai/sourceExtract.service.js` (pdf/docx/pptx → matn, serverga)
  · Bajarildi — uch format, uch kutubxona, bitta shartnoma
  (`{ text, blocks, truncated }`): **PDF** `pdfjs` bilan (pleyer allaqachon
  ishlatadigan dvigatel, ya'ni ilovada ko'rinadigan PDF bu yerda ham
  o'qiladi), **DOCX** `mammoth` bilan, **PPTX** esa kutubxonasiz — pptx
  `ppt/slides/slideN.xml` lardan iborat zip va matn `<a:t>` yugurishlari
  ichida; `jszip` va XML parser allaqachon bor (SCORM ikkisini talab
  qiladi), slaydlar tartibi esa aynan o'qish tartibi. **`slide10`
  `slide2` dan keyin** kelishi test bilan qadalgan (leksik saralash tuzoqi).
  · **Serverda, brauzerda emas:** model chaqiruvi shu yerda bo'ladi, ya'ni
  matn baribir shu yerga kelishi kerak; parserni mijozga yuborish — matnni
  qaytib olib, unga **ishonish** degani. Ikkinchisi: ilova bu formatlarni
  brauzerda **ko'rish** uchun ham parse qiladi, lekin ko'rish maketni,
  prompt esa o'qish tartibidagi prozani xohlaydi.
  · **Matnsiz fayl rad etiladi** (`SOURCE_HAS_NO_TEXT`) — PDF uchun bu
  deyarli har doim skan degani, va "bu skan, avval OCR kerak" — muallif
  qila oladigan javob; yo'qdan yasalgan bo'sh konspekt esa emas.
  · Chegara **400 000 belgi**: bu fayl haqida emas, **prompt** haqida —
  1M kontekstda ko'rsatma va uzun tuzilgan javob uchun joy qoladi, undan
  kattasidan yasalgan konspekt esa konspektning konspekti bo'ladi. Kesish
  paragraf chegarasida (yarim gap modelga hujjatning oxiri bo'lib
  ko'rinadi va u haqida ishonchli javob yozadi).
- [x] **10.3** `aiCourse.service.js` — struktura + dars (natija har doim `DRAFT`)
  · Bajarildi — hujjatdan yoki mavzudan kurs: `Course` + `Topic` lar +
  `Lesson` lar, **hammasi `DRAFT`**, yuqoridan pastgacha (test bilan
  qadalgan). Sababi oddiy: generatsiya qilingan kurs — kompaniyani hech
  qachon ko'rmagan narsa yozgan **birinchi qoralama**; u tuzilmani
  to'g'ri, tafsilotlarni esa xato oladi, va noto'g'ri chiqarilgan kursni
  qaytarib olishga majbur bo'lgan muallif bu funksiyani boshqa
  ishlatmaydi.
  · **Javob JSON sxema bilan so'raladi** (`output_config.format`), prozadan
  ajratib olinmaydi: "faqat JSON qaytar" deb yozib umid qilish — bitta
  hujjat modelni oldin bir gap tushuntirishga undaganda yiqiladigan
  generator.
  · **Modelga ruxsat berilgan bloklar ataylab cheklangan**: `HEADING`,
  `TEXT`, `CALLOUT`, `QUOTE`, `TABLE`, `CODE`, `DIVIDER`. U rasm yuklay
  olmaydi va mavjud bo'lmagan videoga havola qila olmaydi — hech narsaga
  ishora qiladigan blok qo'lda tuzatilishi kerak bo'lgan kontent.
  · **Modelning HTML'i ham o'sha sanitizer'dan o'tadi** (`toStoredBlocks`)
  — "Claude'dan kelgan" ishonch chegarasi emas. Testda `onclick` va
  `<script>` olib tashlanadi, `<strong>` qoladi.
  · Prompt modelga: manbada **yo'q faktni, raqamni, normani o'ylab
  chiqarmaslik** (manba yupqa bo'lsa — kamroq dars), taqiq va xavfni
  `CALLOUT`ning `DANGER`/`WARNING` variantida berish, va `[JSHSHIR]`
  kabi o'rin egallovchilarni **qayta ishlab chiqmaslik**.
  · **Streaming**: kurs + darslar o'n minglab token, ya'ni oqimsiz so'rov
  SDK taymautiga urилardi (`aiRun.js` chegaradan yuqorisini oqim bilan
  yuboradi). `max_tokens` ga urilgan javob esa `AI_TRUNCATED` — parse
  bo'lgan bo'lsa ham, u kesilgan JSON.
- [x] **10.4** `aiQuiz.service.js` — yangi `Question` modeliga
  · Bajarildi — savollar **mavzuning o'z darslaridan** yoziladi: mavzu
  darslari matnga qaytariladi (bloklar prozaga, jadval qatorlarga) va
  manba shu bo'ladi. Sababi: o'quvchi hozir o'qigan darsdan yasalgan
  savolni **tekshirib bo'ladi**, modelning umumiy bilimidan yasalgani esa
  kurs hech qachon aytmagan narsa haqida.
  · **Natija — savollar banki, tirik test emas.** Bank ko'rib chiqiladi,
  tahrirlanadi va qayta ishlatiladi (4.1 ning ma'nosi shu); tirik test
  yaratish tekshirilmagan savollarni o'quvchi oldiga qo'yardi. Bank
  `ai` tegi bilan belgilanadi.
  · **To'rt tur, o'n to'rtta emas:** `SINGLE_CHOICE`, `MULTI_CHOICE`,
  `TRUE_FALSE`, `SHORT_ANSWER`. Moslash (`MATCHING`) va ketma-ketlik
  (`SEQNCE`) savollari **aynan bitta** to'g'ri joylashuvni talab qiladi;
  modeldan so'ralganda u ishonarli, lekin ko'rib chiqilganda **noaniq**
  juftliklar yozadi — bu savol yo'qidan yomonroq, chunki tekshiruvchi
  buni sezishi kerak.
  · **Har bir savol o'sha validatordan o'tadi** (`PAYLOAD_SCHEMAS`) —
  muallif yozgani o'tadigan validatordan. Aynan shu joyda "bitta savolda
  bitta to'g'ri javob" qoidasi majburlanadi: JSON sxema buni ifodalay
  olmaydi, ikki to'g'ri javobli single-choice savol esa **hammani xato**
  deb baholaydi. O'tmagan savol saqlanmaydi va sababi bilan hisobotda
  ko'rinadi; birortasi ham o'tmasa — ish **xato** deb belgilanadi (bo'sh
  bank "ishladi" degan taassurot beradi).
  · **Variant id'lari serverda beriladi** (`o1`, `o2`), modeldan
  so'ralmaydi: urinish o'zi tanlagan id'ni yozadi, ya'ni id'lar barqaror
  va savol ichida yakka bo'lishi shart, model esa identifikator o'ylab
  chiqarishga qo'yilsa ertami-kechmi bittasini takrorlaydi. **Bu testda
  topilgan xato edi** — birinchi versiya id bermasdi va validator
  savollarni jimgina rad etardi.
  · **Yozilmagan mavzu rad etiladi** (`AI_NO_SOURCE_CONTENT`) — faqat
  video va fayldan iborat mavzuda o'qiydigan narsa yo'q, sarlavhadan
  savol o'ylab chiqarishdan ko'ra shuni aytish to'g'ri.
  · Ruxsat: **`quiz:configure`**, `course:create` emas — savol yozish
  baholash muallifining ishi va bu ikkisi ataylab alohida kalit (2.4).
  · UI: muallif ishlayotgan joyda — mavzu kontent panelida "AI savollar"
  tugmasi.
  · **Tekshirildi** — 5 test: mavzu matnini yig'ish (markup yo'q, jadval
  qatorlari bor), bankka tushishi va payload shakllari, validator rad
  etgan savol saqlanmasligi, yozilmagan mavzu, va to'rt turning
  ro'yxatiga qadalgan test.
- [x] **10.5** `aiTranslate.service.js` + `models/contentTranslation.model.js`
  (struktura va ID'lar saqlanadi)
  · Bajarildi — tarjima **qatlam**, nusxa emas. Muqobil variant (kursni
  ikkinchi kursga ko'chirish) ko'p platformalar qiladigan narsa va bir oy
  ichida buziladi: ikkisi bir-biridan uzoqlashadi, progress o'quvchi
  qaysi birini ochganiga yoziladi, asl nusxadagi tuzatish esa nusxaga
  hech qachon yetib bormaydi.
  · **Shuning uchun id'lar saqlanishi shart** — va bu dizaynning o'zidan
  kelib chiqadi: modelga `{ id, text }` ro'yxati beriladi va u **o'sha
  id'larni** tarjima qilingan matn bilan qaytaradi. U blok turlarini,
  tartibni yoki tuzilmani ko'rmaydi ham, yoza olmaydi ham. Ya'ni tarjima
  darsni qayta tartiblay olmaydi, blok o'ylab chiqara olmaydi, birortasini
  tashlab keta olmaydi; 9.1 dan beri progress yoziladigan blok id'lari esa
  **konstruksiya bo'yicha** saqlanadi. Prompt ham kichik bo'ladi: o'ttiz
  bloklik dars — o'ttizta qisqa satr, qayta chiqarish kerak bo'lgan hujjat
  emas.
  · **`fields` yo'l bo'yicha kalitlanadi** (`title`,
  `blocks.<blockId>.text`, `blocks.<id>.rows.2.1`), hujjat shaklining
  ikkinchi nusxasi emas. **`CODE` bloki ataylab tarjima qilinmaydi** —
  identifikatorni tarjima qilish namunani buzadi.
  · **Model o'ylab chiqargan id e'tiborsiz qoldiriladi** (test bilan):
  yuborilmagan id qatlamga asl hujjatda yo'q maydonni yozardi va o'qishda
  birlashtirish darsda **hech kim yozmagan paragrafni** paydo qilardi.
  Yetishmagan id'lar esa **hisobda ko'rsatiladi** ("3 ta yetishmadi"),
  chunki jimgina bo'shliq — asl tilida qolgan paragraf.
  · **Faqat tasdiqlangan tarjima o'quvchiga beriladi**: o'qilmagan mashina
  tarjimasi xodim oldida — bu funksiya oldini olishi kerak bo'lgan asosiy
  nosozlik. Muallif (kurs boshqarishi mumkin bo'lgan) qoralamani ko'radi.
  Qayta tarjima qilinsa — holat yana `DRAFT` (u o'qilmagan).
  · Bir til uchun **bitta** qator (unique indeks + upsert): ikkita qator
  "qaysi biri beriladi" degan savolni tanga tashlashga aylantirardi.
  · **Yetkazish:** `GET /lessons/:id?lang=ru` — tuzilma har doim asl
  qatordan, faqat satrlar almashtiriladi; birlashtirilgan bloklar ham
  **o'sha sanitizer'dan** o'tadi (tarjima "teglarni saqladim" deb yangi
  teg qo'shgan bo'lishi mumkin).
  · UI: dars editorida tarjima paneli (til tugmalari, holat, tasdiqlash,
  o'chirish).
  · **Tekshirildi** — 5 test: faqat so'zlar yuborilishi (markup yo'q,
  jadval kataklari alohida, `CODE` chetda), qatlamning birlashishi (bir
  xil id, bir xil turlar, boshqa so'zlar), o'ylab chiqarilgan id va
  yetishmagan id, bir tilga bitta qator + qayta `DRAFT`, va kursning faqat
  sarlavha/izohi.
  · **Chetlanish:** hozircha faqat **dars** o'qish yo'lida `?lang=`
  qo'llaniladi. Katalogdagi kurs sarlavhalari, mavzu nomlari va boshqa
  o'qish yo'llari asl tilda qoladi — buning uchun har bir o'qish joyi
  qatlamdan so'rashi kerak, bu esa alohida ish (12.x dagi kontent i18n).
- [x] **10.6** Token byudjeti (`Settings.ai.monthlyTokenBudget`), AI audit,
  PII himoyasi testi
  · Bajarildi — uchtasi ham 10.1–10.5 bilan birga qurildi, chunki ular
  chegaradagi narsalar:
  · **Byudjet.** `Settings.ai.monthlyTokenBudget` (0 = chegara yo'q) va
  alohida `generationEnabled`. Chegara **so'rov soni emas, token**: bir
  darsdan test yozish va 200 betlik qo'llanmadan kurs yasash ikki
  darajaga farq qiladi, so'rovlarni sanash esa yo arzonlarini bloklardi,
  yo bir nechta qimmatini o'tkazib yuborardi. Har bir ish o'z sarfini
  **API ning o'z raqamlari** bilan yozadi (taxmin emas) — byudjetni
  umuman mumkin qiladigan narsa shu.
  · Byudjet ish **boshlanishidan oldin** tekshiriladi va **keyin**
  yoziladi, ya'ni bitta ish chegaradan **o'tib ketishi mumkin** — bu
  halol xatti-harakat: muqobili "chegaradan oshishi mumkin" degan har
  qanday so'rovni rad etish, bu esa har oyning oxirgi uchdan birini
  bloklardi.
  · **Alohida o'chirgich** ataylab: AI ni butunlay o'chirmoqchi bo'lgan
  kompaniya chegarani nolga qo'yib, mualliflar "byudjet tugadi" degan
  sababni o'qishiga majbur bo'lmasligi kerak (`AI_DISABLED` vs
  `AI_BUDGET_EXCEEDED`).
  · **Audit:** har bir ish `AI_GENERATION_REQUESTED` va
  `AI_GENERATION_COMPLETED` sifatida yoziladi — turi, manba nomi,
  belgilar soni, natija va token sarfi bilan. **Manba matni yozilmaydi**:
  audit jurnalini odamlar o'qiydi va uning ichidagi yuz kilobayt
  qo'llanma hech kimga yordam bermaydi.
  · **PII himoyasi (`piiRedact.js`)** — generatsiya mualliflar o'z
  kompyuteridan olgan hujjatlar ustida ishlaydi, HR bo'limidagi hujjatlar
  esa o'quv materiali emas: "xavfsizlik brifingi" eksporti odatda
  **davomat ro'yxatini** olib yuradi, bu yerda esa davomat ro'yxati
  JSHSHIR degani. Model API'siga yuborilsa — hech kim so'ramagan va hech
  kim sezmagan shaxsiy ma'lumot oshkoraligi.
  · Shuning uchun matn **chiqishda** tozalanadi (prompt qurilishidan
  oldin): JSHSHIR (14 raqam), pasport (AA1234567), 16–20 raqamli hisob,
  e-mail, telefon. **O'chirish emas, o'rin egallovchi**: `[JSHSHIR]` bo'lgan
  gap hamon gap bo'lib o'qiladi va model javobi manba shaklini saqlaydi.
  Prompt modelga o'rin egallovchilarni **qayta ishlab chiqmaslikni** ham
  aytadi.
  · **Bu poydevor, kafolat emas** — ism naqsh bilan aniqlanmaydi va
  tozalanmaydi; platforma majburlay oladigan qoida shu: **identifikatorlar
  sayohat qilmaydi**. Bu checklistda ham, kodda ham shunday yozilgan.
  · **Tekshirildi** — 6 test: har bir identifikator turi, **har bir
  qoidaning haqiqatan ishga tushishi** (ro'yxatga qo'shilib, hech qachon
  chaqirilmaydigan qoida — aynan shu test tutadigan nosozlik), **oddiy
  kurs matni tegilmasligi** ("2026 yilda 15 kishi" `[NUMBER]` ga
  aylanmasin), redaksiyaning **prompt qurilishidan oldin** bo'lishi
  (yuborilgan satr tekshiriladi), byudjetning yig'ilishi, tugagan
  byudjetning ishni **boshlanishidan oldin** to'xtatishi va
  `AI_DISABLED`.
  · UI: admin sozlamalarida "AI byudjeti" kartasi (faqat SUPERADMIN) va
  AI sahifasida shu oyning sarfi.

---

## BLOK 11 — Korxona (5 hafta)

- [x] **11.1** `models/apiKey.model.js`, `middlewares/apiKeyAuth.middleware.js`,
  per-key rate limit, `/api/public/v1`
  · Bajarildi — kalit **uzun paroli bor foydalanuvchi emas**. Farq uch
  joyda muhim: kalit rol emas, **aniq va tor scope ro'yxatini** olib
  yuradi; o'z **so'rov byudjeti** bor (har daqiqada so'rov yuboradigan
  integratsiya — normal trafik, odamning limiterida esa suiiste'molga
  o'xshaydi); va uni **hech kimning loginiga tegmasdan** bekor qilish
  mumkin.
  · **Sir saqlanmaydi.** Saqlanadigan narsa: `prefix` (ochiq, va qidiruv
  kaliti) va butun kalitning **argon2 hash**'i — parol bilan bir xil
  muomala, bir xil sabab bilan: oqib ketgan baza ishlayotgan
  ma'lumotlarni bermasligi kerak. To'liq kalit **bir marta**, yaratilganda
  ko'rsatiladi. Prefiks/sir bo'linishi hash'ni amaliy qiladi: ochiq yarmi
  bo'lmasa, tekshiruv har so'rovda **butun jadval** ustidan argon2
  taqqoslash bo'lardi.
  · **Yomon kalitga bitta javob.** `verify()` faqat `null` qaytaradi —
  bekor qilinganmi, muddati o'tganmi, umuman bo'lmaganmi, farq qilmaydi.
  Aynan shu — prefikslarni sanab ko'rayotgan odam bilishni xohlaydigan
  narsa (test bilan qadalgan: ikkita xato holatning **xabari ham bir xil**).
  · **Bitta avtorizatsiya implementatsiyasi.** Middleware kalit
  scope'larini `req.user.permissions` ga qo'yadi, ya'ni ommaviy route
  aynan **o'sha `requirePermission`** bilan yopiladi. Ikkinchi, parallel
  tekshiruv yozilsa — u ertami-kechmi birinchisidan farq qila boshlaydi.
  Sintetik rol nomi `API_KEY`: rol bo'yicha yopilgan route'lar
  (`requireRole`) uni **konstruksiya bo'yicha** rad etadi.
  · **Ikki eshik tutashmaydi** (test bilan): sessiya tokeni ommaviy API'da
  401, kalit esa yopiq API'da 401 (u JWT emas). Ommaviy API **faqat
  o'qiydi**: kalit bilan odam yozish yoki kursni o'chirish — boshqa
  ko'rib chiqishga muhtoj boshqa mahsulot.
  · **Per-key rate limit Redis'da sanaladi**, `express-rate-limit` bilan
  emas: uning standart do'koni **jarayon xotirasi**, API esa pm2 cluster
  rejimida ishlaydi — 60/daqiqa amalda 60 × worker bo'lardi, bu esa
  hech kim hisoblab bo'lmaydigan chegara. `INCR` + `EXPIRE` esa
  worker'lar bo'ylab aniq. `X-RateLimit-*` sarlavhalari qaytariladi
  (mijoz rad etilishidan **oldin** sekinlashsin). Redis xato bersa —
  **ochiq yiqiladi**: aks holda hisoblagich yo'qligi ishlayotgan
  integratsiyani to'xtatadi, ya'ni faraziy yuklama uchun haqiqiy uzilish.
  · **PII alohida qaror.** `includePii` (standart o'chиq) — "xodimlar
  ro'yxatini o'qish mumkin" va "hammaning JSHSHIR'ini o'qish mumkin" bir
  narsa emas, ikkinchisi esa ma'lumotlarni himoya qilish suhbatida paydo
  bo'ladigan narsa. O'chiq bo'lsa JSHSHIR maskalanadi (`**********1234`)
  va e-mail bo'sh qaytadi. HR sinxronizatsiyasiga kerak; tugallanishlarni
  sanaydigan panelga kerak emas.
  · **Payload'lar alohida yozilgan** (`publicApi.service.js`), ilovaning
  o'zi ishlatadiganlari emas: SPA o'qiydigan shakllar SPA bilan
  o'zgaradi, ekran qayta dizayn qilingani uchun buzilgan integratsiya esa
  — versiyalangan ommaviy API aynan shuning oldini olish uchun bor.
  Ular ataylab **kichikroq**: HR tizimiga odamning id'si, ismi va qayerda
  ishlashi kerak, diqqat kuzatuvi sozlamalari emas.
  · Endpointlar: `GET /me` (integrator birinchi chaqiradigan va "nega
  403 olaman"ni support suhbatisiz javob beradigan), `/users`,
  `/courses` (standart holatda **faqat PUBLISHED** — qoralama kimningdir
  tugallanmagan ishi), `/assignments` (`completedSince` bilan — "kechadan
  beri kim nimani tugatdi" bitta so'rov), `/certificates` (**serial**
  bilan, chunki boshqa tizim aynan shuni saqlaydi va ommaviy tekshiruv
  sahifasi ham shuni tekshiradi).
  · Kalitlarni boshqarish **SUPERADMIN roli** bilan yopilgan (ruxsat
  bilan emas): kalit — butun kompaniyani o'qish huquqining uzoq muddatli
  granti, uni yaratgan odamdan uzoq yashaydi va foydalanuvchi hisobi
  kabi hech qaysi ekranda ko'rinmaydi. Bu — doimiy kurs o'chirish bilan
  bir xil sinf.
  · **Tekshirildi** — 13 test + HTTP orqali: scope ro'yxati, kalit
  yaratish (bir marta ko'rsatish), ommaviy API'da ishlashi, maskalangan
  JSHSHIR, yo'q scope'da 403, kalit yopiq API'da 401, JWT ommaviy API'da
  401, va **daqiqada 5** chegarasi (6-so'rov 429 + `Retry-After`).
  · **Chetlanish:** kalit **butun kompaniyani** o'qiydi yoki hech narsani
  — bitta bo'lim bilan cheklash scope'lar ustiga ko'rinmas ikkinchi filtr
  qo'shardi, va integratsiyaning jimgina xodimlarning bir qismini olishi
  rad etilishidan yomonroq.
- [x] **11.2** `models/webhook.model.js`, `webhookDelivery.model.js`,
  `jobs/webhookQueue.js` (HMAC + 5× retry)
  · Bajarildi — 11.1 ning **ikkinchi yarmi**. Kalit boshqa tizimga savol
  berish imkonini beradi; webhook esa **savol berish shart emasligini**
  bildiradi. Bitta tugallanishni bir soat ichida payqash uchun HR tizimi
  `/api/public/v1/assignments?completedSince=` ni har daqiqada so'rashi
  kerak — ikki tomonning ham vaqti shunga ketadi, tugallanish esa yana bir
  daqiqa kechikib keladi.
  · **Voqealar katalogi yopiq** (`webhookEvents.js`, 6 ta):
  `user.created`, `user.deactivated`, `assignment.created`,
  `course.completed`, `course.reopened`, `certificate.issued`. Ro'yxatdagi nom — **majburiyat**;
  ro'yxatda yo'q nom obuna yaratilganda **rad etiladi**, jimgina hech
  qachon yetkazilmaydigan qilib qoldirilmaydi. **Wildcard yo'q**:
  "hammasiga" obuna bo'lgan endpoint o'zi yozilgandan **keyin** o'ylab
  topilgan voqealarni ola boshlaydi, va bu haqda birinchi xabar — qabul
  qiluvchining tanimagan payload'da yiqilishi.
  · **Payload'lar ham alohida yozilgan** (11.1 dagi sabab bilan). Bitta
  qo'shimcha qoida: **JSHSHIR va e-mail hech qachon yuborilmaydi.**
  Ommaviy API'da kalitga aniq ruxsat berilishi mumkin, chunki u yerda
  qabul qiluvchi autentifikatsiyadan o'tib, **aynan o'sha yozuvni**
  so'ragan. Webhook — teskari yo'nalish: platforma o'zi, boshqa odamning
  TLS'i orqali, oradagi har bir uzelda jurnalga tushishi mumkin bo'lgan
  manzilga **surib beradi**. Identifikator kerak bo'lsa — kalit bilan
  o'qib olinadi.
  · **Imzo: `t=<unix>,v1=<hex>`** — `HMAC-SHA256(secret, "${t}.${body}")`
  (Stripe/GitHub shakli, chunki qabul qiluvchida ehtimol allaqachon shu
  uchun kod bor). **Vaqt tamg'asi imzo ichida** — ataylab: faqat tanani
  imzolash **muddatsiz haqiqiy token** yasaydi, ya'ni bitta yetkazishni
  ushlagan odam uni istalgan vaqtda qayta yuborishi mumkin va imzo
  o'tadi. Tamg'a imzolangani uchun eskirganini rad etish mumkin, uni
  o'zgartirish esa MAC'ni buzadi (test: 6 daqiqadan keyin o'tmaydi va
  soxta tamg'a ham o'tmaydi). `v1=` — versiya markeri: algoritm
  o'zgarishi kerak bo'lsa, bir reliz davomida `v1` va `v2` birga
  yuboriladi. Solishtirish `timingSafeEqual` bilan: birinchi xato baytda
  to'xtaydigan taqqoslash soxta MAC'ning **qancha qismi to'g'ri**
  bo'lganini oshkor qiladi, bu esa qolganini bayt-bayt qurishga yetadi.
  · **Sir (`secret`) ochiq matnda saqlanadi** — kalitning hash'idan
  farqli, va assimetriya ayni maqsad: kalitni biz **tekshiramiz** (hash
  yetarli va aniq yaxshiroq), imzoni esa **o'zimiz yasaymiz** — HMAC har
  yuborishda sirning o'zini talab qiladi. Zararni cheklaydigan narsa
  boshqa: bu sir bu yerda **hech narsaga ruxsat bermaydi** — oqib ketsa,
  u bilan **qabul qiluvchiga** soxta yetkazish yuborish mumkin, bizdan
  biror narsa o'qish emas. Bir marta ko'rsatiladi va **o'z joyida
  aylantiriladi** (`rotate-secret`): voqealar, URL va yetkazish tarixi
  endpoint'ga tegishli, sirga emas.
  · **5 urinish, 10 sekunddan boshlab eksponensial** (10s, 40s, ~2,5m,
  ~10m, ~40m). Qayta urinish shart emas emas: qabul qiluvchi — boshqa
  odamning serveri, va eng ko'p uchraydigan xato — biz chaqirgan paytda
  ketayotgan deploy. Lekin **abadiy** urinish ham xato: kechagi voqea
  ertaga yetib borsa, qabul qiluvchi uchun bu ko'pincha umuman
  yetmaganidan yomonroq, chunki uning holati allaqachon oldinga ketgan.
  · **`webhookDelivery` yozuvi yuborishdan OLDIN yoziladi** — yozuvning
  butun qiymati shu tartibda: HTTP chaqiruvi umuman qaytmasa ham,
  yetkazish PENDING sifatida **bor**, ya'ni "urindik, nimadir bo'ldi"
  bilan "hech urinmadik" farqlanadi. Keyin yozilgan jurnal esa faqat
  jarayon omon qolgan xatolarni yozadi. Yozuv shu bilan birga webhook
  keltiradigan yagona qiziq support savoliga — "bizga kelmadi" —
  javob: qabul qiluvchi **qaytargan status** va (qisqartirilgan) tanasi
  sabab bo'ladi. TTL 30 kun, Mongo'ning `expireAfterSeconds` bilan: hech
  kim eslab turishi kerak bo'lgan tozalash skripti yo'q.
  · **SSRF — bu yerdagi eng jiddiy xavf** va ikki darvoza bilan yopilgan
  (`webhookTarget.js`): URL'ni operator beradi, so'rovni esa platforma
  **tarmoq ichidan** yuboradi va yo'lda **imzolaydi** — ya'ni tekkan
  joyi haqiqiy chaqiruvni ko'radi. Bu serverda "ichkari" degani yana
  olti qo'shni sayt, Redis, MinIO va Mongo. (1) obuna yaratilganda
  **literal tekshiruv**: faqat https (prod'da), loopback/10./172.16-31./
  192.168./169.254 (bulut metadata!)/100.64-127. (Tailscale)/`::1`/`fc00::`
  va URL'dagi parol rad etiladi; (2) **har yuborishdan oldin DNS**, chunki
  kecha ochiq hal bo'lgan nom bugun 127.0.0.1 ga hal bo'lishi mumkin —
  faqat yaratilganda tekshirish operator o'zi boshqaradigan DNS yozuvi
  bilan chetlab o'tiladi. **Barcha** manzillar tekshiriladi, birinchisi
  emas: bittasi ochiq, ikkinchisi ichki bo'lgan javob — tasodif emas, eng
  qiziq holat. `redirect: 'manual'` — 3xx **muvaffaqiyat emas**: imzolangan
  so'rovni hech kim tasdiqlamagan URL'ga olib borish bu darvozalarni
  bekor qiladi. To'liq himoya emas (DNS-rebinding oynasi qoladi —
  yopish uchun hal qilingan IP'ni **socket'ga qadash** kerak), lekin narxi
  "URL yozish"dan "poygada g'olib chiqish"ga ko'tariladi, endpoint esa
  baribir faqat SUPERADMIN qo'lida.
  · **20 marta ketma-ket muvaffaqiyatsizlikdan keyin endpoint o'zini
  o'chiradi** va sababini yozadi (UI da matn bilan ko'rinadi): bir hafta
  o'lik qabul qiluvchi uchun har voqea 5 ta befoyda urinish qo'shadi va
  jurnal ular bilan to'ladi. Faqat **oxirgi** urinish hisoblanadi (har
  urinish hisoblansa chegara 4 voqeada yetardi), muvaffaqiyat esa
  hisoblagichni **nolga tashlaydi** (kamaytirmaydi: ishlaydigan endpoint
  "kamroq buzuq" emas). Qayta yoqish hisoblagichni tozalaydi — aks holda
  tuzatilgan endpoint birinchi voqeada yana o'chib qolardi.
  · **Qayta yuborish (`replay`) — yangi yozuv**, `replayOf` bilan: xato
  ham tarixning bir qismi ("urindik, o'chgan edi, seshanbada qayta
  yubordik" — support savolining javobi), birinchi urinishni ustidan
  yozish esa uni o'chiradi. Payload **ko'chiriladi, qayta qurilmaydi**:
  qayta yuborishning maqsadi — qabul qiluvchi **o'tkazib yuborgan
  narsani** yuborish, bugungi ma'lumotdan qurilgan payload esa o'sha
  id bilan **boshqa voqea** bo'lardi. Yana `ping` (katalogda yo'q,
  ataylab: unga hech kim obuna bo'lmaydi) — integratsiyaning birinchi
  savoli "manzil ishlaydimi, imzo tekshiriladimi", va bunga halol javob
  — bir narsa yuborish.
  · **Konvert har voqeada bir xil**: `{ id, event, occurredAt, data }`.
  `id` — yetkazish id'si, ya'ni **dublikatni ajratish kaliti**: webhook
  konstruksiya bo'yicha *at-least-once* (bizga yetib kelmagan 200 qayta
  yuboriladi), shuning uchun qabul qiluvchiga dublikatni qanday ajratishni
  **aytish** — buni yashirishdan arzon. `occurredAt` — voqea **bo'lgan**
  vaqt, biz yuborgan vaqt emas: to'rtinchi urinishda bir soatdan keyin
  o'tgan yetkazish bir soatlik voqeaga o'xshamasligi kerak.
  · Har endpoint uchun **alohida yozuv** (umumiy emas): ikki qabul
  qiluvchi mustaqil yiqiladi, umumiy urinish hisoblagichi esa allaqachon
  biriga yetib borgan yetkazishni qayta yuborardi.
  · `emitWebhookEvent` **hech qachon exception tashlamaydi va so'rov
  yo'lida natijasi kutilmaydi**: webhook — kimningdir haqiqiy ishining
  yon effekti, qabul qiluvchining DNS xatosi esa o'quvchining kurs
  tugatishini yiqitmasligi kerak. Xato jurnalga va yetkazish yozuviga
  tushadi, javobga emas. Worker'da concurrency **10** — bu yerdagi eng
  yuqori: har ish bitta tashqi HTTP chaqiruvi va vaqtining hammasini
  **kutishda** o'tkazadi, chegara CPU yoki xotira emas, socket; bitta
  sekin qabul qiluvchi boshqa endpointlarning voqealarini ushlab
  turmasligi kerak.
  · Boshqarish — **SUPERADMIN roli** (11.1 dagi sabab, bir pog'ona
  kuchliroq): obuna platformani kompaniya ma'lumotini **tashqariga**,
  operator tanlagan manzilga yuborishga majbur qiladi, so'rov esa tarmoq
  ichidan chiqadi.
  · **Tekshirildi** — 25 test (`test/webhooks.test.js`; qabul qiluvchi —
  loopback'dagi **haqiqiy HTTP server**, mock'langan `fetch` emas: imzo,
  sarlavhalar va timeout faqat uchidan-uchiga ma'noga ega) + **HTTP orqali
  haqiqiy worker bilan**: katalog, SSRF rad etishlari (`169.254.169.254`,
  `127.0.0.1`, `[::1]`, http, URL'dagi parol), obuna yaratish (sir bir
  marta), `ping` → qabul qiluvchi **imzoni o'zi tekshirdi va o'tdi**,
  haqiqiy `user.created` / `assignment.created` (odam yaratildi, kurs
  tayinlandi), o'quvchi darsni tugatgach **haqiqiy `course.completed`**
  (`completionPercent: 100`), `user.deactivated`, 500 qaytaradigan qabul
  qiluvchida **haqiqiy qayta urinish** (qabul qiluvchi `attempt: 1` va
  `2` ni ko'rdi, yozuv PENDING/HTTP 500 va uning matni bilan), tuzalgach
  `replay` (`replayOf` bilan, alohida id), sir aylantirilgandan keyin
  eski sir bilan tekshiruv **o'tmadi**, pauzaga qo'yilgan endpointga
  hech narsa yuborilmadi, `limit=9999` da 400. Sinov ma'lumotlari
  (obunalar, yetkazishlar, odam, kurs, dars, audit) tozalandi.
  · **Kuzatilgan xatti-harakat:** qayta urinish va qo'lda qayta yuborish
  **birga ishlab**, qabul qiluvchi bitta voqeani ikki marta oldi (BullMQ
  3-urinishi qabul qiluvchi tuzalgandan keyin o'tdi, biz esa allaqachon
  `replay` qilgan edik). Bu — *at-least-once*ning aynan o'zi, va
  konvertdagi `id` shu holat uchun bor.
  · **Chetlanish:** obuna **o'qish** voqealarini yubormaydi (kim nimani
  ochdi) — bu telemetriya oqimi, webhook emas, va uni obuna qilib
  qo'yish qabul qiluvchini kunda million so'rov bilan ko'madi.
  · **Chetlanish:** `WEBHOOK_ALLOW_PRIVATE_TARGETS` sozlanmagan bo'lsa
  `NODE_ENV` ga qarab ishlaydi (dev/test'da yoniq, prod'da o'chiq):
  ishlab chiqishda qabul qiluvchi loopback'da bo'ladi, prod'da esa
  ochiq qo'yish — kimdir yozib qo'yishi kerak bo'lgan qaror.
- [x] **11.3** OpenAPI — `zod-to-openapi`, `GET /openapi.json`, `/api/docs`
  · Bajarildi — lekin **hujjat qo'lda yozilmaydi, router'lardan
  generatsiya qilinadi**. `docs/api-contract.md` qo'lda yozilgan va API'ni
  kimdir oxirgi marta tahrirlashni eslaganday tasvirlaydi; yonma-yon
  yuritilgan hujjat bir oyda **eng yomon tarzda** eskiradi — nomi
  o'zgargan endpointni hujjatlaydi va qo'shilgan uchtasini
  tashlab ketadi.
  · **Middleware'lar o'zlarini teglaydi.** `validateBody(schema)`,
  `validateQuery`, `validateParams`, `requirePermission`,
  `requireAnyPermission`, `requireRole`, `authenticate`, `apiKeyAuth`,
  `verifyPlaybackToken` — hammasi closure qaytaradi, va o'sha closure'ga
  `handler.openapi = {...}` yopishtiriladi. Generator esa **haqiqiy
  zanjirdan** o'qiydi: hech narsa ikkinchi fikr emas. Shuning uchun
  endpoint rol ostida turib "ochiq" deb hujjatlanishi mumkin emas.
  · **`routeInventory.js` Express stack'ini kezib chiqadi** (370 route).
  Muhim qismi — **router darajasidagi `use`ni pastga olib tushish**:
  `webhooksRouter.use(authenticate)` va `.use(requireRole(SUPERADMIN))`
  faylning har bir route'ini qo'riqlaydi, lekin **hech qaysisida
  ko'rinmaydi** — buni hisobga olmagan generator butun faylni ochiq deb
  yozardi (test bilan qadalgan).
  · **Zaif joyi bitta va u to'g'ri tomonda:** Express 4 mount prefiksini
  mounted string emas, `layer.regexp` sifatida saqlaydi, shuning uchun
  prefiks regexp'dan tiklanadi. Ya'ni bu kod **Express'ning major
  versiyasiga** nisbatan mo'rt, bizning o'zgarishlarimizga emas — bizning
  router'lar har hafta o'zgaradi, Express 4 esa yo'q.
  · **Tavsiflar mexanik, ataylab.** Har endpoint uchun qo'lda proza yo'q,
  chunki aynan proza chiriydi. Mashina aytadigan narsa: metod, path, qaysi
  token ochadi, qaysi ruxsat kerak, tana qanday bo'lishi kerak — hammasi
  konstruksiya bo'yicha rost.
  · **Konvert — komponent** (`SuccessEnvelope` / `ErrorEnvelope`), 370
  marta takrorlanmaydi (hujjat bir necha megabayt va o'qib bo'lmas
  bo'lardi). `data` **ataylab tipsiz**: bu kodda javob shakllari hech
  yerda validatsiya qilinmaydi, ya'ni bu yerdagi sxema **hech narsa
  ta'minlamaydigan da'vo** bo'lardi. Xatoda `code` — integratsiya
  shoxlanadigan barqaror yarmi, `message` — odam uchun.
  · Endpoint faqat **o'zi qaytara oladigan** status kodlarini sanaydi:
  ochiq endpoint 403 qaytarmaydi, va uni ro'yxatga qo'shish — shovqin.
  · **Server sifatida `/` (nisbiy)**, absolut manzil faqat
  `API_PUBLIC_URL` sozlangan bo'lsa qo'shiladi. So'rov sarlavhalaridan
  **hech qachon** qurilmaydi: Cloudflare tunnel ostida
  `X-Forwarded-Proto` https deployment'da ham `http` deydi, va
  integratorlarga `http://` manzil beradigan hujjat nisbiy path
  beradiganidan yomonroq (bu xato bir marta barcha material yuklab
  olishlarini sindirgan — `qollanma-cloudflare-proto`).
  · **`/api/docs` — o'zimizning sahifa, Swagger UI emas.** Ikki sabab,
  ikkisi ham bu deploymentdan: (1) API'ning CSP'si helmet'ning standarti
  (`script-src 'self'`), ya'ni CDN bundle **umuman ishlamaydi va jimgina**
  ishlamaydi — 9.3 aynan shu sinf xatosiga (`frame-ancestors`) yarim kun
  yo'qotdi; (2) `swagger-ui-dist`ni lokal berish — SPA'ni allaqachon
  beradigan o'sha nginx orqali megabaytlik vendor asset, va bularning
  hammasi 370 qatorli filtrlanadigan ro'yxatni ko'rsatish uchun. Sahifa
  ikki fayl: HTML va **alohida** `app.js` (inline `<script>` CSP'da rad
  etiladi). Sahifa `/openapi.json` ni o'qiydi — ya'ni u mashina
  hujjatida yo'q narsani ko'rsata olmaydi.
  · **Autentifikatsiyasiz, ataylab.** Endpoint ro'yxati sir emas: SPA bu
  route'larni har kim o'qiy oladigan JS bundle'dan chaqiradi, ya'ni bu
  yerdagi login devori faqat **kerak bo'lgan integratordan** yashiradi.
  Hujjatda **ma'lumot bo'lmasligi** kerak — va yo'q: faqat sxemalar,
  ruxsat nomlari va status kodlari.
  · `/api/v1` ostida emas, **app darajasida** mount qilingan: hujjat
  barcha versiyalarni, `/api/public/v1` ni ham tasvirlaydi. Bitta
  versiya prefiksi ichida yashagan spec v2 paydo bo'lgan kuni
  dublikat qilinishi kerak bo'lardi — aynan spec eng kerak bo'lgan payt.
  · Jarayonda **bir marta** generatsiya qilinadi va keshlanadi: router'lar
  ishlash paytida o'zgarmaydi, har so'rovda 370 operatsiyani qurish esa
  buni API'ning eng qimmat route'iga aylantirardi.
  · `docs/api-contract.md` yuqorisiga eslatma qo'shildi: endpoint
  ro'yxati bo'yicha **generatsiya qilingan hujjat haqiqat**, bu fayl esa
  konvert, middleware tartibi va konventsiyalar uchun qoladi. Ikki
  manba bo'lishi — ikkinchisi darhol eskirishi degani.
  · **Tekshirildi** — 16 test (hujjat **fixture bilan emas, router
  stack'i bilan** solishtiriladi: ikki tomonlama — hujjat endpointni
  tashlab ketmasligi ham, o'ylab chiqarmasligi ham) + rasmiy
  `@readme/openapi-parser` bilan **`valid: true`** (370 operatsiya, 281
  path, 55 tag, 524 KB) + **brauzerda CDP orqali**: sahifa CSP ostida
  render bo'ldi (373 endpoint, 56 guruh), filtr ishladi
  (`webhooks` → 9), bo'sh holat ko'rindi, konsolda xato yo'q.
  · **Chetlanish:** `zod-to-openapi` **ishlatilgan**, lekin faqat zod →
  JSON Schema konvertori sifatida (`registry.registerPath`). Kutubxonaning
  odatiy usuli — har validatorga `.openapi()` metadata yozib chiqish va
  path'larni qo'lda e'lon qilish; 60 ta validator va 370 endpoint uchun bu
  aynan yuqorida aytilgan qo'lda hujjat bo'lardi, faqat JS'da yozilgani
  bilan. Validatorlarning **birortasi ham o'zgartirilmadi**.
  · **Chetlanish:** javob sxemalari yo'q (faqat konvert). Ularni yozish —
  370 endpoint uchun qo'lda ish, va u hech narsa ta'minlamaydi; kerak
  bo'lsa to'g'ri yo'l — javoblarni ham zod bilan tekshirish, keyin o'sha
  sxemani generatorga berish.
  · **Kuzatilgan xatti-harakat:** prefikssiz `app.use(docsRouter)` ni
  Express `path: '/'` deb ko'rsatadi, va uni prefiks deb qabul qilish
  `//openapi.json` yasagan edi — hech qaysi mijoz chaqira olmaydigan
  path. Test bu holatni qadab qo'ydi.
  · **Prodda topilgan xato (deploydan keyin darhol):** hujjat domen
  ildizida (`/openapi.json`) 404 qaytardi, chunki bu deploymentda nginx
  faqat `/api/`, `/socket.io/` va media prefikslarini proxy qiladi.
  Laptopda mukammal ishlaydigan, prodda esa **integrator topadigan**
  xato. Endi kanonik manzil — **`/api/openapi.json`**, ildizdagisi hamma
  narsani proxy qiladigan deploymentlar uchun qoladi (bitta `router.get`
  ikki path bilan; buning uchun inventarga massiv-path'ni ochish kerak
  bo'ldi, aks holda path `/api/openapi.json,/openapi.json` bo'lib
  qolardi — va OpenAPI validatori bunga e'tiroz ham bildirmaydi).
  · **Ikkinchi prod xatosi, brauzer tekshiruvi topdi:** Cloudflare `.js`
  ni **o'z standarti bilan 4 soat** keshlaydi, va yangi sahifaga **oldingi
  build'ning skripti** berildi — sahifa yuklandi, endi yo'q path'ni
  so'radi va "hujjatni yuklab bo'lmadi" dedi, ya'ni buzilgan deploy
  ko'rinishida. Endi skript URL'i **o'z mazmunining hash'ini** olib
  yuradi (`app.js?v=<sha1>`), sahifaning o'zi esa `no-cache`: o'zgargan
  skript — boshqa URL, va uni hech qaysi kesh eski nusxa bilan almashtira
  olmaydi.
- [x] **11.4** OIDC SSO — `services/integrations/oidcClient.js`, JIT provisioning,
  claim → rol/bo'lim mapping
  · Bajarildi — **authorization code + PKCE**, hammasi server tomonda.
  SPA authorization code'ni ham, ID token'ni ham **ko'rmaydi**: u
  **handoff kod** oladi va uni `POST /auth/login` qaytaradigan aynan
  o'sha payloadga almashtiradi. Nega odatdagi "token'ni fragment'da
  qaytarish" emas: (1) URL'dagi token brauzer tarixida, keyingi
  yuklanadigan sahifaning referrer'ida va redirect'ni yozadigan har bir
  jurnalda qoladi; (2) bu yo'l bilan SSO **bir xil sessiya
  mexanikasida** tugaydi — bitta refresh cookie, bitta CSRF token, bitta
  yuz tekshiruvi siyosati — ikkinchi, vaqt o'tib ajralib ketadigan
  mexanizm emas.
  · **Kutubxona olinmadi, `node:crypto`.** Kerak bo'lgani — bitta oqim va
  bitta imzo turkumi (JWKS ustidan RSA/ECDSA). Kutubxona **aynan
  yashiradigan** narsa — qaysi claim tekshiriladi va qaysi biri shunchaki
  bor — bu yerda `verifyIdToken` ichida, bir ekranda o'qiladi.
  · **Faqat ID token'ga ishoniladi.** `userinfo` chaqirilmaydi: u o'sha
  claim'larni **imzosiz** qaytaradi. Imzosi tekshirilgan token — dalil;
  JSON javob — shunchaki bitta fetch.
  · **`alg` tokendan olinmaydi**, qat'iy jadvaldan tanlanadi: tokenning
  o'zi aytgan algoritmni qabul qilish — `alg: none` va HMAC-confusion
  hujumlari aynan shunday ishlaydi (ikkisi ham test bilan qadalgan,
  ikkinchisi **ochiq kalitni HMAC siri** qilib imzolab ko'radi).
  · Tekshiriladigan claim'lar, shu tartibda: **imzo** (undan oldin token
  — shunchaki kimdir yuborgan satr), `iss`, `aud` (bizning client_id
  ro'yxatda bo'lishi kerak — aks holda bu **o'sha provayderdagi boshqa
  ilova** uchun berilgan haqiqiy token, ya'ni confused-deputy), `azp`
  (bir nechta audience bo'lsa), `exp`/`nbf` (60 s skew — kattaroq oyna
  qayta ishlatilgan token uchun kattaroq oyna), `sub`, va **`nonce`** —
  bu brauzer boshlagan aynan shu kirishga bog'lash.
  · **JWKS `kid` bo'yicha keshlanadi**, va noma'lum `kid` da **bir marta**
  qayta olinadi: provayderlar kalitni ogohlantirmasdan aylantiradi, va
  keshlangan JWKS — kechagi ishlagan kirishning bugun to'xtashining
  odatiy sababi. Faqat noma'lum `kid` da qayta olish esa buni har
  kirishda provayderga so'rovga aylantirmaydi.
  · **Discovery** olinadi, qo'lda sozlanmaydi (endpointlar va JWKS manzili
  — provayderning o'zgartirish huquqi), lekin **hujjatdagi `issuer`
  so'ralgan issuer bilan bir xil bo'lishi** shart: aks holda kimdir
  boshqa provayder nomidan javob berayapti, va undan keyingi har bir
  `iss` tekshiruvi **noto'g'ri nomni** tekshirardi.
  · **Sirlar env'da, mapping bazada** — pochta bo'limidagi bilan bir xil
  bo'linish. Settings ichidagi client secret — har bir zaxira
  nusxasidagi, admin ekrani render qiladigan va kimdir maskalashni
  esdan chiqargan birinchi settings javobidagi sir. `sso` bo'limida
  esa hech qanday sir yo'q: kalit/qiymat mapping'i, guruh → rol
  qoidalari, domen ro'yxati, ikkita bayroq.
  · **`state`, `nonce` va PKCE verifier — Redis'da**, cookie'da emas:
  callback provayderdan **cross-site redirect** sifatida keladi, va
  `SameSite=Lax` cookie bunday redirectlarning ba'zilarida
  **yuborilmaydi** — "bir brauzerda ishlaydi, boshqasida sababsiz
  ishlamaydi" degan xato aynan shundan. `state` **getdel** bilan
  o'qiladi (bir martalik: callback'idan omon qolgan state — qayta
  ishlatiladigan kirish), handoff kod ham xuddi shunday.
  · **PKCE confidential client'da ham** ishlatiladi: secret kim
  almashtirayotganini isbotlaydi, PKCE esa **uni so'ragan aynan o'sha
  brauzer** almashtirayotganini — o'g'irlangan kod aynan shu ikkinchisini
  yengib o'tadi.
  · **Kimni tanish tartibi tor va ataylab shunday:** `ssoSubject` →
  JSHSHIR claim'i → e-mail. `sub` — provayder barqarorligini
  kafolatlaydigan **yagona** identifikator; e-mail esa odam ketganda
  vorisiga o'tadi, va aynan shu tarzda bir odam boshqasining hisobiga
  kirib qoladi (test: mailbox o'zgardi, hisob **bitta** qoldi). E-mail
  va JSHSHIR faqat **mavjud** hisobni bir marta bog'lash uchun.
  · **JIT provisioning JSHSHIR claim'ini talab qiladi.** Platforma
  odamlarni JSHSHIR bilan kalitlaydi — u login, u sertifikatda, u HR
  eksporti mos keladigan maydon — va milliy identifikator uchun
  o'ylab topilgan placeholder yozib qo'yish mumkin emas. Claim
  sozlanmagan bo'lsa kirish **aynan shu sababni aytib** rad etiladi.
  (**Chetlanish:** shu sababli har qanday IdP bilan "shundoq"
  provisioning ishlamaydi — deployment qaysi claim JSHSHIR olib
  yurishini ko'rsatishi kerak.)
  · **Ko'rinadigan ism uchun zaxira zanjiri**: `name`/halflar → e-mail'ning
  @ dan oldingi qismi → JSHSHIR. Minimal ID token faqat `sub` olib
  yuradi (bu mutlaqo to'g'ri token, va testlar birinchi navbatda
  shunisini yasadi); eng ahamiyatsiz claim yo'qligi uchun kirishni rad
  etish yoki bo'sh ism saqlash — ikkisi ham yomonroq.
  · **`syncOnLogin`** (standart yoniq): har kirishda ism, bo'lim, filial,
  lavozim va **rol** claim'lardan yangilanadi — mapping bilan SSO'ning
  ma'nosi shu, va bir marta o'qib qo'ygan platforma bir chorakda
  katalogdan ajralib ketadi. Ikki muhim cheklov: **bo'sh claim mavjud
  qiymatni o'chirmaydi** (provayder `department` yubormasa, qo'lda
  qo'yilgan bo'lim o'chsa — odam bo'lim bo'yicha tayinlangan
  kurslardan jimgina chiqib ketardi), va **`isActive` ga tegilmaydi**
  (o'chirishning oqibatlari bor, claim yo'qligi esa bunga juda kuchsiz
  signal). Qoida **umuman sozlanmagan bo'lsa rol tegilmaydi** — aks
  holda har SSO kirishi hammani standart rolga qaytarardi, SSO'ni
  sozlagan administratorni ham (test bilan qadalgan).
  · **O'chirilgan hisob SSO orqali qaytmaydi**: katalogda
  autentifikatsiyadan o'tish — bu yerda bo'lish huquqi emas, o'chirishning
  butun ma'nosi shu.
  · **Domen ro'yxati**: umumiy provayder (mehmon hisoblari bor tenant,
  yoki Google) bu kompaniyaga aloqasi yo'q odamni ham xotirjam
  tasdiqlaydi. Bo'sh ro'yxat — "provayder kafolatlagan har kim", va u
  faqat single-tenant provayderda xavfsiz. **Subdomen mos kelmaydi**:
  `example.uz` ruxsat bersa `guests.example.uz` yo'q — mehmonlar
  ko'pincha aynan subdomenda.
  · **Ochiq redirect yopilgan**: `?redirect=` faqat **bitta** `/` bilan
  boshlanadigan nisbiy path (`//evil.example` ham rad etiladi) — aks
  holda bu kirish fishing sahifasini haqiqiyga o'xshatib turardi
  (HTTP bilan tekshirilgan: 400 VALIDATION_ERROR).
  · **`/callback` — bu API'dagi yagona endpoint** javobi envelope emas:
  uning chaqiruvchisi SPA'ning HTTP klienti emas, **redirect'ni
  kuzatayotgan brauzer**, va JSON xato tanasi odamni API domenida
  qaytish yo'li yo'q holda qoldirardi. Shuning uchun u SPA'ga
  `?error=<code>` bilan redirect qiladi va SPA uni tarjima qiladi.
  · **Kesh muddatlari:** discovery va JWKS 1 soat, `state` 10 daqiqa
  (parol + MFA + bir lahza o'ylash), handoff 60 sekund (bitta redirect
  va bitta so'rov).
  · **Yon topilma (tuzatildi):** `settingsService.update` bir pog'ona
  chuqurlikda `$set` qilardi (`sso.claims` **butunlay** almashtirilardi).
  11.4 gacha har bo'lim tekis bo'lgani uchun bu farq qilmagan; endi esa
  bitta claim nomini o'zgartirgan ekran **qolgan sakkiztasini
  o'chirardi** — saqlash ishlaganday ko'rinadigan ma'lumot yo'qolishi.
  Endi ichma-ich yassilanadi, massivlar esa qiymat sifatida
  almashtiriladi (ro'yxatni indeks bo'yicha birlashtirish birinchi
  elementni o'chirishni imkonsiz qilardi). `settings.test.js` ga
  regressiya testi qo'shildi.
  · **Tekshirildi** — 25 test (`test/oidcSso.test.js`; to'plam 916 test,
  914 o'tadi — faqat eskidan yiqilib turgan ikkita yuz testi; **haqiqiy IdP**:
  loopback'dagi HTTP server discovery, JWKS va yangi generatsiya
  qilingan RSA kalit bilan imzolangan ID token beradi — mock'langan
  verifier har qanday tekshiruvni tashlab ketgan implementatsiyani
  o'tkazib yuborardi) + **HTTP orqali to'liq oqim**: `/start` →
  provayderning `/authorize` → bizning `/callback` → SPA'ga handoff
  redirect → `/exchange` → sessiya (access token bilan `/users/me` 200),
  handoff **ikkinchi marta 401**, guruh claim'i qo'shilgach rol
  **ADMIN** ga o'tdi va bo'lim yangilandi, mehmon domeni
  `?error=SSO_DOMAIN_NOT_ALLOWED` bilan qaytarildi, ochiq redirect
  400 oldi + **brauzerda (CDP)**: kirish sahifasida tugma sozlangan
  matn bilan chiqdi, bosilgach provayderga ketdi va oqim oxirida
  bosh sahifada "Xayrli kech, Probe" — ya'ni provisioning qilingan
  odam haqiqatan kirdi (`csrf_token` localStorage'da). Sinov
  ma'lumotlari (4 hisob, sessiyalar, audit, bildirishnomalar) o'chirildi
  va `sso` bo'limi **aynan avvalgi holatiga** qaytarildi.
  · **Chetlanish:** SAML yo'q (`07-scores-dependencies.md` da REMOVE —
  bu muhitda Active Directory yo'q, SAML esa OIDC'dan sezilarli
  qimmat). `POST /auth/sso/jwt` (imzolangan JWT SSO) ham yozilmadi:
  OIDC bor bo'lgach, u faqat kalitni qo'lda ulashish yo'li bilan
  bir xil natijaga olib boradi.
  · **Chetlanish:** logout provayder tomonda **sessiyani yopmaydi**
  (RP-initiated logout). Bizdagi chiqish o'z sessiyamizni tugatadi;
  IdP'dan chiqish — brauzerdagi boshqa ilovalarga ham ta'sir qiladigan
  qaror, va uni SSO bilan birga jimgina yoqib qo'yish to'g'ri emas.
- [x] **11.5** `middlewares/idempotency.middleware.js` (`Idempotency-Key`)
  · Bajarildi — bu **beparvo klient uchun emas**. Holat oddiy: so'rov
  serverda **muvaffaqiyatli bajarildi**, javobi esa yetib kelmadi —
  telefon aloqani noto'g'ri paytda yo'qotdi, proxy timeout berdi, noutbuk
  submit paytida yopildi. Klient buni "umuman yetmagan so'rov"dan
  **ajrata olmaydi**, shuning uchun qayta yuboradi — va bu himoya
  bo'lmasa, qayta yuborish ikkinchi uy ishi topshirig'ini, ikkinchi
  tadbir ro'yxatini, ikkinchi tayinlashni yaratadi. BLOK 12 (oflayn)
  buni chekka holatdan **odatiy yo'l**ga aylantiradi: qayta ulangach
  bo'shatilgan navbat — javobi ko'rilmagan so'rovlar navbati.
  · **Route bo'yicha opt-in, global emas.** O'qishda kalitning ma'nosi
  yo'q, konstruksiya bo'yicha allaqachon idempotent endpointda (dars
  progressi) esa u faqat Redis'ga borish va o'sha yerda ma'nosi yo'q
  409 sinfini qo'shardi. Aniq belgilash yana bitta narsani beradi:
  generatsiya qilinadigan OpenAPI hujjati **qaysi endpointlar** bu
  sarlavhani qabul qilishini aytadi (11.3) — middleware'ning o'zidan
  o'qib, ya'ni xato bo'lishi mumkin emas.
  · **`SET NX` — butun mexanizm.** Birinchi kelgan so'rov kalitni
  egallaydi, qolganlari egallanganini topadi. Check-then-set bo'lsa,
  ikkita parallel qayta yuborish **ikkisi ham** tekshiruvdan o'tardi
  (test: 250 ms sekin handler bilan aynan shu holat — biri 201, ikkinchisi
  409, handler **bir marta** ishlaydi).
  · **Uch xil javob, uch xil holat:** tugagan bo'lsa — saqlangan status va
  tana qaytariladi (`Idempotent-Replay: true`, ya'ni UI xohlasa
  "yaratildi" bilan "allaqachon yaratilgan"ni ajratishi mumkin); hali
  ketayotgan bo'lsa — **409 `IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 1`**
  (kutib turish so'rovni ushlab qolardi, ya'ni birinchisi qancha davom
  etsa, shuncha ulanish band); **tana boshqa** bo'lsa — 409
  `IDEMPOTENCY_KEY_REUSED`, chunki jimgina birinchi javobni qaytarish
  ikkinchi so'rov muallifiga **uning payload'i qabul qilindi** deb
  aytardi, holbuki u umuman ishlamagan.
  · **Fingerprint barqaror JSON'dan** (kalitlar saralanadi): `JSON.stringify`
  kiritish tartibini saqlaydi, ya'ni bir xil maydonlarni boshqa tartibda
  yuborgan ikki klient "kalit qayta ishlatilgan" javobini olardi — bir
  xil so'rovga juda chalkash javob.
  · **Kalitning ko'lami: aktor + metod + route + path parametrlari +
  kalit.** Aktor — kalit klient o'zi tanlagan **oddiy satr**, ya'ni aktor
  bo'lmasa bir odamning kaliti boshqasining javobini unga qaytarardi
  (test bilan qadalgan). Route va parametrlar — bir xil kalit boshqa
  endpointda yoki boshqa yozuvda **boshqa amal**, va saqlangan tanani
  qaytarish hech kim so'ramagan savolga javob berardi
  (`/courses/:id/assignments` ikki kurs uchun — ikki amal). API kaliti
  bilan kelgan chaqiruvchi o'z prefiksi bilan, anonim esa IP bilan
  (kuchsizroq, lekin alternativa — har kim boshqasining kalitini taxmin
  qilishi mumkin bo'lgan umumiy nomlar makoni).
  · **5xx saqlanmaydi va da'vo bo'shatiladi**: o'tkinchi xatoni bir
  kunlik javobga aylantirish — bu middleware mavjud bo'lgan holatning
  aynan o'zini buzardi (test: 500 dan keyingi qayta yuborish **haqiqatan
  ishlaydi**). **4xx esa saqlanadi**: u deterministik, va uni qaytarish
  buzilgan klientning endpointni urib turishini to'xtatadi.
  · **Muddatlar:** tugagan javob 24 soat (oflayn navbat ertalab
  bo'shatilishi uchun to'g'ri kattalik tartibi), "ketayotgan" belgisi esa
  **60 sekund** — jarayon so'rov o'rtasida o'lsa, qolgan narsa faqat
  shu belgi bo'ladi, va uzoq muddat klientning qayta urinishini
  (himoya qilinishi kerak bo'lgan narsani) muddat tugaguncha bloklardi.
  · **Redis yo'q bo'lsa — ochiq yiqiladi** (loglar bilan): alternativa —
  platforma mukammal bajara oladigan yozuvlarni rad etish, ya'ni kamdan
  kam uchraydigan dublikat uchun **aniq uzilish** to'lash.
  · Javob `res.json` ni o'rash bilan ushlanadi: bu API'dagi **har bir
  javob** (`sendSuccess`/`sendError`) shu yerdan o'tadi, ya'ni ushlash
  uchun bitta joy bor — tanani taxmin qiladigan listener emas.
  · **Qo'llanilgan endpointlar** (dublikat haqiqatan yozuv yaratadigan
  joylar): uy ishini topshirish, tadbirga yozilish, kursga o'zi yozilish,
  kurs tayinlash, **chat xabari** (oflayn navbatdan yuborilgan xabar —
  bitta xabar, ikkita emas). Front tomonda kalit **odam bosgan payt**
  yaratiladi va qayta urinishda **o'sha kalit** ishlatiladi
  (`services/idempotency.js`) — har HTTP urinishida yangi kalit
  yaratish butun ma'noni yo'q qilardi.
  · **Tekshirildi** — 13 test (haqiqiy express + haqiqiy Redis: do'kon
  bu yerda **mexanizmning o'zi**, fake do'kon hech narsani sinamagan
  bo'lardi) + **HTTP orqali haqiqiy endpointlarda**: kalit bilan
  tayinlash → qayta yuborish **o'sha 201 va o'sha tana**
  (`idempotent-replay: true`), kalitsiz esa ikkinchi urinish
  `ASSIGNMENT_ALREADY_EXISTS` (409) oldi, boshqa tana bilan
  `IDEMPOTENCY_KEY_REUSED`, va bazada **bitta** tayinlash; chatda bitta
  kalit bilan ikki marta yuborilgan xabar — **bitta** xabar, kalitsiz
  ikki marta — **ikkita**. Sinov ma'lumotlari (kurs, odam, suhbat,
  xabarlar, audit, Redis kalitlari) tozalandi.
  · **Chetlanish:** javob 24 soat **Redis'da** saqlanadi, Mongo'da emas.
  Redis bu deploymentda ishonchli (BullMQ, sessiya, rate limit hammasi
  unda), va idempotentlik yozuvi — bir kundan keyin ahamiyatsiz bo'lib
  qoladigan operatsion holat, doimiy ma'lumot emas.
- [x] **11.6** TOTP 2FA, foydalanuvchi sessiyalari sahifasi
  · Bajarildi — **TOTP, SMS emas**: telefon raqamiga yuborilgan kod
  operatorning SIM'ni qayta berishga tayyorligicha kuchli, har kirishda
  pul turadi va aloqasi yo'q binoda ishlamaydi — bu platforma
  ishlatiladigan joylarning bir qismini shundoq tasvirlaydi.
  · **Kutubxona olinmadi** (`utils/totp.js`, `node:crypto`): algoritm
  o'ttiz qator, muhim narsalar esa o'rovchi yashiradigan narsalar —
  oyna kattaligi, kod ikki marta ishlatilishi mumkinmi, taqqoslash
  timing-safe'mi. **RFC 6238 test vektorlari bilan tekshirilgan**
  (287082 / 081804 / 050471 / 005924 / 279037) — bu bo'lmasa qolgan
  hammasi o'z arifmetikamizni o'ziga solishtirish bo'lardi.
  · SHA-1 / 6 raqam / 30 sekund — bu tanlov emas, autentifikator
  ilovalari implementatsiya qiladigan narsa. "Kuchliroq" konfiguratsiya
  Google Authenticator yasay olmaydigan kodlarni berardi, ya'ni yagona
  ahamiyatli xususiyatni yo'qotardi. Oyna **±1 qadam**: nol bo'lsa
  soati ikki sekund farq qiladigan telefon rad etilardi, uch bo'lsa
  taxmin qilish maydoni uch barobar kengayardi.
  · **Sir shifrlangan holda saqlanadi** (`utils/secretBox.js`,
  AES-256-GCM), hash qilinmaydi — kodni tekshirish uni **qayta
  hisoblash**ni talab qiladi. Kalit env'da (`TWOFA_SECRET_KEY`), ya'ni
  faqat Mongo dump'ida **ishlaydigan ikkinchi faktor yo'q** — "at rest"
  degani asosan shu. Kalit bo'lmasa **ishlashdan bosh tortadi** (aniq
  503), jimgina ochiq matnga tushmaydi: jimgina fallback — aynan
  deployment ikkinchi faktorlarni ochiq saqlab, hech kim bilmay
  qoladigan yo'l. Har `seal` tasodifiy IV bilan: bir xil sir bir xil
  shifrmatn bermasligi kerak, aks holda baza kim bilan kim sirni
  bo'lishganini aytardi. GCM tag'i buzilishni ko'rsatadi (test bilan).
  · **Sir darhol yoqilmaydi:** `pendingSecret` sifatida saqlanadi va
  faqat **birinchi to'g'ri kod** ilovada haqiqatan borligini isbotlagach
  haqiqiy sirga aylanadi. Sir bo'yicha darhol yoqish — skaneri jimgina
  ishlamagan odamni hisobidan qulflab qo'yish.
  · **Kod ikki marta ishlatilmaydi** (`lastCounter`): olti xonali kod
  kamida o'ttiz sekund haqiqiy, ya'ni qabul qilingan qadam yozilmasa,
  yelka ustidan ko'rilgan bitta kod oynasi tugaguncha qayta ishlatilardi.
  Kuzatilgan natija: ro'yxatdan o'tishni tasdiqlagan kod ham **sarflangan**
  — ya'ni darhol chiqib qayta kirmoqchi bo'lgan odam 30 sekundgacha
  kutadi. Bu ataylab: alternativa — kuzatilgan kodning qayta
  ishlatilishi.
  · **Zaxira kodlar** — 10 dona, `A1B2-C3D4` shaklida (qog'ozdan o'qish
  uchun guruhlangan), **argon2 hash** bilan saqlanadi (bular parol —
  har biri o'zi kirishga yetadi) va **bir martalik**: telefon
  yo'qolgani hisob yo'qolgani bo'lmasligi kerak, ishlatilgandan keyin
  ham qoladigan kod esa ikkinchi faktorning **doimiy chetlab o'tilishi**
  bo'lardi. Bir marta ko'rsatiladi (API kaliti bilan bir xil shartnoma),
  ishlatilgani auditga alohida yoziladi (`TWOFA_RECOVERY_USED`) —
  odatda telefon yo'qolganini, ba'zan boshqa odamning qo'lida
  bo'lganini bildiradi.
  · **O'chirish uchun parol yetmaydi** — kod yoki zaxira kod kerak:
  parolga ega odam aynan ikkinchi faktor himoya qilayotgan odam.
  · **Kirish oqimi yuz tekshiruvi bilan bir xil shaklda**: to'g'ri parol
  **challenge** qaytaradi, sessiya emas, va ikkinchi faktor uni
  almashtiradi. Klientda "ma'lumot to'g'ri, lekin hali kirmadingiz"
  uchun **bitta** tarmoq bo'ladi, ikkita emas. Challenge Redis'da (90
  sekund — parol + ilovani ochish + kodni o'qish), **bir martalik**, va
  **5 urinishdan** keyin kuyadi. Urinishlar **challenge'da** sanaladi,
  hisobda emas: hisobda sanash JSHSHIR'ni biladigan har kimga
  egasini qulflash imkonini berardi (test bilan).
  · Har ikki yo'l ham `establishSession` da tugaydi — parol, SSO va 2FA
  bir xil sessiya mexanikasiga, shu jumladan yuz siyosatiga boradi.
  · **Sessiyalar sahifasi:** sessiyalar allaqachon bor edi (refresh
  token — bu yozuv), lekin **egasiga ko'rsatilmagan** — "yangi
  qurilmadan kirildi" bildirishnomasiga yagona javob parolni
  almashtirish bo'lgan, u esa xatni o'qiyotgan sessiyani ham
  tugatadi. Endi: qurilma nomi (`Chrome · Windows` — ataylab qo'pol
  taxmin, chunki savol faqat "bu noutbukmi yoki telefonmi"), IP,
  oxirgi faollik, **"shu qurilma"** belgisi, bitta qatorni tugatish va
  **"boshqa hamma qurilmalardan chiqish"**. Bekor qilingan va muddati
  o'tgan qatorlar ko'rsatilmaydi — bu **ish qiladigan** ro'yxat.
  · Bir sessiyani tugatish javobi `wasCurrent` qaytaradi: hozirgi
  sessiya tugatilsa ilova chiqib ketishi kerak, va buni 200 dan bilib
  bo'lmaydi. Boshqa odamning sessiya id'si **404** ("topilmadi") —
  filtr `userId` bilan, keyingi tekshiruv bilan emas, ya'ni javob hech
  narsani oshkor qilmaydi.
  · **HTTP tekshiruvida topilgan xato (tuzatildi):** refresh cookie
  yuborilmagan chaqiruvda **hech bir sessiya "hozirgi" deb
  belgilanmagan**, va "boshqalarini tugatish" o'zini ham tugatgan. Endi
  bunday holat **rad etiladi** (`SESSION_CURRENT_UNKNOWN`): tugma
  "shu sessiyani saqlaymiz" deb va'da beradi, qaysi biri "shu"
  ekanini bilmasak — taxmin qilish odamni **hisobini himoya qilayotgan
  qurilmasidan** chiqarib yuborardi.
  · **Kuzatilgan xatti-harakat (tuzatildi):** servis 2FA challenge'ini
  qaytarardi, lekin `authController.login` uni **hisobga olmagan** —
  javob `{csrfToken}` bo'lib, foydalanuvchi kirgan ham, kirmagan ham
  emas holatda qolgan. HTTP tekshiruvi topdi (unit testlar servisni
  chaqirgani uchun ko'rmagan).
  · **Tekshirildi** — 21 test (to'plam 951 test, 949 o'tadi — faqat
  eskidan yiqilgan ikkita yuz testi; RFC vektorlari, shifrlash, qayta
  ishlatishning oldini olish, zaxira kodlar, challenge chegaralari,
  sessiyalar) + **HTTP orqali**: sozlash → QR + sir, xato kod
  yoqmaydi, ilovaning kodi yoqadi va 10 zaxira kod qaytaradi, bazada
  **shifrmatn va argon2 hash'lar**, kirish ikkinchi qadamda to'xtaydi,
  ishlatilgan kod **rad etiladi**, zaxira kod **bir marta** ishlaydi,
  parol bilan o'chirib bo'lmaydi, zaxira kod bilan bo'ladi; sessiyalar
  ro'yxati cookie bilan "shu qurilma"ni to'g'ri belgiladi, boshqalarini
  tugatish **faqat boshqalarini** tugatdi, cookie'siz esa rad etildi
  + **brauzerda (CDP)**: parol → ikkinchi qadam sahifada qoldi, xato
  kod xato ko'rsatdi, haqiqiy kod kiritdi (`csrf_token` saqlandi),
  «Xavfsizlik» yorlig'ida ikkala karta ham ko'rindi ("yoniq", "shu
  qurilma"). Sinov ma'lumotlari (hisob, 9 sessiya, audit,
  bildirishnomalar) tozalandi.
  · **Chetlanish:** SSO orqali kirish 2FA so'ramaydi — ikkinchi faktorni
  identifikatsiya provayderi o'zi so'ragan bo'ladi, va uning ustiga
  yana bittasini qo'yish MFA'ni ikki marta bajarish bo'lardi.
  · **Chetlanish:** `security.requireTwoFactor` sozlamasi ekranda
  **ko'rsatiladi** ("kompaniya talab qiladi"), lekin kirishni majburan
  to'xtatmaydi: hech qachon yoqmagan odamlarni bir kunda hisobidan
  chiqarib qo'yish — majburlashning eng yomon usuli. Majburlash
  (kirgandan keyin sozlashga yo'naltirish) BLOK 12 dagi onboarding
  oqimi bilan birga qilinadi.

---

## BLOK 12 — Mobil va accessibility (4 hafta)

- [x] **12.1** PWA — `vite-plugin-pwa`, manifest, Workbox
  · Bajarildi — ilova **o'rnatiladigan** bo'ldi va **internetsiz ochiladi**
  (brauzerda tekshirilgan: tarmoq o'chirilgach qayta yuklanganda ham
  qobiq ko'tarildi, kirish formasi chiqdi, `/courses` deep link ham
  navigation fallback orqali xizmat qildi).
  · **Nima keshlanadi va nima yo'q — butun dizayn shu.** Ilova
  **ochilishi** uchun kerak narsalar (qobiq, CSS, shriftlar, ikonkalar)
  oldindan keshlanadi. **API keshlanmaydi:** keshlangan kurs ro'yxati —
  noto'g'ri kurs ro'yxati, keshlangan autentifikatsiyalangan javob esa
  umumiy kompyuterda **keyingi odamga** berilishi mumkin bo'lgan javob.
  Kontentni oflayn olish — 12.2/12.3: o'quvchining **ataylab** qilgan
  ishi, IndexedDB da, har o'quvchi uchun alohida.
  · **`generateSW` bu repozitoriyada ishlamaydi** — o'rniga
  `injectManifest` va **qo'lda yozilgan `src/sw.js`**. Sabab konkret:
  workbox worker'ni absolut import yo'llarini **bitta qo'shtirnoq**
  ichida satrga ulab yasaydi, bu checkout esa nomida apostrof bor
  papkada turadi (`qo'llanma`) — natijada worker sintaktik jihatdan
  buzilgan chiqadi va xato `write-sw-using-default-template` ichidagi
  o'qib bo'lmaydigan parse xatosi bo'lib ko'rinadi. Yon foydasi ham bor:
  12.3 dagi oflayn navbat uchun **o'zimiz boshqaradigan** worker kerak.
  · **`registerType: 'prompt'`, `autoUpdate` emas.** Bu — vaqti
  chegaralangan test topshiradigan platforma: keyingi navigatsiyada
  ilovani odam ostidan almashtirib qo'yish — yo'qolgan urinish. Yangi
  versiya **kutadi**, ekranda bir qatorli xabar chiqadi, va **odam
  bosganda** almashadi (`SKIP_WAITING` xabari → `skipWaiting`). Brauzerda
  tekshirilgan: birinchi build'da banner yo'q, ikkinchi build'dan keyin
  «Yangi versiya tayyor.» + «Yangilash» tugmasi, bosilgach yangi worker
  egallab oldi.
  · **Precache 2,3 MB** (140 fayl), 6,8 MB emas: `pdf.worker`,
  `pptx-preview`, `exceljs`, `mammoth.browser` (birgalikda ~4 MB) va
  `public/mediapipe` + `public/pdfjs` (o'n megabaytlar) **chiqarib
  tashlangan**. Ular har biri bittagina ekran ortida, ko'pchilik hech
  qachon ochmaydi — o'rnatishni mobil (ko'pincha hisoblanadigan)
  ulanishda 7 MB yuklamaga aylantirish uchun sabab yo'q. Birinchi
  ishlatilganda runtime qoidasi bilan keshlanadi (`CacheFirst`), ya'ni
  kutish odam **kutishni tabiiy** deb qabul qiladigan paytda bo'ladi.
  · **Navigation fallback denylist** — `/api/`, `/socket.io/`, `/media/`,
  `/lms-*`, `/openapi.json`. Bu bo'lmasa worker `/api/...` ga
  navigatsiyaga **index.html** bilan javob berardi: baland ovozda
  yiqilishi kerak bo'lgan so'rov **200 + HTML** qaytaradi, ya'ni klient
  uchun eng yomon shakl. (Prodda API boshqa origin'da — SPA
  `spring.sds-max.uz`, API `qollanma.sds-max.uz` — ya'ni worker uni
  umuman ushlamaydi; denylist bir originli dev va kelajakdagi
  konfiguratsiyalar uchun.)
  · **Manifest:** `standalone`, `theme_color: #007bff` (brend ko'kligi —
  o'rnatilgan ilovaning status paneli shu rangda), `lang: uz`, 192/512
  ikonkalar va **alohida maskable 512** (Android uni launcher shakliga
  qirqadi, shuning uchun rasm xavfsiz zonada bo'lishi kerak — bir
  faylni ikki marta e'lon qilish chetlarini kesib qo'yardi). iOS ikonkani
  faqat `<link rel="apple-touch-icon">` dan oladi, shuning uchun u
  `index.html` da. Ikonkalar SVG dan `sharp` bilan generatsiya qilingan
  (tasodifiy fayl emas).
  · **Oflayn banner** brauzerning `online`/`offline` hodisasidan
  ishlaydi va `navigator.onLine` ni **dalil emas, ishora** deb muomala
  qiladi (captive portal "onlayn" deydi) — shuning uchun matn ulanish
  haqida, nima ishlashi haqida va'da bermaydi. Brauzerda tekshirilgan
  (CDP tarmoq emulatsiyasi `navigator.onLine` ni o'zgartirmaydi,
  shuning uchun hodisa qo'lda yuborilib tekshirildi: banner chiqdi va
  `online` da yo'qoldi).
  · **Dev'da service worker o'chirilgan** (`devOptions.enabled: false`):
  dev serverni keshlab qo'yadigan worker — hech kim tushuntirib
  bera olmaydigan eski bundle bilan o'tadigan yarim kun.
  · Yangilanish har **soatda** ham tekshiriladi (`registration.update()`):
  brauzer navigatsiyada tekshiradi, lekin LMS'da ilovani kun bo'yi ochiq
  qoldirish — odatiy holat.
  · `registerPwa()` **mount'dan keyin** chaqiriladi va xatosi
  yutiladi: worker ro'yxatga olinmasa (private rejim, oddiy http)
  ilova aynan shu funksiya paydo bo'lishidan oldingi holatda ishlaydi —
  ya'ni faqat onlayn.
  · **Tekshirildi** — front testlari 19 (`front/test/pwa.test.js`:
  **generatsiya qilingan** worker o'qiladi, konfiguratsiya emas — qobiq
  keshlanganmi, og'ir viewer'lar **keshlanmaganmi**, `public/` vendor
  papkalari yo'qmi, precache **3 MB budjeti** ichidami, va worker'da
  `denylist` bilan `SKIP_WAITING` bormi) + **brauzerda (CDP)**:
  manifest ulangan, worker `activated`, 140 kesh yozuvi, og'ir
  chunk'lardan **0** tasi keshda, tarmoq o'chirilgach ilova ochildi,
  yangi build banner chiqardi va «Yangilash» ishladi.
  · **Chetlanish:** `vite-plugin-pwa` ning `generateSW` rejimi
  ishlatilmadi (yuqoridagi apostrof sababi) — plagin faqat manifest
  injektori sifatida ishlatiladi.
  · **Prodda o'lchangan va tuzatilgan ikkita narsa.**
  (1) nginx `.webmanifest` uchun MIME turini bilmaydi va manifestni
  `application/octet-stream` deb bergan — brauzer bunday manifestni rad
  etishga haqli, va alomat "ilova o'rnatilmaydi", bizning
  jurnalimizda esa **hech narsa yo'q**. Endi fayl nomi
  **`manifest.json`** (`manifestFilename`): `.json` ni har qanday
  statik server allaqachon biladi.
  (2) nginx'da `/assets/` uchun `immutable 1y` va `/index.html` uchun
  `no-cache` bor, **`/sw.js` uchun hech narsa yo'q** — shuning uchun
  Cloudflare unga o'z standartini qo'yadi (`max-age=14400`, o'lchandi).
  Bu shunchaki "yangilanish kechikadi" emas: chekka **eski `sw.js`** ni
  beradi, u esa yangi deployda `rsync --delete` bilan **o'chirilgan
  asset**ni precache qilishga urinadi va
  `bad-precaching-response … 404` bilan **o'rnatilmaydi** — brauzerda
  aynan shu ko'rildi (`SW VERSION redundant`), ya'ni 4 soat davomida
  oflayn qo'llab-quvvatlash **umuman yo'q**. Ikki javob: (a) deploy
  endi `--delete` **bilan emas** — eski hash'langan asset'lar joyida
  qolsa, chekkadagi eski worker ham muvaffaqiyatli o'rnatiladi
  (DAVOM.md va xotiraga yozildi, oyda bir marta yosh bo'yicha tozalash);
  (b) to'g'ri tuzatish — nginx'da `location = /sw.js` uchun
  `no-cache` + Cloudflare keshini bir marta tozalash, ikkisi ham
  foydalanuvchining sudo'sini talab qiladi.
  · **Kuzatilgan xatti-harakat (brauzer probe topdi):** avval o'sha
  chekka keshini chetlab o'tish uchun worker URL'iga build shtampi
  qo'yilgan edi (`/sw.js?v=<build>`). Natija: yangilanish olingandan
  keyin sahifa yangi build'ga qayta yuklanadi, u **boshqa shtampli** URL
  ni ro'yxatga oladi, brauzer esa **o'zgargan skript URL'ini yangi
  versiya deb hisoblaydi** — va so'rov yana chiqadi. Ya'ni har deploydan
  keyin **tugamaydigan "yangi versiya" halqasi**. Endi URL barqaror
  (`/sw.js`), va probe buni qadab qo'ydi: yangilanish olingandan keyin
  so'rov **qaytib chiqmaydi**.
  · **Kuzatilgan xatti-harakat (2):** `workbox-window` ning
  `messageSkipWaiting()` yangilanish **brauzer** tomonidan topilganda
  (bizning `update()` chaqirig'imiz emas) **jimgina hech narsa
  qilmaydi** — so'rov chiqadi, tugma bosiladi, hech narsa bo'lmaydi va
  hech qayerda xato yo'q. Endi kutayotgan worker'ga xabar **to'g'ridan
  to'g'ri** yuboriladi (4 qator), ya'ni yangilanish qanday topilganidan
  qat'i nazar ishlaydi, va `workbox-window` mijoz bundle'idan butunlay
  chiqdi.
- [x] **12.2** Oflayn kontent — IndexedDB, "oflayn saqlash"
  · Bajarildi — **o'quvchi bosadigan tugma**, o'zini to'ldiradigan kesh
  emas. 12.1 da service worker API javoblarini ataylab keshlamaydi
  (keshlangan kurs ro'yxati — noto'g'ri ro'yxat); bu yerda esa odam
  **o'zi tanlagan** kursni qurilmaga oladi, nima qancha joy olishini
  **oldin** ko'radi va istagan payt o'chiradi.
  · **Nima saqlanadi:** kursning mundarijasi, **matn darslari** va
  **hujjatlar**. Nima saqlanmaydi va nega: **video** — HLS segmentlari
  qisqa muddatli playback token ortida (token muddati o'tadi, ya'ni
  "saqlangan" video sababsiz ishlamay qoladi, hajmi ham
  oldindan aytib bo'lmaydi); **test** — savollarni diskda saqlash
  yaxlitlik muammosi, imkoniyat emas; **SCORM** — API'ning launcher
  sahifasi va same-origin runtime kerak. UI buni **oldindan aytadi**,
  chunki videosini kutgan odam buni koridorda, aloqasiz joyda
  bilib qolardi.
  · **Reja avval ko'rsatiladi** (`planCourseDownload`): nechta element,
  taxminan qancha, va **nima tashlab ketiladi** (masalan 25 MB dan katta
  fayl). Boshlanib, keyin jimgina fayl tashlab ketadigan progress bar —
  odam kerakli hujjatsiz oflayn qolishining yo'li.
  · Chegaralar texnik emas, **insoniy**: fayl uchun 25 MB (koridordagi
  telefonga 60 MB skanni bilmasdan yuklab qo'ymaslik uchun), kurs uchun
  200 MB, va brauzer kvotasidan 50 MB **zaxira** (precache, sessiya,
  sozlamalar ham shu budjetda). Brauzer kvotani aytmasa — **ruxsat
  beriladi**: dalilsiz rad etish rad etishning eng yomon turi.
  · IndexedDB **kutubxonasiz** (`offline/db.js`, ~90 qator): to'rtta do'kon
  va to'rtta amal, va tranzaksiya **commit bo'lganda** resolve qiladi —
  request'da resolve qilish "saqlandi" deb aytib, keyin saqlanmay
  qolishining yo'li. Bayt'lar alohida do'konda: saqlanganlar ro'yxatini
  ko'rsatish uchun yuz megabaytni xotiraga o'qish shart emas.
  `navigator.storage.persist()` **so'raladi** (ixtiyoriy: Chrome beradi,
  Safari'da yo'q — bermasa ma'lumot evictable bo'ladi, ya'ni avvalgi
  holat).
  · **O'qish yo'li:** dars/hujjat/kurs sahifasi so'rov **muvaffaqiyatsiz
  bo'lsa** saqlangan nusxaga tushadi — onlaynda serverning nusxasi
  haqiqiy, va muallif almashtirgan hujjat diskdan chizilib turmasligi
  kerak. Har uchtasida **"Saqlangan nusxa o'qilyapti"** deb aytiladi va
  progress ko'rsatilmaydi: kurs saqlangan paytdagi foizni **hozirgi**
  deb ko'rsatish — muhim tomonga qarab yolg'on.
  · **Kuzatilgan xatti-harakat (bu yerda hal qilindi):** oflayn holatda
  ilova **kirish sahifasiga otib yuborardi** — access token qisqa
  muddatli, internetsiz esa refresh qilishning yo'li yo'q, ya'ni odam
  ataylab yuklab olgan kursi **umuman ochilmaydi**. Endi
  `offlineOnly` — **faqat o'qish uchun** sessiya: oxirgi haqiqiy
  kirishdan qolgan **minimal profil** (id, ism, rol) localStorage'da,
  `permissions` **bo'sh** (diskdan tiklangan eskirgan ruxsat ro'yxati —
  aynan tiklanmasligi kerak narsa), va router faqat
  **`meta.offline`** route'larni ochadi (IndexedDB'dan halol chizila
  oladiganlari). Bu **yangi hech narsa bermaydi**: ma'lumot allaqachon
  o'sha qurilmada, devtools'dan o'qiladi, va uni shu odam o'zi yuklab
  olgan. Internet qaytganda (`online`) ilova darhol haqiqiy sessiyaga
  o'tadi — aks holda odam ulanish qaytganini ko'rib turib, har yozuvi
  sababsiz muvaffaqiyatsiz bo'lardi.
  · **Kuzatilgan xatti-harakat (2):** `restoreSession` tarmoq xatosini
  ham "sessiya rad etildi" deb tushunardi va **`clearSession`** qilardi —
  ya'ni oflayn bir marta ochilgan ilova eslab qolgan profilni ham
  o'chirib, odam internet qaytganda **sababsiz chiqib qolgan** bo'lardi.
  Endi javobsiz xato + oflayn = faqat o'qish rejimi.
  · **Kuzatilgan xatti-harakat (3):** oflayn holatda har muvaffaqiyatsiz
  so'rov global `unhandledrejection` orqali **"tarmoq xatosi" toast'i**
  chiqarardi — saqlangan kursni o'qiyotgan odamga uning nusxasi buzuq
  deb aytish. Endi tarmoq xatosi + (oflayn yoki `offlineOnly`) =
  jurnalga yoziladi, ekranga chiqmaydi (banner allaqachon aytgan).
  · **Kuzatilgan xatti-harakat (4):** hujjat hajmi API'da `fileSize`
  deb keladi (`sizeBytes` emas), ya'ni birinchi urinishda 40 MB fayl
  **nol bayt** deb o'qilgan va chegara **hech narsaga qo'llanmagan**.
  Ikkisi ham o'qiladi, test qadab qo'ydi.
  · **Tekshirildi** — front testlari 28 (`offlineContent.test.js`: nima
  saqlanadi, chegaralar, kvota mantiqi, hajm formati — sof funksiyalar,
  chunki node'da IndexedDB yo'q va soxta IndexedDB soxtani sinaydi) +
  **brauzerda (CDP) uchidan-uchiga**: haqiqiy kurs (dars + PDF) yaratildi,
  o'quvchi kirdi, reja ko'rsatildi («2 element, taxminan 384 B» va nima
  saqlanmasligi), yuklab olindi (IndexedDB: 1 kurs, 1 dars, 1 hujjat,
  1 blob), **tarmoq butunlay o'chirildi** va: dars sarlavhasi va matni
  ochildi, ogohlantirish chiqdi, kurs sahifasi saqlangan nusxadan
  chizildi, saqlangan PDF **canvas'ga render bo'ldi**. Sinov ma'lumotlari
  (kurs, mavzu, dars, hujjat, odam, 10 sessiya, audit) tozalandi.
  · **Chetlanish:** oflayn progress yozilmaydi — u 12.3 (navbat +
  `clientEventId`) ning ishi. Shuning uchun har uchta ekran buni
  **aytib turadi**, jimgina yo'qotmaydi.
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

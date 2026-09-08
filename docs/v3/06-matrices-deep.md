# 9. NOTIFICATION 1×1

> `docs/v2/04-matrices.md` da 52 hodisa sanab o'tilgan. Bu yerda **har bir
> maydon bo'yicha** (trigger, qabul qiluvchi, kanal, shablon, til, retry,
> xato boshqaruvi, foydalanuvchi sozlamasi, majburiylik) tahlil qilinadi va
> hozirgi 9 ta hodisaning **aniq kamchiliklari** ko'rsatiladi.

## 9.1 Hozirgi 9 hodisaning maydon-ba-maydon tahlili

| Hodisa | Trigger (kod) | Qabul qiluvchi | Kanal | Shablon | Til | Retry | Sozlama |
|---|---|---|---|---|---|---|---|
| `COURSE_ASSIGNED` | `courseAssignment.service.js:79`, `course.service.js:186` | 1 xodim | in-app + socket | ❌ kodda | ❌ **inglizcha** | ❌ | ❌ |
| `COURSE_DEADLINE_APPROACHING` | `reminderJob.js:21` (24 soat) | 1 xodim | in-app | ❌ | ❌ | ❌ | ❌ |
| `COURSE_EXPIRED` | `reminderJob.js:41` | 1 xodim | in-app | ❌ | ❌ | ❌ | ❌ |
| `TASK_ASSIGNED` | `task.service.js` | 1 xodim | in-app | ❌ | ❌ | ❌ | ❌ |
| `TASK_DEADLINE_APPROACHING` | `reminderJob.js:59` | 1 xodim | in-app | ❌ | ❌ | ❌ | ❌ |
| `TASK_OVERDUE` | `reminderJob.js:78` | 1 xodim | in-app | ❌ | ❌ | ❌ | ❌ |
| `ATTENTION_ALERT` | `attentionReport.service.js` | rahbar + SUPERADMIN | in-app | ❌ | ❌ | ❌ | ❌ |
| `FACE_SELF_ENROLLMENT` | `faceVerification.service.js:188` | SUPERADMIN | in-app | ❌ | ❌ | ❌ | ❌ |
| `FACE_VERIFICATION_LOCKED` | `faceGate.service.js` | xodim + SUPERADMIN | in-app | ❌ | ❌ | ❌ | ❌ |

**Umumiy xulosa:** to'qqizta hodisaning **hech biri** shablon, til, retry yoki
foydalanuvchi sozlamasiga ega emas. Bu bitta arxitektura muammosi
(`notify()` to'g'ridan-to'g'ri DB'ga yozadi), 9 ta alohida muammo emas —
shuning uchun **bitta refactor** hammasini hal qiladi.

## 9.2 Yetishmayotgan trigger'lar (kod bo'yicha aniq joyi bilan)

| Hodisa | Qayerda chaqirilishi kerak | Hozir u yerda nima bor |
|---|---|---|
| `COURSE_COMPLETED` | `videoEventProcessor.js:250` (assignment `COMPLETED` bo'lgan joy) | Faqat `updateById`, notify yo'q |
| `QUIZ_PASSED` / `QUIZ_FAILED` | `quiz.service.js:125` (attempt yozilgandan keyin) | Notify yo'q |
| `ASSIGNMENT_*` | mavjud emas (F-11/F-12 domeni) | — |
| `EVENT_*` (5 ta) | `event.service.js` — **butun faylda `notify` so'zi yo'q** | — |
| `CERTIFICATE_*` (4 ta) | mavjud emas | — |
| `NEWS_PUBLISHED` | `news.service.js` — **`notify` so'zi yo'q** | Yangilik chiqadi, hech kim bilmaydi |
| `BADGE_EARNED` | `badgeDefinitions.js` — badge o'qishda hisoblanadi, hodisa yo'q | Xodim badge olganini **hech qachon bilmaydi** |
| `ACCOUNT_CREATED` | `user.service.js:302` | Parol ekranda ko'rsatiladi, xodimga yuborilmaydi |
| `PASSWORD_RESET` | `auth.service.js:212` | **`logger.info` ga yoziladi** |

## 9.3 Majburiy (o'chirib bo'lmaydigan) turlar

| Tur | Nega majburiy |
|---|---|
| `PASSWORD_RESET`, `ACCOUNT_CREATED` | Hisobga kirish imkoniyati |
| `LOGIN_FROM_NEW_DEVICE` | Xavfsizlik ogohlantirishi |
| `CERTIFICATE_EXPIRED`, `COMPLIANCE_RETRAINING_DUE` | Huquqiy/compliance majburiyat |
| `EVENT_CANCELLED`, `EVENT_RESCHEDULED` | Xodim bekorga borib qolmasligi uchun |

---

# 10. AUTOMATION 1×1

| # | Avtomatlashtirish | Bizda | Dalil / kamchilik |
|---|---|---|---|
| 1 | Publish → auto-assign | ✅ | `course.service.js:170-200`. **Faqat targeting bor bo'lsa** ishlaydi — ataylab, "hammani biriktirib yubormaslik" uchun |
| 2 | Guruhga kurs → a'zolarga assignment | ✅ | `group.service.js`, `courseAssignment.groupId` bilan izlanadi — qo'lda biriktirilganini o'chirmaydi |
| 3 | Deadline eslatmasi | ◐ | `reminderJob.js` — **bitta 24 soatlik oyna**, bosqichli (7/3/1) emas; `deadlineReminderSentAt` bilan dedup ✅ |
| 4 | Kurs kechikdi (overdue) | ❌ | Task uchun bor, **kurs uchun yo'q** |
| 5 | `terminationDate` → deaktivatsiya | ✅ | `user.service.js:296` |
| 6 | Video tugadi → kurs tugadi | ◐ | `videoEventProcessor.js:238` — **faqat videolar** (F-01) |
| 7 | Quiz o'tildi → ball | ✅ | `quiz.service.js:118-121`, idempotent ledger |
| 8 | Video tugadi → ball | ✅ | `videoEventProcessor.js:225-227`, **quiz bor bo'lsa berilmaydi** — to'g'ri qaror |
| 9 | Diqqatsizlik → rahbarga xabar | ✅ | `attentionReport.notifyManagersIfNeeded`, `inattentionReportedAt` bilan bir marta |
| 10 | Begona yuz → snapshot + xabar | ✅ | `proctorSnapshot.service.js` |
| 11 | Trash → avtomatik tozalash | ✅ | `trash.service.js` `listExpired(before)` |
| 12 | Dashboard agregatsiyasi | ✅ | 5 daqiqada, `jobId` bilan takrorlanmaydi |
| 13–24 | Enrollment rule, onboarding, sertifikat, compliance, rejalashtirilgan hisobot, tadbir eslatmasi, waitlist, dinamik guruh, tavsiya, media tozalash, webhook, backup | ❌ | Hammasi yo'q — `docs/v2/04-matrices.md` §12 |

**Xulosa:** 12 ta avtomatlashtirish **allaqachon ishlaydi** va ularning
sifati yaxshi (dedup markerlari, idempotentlik, best-effort xato boshqaruvi).
Qo'shiladigan 12 tasi shu naqshlarni takrorlaydi — yangi ixtiro kerak emas.

---

# 11. REPORTING 1×1

| Hisobot | Bizda | Filtr | Sana | Drill-down | CSV | XLSX | PDF | Async | Reja | Scope |
|---|---|---|---|---|---|---|---|---|---|---|
| Employee progress | ✅ | rol, user, kurs | ✅ | ✅ (UI) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Course progress | ✅ | kurs | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Video analytics | ✅ | kurs | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| News analytics | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Task analytics | ✅ | status | ✅ | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quiz results | ❌ | | | | | | | | | |
| Question analysis | ❌ | | | | | | | | | |
| Assignment grading | ❌ | | | | | | | | | |
| Learning path | ❌ | | | | | | | | | |
| Certificate register | ❌ | | | | | | | | | |
| Compliance | ❌ | | | | | | | | | |
| Event attendance | ❌ | | | | | | | | | |
| Onboarding | ❌ | | | | | | | | | |
| Manager scorecard | ❌ | | | | | | | | | |
| Department performance | ❌ | | | | | | | | | |
| Organization | ❌ | | | | | | | | | |
| 360 / OJT / Dev plan | ❌ | | | | | | | | | |
| Login activity | ❌ | | | | | | | | | |
| Audit | ❌ | | | | | | | | | |
| Content performance | ◐ | dashboard'da (`mostSkippedVideos`) | — | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Custom builder | ❌ | | | | | | | | | |

**Uchta tizimli kamchilik (hisobot turidan qat'i nazar):**
1. **Scope yo'q** — F-08, CRITICAL
2. **Ekranda ko'rish yo'q** — hisobot faqat fayl bo'lib chiqadi (FL-29)
3. **`MAX_ROWS = 5000` jimgina kesadi** — foydalanuvchi to'liq bo'lmagan faylni
   to'liq deb o'ylaydi (`reportData.service.js:16`)

---

# 12. AI 1×1

| Qobiliyat | Input | Output | Model | Kontekst | Token nazorati | PII himoyasi | Scope | Audit | Inson tasdig'i |
|---|---|---|---|---|---|---|---|---|---|
| **AI assistant** ✅ | savol matni | javob | `claude-opus-5` | kurs/mavzu/video nomi + tavsifi | ◐ `HISTORY_CONTEXT_TURNS=16` | ✅ faqat kontent | ✅ `resolveScope` har so'rovda DB'dan | ❌ | — |
| AI course generation | PDF/DOCX/PPTX | kurs strukturasi + darslar | Claude + tool use | manba matni | ❌ kerak | ✅ qoida | `ai:generate:content` | ❌ kerak | ✅ `DRAFT` |
| AI quiz generation | dars matni | `Question[]` | Claude + JSON sxema | dars | ❌ | ✅ | " | ❌ | ✅ `DRAFT` |
| AI question generation | mavzu + qiyinlik | savollar | Claude | bank tegi | ❌ | ✅ | " | ❌ | ✅ |
| AI image generation | prompt | rasm | tashqi provider | — | ❌ | ✅ | " | ❌ | ✅ |
| AI translation | kontent + struktura | `ContentTranslation` | Claude | struktura sxemasi | ❌ | ✅ | `ai:translate` | ❌ | ✅ ko'rib chiqish |
| AI rewriting | matn bo'lagi | variantlar | Claude | dars | ❌ | ✅ | " | ❌ | ✅ |
| AI summarization | uzun matn | xulosa | Claude | material | ❌ | ✅ | " | ❌ | ✅ |
| AI learning objectives | kurs | maqsadlar ro'yxati | Claude | kurs tavsifi | ❌ | ✅ | " | ❌ | ✅ |
| AI course outline | mavzu | struktura | Claude | — | ❌ | ✅ | " | ❌ | ✅ |
| AI content extraction | fayl | toza matn | `pdfjs`/`mammoth` (AI emas) | — | — | ✅ | " | ❌ | — |
| AI recommendations | profil | kurs ro'yxati | qoida (AI emas) + Claude izohi | agregat | ❌ | ⚠️ faqat agregat | — | ❌ | — |

**Mavjud AI implementatsiyasidan saqlanadigan naqshlar:**
- `aiChat.service.js:26-56` `resolveScope()` — scope **har so'rovda DB'dan
  qayta hisoblanadi**, klientdan kelgan id'lar faqat qidirish uchun ishlatiladi.
  Bu naqsh barcha yangi AI endpoint'lariga majburiy.
- `buildSystemPrompt()` — model **video mazmuniga ega emasligini** ochiq
  aytadi va shu haqda foydalanuvchini ogohlantirishga majburlaydi
  (`aiChat.service.js:59-62`). Halollik naqshi — saqlanadi.
- `aiChatRateLimit.middleware.js` — alohida limiter mavjud.

**Yetishmayotgan uchta nazorat:**
1. **Token/xarajat byudjeti** — hozir hech qanday oylik chegara yo'q
2. **Audit** — AI chaqiruvi `auditLogs`ga tushmaydi
3. **`AiGenerationJob`** — uzoq generatsiya uchun job modeli yo'q

---

# 13. SECURITY 1×1

| # | Nazorat | Holat | Dalil | Amal |
|---|---|---|---|---|
| 1 | Parol hashlash (argon2id) | ✅ | `utils/hash.js`, `argon2` dep | KEEP |
| 2 | Access token (qisqa, xotirada) | ✅ | `stores/auth.js`, `utils/tokens.js` | KEEP |
| 3 | Refresh rotation + reuse detection | ✅ | `session.model.js` `replacedBy` | KEEP |
| 4 | CSRF (double-submit) | ✅ | `csrf.middleware.js`, faqat `/auth/refresh` | KEEP |
| 5 | Login rate limit + slow-down | ✅ | `loginRateLimit.middleware.js` | KEEP |
| 6 | Account lockout | ✅ | `failedLoginAttempts`, `lockedUntil` | KEEP |
| 7 | CAPTCHA | ✅ | `captcha.service.js` (pluggable) | KEEP |
| 8 | User enumeration'ga qarshi | ✅ | `auth.service.js:204` izohi + test | KEEP |
| 9 | Face verification (biometrik 2FA) | ✅ | 3 gate action | KEEP |
| 10 | Proctoring | ✅ | `proctorSnapshot`, 180 kun TTL, audit'li ko'rish | KEEP |
| 11 | **TOTP 2FA** | ❌ | — | ADD |
| 12 | **Parol tiklash yetkazilishi** | ❌ | `auth.service.js:212` | **CRITICAL** |
| 13 | **Parol siyosati** (murakkablik, tarix) | ◐ | zod'da faqat min uzunlik | EXTEND |
| 14 | **Foydalanuvchi o'z sessiyalarini ko'rishi** | ❌ | `sessions` modeli bor, UI yo'q | ADD |
| 15 | RBAC (permission-based) | ✅ | `rbac.middleware.js` | KEEP |
| 16 | Resource-level (IDOR) | ✅ | `security.test.js` da 3 test | KEEP |
| 17 | **Scope rol nomiga bog'langan** | ❌ | 14 joy (§1.5) | **CRITICAL** |
| 18 | **Hisobot/dashboard scope'i** | ❌ | §1.4 | **CRITICAL** |
| 19 | **Leaderboard PII** | ❌ | `points.service.js:104` | **CRITICAL** |
| 20 | zod validatsiya | ✅ | 24 validator | KEEP |
| 21 | Fayl magic-byte tekshiruvi | ✅ | `file-type`, `materialUpload.service.js` | KEEP |
| 22 | Server-generated storage key | ✅ | Path traversal yo'q | KEEP |
| 23 | XSS (plain-text kontent) | ✅ | `news.model.js` izohi — ataylab HTML emas | KEEP |
| 24 | **HTML sanitizatsiyasi (KB/dars uchun)** | ❌ | `sanitize-html` yo'q | ADD (KB bilan birga) |
| 25 | **ReDoS** | ❌ | `course.repository.js:91` escape'siz | **CRITICAL** |
| 26 | CORS allowlist | ✅ | `app.js:34-43` + test | KEEP |
| 27 | helmet | ✅ | `app.js:24` | KEEP |
| 28 | **CSP (SCORM iframe uchun)** | ⚠️ | helmet default `frame-src 'self'` | EXTEND (Phase 7) |
| 29 | Signed URL | ✅ | Mexanizm to'g'ri | KEEP |
| 30 | **Signed URL host** | ❌ | Loopback (§1.1) | **HIGH** |
| 31 | Video per-segment auth | ✅ | `videoPlaybackToken.middleware.js` | KEEP |
| 32 | Watermark | ✅ | Ism + JSHSHIR overlay | KEEP |
| 33 | Face embedding `select:false` | ✅ | `faceProfile.model.js` + test | KEEP |
| 34 | **Yuklab olishni cheklash** | ❌ | `allowDownload` yo'q; `openStream` tayyor | EXTEND |
| 35 | Audit yozuvi | ✅ | 60+ action | KEEP |
| 36 | **Audit ko'rish** | ❌ | Route yo'q | **CRITICAL** |
| 37 | **Audit TTL** | ❌ | Cheksiz o'sish | HIGH |
| 38 | **Eksport auditi** | ❌ | Kim nimani eksport qilgani noma'lum | HIGH |
| 39 | **Backup / restore** | ❌ | Yo'q | **CRITICAL** |
| 40 | **At-rest shifrlash** | ❌ | — | MEDIUM |
| 41 | Sirlar logga tushmasligi | ✅ | Parol/token loglanmaydi | KEEP |
| 42 | **API kalitlari** | ❌ | — | ADD (Phase 6) |
| 43 | **Webhook imzosi** | ❌ | — | ADD (Phase 6) |
| 44 | **SSO / OIDC** | ❌ | — | ADD (Phase 6) |
| 45 | Rate limiting (11 limiter) | ✅ | — | KEEP |
| 46 | `trust proxy: 1` | ✅ | `app.js:23` — izohda sababi | KEEP |
| 47 | **Error tracking** | ❌ | Faqat winston | HIGH |
| 48 | **Socket.io Redis adapter** | ❌ | `realtime/socket.js` da adapter yo'q | HIGH (miqyoslash) |

---

# 14. MOBILE 1×1

| Oqim | Responsive web (biz) | PWA (biz, rejada) | iSpring native | Farq |
|---|---|---|---|---|
| Login | ✅ | ✅ | ✅ | — |
| Dashboard | ✅ `BottomNav` | ✅ | ✅ | — |
| Kurs ro'yxati | ✅ | ✅ | ✅ | — |
| Video | ✅ `hls.js` | ✅ | ✅ | Native'da yuklab olish bor |
| Hujjat | ✅ `MaterialViewer` | ✅ | ✅ | — |
| Test | ✅ | ⚠️ **oflayn ishlamaydi** (server taymer) | ✅ oflayn | **Ataylab** — imtihon yaxlitligi |
| Topshiriq | ❌ domen yo'q | — | ✅ | — |
| Sertifikat | ❌ domen yo'q | — | ✅ | — |
| Bildirishnoma | ◐ faqat ilova ochiq bo'lsa | ✅ push | ✅ push | **HIGH gap** |
| Kalendar | ◐ faqat tadbirlar | ✅ | ✅ | — |
| Live trening | ❌ | — | ✅ | — |
| Progress | ✅ | ✅ | ✅ | — |
| **Oflayn** | ❌ | ✅ rejada | ✅ | **HIGH gap** |
| **Sinxronizatsiya** | ❌ | ✅ rejada | ✅ | `watchedSegments` merge oflayn segmentlarni tabiiy qabul qiladi |
| Kamera (OJT, QR davomat) | — | ✅ mumkin | ✅ | — |

**PWA vs native — funksional farq:** yagona real yo'qotish — **push
bildirishnomasi iOS'da** (Safari PWA push 16.4+ dan bor, lekin foydalanuvchi
ilovani "Home Screen"ga qo'shishi shart). Buni Telegram kanali bilan
qoplash mumkin va bu mahalliy sharoitda amalda ishonchliroq.

---

# 15. ACCESSIBILITY 1×1 (WCAG 2.1 AA)

| Mezon | Holat | Dalil / kerakli ish |
|---|---|---|
| Klaviatura navigatsiyasi | ◐ | Native `<button>`/`<input>` ishlaydi; `Modal.vue`, `Drawer.vue` da **focus-trap yo'q** → Tab modaldan chiqib ketadi |
| Escape bilan yopish | ⚠️ tekshirilmagan | `Modal.vue` da `keydown.esc` bor-yo'qligi audit qilinishi kerak |
| Screen reader / ARIA | ❌ | `aria-label`, `role`, `aria-live` deyarli yo'q; `ToastHost.vue` `aria-live="polite"` bo'lishi shart |
| Focus ko'rinishi | ◐ | Tailwind default; `:focus-visible` uchun aniq token yo'q |
| Rang kontrasti | ⚠️ | Dark/light bor, lekin **hech qachon o'lchanmagan**; `text-ink-faint` yorug' fonda AA'dan o'tmasligi mumkin |
| Alt text | ❌ | `ImageUploadField.vue` alt so'ramaydi; `material.altText` maydoni yo'q |
| Subtitr / caption | ❌ | Video pleyerda `<track>` yo'q, VTT saqlanmaydi — **AA uchun majburiy** |
| Forma validatsiyasi | ◐ | Xato matni ko'rsatiladi, `aria-describedby` bog'lanmagan |
| Test kirish imkoniyati | ❌ | Radio guruhlari `fieldset`/`legend`siz |
| Video pleyer | ❌ | Klaviatura shortcut'lari va subtitr tugmasi yo'q |
| Modal / navigatsiya | ❌ | `role="dialog"`, `aria-modal` yo'q |
| Til atributi | ⚠️ | `<html lang>` i18n bilan o'zgaradimi — tekshirish kerak |

**Ustuvor uchta ish:** (1) subtitr — majburiy va kontentga ta'sir qiladi;
(2) modal focus-trap — 24 komponentning bittasida tuzatilsa hammasiga tegadi;
(3) rang kontrastini o'lchash — token darajasida bir marta tuzatiladi.

---

# 16. PERFORMANCE 1×1

## 16.1 Miqyos bo'yicha bashorat

| Foydalanuvchi | Holat | Birinchi buziladigan joy |
|---|---|---|
| **50** | ✅ Bemalol | — |
| **500** | ✅ Bemalol | — |
| **5 000** | ◐ Ishlaydi, lekin sekinlashadi | Dashboard agregatsiyasi (`User.find({})` to'liq skan), leaderboard (barcha faol foydalanuvchi xotiraga) |
| **50 000** | ❌ Buziladi | `reminderJob` N+1, leaderboard xotirasi, `MAX_ROWS` eksport, `videoAnalyticsEvents` hajmi |
| **500 000** | ❌ Arxitektura o'zgarishi kerak | Sharding, alohida analitika ombori, CDN |

> **Kontekst:** bugungi server — 1.9 GB RAM, olti begona sayt bilan bir VM'da.
> Bu **5 000 dan yuqorisi haqida gapirishga ham imkon bermaydi**.

## 16.2 Aniq topilgan muammolar (dalil bilan)

| # | Muammo | Fayl | Ta'sir | Yechim |
|---|---|---|---|---|
| 1 | **N+1: reminder job** | `reminderJob.js:18-31, 38-50` — har assignment uchun `Course.findById` **va** `assignment.save()` | 10 000 kechikkan assignment = 20 000 so'rov, 15 daqiqada bir marta | `$in` bilan kurslarni bir so'rovda olish; `bulkWrite` bilan yozish |
| 2 | **To'liq kolleksiya skani** | `dashboardAggregation.js:98` `User.find({}, {_id:1})` + JS loop | 50 000 xodimda har 5 daqiqada | `$lookup`/`$facet` bilan bitta aggregation |
| 3 | **Leaderboard xotirada** | `points.service.js:92` `userRepository.listActive({department})` → hamma xotiraga, keyin `merge` va `sort` | 50 000 faol foydalanuvchi = ~50 MB obyekt | Aggregation pipeline'da `$sort` + `$limit` |
| 4 | **N+1: employee performance** | `employeeInsights.service.js:126` `courseIds.map(id => videoRepository.listByCourse(id))` | 30 kursli xodimda 30 so'rov | `$in: courseIds` bilan bitta so'rov |
| 5 | **Kurs progressi qimmat** | `course.service.js:71-140` — bitta ko'rish uchun ~8 so'rov | Kurs sahifasi har ochilganda | Keshlash (`courseCacheKey` naqshi bor) yoki denormalizatsiya |
| 6 | **Eksport sinxron** | `report.controller.js:36-52` — 5000 qator PDF/XLSX HTTP javobida | Bir necha eksport = API bloklanadi | `exportQueue` + fayl havolasi |
| 7 | **`MAX_ROWS` jimgina kesadi** | `reportData.service.js:16` | Ma'lumot yo'qolgani bilinmaydi | Javobda `truncated: true` yoki async |
| 8 | **Socket.io adapter yo'q** | `realtime/socket.js:74` `socket.join(userRoom)` | Ikkinchi instansiya qo'shilsa bildirishnoma **yo'qoladi** | `socket.io-redis-adapter` |
| 9 | **Audit log cheksiz** | `auditLog.model.js` — TTL yo'q | Yillar davomida eng katta kolleksiyaga aylanadi | TTL 730 kun + arxivlash |
| 10 | **Rasm optimizatsiyasi yo'q** | `imageUpload.service.js` | 5 MB cover rasm har ro'yxatda yuklanadi | `sharp` → webp + o'lchamlar |
| 11 | **Video CDN yo'q** | Nginx to'g'ridan-to'g'ri HLS uzatadi | 100 bir vaqtdagi ko'ruvchi = bandwidth cheklovi | CDN yoki alohida media host |
| 12 | **Bundle 1.44 MB** | `HOLAT.md` | Birinchi yuklanish sekin | Yanada bo'lish, `hls.js`/`pdfjs` lazy |

## 16.3 To'g'ri qilingan narsalar (saqlanadi)

- `videoAnalyticsEvents` — TTL 180 kun + `insertMany` (bir yozuv emas, batch)
- `dashboardCache` — pre-aggregation + `stale` bayrog'i
- `courseCacheKey` — 5 daqiqalik kesh, yozuvda invalidatsiya
- Kursorli pagination — barcha katta ro'yxatlarda
- Compound indekslar — har hot query uchun
- Video transcode alohida worker jarayonida

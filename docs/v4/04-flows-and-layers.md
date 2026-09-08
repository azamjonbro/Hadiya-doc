# 5. USER FLOW PARITY · 6–17. QATLAM PARITY

---

# 5. USER FLOW PARITY — persona bo'yicha

`✓` bor · `~` qisman · `✗` yo'q · `!` bor, lekin buzilgan/himoyasiz

## 5.1 ADMIN

| # | Flow | iSpring (manba) | Biz | Status | Yetishmayotgan qadam |
|---|---|:--:|:--:|:--:|---|
| A1 | Hisob yaratish | ✓ | ✓ | FULL | — |
| A2 | Tashkilot yaratish | ✓ (S5) | ✗ | N/A | §24 №2 |
| A3 | Bo'lim yaratish | ✓ | ✓ `OrgList` | FULL | — |
| A4 | Guruh yaratish | ✓ | ✓ | FULL | — |
| A5 | Rol yaratish | ✓ (S5 custom roles) | ✓ | FULL | — |
| A6 | **Ruxsat biriktirish** | ✓ | `!` | NONE | `PATCH /roles/:id` **yo'q** — rolni o'chirib qayta yaratish kerak |
| A7 | Kurs yaratish | ✓ | ~ | PARTIAL | Kategoriya/teg/daraja/muallif qadamlari yo'q; kontent alohida sahifada |
| A8 | Kontent qo'shish | ✓ | ~ | PARTIAL | Matn darsi yo'q; drag-drop yo'q; SCORM yo'q |
| A9 | Quiz yaratish | ✓ | ~ | PARTIAL | Bitta savol turi; bank yo'q; urinish chegarasi yo'q |
| A10 | Kursni publish qilish | ✓ | ✓ | FULL | Tasdiqlash zanjiri yo'q (VERIFY) |
| A11 | Kurs biriktirish | ✓ | ✓ | FULL | — |
| A12 | Learning path yaratish/biriktirish | ✓ | ✗ | NONE | Butun oqim |
| A13 | Onboarding yaratish | ✓ | ✗ | NONE | Butun oqim |
| A14 | Compliance o'qish yaratish | ✓ | ~ | PARTIAL | `mandatory`+deadline bor; takroriylik yo'q |
| A15 | Live trening yaratish | ✓ | ~ | PARTIAL | Yaratiladi, lekin ro'yxat/sig'im/davomat/eslatma yo'q |
| A16 | Sertifikat yaratish | ✓ | ✗ | NONE | Butun oqim |
| A17 | **Hisobot yaratish** | ✓ | `!` | PARTIAL | Scope yo'q (P0-1); ekranda ko'rish yo'q; rejalashtirish yo'q |

## 5.2 AUTHOR (bizda rol yo'q)

| # | Flow | iSpring | Biz | Status | Izoh |
|---|---|:--:|:--:|:--:|---|
| B1 | Kurs yaratish | ✓ Publisher roli (S5) | `!` | NONE | AUTHOR roli **yo'q** — `course:create` bo'lgan har kim **har qanday** kursni tahrirlaydi |
| B2 | Kurs tahrirlash | ✓ | `!` | NONE | Egalik tekshiruvi yo'q |
| B3 | Dars qo'shish | ✓ | ✗ | NONE | Matn darsi yo'q |
| B4 | Media qo'shish | ✓ | ✓ | FULL | tus + material upload |
| B5 | Quiz qo'shish | ✓ | ~ | PARTIAL | — |
| B6 | Preview | ✓ | ~ | PARTIAL | Admin DRAFT ko'radi, o'quvchi ko'zi bilan emas |
| B7 | Publish / tasdiqlashga yuborish | ✓ (VERIFY) | ~ | PARTIAL | To'g'ridan-to'g'ri publish; review zanjiri yo'q |

## 5.3 INSTRUCTOR (bizda rol yo'q)

| # | Flow | iSpring | Biz | Status |
|---|---|:--:|:--:|:--:|
| C1 | Biriktirilgan kurslarni ko'rish | ✓ | ✗ | NONE |
| C2 | O'quvchilarni boshqarish | ✓ | ~ (MANAGER bo'lim bo'yicha) | PARTIAL |
| C3 | Topshiriqni baholash | ✓ | ✗ | NONE |
| C4 | Quizni boshqarish | ✓ | ~ | PARTIAL |
| C5 | Live treningni boshqarish | ✓ | ✗ | NONE |
| C6 | Davomat | ✓ | ✗ | NONE |
| C7 | Progressni ko'rish | ✓ | ~ | PARTIAL |

## 5.4 MANAGER / SUPERVISOR

| # | Flow | iSpring | Biz | Status | Muammo |
|---|---|:--:|:--:|:--:|---|
| D1 | Jamoani ko'rish | ✓ Supervisor dashboard (S6) | `!` | PARTIAL | Bo'lim bo'yicha scope bor, lekin **`/bos` UI faqat SUPERADMIN'ga ochiq** (`router/index.js` `isSuperAdmin`) → rahbar UI'da hech narsa ko'rmaydi |
| D2 | Xodim progressini ko'rish | ✓ | ✓ | FULL | `employeeInsights` + `assertManagerCanView` |
| D3 | O'qish biriktirish | ✓ | ✓ | FULL | Bo'lim chegarasi majburlanadi |
| D4 | Samaradorlikni ko'rib chiqish | ✓ (360) | ✗ | NONE | 360 yo'q |
| D5 | Compliance ko'rish | ✓ | ✗ | NONE | — |
| D6 | **Hisobot ko'rish** | ✓ | `!` | **P0** | Scope yo'q → butun kompaniya ma'lumoti |

## 5.5 LEARNER

| # | Flow | iSpring | Biz | Status | Izoh |
|---|---|:--:|:--:|:--:|---|
| E1 | Login | ✓ | ✓ | OURS+ | JSHSHIR/passport + lockout + captcha + face gate |
| E2 | Dashboard | ✓ | ✓ | FULL | `HomeView` — bugun, davom ettirish, majburiy, yangilik, progress, vazifa, tadbir |
| E3 | Kurs topish | ✓ | ~ | PARTIAL | Faqat sarlavha bo'yicha qidiruv; kategoriya/teg filtri yo'q |
| E4 | Yozilish | ✓ | ✓ | FULL | Self-enroll + ko'rinish tekshiruvi |
| E5 | Kursni boshlash | ✓ | ✓ | FULL | — |
| E6 | Video ko'rish | ✓ | ✓ | OURS+ | 3 server tekshiruvi + anti-skip + diqqat monitoringi |
| E7 | Material o'qish | ✓ | `!` | PARTIAL | PDF/DOCX/XLSX/PPTX ishlaydi; **audio va yuklab olish buzilgan** (P0-5) |
| E8 | Test topshirish | ✓ | ~ | PARTIAL | Yaxlitlik **kuchli**, savol turlari **tor** |
| E9 | Testni qayta topshirish | ✓ chegarali | `!` | NONE | **Cheksiz** (P1-5) |
| E10 | Topshiriq yuborish | ✓ | ✗ | NONE | Faqat "bajardim" belgilash |
| E11 | Live treningga qatnashish | ✓ | ✗ | NONE | Ro'yxat yo'q |
| E12 | Learning path tugatish | ✓ | ✗ | NONE | — |
| E13 | Sertifikat olish | ✓ | ✗ | NONE | — |
| E14 | Yutuqlarni ko'rish | ✓ | ~ | PARTIAL | Badge bor, lekin **berilganda xabar yo'q** |
| E15 | Knowledge base qidiruvi | ✓ | ✗ | NONE | — |
| E16 | Bildirishnoma olish | ✓ in-app + e-mail + push | ~ | PARTIAL | Faqat in-app; **ilovaga kirmagan xodim hech narsa bilmaydi** |

**Flow jamlanmasi:** 46 oqim · FULL 12 · PARTIAL 16 · NONE 17 · N/A 1

---

# 6. DATABASE PARITY

| iSpring konsepti | Bizdagi model | Yetishmayotgan maydonlar | Migratsiya | Xavf |
|---|---|---|---|---|
| User | `user.model.js` (39 maydon) | `managerId`, `locale`, `notificationPrefs`, `customFields`, `employeeNumber`, `emailVerifiedAt`, `totpSecret`, `externalIds[]`, `deletedAt` | `$set` + `managerId` backfill | Past |
| Organization | — | butun entity | — | §24 №2 |
| Department | `orgList` + `user.department` (nom) | `parentId` | Rename skripti | O'rta |
| Group | `group.model.js` | `type`, `rule{}` | `$set type='STATIC'` | Past |
| Role | `role.model.js` | **`scope`** | `$set` (MANAGER→DEPARTMENT) | **Yuqori** — P0-2 |
| Course | `course.model.js` (14) | `categoryId`, `tags[]`, `level`, `authorIds[]`, `estimatedMinutes`, `prerequisiteCourseIds[]`, `certificateTemplateId`, `completionRule{}`, `navigationMode`, `validityDays`, `version`, `allowSelfEnroll`, `minMinutes` | `$set` default'lar (`navigationMode='SEQUENTIAL'` = hozirgi xatti-harakat) | Past |
| Learning track | — | butun entity | Yangi | Past |
| Page / Lesson | — | butun entity | Yangi | Past |
| Quiz | `quiz` + `assessment` (**dublikat sxema**) | `maxAttempts`, `timeLimitMinutes`, `shuffle*`, `pools[]`, `partialCredit`, `revealMode`, `scorePolicy` | M1 birlashtirish, `_legacy` bilan | **Yuqori** |
| Question | **embed**, ikki faylda | `type`, `payload`, `points`, `explanation`, `tags`, `difficulty` | M1 | **Yuqori** |
| Question bank | — | butun entity | M1 avtomatik yaratadi | Past |
| Certificate | — | butun entity | Yangi | Past |
| Assignment (uy vazifasi) | — (`task` boshqa) | butun entity | Yangi | Past |
| Event | `event.model.js` (8) | `mode`, `trainerIds[]`, `capacity`, `registeredCount`, `meeting{}`, `remindBeforeMinutes[]`, `status` | M6 `participants[]`→`EventRegistration` | Past |
| Knowledge base | — (`news` boshqa) | butun entity | Yangi | O'rta (HTML sanitizatsiya) |
| 360 / Competency / OJT / Dev plan | — | butun entity | Yangi | Past |
| Notification | `notification.model.js` | `channels[]`, `deliveredAt{}`, `templateKey`, `payload{}` | `$set` | Past |
| AuditLog | `auditLog.model.js` | — (sxema yaxshi) | **TTL indeks** + `{action,timestamp}` | Past |
| MediaAsset | — | butun entity | Yangi + orphan skan | O'rta |
| ApiKey / Webhook / SsoConfig | — | butun entity | Yangi | Past |

**Yetishmayotgan indekslar:** `courses` text · `users` text + `{managerId:1}` ·
`auditLogs` TTL + `{action,timestamp:-1}` · `notifications` TTL ·
`courseAssignments {courseId,status}` · `quizAttempts {quizId,createdAt}` ·
`materialProgress {materialId}`

---

# 7. BACKEND PARITY

| Qatlam | Holat | Yetishmayotgan |
|---|---|---|
| Controllers (30) | ✅ Yupqa, faqat HTTP | — |
| Services (45, 22 domen) | ✅ Biznes mantiq izchil shu yerda | ~30 yangi servis |
| Repositories (30) | ✅ Barcha DB kirish | ~25 yangi |
| Validators (24, zod) | ✅ | ~25 yangi |
| Middlewares (17, shundan 11 rate limiter) | ✅ | `scopeToManagedUsers`, `apiKeyAuth`, `apiKeyRateLimit`, `idempotency`, `publicEndpointGuard` |
| Queues (3) | ◐ video, dashboard, reminder | **13 yangi**: delivery, certificate, compliance, export, scheduledReport, enrollmentRule, onboarding, ai, webhook, mediaCleanup, searchIndex, backup, recommendation |
| Realtime | ◐ Socket.io ishlaydi | **Redis adapter yo'q** — ikkinchi instansiyada bildirishnoma yo'qoladi |
| Storage | ✅ Provider abstraksiyasi | — |
| **E-mail qatlami** | ❌ **Umuman yo'q** | `mail.service` |
| **OpenAPI** | ❌ | `zod-to-openapi` |
| Testlar (71) | ◐ Xavfsizlik yaxshi | Biznes mantiq: baholash, progress, tugatish, scope, migratsiya |

**MISSING LAYER tahlili** — iSpring konseptidan bizning qatlamlargacha:

| iSpring konsepti | Model | Servis | Controller | Route | Sahifa | Komponent | Job | Notify | Report |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Learning track | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Certificate | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Development plan | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Knowledge base | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Assignment | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✗ | ✗ |
| Event registration | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Event (mavjud)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | **✗** | **✗** |
| **Quiz (mavjud)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | **✗** | **✗** |
| **Badge (mavjud)** | ~ | ~ | — | — | ✓ | ✓ | — | **✗** | **✗** |
| Course | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Video | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

> Uch mavjud domenda **oxirgi qatlamlar yetishmaydi**: Event'da job, notify va
> report; Quiz'da notify va report; Badge'da model, job va notify. Bular
> arzon tuzatishlar — butun domen qurish emas.

---

# 8. API PARITY

| Mezon | Holat | Izoh |
|---|---|---|
| Autentifikatsiya | ✅ | `authenticate` har router'da |
| Avtorizatsiya | ✅ | `requirePermission` / `requireSelfOrPermission` / `requireRole` |
| **Scope** | ❌ | Hisobot va dashboard'da yo'q (P0-1) |
| Validatsiya | ✅ | 24 zod validator |
| Xato kodlari | ✅ | `ApiError` + semantik kod |
| Pagination | ✅ | Kursor **va** raqamli rejim |
| Filtr | ◐ | Bor, lekin kategoriya/teg/filial/guruh yo'q |
| **Saralash** | ❌ | Query parametri deyarli yo'q |
| Rate limit | ✅ | 11 limiter |
| Audit | ◐ | Yozuvda bor; **eksport va o'qishda yo'q** |
| **Idempotency** | ❌ | Oflayn va public API uchun kerak |
| **OpenAPI** | ❌ | — |
| Versiyalash | ✅ | `/api/v1` |

**API GAP (asimmetriyalar):**

| Tur | Endpoint | Holat |
|---|---|---|
| API bor, UI yo'q | `GET/PATCH/DELETE /events/:id` | Tadbir tahrirlanmaydi |
| API ham, UI ham yo'q | `PATCH /roles/:id` | Rol ruxsati o'zgartirilmaydi |
| Ruxsat bor, ishlatilmaydi | `audit:read` | Hech qanday route tekshirmaydi |
| API bor, prod'da buzilgan | `GET /materials/:id/download-url` | P0-5 |

---

# 9. FRONTEND PARITY

| Qatlam | Holat | Yetishmayotgan |
|---|---|---|
| Sahifalar (18 learner + 18 admin) | ◐ | ~30 yangi sahifa |
| UI komponentlar (24) | ✅ Izchil: empty/loading/error/toast/confirm/dark-light | `DataTable`, `FilterBar`, `RichTextEditor`, `FileDropzone`, `SortableList`, `Chart`, `CommandPalette`, `StepWizard`, `UserPicker` |
| State (Pinia, 4 store) | ◐ | `settings`, `notifications`, `search`, `catalog`, `offline` |
| Jadvallar | ❌ | Har sahifada qo'lda `<table>` — takrorlanish |
| Grafiklar | ◐ | `TrendChart` custom SVG | Yagona `Chart` abstraksiyasi |
| Formalar | ◐ | Qo'lda validatsiya | Umumiy form abstraksiyasi |
| i18n | ◐ | 3 til × 1393 kalit | iSpring 30 til |
| Responsive | ✅ | `BottomNav`, mobil grid | — |
| **PWA** | ❌ | manifest/SW yo'q | P1-21 |
| **Accessibility** | ❌ | ARIA, focus-trap, alt text yo'q | P2-15 |
| Dead code | ⚠️ | `admin/` papkasi birlashtirilgandan keyin qolgan | O'chirish |

---

# 10–17. QOLGAN QATLAMLAR — qisqa parity

## 10. PERMISSION PARITY
iSpring: 5 tayyor rol + Supervisor + **custom rollar** (S5).
Biz: 6 seed rol (2 tasi `EMPLOYEE` bilan bir xil → amalda **4 daraja**) + custom rollar ✅.
**Gap:** AUTHOR/INSTRUCTOR/MENTOR yo'q · 24 ruxsat kaliti (kerak ~69) ·
ruxsat matritsasi UI yo'q · `PATCH /roles/:id` yo'q · **scope rol nomiga bog'langan (P0-2)**.
Scope holati: `user` ✅ · `task` ✅ · `group` ✅ · `courseAssignment` ✅ ·
`leaderboard` ✅ · `employeeInsights` ✅ · **`report` ❌** · **`dashboard` ❌**.

## 11. NOTIFICATION PARITY
iSpring: e-mail (kurs tugatish, test o'tish, o'qilmagan chat), tadbir taklifi va
eslatmasi, 360 chastotasi sozlanadi (S1, S2).
Biz: **faqat in-app + socket**, 9 tur, matn kodda **inglizcha hardcoded**
(`reminderJob.js:22`), foydalanuvchi sozlamasi yo'q, retry yo'q.
**Score: 22/100** — eng past uch domendan biri.

## 12. AUTOMATION PARITY
iSpring: kriteriya bo'yicha avtomatik kurs biriktirish, development plan
avto-biriktirish (2026-08), avtomatik re-enrollment, tadbir eslatmalari (S1, S2, S3).
Biz: **12 ta avtomatlashtirish ishlaydi va sifati yaxshi** — dedup markerlari
(`deadlineReminderSentAt`), idempotentlik (`pointsLedger` sparse unique),
best-effort xato boshqaruvi (`course.service.js:193-196`).
**Yetishmaydi:** qoida dvigateli, sertifikat, re-enrollment, tadbir, onboarding,
rejalashtirilgan hisobot, webhook.

## 13. REPORTING PARITY
iSpring: **25+ hisobot**, saqlash/eksport/e-mail/rejalashtirish, BI eksport,
audit pack (S6, S7). Biz: 5 hisobot, 3 format, **3 til (ustunlik)**,
scope yo'q (P0-1), ekranda ko'rish yo'q, `MAX_ROWS 5000` jimgina kesadi.

## 14. SECURITY PARITY
Bizning poydevor **kuchli** (§18): argon2id, rotation+reuse detection, CSRF,
lockout, CAPTCHA, IDOR testlari, 11 limiter, magic-byte, face gate, proctoring.
**To'rt teshik:** hisobot scope (P0-1) · rol-nomli scope (P0-2) ·
leaderboard PII (P0-3) · ReDoS (P0-7). **Plus:** audit ko'rish yo'q,
backup yo'q, at-rest shifrlash yo'q, TOTP yo'q.
iSpring: on-premise, server shifrlash, fayl darajasida kirish (S1) — 2FA,
audit jurnali, proctoring **tasdiqlanmagan (VERIFY)**.

## 15. MOBILE PARITY
iSpring: native iOS+Android, **oflayn o'qish + avtomatik sinxronizatsiya**,
white-label mobil (S1). Biz: responsive web ✅, PWA/oflayn/push ❌.
Yaxshi xabar: `watchedSegments` merge algoritmi oflayn segmentlarni
**tabiiy qabul qiladi** — sinxronizatsiya konflikti muammosi yo'q.

## 16. ACCESSIBILITY PARITY
iSpring uchun rasmiy WCAG bayonoti **topilmadi (VERIFY)**. Biz: hech qachon
audit qilinmagan; ARIA, focus-trap, alt text, subtitr yo'q. Ikkala tomon ham
isbotlanmagan — lekin subtitr AA uchun majburiy va bizda yo'q.

## 17. PERFORMANCE PARITY
iSpring: 150 000 foydalanuvchi import (S1), AWS, "2024 da nol soat downtime" (S1).
Biz: naqshlar yaxshi (kesh, queue, indeks, kursor, alohida worker), lekin
**to'rt aniq muammo**: N+1 `reminderJob.js:18-50` · to'liq skan
`dashboardAggregation.js:98` · leaderboard xotirada `points.service.js:92` ·
Socket.io Redis adapter yo'q.
**Miqyos bashorati:** 1 000 ✅ · 10 000 ◐ · 50 000 ❌ · 100 000 ❌.
**Infratuzilma:** 1.9 GB RAM, olti begona sayt bilan bir VM'da.

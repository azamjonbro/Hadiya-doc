# 1. BIRINCHI AUDITDAGI XULOSALARNING TUZATISHLARI

> **Nima uchun bu bo'lim birinchi turibdi.** Ikkinchi bosqich topshirig'ining
> asosiy qoidasi: *"Oldingi auditdagi qarorlarni avtomatik to'g'ri deb qabul
> qilma."* Chuqurroq o'qishda **14 ta xulosa noto'g'ri yoki chala** bo'lib
> chiqdi. Har biri fayl, funksiya va satr bilan tasdiqlangan.

---

## 1.1 ✅ TUZATISH: "Material yuklab olish butunlay buzilgan"

**v2 da yozilgan:** *"Material yuklab olish buzilgan — presigned URL loopback
manzil ustidan imzolanadi, CRITICAL."*

**Aslida.** Materiallar **ikki xil yo'l** bilan yetkaziladi va faqat bittasi buzilgan:

| Yo'l | Endpoint | Kim ishlatadi | Prod'da holati |
|---|---|---|---|
| API stream (bayt proksi) | `GET /materials/:id/content` → `materialAccess.service.openStream()` | **PDF, DOCX, XLSX, PPTX** ko'rish (`MaterialViewer.vue:417`) | ✅ **Ishlaydi** |
| Presigned S3 URL | `GET /materials/:id/download-url` → `getDownloadUrl()` | **Audio** o'ynatish (`:401`), **yuklab olish tugmasi** (`:450`) | ❌ **Buzilgan** |

**Dalil.** `front/src/components/MaterialViewer.vue:392-425` — `load()` faqat
`kind === 'audio'` bo'lganda `getUrl(id,'inline')` chaqiradi; qolgan hamma
format `materialsApi.getContent(id)` orqali API'dan bayt oladi.
`backend/src/services/materials/materialAccess.service.js:74-84` — `openStream`
S3'dan `getObject` qilib, javobni o'zi uzatadi (izohda sababi yozilgan: CORS).

**Yangi verdikt:** buzilgan qism — **audio materiallar + har qanday yuklab
olish + `PARSE_MAX_BYTES` dan katta fayllar** (ular faqat yuklab olish yo'li
bilan ochilardi). Hujjat ko'rish ishlaydi.
**Status o'zgardi:** `REFACTOR / CRITICAL` → **`EXTEND / HIGH`**.

---

## 1.2 ✅ TUZATISH: "XLSX viewer yo'q, faqat yuklab olish"

**v2 da yozilgan:** *"XLS/XLSX — yuklanadi, lekin viewer yo'q. LOW / EXTEND."*

**Aslida.** XLSX **brauzerda jadval sifatida ko'rsatiladi**.

**Dalil.** `MaterialViewer.vue:89` — mime aniqlash `xlsx` turini qaytaradi;
`:427-430` — `renderXlsx(buffer)` chaqiriladi; `front/package.json` — `exceljs`
frontend dependency sifatida turibdi (backend'dagi eksport uchun emas).

**Status o'zgardi:** `EXTEND` → **`KEEP`**. Qo'shimcha ish kerak emas.

---

## 1.3 ✅ TUZATISH: "Manager scope'i yo'q"

**v2 da yozilgan:** *"`user.managerId` yo'qligi sabab 'o'z jamoasi' degan narsa
yo'q; MANAGER scope'i CRITICAL EXTEND."*

**Aslida.** Department darajasidagi manager scope'i **mavjud va server tomonda
majburlanadi** — beshta domenda:

| Domen | Fayl / funksiya | Nima qiladi |
|---|---|---|
| Foydalanuvchilar | `user.service.js:159-163` | `list()` MANAGER uchun `department` ni majburan o'z bo'limiga o'rnatadi |
| " | `user.service.js:87-93` `assertManagerCanView` | `getById` va barcha employee-insight tab'lari shundan o'tadi |
| " | `user.service.js:74-85` `assertManagerCanManage` | Faqat EMPLOYEE-tier + o'z bo'limi |
| " | `user.service.js:99-152` `partitionBulkTargets` | Bulk amallar uchun satr-ba-satr sabab bilan rad etish |
| Vazifalar | `task.service.js:62-71, 86-94` | Broadcast va bitta-bitta biriktirish bo'lim bilan chegaralangan |
| Guruhlar | `group.service.js:58, 65, 126, 149, 193` | Ro'yxat, yaratish, tahrirlash bo'lim bilan chegaralangan |
| Kurs biriktirish | `courseAssignment.service.js:28-38, 139` | `assertManagerScopeForUser` + `filterToManagerDepartment` |
| Leaderboard | `points.service.js:79-93` | MANAGER board'i o'z bo'limidan chiqmaydi |
| Employee insights | `employeeInsights.service.js:69-73` | `userService.getById` ni qayta ishlatadi |

**Status o'zgardi:** `ADD / CRITICAL` → **`EXTEND / HIGH`** — poydevor bor.

**Lekin ikkita real kamchilik qoldi (quyida 1.4 va 1.5).**

---

## 1.4 🔴 YANGI TOPILGAN KAMCHILIK: Hisobot va dashboard scope'siz

MANAGER'da `report:export` va `analytics:view:all` ruxsatlari bor
(`packages/shared/src/permissions.js:78-79`), lekin:

```
routes/v1/reports.routes.js:12   reportsRouter.use(authenticate, requirePermission(REPORT_EXPORT))
controllers/report.controller.js:20  const { format, lang, ...filters } = req.validatedQuery
                                     await reportDataService.build(type, filters, lang)   // ← actor yo'q
```

`reportDataService.build()` **actor qabul qilmaydi**
(`reportData.service.js:361`), ya'ni bo'lim filtri qo'llanmaydi.

**Natija:** `GET /users` MANAGER'ga faqat o'z bo'limini beradi, lekin
`GET /reports/employee-progress/export` unga **butun kompaniyaning** ism,
JSHSHIR, bo'lim va progress ma'lumotini XLSX qilib beradi.

Xuddi shu holat: `routes/v1/dashboard.routes.js:11` — `GET /dashboard`
`ANALYTICS_VIEW_ALL` bilan, `dashboardAggregation.js` scope'siz —
MANAGER butun kompaniya dashboard'ini ko'radi.

**Yangi element:** `REFACTOR / CRITICAL` — mavjud scope'ni ikki joyga yoyish.

---

## 1.5 🔴 YANGI TOPILGAN KAMCHILIK: Scope faqat rol nomiga bog'langan

Barcha scope tekshiruvlari `actor.roleName === ROLES.MANAGER` shaklida
(9 fayl, 14 joy — §1.3 jadvali). Lekin loyihaning o'z hujjati aytadi:

> *"Adding a new role is a data operation, not a code change"* — `docs/auth-rbac.md`

Ya'ni admin `POST /roles` bilan `SUPERVISOR` degan rol yaratib, unga
`user:read` bersa — **u hech qanday bo'lim chegarasisiz butun kompaniyani
ko'radi**, chunki `roleName` `'MANAGER'` emas.

**Yechim:** scope'ni rol nomidan **ruxsat kalitiga** ko'chirish —
`user:read:department` / `user:read:all` yoki `role.scope` maydoni.

**Yangi element:** `REFACTOR / CRITICAL`.

---

## 1.6 🔴 YANGI TOPILGAN KAMCHILIK: Leaderboard JSHSHIR'ni oshkor qiladi

```
routes/v1/gamification.routes.js   gamificationRouter.use(authenticate)   // ruxsat yo'q
                                   .get('/leaderboard', ...)
services/gamification/points.service.js:104   jshshir: user.jshshir,   // ← har bir qatorda
```

Har qanday tizimga kirgan xodim `GET /gamification/leaderboard` ni chaqirib
**hamkasblarining 14 xonali JSHSHIR raqamlarini** oladi. Frontend uni
ko'rsatmasligi mumkin, lekin bu server nazorati emas.

**Yangi element:** `REFACTOR / CRITICAL` — DTO'dan `jshshir` ni olib tashlash
(faqat `ANALYTICS_VIEW_ALL` bo'lganda qo'shish).

---

## 1.7 🔴 YANGI TOPILGAN NOMUVOFIQLIK: Kurs tugatish ikki xil hisoblanadi

Bu ikkala kod ham bugun ishlab turibdi va **bir-biriga zid**:

| Joy | Nima hisoblaydi |
|---|---|
| `course.service.js:110-126` `computeCourseProgress` | video **+ material (sahifa ulushi) + assessment (o'tilgan)** |
| `analytics/videoEventProcessor.js:238-252` | **faqat published videolar** |

`videoEventProcessor` `CourseAssignment.status` ni `COMPLETED` qiladi, va
u faqat videolarga qaraydi:

```js
const publishedVideoIds = courseVideos.filter(v => v.status === 'PUBLISHED')...
const allCompleted = publishedVideoIds.length > 0 && publishedVideoIds.every(...)
```

**Ikkita real oqibat:**

1. **Videosiz kurs hech qachon tugallanmaydi.** `publishedVideoIds.length > 0`
   sharti tufayli faqat taqdimot va testdan iborat kurs abadiy `ACTIVE`
   qoladi — xodim UI'da 100% ko'radi, hisobotda "tugallanmagan" bo'lib turadi.
2. **Test o'tilmasa ham kurs tugallanadi.** Videolar tugagach assignment
   `COMPLETED` bo'ladi, majburiy assessment yiqilgan bo'lsa ham.

**Yangi element:** `REFACTOR / CRITICAL` — tugatish qoidasi bitta joyda
bo'lishi kerak (`completionRule`), va sertifikat ham shu joydan chiqadi.

---

## 1.8 ✅ TUZATISH: "Hech qanday sozlama modeli yo'q — hammasi .env"

**Aslida.** DB'da saqlanadigan, **GLOBAL → COURSE meros zanjiri** bilan
ishlaydigan ikkita to'liq siyosat tizimi bor:

| Model | Maydonlar | Meros | Admin UI |
|---|---|---|---|
| `attentionPolicy.model.js` | `enabled, graceSeconds, pauseOnWarning, lockoutAfterWarnings, lockoutSeconds, requireRewatch, notifyManagerAfter, captureOnForeignFace` (8 ta) | `scope: GLOBAL\|COURSE`, `undefined` = meros | `AttentionPolicyForm.vue` |
| `facePolicy.model.js` | `verifyEveryOpen` | GLOBAL + COURSE | `FacePolicyForm.vue` |

Meros mantiqi `packages/shared/src/facePolicy.js:39-47` `resolveFacePolicy()`
va `attention.js` dagi bir xil naqshda — `undefined`/`null` = *"merosga qoldir"*,
bu `facePolicy.test.js` da testlar bilan qoplangan.

**Status o'zgardi:** `ADD / HIGH` → **`EXTEND / HIGH`**. Umumiy `Settings`
modeli **noldan qurilmaydi** — mavjud `scope + inherit` naqshi umumlashtiriladi.

---

## 1.9 ✅ TUZATISH: "Faqat 3 test fayli — qamrov yo'q"

**Aslida.** 3 fayl, lekin **71 test**:

| Fayl | Testlar | Nimani qoplaydi |
|---|---|---|
| `security.test.js` | 39 | Auth (6), avtorizatsiya/privilege escalation (6), IDOR (3), CORS, rate limit, xavfsizlik sarlavhalari |
| `faceVerification.test.js` | 24 | Descriptor matematikasi, enrollment RBAC, status leak, lockout, kunlik gate |
| `facePolicy.test.js` | 8 | Meros qoidasi, `null` vs `undefined`, timezone chegarasi |

Xavfsizlik qamrovi **yaxshi**. Yo'q narsa — **biznes mantiq testlari**:
baholash, `watchedSegments` merge, kurs tugatish, hisobot agregatsiyasi,
migratsiyalar.

**Status o'zgardi:** `ADD / HIGH` → **`EXTEND / HIGH`** — ramka bor, uni
biznes mantiqqa yoyish kerak.

---

## 1.10 ✅ TUZATISH: "Pagination har doim kursorli"

**Aslida.** Ikkala rejim ham qo'llab-quvvatlanadi va tanlov `query.page`
mavjudligiga qarab qilinadi:

```
course.service.js:236-250   if (query.page) { listPage + count → total, totalPages }
                            else            { cursor → nextCursor }
user.service.js:188-206     — aynan bir xil naqsh
```

**v2 dagi "barcha yangi ro'yxatlar kursor naqshida"** tavsiyasi to'g'ri, lekin
"mavjud tizim faqat kursor ishlatadi" degan tavsif noto'g'ri edi.

---

## 1.11 ✅ TUZATISH: "Assessment — oddiy test, faqat taymer bor"

**Aslida.** Imtihon yaxlitligi bo'yicha implementatsiya iSpring'dan sezilarli
darajada kuchli, va v2 buni yetarlicha baholamagan:

| Nazorat | Dalil |
|---|---|
| Savollar sessiya boshlanmaguncha **umuman berilmaydi** | `assessment.service.js:194-212` — `getById` o'quvchiga faqat `toAssessmentSummary` (savol soni, o'tish bali, vaqt) qaytaradi |
| Reload yangi vaqt bermaydi | `:236-241` — faol sessiya qaytariladi, `expiresAt` qayta hisoblanmaydi |
| Tashlab ketilgan sessiya **nol ball bilan yoziladi** | `:243-248` `closeExpiredSession` — "savollarni o'qib, javobini topib qaytish" yo'lini yopadi |
| Focus-loss javoblarni **o'zi bilan olib keladi** | `:265-290` — brauzer qaytmasa ham baho qo'yiladi |
| Testdan oldin **yuzni tekshirish** | `:222` — `faceGateService.assertVerified(actor, ASSESSMENT)` |
| Kursga biriktirilganlik | `:216` `assertAssignedOrStaff` |

**Status:** `KEEP` (ilgari ham KEEP edi, lekin sabablari to'liq yozilmagan edi).

---

## 1.12 ✅ TUZATISH: Face gate faqat videoda emas

**v2 da yozilgan:** *"kunlik gate video playback'da."*

**Aslida** uchta harakat qamrab olingan
(`packages/shared/src/facePolicy.js:29-33` `FACE_GATE_ACTIONS`):

| Harakat | Chaqiruv joyi |
|---|---|
| `VIDEO` | `videoAccess.service.js` — token berishdan oldin |
| `MATERIAL` | `materialAccess.service.js:39` — bayt berishdan oldin |
| `ASSESSMENT` | `assessment.service.js:222` — savollarni berishdan oldin |

Va `verifyEveryOpen` siyosati bilan "kuniga bir marta" → "har ochilishda"
rejimiga o'tkazish mumkin.

---

## 1.13 ✅ TUZATISH: "S3 orphan fayllar — taxmin"

**Aslida** bu kodda **ochiq hujjatlashtirilgan**:

```js
// course.service.js:378-381
// Note this deletes database rows only. Uploaded video objects (originals
// and HLS segments) stay in S3, since removing them means walking a whole
// key prefix per video ...
```

Ya'ni bu taxmin emas, ma'lum va qabul qilingan qarz. `mediaCleanupQueue`
takliﬁ o'z kuchida qoladi, lekin endi dalil bilan.

---

## 1.14 ⚠️ ANIQLASHTIRISH: API bor, UI yo'q

Frontend service fayllari bilan backend route'larni solishtirganda **uchta**
endpoint guruhi UI'siz qolgani aniqlandi:

| Endpoint | Backend | Frontend chaqiruv | Holat |
|---|---|---|---|
| `GET /events/:id` | `events.routes.js` | yo'q (`services/events.js` faqat `calendar` va `POST /events`) | **API GAP (teskari)** |
| `PATCH /events/:id` | bor | yo'q | Tadbirni tahrirlab bo'lmaydi |
| `DELETE /events/:id` | bor | yo'q | Tadbirni o'chirib bo'lmaydi |

Va aksincha — **rol tahrirlash umuman yo'q**: `roles.routes.js` da faqat
`GET /`, `POST /`, `DELETE /:id`. `PATCH /roles/:id` **na backendda, na
frontendda bor** → mavjud rolning ruxsatlarini o'zgartirib bo'lmaydi,
faqat o'chirib qayta yaratish mumkin.

---

## 1.15 Tuzatishlar jamlanmasi

| # | v2 verdikti | v3 verdikti | Yo'nalish |
|---|---|---|---|
| 1.1 | Material download REFACTOR/CRITICAL | EXTEND/HIGH | ⬇ yumshadi |
| 1.2 | XLSX viewer EXTEND | **KEEP** | ⬇ ish kerak emas |
| 1.3 | Manager scope ADD/CRITICAL | EXTEND/HIGH | ⬇ poydevor bor |
| 1.4 | — | **REFACTOR/CRITICAL** (hisobot scope) | ⬆ yangi |
| 1.5 | — | **REFACTOR/CRITICAL** (rol nomiga bog'liqlik) | ⬆ yangi |
| 1.6 | — | **REFACTOR/CRITICAL** (JSHSHIR oshkorligi) | ⬆ yangi |
| 1.7 | — | **REFACTOR/CRITICAL** (tugatish nomuvofiqligi) | ⬆ yangi |
| 1.8 | Settings ADD/HIGH | EXTEND/HIGH | ⬇ naqsh bor |
| 1.9 | Testlar ADD/HIGH | EXTEND/HIGH | ⬇ 71 test bor |
| 1.10 | Tavsif noto'g'ri | tuzatildi | — |
| 1.11 | Assessment KEEP (chala asos) | KEEP (to'liq asos) | — |
| 1.12 | Face gate faqat video | 3 harakat | — |
| 1.13 | Orphan — taxmin | hujjatlashtirilgan qarz | — |
| 1.14 | — | **Event UI yo'q, rol PATCH yo'q** | ⬆ yangi |

**Sof natija:** to'rtta yangi CRITICAL topildi (hammasi xavfsizlik yoki
ma'lumot yaxlitligi), beshta ish esa o'ylanganidan yengilroq bo'lib chiqdi.

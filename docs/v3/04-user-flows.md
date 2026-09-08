# 5. 1×1 USER FLOW COMPARISON

> Har bir oqim uchun: iSpring qadamlari, bizning qadamlarimiz, va to'rt xil
> nuqson — **YO'Q** (qadam umuman yo'q) · **ORTIQCHA** (keraksiz qadam) ·
> **NOTO'G'RI** (qadam bor, lekin noto'g'ri ishlaydi) · **HIMOYASIZ**
> (backend tekshiruvi yo'q, faqat UI).

---

## FL-01 · Kurs yaratish

| | Qadamlar |
|---|---|
| **iSpring** | Login → Kurslar → Yangi → Ma'lumot (nom, kategoriya, teg, daraja, muallif, davomiylik) → Kontent (bob/sahifa/blok, drag-drop) → Baholash → Kirish (guruh/qoida) → **Ko'rib chiqish** → Publish |
| **Biz** | Login → `/bos/courses` → Yangi → **1** Asosiy (nom, tavsif) → **2** Media (cover, banner) → **3** Kirish (rol/filial/bo'lim) → **4** Ko'rib chiqish → Saqlash (`DRAFT`) → **alohida sahifaga o'tish** (`CourseDetailView`) → mavzu qo'shish → mavzuga video/material/test qo'shish → Publish |

**Nuqsonlar:**
- **YO'Q** — kategoriya, teg, daraja, muallif, davomiylik, prerequisite qadamlari (`course.model.js` da bu maydonlar yo'q)
- **YO'Q** — kontent qadami sehrgar ichida yo'q; `CourseBuilderView.vue:22-27` da faqat 4 qadam bor va oxirgisi *"nextStepsHint"* badge'i bilan foydalanuvchini boshqa sahifaga uzatadi
- **YO'Q** — drag-drop tartiblash; `order` raqam bilan qo'lda kiritiladi
- **YO'Q** — autosave; sehrgar yopilsa kiritilgan hammasi yo'qoladi
- **NOTO'G'RI** — "Ko'rib chiqish" qadami faqat kiritilgan maydonlarni takrorlaydi, o'quvchi ko'zi bilan preview emas
- **HIMOYASIZ emas** ✅ — publish `course:create`/`course:update` bilan, `autoAssignIfNeeded` targeting bo'lmasa ishlamaydi (`course.service.js:170-176`)

---

## FL-02 · Kurs publish qilish

| | Qadamlar |
|---|---|
| **iSpring** | Draft → tekshiruvchiga yuborish → tasdiqlash → publish → auditoriyaga biriktirish → bildirishnoma |
| **Biz** | `PATCH /courses/:id {status:'PUBLISHED', autoAssign}` → agar targeting bor bo'lsa avto-biriktirish → `COURSE_ASSIGNED` in-app bildirishnoma |

**Nuqsonlar:**
- **YO'Q** — tasdiqlash zanjiri (`content:review`); bitta odam yaratadi va chiqaradi
- **NOTO'G'RI** — bildirishnoma faqat in-app; e-mail yo'q (F-05)
- **NOTO'G'RI** — bildirishnoma matni **inglizcha hardcoded**
  (`course.service.js:190` `` title: `Course assigned: ${course.title}` ``)
- ✅ **To'g'ri** — auto-assign faqat `DRAFT→PUBLISHED` o'tishida ishlaydi
  (`course.service.js:317-319`), qayta publish takroriy biriktirmaydi

---

## FL-03 · Kursga yozilish (admin biriktiradi)

| | Qadamlar |
|---|---|
| **iSpring** | Kurs → Auditoriya → foydalanuvchi/guruh/qoida → muddat → bildirishnoma |
| **Biz** | `AssignCoursePanel.vue` → `POST /courses/:id/assignments {userId, mandatory, startAt, deadline, expiresAt}` → MANAGER scope tekshiruvi → audit → bildirishnoma |

**Nuqsonlar:**
- **YO'Q** — guruhga to'g'ridan-to'g'ri biriktirish bu oqimda yo'q (guruh sahifasidan alohida qilinadi)
- **YO'Q** — qoidaga asoslangan avto-biriktirish (`EnrollmentRule`)
- ✅ **To'g'ri** — takroriy biriktirish `409 ASSIGNMENT_ALREADY_EXISTS`
  (`courseAssignment.service.js:64-68`), MANAGER bo'lim chegarasi majburlanadi

---

## FL-04 · Self-enroll

| | Qadamlar |
|---|---|
| **iSpring** | Katalog → kurs → "Yozilish" → (ixtiyoriy) rahbar tasdig'i → kirish ochiladi |
| **Biz** | Katalog → kurs → `POST /courses/:id/enroll` → `mandatory:false`, deadline'siz assignment → kirish darhol ochiladi |

**Nuqsonlar:**
- **YO'Q** — tasdiqlash oqimi (F-23)
- **YO'Q** — `course.allowSelfEnroll` bayrog'i: hozir **har qanday ko'rinadigan
  published kursga** yozilib bo'ladi, buni kurs darajasida o'chirib bo'lmaydi
- ✅ **To'g'ri** — `isCourseVisibleToActor` tekshiriladi
  (`courseAssignment.service.js:91`), ya'ni ko'rinmaydigan kursga yozilib bo'lmaydi

---

## FL-05 · Learning path'ga yozilish

**iSpring:** Path → auditoriya → tartib → muddat → bildirishnoma.
**Biz:** **Butun oqim yo'q.**

---

## FL-06 · Darsni tugatish (o'quvchi)

| | Qadamlar |
|---|---|
| **iSpring** | Kurs → dars → ko'rish → keyingisi ochiladi → kurs tugadi → sertifikat |
| **Biz** | Kurs → `POST /video-access/:id/token` → **(a)** kursga biriktirilganlik → **(b)** face gate → **(c)** sequential lock → HLS oqimi → `POST /analytics/video/events` (batch) → `watchedSegments` merge → **90%** da `completedAt` → keyingisi ochiladi |

**Nuqsonlar:**
- ✅ **iSpring'dan kuchli** — uchta server tekshiruvi token berishdan oldin
  (`videoAccess.service.js`), diqqatsizlik oralig'i progressdan ayiriladi
  (`videoEventProcessor.js:172-174`)
- **NOTO'G'RI** — kurs tugashi faqat videolarni sanaydi (F-01)
- **YO'Q** — tugatishda bildirishnoma va sertifikat
- **Diqqat:** tugatish chegarasi **90%** (`COMPLETION_THRESHOLD = 0.9`) — bu
  hujjatlarda yozilmagan, lekin biznes qarori sifatida tasdiqlanishi kerak

---

## FL-07 · Test topshirish

| | Qadamlar |
|---|---|
| **iSpring** | Test → boshlash → savollar (pool'dan, aralashtirilgan) → javob → yuborish → natija + izoh → qolgan urinishlar |
| **Biz (video quiz)** | Video tugallanadi → `GET /videos/:id/quiz` (javob kalitisiz) → javob → `POST /submit` → foiz + `passed` + `correctOptionIndexByQuestion` |
| **Biz (assessment)** | `GET /assessments/:id` (faqat brifing) → `POST /start` → **face gate** → sessiya + savollar → `POST /focus-loss` (kerak bo'lsa) → `POST /submit` |

**Nuqsonlar:**
- ✅ **iSpring'dan kuchli (assessment)** — savollar sessiyasiz berilmaydi,
  reload vaqt qo'shmaydi, tashlab ketish nol ball bilan yoziladi, face gate
- **YO'Q** — urinishlar chegarasi (F-02), pool, aralashtirish, savol og'irligi,
  qisman ball, izoh
- **NOTO'G'RI** — video quiz `submit` javobida `correctOptionIndexByQuestion`
  **har doim** qaytariladi (`quiz.service.js:133`), ya'ni "natijani ko'rsatma"
  rejimi yo'q; cheksiz urinish bilan birga bu javob kalitini beradi
- **NOTO'G'RI** — video quiz'da vaqt chegarasi va focus-loss nazorati yo'q
  (assessment'da bor) — bir xil test ikki xil qattiqlikda

---

## FL-08 · Testni qayta topshirish

**iSpring:** Chegara tekshiriladi → yangi urinish → ball siyosati (oxirgi/eng yaxshi).
**Biz:** Chegara **yo'q**, ball siyosati **yo'q** — har urinish yangi
`QuizAttempt`, hisobot ularning hammasini ko'radi. → **NOTO'G'RI** (F-02).

---

## FL-09 · Sertifikat berish · FL-10 · Sertifikat tekshirish

**Biz:** **Ikkala oqim ham yo'q** (F-04).

---

## FL-11 · Topshiriq topshirish · FL-12 · Topshiriqni baholash

**iSpring:** Topshiriq → fayl/matn → yuborish → tekshiruvchi navbati → rubrika
bo'yicha ball → izoh → qaytarish yoki tasdiqlash.
**Biz:** `Task` bor, lekin **topshirish, baholash, rubrika, qaytarish yo'q**.
Xodim faqat `PATCH /tasks/:id {status}` bilan "bajardim" deb belgilaydi —
ya'ni **hech qanday isbot talab qilinmaydi**. → butun oqim **YO'Q**.

---

## FL-13 · Live trening ro'yxati · FL-14 · Davomat

**iSpring:** Tadbir → ro'yxatdan o'tish (sig'im) → eslatma → davomat → hisobot.
**Biz:** Admin `POST /events` bilan tadbir yaratadi va `participants[]` ni
o'zi to'ldiradi. Xodim `EventsView` da faqat **ko'radi**.
- **YO'Q** — ro'yxatdan o'tish, sig'im, waitlist, davomat, eslatma
- **YO'Q** — tadbirni tahrirlash/o'chirish UI'si (API bor, UI yo'q — §1.14)
- **NOTO'G'RI** — `event.service.js` da bironta `notify()` yo'q: tadbir
  yaratilsa ham, o'zgarsa ham, bekor qilinsa ham hech kim xabar olmaydi

---

## FL-15 · Onboarding · FL-16 · Compliance o'qish

**Biz:** **Ikkala oqim ham yo'q.** Compliance'da `mandatory` bayrog'i va
`deadline` bor, lekin takroriylik, sertifikat muddati va compliance
dashboard'i yo'q.

---

## FL-17 · Knowledge base qidiruvi

**iSpring:** Qidiruv → facet → maqola → o'qish → foydali/foydasiz.
**Biz:** **KB yo'q.** Eng yaqin narsa — `News` va uning qidiruvi
`news.repository.js:42` `filter.title = new RegExp(...)` — faqat sarlavha,
faqat regex.

---

## FL-18…FL-20 · 360° review · OJT · Development plan

**Biz:** **Uchala oqim ham yo'q.** Kirish sharti — F-06 (`managerId`).

---

## FL-21 · Rahbar review

**iSpring:** Rahbar → jamoa → xodim → progress → izoh/tasdiq.
**Biz:** Rahbar `/bos` ga **umuman kira olmaydi** (`router/index.js`
`meta:{admin:true}` → `isSuperAdmin`). Ya'ni MANAGER uchun UI **yo'q**,
lekin API ochiq. → **NOTO'G'RI + HIMOYASIZ** (§1.4, §1.5).

---

## FL-22 · Foydalanuvchi yaratish

| | Qadamlar |
|---|---|
| **iSpring** | Yangi → maydonlar (custom field'lar bilan) → rol → guruh → kurs → taklif e-maili |
| **Biz** | `EmployeeFormFields.vue` → `POST /users` (20 maydon) → rol → `courseIds[]` avtomatik biriktiriladi → **parol ekranda ko'rsatiladi** (`GeneratedPasswordField.vue`) |

**Nuqsonlar:**
- **YO'Q** — taklif e-maili; parol og'zaki/qo'lda yetkaziladi
- **YO'Q** — custom field'lar
- ✅ **To'g'ri** — `terminationDate` bo'lsa hisob avtomatik nofaol
  (`user.service.js:296-298`); kurs biriktirish xatosi hisob yaratilishini
  bekor qilmaydi (best-effort, `:313-322`)

---

## FL-23 · Bulk import

**Biz:** **Yo'q** (F-12). 500 xodim bittalab kiritiladi.

---

## FL-24 · Rol biriktirish · FL-25 · Ruxsat biriktirish

**iSpring:** Rol → ruxsat matritsasi → saqlash.
**Biz:** Rol biriktirish ishlaydi (`PATCH /users/:id {roleName}`), lekin
**rolning o'zini tahrirlash mumkin emas** — `PATCH /roles/:id` yo'q (§1.14).
Ruxsatni o'zgartirish uchun rolni o'chirib qayta yaratish kerak, bu esa
o'sha roldagi hamma foydalanuvchini buzadi. → **YO'Q + NOTO'G'RI**

---

## FL-26 · SSO login

**Biz:** **Yo'q.** JWT ichkarida ishlatiladi, SSO sifatida emas.

---

## FL-27 · Parolni tiklash

| | Qadamlar |
|---|---|
| **iSpring** | E-mail kiritish → xat → havola → yangi parol |
| **Biz** | `POST /auth/password-reset/request` → token yaratiladi → **`logger` ga yoziladi** → foydalanuvchi hech narsa olmaydi |

**Nuqson:** **NOTO'G'RI** — oqim texnik jihatdan to'liq
(`user.passwordResetTokenHash`, `passwordResetExpiresAt` mavjud,
`POST /password-reset/confirm` ishlaydi), lekin **yetkazish qadami yo'q**.
`auth.service.js:212` izohi buni tan oladi. Ya'ni bu 90% qurilgan feature
oxirgi 10% sababli **umuman ishlamaydi**.
✅ **To'g'ri** — `:204` izohi: javob foydalanuvchi mavjudligini oshkor
qilmaydi (enumeration'ga qarshi).

---

## FL-28 · Bildirishnoma yetkazish

**iSpring:** Trigger → shablon (til) → foydalanuvchi sozlamasi → kanal(lar) →
yetkazish → retry → jurnal.
**Biz:** Trigger → DB yozuvi → socket. Xolos. → **YO'Q** (F-05).

---

## FL-29 · Hisobot yaratish · FL-30 · Hisobot eksporti

| | Qadamlar |
|---|---|
| **iSpring** | Hisobot → filtr → ko'rish → drill-down → eksport / jadval bo'yicha yuborish |
| **Biz** | `ReportsView` → tur + filtr → `GET /reports/:type/export?format=` → **darhol yuklab olish** |

**Nuqsonlar:**
- **YO'Q** — brauzerda **ko'rish** qadami: hisobot faqat fayl sifatida
  chiqadi, ekranda jadval yo'q
- **YO'Q** — rejalashtirilgan yuborish
- **NOTO'G'RI** — `MAX_ROWS = 5000` **jimgina** kesadi
  (`reportData.service.js:16`): 6000 xodimli eksport 5000 qatorli fayl beradi
  va foydalanuvchi buni bilmaydi
- **HIMOYASIZ** — scope yo'q (F-08), audit yo'q

---

## FL-31 · AI kurs generatsiyasi · FL-32 · Kontent tarjimasi

**Biz:** **Ikkala oqim ham yo'q.** AI chat bor, lekin u kontent yaratmaydi.

---

## 5.1 Oqimlar jamlanmasi

| Kategoriya | Soni | Oqimlar |
|---|---|---|
| ✅ To'liq va yetarli | 4 | FL-01(qisman), FL-03, FL-06, FL-22 |
| ◐ Bor, lekin nuqsonli | 9 | FL-02, FL-04, FL-07, FL-08, FL-21, FL-24, FL-27, FL-29, FL-30 |
| ✖ Butunlay yo'q | 19 | FL-05, FL-09…FL-20, FL-23, FL-25(qisman), FL-26, FL-28, FL-31, FL-32 |

**Eng og'ir uchta oqim nuqsoni** (kod bor, lekin oqim ishlamaydi):
1. **FL-27 Parolni tiklash** — 90% qurilgan, yetkazish yo'q → foydalanuvchi qulflanadi
2. **FL-14 Tadbir** — model bor, bildirishnoma yo'q → hech kim kelmaydi
3. **FL-21 Rahbar review** — API bor, UI yo'q, scope teshik → rahbar ishlatolmaydi

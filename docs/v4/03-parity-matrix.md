# 4. TO'LIQ 1×1 PARITY MATRITSASI

**Status:** `FULL` · `PARTIAL` · `NONE` · `OURS+` (biz ustunmiz) · `iSP+` (iSpring ustun) · `N/A` · `VERIFY`
**Score:** 100 = full parity · 75 = kichik farq · 50 = partial · 25 = katta gap · 0 = yo'q.
`OURS+` ham 100 oladi (parity shkalasi 100 dan oshmaydi), ustunlik alohida §18 da.
**iSp** ustuni: `✓` = rasmiy manbada tasdiqlangan · `?` = VERIFY · `—` = iSpring'da yo'q/tasdiqlanmagan.
**Evidence:** bizning kodimizdagi manba (fayl:satr).

---

## D01 · COURSE MANAGEMENT

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap / kerakli o'zgarish |
|---|:--:|---|:--:|:--:|---|---|
| Kurs yaratish/tahrirlash | ✓ | Bor | FULL | 100 | `course.service.js:281-322` | — |
| Draft / Published / Archived | ✓ | Bor | FULL | 100 | `course.model.js:11` | — |
| Kursni nusxalash | ✓ | Yo'q | NONE | 0 | — | `POST /courses/:id/duplicate` deep copy |
| Kurs kategoriyasi | ✓ | Yo'q | NONE | 0 | `course.model.js` — maydon yo'q | `CourseCategory` daraxti |
| Teglar | ✓ | Yo'q | NONE | 0 | — | `course.tags[]` + indeks |
| Muallif | ✓ | Faqat `createdBy` | PARTIAL | 25 | `course.model.js:24` | `authorIds[]` + AUTHOR roli |
| Prerequisites | ✓ | Yo'q | NONE | 0 | — | `prerequisiteCourseIds[]` + gate |
| Tugatish qoidasi (sozlanadigan) | ✓ | Qat'iy, ikki xil hisoblanadi | PARTIAL | 25 | `course.service.js:116` ↔ `videoEventProcessor.js:245` | Yagona `completionRule` |
| Minimal tugatish vaqti | ✓ | Yo'q | NONE | 0 | — | `course.minMinutes` |
| Navigatsiya: qat'iy/erkin | ✓ | Faqat qat'iy, sozlanmaydi | PARTIAL | 50 | `courseSequence.js` | `navigationMode` toggle |
| Gated content (test o'tilmaguncha qulf) | ✓ | Video ketma-ketligi bor, test gate'i yo'q | PARTIAL | 50 | `courseSequence.js:52-66` | `blockedByQuizId` |
| Kurs versiyalash | ? | Yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| Kurs amal muddati | ✓ | Faqat assignment darajasida | PARTIAL | 75 | `courseAssignment.model.js:19` | `course.validityDays` |
| Soft delete + trash + tiklash | — | Bor + avtomatik tozalash | OURS+ | 100 | `trash.service.js`, `course.model.js:31` | — |
| Kurs ko'rinishi (targeting) | ✓ | rol AND filial AND bo'lim | OURS+ | 100 | `courseVisibility.js:20-38` | — |
| Kurs qidiruvi | ✓ | Faqat sarlavha, regex, escape'siz | PARTIAL | 25 | `course.repository.js:91` | `$text` + ReDoS tuzatish |
| Kurs cover/banner | ✓ | Bor | FULL | 100 | `course.model.js:8-9` | — |
| **D01 jami: 17 capability** | | | **FULL 3 · OURS+ 2 · PARTIAL 6 · NONE 5 · VERIFY 1** | **44** | | |

## D02 · COURSE CATALOG

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Katalog sahifasi | ✓ | Bor | FULL | 100 | `CoursesView.vue` | — |
| Filtr: status/filial | ✓ | Bor | FULL | 100 | `course.repository.js:89-112` | — |
| Filtr: kategoriya/teg/daraja | ✓ | Yo'q | NONE | 0 | — | D01 metadatasiga bog'liq |
| Self-enroll | ✓ | Bor | FULL | 100 | `courseAssignment.service.js:88-124` | — |
| Self-enroll'ni kurs darajasida o'chirish | ? | Yo'q | VERIFY | 0 | — | `allowSelfEnroll` |
| Reyting va sharh | — | Bor (1–5 + izoh) | OURS+ | 100 | `courseReview.model.js` | — |
| Tayyor kurslar kutubxonasi | ✓ | Yo'q | N/A | — | — | §24 — biznes modeliga tegishli emas |
| Tashqi kutubxona integratsiyasi | ✓ | Yo'q | N/A | — | — | §24 |
| Nested papkalar | ✓ | Faqat Course→Topic (2 daraja) | PARTIAL | 50 | `topic.model.js` | Kategoriya daraxti buni qoplaydi |
| Tavsiya etilgan kurslar | — | Yo'q | NONE | 0 | — | `recommendation.service` |
| **D02 jami: 8 capability (+2 N/A)** | | | **FULL 3 · OURS+ 1 · PARTIAL 1 · NONE 2 · VERIFY 1 · N/A 2** | **56** | | |

## D03 · COURSE STRUCTURE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Bob / bo'lim | ✓ | `Topic` | FULL | 100 | `topic.model.js` | — |
| Element tartibi | ✓ | `order` maydoni | FULL | 100 | `video/material/assessment.model.js` | — |
| Aralash kontent bitta bobda | ✓ | Video + material + test | FULL | 100 | `topicContent.service.js:10-23` | — |
| Majburiy / ixtiyoriy element | ✓ | Faqat videoda (`required`) | PARTIAL | 50 | `video.model.js:26` | Material va testga ham |
| Drag-drop tartiblash | ✓ | Yo'q — raqam qo'lda | NONE | 0 | — | Batch reorder endpoint |
| **D03 jami: 5 capability** | | | **FULL 3 · PARTIAL 1 · NONE 1** | **70** | | |

## D04–D09 · CONTENT MANAGEMENT / TEXT / VIDEO / AUDIO / DOCUMENTS / PRESENTATIONS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Video yuklash (resumable) | ✓ | tus | FULL | 100 | `video/tusServer.js` | — |
| Video transcode + adaptiv oqim | ✓ | ffmpeg → HLS, sifat darajalari | FULL | 100 | `video/processVideo.js` | — |
| Video imzolangan token + segment auth | ? | Bor | OURS+ | 100 | `videoStream.service.js`, `videoPlaybackToken.middleware.js` | — |
| Watermark | ? | Bor (ism + JSHSHIR) | OURS+ | 100 | `video/AttentionOverlay.vue`, player | — |
| Video kapitel | ? | Yo'q | VERIFY | 0 | — | — |
| Subtitr / caption | ✓ (Suite) | Yo'q | NONE | 0 | — | WebVTT + `<track>` |
| Matn darsi (Page) | ✓ | **Yo'q** | NONE | 0 | — | `Lesson` + blok modeli |
| Blok shablonlari | ✓ | Yo'q | NONE | 0 | — | `BlockTemplate` |
| Flashcard / jadval / labeled graphics | ✓ | Yo'q | NONE | 0 | — | Blok turlari |
| Text-to-speech | ✓ | Yo'q | NONE | 0 | — | Tashqi TTS |
| Audio dars | ✓ | `Material` MULTIMEDIA | PARTIAL | 50 | `materialUpload.service.js:24` | Progress sahifa-asosli (noto'g'ri) |
| PDF ko'rish | ✓ | pdf.js, sahifa-ba-sahifa | FULL | 100 | `MaterialViewer.vue:175-225` | — |
| DOCX ko'rish | ✓ | mammoth | FULL | 100 | `MaterialViewer.vue:427` | — |
| XLSX ko'rish | ✓ | `renderXlsx` | FULL | 100 | `MaterialViewer.vue:429` | — |
| PPTX ko'rish | ✓ | pptx-preview + repair | FULL | 100 | `MaterialViewer.vue:233-247` | — |
| Hujjat o'qish progressi | ✓ | **Ko'rilgan sahifalar to'plami** | OURS+ | 100 | `materialProgress.model.js` | — |
| Yuklab olish (presigned) | ✓ | Bor, lekin **prod'da buzilgan** | PARTIAL | 25 | `materialAccess.service.js:52-67` | `S3_PUBLIC_ENDPOINT` |
| Yuklab olishni taqiqlash | ✓ (file-level access) | Yo'q; `openStream` tayyor | PARTIAL | 50 | `materialAccess.service.js:74-84` | `allowDownload` bayrog'i |
| Tashqi web havola (kontent turi) | ✓ | Yo'q | NONE | 0 | — | `ContentItem type=LINK` |
| Embed (iframe) | ✓ | Yo'q | NONE | 0 | — | allowlist + sandbox |
| Cheksiz fayl hosting | ✓ | S3/MinIO | FULL | 100 | `S3StorageProvider.js` | — |
| Fayl turi magic-byte tekshiruvi | ? | Bor | OURS+ | 100 | `materialUpload.service.js` (`file-type`) | — |
| **D04–D09 jami: 22 capability** | | | **FULL 7 · OURS+ 4 · PARTIAL 3 · NONE 7 · VERIFY 1** | **56** | | |

## D10–D12 · INTERACTIVE CONTENT / COURSE BUILDER / AUTHORING

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Brauzerda kurs builder | ✓ | 4 qadamli sehrgar (kontentsiz) | PARTIAL | 25 | `CourseBuilderView.vue:22-27` | Kontent qadami |
| Blok editori | ✓ | Yo'q | NONE | 0 | — | `Lesson.blocks[]` |
| Drag-drop | ✓ | Yo'q | NONE | 0 | — | `SortableList` |
| Autosave | ? | Yo'q | VERIFY | 0 | — | — |
| Preview (o'quvchi ko'zi bilan) | ✓ | Admin DRAFT ko'radi | PARTIAL | 50 | `course.service.js:38` | `?preview=learner` |
| Brend rang va shrift kursda | ✓ | Yo'q | NONE | 0 | — | D77 ga bog'liq |
| Sahifa ichida quiz | ✓ | Yo'q (Lesson yo'q) | NONE | 0 | — | — |
| PowerPoint import | ✓ | PPTX ko'rsatiladi, **darsga aylanmaydi** | PARTIAL | 50 | `MaterialViewer.vue:233` | Slayd → blok |
| Ekran yozib olish | ? | Yo'q | VERIFY | 0 | — | — |
| Branching scenario | ? | Yo'q | VERIFY | 0 | — | Suite mahsuloti |
| Interaktiv timeline/tab/FAQ | ✓ | Yo'q | NONE | 0 | — | Blok turlari |
| **D10–D12 jami: 11 capability** | | | **PARTIAL 3 · NONE 5 · VERIFY 3** | **11** | | |

## D13–D17 · AI

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| AI o'quv assistenti (chat) | ✓ | Bor, kirish huquqi bo'yicha scope'langan | FULL | 100 | `aiChat.service.js:26-56` | — |
| AI kurs generatori (fayldan) | ✓ | Yo'q | NONE | 0 | — | `aiCourse.service` + job |
| AI kurs generatori (mavzudan) | ✓ | Yo'q | NONE | 0 | — | — |
| AI quiz savol generatsiyasi | ✓ | Yo'q | NONE | 0 | — | `aiQuiz.service` |
| AI rasm generatsiyasi | ✓ | Yo'q | NONE | 0 | — | Tashqi provider |
| AI tarjima (kontent) | ✓ | Yo'q | NONE | 0 | — | `ContentTranslation` |
| AI matn yozish/qayta yozish | ✓ | Yo'q (chat bor, editorga ulanmagan) | PARTIAL | 25 | `aiChat.service.js` | Editor ichida |
| AI o'zbek tili | ✓ (2026-08) | Model qo'llab-quvvatlaydi | FULL | 100 | `anthropicClient.js:15` | — |
| Inson tasdig'isiz publish bo'lmasligi | ✓ | Arxitekturada: har doim DRAFT | OURS+ | 100 | `course.model.js:11` | — |
| AI token/xarajat nazorati | ? | Yo'q | VERIFY | 0 | — | `monthlyTokenBudget` |
| AI audit jurnali | ? | Yo'q | VERIFY | 0 | — | `AI_GENERATION_REQUESTED` |
| **D13–D17 jami: 11 capability** | | | **FULL 2 · OURS+ 1 · PARTIAL 1 · NONE 5 · VERIFY 2** | **30** | | |

## D18–D25 · ASSESSMENT

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Multiple choice (1 javob) | ? | Bor | FULL | 100 | `quiz.model.js:3-21` | — |
| Multiple response | ? | **Ataylab rad etiladi** | NONE | 0 | `quiz.service.js:56-60` | Yagona `Question` modeli |
| True/False | ? | MCQ bilan taqlid | PARTIAL | 50 | — | `type=TRUE_FALSE` |
| Short answer | ? | Yo'q | NONE | 0 | — | Normalizatsiya + alternativalar |
| Essay + qo'lda baholash | ? | Yo'q | VERIFY | 0 | — | iSpring'da "free-form assignment" bor (S1) |
| Numeric | ? | Yo'q | NONE | 0 | — | Tolerans bilan |
| Matching | ? | Yo'q | NONE | 0 | — | — |
| Sequence | ? | Yo'q | NONE | 0 | — | — |
| **Drag & Drop** | ✓ (S2 2024-12) | Yo'q | NONE | 0 | — | — |
| Hotspot | ? | Yo'q | NONE | 0 | — | — |
| Fill in the blanks | ? | Yo'q | NONE | 0 | — | — |
| **Likert** | ✓ (S2 2023-08) | Yo'q | NONE | 0 | — | 360° uchun ham kerak |
| **Savol banki** | ✓ | Yo'q — savollar test ichiga embed | NONE | 0 | `quiz.model.js`, `assessment.model.js` (dublikat sxema) | `Question` + `QuestionBank` |
| **Random pool** | ✓ | Yo'q | NONE | 0 | — | `pools[]{bankId,count}` |
| **Savollarni aralashtirish** | ✓ | Yo'q | NONE | 0 | — | Seed'li shuffle |
| **Javoblarni aralashtirish** | ✓ | Yo'q | NONE | 0 | — | — |
| **Urinishlar chegarasi** | ✓ | **Yo'q — cheksiz** | NONE | 0 | `quiz.service.js:88-133` | `maxAttempts` + atomik guard |
| O'tish bali | ✓ | Bor | FULL | 100 | `quiz.model.js:29` | — |
| Vaqt chegarasi | ✓ | Assessment'da 15 daq **hardcoded**, video quiz'da yo'q | PARTIAL | 25 | `assessment.service.js:19` | Maydonga ko'chirish + quiz'ga yoyish |
| Savol og'irligi | ? | Har savol teng | VERIFY | 0 | — | `question.points` |
| Qisman ball | ? | Yo'q | VERIFY | 0 | — | Multi-response uchun majburiy |
| Izoh (explanation) | ? | Yo'q | VERIFY | 0 | — | — |
| Darhol feedback (knowledge check) | ✓ | Yo'q | NONE | 0 | — | `gradingMode=PRACTICE` |
| Natijani ko'rsatish rejimi | ? | Javob kaliti **har doim** qaytadi | PARTIAL | 25 | `quiz.service.js:133` | `revealMode` |
| Urinishlar tarixi | ✓ | Bor | FULL | 100 | `quizAttempt.model.js` | — |
| Batafsil javob tahlili | ✓ | Bor (admin drill-down) | FULL | 100 | `quiz.service.js:137-174` | — |
| O'rtacha natija | ✓ | Attemptlar bor, agregatsiya yo'q | PARTIAL | 50 | — | `scorePolicy` |
| Savol qiyinligi statistikasi | ✓ | Yo'q | NONE | 0 | — | `questionStats` aggregation |
| Mustaqil (kurssiz) quiz | ✓ | `Assessment` topic ostida | PARTIAL | 50 | `assessment.model.js:32` | `scope=STANDALONE` |
| Javob kalitini yashirish | ✓ | Bor va qat'iy | FULL | 100 | `quiz.service.js:22-36` | — |
| **Server taymer + focus-loss** | — | Bor | OURS+ | 100 | `assessmentSession.model.js`, `assessment.service.js:265-290` | — |
| **Savollar sessiyagacha berilmaydi** | — | Bor | OURS+ | 100 | `assessment.service.js:194-212` | — |
| **Tashlab ketish nol ball bilan yoziladi** | — | Bor | OURS+ | 100 | `assessment.service.js:243-248` | — |
| **Test oldidan yuzni tekshirish** | — | Bor | OURS+ | 100 | `assessment.service.js:222` | — |
| Savol import/eksport | ✓ | Yo'q | NONE | 0 | — | XLSX/GIFT |
| **D18–D25 jami: 35 capability** | | | **FULL 5 · OURS+ 4 · PARTIAL 5 · NONE 17 · VERIFY 4** | **31** | | |

## D26–D29 · LEARNING PATHS / PROGRAMS / ENROLLMENT

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Learning track / path | ✓ | **Yo'q** | NONE | 0 | — | `LearningPath` + `PathEnrollment` |
| Path ichida boblar | ✓ | Yo'q | NONE | 0 | — | `path.sections[]` |
| Qat'iy / erkin tugatish tartibi | ✓ | Yo'q (kursda bor) | NONE | 0 | `courseSequence.js` naqshi qayta ishlatiladi | `pathSequence.js` |
| Path progressi | ✓ | Yo'q | NONE | 0 | — | Majburiy element bo'yicha |
| Path muddati | ✓ | Yo'q | NONE | 0 | — | `reminderJob` ga ulash |
| Path katalogda | ✓ (S2 2023-12) | Yo'q | NONE | 0 | — | — |
| Qo'lda biriktirish | ✓ | Bor | FULL | 100 | `courseAssignment.service.js:46-86` | — |
| Guruhga biriktirish | ✓ | Bor | FULL | 100 | `group.service.js` | — |
| Publish'da avto-biriktirish | ✓ | Bor (targeting bo'lsa) | FULL | 100 | `course.service.js:170-200` | — |
| **Smart enrollment filtrlari** (jamoa, lavozim, mamlakat, custom) | ✓ | Yo'q — faqat publish paytida | PARTIAL | 25 | — | `EnrollmentRule` dvigateli |
| Kriteriya bo'yicha doimiy avto-biriktirish | ✓ | Yo'q — bir martalik | PARTIAL | 25 | `course.service.js:317` | User o'zgarganda qayta baholash |
| Deadline + muddat | ✓ | Bor | FULL | 100 | `courseAssignment.model.js:17-19` | — |
| Boshlash sanasi (`startAt`) | ? | Bor | OURS+ | 100 | `courseAssignmentAccess.js:11` | — |
| Enrollment tasdiqlash oqimi | ? | Yo'q | VERIFY | 0 | — | — |
| **D26–D29 jami: 14 capability** | | | **FULL 4 · OURS+ 1 · PARTIAL 2 · NONE 6 · VERIFY 1** | **39** | | |

## D30–D36 · USERS / GROUPS / ORGANIZATION / DEPARTMENTS / MANAGERS / ROLES / PERMISSIONS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Foydalanuvchi CRUD | ✓ | Bor (39 maydon) | FULL | 100 | `user.model.js`, `user.service.js:270-330` | — |
| **XLSX bulk import** | ✓ (150k gacha) | **Yo'q** | NONE | 0 | — | dry-run + commit + xato hisoboti |
| Bulk update | ✓ | Faqat message + deactivate | PARTIAL | 50 | `user.service.js:99-152` | Maydonlarni ommaviy o'zgartirish |
| Faol / nofaol | ✓ | Bor + `terminationDate` avto-deaktivatsiya | OURS+ | 100 | `user.service.js:296-298` | — |
| **Custom profil maydonlari** | ✓ | Yo'q | NONE | 0 | — | `CustomFieldDef` |
| Profilda sana maydoni (filtr uchun) | ✓ | `birthDate`, `hireDate` bor, filtrda yo'q | PARTIAL | 50 | `user.model.js:50-51` | Filtrga qo'shish |
| Guruhlar | ✓ | Bor | FULL | 100 | `group.model.js` | — |
| Dinamik guruh (qoidali) | ✓ (smart filters) | Yo'q — faqat statik | PARTIAL | 25 | `group.model.js:20` | `type` + `rule{}` |
| Bo'lim | ✓ | Nom bo'yicha + `OrgList` | FULL | 100 | `orgList.model.js` | — |
| Filial | ✓ (organization) | `Branch` kolleksiyasi | FULL | 100 | `branch.model.js` | — |
| Bo'linma (subdivision) | ? | Bor | OURS+ | 100 | `user.model.js:44` | — |
| **Organization = mustaqil administratsiya** | ✓ | Yo'q — tenant izolyatsiyasi yo'q | NONE | 0 | — | §24 da baholanadi |
| **Rahbar (manager) maydoni** | ✓ | **Yo'q** | NONE | 0 | `user.model.js` — `managerId` yo'q | `managerId` + `$graphLookup` |
| **Interaktiv org chart** | ✓ | Yo'q | NONE | 0 | — | `OrgChartView` |
| People / hamkasb profillari | ✓ | Chat kontaktlari + `useOrgDirectory` | PARTIAL | 50 | `useOrgDirectory.js`, `chat/contacts` | Profil sahifasi |
| Rollar (tayyor) | ✓ (5+Supervisor) | 6 ta seed, amalda 4 daraja | PARTIAL | 75 | `roles.js`, `permissions.js:96-98` | AUTHOR/INSTRUCTOR/MENTOR |
| **Custom rollar** | ✓ | Bor — kod o'zgartirmasdan | FULL | 100 | `role.model.js`, `POST /roles` | — |
| **Rolni tahrirlash** | ✓ | **Yo'q** — `PATCH /roles/:id` yo'q | NONE | 0 | `roles.routes.js` | Endpoint + UI |
| Granular ruxsatlar | ✓ | 24 kalit | PARTIAL | 50 | `permissions.js` | +45 kalit |
| Ruxsat matritsasi UI | ✓ | Yo'q | NONE | 0 | — | `RolesPermissionsView` |
| Bo'lim scope'i (majburlanadi) | ✓ | 5 domenda bor | PARTIAL | 75 | `user.service.js:87`, `task.service.js:62`, `group.service.js:58`, `courseAssignment.service.js:28`, `points.service.js:79` | Hisobot+dashboard'ga yoyish |
| Scope custom rolga ham qo'llanishi | ✓ | **Yo'q** — `roleName === 'MANAGER'` | NONE | 0 | 14 joyda | `role.scope` |
| IDOR himoyasi | ? | Bor + testlar | OURS+ | 100 | `rbac.middleware.js`, `security.test.js` | — |
| Tug'ilgan kun tabrigi | ✓ | Yo'q | NONE | 0 | — | LOW |
| Yangi xodim kartasi | ✓ | Yo'q | NONE | 0 | — | LOW |
| **D30–D36 jami: 25 capability** | | | **FULL 5 · OURS+ 3 · PARTIAL 7 · NONE 10** | **47** | | |

## D37–D38 · ONBOARDING / ASSIGNMENTS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Development plan moduli | ✓ | **Yo'q** | NONE | 0 | — | `DevelopmentPlan` |
| Rolga qarab shaxsiy yo'l | ✓ | Yo'q | NONE | 0 | — | `PlanTemplate` |
| Yangi xodim checklisti | ✓ | Yo'q | NONE | 0 | — | `OnboardingProgram.steps[]` |
| Mentor biriktirish | ✓ | Yo'q (MENTOR roli ham yo'q) | NONE | 0 | — | — |
| Rahbar biriktirish | ✓ | Yo'q (`managerId` yo'q) | NONE | 0 | — | D34 ga bog'liq |
| Milestone kuzatuvi | ✓ | Yo'q | NONE | 0 | — | — |
| Development plan avto-biriktirish | ✓ (S2 2026-08) | Yo'q | NONE | 0 | — | — |
| CPE / ball asosidagi maqsad | ✓ | `PointsLedger` bor, maqsad yo'q | PARTIAL | 25 | `pointsLedger.model.js` | `plan.plannedPoints` |
| Topshiriq yaratish | ✓ | `Task` bor (boshqa domen) | PARTIAL | 25 | `task.model.js` | `Assignment` modeli |
| **Fayl/matn/havola topshirish** | ✓ | **Yo'q** — xodim faqat "bajardim" belgilaydi | NONE | 0 | `task.service.js` | `Submission` |
| Tekshirish va baholash | ✓ | Yo'q | NONE | 0 | — | `grading.service` + rubrika |
| Tugatish haqida belgilangan shaxsga xabar | ✓ | Yo'q | NONE | 0 | — | — |
| Task fan-out (USER/POSITION/ALL) | ? | Bor | OURS+ | 100 | `task.model.js:19-30` | — |
| **D37–D38 jami: 13 capability** | | | **OURS+ 1 · PARTIAL 2 · NONE 10** | **12** | | |

## D39–D42 · LIVE TRAINING / EVENTS / CALENDAR / ATTENDANCE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Tadbir yaratish | ✓ | Bor | FULL | 100 | `event.model.js`, `event.service.js` | — |
| Tadbir kalendari | ✓ | Bor | FULL | 100 | `GET /events/calendar`, `EventsView.vue` | — |
| Tadbirni tahrirlash/o'chirish | ✓ | API bor, **UI yo'q** | PARTIAL | 50 | `events.routes.js` ↔ `services/events.js` | UI |
| Ro'yxatdan o'tish | ✓ | Yo'q — admin `participants[]` to'ldiradi | NONE | 0 | `event.model.js:10` | `EventRegistration` |
| Sig'im (capacity) | ✓ | Yo'q | NONE | 0 | — | Atomik `$inc` |
| **Waitlist** | ✓ (S2 2024-07) | Yo'q | NONE | 0 | — | Avto-ko'tarish |
| Davomat belgilash | ✓ | Yo'q | NONE | 0 | — | `attendance` |
| Davomat hisoboti | ✓ | Yo'q | NONE | 0 | — | — |
| **Avtomatik taklif va eslatma** | ✓ | **Yo'q** — `event.service.js` da `notify()` umuman yo'q | NONE | 0 | `event.service.js` | 5 hodisa |
| Ko'p kunlik sessiya | ✓ | Yo'q (`startAt`/`endAt` bitta oraliq) | PARTIAL | 25 | `event.model.js:8-9` | — |
| Zoom / Meet / Teams | ✓ | Yo'q | NONE | 0 | — | `meeting{provider,url}` |
| Yagona kalendar (deadline + topshiriq) | ✓ | Faqat tadbirlar | PARTIAL | 25 | `event.controller.js` | `calendar.service` agregator |
| **D39–D42 jami: 12 capability** | | | **FULL 2 · PARTIAL 3 · NONE 7** | **25** | | |

## D43–D50 · GAMIFICATION / SOCIAL

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Ballar | ✓ | Bor, **idempotent** | OURS+ | 100 | `pointsLedger.model.js:20-21` | — |
| Badge | ✓ | 5 ta hardcoded, o'qishda hisoblanadi | PARTIAL | 25 | `badgeDefinitions.js` | `Badge` + criteria + `UserBadge` |
| Badge berilganda xabar | ✓ | **Yo'q** — xodim bilmaydi | NONE | 0 | — | Notify |
| Leaderboard | ✓ | Bor (global + guruh + bo'lim) | FULL | 100 | `points.service.js:64-128` | — |
| Darajalar (level) | ? | UI bor, backend qoidasi yo'q | PARTIAL | 25 | `LevelGauge.vue` | `levelFromPoints` |
| Gamification sozlamalari | ? | Ball har videoda qo'lda | PARTIAL | 25 | `video.model.js:31-32` | Global default |
| Newsfeed | ✓ | Bor + targeting | FULL | 100 | `news.model.js`, `NewsView.vue` | — |
| **Newsfeed izohlari** | ✓ | Yo'q | NONE | 0 | `news.model.js` | `NewsComment` |
| **Emoji reaksiya** | ✓ | Yo'q | NONE | 0 | — | `Reaction` |
| News o'qish kuzatuvi | ✓ | Bor (scroll milestone, vaqt) | OURS+ | 100 | `newsView.model.js` | — |
| Yangilik chiqqanda xabar | ? | **Yo'q** | VERIFY | 0 | `news.service.js` — `notify` yo'q | — |
| Messenger: DM + guruh | ✓ | Bor + ovozli xabar + fayl + realtime | OURS+ | 100 | `chat.service.js` (719 satr) | — |
| O'qilmagan chat uchun e-mail | ✓ | Yo'q (e-mail yo'q) | NONE | 0 | — | D64 ga bog'liq |
| Kurs muhokamasi / Q&A | ✓ | Bor | FULL | 100 | `courseQuestion.model.js`, `QAPanel.vue` | — |
| Mention (@) | ? | Yo'q | VERIFY | 0 | — | — |
| **D43–D50 jami: 15 capability** | | | **FULL 3 · OURS+ 3 · PARTIAL 3 · NONE 4 · VERIFY 2** | **45** | | |

## D51–D54 · CERTIFICATES / KNOWLEDGE BASE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Sertifikat shabloni (.docx) | ✓ | **Yo'q** | NONE | 0 | — | `CertificateTemplate` |
| Avtomatik berish | ✓ | Yo'q | NONE | 0 | — | `certificateQueue` |
| Sertifikat statuslari (Valid/Expiring/Expired/Renewed) | ✓ | Yo'q | NONE | 0 | — | `Certificate.status` |
| Muddat + sozlanadigan ogohlantirish (30 kun) | ✓ | Yo'q | NONE | 0 | — | `complianceQueue` |
| **Avtomatik re-enrollment** (yillik) | ✓ | Yo'q | NONE | 0 | — | `RecurringAssignment` |
| Qo'lda re-enrollment | ✓ | Qo'lda qayta biriktirish mumkin | PARTIAL | 50 | `courseAssignment.service.js:46` | — |
| Tashqi sertifikat + muddat | ✓ | Yo'q | NONE | 0 | — | `ExternalCertificate` |
| Sertifikatlar hisoboti | ✓ | Yo'q | NONE | 0 | — | Registr |
| Ochiq tekshiruv sahifasi / QR | ? | Yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| PDF render | ✓ (.docx) | Yo'q — lekin `pdfkit` + DejaVu mavjud | NONE | 0 | `reportExport.service.js` | Qayta ishlatiladi |
| Knowledge base (spaces + maqolalar) | ✓ | **Yo'q** (`News` — oqim, baza emas) | NONE | 0 | — | `KbArticle` + `KbCategory` |
| KB rolga asoslangan kirish | ✓ | Yo'q | NONE | 0 | `courseVisibility.js` qayta ishlatiladi | — |
| KB teglar (rangli) | ✓ | Yo'q | NONE | 0 | — | — |
| KB bookmarks | ✓ | Yo'q | NONE | 0 | — | — |
| KB feedback / reyting | ✓ | Yo'q | NONE | 0 | — | `CourseReview` naqshi |
| KB → kurs sinxronizatsiyasi | ✓ | Yo'q | NONE | 0 | — | — |
| KB PDF eksport | ✓ | Yo'q | NONE | 0 | — | — |
| KB full-text qidiruv | ✓ | Yo'q | NONE | 0 | — | `$text` |
| KB o'qish analitikasi | ✓ | Yo'q (`NewsView` naqshi mavjud) | NONE | 0 | `newsView.model.js` | Ko'chiriladi |
| **D51–D54 jami: 19 capability** | | | **PARTIAL 1 · NONE 17 · VERIFY 1** | **3** | | |

## D55–D59 · 360 / OJT / COMPETENCIES / SKILLS / DEVELOPMENT PLANS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| 360 so'rovnoma | ✓ | Yo'q | NONE | 0 | — | `ReviewCycle` |
| Ko'p tomonlama (self/manager/peer/subordinate) | ✓ | Yo'q | NONE | 0 | — | `managerId` dan avtomatik |
| Kompetensiya baholash | ✓ | Yo'q | NONE | 0 | — | `Competency` |
| Rolga moslik tahlili | ✓ | Yo'q | NONE | 0 | — | — |
| Bo'lim bo'yicha 360 hisoboti | ✓ | Yo'q | NONE | 0 | — | — |
| Before/after taqqoslash | ✓ | Yo'q | NONE | 0 | — | — |
| 360 bildirishnoma chastotasi | ✓ | Yo'q | NONE | 0 | — | — |
| OJT: checklist + baholash + statistika | ✓ | Yo'q | NONE | 0 | — | `OjtChecklist`, `OjtSession` |
| OJT sozlanadigan baholash shkalasi | ✓ | Yo'q | NONE | 0 | — | — |
| OJT bitta sessiyada bir necha kuzatuv | ✓ | Yo'q | NONE | 0 | — | — |
| Ko'nikma matritsasi | ? | Yo'q | VERIFY | 0 | — | — |
| **D55–D59 jami: 11 capability** | | | **NONE 10 · VERIFY 1** | **0** | | |

## D60–D62 · REPORTING / ANALYTICS / COMPLIANCE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Hisobotlar soni | ✓ **25+** | 5 | PARTIAL | 25 | `reportData.service.js:350-356` | +17 tur |
| CSV / XLSX / PDF eksport | ✓ | Bor | FULL | 100 | `reportExport.service.js` | — |
| Hisobot tili | ? | **3 tilli** | OURS+ | 100 | `reportI18n.js` | — |
| **Hisobotni rejalashtirish + e-mail** | ✓ | Yo'q | NONE | 0 | — | `ScheduledReport` |
| Hisobotni saqlash (saved report) | ✓ | Yo'q | NONE | 0 | — | — |
| Ekranda ko'rish (jadval/grafik) | ✓ | **Yo'q** — faqat fayl chiqadi | NONE | 0 | `report.controller.js:20-52` | — |
| Filtr: sana | ✓ | Bor | FULL | 100 | `reportData.service.js:47-53` | — |
| Filtr: bo'lim / guruh / filial | ✓ | **Yo'q** | NONE | 0 | — | — |
| Filtr: kurs / foydalanuvchi / rol | ✓ | Bor | FULL | 100 | `reportData.service.js:361-366` | — |
| **Hisobot scope'i (majburlanadi)** | ✓ | **Yo'q — MANAGER butun kompaniyani eksport qiladi** | NONE | 0 | `report.controller.js:20` — `actor` uzatilmaydi | 🔴 P0 |
| Async eksport (katta hajm) | ? | Yo'q — `MAX_ROWS 5000` jimgina kesadi | VERIFY | 0 | `reportData.service.js:16` | `exportJob` |
| Eksport auditi | ? | Yo'q | VERIFY | 0 | — | `REPORT_EXPORTED` |
| Supervisor dashboard | ✓ | **Yo'q** | NONE | 0 | — | `GET /dashboard/team` |
| Admin dashboard | ✓ | Bor + kesh + `stale` bayrog'i | FULL | 100 | `dashboardAggregation.js`, `dashboardCache.service.js` | — |
| Kontent samaradorligi | ✓ | Bor (`mostSkippedVideos`, `mostPausedVideos`) | OURS+ | 100 | `dashboardAggregation.js` | — |
| Drill-down | ✓ | Dashboard→kurs→xodim→video→savol | OURS+ | 100 | `employeeInsights.service.js` | — |
| BI ga eksport | ✓ | Yo'q (CSV bor) | PARTIAL | 50 | — | — |
| Compliance: majburiy kurs | ✓ | `mandatory` bayrog'i | FULL | 100 | `courseAssignment.model.js:8` | — |
| Compliance: takroriy o'qitish | ✓ | Yo'q | NONE | 0 | — | `RecurringAssignment` |
| Compliance dashboard | ✓ | Yo'q | NONE | 0 | — | Kurs × xodim matritsasi |
| **Audit pack** (transcript + timestamped log, bir klik eksport) | ✓ | Yo'q | NONE | 0 | — | — |
| **D60–D62 jami: 21 capability** | | | **FULL 5 · OURS+ 3 · PARTIAL 2 · NONE 9 · VERIFY 2** | **42** | | |

## D63–D65 · NOTIFICATIONS / EMAIL / PUSH

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| In-app bildirishnoma | ✓ | Bor | FULL | 100 | `notification.service.js:22-48` | — |
| Realtime (socket) push | ? | Bor | OURS+ | 100 | `realtime/socket.js`, `emitNotification` | — |
| **E-mail bildirishnoma** | ✓ | **Yo'q** — `nodemailer`/`smtp` kod bazasida yo'q | NONE | 0 | — | `mail.service` + `deliveryQueue` |
| Kurs tugatish e-maili | ✓ | Yo'q | NONE | 0 | — | — |
| Test o'tish e-maili | ✓ | Yo'q | NONE | 0 | — | — |
| O'qilmagan chat e-maili | ✓ | Yo'q | NONE | 0 | — | — |
| Tadbir taklifi va eslatmasi | ✓ | Yo'q | NONE | 0 | `event.service.js` | — |
| **Mobil push** | ✓ | Yo'q | NONE | 0 | — | Web Push (VAPID) |
| Bildirishnoma shabloni | ✓ | Yo'q — matn kodda **inglizcha** | NONE | 0 | `reminderJob.js:22` | `NotificationTemplate` |
| Bildirishnoma tili | ✓ | Yo'q (UI 3 tilli, xabarlar inglizcha) | NONE | 0 | — | `user.locale` |
| Foydalanuvchi sozlamasi | ✓ (360 chastotasi) | Yo'q | NONE | 0 | — | `notificationPrefs` |
| Retry / xato boshqaruvi | ? | Yo'q (in-app'da kerak emas) | VERIFY | 0 | — | BullMQ 5× |
| Deadline eslatmasi | ✓ | Bor (24 soat, bir marta) | PARTIAL | 50 | `reminderJob.js:9-31` | Bosqichli 7/3/1 |
| Kechikish eslatmasi | ✓ | Task uchun bor, kurs uchun yo'q | PARTIAL | 50 | `reminderJob.js:71-85` | — |
| Hodisa qamrovi | ✓ (40+ taxminan) | **9 tur** | PARTIAL | 25 | `grep "type: '"` | 52 turga |
| **D63–D65 jami: 15 capability** | | | **FULL 1 · OURS+ 1 · PARTIAL 3 · NONE 9 · VERIFY 1** | **22** | | |

## D66–D67 · MOBILE / OFFLINE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Responsive web | ✓ | Bor | FULL | 100 | `BottomNav.vue`, Tailwind | — |
| **Native ilova (iOS/Android)** | ✓ | Yo'q | N/A | — | — | §24 — PWA tanlandi |
| PWA (o'rnatiladigan) | ? | Yo'q — manifest/SW yo'q | NONE | 0 | — | `vite-plugin-pwa` |
| **Oflayn o'qish** | ✓ | Yo'q | NONE | 0 | — | Workbox + IndexedDB |
| **Oflayn progress sinxronizatsiyasi** | ✓ | Yo'q | NONE | 0 | `watchedSegments` merge buni tabiiy qabul qiladi | `clientEventId` |
| Mobil video player | ✓ | Bor | FULL | 100 | `hls.js`, `VideoPlayer.vue` | — |
| Mobil hujjat ko'rish | ✓ | Bor | FULL | 100 | `MaterialViewer.vue` | — |
| Mobil test | ✓ | Bor (onlayn) | FULL | 100 | `AssessmentView.vue` | — |
| Mobil chat + ovozli xabar | ✓ | Bor | OURS+ | 100 | `VoiceRecorder.vue` | — |
| Mobil push | ✓ | Yo'q | NONE | 0 | — | D65 |
| White-label mobil ilova | ✓ | Yo'q | N/A | — | — | §24 |
| **D66–D67 jami: 9 capability (+2 N/A)** | | | **FULL 4 · OURS+ 1 · NONE 4 · N/A 2** | **56** | | |

## D68–D69 · SEARCH / MULTILINGUAL

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Global qidiruv | ✓ | **Yo'q** | NONE | 0 | — | `search.service` fan-out |
| Kurs qidiruvi | ✓ | Faqat sarlavha, regex | PARTIAL | 25 | `course.repository.js:91` | `$text` |
| Foydalanuvchi qidiruvi | ✓ | Bor, escape'langan | FULL | 100 | `user.repository.js:97-105` | — |
| Chat qidiruvi | ? | Bor | OURS+ | 100 | `chatMessage.repository.js:44` | — |
| KB qidiruvi | ✓ | Yo'q | NONE | 0 | — | D53 |
| Katalog filtri (facet) | ✓ | Qisman | PARTIAL | 25 | — | — |
| Autocomplete | ? | Chat kontaktlarida | PARTIAL | 25 | — | — |
| UI lokalizatsiyasi | ✓ **30 til** | **3 til** (uz/ru/en) | PARTIAL | 50 | `i18n/locales/*.json` (1393 kalit) | — |
| Kontent ko'p tilli | ✓ | **Yo'q** — kontent bir tilli | NONE | 0 | — | `ContentTranslation` |
| Bildirishnoma ko'p tilli | ✓ | Yo'q — inglizcha hardcoded | NONE | 0 | `reminderJob.js:22` | — |
| Sertifikat ko'p tilli | ✓ | Yo'q (sertifikat yo'q) | NONE | 0 | — | — |
| Hisobot ko'p tilli | ? | **3 tilli** | OURS+ | 100 | `reportI18n.js` | — |
| Tashkilot bo'yicha til | ✓ | Yo'q | NONE | 0 | — | — |
| **D68–D69 jami: 13 capability** | | | **FULL 1 · OURS+ 2 · PARTIAL 4 · NONE 6** | **33** | | |

## D70–D73 · INTEGRATIONS / API / WEBHOOKS / SSO

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| REST API (ichki) | ✓ | Bor, layered, `ApiError` envelope | FULL | 100 | `routes/v1/index.js` (34 router) | — |
| **Tashqi REST API** | ✓ | Yo'q | NONE | 0 | — | `/api/public/v1` + `ApiKey` |
| SOAP API | ✓ | Yo'q | N/A | — | — | §24 — eskirgan protokol |
| API kalitlari + scope | ✓ (implicit) | Yo'q | NONE | 0 | — | `ApiKey` modeli |
| Rate limiting | ? | **11 alohida limiter** | OURS+ | 100 | `middlewares/*RateLimit*` | — |
| OpenAPI hujjati | ? | Qo'lda `.md` | PARTIAL | 25 | `docs/api-contract.md` | `zod-to-openapi` |
| Idempotency | ? | Yo'q | VERIFY | 0 | — | `Idempotency-Key` |
| **Webhooks** | ? | Yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| **SSO (JWT)** | ✓ | JWT ichkarida ishlatiladi, SSO sifatida emas | NONE | 0 | `utils/tokens.js` | `POST /auth/sso/jwt` |
| OIDC / Entra ID | ✓ | Yo'q | NONE | 0 | — | OIDC client |
| SAML | ? | Yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| Avtomatik provisioning (JIT) | ✓ | Yo'q | NONE | 0 | — | — |
| HR tizimi (BambooHR/Salesforce) | ✓ | Yo'q | NONE | 0 | — | XLSX import + API |
| Zoom / Meet / Teams | ✓ | Yo'q | NONE | 0 | — | D39 |
| Albato / Zapier tipidagi | ✓ | Yo'q | NONE | 0 | — | Public API'dan keyin |
| Storage provider abstraksiyasi | ? | Bor (Local + S3) | OURS+ | 100 | `storage/S3StorageProvider.js` | — |
| Domain alias | ✓ | Nginx darajasida qo'lda | PARTIAL | 50 | — | — |
| **D70–D73 jami: 16 capability (+1 N/A)** | | | **FULL 1 · OURS+ 2 · PARTIAL 2 · NONE 8 · VERIFY 3 · N/A 1** | **23** | | |

## D74–D79 · SECURITY / AUDIT / ADMIN / BRANDING / MEDIA / FILES

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Parol hashlash | ? | argon2id | OURS+ | 100 | `utils/hash.js` | — |
| Sessiya + refresh rotation + reuse detection | ? | Bor | OURS+ | 100 | `session.model.js` (`replacedBy`) | — |
| CSRF | ? | Double-submit | OURS+ | 100 | `csrf.middleware.js` | — |
| Brute-force / lockout / CAPTCHA | ? | Bor | OURS+ | 100 | `auth.service.js`, `captcha.service.js` | — |
| **2FA / TOTP** | ? | Yo'q (face verification bor) | VERIFY | 0 | — | — |
| **Face verification** | — | Bor, 3 harakatda gate | OURS+ | 100 | `faceGate.service.js`, `FACE_GATE_ACTIONS` | — |
| **Proctoring (begona yuz)** | — | Bor | OURS+ | 100 | `proctorSnapshot.service.js` | — |
| **Kamera diqqat monitoringi** | — | Bor, 8 maydonli siyosat | OURS+ | 100 | `attentionPolicy.model.js` | — |
| Fayl darajasida kirish nazorati | ✓ | Bor | FULL | 100 | `materialAccess.service.js:19-43` | — |
| Server shifrlash (at-rest) | ✓ | Faqat backup (AES-256-GCM); jonli DB va S3 shifrlanmagan | PARTIAL | 50 | `backupCrypto.js` | DB/S3 at-rest |
| On-premise o'rnatish | ✓ | Bor (o'z serverimizda) | FULL | 100 | `docs/deployment.md` | — |
| IDOR himoyasi | ? | Bor + 3 test | OURS+ | 100 | `security.test.js` | — |
| **Hisobot PII scope'i** | ✓ | ❌ Buzilgan | NONE | 0 | `report.controller.js:20` | 🔴 P0 |
| **Leaderboard PII** | ? | ❌ JSHSHIR oshkor | NONE | 0 | `points.service.js:104` | 🔴 P0 |
| **Audit jurnali (yozuv)** | ? | 60+ action | OURS+ | 100 | `auditLog.model.js` | — |
| **Audit jurnali (ko'rish)** | ? | **Yo'q** — route va UI yo'q | NONE | 0 | `routes/v1/index.js` | `GET /audit-logs` |
| Audit TTL | ? | Yo'q — cheksiz o'sadi | VERIFY | 0 | `auditLog.model.js` | TTL 730 kun |
| **Backup / restore** | ✓ (SaaS) | Kunlik shifrlangan dump + 30 kun + tiklash sinovi | FULL | 100 | `jobs/backupQueue.js`, `backup.service.js`, `test/backup.test.js` | — |
| Tizim sozlamalari (DB'da) | ✓ | 2 siyosat modeli bor, umumiysi yo'q | PARTIAL | 50 | `attentionPolicy.model.js`, `facePolicy.model.js` | `Settings` singleton |
| Logo / favicon / rang | ✓ | Yo'q (Tailwind token tizimi bor) | NONE | 0 | — | `branding{}` |
| White-label | ✓ | Yo'q | NONE | 0 | — | — |
| **Markaziy media kutubxona** | ✓ | Yo'q | NONE | 0 | — | `MediaAsset` |
| Nested papkalar (media) | ✓ | Yo'q | NONE | 0 | — | — |
| Orphan fayl tozalash | ? | Yo'q — kodda tan olingan qarz | VERIFY | 0 | `course.service.js:378-381` | `mediaCleanupQueue` |
| Rasm optimizatsiyasi | ? | Yo'q | VERIFY | 0 | — | `sharp` → webp |
| Storage sarfi ko'rsatkichi | ? | Yo'q | VERIFY | 0 | — | — |
| **D74–D79 jami: 26 capability** | | | **FULL 2 · OURS+ 9 · PARTIAL 1 · NONE 9 · VERIFY 5** | **44** | | |

## D80–D95 · PERFORMANCE / A11Y / AUTOMATION / RECOMMENDATIONS / STANDARDS / SUITE / E-COM / ENTERPRISE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Kesh + queue + indeks + pagination | ? | Bor | OURS+ | 100 | Redis, BullMQ, compound indekslar | — |
| Video worker alohida jarayonda | ? | Bor | OURS+ | 100 | `worker.js`, `videoProcessingQueue.js` | — |
| Pre-aggregation dashboard | ? | Bor | OURS+ | 100 | `dashboardAggregation.js` | — |
| 150 000 foydalanuvchi miqyosi | ✓ | Hozirgi kod ~5 000 gacha | PARTIAL | 25 | N+1: `reminderJob.js:18-50`; to'liq skan: `dashboardAggregation.js:98`; leaderboard xotirada: `points.service.js:92` | Optimizatsiya + server |
| CDN | ? | Yo'q | VERIFY | 0 | — | — |
| **WCAG 2.1 AA** | ? | Audit qilinmagan; ARIA/focus-trap/alt yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| Subtitr (a11y) | ✓ | Yo'q | NONE | 0 | — | WebVTT |
| Avtomatik kurs biriktirish | ✓ | Publish paytida bir martalik | PARTIAL | 25 | `course.service.js:170` | `EnrollmentRule` |
| Development plan avto-biriktirish | ✓ | Yo'q | NONE | 0 | — | — |
| Avtomatik eslatmalar | ✓ | Bor (kurs + task) | PARTIAL | 50 | `reminderJob.js` | Tadbir, sertifikat, onboarding |
| Avtomatik deaktivatsiya | ? | Bor | OURS+ | 100 | `user.service.js:296` | — |
| Trash avtomatik tozalash | ? | Bor | OURS+ | 100 | `trash.service.js` (`listExpired`) | — |
| Workflow qoida dvigateli | ✓ (smart filters) | Yo'q — har biri qo'lda kodlangan | NONE | 0 | — | `AutomationRule` |
| Tavsiyalar | ? | Faqat `continueLearning` | PARTIAL | 25 | `HomeView.vue` | `recommendation.service` |
| **SCORM 1.2 / 2004 import** | ✓ | Yo'q | NONE | 0 | — | Runtime + `ScormState` |
| **xAPI** | ✓ | Yo'q | NONE | 0 | — | LRS endpoint |
| cmi5 | ? | Yo'q | N/A | — | — | §24 |
| PowerPoint add-in (desktop) | ✓ (Suite) | Yo'q | N/A | — | — | §24 |
| Ekran yozib olish | ? | Yo'q | VERIFY | 0 | — | — |
| Transkripsiya | ? | Yo'q | VERIFY | 0 | — | — |
| Role play / dialog simulyatsiya | ? | Yo'q | VERIFY | 0 | — | — |
| E-commerce | ? | Yo'q | N/A | — | — | §24 |
| Multi-tenant (organization izolyatsiyasi) | ✓ | Yo'q | N/A | — | — | §24 |
| 24/7 support + SLA | ✓ | — | N/A | — | — | Mahsulot emas, xizmat |
| **D80–D95 jami: 19 capability (+5 N/A)** | | | **OURS+ 5 · PARTIAL 4 · NONE 5 · VERIFY 5 · N/A 5** | **33** | | |

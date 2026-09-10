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
| Kursni nusxalash | ✓ | Bor — chuqur nusxa (mavzu/video/material/dars/test+savol), media havola qilinadi | FULL | 100 | `courseDuplicate.service.js`, `courses.routes.js:82-85` | — |
| Kurs kategoriyasi | ✓ | Bor — bir daraja ichma-ich `CourseCategory` | FULL | 100 | `courseCategory.model.js`, `course.model.js:21` | — |
| Teglar | ✓ | Bor — `tags[]` + `$text` indeksda vaznlangan | FULL | 100 | `course.model.js:25,118-120` | — |
| Muallif | ✓ | Bor — `authorIds[]` + AUTHOR roli | FULL | 100 | `course.model.js:30`, `role.model.js` | — |
| Prerequisites | ✓ | Maydon bor, kirish gate'i Blok 5 da | PARTIAL | 50 | `course.model.js:38` | Path'da tekshiruv |
| Tugatish qoidasi (sozlanadigan) | ✓ | Bor — yagona `completionRule{minPercent,requireAllRequired}`, bitta servis | FULL | 100 | `course.model.js:70-78`, `courseCompletion.service.js` | — |
| Minimal tugatish vaqti | ✓ | Yo'q | NONE | 0 | — | `course.minMinutes` |
| Navigatsiya: qat'iy/erkin | ✓ | Bor — `navigationMode` SEQUENTIAL / FREE | FULL | 100 | `course.model.js:44`, `courseSequence.js` | — |
| Gated content (test o'tilmaguncha qulf) | ✓ | Video ketma-ketligi bor, test gate'i yo'q | PARTIAL | 50 | `courseSequence.js:52-66` | `blockedByQuizId` |
| Kurs versiyalash | ? | Yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| Kurs amal muddati | ✓ | Bor — `course.validityDays` + assignment darajasi | FULL | 100 | `course.model.js:50`, `courseAssignment.model.js:19` | — |
| Soft delete + trash + tiklash | — | Bor + avtomatik tozalash | OURS+ | 100 | `trash.service.js`, `course.model.js:31` | — |
| Kurs ko'rinishi (targeting) | ✓ | rol AND filial AND bo'lim | OURS+ | 100 | `courseVisibility.js:20-38` | — |
| Kurs qidiruvi | ✓ | Bor — `$text` indeks (title×10 / tags×4 / description×1) | FULL | 100 | `course.model.js:118-120`, `course.repository.js` | — |
| Kurs cover/banner | ✓ | Bor | FULL | 100 | `course.model.js:8-9` | — |
| **D01 jami: 17 capability** | | | **FULL 11 · OURS+ 2 · PARTIAL 2 · NONE 1 · VERIFY 1** | **82** | | |

## D02 · COURSE CATALOG

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Katalog sahifasi | ✓ | Bor | FULL | 100 | `CoursesView.vue` | — |
| Filtr: status/filial | ✓ | Bor | FULL | 100 | `course.repository.js:89-112` | — |
| Filtr: kategoriya/teg/daraja | ✓ | Bor | FULL | 100 | `course.repository.js:94-112` | — |
| Self-enroll | ✓ | Bor | FULL | 100 | `courseAssignment.service.js:88-124` | — |
| Self-enroll'ni kurs darajasida o'chirish | ? | Bor — `allowSelfEnroll` | OURS+ | 100 | `course.model.js:60` | — |
| Reyting va sharh | — | Bor (1–5 + izoh) | OURS+ | 100 | `courseReview.model.js` | — |
| Tayyor kurslar kutubxonasi | ✓ | Yo'q | N/A | — | — | §24 — biznes modeliga tegishli emas |
| Tashqi kutubxona integratsiyasi | ✓ | Yo'q | N/A | — | — | §24 |
| Nested papkalar | ✓ | Kategoriya daraxti (2 daraja) + Course→Topic | PARTIAL | 75 | `courseCategory.model.js:25`, `topic.model.js` | Chuqurroq ierarxiya |
| Tavsiya etilgan kurslar | — | Yo'q | NONE | 0 | — | `recommendation.service` |
| **D02 jami: 10 capability (+2 N/A)** | | | **FULL 4 · OURS+ 2 · PARTIAL 1 · NONE 1 · N/A 2** | **84** | | |

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
| Subtitr / caption | ✓ (Suite) | Bor — videodan avtomatik chiqarish, .srt/.vtt yuklash, `<track>` + tugma va til tanlash | FULL | 100 | `processVideo.js`, `subtitleFormat.js`, `VideoPlayer.vue` | — |
| Matn darsi (Page) | ✓ | Bor — 12 blok turi, blok editori, o'quvchi sahifasi, blok-asosli o'qish progressi | FULL | 100 | `lesson.model.js`, `LessonEditor.vue`, `LessonView.vue` | — |
| Blok shablonlari | ✓ | Yo'q | NONE | 0 | — | `BlockTemplate` |
| Flashcard / jadval / labeled graphics | ✓ | Jadval bloki bor; flashcard va labeled graphics yo'q | PARTIAL | 25 | `lesson.model.js` (`TABLE`) | Yangi blok turlari |
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
| Embed (iframe) | ✓ | Bor — host allowlist (YouTube/Vimeo/Google), URL normalizatsiyasi, `sandbox` | PARTIAL | 75 | `lessonEmbeds.js`, `LessonBlock.vue` | Allowlist Settings'dan sozlanmaydi |
| Cheksiz fayl hosting | ✓ | S3/MinIO | FULL | 100 | `S3StorageProvider.js` | — |
| Fayl turi magic-byte tekshiruvi | ? | Bor | OURS+ | 100 | `materialUpload.service.js` (`file-type`) | — |
| **D04–D09 jami: 22 capability** | | | **FULL 9 · OURS+ 4 · PARTIAL 5 · NONE 3 · VERIFY 1** | **69** | | |

## D10–D12 · INTERACTIVE CONTENT / COURSE BUILDER / AUTHORING

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Brauzerda kurs builder | ✓ | 4 qadamli sehrgar (kontentsiz) | PARTIAL | 25 | `CourseBuilderView.vue:22-27` | Kontent qadami |
| Blok editori | ✓ | Bor — 12 blok turi, per-tur forma, nusxalash | PARTIAL | 75 | `LessonEditor.vue`, `utils/lessonBlocks.js` | iSpring'da blok turlari ko'proq |
| Drag-drop | ✓ | Bor — `SortableList`, klaviatura uchun yuqori/past tugmalari ham | FULL | 100 | `SortableList.vue`, `LessonEditor.vue` | — |
| Autosave | ? | Bor — oxirgi tahrirdan 1,2 s keyin, holat ko'rsatkichi bilan | FULL | 100 | `LessonEditor.vue` | — |
| Preview (o'quvchi ko'zi bilan) | ✓ | Admin DRAFT ko'radi | PARTIAL | 50 | `course.service.js:38` | `?preview=learner` |
| Brend rang va shrift kursda | ✓ | Yo'q | NONE | 0 | — | D77 ga bog'liq |
| Sahifa ichida quiz | ✓ | Yo'q — dars testga havola qiladi, ichida tutmaydi | NONE | 0 | — | Blok sifatida `Assessment` |
| PowerPoint import | ✓ | PPTX ko'rsatiladi, **darsga aylanmaydi** | PARTIAL | 50 | `MaterialViewer.vue:233` | Slayd → blok |
| Ekran yozib olish | ? | Yo'q | VERIFY | 0 | — | — |
| Branching scenario | ? | Yo'q | VERIFY | 0 | — | Suite mahsuloti |
| Interaktiv timeline/tab/FAQ | ✓ | Yo'q | NONE | 0 | — | Blok turlari |
| **D10–D12 jami: 11 capability** | | | **FULL 2 · PARTIAL 4 · NONE 3 · VERIFY 2** | **36** | | |

## D13–D17 · AI

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| AI o'quv assistenti (chat) | ✓ | Bor, kirish huquqi bo'yicha scope'langan | FULL | 100 | `aiChat.service.js:26-56` | — |
| AI kurs generatori (fayldan) | ✓ | Bor — pdf/docx/pptx → matn → kurs (DRAFT), worker'da | FULL | 100 | `sourceExtract.service.js`, `aiCourse.service.js` | Kalit prodda sozlanmagan |
| AI kurs generatori (mavzudan) | ✓ | Bor — mavzudan konspekt + darslar (DRAFT) | FULL | 100 | `aiCourse.service.js` | — |
| AI quiz savol generatsiyasi | ✓ | Bor — mavzu darslaridan, savollar bankiga, 4 tur | PARTIAL | 75 | `aiQuiz.service.js` | Moslash/ketma-ketlik turlari yo'q |
| AI rasm generatsiyasi | ✓ | Yo'q | NONE | 0 | — | Tashqi provider |
| AI tarjima (kontent) | ✓ | Bor — qatlam sifatida, id'lar saqlanadi, tasdiqlashdan keyin beriladi | PARTIAL | 75 | `aiTranslate.service.js`, `contentTranslation.model.js` | Faqat dars o'qish yo'lida qo'llanadi |
| AI matn yozish/qayta yozish | ✓ | Yo'q (chat bor, editorga ulanmagan) | PARTIAL | 25 | `aiChat.service.js` | Editor ichida |
| AI o'zbek tili | ✓ (2026-08) | Model qo'llab-quvvatlaydi | FULL | 100 | `anthropicClient.js:15` | — |
| Inson tasdig'isiz publish bo'lmasligi | ✓ | Arxitekturada: har doim DRAFT | OURS+ | 100 | `course.model.js:11` | — |
| AI token/xarajat nazorati | ? | Bor — oylik token chegarasi, API raqamlaridan hisoblanadi | FULL | 100 | `aiBudget.service.js` | — |
| AI audit jurnali | ? | Bor — so'rov va yakun, token sarfi bilan (manba matnisiz) | FULL | 100 | `aiGeneration.service.js` | — |
| **D13–D17 jami: 11 capability** | | | **FULL 6 · OURS+ 1 · PARTIAL 3 · NONE 1** | **80** | | |

## D18–D25 · ASSESSMENT

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Multiple choice (1 javob) | ? | Bor | FULL | 100 | `quiz.model.js:3-21` | — |
| Multiple response | ? | Bor — `MULTI_CHOICE`, qisman ball bilan | FULL | 100 | `question.model.js:24-38`, `questionGrading.js:49-72` | — |
| True/False | ? | Bor — alohida tur | FULL | 100 | `question.model.js:26`, `questionGrading.js` | — |
| Short answer | ? | Bor — normalizatsiya + alternativalar | FULL | 100 | `questionGrading.js:74-79` | — |
| Essay + qo'lda baholash | ? | Tur bor, `needsReview` bilan; qo'lda baholash endpoint'i yo'q | PARTIAL | 50 | `questionGrading.js:210-216`, `quizResult.service.js:92` | Baholash API + UI (Blok 13) |
| Numeric | ? | Bor — tolerans bilan | FULL | 100 | `questionGrading.js:81-89` | — |
| Matching | ? | Bor | FULL | 100 | `questionGrading.js:92-106` | — |
| Sequence | ? | Bor | FULL | 100 | `questionGrading.js:108-116` | — |
| **Drag & Drop** | ✓ (S2 2024-12) | Bor — `DRAG_DROP` va `DRAG_WORDS` | FULL | 100 | `questionGrading.js:172-186` | — |
| Hotspot | ? | Bor | FULL | 100 | `questionGrading.js:144-165` | — |
| Fill in the blanks | ? | Bor — `FILL_BLANK` va `SELECT_LIST` | FULL | 100 | `questionGrading.js:118-142` | — |
| **Likert** | ✓ (S2 2023-08) | Bor — so'rov elementi, `max: 0` | FULL | 100 | `questionGrading.js`, `question.model.js` | — |
| **Savol banki** | ✓ | Bor — `QuestionBank` + CRUD + editor | FULL | 100 | `questionBank.model.js`, `question.service.js`, `QuestionBanksView.vue` | — |
| **Random pool** | ✓ | Bor — `pools[]{bankId,count,tags,difficulty}` | FULL | 100 | `testQuiz.model.js:29-37`, `questionSelection.js:51-62` | — |
| **Savollarni aralashtirish** | ✓ | Bor — seed'li Fisher–Yates | FULL | 100 | `questionSelection.js:28-37,71-90` | — |
| **Javoblarni aralashtirish** | ✓ | Bor — o'sha seed bilan | FULL | 100 | `questionSelection.js`, `testQuiz.model.js:62` | — |
| **Urinishlar chegarasi** | ✓ | Bor — `maxAttempts` + start guard + audit | FULL | 100 | `testQuiz.model.js:59`, `testQuiz.service.js:111-113` | — |
| O'tish bali | ✓ | Bor | FULL | 100 | `quiz.model.js:29` | — |
| Vaqt chegarasi | ✓ | Bor — `timeLimitMinutes` (0 = cheksiz) | FULL | 100 | `testQuiz.model.js:60` | — |
| Savol og'irligi | ? | Bor — `question.points` | FULL | 100 | `question.model.js:63` | — |
| Qisman ball | ? | Bor — test darajasidagi `partialCredit` | FULL | 100 | `testQuiz.model.js:66`, `questionGrading.js` | — |
| Izoh (explanation) | ? | Bor — savolda saqlanadi, `revealMode` ruxsat berganda ko'rsatiladi | FULL | 100 | `question.model.js:61` | — |
| Darhol feedback (knowledge check) | ✓ | `revealMode=AFTER_SUBMIT` bor, savol-savol amaliyot rejimi yo'q | PARTIAL | 50 | `testQuiz.model.js:71-76` | `gradingMode=PRACTICE` |
| Natijani ko'rsatish rejimi | ? | Bor — `NEVER` / `AFTER_SUBMIT` / `AFTER_PASS` / `AFTER_LAST_ATTEMPT` | FULL | 100 | `testQuiz.model.js:71-76`, `testQuiz.service.js` | — |
| Urinishlar tarixi | ✓ | Bor | FULL | 100 | `quizAttempt.model.js` | — |
| Batafsil javob tahlili | ✓ | Bor (admin drill-down) | FULL | 100 | `quiz.service.js:137-174` | — |
| O'rtacha natija | ✓ | Bor — `scorePolicy` LAST/BEST/FIRST/AVERAGE | FULL | 100 | `quizResult.service.js:25-45,78-90` | — |
| Savol qiyinligi statistikasi | ✓ | Bor — savol bo'yicha to'g'ri javob foizi, e'lon qilingan ↔ kuzatilgan qiyinlik | FULL | 100 | `quizStats.service.js` | — |
| Mustaqil (kurssiz) quiz | ✓ | `scope` VIDEO / TOPIC / COURSE / PATH — kurssiz test yo'q | PARTIAL | 50 | `testQuiz.model.js:41-44` | `scope=STANDALONE` |
| Javob kalitini yashirish | ✓ | Bor va qat'iy | FULL | 100 | `quiz.service.js:22-36` | — |
| **Server taymer + focus-loss** | — | Bor | OURS+ | 100 | `assessmentSession.model.js`, `assessment.service.js:265-290` | — |
| **Savollar sessiyagacha berilmaydi** | — | Bor | OURS+ | 100 | `assessment.service.js:194-212` | — |
| **Tashlab ketish nol ball bilan yoziladi** | — | Bor | OURS+ | 100 | `assessment.service.js:243-248` | — |
| **Test oldidan yuzni tekshirish** | — | Bor | OURS+ | 100 | `assessment.service.js:222` | — |
| Savol import/eksport | ✓ | Yo'q | NONE | 0 | — | XLSX/GIFT |
| **D18–D25 jami: 35 capability** | | | **FULL 27 · OURS+ 4 · PARTIAL 3 · NONE 1** | **93** | | |

## D26–D29 · LEARNING PATHS / PROGRAMS / ENROLLMENT

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Learning track / path | ✓ | Bor — `LearningPath` + `PathEnrollment` | FULL | 100 | `learningPath.model.js`, `pathEnrollment.service.js` | — |
| Path ichida boblar | ✓ | Bor — `sections[]` (faqat ko'rinish uchun, tartib `item.order` da) | FULL | 100 | `learningPath.model.js:32-40` | — |
| Qat'iy / erkin tugatish tartibi | ✓ | Bor — `sequential` + `pathSequence.js` | FULL | 100 | `pathSequence.js`, `learningPath.model.js:60` | — |
| Path progressi | ✓ | Bor — `completionPercent` + element holatlari (LOCKED/AVAILABLE/IN_PROGRESS/COMPLETED) | FULL | 100 | `pathEnrollment.model.js:17,42` | — |
| Path muddati | ✓ | Maydonlar bor (`deadline`, `expiresAt`, `deadlineReminderSentAt`), kunlik eslatma joblari hali path'ni o'qimaydi | PARTIAL | 50 | `pathEnrollment.model.js:31-47` | `reminderJob` ga ulash |
| Path katalogda | ✓ (S2 2023-12) | Servis bor, katalog sahifasi hali commit qilinmagan | NONE | 0 | — | Katalog ro'yxati + API |
| Qo'lda biriktirish | ✓ | Bor | FULL | 100 | `courseAssignment.service.js:46-86` | — |
| Guruhga biriktirish | ✓ | Bor | FULL | 100 | `group.service.js` | — |
| Publish'da avto-biriktirish | ✓ | Bor (targeting bo'lsa) | FULL | 100 | `course.service.js:170-200` | — |
| **Smart enrollment filtrlari** (jamoa, lavozim, mamlakat, custom) | ✓ | Yo'q — faqat publish paytida | PARTIAL | 25 | — | `EnrollmentRule` dvigateli |
| Kriteriya bo'yicha doimiy avto-biriktirish | ✓ | Yo'q — bir martalik | PARTIAL | 25 | `course.service.js:317` | User o'zgarganda qayta baholash |
| Deadline + muddat | ✓ | Bor | FULL | 100 | `courseAssignment.model.js:17-19` | — |
| Boshlash sanasi (`startAt`) | ? | Bor | OURS+ | 100 | `courseAssignmentAccess.js:11` | — |
| Enrollment tasdiqlash oqimi | ? | Yo'q | VERIFY | 0 | — | — |
| **D26–D29 jami: 14 capability** | | | **FULL 8 · OURS+ 1 · PARTIAL 3 · NONE 1 · VERIFY 1** | **71** | | |

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
| **Rahbar (manager) maydoni** | ✓ | Bor — `managerId`, tranzitiv `$graphLookup`, tsikl himoyasi | FULL | 100 | `user.model.js:32`, `orgHierarchy.service.js` | — |
| **Interaktiv org chart** | ✓ | Yo'q | NONE | 0 | — | `OrgChartView` |
| People / hamkasb profillari | ✓ | Chat kontaktlari + `useOrgDirectory` | PARTIAL | 50 | `useOrgDirectory.js`, `chat/contacts` | Profil sahifasi |
| Rollar (tayyor) | ✓ (5+Supervisor) | 9 ta seed — AUTHOR/INSTRUCTOR/MENTOR qo'shildi | FULL | 100 | `roles.js`, `permissions.js` (§8.2) | — |
| **Custom rollar** | ✓ | Bor — kod o'zgartirmasdan | FULL | 100 | `role.model.js`, `POST /roles` | — |
| **Rolni tahrirlash** | ✓ | Bor — `PATCH /roles/:id` + ruxsat grid'i | FULL | 100 | `roles.routes.js`, `RolesPermissionsView.vue` | — |
| Granular ruxsatlar | ✓ | 24 kalit | PARTIAL | 50 | `permissions.js` | +45 kalit |
| Ruxsat matritsasi UI | ✓ | Yo'q | NONE | 0 | — | `RolesPermissionsView` |
| Bo'lim scope'i (majburlanadi) | ✓ | Hamma domenda, hisobot va dashboard ham | FULL | 100 | `actorScope.js`, `scopeToManagedUsers.middleware.js` | — |
| Scope custom rolga ham qo'llanishi | ✓ | Bor — `role.scope` (ALL/DEPARTMENT/TEAM/SELF) | FULL | 100 | `actorScope.js`, AT-21 | — |
| IDOR himoyasi | ? | Bor + testlar | OURS+ | 100 | `rbac.middleware.js`, `security.test.js` | — |
| Tug'ilgan kun tabrigi | ✓ | Yo'q | NONE | 0 | — | LOW |
| Yangi xodim kartasi | ✓ | Yo'q | NONE | 0 | — | LOW |
| **D30–D36 jami: 25 capability** | | | **FULL 10 · OURS+ 3 · PARTIAL 5 · NONE 7** | **61** | | |

## D37–D38 · ONBOARDING / ASSIGNMENTS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Development plan moduli | ✓ | Bor — reja + maqsadlar (kurs/kompetensiya/OJT/erkin), ko'rib chiqish, CPE | FULL | 100 | `developmentPlan.model.js`, `developmentPlan.service.js` | — |
| Rolga qarab shaxsiy yo'l | ✓ | Yo'q | NONE | 0 | — | `PlanTemplate` |
| Yangi xodim checklisti | ✓ | Bor — `OnboardingProgram.steps[]`, turli qadam turlari, `dueDays`, egasi (EMPLOYEE/MANAGER/MENTOR/HR) | FULL | 100 | `onboardingProgram.model.js:18-40` | — |
| Mentor biriktirish | ✓ | Bor — MENTOR roli (TEAM scope) va yozilishda `mentorId` | FULL | 100 | `roles.js:19,65`, `onboardingEnrollment.model.js:31` | — |
| Rahbar biriktirish | ✓ | Bor — `user.managerId` + indeks; 360 baholovchilari va scope shundan chiqadi | FULL | 100 | `user.model.js:32,174`, `orgHierarchy.service.js` | — |
| Milestone kuzatuvi | ✓ | Qisman — reja maqsadi `targetDate` + holat bilan kuzatiladi, onboarding milestone'i yo'q | PARTIAL | 50 | `developmentPlan.model.js:52-58` | Onboarding bosqichlari |
| Development plan avto-biriktirish | ✓ (S2 2026-08) | Yo'q | NONE | 0 | — | — |
| CPE / ball asosidagi maqsad | ✓ | Bor — maqsad boshiga `cpeCredits`, tasdiqlashda `PointsLedger` ga idempotent yoziladi | FULL | 100 | `developmentPlan.model.js:66-76`, `developmentPlan.service.js` (`accrue`) | — |
| Topshiriq yaratish | ✓ | `Task` bor (boshqa domen) | PARTIAL | 25 | `task.model.js` | `Assignment` modeli |
| **Fayl/matn/havola topshirish** | ✓ | **Yo'q** — xodim faqat "bajardim" belgilaydi | NONE | 0 | `task.service.js` | `Submission` |
| Tekshirish va baholash | ✓ | Yo'q | NONE | 0 | — | `grading.service` + rubrika |
| Tugatish haqida belgilangan shaxsga xabar | ✓ | Yo'q | NONE | 0 | — | — |
| Task fan-out (USER/POSITION/ALL) | ? | Bor | OURS+ | 100 | `task.model.js:19-30` | — |
| **D37–D38 jami: 13 capability** | | | **FULL 5 · OURS+ 1 · PARTIAL 2 · NONE 5** | **52** | | |

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
| Sertifikat shabloni (.docx) | ✓ | Bor — fon rasmi + foizli koordinatali maydonlar (docx emas) | FULL | 75 | `certificateTemplate.model.js`, `CertificateTemplatesView.vue` | `.docx` import emas, konstruktor |
| Avtomatik berish | ✓ | Bor — kurs tugaganda navbatga qo'yiladi, idempotent | FULL | 100 | `jobs/certificateQueue.js`, `certificate.service.js:50-93` | — |
| Sertifikat statuslari (Valid/Expiring/Expired/Renewed) | ✓ | VALID / EXPIRED / REVOKED bor; Expiring va Renewed yo'q | PARTIAL | 50 | `certificate.service.js:204-218` | `EXPIRING` oynasi + qayta berish zanjiri |
| Muddat + sozlanadigan ogohlantirish (30 kun) | ✓ | `validUntil` + shablon `validityDays` + bildirishnoma shabloni bor; jo'natuvchi sweep yo'q | PARTIAL | 25 | `certificate.model.js:33,60`, `notificationTemplates.seed.js:479` | `complianceQueue` — muddat sweep'i |
| **Avtomatik re-enrollment** (yillik) | ✓ | Yo'q | NONE | 0 | — | `RecurringAssignment` |
| Qo'lda re-enrollment | ✓ | Qo'lda qayta biriktirish mumkin | PARTIAL | 50 | `courseAssignment.service.js:46` | — |
| Tashqi sertifikat + muddat | ✓ | Bor — `ExternalCertificate` + tasdiqlash oqimi (PENDING/APPROVED/REJECTED) | FULL | 100 | `externalCertificate.model.js` | — |
| Sertifikatlar hisoboti | ✓ | Registr ro'yxati bor (status/qidiruv/scope), alohida eksport yo'q | PARTIAL | 50 | `certificate.service.js:163`, `CertificatesView.vue` | Hisobot eksporti (Blok 8) |
| Ochiq tekshiruv sahifasi / QR | ? | Bor — auth'siz, rate-limited, PII'siz endpoint + PDF'dagi QR | OURS+ | 100 | `certificates.routes.js:25-27`, `certificateRender.service.js:22-38`, `VerifyCertificateView.vue` | — |
| PDF render | ✓ (.docx) | Bor — `pdfkit` + DejaVu, fon + maydonlar + QR | FULL | 100 | `certificateRender.service.js` | — |
| Knowledge base (spaces + maqolalar) | ✓ | **Yo'q** (`News` — oqim, baza emas) | NONE | 0 | — | `KbArticle` + `KbCategory` |
| KB rolga asoslangan kirish | ✓ | Yo'q | NONE | 0 | `courseVisibility.js` qayta ishlatiladi | — |
| KB teglar (rangli) | ✓ | Yo'q | NONE | 0 | — | — |
| KB bookmarks | ✓ | Yo'q | NONE | 0 | — | — |
| KB feedback / reyting | ✓ | Yo'q | NONE | 0 | — | `CourseReview` naqshi |
| KB → kurs sinxronizatsiyasi | ✓ | Yo'q | NONE | 0 | — | — |
| KB PDF eksport | ✓ | Yo'q | NONE | 0 | — | — |
| KB full-text qidiruv | ✓ | Yo'q | NONE | 0 | — | `$text` |
| KB o'qish analitikasi | ✓ | Yo'q (`NewsView` naqshi mavjud) | NONE | 0 | `newsView.model.js` | Ko'chiriladi |
| **D51–D54 jami: 19 capability** | | | **FULL 4 · OURS+ 1 · PARTIAL 4 · NONE 10** | **34** | | |

## D55–D59 · 360 / OJT / COMPETENCIES / SKILLS / DEVELOPMENT PLANS

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| 360 so'rovnoma | ✓ | Bor — shablon + sikl, DRAFT→RUNNING→CLOSED, savollar siklga muzlatiladi | FULL | 100 | `reviewCycle.model.js`, `review360.service.js:372` | — |
| Ko'p tomonlama (self/manager/peer/subordinate) | ✓ | Bor — `managerId` dan avtomatik, guruh ustuvorligi bilan | FULL | 100 | `review360.service.js:110-140` | — |
| Kompetensiya baholash | ✓ | Bor — katalog, daraja, amal muddati (muddati o'tgan daraja bugun 0) | FULL | 100 | `competency.model.js`, `competency.service.js:225` | — |
| Rolga moslik tahlili | ✓ | Bor — talab lavozim/bo'lim/filial bo'yicha, `gap = required − effective` | FULL | 100 | `competency.service.js:315-387` | — |
| Bo'lim bo'yicha 360 hisoboti | ✓ | Qisman — har qator bo'lim bilan keladi, bo'lim kesimidagi jamlanma yo'q | PARTIAL | 50 | `review360.service.js:759-790` | Bo'lim bo'yicha agregat |
| Before/after taqqoslash | ✓ | Yo'q — ikki siklni yonma-yon qo'yish yo'q | NONE | 0 | — | Sikl juftligi bo'yicha delta |
| 360 bildirishnoma chastotasi | ✓ | Qisman — ishga tushganda taklif yuboriladi (baholovchi boshiga bitta), chastota/eslatma sozlamasi yo'q | PARTIAL | 50 | `review360.service.js:launch`, `notificationTemplates.seed.js` (`REVIEW360_INVITED`) | Eslatma jadvali |
| OJT: checklist + baholash + statistika | ✓ | Checklist va baholash bor (vazn, majburiy band, o'tish ostonasi); jamlanma statistika yo'q | PARTIAL | 50 | `ojtChecklist.model.js`, `ojt.service.js:450-533` | Sessiyalar bo'yicha hisobot |
| OJT sozlanadigan baholash shkalasi | ✓ | Qisman — vazn va ostona sozlanadi, shkala PASS/FAIL/NOT_OBSERVED qat'iy | PARTIAL | 25 | `ojtObservation.model.js:37` | Checklistda `ratingScale` |
| OJT bitta sessiyada bir necha kuzatuv | ✓ | Bor — band boshiga bitta verdikt, `(session,item)` unique upsert (oflayn qayta yuborishga chidamli) | FULL | 100 | `ojtObservation.model.js:51` | — |
| Ko'nikma matritsasi | ? | Bor — odam × kompetensiya, katak gap bo'yicha bo'yaladi | FULL | 100 | `competency.service.js:387`, `CompetencyMatrixView.vue` | — |
| **D55–D59 jami: 11 capability** | | | **FULL 6 · PARTIAL 4 · NONE 1** | **70** | | |

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
| **Hisobot scope'i (majburlanadi)** | ✓ | Bor — `build(actor,…)`, scope role'dan | FULL | 100 | `reportData.service.js:376`, `actorScope.js` | — |
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
| **D60–D62 jami: 21 capability** | | | **FULL 6 · OURS+ 3 · PARTIAL 2 · NONE 8 · VERIFY 2** | **46** | | |

## D63–D65 · NOTIFICATIONS / EMAIL / PUSH

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| In-app bildirishnoma | ✓ | Bor | FULL | 100 | `notification.service.js:22-48` | — |
| Realtime (socket) push | ? | Bor | OURS+ | 100 | `realtime/socket.js`, `emitNotification` | — |
| **E-mail bildirishnoma** | ✓ | Bor — SMTP, 5× eksponensial retry, `mailLogs` | FULL | 100 | `mail.service.js`, `deliveryQueue.js` | SMTP hisobi kerak (INF-4) |
| Kurs tugatish e-maili | ✓ | Bor — `COURSE_COMPLETED`, o'tishda bir marta | FULL | 100 | `videoEventProcessor.js:250` | — |
| Test o'tish e-maili | ✓ | Bor — `QUIZ_PASSED` / `QUIZ_FAILED` | FULL | 100 | `quiz.service.js` | — |
| O'qilmagan chat e-maili | ✓ | Yo'q | NONE | 0 | — | — |
| Tadbir taklifi va eslatmasi | ✓ | Yo'q | NONE | 0 | `event.service.js` | — |
| **Mobil push** | ✓ | Web Push API bor, brauzer tomoni (SW) yo'q | PARTIAL | 50 | `push.service.js`, `pushSubscription.model.js` | Service worker (12.1) |
| Bildirishnoma shabloni | ✓ | Bor — 27 tur × 3 til × 3 kanal, admin tahrirlaydi | FULL | 100 | `notificationTemplate.model.js`, M9 | — |
| Bildirishnoma tili | ✓ | Bor — `user.locale`, o'zbekchaga fallback | FULL | 100 | `user.model.js:56`, `notificationTemplate.service.js` | — |
| Foydalanuvchi sozlamasi | ✓ (360 chastotasi) | Bor — kanal × tur, majburiy turlar qulflangan | FULL | 100 | `notificationPrefs.js`, `SettingsView.vue` | — |
| Retry / xato boshqaruvi | ? | Bor — BullMQ 5×, `mailLogs.attempts/status/error` | OURS+ | 100 | `deliveryQueue.js`, AT-17 | — |
| Deadline eslatmasi | ✓ | Bor (24 soat, bir marta) | PARTIAL | 50 | `reminderJob.js:9-31` | Bosqichli 7/3/1 |
| Kechikish eslatmasi | ✓ | Task uchun bor, kurs uchun yo'q | PARTIAL | 50 | `reminderJob.js:71-85` | — |
| Hodisa qamrovi | ✓ (40+ taxminan) | **27 tur** shablonda, 14 tasi ulangan | PARTIAL | 50 | `notificationTemplates.seed.js` | Qolgan trigger'lar |
| **D63–D65 jami: 15 capability** | | | **FULL 7 · OURS+ 2 · PARTIAL 4 · NONE 2** | **73** | | |

## D66–D67 · MOBILE / OFFLINE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Responsive web | ✓ | Bor | FULL | 100 | `BottomNav.vue`, Tailwind | — |
| **Native ilova (iOS/Android)** | ✓ | Yo'q | N/A | — | — | §24 — PWA tanlandi |
| PWA (o'rnatiladigan) | ? | Bor — manifest, service worker, oflayn qobiq, yangilanish so'rovi | FULL | 100 | `front/src/sw.js`, `vite.config.js` | — |
| **Oflayn o'qish** | ✓ | Bor — kursni qurilmaga saqlash (darslar + hujjatlar), IndexedDB | FULL | 100 | `offline/offlineContent.js` | Video ataylab yo'q |
| **Oflayn progress sinxronizatsiyasi** | ✓ | Bor — IndexedDB navbati, `clientEventId` unique indeks (AT-35), Background Sync | FULL | 100 | `offline/queue.js`, `videoAnalyticsEvent.model.js` | — |
| Mobil video player | ✓ | Bor | FULL | 100 | `hls.js`, `VideoPlayer.vue` | — |
| Mobil hujjat ko'rish | ✓ | Bor | FULL | 100 | `MaterialViewer.vue` | — |
| Mobil test | ✓ | Bor (onlayn) | FULL | 100 | `AssessmentView.vue` | — |
| Mobil chat + ovozli xabar | ✓ | Bor | OURS+ | 100 | `VoiceRecorder.vue` | — |
| Mobil push | ✓ | Yo'q | NONE | 0 | — | D65 |
| White-label mobil ilova | ✓ | Yo'q | N/A | — | — | §24 |
| **D66–D67 jami: 9 capability (+2 N/A)** | | | **FULL 7 · OURS+ 1 · NONE 1 · N/A 2** | **89** | | |

## D68–D69 · SEARCH / MULTILINGUAL

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Global qidiruv | ✓ | **Yo'q** | NONE | 0 | — | `search.service` fan-out |
| Kurs qidiruvi | ✓ | Bor — `$text`, vaznlangan | FULL | 100 | `course.model.js:118-120` | — |
| Foydalanuvchi qidiruvi | ✓ | Bor, escape'langan | FULL | 100 | `user.repository.js:97-105` | — |
| Chat qidiruvi | ? | Bor | OURS+ | 100 | `chatMessage.repository.js:44` | — |
| KB qidiruvi | ✓ | Yo'q | NONE | 0 | — | D53 |
| Katalog filtri (facet) | ✓ | Bor — kategoriya/teg/daraja + ishlatilayotgan teglar ro'yxati | PARTIAL | 75 | `course.repository.js:94-112,171-178` | Facet hisoblari |
| Autocomplete | ? | Chat kontaktlarida | PARTIAL | 25 | — | — |
| UI lokalizatsiyasi | ✓ **30 til** | **3 til** (uz/ru/en) | PARTIAL | 50 | `i18n/locales/*.json` (1393 kalit) | — |
| Kontent ko'p tilli | ✓ | **Yo'q** — kontent bir tilli | NONE | 0 | — | `ContentTranslation` |
| Bildirishnoma ko'p tilli | ✓ | Bor — uz/ru/en shablonlar, hisobga bog'langan til | FULL | 100 | `notificationTemplates.seed.js` | — |
| Sertifikat ko'p tilli | ✓ | Har til uchun alohida shablon mumkin, render matni tarjima qilinmaydi | PARTIAL | 25 | `certificateTemplate.model.js`, `certificateRender.service.js:43` | Shablon matni i18n |
| Hisobot ko'p tilli | ? | **3 tilli** | OURS+ | 100 | `reportI18n.js` | — |
| Tashkilot bo'yicha til | ✓ | Yo'q | NONE | 0 | — | — |
| **D68–D69 jami: 13 capability** | | | **FULL 3 · OURS+ 2 · PARTIAL 4 · NONE 4** | **52** | | |

## D70–D73 · INTEGRATIONS / API / WEBHOOKS / SSO

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| REST API (ichki) | ✓ | Bor, layered, `ApiError` envelope | FULL | 100 | `routes/v1/index.js` (34 router) | — |
| **Tashqi REST API** | ✓ | Bor — `/api/public/v1` (o'qish) + webhook'lar (push) | PARTIAL | 85 | `routes/public/v1.routes.js`, `routes/v1/webhooks.routes.js` | Yozish yo'q — ataylab |
| SOAP API | ✓ | Yo'q | N/A | — | — | §24 — eskirgan protokol |
| API kalitlari + scope | ✓ (implicit) | Bor — argon2 hash, scope'lar, per-key limit, PII bayrog'i | FULL | 100 | `apiKey.service.js`, `apiKeyAuth.middleware.js` | — |
| Rate limiting | ? | **11 alohida limiter** | OURS+ | 100 | `middlewares/*RateLimit*` | — |
| OpenAPI hujjati | ? | Router'lardan generatsiya — `GET /openapi.json` (3.1, 370 operatsiya) + `/api/docs` | FULL | 100 | `services/docs/openapi.service.js` | Javob sxemalari yo'q |
| Idempotency | ? | Bor — `Idempotency-Key`, 5 yozuv endpointida, Redis, 24 soat | FULL | 100 | `idempotency.middleware.js` | Route bo'yicha opt-in |
| **Webhooks** | ? | Bor — 6 voqea, HMAC (`t=…,v1=…`), 5× retry, yetkazish jurnali + replay, SSRF darvozalari | FULL | 100 | `webhook.service.js`, `webhookQueue.js` | — |
| **SSO (JWT)** | ✓ | OIDC bor; imzolangan JWT SSO alohida yozilmadi | PARTIAL | 60 | `oidcAuth.service.js` | Ataylab — OIDC qoplaydi |
| OIDC / Entra ID | ✓ | Bor — code+PKCE, JWKS imzo tekshiruvi, nonce, discovery | FULL | 100 | `oidcClient.js`, `auth/sso/*` | — |
| SAML | ? | Yo'q — ataylab (§07 REMOVE: bu muhitda AD yo'q) | N/A | — | — | OIDC bilan qoplanadi |
| Avtomatik provisioning (JIT) | ✓ | Bor — claim → rol/bo'lim, har kirishda sync | FULL | 100 | `oidcAuth.service.js`, `ssoClaimMap.js` | JSHSHIR claim'i shart |
| HR tizimi (BambooHR/Salesforce) | ✓ | Yo'q | NONE | 0 | — | XLSX import + API |
| Zoom / Meet / Teams | ✓ | Yo'q | NONE | 0 | — | D39 |
| Albato / Zapier tipidagi | ✓ | Webhook + ommaviy API bilan ulanadi, tayyor konnektor yo'q | PARTIAL | 50 | `webhook.service.js` | Konnektor katalogi |
| Storage provider abstraksiyasi | ? | Bor (Local + S3) | OURS+ | 100 | `storage/S3StorageProvider.js` | — |
| Domain alias | ✓ | Nginx darajasida qo'lda | PARTIAL | 50 | — | — |
| **D70–D73 jami: 15 capability (+2 N/A)** | | | **FULL 7 · OURS+ 2 · PARTIAL 4 · NONE 2 · N/A 2** | **76** | | |

## D74–D79 · SECURITY / AUDIT / ADMIN / BRANDING / MEDIA / FILES

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Parol hashlash | ? | argon2id | OURS+ | 100 | `utils/hash.js` | — |
| Sessiya + refresh rotation + reuse detection | ? | Bor, va **egasiga ko'rinadi** — qurilmalar ro'yxati + tugatish | OURS+ | 100 | `session.service.js`, `SessionsCard.vue` | — |
| CSRF | ? | Double-submit | OURS+ | 100 | `csrf.middleware.js` | — |
| Brute-force / lockout / CAPTCHA | ? | Bor | OURS+ | 100 | `auth.service.js`, `captcha.service.js` | — |
| **2FA / TOTP** | ? | Bor — RFC 6238, shifrlangan sir, replay himoyasi, 10 zaxira kod | FULL | 100 | `utils/totp.js`, `twoFactor.service.js` | — |
| **Face verification** | — | Bor, 3 harakatda gate | OURS+ | 100 | `faceGate.service.js`, `FACE_GATE_ACTIONS` | — |
| **Proctoring (begona yuz)** | — | Bor | OURS+ | 100 | `proctorSnapshot.service.js` | — |
| **Kamera diqqat monitoringi** | — | Bor, 8 maydonli siyosat | OURS+ | 100 | `attentionPolicy.model.js` | — |
| Fayl darajasida kirish nazorati | ✓ | Bor | FULL | 100 | `materialAccess.service.js:19-43` | — |
| Server shifrlash (at-rest) | ✓ | Faqat backup (AES-256-GCM); jonli DB va S3 shifrlanmagan | PARTIAL | 50 | `backupCrypto.js` | DB/S3 at-rest |
| On-premise o'rnatish | ✓ | Bor (o'z serverimizda) | FULL | 100 | `docs/deployment.md` | — |
| IDOR himoyasi | ? | Bor + 3 test | OURS+ | 100 | `security.test.js` | — |
| **Hisobot PII scope'i** | ✓ | Tuzatildi — eksport chaqiruvchining doirasi bilan kesiladi | FULL | 100 | `report.controller.js:26`, `reportData.service.js` | — |
| **Leaderboard PII** | ? | Tuzatildi — JSHSHIR faqat `analytics:view:all` bilan | OURS+ | 100 | `points.service.js:116` | — |
| **Audit jurnali (yozuv)** | ? | 60+ action | OURS+ | 100 | `auditLog.model.js` | — |
| **Audit jurnali (ko'rish)** | ? | Bor — filtr, CSV eksport (oqim), o'zi ham auditlanadi | OURS+ | 100 | `audit.routes.js`, `AuditLogView.vue` | — |
| Audit TTL | ? | Bor — 730 kun | FULL | 100 | `auditLog.model.js:27` | — |
| **Backup / restore** | ✓ (SaaS) | Kunlik shifrlangan dump + 30 kun + tiklash sinovi | FULL | 100 | `jobs/backupQueue.js`, `backup.service.js`, `test/backup.test.js` | — |
| Tizim sozlamalari (DB'da) | ✓ | 2 siyosat modeli bor, umumiysi yo'q | PARTIAL | 50 | `attentionPolicy.model.js`, `facePolicy.model.js` | `Settings` singleton |
| Logo / favicon / rang | ✓ | Yo'q (Tailwind token tizimi bor) | NONE | 0 | — | `branding{}` |
| White-label | ✓ | Yo'q | NONE | 0 | — | — |
| **Markaziy media kutubxona** | ✓ | Bor — `MediaAsset`, papkalar, qidiruv, "qayerda ishlatilgan", tanlagich | FULL | 100 | `mediaLibrary.service.js`, `MediaLibraryView.vue`, `MediaPicker.vue` | Faqat rasm; video/material o'z joyida |
| Nested papkalar (media) | ✓ | Yorliq shaklida (`brand/2026`, 3 daraja) | PARTIAL | 50 | `mediaLibrary.service.js` (`normalizeFolder`) | Haqiqiy daraxt va ko'chirish yo'q |
| Orphan fayl tozalash | ? | Yo'q — kodda tan olingan qarz | VERIFY | 0 | `course.service.js:378-381` | `mediaCleanupQueue` |
| Rasm optimizatsiyasi | ? | Bor — `sharp` → WebP, 2560px chegara, thumbnail, EXIF olib tashlanadi | FULL | 100 | `imageOptimize.js` | — |
| Storage sarfi ko'rsatkichi | ? | Yo'q | VERIFY | 0 | — | — |
| **D74–D79 jami: 26 capability** | | | **FULL 8 · OURS+ 11 · PARTIAL 3 · NONE 2 · VERIFY 2** | **79** | | |

## D80–D95 · PERFORMANCE / A11Y / AUTOMATION / RECOMMENDATIONS / STANDARDS / SUITE / E-COM / ENTERPRISE

| Capability | iSp | Bizda | Status | Sc | Evidence | Gap |
|---|:--:|---|:--:|:--:|---|---|
| Kesh + queue + indeks + pagination | ? | Bor | OURS+ | 100 | Redis, BullMQ, compound indekslar | — |
| Video worker alohida jarayonda | ? | Bor | OURS+ | 100 | `worker.js`, `videoProcessingQueue.js` | — |
| Pre-aggregation dashboard | ? | Bor | OURS+ | 100 | `dashboardAggregation.js` | — |
| 150 000 foydalanuvchi miqyosi | ✓ | Hozirgi kod ~5 000 gacha | PARTIAL | 25 | N+1: `reminderJob.js:18-50`; to'liq skan: `dashboardAggregation.js:98`; leaderboard xotirada: `points.service.js:92` | Optimizatsiya + server |
| CDN | ? | Yo'q | VERIFY | 0 | — | — |
| **WCAG 2.1 AA** | ? | Audit qilinmagan; ARIA/focus-trap/alt yo'q | VERIFY | 0 | — | Manba tasdiqlanmagan |
| Subtitr (a11y) | ✓ | Bor — WebVTT + **ko'rinadigan subtitr tugmasi** va `C` klavishasi (brauzer menyusi tishcha ostida yashiradi) | FULL | 100 | `VideoPlayer.vue`, `usePlayerShortcuts.js` | Avtomatik transkripsiya yo'q |
| Avtomatik kurs biriktirish | ✓ | Publish paytida bir martalik | PARTIAL | 25 | `course.service.js:170` | `EnrollmentRule` |
| Development plan avto-biriktirish | ✓ | Yo'q | NONE | 0 | — | — |
| Avtomatik eslatmalar | ✓ | Bor (kurs + task) | PARTIAL | 50 | `reminderJob.js` | Tadbir, sertifikat, onboarding |
| Avtomatik deaktivatsiya | ? | Bor | OURS+ | 100 | `user.service.js:296` | — |
| Trash avtomatik tozalash | ? | Bor | OURS+ | 100 | `trash.service.js` (`listExpired`) | — |
| Workflow qoida dvigateli | ✓ (smart filters) | Yo'q — har biri qo'lda kodlangan | NONE | 0 | — | `AutomationRule` |
| Tavsiyalar | ? | Faqat `continueLearning` | PARTIAL | 25 | `HomeView.vue` | `recommendation.service` |
| **SCORM 1.2 / 2004 import** | ✓ | Bor — import, manifest o'qish, runtime API (1.2 va 2004), CMI holati, suspend/resume, mastery | PARTIAL | 75 | `extractScorm.js`, `scormPlayerPage.js`, `scormCmi.js` | Sequencing va ko'p-SCO yo'q |
| **xAPI** | ✓ | Yo'q | NONE | 0 | — | LRS endpoint |
| cmi5 | ? | Yo'q | N/A | — | — | §24 |
| PowerPoint add-in (desktop) | ✓ (Suite) | Yo'q | N/A | — | — | §24 |
| Ekran yozib olish | ? | Yo'q | VERIFY | 0 | — | — |
| Transkripsiya | ? | Yo'q | VERIFY | 0 | — | — |
| Role play / dialog simulyatsiya | ? | Yo'q | VERIFY | 0 | — | — |
| E-commerce | ? | Yo'q | N/A | — | — | §24 |
| Multi-tenant (organization izolyatsiyasi) | ✓ | Yo'q | N/A | — | — | §24 |
| 24/7 support + SLA | ✓ | — | N/A | — | — | Mahsulot emas, xizmat |
| **D80–D95 jami: 19 capability** | | | **FULL 1 · OURS+ 5 · PARTIAL 5 · NONE 3 · VERIFY 5** | **42** | | |

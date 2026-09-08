# 2. TO'LIQ FEATURE MATRITSASI — iSpring vs Qo'llanma

**Ustunlar:** `iSp` = iSpring'da bor · `Biz` = bizda bor (✅ to'liq / ◐ qisman / ✖ yo'q)
**Amal:** `KEEP` (tegmaymiz) · `EXTEND` (kengaytiramiz) · `ADD` (yangi) · `REFACTOR` (qayta quramiz)
**Prio:** CRITICAL / HIGH / MEDIUM / LOW
**CX (murakkablik):** S = ≤2 kun · M = 3–7 kun · L = 2–3 hafta · XL = 1+ oy (bitta dasturchi uchun)

---

## 2.1 COURSE MANAGEMENT

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Kurs yaratish | ✅ | ✅ | `course.service.create`, `POST /courses` | — | — | KEEP | — | — | — | — | — |
| Kurs tahrirlash | ✅ | ✅ | `PATCH /courses/:id`, `CourseDetailView` | — | — | KEEP | — | — | — | — | — |
| Publish / unpublish | ✅ | ✅ | `status` DRAFT/PUBLISHED, publish'da auto-assign | — | — | KEEP | — | — | — | — | — |
| DRAFT/PUBLISHED/ARCHIVED | ✅ | ✅ | `course.model.status` enum + `POST /:id/archive` | — | — | KEEP | — | — | — | — | — |
| Soft delete + trash + restore | ◐ | ✅ | `deletedAt/deletedBy`, `trash.service`, `TrashView` | iSpring'da 30-kunlik trash yo'q — **bizda yaxshiroq** | — | KEEP | — | — | — | — | — |
| Kurs kategoriyalari | ✅ | ✖ | Yo'q | Katalog qurib bo'lmaydi | CRITICAL | ADD | `category.service` | Katalog filtri, kategoriya CRUD | `+CourseCategory` model, `course.categoryId` | `/course-categories` CRUD, `?categoryId` | M |
| Kurs description | ✅ | ✅ | `course.description` (plain text) | Rich text yo'q | LOW | EXTEND | sanitize | rich editor | — | — | S |
| Cover image + banner | ✅ | ✅ | `cover`, `banner` + `ImageUploadField` | — | — | KEEP | — | — | — | — | — |
| Instructor / author | ✅ | ◐ | Faqat `createdBy` | Ko'rinadigan "muallif" profili yo'q | HIGH | EXTEND | — | Kurs sahifasida muallif kartasi | `course.authorIds[]`, `course.instructorId` | `?authorId` | S |
| Kurs davomiyligi | ✅ | ◐ | `topic.duration` (video yig'indisi) | Kurs darajasida yo'q, material/test hisobga olinmaydi | MEDIUM | EXTEND | `recomputeCourseDuration()` | Katalogda ko'rsatish | `course.estimatedMinutes` | — | S |
| Difficulty level | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | Select + filtr | `course.level` enum | `?level` | S |
| Tags | ✅ | ✖ | Faqat `news.tags` bor | Kurslarda yo'q | HIGH | ADD | — | Tag input + filtr | `course.tags[]` + index | `?tags` | S |
| Prerequisites | ✅ | ✖ | Yo'q | Kurslar orasida bog'liqlik yo'q | HIGH | ADD | `prerequisiteGate.js` | Bloklangan kurs holati | `course.prerequisiteCourseIds[]` | `GET /:id/eligibility` | M |
| Course visibility | ✅ | ✅ | `courseVisibility.js` — role AND branch AND department | iSpring'da faqat guruh — **bizda kuchliroq** | — | KEEP | — | — | — | — | — |
| Enrollment rules | ✅ | ◐ | Qo'lda + guruh + publish'da auto-assign | Qoidaga asoslangan avto-yozilish yo'q | HIGH | EXTEND | `enrollmentRule.service` | Qoida builder | `+EnrollmentRule` model | `/enrollment-rules` | L |
| Self-enrollment | ✅ | ✅ | `POST /courses/:id/enroll` | — | — | KEEP | — | — | — | — | — |
| Course expiration | ✅ | ◐ | `courseAssignment.expiresAt` (per-user) | Kurs darajasida "amal qilish muddati" yo'q | MEDIUM | EXTEND | — | — | `course.validityDays` | — | S |
| Course completion rules | ✅ | ◐ | Barcha item'lar o'rtachasi (`course.service:116`) | Sozlanmaydi: "hamma majburiy item + test o'tilishi" kabi qoida yo'q | HIGH | EXTEND | `completionRule.js` | Sozlash formasi | `course.completionRule{}` | — | M |
| Sequential navigation | ✅ | ✅ | `courseSequence.js`, token berishda majburlanadi | **iSpring'dan kuchliroq** (server-side) | — | KEEP | — | — | — | — | — |
| Free navigation | ✅ | ◐ | Kod bor, lekin yoqib/o'chirib bo'lmaydi | Toggle yo'q | MEDIUM | EXTEND | flag o'qish | Toggle | `course.navigationMode` enum | — | S |
| Chapter/module structure | ✅ | ✅ | `Topic` (order, status, duration) | — | — | KEEP | — | — | — | — | — |
| Lesson structure | ✅ | ✅ | Video / Material / Assessment, `topicContent.service` | Text lesson yo'q (§2.2 ga q.) | — | KEEP | — | — | — | — | — |
| Course versioning | ✅ | ✖ | Yo'q | Kurs o'zgarsa, tugatganlar nima bo'ladi — javob yo'q | MEDIUM | ADD | `courseVersion.service` | Versiyalar tarixi | `+CourseVersion` snapshot | `GET /:id/versions` | L |
| Course duplication | ✅ | ✖ | Yo'q | Har safar noldan | HIGH | ADD | `course.duplicate()` deep-copy | "Nusxa olish" tugmasi | — | `POST /:id/duplicate` | M |
| Course search | ✅ | ◐ | `RegExp` title bo'yicha (`course.repository:91`) | Description/tag/kontent bo'yicha yo'q | HIGH | REFACTOR | `$text` yoki Atlas Search | — | text index | `?q=` | M |
| Filtering / sorting | ✅ | ◐ | status, branch bo'yicha | Kategoriya/teg/daraja/muallif yo'q | HIGH | EXTEND | filtr kengaytirish | Filtr paneli | — | query params | S |
| Course preview | ✅ | ◐ | Admin DRAFT'ni ko'radi | "Xodim ko'zi bilan" rejimi yo'q | MEDIUM | ADD | `?preview=learner` | Preview banner | — | — | S |
| Course analytics | ✅ | ✅ | `dashboardAggregation`, `course-progress` hisoboti | — | — | KEEP | — | — | — | — | — |
| Completion tracking | ✅ | ✅ | `CourseAssignment.status` + progress hisoblash | — | — | KEEP | — | — | — | — | — |
| Progress tracking | ✅ | ✅ | `VideoProgress` + `MaterialProgress` + attempt'lar | **iSpring'dan aniqroq** | — | KEEP | — | — | — | — | — |

## 2.2 CONTENT TYPES

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Video lesson | ✅ | ✅ | tus upload → ffmpeg HLS → signed token | **iSpring'dan himoyalanganroq** | — | KEEP | — | — | — | — | — |
| Text lesson | ✅ | ✖ | Yo'q — har bir dars fayl bo'lishi shart | Eng arzon kontent turi yo'q | CRITICAL | ADD | `lesson.service` | Rich text editor + reader | `+Lesson` model (`contentHtml`, `estimatedMinutes`) | `/topics/:id/lessons` CRUD | M |
| Audio lesson | ✅ | ✅ | `Material` type=MULTIMEDIA (mp3/wav/ogg/opus/m4a) | Progress trekingi audio uchun sahifa-asosli (noto'g'ri) | MEDIUM | EXTEND | audio progress = tinglangan sekundlar | Audio player | `materialProgress.playedSeconds` | — | S |
| PDF | ✅ | ✅ | `Material` FILE, `pdfjs` viewer, sahifa progressi | — | — | KEEP | — | — | — | — | — |
| DOC/DOCX | ✅ | ✅ | `Material` FILE, `mammoth` render | — | — | KEEP | — | — | — | — | — |
| PPT/PPTX | ✅ | ✅ | `Material` PRESENTATION, `pptx-preview` + `pptxRepair` | — | — | KEEP | — | — | — | — | — |
| XLS/XLSX | ✅ | ◐ | Yuklanadi (`FILE`), lekin viewer yo'q | Faqat yuklab olish | LOW | EXTEND | — | `exceljs` bilan jadval ko'rsatish | — | — | S |
| Image kontent | ✅ | ◐ | Faqat cover/banner | Dars sifatida rasm yo'q | LOW | ADD | — | Lesson block'da | Lesson blocks | — | S |
| External URL | ✅ | ✖ | Yo'q | Tashqi resursga havola bo'lmaydi | MEDIUM | ADD | URL validatsiya | Link kartasi | `+ContentItem` type=LINK | — | S |
| Embedded content (iframe) | ✅ | ✖ | Yo'q | YouTube/Vimeo/Miro qo'yib bo'lmaydi | MEDIUM | ADD | allowlist'li embed | Sandboxed iframe | type=EMBED | — | M |
| SCORM 1.2 | ✅ | ✖ | Yo'q | Tashqi kurslar import qilinmaydi | HIGH | ADD | SCORM runtime (`scorm.service`, CMI data model) | SCORM player iframe + API adapter | `+ScormPackage`, `+ScormState` | `/scorm/*` | XL |
| SCORM 2004 | ✅ | ✖ | Yo'q | — | HIGH | ADD | sequencing subset | — | — | — | XL |
| xAPI (Tin Can) | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | LRS endpoint (statements) | — | `+XapiStatement` | `/xapi/statements` | L |
| cmi5 | ✅ | ✖ | Yo'q | **Ataylab qoldiriladi** — §1.5 | LOW | — | — | — | — | — | — |
| HTML5 content package | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | zip ochish + serve | iframe | `+ContentPackage` | — | M |
| Downloadable resources | ✅ | ✅ | `GET /materials/:id/download-url` | ⚠️ presigned URL loopback host bilan imzolanadi — **buzilgan** | CRITICAL | REFACTOR | Alohida public media host **yoki** API proxy stream | — | — | — | S |
| Attachments | ✅ | ✅ | Task, news, chat'da bor | Kurs darajasida yo'q | LOW | EXTEND | — | — | `course.attachments[]` | — | S |
| Assignments (uy vazifasi) | ✅ | ✖ | `Task` bor, lekin topshirish/baholash yo'q | §2.13 ga qarang | HIGH | ADD | — | — | — | — | L |
| Quizzes | ✅ | ◐ | `Quiz` (video) + `Assessment` (topic) | §2.5 ga qarang | CRITICAL | REFACTOR | — | — | — | — | XL |
| Knowledge check (baholanmaydigan) | ✅ | ✖ | Yo'q | Video ichida tez savol yo'q | MEDIUM | ADD | `quiz.gradingMode=PRACTICE` | Video overlay | `+timestamp` maydoni | — | M |
| Simulations / role-play | ✅ | ✖ | Yo'q | §2.38 (Phase 7) | LOW | ADD | — | — | — | — | XL |

## 2.3 COURSE BUILDER

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Brauzerdagi kurs builder | ✅ | ◐ | `CourseBuilderView` = 4 qadamli sehrgar (basics/media/access/review) — **kontent builder emas** | Kontent `CourseDetailView`'dan alohida qo'shiladi | HIGH | EXTEND | — | Yagona builder ekrani | — | — | L |
| Drag-and-drop tartiblash | ✅ | ✖ | `order` maydoni bor, lekin UI'da sudrash yo'q | Tartib qo'lda raqam bilan | HIGH | ADD | `PATCH /topics/:id/reorder` (batch) | Sortable list | — | reorder endpoint | M |
| Chapters / sections | ✅ | ✅ | `Topic` | Ichki bo'lim (sub-section) yo'q | LOW | — | — | — | — | — | — |
| Bloklar (text/image/video/file/embed/quiz) | ✅ | ✖ | Yo'q — dars = bitta fayl | Aralash dars qurib bo'lmaydi | HIGH | ADD | `lesson.blocks[]` JSON | Block editor | `Lesson.blocks[]` | — | L |
| Qayta ishlatiladigan bloklar | ✅ | ✖ | Yo'q | — | LOW | ADD | — | — | `+BlockTemplate` | — | M |
| Course preview | ✅ | ◐ | Admin DRAFT ko'radi | Learner rejimi yo'q | MEDIUM | EXTEND | — | Preview toggle | — | — | S |
| Responsive layout | ✅ | ✅ | Tailwind, mobil grid, `BottomNav` | — | — | KEEP | — | — | — | — | — |
| Mobil player | ✅ | ✅ | `hls.js` + `VideoPlayer.vue` | — | — | KEEP | — | — | — | — | — |
| Custom font / rang / branding | ✅ | ◐ | Tailwind token'lar, dark/light | Tenant sozlamasi yo'q | MEDIUM | ADD | §2.33 | — | `+BrandingSettings` | — | M |
| Progress indicator + foiz | ✅ | ✅ | `ProgressBar`, `ProgressRing`, kurs foizi | — | — | KEEP | — | — | — | — | — |
| Bloklangan boblar / prerequisite bob | ✅ | ✅ | `computeLockState` | — | — | KEEP | — | — | — | — | — |
| Draft saqlash | ✅ | ✅ | `status: DRAFT` | — | — | KEEP | — | — | — | — | — |
| Autosave | ✅ | ✖ | Yo'q | Uzoq formada ish yo'qoladi | MEDIUM | ADD | `PATCH` debounce | `useAutosave` composable | `+draftJson` | — | S |
| Version history | ✅ | ✖ | Yo'q | §2.1 course versioning | MEDIUM | ADD | — | — | — | — | L |

## 2.4 AI COURSE CREATION

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AI course generator | ✅ | ✖ | Yo'q | — | HIGH | ADD | `aiCourse.service` (Claude) + BullMQ job | Generator sehrgari | `+AiGenerationJob` | `POST /ai/courses/generate` | L |
| Manba fayl yuklash (PDF/DOC/PPT) | ✅ | ✖ | Yo'q | — | HIGH | ADD | Matn ajratish (pdf/docx/pptx) | Upload + progress | `AiGenerationJob.sourceKeys[]` | — | M |
| Struktura generatsiyasi | ✅ | ✖ | Yo'q | — | HIGH | ADD | Structured output (tool use) | Struktura tahriri | — | — | M |
| Dars matni generatsiyasi | ✅ | ✖ | Yo'q | Text lesson modeliga bog'liq | HIGH | ADD | — | — | — | — | M |
| Knowledge check / quiz generatsiyasi | ✅ | ✖ | Yo'q | Yangi Question modeliga bog'liq | HIGH | ADD | `aiQuiz.service` | "AI bilan yaratish" | — | `POST /ai/quizzes/generate` | M |
| Rasm generatsiyasi | ✅ | ✖ | Yo'q | Claude rasm chizmaydi | LOW | ADD | Tashqi provider | — | — | — | M |
| AI matn yozish / qayta yozish | ✅ | ◐ | AI chat bor, lekin editorga ulanmagan | Kontentga yozmaydi | MEDIUM | EXTEND | `aiText.service` | Editor ichida "AI" tugmasi | — | `POST /ai/text/transform` | S |
| AI xulosalash | ✅ | ◐ | Chat orqali so'rash mumkin | Avtomatik emas | MEDIUM | EXTEND | — | — | — | — | S |
| AI tarjima | ✅ | ✖ | Yo'q | uz/ru/en kontent qo'lda | HIGH | ADD | `aiTranslate.service` + struktura saqlash | Til tanlagich | `+ContentTranslation` | `POST /ai/translate` | L |
| Ko'p tilli kurs generatsiyasi | ✅ | ✖ | UI 3 tilli, **kontent bir tilli** | — | HIGH | ADD | — | — | `course.translations{}` | — | L |
| Bo'lim/blokni qayta generatsiya | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | — | — | — | S |
| Editor ichidagi AI yordamchi | ✅ | ✖ | AI chat faqat xodim tomonida | — | MEDIUM | EXTEND | mavjud `aiChat` qayta ishlatiladi | Admin panelida panel | — | — | S |
| Publish oldidan inson tekshiruvi | ✅ | ✅ | Har doim `DRAFT` bilan boshlanadi | **Arxitektura darajasida ta'minlangan** | — | KEEP | — | — | — | — | — |

## 2.5 QUIZ VA ASSESSMENT

> ⚠️ **Bu domen butunlay REFACTOR talab qiladi.** Hozir ikkita deyarli bir xil
> model (`Quiz` — video ostida, `Assessment` — topic ostida) bor va ikkalasi
> ham faqat **bitta to'g'ri javobli MCQ**ni qo'llab-quvvatlaydi
> (`quiz.service.js:56` — `correctCount !== 1` bo'lsa xato beradi).
> Savol turi qo'shish uchun har ikkala modelni ham o'zgartirish kerak bo'ladi.

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Multiple choice (1 javob) | ✅ | ✅ | `quiz`/`assessment` `options[].isCorrect` | — | — | KEEP | — | — | — | — | — |
| Multiple response (ko'p javob) | ✅ | ✖ | Kod ataylab 1 ta javobga majburlaydi | — | CRITICAL | REFACTOR | Yagona `Question` modeli | Yangi editor | `+Question` (polimorf `type`) | `/questions` | L |
| True/False | ✅ | ✖ | MCQ bilan taqlid qilinadi | — | HIGH | ADD | — | — | `type=TRUE_FALSE` | — | S |
| Short answer | ✅ | ✖ | Yo'q | — | HIGH | ADD | Normalizatsiya + alternativalar | Matn input | `type=SHORT_ANSWER` | — | M |
| Essay (qo'lda baholanadi) | ✅ | ✖ | Yo'q | — | HIGH | ADD | Baholash oqimi | Grading UI | `type=ESSAY`, `+GradingTask` | `/grading` | L |
| Numeric answer (tolerans bilan) | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | — | `type=NUMERIC` | — | S |
| Matching | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | Drag UI | `type=MATCHING` | — | M |
| Sequence / tartib | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | Sortable | `type=SEQUENCE` | — | M |
| Drag-and-drop | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | — | `type=DRAG_DROP` | — | M |
| Fill in the blanks | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | Template parser | — | `type=FILL_BLANK` | — | M |
| Select from list | ✅ | ✖ | Yo'q | — | LOW | ADD | — | — | `type=SELECT_LIST` | — | S |
| Hotspot | ✅ | ✖ | Yo'q | — | LOW | ADD | — | Canvas | `type=HOTSPOT` | — | M |
| Likert shkalasi | ✅ | ✖ | Yo'q | 360°/so'rovnoma uchun kerak | MEDIUM | ADD | — | — | `type=LIKERT` | — | S |
| Drag words | ✅ | ✖ | Yo'q | — | LOW | ADD | — | — | `type=DRAG_WORDS` | — | M |
| Savol banki | ✅ | ✖ | Savollar test ichiga embed qilingan | Qayta ishlatib bo'lmaydi | CRITICAL | REFACTOR | `questionBank.service` | Bank sahifasi | `+QuestionBank`, `+Question` (alohida kolleksiya) | `/question-banks` | L |
| Savol pool + tasodifiy tanlash | ✅ | ✖ | Yo'q | Har kim bir xil testni ko'radi | CRITICAL | ADD | `pickQuestions()` | — | `quiz.pools[]{bankId,count}` | — | M |
| Savollarni aralashtirish | ✅ | ✖ | Yo'q | — | HIGH | ADD | Seed'li shuffle (attempt ichida barqaror) | — | `quiz.shuffleQuestions` | — | S |
| Javoblarni aralashtirish | ✅ | ✖ | Yo'q | — | HIGH | ADD | — | — | `quiz.shuffleOptions` | — | S |
| O'tish bali | ✅ | ✅ | `passScorePercent` (default 70) | — | — | KEEP | — | — | — | — | — |
| Urinishlar soni chegarasi | ✅ | ✖ | **Cheklanmagan** — cheksiz qayta topshirish | Test qiymatini yo'qotadi | CRITICAL | ADD | `assertAttemptsLeft()` | Qolgan urinishlar | `quiz.maxAttempts` | 409 javob | S |
| Vaqt chegarasi | ✅ | ◐ | `Assessment`da bor (15 daq, **hardcoded**), `Quiz`da yo'q | Sozlanmaydi | HIGH | EXTEND | konstantani maydonga ko'chirish | Input | `quiz.timeLimitMinutes` | — | S |
| Salbiy ball | ✅ | ✖ | Yo'q | — | LOW | ADD | — | — | `question.penalty` | — | S |
| Savolga ball berish (weight) | ✅ | ✖ | Har bir savol teng | — | HIGH | ADD | Weighted scoring | — | `question.points` | — | S |
| Qisman ball | ✅ | ✖ | Yo'q | Multi-response uchun majburiy | HIGH | ADD | `partialCredit()` | — | `quiz.partialCredit` | — | M |
| Javob izohlari | ✅ | ✖ | Yo'q | O'quv qiymati yo'qoladi | HIGH | ADD | — | Natija sahifasida | `question.explanation` | — | S |
| To'g'ri/noto'g'ri feedback | ✅ | ◐ | Faqat natija foizi + admin drill-down | Talabaga savol-ba-savol ko'rsatilmaydi | HIGH | EXTEND | `revealMode` | Natija ekrani | `quiz.revealMode` enum | — | S |
| Har bir javobga feedback | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | — | `option.feedback` | — | S |
| Qayta topshirish | ✅ | ✅ | Cheksiz (chegara yo'q) | Chegara qo'yish kerak | — | EXTEND | yuqoriga q. | — | — | — | — |
| Tugatish qoidalari | ✅ | ◐ | Video quiz videoni tugatishni talab qiladi | Boshqa qoidalar yo'q | MEDIUM | EXTEND | — | — | `quiz.unlockRule` | — | S |
| Test analitikasi | ✅ | ◐ | `getAttemptsForUser` drill-down bor | Savol-ba-savol qiyinlik statistikasi yo'q | HIGH | EXTEND | `questionStats` aggregation | Statistika sahifasi | — | `GET /quizzes/:id/stats` | M |
| Urinishlar tarixi | ✅ | ✅ | `QuizAttempt` / `AssessmentAttempt` | — | — | KEEP | — | — | — | — | — |
| Batafsil javob tahlili | ✅ | ✅ | `quiz.service.getAttemptsForUser` | Faqat admin ko'radi | — | KEEP | — | — | — | — | — |
| O'rtacha / eng yuqori / oxirgi ball | ✅ | ◐ | Attempt'lar bor, aggregatsiya yo'q | Qaysi ball hisobga olinishi sozlanmaydi | HIGH | ADD | `scoringPolicy` | — | `quiz.scorePolicy` enum | — | S |
| Pass/fail statusi | ✅ | ✅ | `attempt.passed` | — | — | KEEP | — | — | — | — | — |
| Server tomonda taymer + focus-loss | ✖ | ✅ | `assessmentSession` — **iSpring'da yo'q** | Quiz'ga ham kengaytirish kerak | — | KEEP+EXTEND | quiz'ga ko'chirish | — | — | — | S |
| Proctoring (kamera) | ✖ | ✅ | `proctorSnapshot` — **iSpring'da yo'q** | — | — | KEEP | — | — | — | — | — |

## 2.6 LEARNING PATHS

> **Butun domen yo'q.** Kod bazasida `learningPath`, `program`, `path` — hech
> qanday model, route yoki view topilmadi.

| Feature | iSp | Biz | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Learning path / dastur | ✅ | ✖ | Butunlay yo'q | CRITICAL | ADD | `learningPath.service` | `PathsListView`, `PathDetailView`, `PathBuilderView` | `+LearningPath` | `/learning-paths` CRUD | L |
| Bir path ichida ko'p kurs | ✅ | ✖ | — | CRITICAL | ADD | — | — | `path.items[]{type,refId,order,required}` | — | — |
| Path ichida boblar | ✅ | ✖ | — | HIGH | ADD | — | — | `path.sections[]` | — | M |
| Majburiy / ixtiyoriy kurs | ✅ | ✖ | — | HIGH | ADD | — | — | `item.required` | — | S |
| Kurs tartibi | ✅ | ✖ | — | HIGH | ADD | — | Drag reorder | `item.order` | — | S |
| Ketma-ket tugatish | ✅ | ✖ | Kurs ichida bor, path'da yo'q | HIGH | ADD | `pathSequence.js` (`courseSequence` naqshi) | Lock ko'rsatkichi | `path.sequential` | — | M |
| Prerequisites | ✅ | ✖ | — | HIGH | ADD | — | — | `item.prerequisiteIds[]` | — | M |
| Path progress foizi | ✅ | ✖ | — | CRITICAL | ADD | `pathProgress.service` | Progress ring | `+PathEnrollment` | `GET /:id/progress` | M |
| Path deadline | ✅ | ✖ | — | HIGH | ADD | reminder job'ga ulash | — | `PathEnrollment.deadline` | — | S |
| Avtomatik yozilish | ✅ | ✖ | — | HIGH | ADD | `enrollmentRule` | — | — | — | M |
| Rol / bo'lim / lavozim asosida path | ✅ | ✖ | Kurslarda `targetRoles/branches/department` bor — shu naqsh ko'chiriladi | HIGH | ADD | `courseVisibility.js` qayta ishlatiladi | — | `path.targetRoles/branches/department` | — | S |
| Onboarding path | ✅ | ✖ | §2.10 | HIGH | ADD | — | — | `path.kind=ONBOARDING` | — | — |
| Sertifikatsiya path | ✅ | ✖ | Sertifikatga bog'liq | HIGH | ADD | — | — | `path.certificateTemplateId` | — | — |
| Development path | ✅ | ✖ | §2.11 | MEDIUM | ADD | — | — | `path.kind=DEVELOPMENT` | — | — |

## 2.7 USER MANAGEMENT

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Foydalanuvchi yaratish | ✅ | ✅ | `POST /users`, `EmployeeFormFields` | Ochiq ro'yxatdan o'tish yo'q (**ataylab**) | — | KEEP | — | — | — | — | — |
| Login / logout | ✅ | ✅ | JSHSHIR yoki passport seriyasi + parol | — | — | KEEP | — | — | — | — | — |
| Parolni tiklash | ✅ | ◐ | `POST /auth/password-reset/{request,confirm}` mavjud | ⚠️ **Token faqat logga yoziladi** (`auth.service:212`) — e-mail yo'q, ya'ni amalda ishlamaydi | CRITICAL | EXTEND | `mail.service` ulash | — | — | — | S |
| E-mail tasdiqlash | ✅ | ✖ | Yo'q | E-mail ixtiyoriy maydon | MEDIUM | ADD | Verify token | Verify sahifasi | `user.emailVerifiedAt` | `/auth/verify-email` | S |
| Profil | ✅ | ✅ | `SettingsView`, `GET /users/me` | O'zini tahrirlash cheklangan | LOW | EXTEND | — | — | — | `PATCH /users/me` | S |
| Avatar | ✅ | ✅ | `user.avatar` + `ImageUploadField` | — | — | KEEP | — | — | — | — | — |
| Telefon / lavozim / bo'lim / joylashuv | ✅ | ✅ | `phone`, `position`, `department`, `branch`, `subdivision`, `country`, `address` | **iSpring'dan boy** | — | KEEP | — | — | — | — | — |
| Manager (rahbar) | ✅ | ✖ | Yo'q | Ierarxiya qurib bo'lmaydi, manager dashboard imkonsiz | CRITICAL | ADD | `orgHierarchy.service` | Rahbar tanlash | `user.managerId` + index | `?managerId` | M |
| Employee ID (tabel raqami) | ✅ | ◐ | JSHSHIR bor | Ichki tabel raqami alohida emas | LOW | ADD | — | — | `user.employeeNumber` | — | S |
| Active / inactive | ✅ | ✅ | `isActive` + `terminationDate` avtomatik deaktivatsiya | **iSpring'dan aniqroq** | — | KEEP | — | — | — | — | — |
| Foydalanuvchi guruhlari | ✅ | ✅ | `Group` (a'zolar + kurslar) | Dinamik (qoidali) guruh yo'q | HIGH | EXTEND | `dynamicGroup.service` | Qoida builder | `group.rule{}`, `group.type` | — | M |
| Rollar | ✅ | ✅ | `roles` kolleksiyasi, dinamik | — | — | KEEP | — | — | — | — | — |
| Custom fields | ✅ | ✖ | Yo'q | Har bir yangi maydon = deploy | MEDIUM | ADD | `customField.service` | Dinamik forma | `+CustomFieldDef`, `user.customFields{}` | `/custom-fields` | M |
| Bulk import (XLSX) | ✅ | ✖ | Yo'q | 500 xodim qo'lda kiritiladi | CRITICAL | ADD | `userImport.service` (`exceljs` bor) + dry-run | Import sehrgari + xato hisoboti | `+ImportJob` | `POST /users/import` | M |
| Bulk update | ✅ | ◐ | `bulk/message`, `bulk/deactivate`, guruh bulk | Maydonlarni ommaviy o'zgartirish yo'q | HIGH | EXTEND | `bulkUpdate()` | Bulk bar (mavjud `UserBulkActionsBar`) | — | `POST /users/bulk/update` | S |
| Bulk deactivate | ✅ | ✅ | `POST /users/bulk/deactivate` | — | — | KEEP | — | — | — | — | — |
| Qidiruv / filtrlar | ✅ | ✅ | `user.repository.buildFilter` — 8 o'lcham | — | — | KEEP | — | — | — | — | — |
| Faoliyat (activity) | ✅ | ✅ | `GET /users/:id/activity`, `EmployeeActivityTab` | — | — | KEEP | — | — | — | — | — |
| Progress / kurs tarixi | ✅ | ✅ | `EmployeeCoursesTab`, `learning-stats`, `performance` | **iSpring'dan chuqurroq** | — | KEEP | — | — | — | — | — |
| Sertifikatlar | ✅ | ✖ | Yo'q | §2.18 | CRITICAL | ADD | — | — | — | — | — |
| Tashqi sertifikatlar | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | `externalCertificate.service` | Yuklash formasi | `+ExternalCertificate` | `/users/:id/external-certificates` | M |
| Sertifikat muddati / qayta o'qitish | ✅ | ✖ | Yo'q | §2.43 compliance | HIGH | ADD | reminder job | — | — | — | M |

## 2.8 ROLLAR VA RUXSATLAR

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Super Admin | ✅ | ✅ | Seed'lanadi, `/bos` faqat unga ochiq | — | — | KEEP | — | — | — | — | — |
| Admin | ✅ | ✅ | `ADMIN` roli, 22 ruxsat | ⚠️ **`/bos` UI yopiq, API ochiq** (HOLAT.md'da hal qilinmagan qaror) | HIGH | REFACTOR | Ruxsatlarni UI bilan moslashtirish | — | roles seed | — | S |
| Organization Admin | ✅ | ✖ | Yo'q — tenant tushunchasi yo'q | Ko'p-tashkilotli emas | MEDIUM | ADD | `orgScope` middleware | — | `+Organization`, hamma modelga `orgId` | — | XL |
| Instructor / Author | ✅ | ✖ | Yo'q — faqat `createdBy` | Kurs mualliflari alohida rol emas | HIGH | ADD | `AUTHOR` roli + `course.authorIds` | Rol tanlash | roles seed | — | S |
| Manager | ✅ | ◐ | `MANAGER` roli bor | `user.managerId` yo'qligi sabab **o'z jamoasi** deb narsa yo'q; scope = department | CRITICAL | EXTEND | `resolveManagedUserIds()` | Manager dashboard | `user.managerId` | `?scope=my-team` | M |
| Mentor | ✅ | ✖ | Yo'q | Onboarding/OJT uchun kerak | HIGH | ADD | `MENTOR` roli | — | roles seed + `onboarding.mentorId` | — | S |
| Learner | ✅ | ✅ | `EMPLOYEE`, `CALL_OPERATOR`, `SELLER` | — | — | KEEP | — | — | — | — | — |
| Custom rollar | ✅ | ✅ | `POST /roles` — **kod o'zgartirmasdan** | **iSpring'dan moslashuvchan** | — | KEEP | — | — | — | — | — |
| Granular ruxsatlar | ✅ | ◐ | 24 ta ruxsat kaliti | Yangi domenlar uchun ~40 ta kalit yetishmaydi | HIGH | EXTEND | `PERMISSIONS` kengaytirish | Ruxsat matritsasi UI | roles seed migratsiya | — | M |
| Ruxsat matritsasi UI | ✅ | ✖ | Rollar API'si bor, UI yo'q | Rol tahriri faqat API orqali | HIGH | ADD | — | `RolesView` + checkbox grid | — | `PATCH /roles/:id` | M |
| Resource-level tekshiruv | ✅ | ✅ | `courseAssignmentAccess`, `videoAccess`, `materialAccess` | — | — | KEEP | — | — | — | — | — |
| Tashkilot / bo'lim / guruh darajasidagi kirish | ✅ | ◐ | Kurs uchun bor (`courseVisibility`) | Foydalanuvchi ro'yxati uchun manager scope'i yo'q | HIGH | EXTEND | `scopeUsersForActor()` | — | — | — | M |
| Author / review ruxsatlari | ✅ | ✖ | Yo'q | Kontent tasdiqlash oqimi yo'q | MEDIUM | ADD | `contentReview.service` | Review navbati | `course.reviewState` | `/courses/:id/review` | M |

## 2.9 TASHKILIY TUZILMA

| Feature | iSp | Biz | Hozirgi implementatsiya | Gap | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Filiallar (branch) | ✅ | ✅ | `Branch` kolleksiyasi + CRUD + `BranchesListView` | — | — | KEEP | — | — | — | — | — |
| Bo'limlar (department) | ✅ | ✅ | `OrgList` type=DEPARTMENT | Nom bo'yicha bog'lanadi, ID emas | LOW | — | — | — | — | — | — |
| Subdivision (jamoa) | ✅ | ✅ | `user.subdivision` + `OrgList` | — | — | KEEP | — | — | — | — | — |
| Guruhlar | ✅ | ✅ | `Group` | — | — | KEEP | — | — | — | — | — |
| Lavozimlar | ✅ | ✅ | `OrgList` type=POSITION | — | — | KEEP | — | — | — | — | — |
| Rahbarlar (manager) | ✅ | ✖ | **Yo'q** | Butun ierarxiya yo'qligining sababi | CRITICAL | ADD | `orgHierarchy.service` (rekursiv) | — | `user.managerId` | `GET /org/hierarchy` | M |
| Tashkiliy ierarxiya | ✅ | ✖ | Tekis: branch → department → subdivision (nomlar) | Daraxt yo'q | HIGH | ADD | `$graphLookup` | — | `user.managerId` | — | M |
| Interaktiv org chart | ✅ | ✖ | Yo'q | — | MEDIUM | ADD | — | `OrgChartView` (SVG/canvas) | — | `GET /org/chart` | M |
| Bo'limga asoslangan ruxsat | ✅ | ◐ | Kurs targeting'ida bor | Foydalanuvchi/hisobot scope'ida yo'q | HIGH | EXTEND | — | — | — | — | M |
| Bo'limga kurs biriktirish | ✅ | ✅ | `course.department` + guruh | — | — | KEEP | — | — | — | — | — |
| Filial bo'yicha hisobot | ✅ | ◐ | `GET /users/branches/overview` bor | Hisobot filtrlarida branch yo'q | HIGH | EXTEND | `reportData` filtriga qo'shish | Filtr | — | `?branch=` | S |
| Manager dashboard | ✅ | ✖ | Yo'q — faqat SUPERADMIN dashboard'i | Menejer o'z jamoasini ko'rmaydi | CRITICAL | ADD | `managerDashboard.service` | `ManagerDashboardView` | — | `GET /dashboard/team` | L |
| Xodimlar ierarxiyasi | ✅ | ✖ | Yo'q | — | HIGH | ADD | — | — | — | — | — |

## 2.10 ONBOARDING

> **Butun domen yo'q.**

| Feature | iSp | Biz | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|
| Xodim onboarding'i | ✅ | ✖ | HIGH | ADD | `onboarding.service` | `OnboardingView` (xodim), `OnboardingAdminView` | `+OnboardingProgram`, `+OnboardingEnrollment` | `/onboarding/*` | L |
| Onboarding shablonlari | ✅ | ✖ | HIGH | ADD | — | Shablon builder | `OnboardingProgram.template` | — | M |
| Checklist | ✅ | ✖ | HIGH | ADD | — | Checklist UI | `program.steps[]{type,refId,dueDays}` | — | M |
| Rol / bo'limga asoslangan | ✅ | ✖ | HIGH | ADD | `courseVisibility` naqshi | — | `program.targetRoles/department/position` | — | S |
| Onboarding kurslari | ✅ | ✖ | HIGH | ADD | LearningPath'ni qayta ishlatish | — | `step.type=COURSE` | — | S |
| Onboarding vazifalari | ✅ | ✖ | HIGH | ADD | `Task` fan-out qayta ishlatiladi | — | `step.type=TASK` | — | S |
| Deadline / milestone | ✅ | ✖ | HIGH | ADD | `hireDate + dueDays` | Timeline | `step.dueDays` | — | M |
| Mentor / manager biriktirish | ✅ | ✖ | HIGH | ADD | — | — | `enrollment.mentorId/managerId` | — | S |
| Progress trekingi | ✅ | ✖ | HIGH | ADD | — | Progress bar | `enrollment.stepStates[]` | — | M |
| Kechikkan vazifalar | ✅ | ✖ | HIGH | ADD | reminder job | Rangli status | — | — | S |
| Avtomatik eslatmalar | ✅ | ✖ | HIGH | ADD | `reminderJob` kengaytirish | — | — | — | S |
| Onboarding hisoboti | ✅ | ✖ | MEDIUM | ADD | `reportData` yangi turi | Hisobot | — | `?type=onboarding` | M |
| **Avtomatik boshlash (hireDate)** | ✅ | ✖ | HIGH | ADD | Kunlik job: yangi `hireDate` → enroll | — | — | — | S |

## 2.11 DEVELOPMENT PLANS

> **Butun domen yo'q.**

| Feature | iSp | Biz | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|
| Shaxsiy rivojlanish rejasi (IDP) | ✅ | ✖ | MEDIUM | ADD | `developmentPlan.service` | `DevelopmentPlanView` | `+DevelopmentPlan` | `/development-plans` | L |
| Rolga asoslangan reja | ✅ | ✖ | MEDIUM | ADD | — | — | `plan.templateId`, `+PlanTemplate` | — | M |
| O'quv / ko'nikma / kompetensiya maqsadlari | ✅ | ✖ | MEDIUM | ADD | `competency.service` | Maqsad kartalari | `+Competency`, `plan.goals[]` | `/competencies` | L |
| Majburiy / ixtiyoriy kurslar | ✅ | ✖ | MEDIUM | ADD | LearningPath qayta ishlatiladi | — | `goal.items[]` | — | S |
| Milestone / deadline | ✅ | ✖ | MEDIUM | ADD | — | Timeline | `goal.dueAt` | — | S |
| Progress trekingi | ✅ | ✖ | MEDIUM | ADD | Progress aggregatsiyasi | — | — | — | M |
| Manager / mentor review | ✅ | ✖ | MEDIUM | ADD | `planReview.service` | Review formasi | `+PlanReview` | `POST /:id/reviews` | M |
| O'quv ballari (CPE/credit) | ✅ | ✖ | MEDIUM | EXTEND | `PointsLedger` qayta ishlatiladi (**mavjud!**) | — | `pointsLedger.kind=CPE` | — | S |
| Rejalashtirilgan / erishilgan ball | ✅ | ✖ | MEDIUM | ADD | — | — | `plan.plannedPoints/achievedPoints` | — | S |
| Rivojlanish tarixi | ✅ | ✖ | LOW | ADD | — | Tarix | `+PlanSnapshot` | — | M |

## 2.12 KNOWLEDGE BASE

> Bizda `News` bor — bu **oqim**, baza emas: qidirilmaydi, kategoriyalanmaydi,
> versiyalanmaydi, kursga bog'lanmaydi.

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Knowledge base | ✅ | ✖ | Yo'q | HIGH | ADD | `knowledgeBase.service` | `KbView`, `KbArticleView`, `KbAdminView` | `+KbArticle`, `+KbCategory` | `/kb/*` | L |
| Maqolalar | ✅ | ◐ | `News` (targeting bor) | HIGH | ADD | — | Rich reader | `KbArticle.contentHtml` | — | M |
| Kategoriya / papkalar | ✅ | ✖ | — | HIGH | ADD | Daraxt (`parentId`) | Papka navigatsiyasi | `KbCategory.parentId` | — | M |
| Full-text qidiruv | ✅ | ✖ | Faqat `RegExp` title | CRITICAL | ADD | Mongo `$text` (uz/ru/en) | Qidiruv sahifasi | text index | `GET /kb/search` | M |
| Teglar | ✅ | ◐ | `news.tags` bor | MEDIUM | EXTEND | — | — | `KbArticle.tags[]` | — | S |
| FAQ / siyosat / SOP / qo'llanma | ✅ | ✖ | — | HIGH | ADD | — | Tur bo'yicha shablon | `KbArticle.kind` enum | — | S |
| Hujjat / video / rasm biriktirish | ✅ | ◐ | Material tizimi bor | MEDIUM | EXTEND | `materialAccess` qayta ishlatiladi | — | `KbArticle.attachments[]` | — | S |
| Rolga / bo'limga ko'rinish | ✅ | ✅ (naqsh) | `courseVisibility.js` ko'chiriladi | HIGH | ADD | shu funksiya | — | `KbArticle.targetRoles/...` | — | S |
| Yuklab olish / faqat ko'rish ruxsati | ✅ | ◐ | Material'da signed URL bor | HIGH | EXTEND | `allowDownload` flag | — | `KbArticle.allowDownload` | — | S |
| Maqola versiyalash | ✅ | ✖ | — | MEDIUM | ADD | `kbVersion.service` | Versiyalar | `+KbArticleVersion` | — | M |
| Muallif / tekshiruvchi | ✅ | ◐ | `createdBy` bor | MEDIUM | ADD | — | — | `reviewerId`, `reviewedAt` | — | S |
| Izohlar | ✅ | ◐ | `CourseQuestion` naqshi bor | LOW | ADD | shu naqsh | — | `+KbComment` | — | S |
| Maqola analitikasi | ✅ | ◐ | `NewsView` naqshi (scroll, vaqt) **mavjud** | MEDIUM | EXTEND | `newsView` naqshi ko'chiriladi | Hisobot | `+KbView` | — | S |
| KB → kurs sinxronizatsiyasi | ✅ | ✖ | — | LOW | ADD | `kbToLesson()` | "Kursga qo'shish" | `Lesson.sourceKbArticleId` | — | M |

## 2.13 ASSIGNMENTS (uy vazifasi / topshiriq)

> Bizda `Task` bor — lekin u **topshiriq boshqaruvi**, o'quv topshirig'i emas:
> fayl topshirish, baholash, izoh, qayta topshirish — hech biri yo'q.

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Topshiriq yaratish | ✅ | ◐ | `Task` (audience fan-out bilan) | HIGH | ADD | `assignment.service` | `AssignmentEditor` | `+Assignment` (topic ostida) | `/topics/:id/assignments` | M |
| Fayl topshirish | ✅ | ✖ | — | HIGH | ADD | `materialUpload` naqshi | Upload | `+Submission.files[]` | `POST /:id/submissions` | M |
| Matn topshirish | ✅ | ✖ | — | HIGH | ADD | — | Editor | `Submission.text` | — | S |
| Havola topshirish | ✅ | ✖ | — | MEDIUM | ADD | — | — | `Submission.links[]` | — | S |
| Deadline | ✅ | ✅ | `task.deadline` | — | KEEP/ADD | — | — | `Assignment.dueAt` | — | S |
| Kech topshirish siyosati | ✅ | ✖ | — | MEDIUM | ADD | `lateWindow` | Ogohlantirish | `Assignment.allowLate` | — | S |
| Instruktor / manager tekshiruvi | ✅ | ✖ | — | HIGH | ADD | `grading.service` | Baholash navbati | `Submission.status`, `.grade` | `POST /submissions/:id/grade` | M |
| Baholash (ball / rubrika) | ✅ | ✖ | — | HIGH | ADD | — | Rubrika UI | `+Rubric` | — | M |
| Izoh / feedback | ✅ | ✖ | — | HIGH | ADD | — | — | `Submission.feedback` | — | S |
| Qayta topshirish | ✅ | ✖ | — | MEDIUM | ADD | — | — | `Submission.attemptNo` | — | S |
| Status | ✅ | ◐ | `task.status` | HIGH | ADD | — | — | `SUBMITTED/GRADED/RETURNED` | — | S |
| Avtomatik bildirishnoma | ✅ | ◐ | Task uchun bor | HIGH | EXTEND | `notification.service` | — | — | — | S |
| Tarix | ✅ | ✖ | — | MEDIUM | ADD | — | — | ko'p `Submission` | — | S |

## 2.14 LIVE TRAINING

> `Event` modeli bor (`title/type/startAt/endAt/location/participants`) — lekin
> ro'yxatdan o'tish, sig'im, davomat, eslatma, meeting havolasi, bildirishnoma
> — **hech biri yo'q** (`event.service.js` da `notify` chaqiruvi ham yo'q).

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Live tadbir / vebinar / seminar | ✅ | ◐ | `Event.type` enum | HIGH | EXTEND | `liveTraining.service` | `EventDetailView` | `Event` kengaytiriladi | `/events/*` | M |
| Offline / auditoriya mashg'uloti | ✅ | ◐ | `Event.location` | HIGH | EXTEND | — | — | `Event.mode` enum | — | S |
| Trening kalendari | ✅ | ✅ | `GET /events/calendar` + `EventsView` | — | KEEP | — | — | — | — | — |
| Trener | ✅ | ✖ | — | HIGH | ADD | — | Trener tanlash | `Event.trainerIds[]` | — | S |
| Sig'im (capacity) | ✅ | ✖ | — | HIGH | ADD | atomik `$inc` + guard | Joy qoldi | `Event.capacity` | — | S |
| Ro'yxatdan o'tish | ✅ | ✖ | `participants[]` faqat admin qo'shadi | HIGH | ADD | `register()/cancel()` | Tugma | `+EventRegistration` | `POST /:id/register` | M |
| Navbat (waitlist) | ✅ | ✖ | — | MEDIUM | ADD | Joy bo'shasa avto-ko'chirish | — | `Registration.status=WAITLIST` | — | M |
| Davomat (attendance) | ✅ | ✖ | — | HIGH | ADD | `markAttendance()` | Davomat varag'i / QR | `Registration.attended` | `POST /:id/attendance` | M |
| Eslatmalar | ✅ | ✖ | **Hech qanday event bildirishnomasi yo'q** | HIGH | ADD | `reminderJob` kengaytirish | — | `Event.remindBeforeMinutes` | — | S |
| Bekor qilish / vaqt o'zgarishi xabari | ✅ | ✖ | — | HIGH | ADD | diff → notify | — | — | — | S |
| Zoom integratsiyasi | ✅ | ✖ | — | MEDIUM | ADD | `zoom.provider` (OAuth S2S) | — | `Event.meeting{provider,url,id}` | `/integrations/zoom` | M |
| Google Meet | ✅ | ✖ | — | MEDIUM | ADD | `googleMeet.provider` | — | — | — | M |
| Meeting havolasi (qo'lda) | ✅ | ✖ | — | HIGH | ADD | — | Input | `Event.meeting.url` | — | S |
| Ishtirokchi statistikasi | ✅ | ✖ | — | MEDIUM | ADD | `reportData` yangi turi | Hisobot | — | `?type=event-attendance` | M |
| Tadbirni tugatish → kurs progressi | ✅ | ✖ | — | MEDIUM | ADD | `completionRule` ga ulash | — | `Event.linkedCourseId` | — | M |

## 2.15 KALENDAR

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Trening kalendari | ✅ | ◐ | `GET /events/calendar` — faqat `Event` | HIGH | EXTEND | `calendar.service` — agregator | Yagona kalendar | — | `GET /calendar?from&to` | M |
| Kurs deadline'lari | ✅ | ✖ | Kalendarda yo'q | HIGH | ADD | `CourseAssignment.deadline` qo'shish | — | — | — | S |
| Live sessiyalar | ✅ | ✅ | `Event` | — | KEEP | — | — | — | — | — |
| Topshiriqlar / imtihonlar | ✅ | ✖ | — | HIGH | ADD | `Task`, `Assignment` qo'shish | — | — | — | S |
| Menejer kalendari | ✅ | ✖ | — | MEDIUM | ADD | `?scope=team` | — | — | — | M |
| Yaqinlashayotgan / kechikkan | ✅ | ◐ | Dashboard'da "bugun" bor | MEDIUM | EXTEND | — | — | — | — | S |
| iCal eksport / obuna | ✅ | ✖ | — | LOW | ADD | `.ics` generator | — | — | `GET /calendar.ics?token=` | S |

## 2.16 GAMIFICATION

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Ballar | ✅ | ✅ | `PointsLedger`, idempotent (unique sparse index) | — | KEEP | — | — | — | — | — |
| Nishonlar (badge) | ✅ | ◐ | 5 ta **hardcoded** (`badgeDefinitions.js`), o'qishda hisoblanadi | HIGH | REFACTOR | `badge.service` + qoida dvigateli | Badge CRUD | `+Badge`, `+UserBadge` | `/badges` | M |
| Yutuqlar (achievement) | ✅ | ◐ | Badge bilan bir xil | MEDIUM | EXTEND | — | — | — | — | S |
| Darajalar (level) | ✅ | ◐ | `LevelGauge.vue` bor, backend qoidasi yo'q | MEDIUM | ADD | `levelFromPoints()` | — | `+LevelDef` | — | S |
| Leaderboard | ✅ | ✅ | `GET /gamification/leaderboard` + `LeaderboardView` | — | KEEP | — | — | — | — | — |
| Bo'lim / kompaniya leaderboard'i | ✅ | ◐ | Guruh leaderboard'i bor (`GroupLeaderboard`) | MEDIUM | EXTEND | `?scope=department\|branch\|company` | Tab'lar | — | query | S |
| Kurs / test / tugatish ballari | ✅ | ✅ | `source: COMPLETION\|QUIZ\|ASSESSMENT` | — | KEEP | — | — | — | — | — |
| Yutuqlar tarixi | ✅ | ◐ | Ledger bor, UI yo'q | LOW | EXTEND | — | Tarix ro'yxati | — | — | S |
| Gamification sozlamalari | ✅ | ✖ | Ballar video/assessment'da qo'lda | MEDIUM | ADD | `gamificationSettings` | Sozlash sahifasi | `+Settings` doc | `/settings/gamification` | S |
| Badge mezoni / avtomatik berish | ✅ | ◐ | Hisoblanadi, lekin sozlanmaydi va bildirishnoma yubormaydi | MEDIUM | REFACTOR | `evaluateBadges()` + notify | — | `Badge.criteria{}` | — | M |

## 2.17 SOCIAL LEARNING

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Kurs muhokamasi / Q&A | ✅ | ✅ | `CourseQuestion` + `QAPanel.vue` | — | KEEP | — | — | — | — | — |
| Instruktor javoblari | ✅ | ✅ | `answers[]` embedded | — | KEEP | — | — | — | — | — |
| Kurs sharhlari / reyting | ✅ | ✅ | `CourseReview` (1–5) + `ReviewsPanel` | — | KEEP | — | — | — | — | — |
| To'g'ridan-to'g'ri chat | ✅ | ✅ | To'liq messenger: DM, guruh, ovoz, fayl, realtime | **iSpring'dan ancha kuchli** | KEEP | — | — | — | — | — |
| Newsfeed / e'lonlar | ✅ | ✅ | `News` + targeting + o'qish analitikasi | — | KEEP | — | — | — | — | — |
| Reaksiyalar | ✅ | ✖ | — | LOW | ADD | — | Emoji bar | `+Reaction` | — | S |
| Foydalanuvchini eslatish (@mention) | ✅ | ✖ | — | LOW | ADD | Parser + notify | Autocomplete | — | — | S |
| Muhokama moderatsiyasi | ✅ | ◐ | Admin savolni o'chira oladi | MEDIUM | EXTEND | Report/flag oqimi | — | `Question.flagged` | — | S |
| Video darajasidagi muhokama | ✅ | ✖ | Faqat kurs darajasida | LOW | EXTEND | — | — | `Question.videoId` | — | S |

## 2.18 SERTIFIKATLAR

> **Butun domen yo'q.** `certificate` so'zi kod bazasida umuman uchramaydi.

| Feature | iSp | Biz | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|
| Sertifikat shablonlari | ✅ | ✖ | CRITICAL | ADD | `certificateTemplate.service` | Shablon editor (canvas) | `+CertificateTemplate` | `/certificate-templates` | L |
| Maxsus dizayn | ✅ | ✖ | HIGH | ADD | `pdfkit` (**mavjud dep**) + DejaVu shriftlar (**mavjud**) | Pozitsiya editor | `template.fields[]{key,x,y,font,size}` | — | M |
| Ism / kurs / sana / ball / instruktor | ✅ | ✖ | CRITICAL | ADD | Placeholder tizimi | — | — | — | S |
| Sertifikat ID | ✅ | ✖ | CRITICAL | ADD | `nanoid` / ULID | — | `Certificate.serial` unique | — | S |
| QR tekshiruv | ✅ | ✖ | HIGH | ADD | QR generator | — | — | — | S |
| Ommaviy tekshiruv sahifasi | ✅ | ✖ | HIGH | ADD | Auth'siz endpoint (rate-limited) | `/verify/:serial` public route | — | `GET /public/certificates/:serial` | M |
| PDF yuklab olish | ✅ | ✖ | CRITICAL | ADD | `pdfkit` render + S3 cache | Tugma | `Certificate.pdfKey` | `GET /:id/pdf` | M |
| Amal qilish muddati | ✅ | ✖ | HIGH | ADD | — | — | `Certificate.expiresAt` | — | S |
| Yangilash (renewal) | ✅ | ✖ | HIGH | ADD | Compliance job | — | `Certificate.renewedFromId` | — | M |
| Avtomatik berish | ✅ | ✖ | CRITICAL | ADD | `courseCompleted` hook | — | `course.certificateTemplateId` | — | M |
| Sertifikat tarixi | ✅ | ✖ | HIGH | ADD | — | Profil tabi | — | `GET /users/:id/certificates` | S |
| Tashqi sertifikatlar | ✅ | ✖ | MEDIUM | ADD | — | Yuklash | `+ExternalCertificate` | — | M |

## 2.19 360° FEEDBACK

> **Butun domen yo'q.**

| Feature | iSp | Biz | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|
| 360 review | ✅ | ✖ | MEDIUM | ADD | `review360.service` | `Review360View` | `+ReviewCycle`, `+ReviewAssignment`, `+ReviewResponse` | `/reviews-360/*` | XL |
| Review shablonlari | ✅ | ✖ | MEDIUM | ADD | — | Shablon builder | `+ReviewTemplate` | — | M |
| Kompetensiya / ko'nikmalar | ✅ | ✖ | MEDIUM | ADD | `competency.service` | Kompetensiya CRUD | `+Competency` | `/competencies` | M |
| O'z-o'zini baholash | ✅ | ✖ | MEDIUM | ADD | — | — | `assignment.relation=SELF` | — | S |
| Rahbar / hamkasb / bo'ysunuvchi baholashi | ✅ | ✖ | MEDIUM | ADD | `user.managerId` dan avtomatik | — | `relation=MANAGER\|PEER\|SUBORDINATE` | — | M |
| Anonim feedback | ✅ | ✖ | MEDIUM | ADD | Min-N agregatsiya qoidasi (N≥3) | — | `response.anonymous` | — | M |
| Ball + izoh | ✅ | ✖ | MEDIUM | ADD | Likert savol turi (§2.5) | — | `response.answers[]` | — | S |
| Kompetensiya profili | ✅ | ✖ | MEDIUM | ADD | Aggregatsiya | Radar chart | — | `GET /users/:id/competency-profile` | M |
| Review sikllari | ✅ | ✖ | MEDIUM | ADD | Scheduler | — | `ReviewCycle.opensAt/closesAt` | — | M |
| Tarix / taqqoslash | ✅ | ✖ | LOW | ADD | — | Sikllar taqqoslash | — | — | M |
| Vizual hisobotlar | ✅ | ✖ | MEDIUM | ADD | — | Radar / heatmap | — | — | M |
| Rivojlanish tavsiyalari | ✅ | ✖ | LOW | ADD | Past kompetensiya → kurs tavsiyasi (§2.42) | — | — | — | M |

## 2.20 ON-THE-JOB TRAINING (OJT)

> **Butun domen yo'q.**

| Feature | iSp | Biz | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|
| OJT sessiyasi | ✅ | ✖ | MEDIUM | ADD | `ojt.service` | `OjtSessionView` (mobil-birinchi) | `+OjtChecklist`, `+OjtSession`, `+OjtObservation` | `/ojt/*` | L |
| Trener / xodim | ✅ | ✖ | MEDIUM | ADD | — | — | `session.trainerId/employeeId` | — | S |
| Ko'nikma mezonlari | ✅ | ✖ | MEDIUM | ADD | `Competency` qayta ishlatiladi | Checklist builder | `checklist.criteria[]{competencyId,maxScore}` | — | M |
| Kuzatuv + ball + izoh | ✅ | ✖ | MEDIUM | ADD | — | Mobil forma | `Observation.scores[]` | — | M |
| Bitta sessiyada bir necha kuzatuv | ✅ | ✖ | MEDIUM | ADD | — | — | 1:N `Observation` | — | S |
| Sessiya tarixi / o'rtacha ball | ✅ | ✖ | MEDIUM | ADD | Aggregatsiya | — | — | — | S |
| Kuzatuvlar taqqoslanishi | ✅ | ✖ | LOW | ADD | — | Trend chart | — | — | M |
| Rejalashtirilgan OJT | ✅ | ✖ | LOW | ADD | Kalendar bilan | — | `session.scheduledAt` | — | S |
| Offline rejim (zavod/do'kon) | ✖ | ✖ | MEDIUM | ADD | §2.25 PWA'ga bog'liq | IndexedDB queue | — | — | M |

## 2.21 REPORTING VA ANALYTICS

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin dashboard | ✅ | ✅ | `dashboardAggregation` (BullMQ, 5 daq), 10 karta, trend, ranked list | — | KEEP | — | — | — | — | — |
| Jami / faol / nofaol o'quvchilar | ✅ | ✅ | `cards.totalEmployees/activeEmployees` | — | KEEP | — | — | — | — | — |
| Kurs tugatish / progress | ✅ | ✅ | `courseStats`, `employeeStats` | — | KEEP | — | — | — | — | — |
| O'rtacha ball | ✅ | ◐ | Attempt'larda bor, dashboard'da yo'q | HIGH | EXTEND | Kartaga qo'shish | — | — | — | S |
| Pass / fail rate | ✅ | ✖ | Hisoblanmaydi | HIGH | ADD | Aggregatsiya | Karta | — | — | S |
| Test urinishlari | ✅ | ◐ | Drill-down'da | MEDIUM | EXTEND | — | — | — | — | S |
| Sarflangan vaqt | ✅ | ✅ | `videoSession.activeDuration`, trend | — | KEEP | — | — | — | — | — |
| Login faolligi | ✅ | ◐ | `auditLog` da bor, hisobotda yo'q | MEDIUM | ADD | `login-activity` hisoboti | — | — | `?type=login-activity` | S |
| Topshiriq statusi | ✅ | ✅ | `task-analytics` hisoboti | — | KEEP | — | — | — | — | — |
| Learning path progressi | ✅ | ✖ | Path yo'q | CRITICAL | ADD | §2.6 bilan | — | — | — | — |
| Bo'lim / guruh / filial samaradorligi | ✅ | ◐ | Bo'lim filtri yo'q | HIGH | EXTEND | Group-by qo'shish | Filtr | — | `?groupBy=department` | M |
| Manager samaradorligi | ✅ | ✖ | `managerId` yo'q | HIGH | ADD | §2.9 bilan | — | — | — | M |
| Instruktor samaradorligi | ✅ | ✖ | — | MEDIUM | ADD | `authorIds` bilan | — | — | — | M |
| Sertifikat statistikasi | ✅ | ✖ | — | HIGH | ADD | §2.18 bilan | — | — | — | S |
| Live trening davomati | ✅ | ✖ | — | HIGH | ADD | §2.14 bilan | — | — | — | S |
| OJT / 360 hisobotlari | ✅ | ✖ | — | MEDIUM | ADD | §2.19–2.20 | — | — | — | M |
| KB analitikasi | ✅ | ✖ | `NewsView` naqshi bor | MEDIUM | ADD | §2.12 | — | — | — | S |
| Kontent samaradorligi | ✅ | ✅ | `mostSkippedVideos`, `mostPausedVideos` | **iSpring'da yo'q** | KEEP | — | — | — | — | — |
| CSV / XLSX / PDF eksport | ✅ | ✅ | `reportExport.service` (exceljs, pdfkit), 3 til | — | KEEP | — | — | — | — | — |
| Rejalashtirilgan hisobotlar | ✅ | ✖ | — | HIGH | ADD | BullMQ repeat job + mail | Rejalar sahifasi | `+ScheduledReport` | `/scheduled-reports` | M |
| E-mail bilan hisobot | ✅ | ✖ | E-mail yo'q | HIGH | ADD | §2.24 ga bog'liq | — | — | — | S |
| Maxsus filtrlar (sana / bo'lim / user / kurs) | ✅ | ◐ | `dateFrom/dateTo`, `role`, `userId`, `courseId` | Branch, group, path yo'q | HIGH | EXTEND | Filtr kengaytirish | Filtr paneli | — | query | S |
| Custom report builder | ✅ | ✖ | 5 ta qat'iy hisobot turi | MEDIUM | ADD | Deklarativ builder (whitelist maydonlar) | Builder UI | `+ReportDefinition` | `/report-definitions` | L |
| Drill-down | ✅ | ✅ | Dashboard → kurs → xodim → video → savol | **iSpring'dan chuqurroq** | KEEP | — | — | — | — | — |
| Eksport chegarasi | — | ✅ | `MAX_ROWS = 5000` | Katta eksport uchun async job kerak | MEDIUM | EXTEND | BullMQ eksport job | "Tayyor bo'lganda xabar" | `+ExportJob` | — | M |

## 2.22 LEARNER DASHBOARD

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Mening kurslarim | ✅ | ✅ | `CoursesView` + `HomeView` | — | KEEP | — |
| O'qishni davom ettirish | ✅ | ✅ | `dashboard.continueLearning` hero kartasi | — | KEEP | — |
| Tugatilgan kurslar | ✅ | ✅ | Status filtri | — | KEEP | — |
| Biriktirilgan kurslar | ✅ | ✅ | `mandatory` bo'limi | — | KEEP | — |
| Kechikkan kurslar | ✅ | ✅ | `courses.badges.overdue` | — | KEEP | — |
| Tavsiya etilgan kurslar | ✅ | ✖ | Yo'q | MEDIUM | ADD (§2.42) | M |
| Learning path'lar | ✅ | ✖ | — | CRITICAL | ADD (§2.6) | — |
| Progress foizi | ✅ | ✅ | `ProgressRing` | — | KEEP | — |
| Yutuqlar / badge / ball | ✅ | ✅ | `gamification/me` | — | KEEP | — |
| Leaderboard | ✅ | ✅ | `LeaderboardView` | — | KEEP | — |
| Sertifikatlar | ✅ | ✖ | — | CRITICAL | ADD (§2.18) | — |
| Kalendar | ✅ | ◐ | `EventsView` | HIGH | EXTEND (§2.15) | M |
| Topshiriqlar | ✅ | ✅ | `TasksView` | — | KEEP | — |
| Bildirishnomalar | ✅ | ✅ | `NotificationBell` + socket | — | KEEP | — |
| Rivojlanish rejasi | ✅ | ✖ | — | MEDIUM | ADD (§2.11) | — |
| Knowledge base | ✅ | ✖ | — | HIGH | ADD (§2.12) | — |
| Profil | ✅ | ✅ | `SettingsView` | — | KEEP | — |
| O'quv tarixi | ✅ | ◐ | Admin ko'radi, xodim ko'rmaydi | MEDIUM | EXTEND | S |
| **Streak (ketma-ket kunlar)** | ✖ | ✅ | `dashboard.progress.streak` | — | KEEP | — |

## 2.23 ADMIN DASHBOARD

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Jami foydalanuvchi / kurs | ✅ | ✅ | `cards.*` | — | KEEP | — |
| Tugatish darajasi | ✅ | ✅ | `avgCompletionPercent` | — | KEEP | — |
| Kechikkan o'qish | ✅ | ✅ | `overdueAssignments` + "Diqqat" bloki | — | KEEP | — |
| Test samaradorligi | ✅ | ✖ | Yo'q | HIGH | ADD | S |
| Sertifikatlar | ✅ | ✖ | — | HIGH | ADD | S |
| Yaqinlashayotgan tadbirlar | ✅ | ✖ | Dashboard'da yo'q | MEDIUM | ADD | S |
| Learning path'lar | ✅ | ✖ | — | CRITICAL | ADD | — |
| Foydalanuvchi faolligi | ✅ | ◐ | `activeSessions` | MEDIUM | EXTEND | S |
| Bo'lim samaradorligi | ✅ | ◐ | Ranked list bor, bo'lim kesimi yo'q | HIGH | EXTEND | M |
| Tizim bildirishnomalari | ✅ | ◐ | `useHealthCheck` | LOW | EXTEND | S |
| Kutilayotgan tasdiqlar | ✅ | ✖ | Tasdiqlash oqimi yo'q | MEDIUM | ADD | M |
| So'nggi faoliyat | ✅ | ✖ | `auditLog` bor, ko'rsatilmaydi | HIGH | ADD | S |
| **Kesh + `stale` bayrog'i** | ✖ | ✅ | `dashboardCache` + `generatedAt` | — | KEEP | — |

## 2.24 NOTIFICATION SYSTEM

> ⚠️ **Eng katta sistemali bo'shliq.** Hozir faqat **in-app + Socket.io**.
> `nodemailer`/`smtp`/push — kod bazasida umuman yo'q. Ya'ni ilovaga
> kirmagan xodim hech qanday xabar olmaydi, va parol tiklash ishlamaydi.

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| In-app bildirishnoma | ✅ | ✅ | `Notification` + `emitNotification` (realtime) | — | KEEP | — | — | — | — | — |
| E-mail bildirishnoma | ✅ | ✖ | **Yo'q** | CRITICAL | ADD | `mail.service` (nodemailer/SES) + BullMQ `mailQueue` + retry | Sozlamalar | `+MailLog` | — | M |
| Push (web) | ✅ | ✖ | Yo'q | HIGH | ADD | Web Push (VAPID) | Service worker | `+PushSubscription` | `/push/subscribe` | M |
| Telegram (mahalliy kanal) | ✖ | ✖ | Yo'q | HIGH | ADD | Bot API provider | Ulash oqimi | `user.telegramChatId` | — | M |
| SMS | ✅ | ✖ | Yo'q | LOW | ADD | Provayder adapteri | — | — | — | M |
| Kurs biriktirildi | ✅ | ✅ | `COURSE_ASSIGNED` | — | KEEP | — | — | — | — | — |
| Kurs tugatildi | ✅ | ✖ | Yo'q | HIGH | ADD | hook | — | — | — | S |
| Test o'tdi / yiqildi | ✅ | ✖ | Yo'q | HIGH | ADD | hook | — | — | — | S |
| Topshiriq topshirildi / tekshirildi | ✅ | ✖ | §2.13 yo'q | HIGH | ADD | — | — | — | — | S |
| Deadline eslatmasi | ✅ | ✅ | `COURSE_DEADLINE_APPROACHING` (24 soat) | Bir marta; 7/3/1 kun bosqichlari yo'q | MEDIUM | EXTEND | `remindAt[]` | — | — | — | S |
| Kechikish eslatmasi | ✅ | ◐ | Task uchun bor (`TASK_OVERDUE`), kurs uchun yo'q | HIGH | EXTEND | — | — | — | — | S |
| Sertifikat berildi / muddati tugaydi | ✅ | ✖ | — | HIGH | ADD | §2.18 | — | — | — | S |
| Onboarding eslatmasi | ✅ | ✖ | — | HIGH | ADD | §2.10 | — | — | — | S |
| Live trening eslatmasi | ✅ | ✖ | **Event bildirishnomasi umuman yo'q** | HIGH | ADD | §2.14 | — | — | — | S |
| Tadbir o'zgarishi | ✅ | ✖ | — | HIGH | ADD | — | — | — | — | S |
| E'lon | ✅ | ◐ | News bor, notify yo'q | MEDIUM | EXTEND | News publish → notify | — | — | — | S |
| Sozlanadigan shablonlar | ✅ | ✖ | Matn kodda hardcoded (inglizcha!) | HIGH | ADD | `notificationTemplate.service` (i18n + placeholder) | Shablon editor | `+NotificationTemplate` | `/notification-templates` | M |
| Foydalanuvchi afzalliklari | ✅ | ✖ | Yo'q — o'chirib bo'lmaydi | HIGH | ADD | `preferences` tekshiruvi | Sozlamalar tabi | `user.notificationPrefs{}` | — | S |
| Digest (kunlik/haftalik) | ✅ | ✖ | — | MEDIUM | ADD | BullMQ repeat | — | — | — | M |

## 2.25 MOBILE

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Responsive web | ✅ | ✅ | Tailwind, `BottomNav`, mobil grid | — | KEEP | — | — | — | — | — |
| Mobile-first learner UX | ✅ | ◐ | Ishlaydi, lekin desktop uchun loyihalangan | MEDIUM | EXTEND | — | Mobil ekran auditi | — | — | M |
| PWA (o'rnatiladigan) | ✅ | ✖ | **Manifest yo'q, service worker yo'q** | HIGH | ADD | — | `vite-plugin-pwa`, manifest, ikonkalar | — | — | M |
| iOS / Android native | ✅ | ✖ | Yo'q | LOW | — | **Ataylab olmaymiz** — PWA yetarli | — | — | — | — |
| Offline o'qish | ✅ | ✖ | Yo'q | HIGH | ADD | Signed URL TTL uzaytirish | Workbox precache + IndexedDB | — | — | L |
| Offline progress trekingi | ✅ | ✖ | Yo'q | HIGH | ADD | Idempotent batch qabul (event `id` bilan dedup) | IndexedDB navbati | `+clientEventId` unique | — | M |
| Onlayn bo'lganda sinxronizatsiya | ✅ | ✖ | Yo'q | HIGH | ADD | — | Background Sync API | — | — | M |
| Mobil video player | ✅ | ✅ | `hls.js` | — | KEEP | — | — | — | — | — |
| Offline video | ✅ | ✖ | HLS segment'lar keshlanmaydi | MEDIUM | ADD | Yuklab olish tokeni | SW segment kesh | — | — | L |
| Mobil test / topshiriq | ✅ | ✅ | Ishlaydi | ⚠️ Offline'da assessment sessiyasi ishlamaydi (server taymer) — **ataylab** | — | KEEP | — | — | — | — |
| Mobil bildirishnoma | ✅ | ✖ | Push yo'q | HIGH | ADD | §2.24 | — | — | — | — |
| Mobil kalendar / sertifikat | ✅ | ◐ | Kalendar bor, sertifikat yo'q | — | ADD | — | — | — | — | — |

## 2.26 SEARCH

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| Global qidiruv | ✅ | ✖ | **Yo'q** | CRITICAL | ADD | `search.service` — fan-out + skor | `GlobalSearch` (⌘K palitra) | `$text` indekslar | `GET /search?q=` | M |
| Kurs qidiruvi | ✅ | ◐ | `RegExp` faqat `title` | HIGH | REFACTOR | `$text` (title+description+tags) | — | text index | `?q=` | S |
| Dars / kontent qidiruvi | ✅ | ✖ | Yo'q | HIGH | ADD | Lesson/material matnini indekslash | — | text index | — | M |
| KB qidiruvi | ✅ | ✖ | — | HIGH | ADD | §2.12 | — | — | — | — |
| Foydalanuvchi qidiruvi | ✅ | ✅ | `user.repository.searchDirectory` (escape'langan regex) | — | KEEP | — | — | — | — | — |
| Sertifikat qidiruvi | ✅ | ✖ | — | MEDIUM | ADD | serial bo'yicha | — | — | — | S |
| Filtrlar / kategoriya / teg | ✅ | ◐ | Qisman | HIGH | EXTEND | — | Facet paneli | — | — | M |
| Full-text (uz/ru/en morfologiyasi) | ✅ | ✖ | Yo'q | HIGH | ADD | Mongo `$text` `none` tili + o'zbekcha stemmer'siz n-gram fallback | — | — | — | M |
| Autocomplete | ✅ | ◐ | Chat kontaktlarida bor | MEDIUM | ADD | prefix indeks | — | — | `GET /search/suggest` | S |
| Oxirgi qidiruvlar | ✅ | ✖ | — | LOW | ADD | — | `localStorage` | — | — | S |

## 2.27 MULTILINGUAL

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| O'zbek / rus / ingliz | ✅ | ✅ | `vue-i18n`, 3×1393 kalit | — | KEEP | — |
| Til tanlagich | ✅ | ✅ | `SettingsView` + `i18n/index.js` | — | KEEP | — |
| Tarjima qilingan UI | ✅ | ✅ | To'liq | — | KEEP | — |
| Ko'p tilli **kurslar** | ✅ | ✖ | **Kontent bir tilli** | HIGH | ADD (`+ContentTranslation`) | L |
| Ko'p tilli testlar | ✅ | ✖ | — | HIGH | ADD | M |
| Ko'p tilli bildirishnomalar | ✅ | ✖ | Matn kodda **inglizcha hardcoded** (`reminderJob.js`) | HIGH | REFACTOR (shablon + i18n) | M |
| Ko'p tilli sertifikatlar | ✅ | ✖ | — | MEDIUM | ADD | S |
| AI tarjima | ✅ | ✖ | — | HIGH | ADD (§2.4) | L |
| Hisobot tili | ✅ | ✅ | `reportI18n.js` — **allaqachon 3 tilli** | — | KEEP | — |
| RTL | ✅ | ✖ | — | LOW | **Ataylab olmaymiz** | — |

## 2.28–2.30 INTEGRATIONS / API / SSO

> ⚠️ **Butun blok yo'q.** Bizda faqat SPA uchun ichki REST API bor;
> tashqi tizim uchun kalit, webhook, hujjat, SSO — hech biri yo'q.

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | API | CX |
|---|---|---|---|---|---|---|---|---|---|---|
| REST API (ichki) | ✅ | ✅ | 34 router, layered, `ApiError` envelope | — | KEEP | — | — | — | — | — |
| Public API (tashqi) | ✅ | ✖ | Yo'q | HIGH | ADD | `/api/public/v1` + API-key auth middleware | Kalitlar sahifasi | `+ApiKey` (hash, scope[], lastUsedAt) | `/admin/api-keys` | L |
| API kalitlari + rate limiting | ✅ | ✖ | Rate limiting **bor** (`express-rate-limit`), kalit yo'q | HIGH | ADD | Per-key limiter (Redis) | — | `ApiKey.rateLimit` | — | M |
| OpenAPI / Swagger | ✅ | ✖ | `docs/api-contract.md` (qo'lda) | HIGH | ADD | `zod-to-openapi` (**zod allaqachon ishlatiladi**) | `/api/docs` (Scalar/Redoc) | — | `GET /openapi.json` | M |
| Webhooks | ✅ | ✖ | Yo'q | HIGH | ADD | `webhook.service` + BullMQ retry + HMAC imzo | Webhook CRUD | `+Webhook`, `+WebhookDelivery` | `/webhooks` | L |
| SSO (JWT) | ✅ | ◐ | JWT **ichkarida** ishlatiladi, SSO sifatida emas | HIGH | ADD | `sso.service` — imzolangan JWT'ni qabul qilish | — | `+SsoConfig` | `POST /auth/sso/jwt` | M |
| OAuth / OIDC | ✅ | ✖ | Yo'q | HIGH | ADD | OIDC client (Google Workspace / Keycloak) | Login tugmasi | `user.externalIds[]` | `/auth/oidc/*` | L |
| SAML | ✅ | ✖ | — | LOW | **Ataylab olmaymiz** | — | — | — | — | — |
| Avtomatik provisioning | ✅ | ✖ | — | HIGH | ADD | JIT user yaratish | — | — | — | M |
| Rol / bo'lim mapping | ✅ | ✖ | — | HIGH | ADD | `claimMapping{}` | Mapping UI | `SsoConfig.mapping` | — | M |
| Logout sinxronizatsiyasi | ✅ | ✖ | Ichki logout bor (session revoke) | MEDIUM | ADD | Back-channel logout | — | — | — | M |
| Sessiya boshqaruvi | ✅ | ✅ | `Session` + rotation + reuse detection | **iSpring'dan kuchliroq** | KEEP | — | — | — | — | — |
| HR tizimi integratsiyasi | ✅ | ✖ | Yo'q | HIGH | ADD | XLSX import (§2.7) + webhook | — | — | — | M |
| Zoom / Google Meet | ✅ | ✖ | — | MEDIUM | ADD | §2.14 | — | — | — | M |
| E-mail provayder | ✅ | ✖ | **Yo'q** | CRITICAL | ADD | §2.24 | — | — | — | M |
| Storage provayder | ✅ | ✅ | `StorageProvider` abstraksiyasi (Local/S3) | — | KEEP | — | — | — | — | — |
| Analytics integratsiyasi | ✅ | ✖ | — | LOW | ADD | xAPI LRS (§2.2) | — | — | — | L |
| To'lov integratsiyasi | ✅ | ✖ | — | LOW | **Optional** (§2.40) | — | — | — | — | — |

## 2.31 XAVFSIZLIK

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| RBAC | ✅ | ✅ | Permission-based, dinamik rollar | — | KEEP | — |
| Ruxsat matritsasi | ✅ | ◐ | `packages/shared/permissions.js` (24 kalit) | HIGH | EXTEND (+~40 kalit) | M |
| Parol hashlash | ✅ | ✅ | argon2id | — | KEEP | — |
| Xavfsiz sessiyalar | ✅ | ✅ | httpOnly + Secure + SameSite=strict | — | KEEP | — |
| JWT muddati / refresh rotation | ✅ | ✅ | 15 daq access + rotation + reuse detection | — | KEEP | — |
| 2FA | ✅ | ◐ | **Face verification** (biometrik 2FA) | TOTP yo'q | HIGH | EXTEND (`+totpSecret`) | M |
| Login himoyasi / brute-force | ✅ | ✅ | `failedLoginAttempts` + `lockedUntil` + captcha + slow-down | — | KEEP | — |
| Rate limiting | ✅ | ✅ | 11 ta alohida limiter | **iSpring'dan batafsil** | KEEP | — |
| Audit log | ✅ | ◐ | 60+ action yoziladi, **lekin ko'rish uchun endpoint/UI yo'q** | CRITICAL | ADD (`GET /audit-logs` + `AuditLogView`) | M |
| Faoliyat loglari | ✅ | ✅ | `requestLogger` + winston | — | KEEP | — |
| Fayl kirish nazorati | ✅ | ✅ | Yopiq bucket + signed URL + `materialAccess` | — | KEEP | — |
| Signed URL | ✅ | ✅ | Bor | ⚠️ **loopback host bug'i** — tuzatish shart | CRITICAL | REFACTOR | S |
| Ma'lumot shifrlash | ✅ | ◐ | Transportda TLS; at-rest yo'q | MEDIUM | ADD (Mongo encrypted storage engine yoki field-level) | M |
| HTTPS / CORS / CSRF / XSS | ✅ | ✅ | helmet, CORS allowlist, double-submit CSRF, Vue auto-escape | — | KEEP | — |
| Input validatsiya | ✅ | ✅ | zod, 24 validator fayli | — | KEEP | — |
| Fayl turi / hajmi validatsiyasi | ✅ | ✅ | `file-type` magic-byte + `MAX_BYTES` | **iSpring'dan qattiqroq** | KEEP | — |
| Backup / restore | ✅ | ✖ | **Hujjatlashtirilmagan, avtomatlashtirilmagan** | CRITICAL | ADD (kunlik `mongodump` + S3 + tiklashni sinash) | M |
| Data retention | ✅ | ◐ | TTL: `videoAnalyticsEvents` 180 kun, proctor 180 kun | Boshqa hech nima uchun siyosat yo'q | MEDIUM | EXTEND | S |
| IDOR himoyasi | ✅ | ✅ | Har bir service'da resource-level tekshiruv | — | KEEP | — |

## 2.32 CONTENT SECURITY

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Yopiq kurs kirishi | ✅ | ✅ | `courseAssignmentAccess` | — | KEEP | — |
| Himoyalangan video | ✅ | ✅ | HLS + signed token + per-segment auth | **iSpring'dan kuchliroq** | KEEP | — |
| Himoyalangan fayllar | ✅ | ✅ | Yopiq bucket + TTL signed URL | — | KEEP | — |
| Yuklab olishni cheklash | ✅ | ✖ | Material har doim yuklab olinadi | HIGH | ADD (`material.allowDownload` + faqat-stream endpoint) | S |
| Faqat ko'rish rejimi | ✅ | ◐ | Viewer bor, lekin URL ochiq | HIGH | EXTEND | S |
| Watermark | ✅ | ✅ | Video overlay'da (ism + JSHSHIR) | — | KEEP | — |
| PDF watermark | ✅ | ✖ | Yo'q | MEDIUM | ADD (server-side stamp) | M |
| Domen cheklovi | ✅ | ◐ | CORS allowlist | LOW | — | — |
| Parol bilan himoyalangan kontent | ✅ | ✖ | — | LOW | ADD | S |
| Muddatga asoslangan kirish | ✅ | ✅ | `assignment.expiresAt` + `startAt` | — | KEEP | — |

## 2.33 BRANDING

| Feature | iSp | Biz | Hozirgi | Prio | Amal | BE | FE | DB | CX |
|---|---|---|---|---|---|---|---|---|---|
| Logo / favicon | ✅ | ✖ | Kodda qat'iy | MEDIUM | ADD | `branding.service` | Sozlash sahifasi | `+Settings.branding` | S |
| Asosiy / ikkilamchi rang | ✅ | ◐ | Tailwind CSS o'zgaruvchilari **mavjud** (token tizimi bor) | MEDIUM | EXTEND | Rang → CSS var inject | Rang tanlagich | `branding.colors{}` | S |
| Shriftlar | ✅ | ✖ | — | LOW | ADD | — | — | `branding.fontFamily` | S |
| Login sahifasi brendingi | ✅ | ✖ | — | MEDIUM | ADD | Public config endpoint | — | — | S |
| Portal brendingi | ✅ | ✖ | — | MEDIUM | ADD | — | — | — | S |
| E-mail brendingi | ✅ | ✖ | E-mail yo'q | MEDIUM | ADD | §2.24 | — | — | S |
| Sertifikat brendingi | ✅ | ✖ | — | HIGH | ADD | §2.18 | — | — | S |
| Custom domen / alias | ✅ | ◐ | Nginx darajasida qo'lda | LOW | — | — | — | — | — |
| White-label rejimi | ✅ | ✖ | — | LOW | ADD | Barcha yuqoridagilar birga | — | — | M |

## 2.34 ADMINISTRATSIYA

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Tizim sozlamalari | ✅ | ✖ | **Hech qanday sozlama modeli yo'q** — hammasi `.env` | HIGH | ADD (`+Settings` singleton, Redis kesh) | M |
| Tashkilot sozlamalari | ✅ | ✖ | — | MEDIUM | ADD | S |
| E-mail sozlamalari | ✅ | ✖ | — | CRITICAL | ADD (§2.24) | S |
| Bildirishnoma sozlamalari | ✅ | ✖ | — | HIGH | ADD | S |
| Storage sozlamalari | ✅ | ◐ | `.env` (`STORAGE_DRIVER`) | LOW | — | — |
| Branding sozlamalari | ✅ | ✖ | — | MEDIUM | ADD (§2.33) | — |
| Til / vaqt zonasi / sana formati | ✅ | ◐ | `APP_TIMEZONE` env + `utils/timezone.js` | MEDIUM | EXTEND (UI'ga chiqarish) | S |
| Baholash sozlamalari | ✅ | ✖ | `passScorePercent` har testda | MEDIUM | ADD (global default) | S |
| Sertifikat / gamification sozlamalari | ✅ | ✖ | — | HIGH | ADD | S |
| Integratsiya / API sozlamalari | ✅ | ✖ | — | HIGH | ADD (§2.28) | — |
| Xavfsizlik sozlamalari | ✅ | ◐ | `.env` (lockout, face policy) | ⚠️ `attentionPolicy` va `facePolicy` **allaqachon DB'da sozlanadi** — shu naqsh kengaytiriladi | MEDIUM | EXTEND | M |

## 2.35 AUDIT LOG

> Model va yozuv **juda yaxshi** (60+ action turi). Muammo — **ko'rish yo'li yo'q**:
> `routes/v1/index.js` da audit router yo'q, admin nav'da sahifa yo'q.

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Login / logout tarixi | ✅ | ✅ | `LOGIN_FAILED`, `LOGIN_BLOCKED_LOCKED`, ... | — | KEEP | — |
| User yaratish / o'zgartirish / o'chirish | ✅ | ✅ | Yoziladi | — | KEEP | — |
| Rol o'zgarishlari | ✅ | ✅ | Yoziladi | — | KEEP | — |
| Kurs CRUD | ✅ | ✅ | `COURSE_*` (8 ta action) | — | KEEP | — |
| Enrollment o'zgarishlari | ✅ | ✅ | `COURSE_ASSIGNED`, `..._REMOVED`, `..._UPDATED` | — | KEEP | — |
| Ruxsat o'zgarishlari | ✅ | ◐ | Rol CRUD yoziladi | MEDIUM | EXTEND | S |
| Sertifikat generatsiyasi | ✅ | ✖ | — | HIGH | ADD (§2.18) | S |
| Hisobot eksporti | ✅ | ✖ | Yozilmaydi | HIGH | ADD | S |
| API foydalanish | ✅ | ✖ | — | HIGH | ADD (§2.28) | S |
| Timestamp / IP / actor / target | ✅ | ✅ | To'liq | — | KEEP | — |
| **Ko'rish endpoint'i + UI** | ✅ | ✖ | **Yo'q** | CRITICAL | ADD (`GET /audit-logs` filtr+kursor, `AuditLogView`) | M |
| Eksport | ✅ | ✖ | — | HIGH | ADD (`reportExport` qayta ishlatiladi) | S |
| O'zgarmaslik (tamper-evidence) | ✅ | ◐ | Faqat yozish, lekin admin DB'ga kira oladi | LOW | ADD (hash chain) | M |

## 2.36 PERFORMANCE VA SCALABILITY

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Pagination | ✅ | ✅ | Kursor-asosli (`nextCursor`) | — | KEEP | — |
| Lazy loading | ✅ | ✅ | Route-level code splitting (35/38 dinamik) | — | KEEP | — |
| Caching | ✅ | ✅ | Redis (`utils/cache.js`, `dashboardCache`) | — | KEEP | — |
| Background jobs / queue | ✅ | ✅ | BullMQ: video, dashboard, reminder | — | KEEP | — |
| DB indekslari | ✅ | ✅ | Har bir hot query uchun compound indeks | — | KEEP | — |
| CDN | ✅ | ✖ | Yo'q | MEDIUM | ADD (statik + HLS segment) | S |
| Object storage | ✅ | ✅ | MinIO/S3 abstraksiyasi | — | KEEP | — |
| Video streaming | ✅ | ✅ | HLS, sifat darajalari | — | KEEP | — |
| Rasm optimizatsiyasi | ✅ | ✖ | Yuklangan holicha saqlanadi | MEDIUM | ADD (`sharp` → webp + o'lchamlar) | S |
| DB backup | ✅ | ✖ | **Yo'q** | CRITICAL | ADD | M |
| Monitoring | ✅ | ◐ | `GET /health` + `useHealthCheck` | HIGH | ADD (Prometheus metrics / uptime) | M |
| Error tracking | ✅ | ✖ | Faqat winston log | HIGH | ADD (Sentry yoki self-hosted GlitchTip) | S |
| Horizontal scaling | ✅ | ◐ | Stateless API, lekin Socket.io sticky/adapter'siz | MEDIUM | EXTEND (`socket.io-redis-adapter`) | S |
| Load balancing / health check | ✅ | ◐ | Nginx + `/health` | LOW | — | — |
| **Server cheklovi** | — | ⚠️ | 1.9 GB RAM, 6 ta begona sayt bilan bir VM'da | HIGH | **Ajratilgan server yoki VM kerak** — Phase 5+ AI/SCORM buni ko'tarmaydi | — |

## 2.37 FILE VA MEDIA MANAGEMENT

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Markaziy media kutubxona | ✅ | ✖ | Fayllar egasi entity'ga bog'langan, umumiy ko'rinish yo'q | HIGH | ADD (`+MediaAsset` + `MediaLibraryView`) | L |
| Papkalar | ✅ | ✖ | — | MEDIUM | ADD | M |
| Upload | ✅ | ✅ | tus (video), multer (rasm/material/chat) | — | KEEP | — |
| Drag-and-drop upload | ✅ | ◐ | `MaterialUploadForm` da bor | LOW | — | — |
| Rasm optimizatsiyasi | ✅ | ✖ | — | MEDIUM | ADD (§2.36) | S |
| Video ishlov berish | ✅ | ✅ | ffmpeg worker, HLS, poster, thumbnail | — | KEEP | — |
| Thumbnail | ✅ | ✅ | Video uchun bor | Material uchun yo'q | LOW | EXTEND | S |
| Fayl metama'lumotlari | ✅ | ✅ | `mimeType`, `fileSize`, `originalFilename` | — | KEEP | — |
| Fayl kirish nazorati | ✅ | ✅ | `materialAccess`, `videoAccess` | — | KEEP | — |
| Fayl versiyalash / almashtirish | ✅ | ✖ | — | LOW | ADD | M |
| Storage sarfi | ✅ | ✖ | Ko'rsatilmaydi | MEDIUM | ADD (aggregatsiya + karta) | S |
| Ishlatilmagan fayllarni tozalash | ✅ | ✖ | **Yo'q** — o'chirilgan kurs fayllari S3'da qoladi | HIGH | ADD (haftalik orphan-scan job) | M |

## 2.38 AUTHORING (iSpring Suite-ga o'xshash)

| Feature | iSp | Biz | Prio | Amal | Izoh |
|---|---|---|---|---|---|
| PowerPoint import | ✅ | ◐ | HIGH | EXTEND | PPTX yuklanadi va `pptx-preview` bilan ko'rsatiladi; **slaydlarni dars blokiga aylantirish** yo'q |
| Interaktiv taqdimotlar | ✅ | ✖ | MEDIUM | ADD | Lesson blocks (§2.3) ustiga quriladi |
| Ekran yozib olish | ✅ | ✖ | MEDIUM | ADD | Brauzerda `getDisplayMedia()` + mavjud tus upload |
| Screencast tahriri | ✅ | ✖ | LOW | ADD | Kesish/trim — ffmpeg worker'da (**pipeline mavjud**) |
| Video ustidan ovoz yozish | ✅ | ✖ | LOW | ADD | `VoiceRecorder.vue` **mavjud** — qayta ishlatiladi |
| Text-to-speech | ✅ | ✖ | MEDIUM | ADD | Tashqi TTS provayder; o'zbek tili uchun cheklangan |
| Subtitr / caption | ✅ | ✖ | HIGH | ADD | WebVTT; ffmpeg pipeline'ga qo'shiladi; **accessibility uchun majburiy** |
| Avtomatik transkripsiya | ✅ | ✖ | MEDIUM | ADD | Whisper-ga o'xshash servis → VTT → **video qidiruvini ochadi** |
| Interaktiv timeline / tab / FAQ / glossariy | ✅ | ✖ | LOW | ADD | Lesson block turlari |
| Hotspot | ✅ | ✖ | LOW | ADD | §2.5 savol turi |
| Role-play / dialog simulyatsiyasi | ✅ | ✖ | LOW | ADD | AI bilan (Phase 7) — `aiChat` infratuzilmasi qayta ishlatiladi |
| Branching scenario | ✅ | ✖ | MEDIUM | ADD | `+Scenario` model (tugun grafi) |
| Flipbook | ✅ | ✖ | LOW | **Olmaymiz** | §1.5 |
| HTML5 / SCORM / xAPI eksport | ✅ | ✖ | LOW | ADD | Biz **import** qilamiz (§2.2); eksport faqat kontent ko'chirish kerak bo'lsa |
| MP4 eksport | ✅ | ✖ | LOW | ADD | ffmpeg — pipeline mavjud |
| Responsive playback | ✅ | ✅ | — | KEEP | Mavjud |

## 2.39 ACCESSIBILITY

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| WCAG 2.1 AA | ✅ | ✖ | Hech qachon audit qilinmagan | HIGH | ADD (axe-core CI + qo'lda audit) | L |
| Klaviatura navigatsiyasi | ✅ | ◐ | Native element'lar ishlaydi; modal/drawer focus-trap'siz | HIGH | EXTEND | M |
| Screen reader | ✅ | ✖ | ARIA label'lar deyarli yo'q | HIGH | ADD | M |
| Alt text | ✅ | ✖ | Rasm yuklashda alt so'ralmaydi | HIGH | ADD (`+altText` maydoni) | S |
| Subtitr / caption | ✅ | ✖ | — | HIGH | ADD (§2.38) | M |
| Yuqori kontrast | ✅ | ◐ | Dark/light bor, HC rejimi yo'q | MEDIUM | ADD | S |
| Focus holatlari | ✅ | ◐ | Tailwind default | MEDIUM | EXTEND (ko'rinadigan `:focus-visible`) | S |
| Kirish mumkin formalar / testlar / player | ✅ | ✖ | — | HIGH | ADD | M |

## 2.40 E-COMMERCE (agar kerak bo'lsa)

> **Optional.** Ichki korporativ platforma uchun hozircha kerak emas.
> Phase 10 sifatida rezervda qoldiriladi; hech qanday model oldindan qurilmaydi.

| Feature | Prio | Izoh |
|---|---|---|
| Kurs narxi / bepul-pullik | LOW | `course.price`, `course.isPaid` |
| Checkout / to'lov provayderi | LOW | Payme / Click / Uzum (mahalliy) |
| Kupon / chegirma / invoys / buyurtma | LOW | `+Order`, `+Coupon` |
| To'lovdan keyin avto-enroll | LOW | `courseAssignment` qayta ishlatiladi |
| Refund | LOW | — |

## 2.41 AUTOMATION

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Avtomatik enrollment | ✅ | ◐ | Publish'da auto-assign + guruh | HIGH | EXTEND (`+EnrollmentRule` dvigateli) | L |
| Avtomatik kurs biriktirish (rol/bo'lim o'zgarganda) | ✅ | ✖ | Yo'q | HIGH | ADD (user update hook → qoidalarni qayta baholash) | M |
| Avtomatik onboarding | ✅ | ✖ | — | HIGH | ADD (§2.10, `hireDate` trigger) | M |
| Avtomatik eslatmalar | ✅ | ✅ | `reminderJob` (15 daq, kurs+task) | — | KEEP | — |
| Avtomatik sertifikat | ✅ | ✖ | — | CRITICAL | ADD (§2.18) | M |
| Sertifikat muddati eslatmasi | ✅ | ✖ | — | HIGH | ADD | S |
| Avtomatik qayta o'qitish | ✅ | ✖ | — | HIGH | ADD (§2.43) | M |
| Rejalashtirilgan hisobotlar | ✅ | ✖ | — | HIGH | ADD (§2.21) | M |
| Avtomatik deaktivatsiya | ✅ | ✅ | `terminationDate` → `isActive=false` | — | KEEP | — |
| Avtomatik rol biriktirish | ✅ | ✖ | — | MEDIUM | ADD | M |
| Tadbir eslatmalari | ✅ | ✖ | — | HIGH | ADD (§2.14) | S |
| Workflow trigger'lari (umumiy) | ✅ | ✖ | Har bir avtomatlashtirish qo'lda kodlangan | MEDIUM | ADD (`+AutomationRule`: trigger→condition→action) | L |

## 2.42 RECOMMENDATION SYSTEM

| Feature | iSp | Biz | Prio | Amal | Izoh |
|---|---|---|---|---|---|
| Tavsiya etilgan kurslar | ✅ | ✖ | MEDIUM | ADD | `recommendation.service` — qoidaga asoslangan, ML emas |
| Rolga / bo'limga asoslangan | ✅ | ✖ | MEDIUM | ADD | "Sizning lavozimdagilar ko'p o'qigan kurslar" |
| Ko'nikmaga asoslangan | ✅ | ✖ | LOW | ADD | `Competency` gap tahlili (§2.19) |
| Prerequisite tavsiyasi | ✅ | ✖ | MEDIUM | ADD | §2.1 prerequisite'lardan |
| Tugatilmagan kurs tavsiyasi | ✅ | ◐ | MEDIUM | EXTEND | `continueLearning` **mavjud** — kengaytirish |
| Shaxsiy o'quv oqimi | ✅ | ✖ | LOW | ADD | Feed = tavsiya + yangilik + deadline |

## 2.43 COMPLIANCE TRAINING

| Feature | iSp | Biz | Hozirgi | Prio | Amal | CX |
|---|---|---|---|---|---|---|
| Majburiy kurslar | ✅ | ✅ | `assignment.mandatory` | — | KEEP | — |
| Compliance deadline'lari | ✅ | ✅ | `assignment.deadline` | — | KEEP | — |
| Takroriy o'qitish (recurring) | ✅ | ✖ | **Yo'q** | CRITICAL | ADD (`+RecurringAssignment`: interval, keyingi sana) | M |
| Yillik qayta sertifikatsiya | ✅ | ✖ | — | CRITICAL | ADD (sertifikat muddati → yangi assignment) | M |
| Sertifikat muddati | ✅ | ✖ | — | CRITICAL | ADD (§2.18) | — |
| Compliance dashboard | ✅ | ✖ | — | HIGH | ADD (`ComplianceView`: kurs × xodim matritsasi) | M |
| Kechikkan foydalanuvchilar | ✅ | ◐ | `overdueAssignments` soni bor, ro'yxat yo'q | HIGH | EXTEND | S |
| Compliance hisobotlari | ✅ | ✖ | — | CRITICAL | ADD (audit-ready: kim, qachon, qaysi versiya, imzo) | M |
| Audit-ready hisobot | ✅ | ✖ | — | CRITICAL | ADD (immutable snapshot + eksport) | M |
| Avtomatik eslatmalar | ✅ | ◐ | Kurs deadline'i uchun bor | HIGH | EXTEND | S |

## 2.44 PERFORMANCE TRACKING

| Feature | iSp | Biz | Prio | Amal | Izoh |
|---|---|---|---|---|---|
| O'quv progressi | ✅ | ✅ | — | KEEP | Eng kuchli tomonimiz |
| Kompetensiya / ko'nikma progressi | ✅ | ✖ | MEDIUM | ADD | §2.19 `Competency` |
| Baholash natijalari | ✅ | ✅ | — | KEEP | Attempt'lar |
| Rivojlanish maqsadlari | ✅ | ✖ | MEDIUM | ADD | §2.11 |
| Manager feedback | ✅ | ✖ | MEDIUM | ADD | §2.11 review |
| 360 feedback / OJT | ✅ | ✖ | MEDIUM | ADD | §2.19–2.20 |
| Sertifikat statusi | ✅ | ✖ | CRITICAL | ADD | §2.18 |
| Xodim samaradorlik profili | ✅ | ◐ | HIGH | EXTEND | `GET /users/:id/performance` **mavjud** — kompetensiya+sertifikat qo'shiladi |

## 2.45 USER EXPERIENCE

| Feature | iSp | Biz | Hozirgi | Amal |
|---|---|---|---|---|
| Toza learner dashboard | ✅ | ✅ | `HomeView` | KEEP |
| Responsive UI | ✅ | ✅ | Tailwind + `BottomNav` | KEEP |
| Tez navigatsiya | ✅ | ✅ | Code splitting, 438 KB entry | KEEP |
| Breadcrumbs | ✅ | ✖ | Yo'q | ADD (MEDIUM, S) |
| Qidiruv / filtrlar | ✅ | ◐ | Har sahifada alohida | EXTEND (§2.26) |
| Progress bar'lar | ✅ | ✅ | `ProgressBar`, `ProgressRing` | KEEP |
| Empty / loading / error states | ✅ | ✅ | `EmptyState`, `Skeleton`, `ErrorState`, `TabError` | KEEP — **iSpring'dan izchilroq** |
| Confirm dialoglar | ✅ | ✅ | `useConfirm` + `ConfirmDialog` | KEEP |
| Toast | ✅ | ✅ | `useToast` + `ToastHost` | KEEP |
| Klaviatura kirish imkoniyati | ✅ | ◐ | §2.39 | EXTEND |
| Dark / light rejim | ✅ | ✅ | `stores/theme.js` | KEEP |
| Command palette (⌘K) | ✅ | ✖ | — | ADD (§2.26) |

## 2.46 DATA MODEL — mavjud modellar auditi

**Mavjud 30 model:** `user, role, permission, branch, orgList, group, course,
topic, video, material, assessment, quiz, courseAssignment, videoProgress,
materialProgress, videoSession, videoAnalyticsEvent, quizAttempt,
assessmentAttempt, assessmentSession, pointsLedger, courseQuestion,
courseReview, news, newsView, task, event, notification, auditLog, session,
faceProfile, faceVerificationChallenge, facePolicy, attentionPolicy,
proctorSnapshot, conversation, chatMessage, aiChatMessage, dashboardCache`

| Topilma | Baho | Amal |
|---|---|---|
| Layered arxitektura (controller→service→repository→model) izchil saqlangan | ✅ Juda yaxshi | KEEP |
| Indekslar hot query'larga mos, TTL bilan o'sish chegaralangan | ✅ Juda yaxshi | KEEP |
| Unique compound indekslar integrity constraint sifatida ishlatilgan | ✅ Juda yaxshi | KEEP |
| `PointsLedger` idempotentligi sparse unique indeks bilan | ✅ Juda yaxshi | KEEP |
| **`Quiz` va `Assessment` savol sxemasi dublikat** (`quiz.model.js` va `assessment.model.js` da bir xil `optionSchema`/`questionSchema`) | ⚠️ Dublikat | REFACTOR → yagona `Question` |
| **Audit maydonlari nomuvofiq**: `createdBy/updatedBy` — course/topic/video/material/assessment/group'da bor; `task/event/notification/news`da qisman; `quiz`da bor, `quizAttempt`da yo'q | ⚠️ Nomuvofiq | Standartlashtirish |
| **`deletedAt/deletedBy` faqat `course` va `news`da** | ⚠️ Qisman | Kengaytirish (`user`, `topic`, `video`, `material`) |
| **`user.managerId` yo'q** — ierarxiya qurib bo'lmaydi | ❌ Kritik bo'shliq | ADD |
| **`orgId`/tenant yo'q** — multi-tenant bo'lolmaydi | ⚠️ Arxitektura chegarasi | Faqat kerak bo'lsa (XL) |
| **Kontent turlari polimorf emas** — har biri o'z modeli, `topicContent.service` qo'lda birlashtiradi | ⚠️ Kengaytirish qiyin | REFACTOR → `ContentItem` bazasi |
| `Event.participants` — `ObjectId[]`, join modeli yo'q → status/davomat saqlab bo'lmaydi | ⚠️ Yetarli emas | ADD `EventRegistration` |
| `news.content` — "plain text/markdown-lite by design" | ✅ Xavfsizlik uchun to'g'ri qaror | KEEP (KB uchun sanitize'langan HTML alohida) |
| `dashboardCache` — pre-aggregation modeli | ✅ Yaxshi naqsh | Yangi dashboard'larga ham qo'llash |
| Normalizatsiya: `department/branch/position` **nom bo'yicha** saqlanadi, ID bo'yicha emas | ◐ Ataylab (izohlarda asoslangan) | KEEP, lekin rename'da migratsiya skripti kerak |

## 2.47 BACKEND — mavjud kod auditi

| Qatlam | Holat | Topilma |
|---|---|---|
| Controllers (30) | ✅ | Yupqa, faqat HTTP — qoida buzilmagan |
| Services (45) | ✅ | Domen bo'yicha ajratilgan, biznes mantiq shu yerda |
| Repositories (30) | ✅ | Barcha DB kirish shu yerda |
| Validators (24, zod) | ✅ | Har bir yozuv endpoint'i validatsiya qilinadi |
| Middlewares (17) | ✅ | 11 ta alohida rate limiter — juda batafsil |
| Jobs (4 queue) | ◐ | Video, dashboard, reminder bor; **mail, export, certificate, compliance queue'lari kerak** |
| Realtime (socket.io) | ◐ | Ishlaydi; **Redis adapter yo'q** → bir nechta instansiyada buziladi |
| Storage | ✅ | Provider abstraksiyasi toza |
| **E-mail qatlami** | ❌ | **Umuman yo'q** |
| **OpenAPI** | ❌ | Yo'q — `zod` sxemalaridan generatsiya qilish mumkin |
| **Testlar** | ❌ | Faqat 3 fayl (`security`, `faceVerification`, `facePolicy`). Kurs/test/progress/hisobot mantiqi qoplanmagan |
| Error handling | ✅ | `ApiError` + `asyncHandler` + markaziy `errorHandler` |
| Logging | ✅ | winston + `requestLogger` |
| Caching | ✅ | Redis, `utils/cache.js` |

## 2.48 FRONTEND — mavjud kod auditi

| Qatlam | Holat | Topilma |
|---|---|---|
| Sahifalar (learner 18 + admin 18) | ✅ | Ikkala panel bitta bundle'da, `/bos` prefiksi bilan |
| UI komponentlar (24 ta `components/ui`) | ✅ | Izchil dizayn tizimi: `AppButton`, `AppInput`, `Modal`, `Drawer`, `Skeleton`, `EmptyState`, `ErrorState`, `Pagination`, `Tabs`, `Toast` |
| Layout / routing | ✅ | Ikki shell (`AppShell`, `AdminShell`), guard'lar, code splitting |
| State (Pinia) | ◐ | Faqat 4 store (`auth`, `chat`, `theme`, `ui`) — qolgan hammasi komponent ichida `ref` + service chaqiruvi. **Yangi domenlar uchun yetarli emas** |
| Formalar | ◐ | Qo'lda validatsiya; **umumiy form abstraksiyasi yo'q** |
| Jadvallar | ◐ | Har sahifada qo'lda `<table>`; **`DataTable` komponenti yo'q** (saralash/tanlash/ustun sozlash takrorlanadi) |
| Grafiklar | ◐ | `TrendChart` (custom SVG), `RankedListCard` — kutubxonasiz. Yangi analitika uchun **kengaytirish yoki kutubxona** kerak |
| i18n | ✅ | 3 til, 1393 kalit, to'liq |
| Responsive | ✅ | Mobil grid, `BottomNav` |
| Loading / error states | ✅ | Izchil |
| Permissions UI | ✅ | `meta.permission` + `v-if` |
| **Accessibility** | ❌ | ARIA, focus-trap, alt text yo'q |
| **PWA** | ❌ | Manifest/SW yo'q |
| **Dead code** | ⚠️ | `admin/` papkasi (front ichiga birlashtirilgan, lekin o'chirilmagan) — **o'chirish kerak** |

## 2.49 REPORTING UI

| Feature | Biz | Hozirgi | Prio | Amal |
|---|---|---|---|---|
| Qayta ishlatiladigan report builder | ✖ | `ReportsView` — 5 ta qat'iy tur | MEDIUM | ADD (§2.21) |
| Sana filtri | ✅ | `dateFrom/dateTo` | — | KEEP |
| Tashkilot / bo'lim / guruh filtri | ✖ | Yo'q | HIGH | ADD |
| Foydalanuvchi / kurs filtri | ✅ | `userId`, `courseId` | — | KEEP |
| Status filtri | ◐ | Qisman | MEDIUM | EXTEND |
| Eksport | ✅ | CSV/XLSX/PDF, 3 til | — | KEEP |
| Rejalashtirilgan hisobotlar | ✖ | — | HIGH | ADD |
| Grafiklar | ◐ | Dashboard'da bor, hisobotlarda yo'q | MEDIUM | EXTEND |
| Jadvallar | ✅ | Bor | — | KEEP |
| Drill-down | ✅ | Chuqur | — | KEEP |

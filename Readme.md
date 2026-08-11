> **Project docs**: see [`docs/architecture.md`](docs/architecture.md) for the
> system architecture, data model, API contract, auth/RBAC, video streaming,
> analytics, security threat model, and roadmap derived from this spec.
> This file is the original master spec — kept verbatim below as the source
> of truth for requirements.

# CORPORATE LMS / EMPLOYEE TRAINING PLATFORM — MASTER DEVELOPMENT PROMPT

Sen senior-level **Full-Stack Architect, Security Engineer, DevOps Engineer, Backend Engineer va Vue.js Engineer** sifatida ishlaysan.

Men kompaniyamiz uchun ichki foydalaniladigan, xodimlarni o‘qitish, kurslar, videodarslar, company news, task/event, AI assistant va juda chuqur analytics tizimiga ega bo‘lgan **Corporate LMS Platform** qurmoqchiman.

Loyiha production-ready bo‘lishi kerak.

## 1. ASOSIY STACK

### Frontend

* Vue 3
* Vite
* Vue Router
* Pinia
* TailwindCSS
* TypeScript
* Axios
* Vue I18n
* Chart.js yoki ECharts
* Video.js yoki professional HLS-compatible player
* Responsive design
* PWA architecture imkoniyatini hisobga olish

### Backend

* Node.js
* Express.js
* TypeScript
* MongoDB
* Mongoose
* Multer faqat kerakli upload layer uchun
* JWT yoki secure session architecture
* bcrypt/argon2
* Helmet
* Rate limiting
* CORS
* CSRF protection kerak bo‘ladigan joylarda
* Zod/Joi orqali validation
* Winston/Pino logging

### Video

Oddiy MP4 faylni frontendga berish mumkin emas.

Production architecture:

* Original video upload
* Resumable/chunked upload
* Video processing
* FFmpeg
* HLS yoki MPEG-DASH
* Multiple quality levels
* Adaptive bitrate streaming
* Signed/short-lived playback URLs
* Authorization before playback
* HTTP Range support
* Video metadata extraction
* Thumbnail generation
* Poster/banner generation
* Video duration detection
* Upload progress
* Processing status
* Failed processing retry
* Storage abstraction

Videolar 1–2 GB yoki undan katta bo‘lishi mumkin.

Shuning uchun:

* browser uploadni to‘liq RAMga yuklamaslik
* server RAMini bosmaslik
* stream-based processing
* chunk upload
* resumable upload
* background video processing
* FFmpeg queue architecture
* storage abstraction

ishlat.

Storage keyinchalik:

* local storage
* S3-compatible storage
* MinIO
* Cloudflare R2
* AWS S3

ga almashtirilishi mumkin bo‘ladigan qilib yozilsin.

---

# 2. MUHIM XAVFSIZLIK TALABI

Bu platformada SECURITY — birinchi o‘rinda.

Frontend'da F12 yoki DevTools'ni bloklashni asosiy security sifatida ishlatma.

Browser'dagi F12, DevTools, screenshot, screen recording va boshqa client-side imkoniyatlarni 100% bloklab bo‘lmaydi.

Shuning uchun haqiqiy security architecture yarat:

### Video protection

User:

* video URLni ko‘ra olmasligi
* direct MP4 URL olmasligi
* storage URLni uzoq vaqt ishlata olmasligi
* boshqa user URLidan foydalana olmasligi
* boshqa domain orqali playback qila olmasligi

kerak.

Buning uchun:

* short-lived signed playback token
* signed manifest URL
* authorization middleware
* user/course/video permission validation
* referer/origin checks faqat qo‘shimcha layer sifatida
* CORS
* CSP
* secure cookies yoki secure token architecture
* rate limiting
* token expiration
* token rotation
* anti-hotlinking
* storage private bucket
* direct public access disabled

ishlat.

Agar imkon bo‘lsa:

* encrypted HLS
* AES-128 yoki mos encryption
* key endpoint authorization
* watermarking

qo‘llanilsin.

Har bir video playback vaqtida user identity bilan bog‘langan dinamik watermark bo‘lishi mumkin:

`USER NAME`
`USER ID`
`COMPANY`
`CURRENT TIMESTAMP`

Bu screen recordingni to‘liq to‘xtatmaydi, lekin leak bo‘lganda manbani aniqlashga yordam beradi.

F12/DevTools bloklash faqat UX deterrent sifatida bo‘lishi mumkin, lekin hech qachon security boundary sifatida hisoblanmasin.

---

# 3. AUTHENTICATION

Userlarda public register page bo‘lmaydi.

Faqat SuperAdmin userlarni yaratadi.

Login:

* username/email
* password
* CAPTCHA
* rate limiting
* brute-force protection
* account lockout
* login attempt logging
* session management
* logout
* refresh token rotation yoki secure session
* password hashing
* password reset

SuperAdmin seed orqali avtomatik yaratiladi.

Seed credentials `.env` orqali boshqarilsin.

Masalan:

SUPERADMIN_EMAIL
SUPERADMIN_PASSWORD

Production'da default password ishlatilmasin.

---

# 4. RBAC

Quyidagi role architecture bo‘lsin:

* SUPERADMIN
* ADMIN
* MANAGER
* EMPLOYEE
* CALL_OPERATOR
* SELLER

Lekin architecture yangi role qo‘shishga tayyor bo‘lsin.

Har bir role uchun:

* permissions
* routes
* pages
* courses
* news
* reports
* tasks

access control qilinsin.

Frontend route guard + backend authorization ikkalasi ham bo‘lsin.

Frontend security backend security o‘rnini bosmasin.

Unauthorized:

* 401 page

Forbidden:

* 403 page

Not Found:

* 404 page

bo‘lsin.

---

# 5. EMPLOYEE CREATION

SuperAdmin/Admin/Manager user yaratishi mumkin.

User yaratishda:

* full name
* username
* email
* phone
* role
* department
* position
* avatar
* password
* active/inactive
* assigned courses
* mandatory courses
* optional courses
* course deadline
* access start date
* access end date

belgilanishi mumkin.

Masalan:

CALL_OPERATOR:

Mandatory:

* Sales Basics
* Call Communication
* CRM
* Customer Psychology

Optional:

* Advanced Sales
* Negotiation
* Leadership

---

# 6. COURSE ARCHITECTURE

Course ichida:

Course
→ Topics / Modules
→ Videos

bo‘ladi.

Har bir topic uchun:

* title
* slug
* description
* cover
* banner
* order
* status
* duration
* createdBy
* updatedBy

Video uchun:

* title
* description
* video file
* poster/banner
* duration
* file size
* source
* order
* status
* processing status
* required/optional
* createdAt
* updatedAt

Course quyidagilarni o‘z ichiga olishi mumkin:

* video lessons
* documents
* links
* quizzes
* assignments
* discussions
* AI chat

---

# 7. COURSE ASSIGNMENT

Admin userga course biriktira oladi.

Assignment:

* user
* course
* mandatory/optional
* assignedAt
* startAt
* deadline
* expiresAt
* status

Course deadline o'tgandan keyin:

user course'ni ochishga urinishi mumkin emas.

Admin dashboardda:

"Course access expired"

notification paydo bo‘lsin.

Agar user deadline o'tishidan oldin course'ni to‘liq tugatmagan bo‘lsa:

dashboard'da:

* overdue
* incomplete
* expired

statuslari ko‘rinsin.

---

# 8. VIDEO ANALYTICS — ENG MUHIM QISM

Har bir video uchun juda chuqur analytics kerak.

Backend event-based analytics architecture yarat.

Frontend video player quyidagi eventlarni yuborishi kerak:

* play
* pause
* resume
* seek
* seeking
* seeked
* progress
* buffering
* waiting
* ended
* playbackRateChanged
* qualityChanged
* fullscreen
* visibilitychange
* tabHidden
* tabVisible
* pageLeave
* pageReturn
* heartbeat

Lekin har bir sekund uchun MongoDB'ga alohida document yozib DBni o‘ldirma.

Efficient batching architecture yarat.

Masalan heartbeat:

har 5–15 sekundda batch event yuborish.

Frontend local buffer:

events[]

keyin batch API:

POST /analytics/video/events

orqali yuboriladi.

---

# 9. VIDEO REPORT

Admin user profiliga kirganda:

## Video Progress

Har bir video:

* watched percentage
* watched seconds
* total duration
* remaining seconds
* first watched at
* last watched at
* completed at
* number of plays
* number of pauses
* number of seeks
* forward seek duration
* backward seek duration
* buffering duration
* tab switches
* hidden duration
* active watching duration
* total session duration
* completion status

ko‘rsatilishi kerak.

Masalan:

Video:
"Effective Sales Call"

Duration:
42:15

User:
Azamjon

Progress:
78%

Watched:
32:54

Skipped:
04:21

Pause:
17 times

Tab switched:
5 times

Sessions:
4

First watched:
2026-08-10 14:21

Last watched:
2026-08-11 03:45

Completed:
NO

---

# 10. ANTI-SKIP / WATCH VALIDATION

Faqat video player `currentTime`ga qarab progress hisoblama.

Aks holda user videoni oxiriga seek qilib:

`currentTime = 2500`

qilib 100% qilib qo‘yishi mumkin.

Watched segments architecture yarat.

Masalan:

0–30 sec
30–60 sec
60–90 sec

qaysi segment haqiqatan playback qilinganini track qil.

Shunda:

Total watched time

va

Unique watched time

alohida hisoblanadi.

Masalan:

Video duration:
60 min

User:
90 min player ochgan

Unique watched:
43 min

Repeated watching:
47 min

Actual completion:
71.6%

---

# 11. TAB SWITCH ANALYTICS

Browser:

`visibilitychange`

va Page Visibility API orqali:

* tab hidden
* tab visible

eventlarini track qil.

Report:

* total tab switches
* total hidden time
* longest hidden period
* timestamps

ko‘rsatsin.

Lekin buni "user video ko‘rmaganining 100% isboti" deb ko‘rsatma.

Status:

"Detected inactive tab time"

deb ko‘rsat.

---

# 12. SESSION ANALYTICS

Har bir video session:

* sessionId
* userId
* courseId
* topicId
* videoId
* startedAt
* endedAt
* activeDuration
* hiddenDuration
* watchedDuration
* completed

saqlasin.

---

# 13. NEWS SYSTEM

Company News bo‘limi bo‘lsin.

Admin:

* news yaratadi
* title
* cover
* content
* images
* attachments
* tags
* department targeting
* role targeting
* publish date
* expiry date

belgilaydi.

Employee news feed ko‘radi.

---

# 14. NEWS ANALYTICS

News uchun ham analytics kerak.

Track:

* opened
* firstOpenedAt
* lastOpenedAt
* read percentage
* scroll depth
* maximum scroll depth
* time spent
* fast scroll
* slow scroll
* returned to article
* completed reading

Masalan:

News:
"Company Annual Meeting"

User:
John

Opened:
YES

Read:
92%

Max Scroll:
96%

Time spent:
4m 32s

Opened:
2 times

Completed:
YES

---

# 15. SCROLL ANALYTICS

Scroll eventni har pixelda MongoDBga yozma.

Throttle/debounce ishlat.

Masalan:

25%
50%
75%
90%
100%

milestones saqlash mumkin.

Qo‘shimcha:

* scroll velocity
* max depth
* time between milestones

hisoblash mumkin.

---

# 16. ADMIN DASHBOARD

Dashboard professional analytics dashboard bo‘lsin.

Cards:

* Total Employees
* Active Employees
* Courses
* Mandatory Courses
* Completed Courses
* Overdue Courses
* Average Completion
* Average Watch Time
* News Engagement
* Active Sessions

Charts:

* Course completion
* Employee progress
* Watch time
* Most skipped videos
* Most paused videos
* Most difficult courses
* Most engaged employees
* Lowest engagement
* News engagement
* Task completion

---

# 17. EMPLOYEE DETAIL REPORT

Admin userni tanlaydi:

Employee Profile

Tabs:

1. Overview
2. Courses
3. Video Analytics
4. News Analytics
5. Tasks
6. Events
7. Activity Timeline
8. Security / Sessions

Activity timeline:

2026-08-11 02:21
Opened "Sales Basics"

2026-08-11 02:25
Paused video

2026-08-11 02:27
Changed tab

2026-08-11 02:30
Resumed video

2026-08-11 02:47
Completed module

---

# 18. TASK & EVENT SYSTEM

Admin/Manager userga task bera oladi.

Task:

* title
* description
* assignedTo
* assignedBy
* priority
* deadline
* attachments
* status
* createdAt
* completedAt

Status:

* TODO
* IN_PROGRESS
* COMPLETED
* OVERDUE
* CANCELLED

User dashboardda task ko‘rinadi.

Admin task completion reportini ko‘radi.

---

# 19. EVENT SYSTEM

Company eventlar:

* meeting
* training
* seminar
* event
* announcement

bo‘lishi mumkin.

Calendar view kerak.

---

# 20. AI CHATBOT

Har bir course/topic/video uchun AI Chat bo‘limi bo‘lsin.

User:

"Bu videoda nima tushuntirildi?"

"3 ta asosiy point ayt"

"Test tuzib ber"

deb so‘rashi mumkin.

AI faqat user access qilishi mumkin bo‘lgan materiallar bilan ishlasin.

AI endpointda authorization bypass bo‘lmasin.

Chat history:

* userId
* courseId
* topicId
* videoId
* messages
* createdAt

saqlanishi mumkin.

---

# 21. COURSE SOURCE / CHAT

Har bir video:

* source
* related links
* discussion/chat

ga ega bo‘lishi mumkin.

---

# 22. MULTILINGUAL

3 ta til:

* Uzbek
* Russian
* English

Vue I18n orqali.

Textlar hardcode qilinmasin.

Backend error messages ham localization architecturega tayyor bo‘lsin.

---

# 23. DARK / LIGHT MODE

Theme:

* Dark
* Light

bo‘lsin.

User preference saqlansin.

Design:

**Minimalism + Maximalism hybrid**

bo‘lsin.

Ya'ni:

* clean layout
* minimal navigation
* strong typography
* large analytics numbers
* detailed dashboards
* modern cards
* subtle glass effects
* professional corporate UI
* smooth micro animations

Lekin haddan tashqari gradient, neon, gaming UI bo‘lmasin.

Enterprise product ko‘rinishi kerak.

---

# 24. FRONTEND PAGES

Kamida quyidagi pages bo‘lsin:

/login

/403

/404

/dashboard

/courses

/courses/:id

/courses/:courseId/topics/:topicId

/videos/:id

/news

/news/:id

/tasks

/events

/profile

/settings

/admin

/admin/users

/admin/users/:id

/admin/courses

/admin/courses/create

/admin/courses/:id

/admin/courses/:id/analytics

/admin/videos

/admin/news

/admin/news/:id/analytics

/admin/tasks

/admin/reports

/admin/activity

/admin/settings

SuperAdmin uchun:

/superadmin/users

/superadmin/roles

/superadmin/permissions

/superadmin/audit-logs

---

# 25. API ARCHITECTURE

REST API clean architecture bo‘lsin.

Masalan:

/api/v1/auth

/api/v1/users

/api/v1/roles

/api/v1/permissions

/api/v1/courses

/api/v1/topics

/api/v1/videos

/api/v1/video-access

/api/v1/video-stream

/api/v1/analytics

/api/v1/video-analytics

/api/v1/news

/api/v1/news-analytics

/api/v1/tasks

/api/v1/events

/api/v1/notifications

/api/v1/ai

/api/v1/audit

---

# 26. MONGODB DATA MODEL

MongoDB collections:

users
roles
permissions
courses
topics
videos
courseAssignments
videoProgress
videoSessions
videoAnalyticsEvents
news
newsViews
newsAnalytics
tasks
events
notifications
auditLogs
sessions
aiChats

Schema'larni normalization va performance balansida loyihala.

Har bir analytics collection uchun indexing strategy yoz.

Masalan:

userId
courseId
videoId
createdAt

compound indexes.

---

# 27. AUDIT LOG

Admin qilgan muhim actionlar log qilinsin.

Masalan:

ADMIN created user

ADMIN assigned course

ADMIN changed deadline

ADMIN deleted video

MANAGER changed task

SUPERADMIN changed permission

Har bir log:

* actor
* action
* entity
* entityId
* metadata
* IP
* userAgent
* timestamp

---

# 28. NOTIFICATIONS

Notification system:

* course assigned
* deadline approaching
* course expired
* task assigned
* task overdue
* news published
* event created
* course completed
* admin alert

bo‘lsin.

Admin dashboardda:

"John's Sales course expired without completion"

kabi notification chiqsin.

---

# 29. VIDEO EXPIRATION NOTIFICATION

Agar admin:

Course access:

Start:
2026-08-01

End:
2026-08-10

qilsa va user course'ni tugatmasa:

course expired.

Admin dashboard:

⚠️ Course Expired

Employee:
John Doe

Course:
Sales Training

Progress:
62%

Last activity:
2026-08-09 18:42

bo‘lsin.

---

# 30. VIDEO UPLOAD UI

Admin video upload qilganda:

* drag & drop
* file validation
* upload progress
* chunk progress
* pause upload
* resume upload
* cancel upload
* processing progress
* thumbnail
* duration
* file size
* quality levels
* status

ko‘rsatilsin.

1–2 GB video upload paytida browser freeze bo‘lmasin.

---

# 31. VIDEO PROCESSING PIPELINE

Pipeline:

UPLOAD
↓
VALIDATE
↓
STORE ORIGINAL
↓
FFPROBE METADATA
↓
FFMPEG TRANSCODE
↓
360p
480p
720p
1080p
↓
HLS SEGMENTS
↓
PLAYLIST
↓
THUMBNAIL
↓
POSTER
↓
READY

Processing background worker orqali ishlasin.

HTTP request ichida FFmpegni bloklab qo‘yma.

---

# 32. STREAMING

Video playback:

Frontend
↓
Authorization API
↓
Short-lived playback token
↓
Manifest
↓
HLS segments
↓
Authorized storage/CDN

Direct original MP4 public bo‘lmasin.

---

# 33. CORS

CORS strict bo‘lsin.

Allowed origins `.env` orqali:

ALLOWED_ORIGINS=

Wildcard:

`*`

production'da ishlatilmasin.

Credentials kerak bo‘lsa secure configuration ishlat.

---

# 34. SECURITY HEADERS

Helmet:

* CSP
* HSTS
* X-Content-Type-Options
* Referrer-Policy
* Permissions-Policy

va boshqa kerakli security headers.

---

# 35. RATE LIMITING

Alohida rate limits:

* login
* password reset
* video token
* video stream
* analytics
* AI
* upload

uchun.

AI endpoint juda ko‘p requestdan himoyalansin.

---

# 36. FILE SECURITY

Upload qilingan faylga faqat extensionga ishonma.

Tekshir:

* MIME type
* magic bytes
* file signature
* file size
* extension
* malicious file possibilities

Video upload:

MP4
MOV
MKV
WEBM

kabi formatlardan xavfsiz processing pipeline orqali o'tkazilsin.

Original file public bo‘lmasin.

---

# 37. ERROR HANDLING

Global backend error handler.

Standard response:

{
success: false,
message: "...",
code: "...",
data: null
}

Success:

{
success: true,
message: "...",
data: {}
}

Frontend global error handling bo‘lsin.

---

# 38. PERFORMANCE

Performance juda muhim.

MongoDB analytics uchun:

* indexes
* aggregation pipelines
* pagination
* cursor pagination
* batching
* caching

ishlat.

Redis architecture qo‘shishga tayyor qil.

Dashboard analytics querylari database'ni qiynamasin.

Heavy reports uchun pre-aggregation yoki scheduled aggregation architecture ko‘rib chiq.

---

# 39. CACHING

Cache:

* course metadata
* topic metadata
* permissions
* frequently accessed news
* dashboard statistics

uchun ishlatilishi mumkin.

Lekin user-specific sensitive data noto‘g‘ri cache qilinmasin.

---

# 40. CLEAN ARCHITECTURE

Backend:

controllers
services
repositories
models
middlewares
validators
routes
utils
config
workers
jobs
analytics
storage
video

kabi layerlarga ajratilsin.

Controller ichida katta business logic yozma.

---

# 41. FRONTEND ARCHITECTURE

Vue:

components
layouts
views
stores
composables
services
router
guards
types
utils
i18n
analytics
video

strukturasi bo‘lsin.

API calls components ichiga aralashtirilmasin.

---

# 42. ANALYTICS EVENT SCHEMA

Analytics event universal schema bo‘lsin:

{
userId,
sessionId,
entityType,
entityId,
eventType,
timestamp,
position,
duration,
metadata,
device,
browser
}

Future'da yangi event qo‘shish oson bo‘lsin.

---

# 43. PRIVACY

Employee monitoring tizimi bo‘lgani uchun analyticsni haddan tashqari intrusive qilmaslik kerak.

Faqat platformadagi activity track qilinsin.

Operating systemdagi boshqa activity, boshqa browser tablarning URL'lari, private data va boshqa saytlar kuzatilmasin.

Userga privacy policy / monitoring notice ko‘rsatish architecture'da hisobga olinsin.

---

# 44. REPORT EXPORT

Admin:

CSV
Excel
PDF

formatlarda report export qila olishi mumkin.

Reports:

* employee progress
* course progress
* video analytics
* news analytics
* task analytics

---

# 45. SEARCH & FILTER

Admin:

User search
Role filter
Department filter
Course filter
Progress filter
Status filter
Date range

qila olsin.

---

# 46. DASHBOARD DRILL-DOWN

Dashboarddagi:

"42% incomplete"

ustiga bosilganda:

incomplete employee list

ochilsin.

Employee ustiga bosilganda:

employee detailed report.

Video ustiga bosilganda:

video analytics.

---

# 47. NOTIFICATION CENTER

Notification:

* unread/read
* timestamp
* type
* severity
* related entity

bo‘lsin.

---

# 48. DEPLOYMENT

Production architecture uchun:

Nginx
Node.js
PM2 yoki Docker
MongoDB
Redis
FFmpeg
private storage

hisobga olinsin.

HTTPS majburiy.

Environment:

.env
.env.example

bo‘lsin.

Secrets source code'ga yozilmasin.

---

# 49. LOGGING

Production loglar:

* request
* response status
* error
* auth failure
* suspicious activity
* upload
* video playback authorization
* admin action

uchun.

Password/tokenlarni log qilma.

---

# 50. SECURITY TESTING

Development yakunida:

* authentication tests
* authorization tests
* IDOR tests
* privilege escalation tests
* CORS tests
* upload tests
* rate-limit tests
* JWT/session tests
* expired course access tests
* video authorization tests
* signed URL expiration tests
* path traversal tests
* injection tests
* XSS tests
* CSRF tests
* file upload abuse tests

uchun test cases yoz.

---

# 51. IDOR PROTECTION

Masalan:

GET /api/v1/users/123/courses

user 123 boshqa userning ID'sini URLga yozib ma'lumotini ola olmasligi kerak.

Har bir endpointda:

Authentication
+
Authorization
+
Resource ownership/access check

bo‘lsin.

---

# 52. CRITICAL RULE

Frontend'dagi:

* hidden buttons
* disabled buttons
* route guards
* F12 blocking
* DevTools blocking

SECURITY EMAS.

Barcha security backend'da enforce qilinsin.

---

# 53. DEVELOPMENT PROCESS

Darhol 20 ta fayl yaratib kod yozishni boshlama.

Avval quyidagilarni qil:

### STEP 1

To‘liq system architecture ishlab chiq.

### STEP 2

Database ER/data relationship diagram yoz.

### STEP 3

Backend folder structure.

### STEP 4

Frontend folder structure.

### STEP 5

API contract.

### STEP 6

Authentication/RBAC architecture.

### STEP 7

Video storage + streaming architecture.

### STEP 8

Analytics event architecture.

### STEP 9

Security threat model.

### STEP 10

Development roadmap.

Shundan keyingina implementatsiyani boshlagin.

---

# 54. DEVELOPMENT PHASES

Projectni quyidagi bosqichlarda qur:

## PHASE 1

Foundation

* project setup
* TypeScript
* MongoDB
* Express
* Vue
* Tailwind
* environment
* logging
* error handling

## PHASE 2

Auth + RBAC

## PHASE 3

Users

## PHASE 4

Courses

## PHASE 5

Video upload

## PHASE 6

Video processing

## PHASE 7

Secure streaming

## PHASE 8

Video analytics

## PHASE 9

News

## PHASE 10

News analytics

## PHASE 11

Tasks & Events

## PHASE 12

Notifications

## PHASE 13

AI Chat

## PHASE 14

Admin analytics

## PHASE 15

Reports

## PHASE 16

Security hardening

## PHASE 17

Performance optimization

## PHASE 18

Production deployment

---

# 55. CODE QUALITY

Kod:

* TypeScript strict mode
* reusable
* modular
* readable
* maintainable
* scalable
* production-ready

bo‘lsin.

`any`ni imkon qadar ishlatma.

Magic numbers/stringlarni constants'ga chiqar.

---

# 56. IMPORTANT

Har bir feature uchun:

1. database schema
2. backend API
3. authorization
4. frontend UI
5. validation
6. error handling
7. loading state
8. empty state
9. security
10. analytics

ko‘rib chiqilsin.

---

# 57. CLAUDE CODE WORKING RULES

Sen Claude Code sifatida ishlayotganingda:

* mavjud kodni avval analiz qil
* mavjud architecture'ni buzma
* keraksiz dependency qo‘shma
* bir xil functionalityni ikki marta yaratma
* securityni chetlab o'tma
* `.env` secretsni commit qilma
* TODO bilan muhim functionalityni tashlab ketma
* fake API yozma
* fake analytics yozma
* production'da ishlamaydigan mock architecture bilan tugatma

Agar biror architectural decision noaniq bo‘lsa, avval variantlarni tushuntir.

---

# 58. FINAL REQUIREMENT

Menga shunchaki "LMS" emas, quyidagi darajadagi platforma kerak:

**Corporate Employee Training + Secure Video LMS + Employee Monitoring Analytics + Company News + Task Management + Event Management + AI Assistant + RBAC + Audit Logs + Advanced Reporting**

platformasi.

System keyinchalik 1000+ employee va katta video library bilan ishlashi mumkinligini hisobga ol.

Architecture scalable bo‘lsin.

Security first.

Performance second.

Maintainability third.

UX professional enterprise-level bo‘lsin.

Kod yozishdan oldin architecture, database schema, API contract, security model va development roadmapni ko‘rsat.

Keyin PHASE 1 dan boshlab implementatsiyani bosqichma-bosqich amalga oshir.

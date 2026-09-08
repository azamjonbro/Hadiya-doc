# 17. FEATURES WE SHOULD NOT COPY

> Har biri uchun: nega iSpring'da bor, nega bizga kerak emas, muqobil, qaror.
> **Muhim:** "kerak emas" deyishdan oldin biznes qiymati baholandi — quyidagi
> hech biri "qiyin, shuning uchun qilmaymiz" degani emas.

| # | Feature | Nega iSpring'da bor | Nega bizga kerak emas | Muqobil | Qaror |
|---|---|---|---|---|---|
| 1 | **PowerPoint desktop add-in** (iSpring Suite) | Ularning asosiy mahsuloti — o'quv dizaynerlari Windows'da PPT bilan ishlaydi va SCORM eksport qiladi | Bizda desktop mahsulot yo'q va bo'lmaydi; xodimlarimiz Windows add-in o'rnatmaydi | Brauzerda PPTX import + slaydni dars blokiga aylantirish (F-13 dagi mavjud `pptx-preview` ustiga) | **REMOVE** |
| 2 | **Native iOS/Android ilova** | Global bozorda ilova do'konida bo'lish talab | Bitta kompaniya ichida; ikkinchi kod bazasi, ikkita relizni saqlash, App Store review sikli — hammasi sof xarajat | PWA + Telegram bildirishnoma kanali | **REMOVE** (qayta ko'rib chiqiladi: agar oflayn OJT dala sharoitida real ehtiyoj bo'lsa) |
| 3 | **cmi5** | Aviatsiya va mudofaa mijozlari uchun standart | O'zbekistonda amalda ishlatilmaydi; SCORM 1.2 import + xAPI LRS bozorning 99% ini qoplaydi | SCORM 1.2/2004 import + xAPI statements | **REMOVE** (xAPI qoladi) |
| 4 | **SAML** | Yirik korporatsiyalarda ADFS/Okta standarti | Bizning muhitda Active Directory yo'q; SAML implementatsiyasi OIDC'dan sezilarli qimmat | OIDC + imzolangan JWT SSO | **REMOVE** |
| 5 | **Flipbook / interaktiv kitob** | Marketing va katalog kontenti uchun | Materiallarimiz PDF va PPTX; flipbook varaqlash animatsiyasi o'qish natijasiga ta'sir qilmaydi va progress o'lchashni qiyinlashtiradi | Mavjud `MaterialViewer` sahifa-progressi bilan | **REMOVE** |
| 6 | **Marketplace / tayyor kurslar do'koni** | SaaS daromad manbai | Ichki platforma; tashqi kontent sotib olinmaydi va sotilmaydi | — | **REMOVE** |
| 7 | **E-commerce** (checkout, kupon, obuna) | Kurslarni tashqariga sotadigan mijozlar uchun | Kurslar ichkarida bepul; to'lov provayderi PCI mas'uliyatini olib keladi | Agar keyin kerak bo'lsa — Payme/Click, alohida faza | **DEFER** (Phase 10, model oldindan qurilmaydi) |
| 8 | **RTL qo'llab-quvvatlash** | Arab tilidagi bozorlar | uz/ru/en — hech biri RTL emas | CSS logical properties (bepul, keyin kerak bo'lsa asos bo'ladi) | **REMOVE** |
| 9 | **Multi-tenant (Organizations)** | SaaS bir instansiyada ko'p mijoz | Bitta kompaniya; har modelga `orgId` qo'shish 39 kolleksiyaga tegadi va har so'rovga scope qo'shadi — katta xarajat, nol qiymat | Filial (`Branch`) allaqachon ko'p ofisni qoplaydi | **REMOVE** (qayta ko'rib chiqiladi: agar platforma boshqa kompaniyalarga sotilsa) |
| 10 | **Oflayn test topshirish** | Native ilovada bor | Server taymeri va focus-loss nazorati bizning imtihon yaxlitligimizning asosi (§1.11) — oflayn bu kafolatlarni yo'qotadi | Test faqat onlayn; oflayn — o'qish materiali | **REMOVE (ataylab)** |
| 11 | **Oflayn biometrik tekshiruv** | — | Yuz taqqoslash serverda; klientda qilish descriptor'ni qurilmaga chiqarishni talab qiladi | Onlayn gate | **REMOVE (ataylab)** |
| 12 | **AI avatar-video** (iSpring 2026) | Kontent ishlab chiqarish tezligi | O'zbek tilida sifat past; korporativ o'qishda sun'iy diktor ishonchni pasaytiradi | Ekran yozib olish + real ovoz | **DEFER** |

---

# 18. FINAL GAP SCORE

**Shkala:** 0 = yo'q · 25 = boshlang'ich · 50 = qisman · 75 = production · 100 = iSpring darajasida yoki undan yuqori.

| # | Domen | Ball | Asos |
|---|---|:--:|---|
| 1 | Course Management | **55** | CRUD, status, targeting, soft delete, progress, sequential lock ✅ — metadata, versiya, nusxa, tugatish qoidasi ❌ |
| 2 | Content | **50** | Video/PDF/DOCX/XLSX/PPTX/audio ✅ — matn dars, SCORM, embed, URL ❌ |
| 3 | Authoring | **20** | 4 qadamli sehrgar — blok, drag-drop, autosave, versiya ❌ |
| 4 | AI | **15** | Faqat chat (lekin scope'i namunali) |
| 5 | Assessment | **40** | Imtihon yaxlitligi **iSpring'dan yuqori**, savol tizimi juda tor |
| 6 | Learning Path | **0** | — |
| 7 | Users | **70** | 39 maydon, bulk amallar, arxivlash ✅ — import, custom field, managerId ❌ |
| 8 | RBAC | **65** | Dinamik rol, permission middleware, IDOR ✅ — scope teshiklari, rol tahriri ❌ |
| 9 | Organization | **45** | Filial/bo'lim/bo'linma/lavozim ro'yxatlari ✅ — ierarxiya, org chart ❌ |
| 10 | Onboarding | **0** | — |
| 11 | Assignments (uy vazifasi) | **0** | `Task` boshqa domen |
| 12 | Live Training | **20** | Model va kalendar bor; ro'yxat, davomat, bildirishnoma ❌ |
| 13 | Calendar | **30** | Faqat tadbirlar; deadline va topshiriq yo'q |
| 14 | Gamification | **55** | Idempotent ledger, leaderboard ✅ — badge dvigateli, daraja, sozlama ❌ |
| 15 | Social | **80** | Chat + Q&A + sharh + newsfeed — **iSpring'dan kuchli** |
| 16 | Certificates | **0** | — |
| 17 | Knowledge Base | **10** | Faqat `News` (oqim, baza emas) |
| 18 | 360 / OJT | **0** | — |
| 19 | Development Plans | **0** | — |
| 20 | Reporting | **35** | 5/22 tur, 3 format, 3 til ✅ — scope, reja, builder, ko'rish ❌ |
| 21 | Notifications | **25** | 9/52 hodisa, faqat in-app |
| 22 | Search | **20** | Entity ichida regex; global, `$text`, facet ❌ |
| 23 | Multilingual | **50** | UI 100% ✅ — kontent, bildirishnoma, sertifikat 0% |
| 24 | Integrations | **10** | Faqat storage abstraksiyasi |
| 25 | Security | **70** | Juda kuchli poydevor — 5 ta kritik teshik (§13) |
| 26 | Administration | **30** | 2 ta siyosat modeli ✅ — umumiy sozlama, branding ❌ |
| 27 | Media | **40** | Yuklash va ishlov berish ✅ — kutubxona, tozalash, optimizatsiya ❌ |
| 28 | Performance | **55** | Kesh, queue, indeks, pagination ✅ — N+1, adapter, CDN, server ❌ |
| 29 | Accessibility | **15** | Hech qachon audit qilinmagan |
| 30 | Mobile | **35** | Responsive ✅ — PWA, oflayn, push ❌ |
| 31 | Compliance | **25** | `mandatory` + `deadline` ✅ — takroriylik, sertifikat, dashboard ❌ |
| 32 | Automation | **45** | 12 ta avtomatlashtirish ishlaydi ✅ — qoida dvigateli ❌ |

## 18.1 Yakuniy hisob

| Metrika | Qiymat |
|---|---|
| **iSPRING SCORE** (baza) | 100 |
| **OUR SCORE** (32 domen o'rtachasi) | **32** |
| **OUR SCORE** (biznes ahamiyati bo'yicha vaznlangan) | **34** |
| **GAP** | **~67%** |

> **Vaznlash usuli:** 12 ta yadro domen (kurs, kontent, baholash, foydalanuvchi,
> RBAC, hisobot, bildirishnoma, xavfsizlik, sertifikat, path, compliance,
> mobil) × 3; 12 ta muhim domen × 2; 8 ta tor domen × 1.

## 18.2 Shkala nima ko'rsatmaydi

100 balllik shkala **iSpring'ni tepa chegara** deb oladi, shuning uchun biz
undan yuqori bo'lgan joylarda ustunlik ko'rinmay qoladi. Quyidagilar
"100 dan yuqori" deb belgilanishi kerak edi:

| Qobiliyat | Nima uchun iSpring'dan yuqori |
|---|---|
| Video ko'rishni isbotlash | `watchedSegments` merge + diqqatsizlik oralig'ini **ayirish** — iSpring'da ikkalasi ham yo'q |
| Imtihon yaxlitligi | Server taymer + focus-loss + savollarni sessiyagacha bermaslik + tashlab ketishni yozish + face gate |
| Shaxsni tasdiqlash | Biometrik gate uch harakatda, `verifyEveryOpen` rejimi |
| Proctoring | Begona yuz aniqlash + yopiq bucket + audit'li ko'rish + TTL |
| Kontent himoyasi | Per-segment auth + watermark + sequential lock **token darajasida** |
| Hujjat o'qish o'lchovi | Ko'rilgan sahifalar **to'plami** (high-water mark emas) |
| Ichki kommunikatsiya | To'liq messenger (DM, guruh, ovoz, fayl, realtime) |
| Trash | Tiklanadigan o'chirish + muddat bo'yicha avtomatik tozalash |

**Amaliy xulosa:** biz **"o'qitish platformasi" sifatida 33%**, lekin
**"o'qishni isbotlash platformasi" sifatida iSpring'dan oldindamiz**. Yo'l
xaritasi shu ustunlikni yo'qotmasdan qolgan 67% ni yopishi kerak.

---

# 19. DEPENDENCY GRAPH

> Faqat "Phase 1, Phase 2" emas — nima nimadan keyin kelishi **majburiy**.
> `→` = chapdagisiz o'ngdagini qilib bo'lmaydi.

## 19.1 Asosiy zanjirlar

```
ZANJIR A — SHAXS VA SCOPE (hamma narsaning tagida)
  users.managerId
    → orgHierarchy.service ($graphLookup)
      → scopeToManagedUsers middleware
        → scope'ni roleName'dan ruxsatga ko'chirish   [§1.5 CRITICAL]
          → hisobot scope'i                            [§1.4 CRITICAL]
          → dashboard scope'i                          [§1.4 CRITICAL]
          → manager dashboard (UI)
            → 360° feedback (baholovchilarni avtomatik aniqlash)
            → development plan (rahbar review)
            → onboarding (mentor/rahbar biriktirish)

ZANJIR B — YETKAZISH (foydalanuvchi bilan aloqa)
  mail.service (SMTP)
    → deliveryQueue (BullMQ, retry)
      → NotificationTemplate (tur × kanal × til)
        → users.notificationPrefs
          → parolni tiklash ISHLAYDI            [FL-27 CRITICAL]
          → hisob yaratish e-maili
          → bosqichli deadline eslatmalari
          → tadbir eslatmalari                  → live training
          → compliance eslatmalari              → compliance
          → rejalashtirilgan hisobotlar         → analytics
      → web push (VAPID) → PWA

ZANJIR C — BAHOLASH
  Question + QuestionBank modeli
    → questionGrading (13 tur)
      → pool + shuffle + attempt muzlatish
        → maxAttempts + scorePolicy            [F-02 CRITICAL]
          → savol qiyinligi statistikasi
          → essay baholash → assignment grading
    → AI quiz generation (yangi model kerak)

ZANJIR D — TUGATISH VA ISBOT
  completionRule (yagona servis)               [F-01 CRITICAL]
    → certificateQueue
      → Certificate + CertificateTemplate
        → ochiq tekshiruv sahifasi
        → sertifikat muddati
          → compliance / qayta sertifikatsiya
    → LearningPath progress
      → path sertifikati
      → onboarding

ZANJIR E — KONTENT
  ContentItem polimorf bazasi
    → Lesson (blokli matn dars)
      → blok editor + drag-drop
        → AI kurs generatsiyasi
    → SCORM paketi (ContentItem sifatida)
    → media kutubxona → orphan tozalash

ZANJIR F — QIDIRUV
  $text indekslar + regex escape          [ReDoS, CRITICAL]
    → global search service
      → ⌘K palitra
    → knowledge base qidiruvi
      → KB domeni

ZANJIR G — KORXONA
  Settings modeli (attentionPolicy naqshidan)
    → branding
    → e-mail sozlamalari (Zanjir B bilan)
  ApiKey + scope
    → public API
      → webhook
      → HR integratsiyasi
  OIDC → SSO → JIT provisioning
```

## 19.2 Bog'liqliksiz ishlar (istalgan vaqtda, parallel)

Bular hech nimani kutmaydi va birinchi kundan boshlanadi:

| Ish | Nega mustaqil |
|---|---|
| Leaderboard'dan `jshshir` ni olib tashlash | Bitta DTO satri (§1.6) |
| `course.repository` regex escape | Bitta funksiya (ReDoS) |
| Backup + tiklash sinovi | Infratuzilma, koddan tashqarida |
| Audit log ko'rish (`GET /audit-logs` + UI) | Ma'lumot allaqachon yozilmoqda |
| `auditLogs` TTL indeksi | Bitta indeks |
| Sentry / error tracking | Konfiguratsiya |
| `S3_PUBLIC_ENDPOINT` (presign host) | Env + bitta chaqiruv |
| Socket.io Redis adapter | Bitta paket |
| `admin/` papkasini o'chirish | Dead code |
| N+1 tuzatishlar (reminder job, dashboard, insights) | Lokal optimizatsiya |
| `DataTable` / `FilterBar` komponentlari | Frontend poydevori — **keyingi hamma sahifa shuni kutadi** |

## 19.3 Tavsiya etilgan boshlash tartibi

```
HAFTA 1        Bog'liqliksiz xavfsizlik + infratuzilma (§19.2 dan 8 ta ish)
HAFTA 2-4      Zanjir B (yetkazish) — eng tez ko'rinadigan qaytim
HAFTA 2-6      Zanjir A (managerId + scope) — parallel, boshqa dasturchi
HAFTA 5-10     Zanjir C (Question) + Zanjir D (completionRule → sertifikat)
HAFTA 11-16    Zanjir D davomi (path) + Zanjir F (qidiruv)
HAFTA 17+      Zanjir E (kontent), Zanjir G (korxona)
```

**Nima uchun Zanjir B birinchi:** e-mail yo'qligi bitta feature emas — u
parolni tiklashni, hisob yaratishni, deadline eslatmalarini, tadbirlarni,
compliance'ni va sertifikatni **bir vaqtda** bloklaydi. Uni yopish eng ko'p
boshqa ishni ochadi.

**Nima uchun Zanjir A ikkinchi:** to'rtta CRITICAL xavfsizlik teshigining
uchtasi shu zanjirda (§1.4, §1.5, F-08) va u 360°/onboarding/development
plan'ning oldida turadi.

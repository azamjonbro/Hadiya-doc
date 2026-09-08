# 19. YAKUNIY TAVSIYA ETILGAN ARXITEKTURA

> **Asosiy tamoyil:** mavjud arxitektura **almashtirilmaydi**. U barcha yangi
> domenlarni ko'taradi. Quyidagi diagramma — bugungi tizim + qo'shiladigan
> qismlar (🆕 bilan belgilangan).

## 19.1 Umumiy ko'rinish

```
                    ┌──────────────────────────────────────┐
                    │  front/ (Vue 3 SPA, bitta bundle)    │
                    │  ├── xodim paneli   /                │
                    │  ├── admin paneli   /bos             │
                    │  └── 🆕 service worker (PWA, offline)│
                    └───────────────┬──────────────────────┘
                                    │ HTTPS
                    ┌───────────────▼──────────────────────┐
                    │  Nginx — TLS, statik, reverse proxy, │
                    │  HTTP Range (HLS segmentlar)         │
                    └───────────────┬──────────────────────┘
        ┌───────────────────────────┼──────────────────────────┐
        │                           │                          │
┌───────▼─────────┐   ┌─────────────▼──────────┐   ┌──────────▼─────────┐
│ /api/v1         │   │ 🆕 /api/public/v1      │   │ 🆕 /public/*       │
│ (SPA, JWT)      │   │ (tashqi, ApiKey+scope) │   │ (auth'siz:         │
│                 │   │                        │   │  sertifikat        │
│                 │   │                        │   │  tekshiruvi,       │
│                 │   │                        │   │  branding)         │
└───────┬─────────┘   └─────────────┬──────────┘   └──────────┬─────────┘
        └───────────────────────────┴──────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  backend/ Express                    │
                    │  middlewares → controllers →         │
                    │  services → repositories → models    │
                    │                                      │
                    │  DOMENLAR (🆕 = yangi):              │
                    │  auth · users · roles · org · courses│
                    │  topics · videos · materials         │
                    │  🆕 lessons · 🆕 scorm               │
                    │  🆕 paths · 🆕 certificates          │
                    │  🆕 questions · quizzes              │
                    │  🆕 assignments · events(🆕 ext)     │
                    │  🆕 onboarding · 🆕 kb · 🆕 search   │
                    │  🆕 competency · 🆕 reviews · 🆕 ojt │
                    │  🆕 plans · 🆕 compliance            │
                    │  🆕 automation · gamification(🆕 ext)│
                    │  news · tasks · chat · ai(🆕 ext)    │
                    │  analytics · reports(🆕 ext) · audit │
                    │  🆕 integrations · 🆕 settings       │
                    │  🆕 media                            │
                    └──┬──────────┬──────────┬─────────┬───┘
                       │          │          │         │
              ┌────────▼──┐ ┌─────▼────┐ ┌───▼─────┐ ┌─▼──────────────┐
              │ MongoDB   │ │  Redis   │ │ MinIO/S3│ │ Tashqi         │
              │ (Mongoose)│ │ kesh +   │ │ yopiq   │ │ 🆕 SMTP        │
              │ 30 → 🆕60 │ │ BullMQ + │ │ bucket  │ │ Anthropic      │
              │ kolleksiya│ │ 🆕 socket│ │ 🆕 media│ │ 🆕 Web Push    │
              │           │ │ adapter  │ │ library │ │ 🆕 Telegram    │
              └───────────┘ └────┬─────┘ └─────────┘ │ 🆕 Zoom/Meet   │
                                 │                    │ 🆕 OIDC IdP    │
                    ┌────────────▼──────────────┐    │ 🆕 ASR (subtitr)│
                    │ worker/ (alohida jarayon) │    └────────────────┘
                    │ BullMQ consumer'lar:      │
                    │ video · dashboard ·       │
                    │ reminder · 🆕 delivery ·  │
                    │ 🆕 certificate ·          │
                    │ 🆕 compliance ·           │
                    │ 🆕 export · 🆕 ai ·       │
                    │ 🆕 webhook · 🆕 onboarding│
                    │ 🆕 search · 🆕 media ·    │
                    │ 🆕 backup                 │
                    └───────────────────────────┘
```

## 19.2 Saqlanadigan arxitektura qarorlari

| Qaror | Nega saqlanadi |
|---|---|
| **Plain JavaScript (TypeScript emas)** | Loyihani olib boruvchi odam TS o'qimaydi/yozmaydi — bu ataylab qilingan va hujjatlashtirilgan savdo. TS'ga o'tish 60 kolleksiyali kod bazasida katta xavf va hech qanday funksional foyda bermaydi. **Buning o'rniga:** JSDoc tiplari + zod sxemalari runtime kafolatini beradi. |
| **npm workspaces monorepo** | `packages/shared` rol/ruxsat vokabulyarining backend va frontend o'rtasida ajralib ketishiga yo'l qo'ymaydi. Yangi 45 ruxsat kaliti ham shu yerga tushadi. |
| **Layered backend** (controller→service→repository→model) | 45 servis va 30 repository shu naqshda ishlaydi va izchil. Yangi 30+ servis ham aynan shunday quriladi. |
| **Bitta frontend bundle, ikkita shell** | Ilgari ikkita SPA edi, birlashtirildi (bitta login, sahifa qayta yuklanmasdan o'tish). Code splitting admin kodini xodim brauzeriga yubormaydi. **Qaytarmaymiz.** |
| **BullMQ worker alohida jarayonda** | 2 GB video transcode HTTP jarayonini bloklamaydi. 12 ta yangi queue ham shu yerga qo'shiladi. |
| **StorageProvider abstraksiyasi** | Media kutubxona, SCORM paketlari, sertifikat PDF'lari — hammasi shu interfeys orqali. |
| **Dinamik `roles` kolleksiyasi** | Yangi rol (`AUTHOR`, `MENTOR`) — deploy emas, ma'lumot operatsiyasi. |
| **Server tomonda majburlash** | Frontend guard'lar faqat UX. Har bir yangi lock (path sequence, attempt limit, download restriction) **server tomonda** majburlanadi. |
| **Kursorli pagination** | Barcha yangi ro'yxatlar shu naqshda. |
| **Redis kesh + pre-aggregation** | `dashboardCache` naqshi yangi dashboard'larga ham qo'llanadi. |

## 19.3 O'zgaradigan arxitektura qarorlari

| # | Qaror | Sababi |
|---|---|---|
| 1 | **`ContentItem` polimorf bazasi** — `Video`, `Material`, `Lesson`, `Assessment`, `ScormPackage`, `Assignment` uchun umumiy `{topicId, courseId, type, title, order, status, required, points}` | Hozir har yangi kontent turi 4 joyni o'zgartirishni talab qiladi (`topicContent.service`, progress hisoblash, lock, completion). 6 turga chiqqanda bu boshqarib bo'lmaydi. Detal ma'lumot har tur uchun alohida kolleksiyada qoladi. |
| 2 | **`Question` alohida kolleksiya + `QuestionBank`** | Embed savollar 13 turni va qayta ishlatishni ko'tarmaydi. |
| 3 | **Notification delivery qatlami** (`notify` → queue → kanal) | Bitta kanal (in-app) uchun qurilgan, endi 4 kanal kerak. |
| 4 | **`Settings` DB singleton** (`.env` o'rniga, sirlardan tashqari) | Admin har bir sozlama uchun deploy kutmasligi kerak. |
| 5 | **`$text` indekslar** (`RegExp` o'rniga) | Katalog o'sganda regex to'liq skan qiladi. |
| 6 | **Ajratilgan server** | Hozir 1.9 GB RAM'li VM'da 6 ta begona sayt bilan. AI generatsiyasi, SCORM, ffmpeg subtitr, 12 queue — buni ko'tarmaydi. **Minimum tavsiya:** 4 vCPU / 8 GB RAM / 200 GB SSD, alohida MinIO uchun object storage. |

## 19.4 Yangi kod uchun majburiy naqshlar

Har bir yangi domen quyidagi shablonni **aynan** takrorlaydi:

```
backend/src/
  models/<entity>.model.js          # sxema + indekslar + izohli qarorlar
  repositories/<entity>.repository.js  # faqat DB kirish
  services/<domain>/<entity>.service.js # biznes mantiq + avtorizatsiya
  controllers/<entity>.controller.js   # faqat HTTP
  routes/v1/<entities>.routes.js       # requirePermission + validate
  validators/<entity>.validator.js     # zod sxemalari
```

**Har bir service metodi uchun qoidalar:**
1. Birinchi argument har doim `actor` (`{id, roleName, permissions}`)
2. Avtorizatsiya service ichida, controller'da emas
3. Resource-level tekshiruv (`:id` bo'lsa) — egalik yoki scope
4. Yozuv amali `auditLogRepository.record()` bilan tugaydi
5. Bildirishnoma `notificationService.notify()` orqali (to'g'ridan-to'g'ri e-mail yuborilmaydi)
6. Xatolar `ApiError` (kod bilan: `ApiError.badRequest(msg, 'CODE')`)

---

# 20. YAKUNIY MAHSULOT SPETSIFIKATSIYASI (v2)

> Bu bo'lim `Readme.md` dagi asl 58-bo'limli spetsifikatsiyani
> **almashtirmaydi** — uni yangilaydi. Asl spetsifikatsiyadagi hamma narsa
> kuchda qoladi; quyida **qo'shiladigan va o'zgaradigan** talablar
> funksional shaklda yozilgan.

## 20.1 Mahsulot ta'rifi

**Qo'llanma LMS** — korporativ xodimlarni o'qitish, baholash, rivojlantirish
va muvofiqlikni (compliance) isbotlash platformasi.

**Farqlovchi qiymati (iSpring'dan):** o'qish **haqiqatan sodir bo'lganini
isbotlash**. Video ko'rilgan segmentlar bo'yicha o'lchanadi, diqqat kamera
orqali kuzatiladi, test serverda taymerlanadi va nazorat qilinadi, shaxs
biometrik tasdiqlanadi. Boshqa hech bir LMS bu darajada nazorat bermaydi.

**Maqsadli foydalanuvchilar:** xodim (o'quvchi), rahbar (manager), mentor,
muallif (author), administrator, super-administrator.

## 20.2 Funksional talablar — modul bo'yicha

### FR-1 Autentifikatsiya va shaxs
- FR-1.1 Xodim JSHSHIR yoki passport seriyasi + parol bilan kiradi. *(mavjud)*
- FR-1.2 Ochiq ro'yxatdan o'tish yo'q; foydalanuvchini faqat ruxsatli rol yaratadi. *(mavjud)*
- FR-1.3 Muvaffaqiyatsiz urinishlar hisoblanadi; chegaradan keyin hisob vaqtincha bloklanadi. *(mavjud)*
- FR-1.4 Refresh token har foydalanishda rotatsiya qilinadi; eski token ishlatilsa butun sessiya oilasi bekor qilinadi. *(mavjud)*
- FR-1.5 🆕 Parolni tiklash havolasi **e-mail bilan yuboriladi**, 1 soat amal qiladi va bir marta ishlatiladi.
- FR-1.6 🆕 Foydalanuvchi TOTP 2FA'ni yoqishi mumkin; face verification yoqilgan bo'lsa, TOTP muqobil sifatida ishlaydi.
- FR-1.7 🆕 Yangi qurilmadan kirish foydalanuvchiga xabar qilinadi.
- FR-1.8 🆕 Foydalanuvchi o'z faol sessiyalarini ko'radi va bekor qiladi.
- FR-1.9 🆕 Tashkilot OIDC provayderi orqali SSO yoqilishi mumkin; birinchi kirishda foydalanuvchi avtomatik yaratiladi, roli va bo'limi claim'lardan aniqlanadi.

### FR-2 Tashkiliy tuzilma
- FR-2.1 Xodim filial, bo'lim, bo'linma va lavozimga tegishli. *(mavjud)*
- FR-2.2 🆕 Har bir xodimning **rahbari** ko'rsatiladi (`managerId`); rahbar o'z jamoasini (bevosita va bilvosita) ko'radi.
- FR-2.3 🆕 Tashkiliy tuzilma interaktiv sxema sifatida ko'rsatiladi.
- FR-2.4 🆕 Guruh statik (qo'lda tanlangan a'zolar) yoki dinamik (qoida bo'yicha avtomatik) bo'lishi mumkin.
- FR-2.5 🆕 Rahbar `~` scope'i **server tomonda** majburlanadi: rahbar o'z jamoasidan tashqari xodim ma'lumotini API orqali ham ola olmaydi.

### FR-3 Kurslar va kontent
- FR-3.1 Kurs → mavzu → kontent element ierarxiyasi. *(mavjud)*
- FR-3.2 Kontent turlari: video, hujjat (PDF/DOCX/XLSX), taqdimot (PPTX), audio, test *(mavjud)* + 🆕 blokli matn darsi, tashqi havola, embed, SCORM paketi, topshiriq.
- FR-3.3 🆕 Kurs kategoriya, teg, daraja, muallif, taxminiy davomiylik va prerequisite'larga ega.
- FR-3.4 🆕 Kurs tugatish qoidasi sozlanadi: barcha majburiy elementlar / minimal ball / yakuniy test.
- FR-3.5 🆕 Navigatsiya rejimi sozlanadi (ketma-ket / erkin); ketma-ket rejimda blok **playback token berilishida** majburlanadi. *(mavjud mexanizm, sozlanadigan qilinadi)*
- FR-3.6 🆕 Kurs nusxalanadi (deep copy) va versiyalanadi.
- FR-3.7 🆕 Kurs katalogi kategoriya, teg, daraja, muallif va to'liq matn bo'yicha qidiriladi.
- FR-3.8 Video ko'rish **ko'rilgan segmentlar** bo'yicha o'lchanadi; oldinga sudrash progressni oshirmaydi. *(mavjud — o'zgartirilmaydi)*
- FR-3.9 Hujjat progressi **ko'rilgan sahifalar to'plami** bo'yicha o'lchanadi. *(mavjud — o'zgartirilmaydi)*
- FR-3.10 🆕 Material uchun "yuklab olish taqiqlanadi" rejimi mavjud; bu holda fayl faqat oqim sifatida uzatiladi.

### FR-4 Learning path
- FR-4.1 🆕 Path — tartiblangan elementlar to'plami (kurs, test, tadbir, topshiriq, KB maqola).
- FR-4.2 🆕 Element majburiy yoki ixtiyoriy; progress **faqat majburiy** elementlar bo'yicha hisoblanadi.
- FR-4.3 🆕 Ketma-ket path'da element oldingi majburiy element tugamaguncha ochilmaydi (server tomonda).
- FR-4.4 🆕 Path muddat, avtomatik biriktirish qoidalari va sertifikat shabloniga ega.

### FR-5 Baholash
- FR-5.1 🆕 Savollar **savol bankida** saqlanadi va bir necha testda qayta ishlatiladi.
- FR-5.2 🆕 13 savol turi qo'llab-quvvatlanadi (single/multi choice, true-false, short answer, essay, numeric, matching, sequence, drag-drop, fill-blank, select-list, hotspot, likert).
- FR-5.3 🆕 Test bankdan tasodifiy savol tanlaydi; tanlov attempt boshlanganda **muzlatiladi** — sahifani yangilash bir xil savollarni qaytaradi.
- FR-5.4 🆕 Savollar va javob variantlari aralashtiriladi (attempt ichida barqaror).
- FR-5.5 🆕 Urinishlar soni cheklanadi; chegaradan keyin urinish **server tomonda** rad etiladi.
- FR-5.6 Vaqt chegarasi va fokus yo'qotish nazorati **serverda** yuritiladi. *(mavjud — barcha testlarga kengaytiriladi)*
- FR-5.7 🆕 Ball savol og'irligiga qarab hisoblanadi; ko'p javobli savollarda qisman ball beriladi.
- FR-5.8 🆕 Natijalarni ko'rsatish rejimi sozlanadi (hech qachon / urinishdan keyin / o'tgandan keyin).
- FR-5.9 🆕 Savolga izoh (`explanation`) va variantga feedback qo'shiladi.
- FR-5.10 🆕 Essay savollar qo'lda baholanadi va tekshirish navbatiga tushadi.
- FR-5.11 🆕 Savol qiyinligi statistikasi (to'g'ri javob %, o'rtacha vaqt) ko'rsatiladi.

### FR-6 Sertifikatlar
- FR-6.1 🆕 Kurs yoki path tugaganda sertifikat **avtomatik** beriladi.
- FR-6.2 🆕 Sertifikat shabloni vizual editorda sozlanadi (fon, maydon pozitsiyalari, shrift).
- FR-6.3 🆕 Har bir sertifikat noyob serial va QR kodga ega.
- FR-6.4 🆕 QR ochiq tekshiruv sahifasiga olib boradi; sahifada **ism, kurs, sana va holat** ko'rinadi, shaxsni identifikatsiya qiluvchi raqamlar **hech qachon** ko'rsatilmaydi.
- FR-6.5 🆕 Sertifikat amal qilish muddatiga ega bo'lishi mumkin; muddat tugashidan 30 va 7 kun oldin ogohlantirish yuboriladi.
- FR-6.6 🆕 Sertifikat bekor qilinishi mumkin; bekor qilingan sertifikat tekshiruv sahifasida shunday ko'rsatiladi.
- FR-6.7 🆕 Tashqi sertifikatlar yuklanadi va tasdiqlanadi.
- FR-6.8 🆕 Bir tugatish uchun ikkinchi sertifikat berilmaydi (idempotentlik).

### FR-7 Bildirishnomalar
- FR-7.1 🆕 Bildirishnoma 4 kanal orqali yetkaziladi: ilova ichida, e-mail, web push, Telegram.
- FR-7.2 🆕 Foydalanuvchi har bir tur uchun kanalni yoqadi/o'chiradi; xavfsizlik va muvofiqlik bildirishnomalari **o'chirilmaydi**.
- FR-7.3 🆕 Matnlar shablonlardan olinadi (tur × kanal × til) va foydalanuvchi tilida yuboriladi.
- FR-7.4 🆕 Yetkazish muvaffaqiyatsiz bo'lsa 5 marta qayta urinadi va jurnalga yoziladi.
- FR-7.5 52 ta bildirishnoma hodisasi qo'llab-quvvatlanadi (§11 matritsasi).

### FR-8 Onboarding
- FR-8.1 🆕 Onboarding dasturi rol/bo'lim/lavozim/filialga mo'ljallanadi.
- FR-8.2 🆕 Xodimning ishga kirish sanasi kelganda dastur **avtomatik** boshlanadi.
- FR-8.3 🆕 Har bir qadam muddat oladi (`hireDate + N kun`); kechikkan qadamlar xodim, mentor va rahbarga xabar qilinadi.
- FR-8.4 🆕 Mentor va rahbar biriktiriladi va progressni ko'radi.

### FR-9 Live training
- FR-9.1 🆕 Tadbir onlayn, oflayn yoki aralash bo'ladi va meeting havolasiga ega bo'lishi mumkin.
- FR-9.2 🆕 Tadbir sig'imga ega; joy tugasa ro'yxatdan o'tganlar navbatga tushadi va joy bo'shaganda avtomatik ko'chiriladi.
- FR-9.3 🆕 Davomat belgilanadi va hisobotga tushadi.
- FR-9.4 🆕 Vaqt o'zgarishi va bekor qilish barcha ro'yxatdagilarga darhol xabar qilinadi.
- FR-9.5 🆕 Tadbirni tugatish kurs progressiga ta'sir qilishi mumkin.

### FR-10 Topshiriqlar (uy vazifasi)
- FR-10.1 🆕 Xodim fayl, matn yoki havola topshiradi.
- FR-10.2 🆕 Tekshiruvchi ball va izoh qo'yadi yoki qayta ishlash uchun qaytaradi.
- FR-10.3 🆕 Rubrika bo'yicha baholash qo'llab-quvvatlanadi.
- FR-10.4 🆕 Kech topshirish siyosati sozlanadi.

### FR-11 Knowledge base
- FR-11.1 🆕 Maqolalar kategoriya daraxtida joylashadi va to'liq matn bo'yicha qidiriladi.
- FR-11.2 🆕 Ko'rinish rol, bo'lim va filialga qarab cheklanadi (kurs targeting'i bilan bir xil mantiq).
- FR-11.3 🆕 Maqola versiyalanadi va oldingi versiyaga qaytariladi.
- FR-11.4 🆕 Maqolaga qayta ko'rish sanasi belgilanadi; muddat kelganda tekshiruvchi xabardor qilinadi.
- FR-11.5 🆕 Maqola o'qilishi (scroll, vaqt) mavjud yangilik analitikasi naqshida o'lchanadi.

### FR-12 Muvofiqlik (compliance)
- FR-12.1 🆕 Kurs takroriy bo'lishi mumkin (masalan, har 12 oyda).
- FR-12.2 🆕 Muddat kelganda kurs avtomatik qayta biriktiriladi.
- FR-12.3 🆕 Muvofiqlik matritsasi (kurs × xodim) real vaqtda holat ko'rsatadi.
- FR-12.4 🆕 Audit uchun hisobot: kim, qachon, qaysi kurs versiyasini, qanday ball bilan tugatdi.

### FR-13 Analitika va hisobotlar
- FR-13.1 22 hisobot turi; CSV, XLSX va PDF formatlarida; uch tilda. *(5 tasi mavjud)*
- FR-13.2 🆕 Hisobot rejalashtiriladi va belgilangan vaqtda e-mail bilan yuboriladi.
- FR-13.3 🆕 Katta eksportlar fon rejimida bajariladi va tayyor bo'lganda xabar qilinadi.
- FR-13.4 🆕 Dashboard kompaniya, filial, bo'lim va jamoa kesimida ko'rsatiladi.
- FR-13.5 Drill-down: dashboard → kurs → xodim → video → savol. *(mavjud — kengaytiriladi)*

### FR-14 AI
- FR-14.1 AI yordamchi faqat foydalanuvchi kira oladigan material doirasida javob beradi. *(mavjud)*
- FR-14.2 🆕 Yuklangan hujjatdan kurs strukturasi va dars matni generatsiya qilinadi.
- FR-14.3 🆕 Dars matnidan test savollari generatsiya qilinadi.
- FR-14.4 🆕 Kurs boshqa tilga tarjima qilinadi; **struktura va identifikatorlar saqlanadi**.
- FR-14.5 🆕 AI generatsiya qilgan hech narsa avtomatik e'lon qilinmaydi — har doim qoralama sifatida yaratiladi va inson tasdiqlaydi.
- FR-14.6 🆕 AI so'rovlariga shaxsni identifikatsiya qiluvchi ma'lumotlar yuborilmaydi.

### FR-15 Mobil
- FR-15.1 🆕 Ilova PWA sifatida telefonga o'rnatiladi.
- FR-15.2 🆕 Oldindan saqlangan kontent internetsiz ochiladi.
- FR-15.3 🆕 Oflayn progress navbatga tushadi va onlayn bo'lganda **dublikatsiz** yuboriladi.
- FR-15.4 🆕 Push bildirishnomalar ilova yopiq bo'lganda ham keladi.
- FR-15.5 Testlar va biometrik tekshiruv **oflayn ishlamaydi** — bu ataylab qilingan qaror.

### FR-16 Integratsiyalar
- FR-16.1 🆕 Tashqi tizimlar API kaliti va scope'lar bilan cheklangan public API'dan foydalanadi.
- FR-16.2 🆕 Domen hodisalari webhook orqali imzolangan holda yuboriladi va muvaffaqiyatsizlikda qayta urinadi.
- FR-16.3 🆕 API OpenAPI hujjati bilan ta'minlanadi.
- FR-16.4 🆕 Har bir tashqi chaqiruv audit jurnaliga tushadi.

## 20.3 Nofunksional talablar

| # | Talab | Mezon |
|---|---|---|
| NFR-1 | Javob vaqti | Ro'yxat endpoint'lari p95 < 300 ms (1000 yozuv bilan) |
| NFR-2 | Dashboard | Keshdan < 200 ms; kesh yangilanishi < 30 s |
| NFR-3 | Video ishga tushishi | Birinchi segment < 2 s |
| NFR-4 | Bundle | Entry chunk < 500 KB (xom) |
| NFR-5 | Miqyos | 5 000 faol xodim, 500 kurs, 50 000 attempt |
| NFR-6 | Mavjudlik | 99.5% (ish kunlari 08:00–20:00) |
| NFR-7 | Backup | Kunlik, 30 kun saqlash, kvartalda bir marta tiklash sinovi |
| NFR-8 | Xavfsizlik | §16 checklist'ining barcha `❌` bandlari yopilgan |
| NFR-9 | Accessibility | WCAG 2.1 AA — barcha yangi ekranlar |
| NFR-10 | Til | Har bir foydalanuvchiga ko'rinadigan matn uz/ru/en da |
| NFR-11 | Audit | Har bir yozuv amali audit jurnalida |
| NFR-12 | Ma'lumot yo'qolmasligi | Oflayn progress va sertifikatlar idempotent |

## 20.4 Loyihaning ish qoidalari (o'zgarmaydi)

Asl spetsifikatsiyaning §53 va §57 bo'limlaridagi qoidalar kuchda qoladi:

1. Tekshiriladigan qismlar bilan qurish; bir zarbada katta bog'liq bo'lmagan
   fayl to'plami tashlanmaydi.
2. Kritik funksiya TODO bilan yarim ulangan qoldirilmaydi.
3. Har bir bosqichdan oldin qisqa dizayn qaydi.
4. Xavfsizlik **server tomonda** majburlanadi; frontend faqat UX.
5. Progress **hech qachon** klient xabari asosida yozilmaydi — faqat server hisoblaydi.
6. Hech qanday soxta ma'lumot: hisobotdagi har bir raqam haqiqiy yozuvdan keladi.

## 20.5 Hujjatlar tuzilishi (yangilangan)

```
Readme.md              — asl to'liq spetsifikatsiya (58 bo'lim) — TARIXIY ASOS
HOLAT.md               — hozirgi holat qaydi (har deploy'dan keyin yangilanadi)
data.txt               — deploy/operatsiya tarixi
docs/
  architecture.md      — mavjud arxitektura (§19 bilan yangilanadi)
  data-model.md        — mavjud modellar (§6 bilan yangilanadi)
  api-contract.md      — mavjud API (§9 bilan yangilanadi; OpenAPI keladi)
  auth-rbac.md         — auth va RBAC (§10 bilan yangilanadi)
  video-streaming.md   — o'zgarmaydi
  analytics.md         — o'zgarmaydi
  attention-monitoring.md — o'zgarmaydi
  face-verification.md — o'zgarmaydi
  security-threat-model.md — §16 bilan yangilanadi
  deployment.md        — backup/restore tartibi qo'shiladi
  roadmap.md           — §17 ga havola qiladi
  v2/                  — 🆕 BU AUDIT
    01-executive-summary.md
    02-feature-matrix.md
    03-technical-changes.md
    04-matrices.md
    05-roadmap.md
    06-architecture-and-spec.md
```

## 20.6 Keyingi qadam

1. **Phase 0 ni darhol boshlash** — u yangi funksiya emas, buzilgan
   narsalarni tuzatish (material yuklab olish, backup, ruxsat nomuvofiqligi).
2. **Server masalasini hal qilish** — 1.9 GB RAM'li umumiy VM Phase 1 dan
   nariga o'tmaydi.
3. **Phase 1 ni ikki oqimga bo'lish:** sertifikat + e-mail (bir kishi),
   savol/test refactor (ikkinchi kishi) — ular bir-biriga bog'liq emas.
4. Har bir phase boshida shu hujjatning tegishli bo'limini qayta o'qib,
   qabul mezonlarini vazifa ro'yxatiga aylantirish.

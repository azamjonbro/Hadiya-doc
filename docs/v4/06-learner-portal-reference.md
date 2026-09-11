# Xodim portali — iSpring ekranlaridan o'lchangan joylashuv

> Manba: `rasn/` dagi 35 ta skrinshot (2026-09-10, ISHONCH'ning jonli
> iSpring portali, ruscha interfeys). Raqamlar 1916 px kenglikdagi
> ekranlardan o'lchangan va CSS pikselga keltirilgan. Brend nomi bizda
> **HADIYA**, rang — yashil (`--color-primary`), oq yozuv.
> Bu hujjat — nimani qayerga qo'yish kerakligining ro'yxati; nima uchun
> shundayligi har bo'limda bir jumlada.

## 0. Umumiy qobiq

| Element | O'lcham / joy |
|---|---|
| Topbar | balandlik **64px**, to'liq kenglik, yashil, soya yo'q |
| Wordmark | chap chekkaga **yopishgan** (padding 0), oq, qalin, katta harf, ~40px baland |
| Markaziy nav | markazda, 5 ta havola + `···`; matn 14px oq/80%, faol — oq, ostida **2px oq chiziq** topbar pastida; "Yangiliklar" yonida yangi bo'lsa **yashil nuqta** (6px, o'ng-yuqori) |
| Nav tartibi | Mening kurslarim · Yangiliklar · Kurslar katalogi · Rivojlanish rejalari · Bilimlar bazasi · ··· |
| `···` menyusi | qolganlari: Ish o'rnida o'qitish, Vazifalarni tekshirish (ruxsat bo'lsa), Xodimlar, Tadbirlar, Kalendar, Reyting, Sertifikatlar |
| O'ng klaster | 5 ta dumaloq tugma **32px**, orasi 12px, fon oq/20%, ikonka 18px oq: sovg'a (tug'ilgan kunlar paneli) · chat · qo'ng'iroq (badge `99+` yashil, oq hoshiya) · to'r (ilovalar/admin) · avatar 32px |
| Kontent kengligi | **1140px** markazda (kurslar, katalog, OJT); yangiliklar **700px**; profil **1024px** (muqova) / ichki **880px** |
| Sahifa foni | `#F5F5F5` (surface-2); kartalar oq, radius **8px**, soya `0 1px 3px rgba(0,0,0,.08)` |
| Sarlavha (hero yo'q) | 24–28px qalin, chap; kontent boshidan 40px pastda |

**Nega:** iSpring'da qobiq har sahifada bir xil — foydalanuvchi "qayerdaman" ni
topbar'dagi chiziqdan biladi, sahifa sarlavhasidan emas.

## 1. Mening kurslarim (`/courses`) — rasm 01, 02

```
┌ Topbar 64 ───────────────────────────────────────────────┐
├ Hero 160px: foto + qora 40% overlay; "Mening kurslarim"   │
│   oq 32px qalin, kontent chap chegarasida, vertikal markaz │
├ Oq panel 70px (to'liq kenglik):                            │
│   [Tayinlangan (16)] [Tugallangan (3)]        [🔍 Qidiruv]│
│    pill-tab: faol = kulrang pill (#EEE), 14px               │
│    qidiruv: 270px, radius 6, chegara #DDD                   │
├ Ro'yxat, 1140px, kartalar orasi 16px, yuqoridan 40px       │
│ ┌ Karta 180px ───────────────────────────────────────────┐ │
│ │ [rasm 224×124]  kichik kulrang izoh 13px  ····· status │ │
│ │                 sarlavha 20px semibold                  │ │
│ │                 [▶ O'qishni davom ettirish] (och yashil)│ │
│ │            yoki "0 / 7 kurs o'tildi" + progress 480×6   │ │
│ └────────────────────────────────────────────────────────┘ │
```

- Karta ichki padding **28px**; rasm chap, matn 28px o'ngda.
- Status o'ng-yuqorida: "Jarayonda" (13px qalin, qora) yoki qizil pill
  **⚑ Muddati o'tgan: 23 iyul 2026** (fon `#FDECEC`, matn `#D32F2F`, 12px).
- Progress chizig'i: kulrang `#E5E5E5`, to'ldirish yashil; tagida matn
  "4 / 22 kurs o'tildi • 1 kurs muddati o'tgan" (qizil qism).
- Tugallanganlar: status "Tugallangan", "Tugallangan (100% ko'rilgan)",
  "Boshlanmagan" — bir xil karta, tugma yo'q.
- Turi izohi: "Avval ko'rgansiz" (birinchi karta), "O'quv trayektoriyasi",
  "So'rovnoma", "Longrid", "O'quv material".

**Nega:** iSpring "Katalog" ni alohida sahifaga chiqaradi — "Mening" faqat
tayinlangan/tugallangan. Bizdagi to'rt tab (Majburiy/Katalog/Tugallangan/
Muddati) shu ikkitaga qisqaradi, "Muddati o'tgan" statusga aylanadi.

## 2. Kurslar katalogi (`/catalog`) — rasm 03

- Hero 160px (kitob javoni fotosi), "Kurslar katalogi".
- Oq panel: chapda izoh matni 14px ("Qiziqqan kurslaringizni tanlang…"),
  o'ngda qidiruv.
- Ixtiyoriy binafsha banner (yopiladigan) — bizda kerak emas.
- **2 ustunli** kategoriya kartalari, 1140px, gap 16px, karta **490×120**:
  chapda rasm **164×92** (radius 6) + pastki-o'ngda qora/60% pill "1 kurs";
  o'ngda nom 16px qalin + tavsif 13px kulrang (2 qator).
- Kategoriya bosilganda — shu kategoriya kurslari (bizdagi katalog kartalari).

## 3. Yangiliklar (`/news`) — rasm 04

- Hero **yo'q**. Kontent **700px** markazda.
- Yuqorida **slider** karta: 700×220, radius 12, muqova rasmi, ustida
  sarlavha oq + "Batafsil ma'lumot" oq tugma (chap-past), pastda nuqtalar.
- Keyin qator: "Yangiliklar" 28px qalin chapda, qidiruv 220px o'ngda.
- Ro'yxat: birinchi element oq karta (soya, radius 12, padding 24), qolganlari
  fonsiz, ostida chiziq. Har biri: sarlavha 18px qalin (emoji bilan boshlanadi),
  qisqa matn 13px kulrang, footer: ♡ 211 · 💬 83 · 👁 735 (13px kulrang, 16px
  ikonka); o'ngda kichik muqova 170×22 (banner bo'lsa).
- Bizda faqat ko'rishlar bor → ♡ va 💬 hozircha yo'q (backend kerak).

## 4. Rivojlanish rejalari (`/development-plan`) — rasm 05

- Oq sahifa, hero yo'q. "Mening rivojlanish rejalarim" 24px qalin, kontent
  **840px** markazda, yuqoridan 72px.
- Bo'sh holat: illyustratsiya 100px + "Rejalar hali yo'q" 14px kulrang,
  sahifa markazida.

## 5. Bilimlar bazasi (`/kb`) — rasm 06–15

Ikki ustunli maxsus qobiq (topbar ostida):

```
┌ Sidebar 200px ──┐┌ Asosiy ──────────────────────────────────┐
│ [+ Yaratish] 36 ││ ▯ ‹ › Sharh › Bo'shliq nomi (breadcrumb)  ⚙ 🔗 ···│
│ 🔍 Qidiruv      ││                                            │
│ ▦ Sharh   (faol ││        "Bilimlar bazasi" 28px markazda     │
│ 🕘 So'nggilar   ││   [🔍 Savol yoki maqola nomi…   ⌘+K] 380px │
│ 📊 Analitika    ││                                            │
│ 🗑 Savat        ││ "Bo'shliqlar 1" 16px                        │
│                 ││ ┌276×176┐ ┌ + Bo'shliq yaratish (dashed) ┐ │
│ BO'SHLIQLAR 1   ││ │ rangli │ │                             │ │
│ › Y Yangi xodim ││ │ tepa,  │ │                             │ │
│                 ││ │ ikonka │ └─────────────────────────────┘ │
└─────────────────┘└─────────────────────────────────────────────┘
```

- Sidebar: "Yaratish" to'q yashil to'liq kenglik 36px; nav elementlari 30px,
  faol — kulrang pill; "BO'SHLIQLAR N" 11px harf oralig'i, daraxt: › + 24px
  rangli kvadrat harf + nom (kesiladi); `···` bilan menyu (Sozlamalar,
  Ruxsat, Havola, Analitika).
- Bo'shliq sahifasi: **yashil gradient hero** (kontent ichida, radius 12,
  balandlik 220): nom 28px, tavsif 13px, qidiruv 380px oq; pastda o'ngda
  ▦/⇅ ko'rinish tugmalari; hujjat kartalari **200×130** kulrang fon
  (`#F3F4F6`), nom 15px, pastda "hujjat • 18 KB" 12px.
- "So'nggilar": ro'yxat qatori: fayl ikonkasi kvadrat 32 + nom + "• hujjat •
  17 KB", o'ngda sana.
- Yaratish menyusi: 4 kvadrat (Papka, Maqola, Havola, Hujjat yuklash) +
  keng "Bo'shliq" tugmasi.
- Modallar: sarlavha 22px, maydon label 13px kulrang, input 44px radius 8,
  fokusda **2px to'q yashil**, o'ngda `11/255` hisoblagich; tugmalar
  o'ng-pastda: kulrang "Bekor" + to'q yashil "Yaratish".
- Xodim uchun: "Yaratish", Analitika, Savat — faqat ruxsat bo'lsa.

Bizda backend `/kb` (kategoriya = bo'shliq, maqola, baho, izoh) bor,
frontend yo'q → yangi sahifalar.

## 6. Ish o'rnida o'qitish (`/ojt`) — rasm 16, 17

- Kontent 840px. Qator: "Ish o'rnida o'qitish" 24px qalin + `?` yashil
  doira; o'ngda **[+ Yangi sessiya]** to'q yashil 36px.
- Pastda: segment **[Men o'qitaman | Meni o'qitishadi]** (kulrang fon pill,
  faol oq); o'ngda qidiruv 150px + [≡ Filtr] kulrang tugma.
- Bo'sh holat markazda: illyustratsiya + "Hech narsa topilmadi" 14px qalin +
  "Qidiruvni o'zgartirib ko'ring" + [Filtrlarni tozalash] kulrang tugma.

## 7. Vazifalarni tekshirish (grading) — rasm 18

- 840px. "Vazifalarni tekshirish" 24px + o'ngda yashil havola
  "↗ Vazifalar hisobotiga o'tish". Chapda [≡ Filtr], o'ngda "⇅ Yuborilgan
  sana bo'yicha ⌄".
- Bo'lim sarlavhasi: "BOSHQA TEKSHIRILMAGANLAR 16" 12px harf oralig'i + ˄.
- Qator 88px, ostida chiziq: [ikonka 40 kvadrat] nom 14px + "Kurs: …" 12px
  kulrang | avatar 24 + ISM (katta harf) + "lavozim • filial" | "Urinish: 1"
  + sana 12px.

Bizda bu admin panelda (`/bos/grading`); xodim portalida ruxsati borlarga
`···` orqali ko'rsatiladi.

## 8. Xodimlar — rasm 19–22

- Yuqorida markazda segment: Xodimlar · Yangi xodimlar · Orgstruktura · Ro'yxat.
- **Xodimlar:** chapda karta 260×150 (bino ikonkasi ko'k doira 40, nom 20px,
  "9 072 xodim"), pastida "Orgstrukturada ko'rish" havola; o'ngda
  "Bo'linma haqida" + tavsif, "Xodimlar 9072" + qidiruv/filtr/ko'rinish,
  "Bu bo'linmada 8", **4 ustun** gradient kartalar 135×220 (ism oq katta
  harf pastda).
- **Ro'yxat:** filtr tugmalari qatori, "Jami: 9072", jadval: avatar 32 + ism,
  bo'linma (rangli nuqta), lavozim, rahbar, funksional rahbar, telefon,
  email, tug'ilgan kun, o'zi haqida; ⚙ ustunlar.
- **Orgstruktura:** daraxt, kartalar 190×110 rangli sarlavha, pastda
  "▯ 160 ⌄" hisob; chap-pastda zoom `− 100% +`.

Backend'da xodim uchun katalog endpointi yo'q (`USER_READ` kerak) → keyingi
bosqich, alohida qaror.

## 9. Yon panellar (drawer, o'ngdan) — rasm 23–26

| Panel | Kenglik | Tarkib |
|---|---|---|
| Tug'ilgan kunlar (sovg'a) | 310px | sarlavha 16px + ×; segment "Yaqinlari 0 / O'tganlari 1"; bo'sh holat |
| Xabarlar (chat) | 620px | chapda 220px ro'yxat (qidiruv + "+"; avatar 32, ism qalin 13px, oxirgi xabar 12px, sana), o'ngda "Kimga yozmoqchisiz…" |
| Bildirishnomalar | 440px | sarlavha + ⚙ + ×; "Hammasini o'qilgan deb belgilash" o'ngda 12px; element: qo'ng'iroq doira 24 + matn 14px (kurs nomi **qalin**) + "1 kun oldin" 12px + o'ngda yashil nuqta 8px (o'qilmagan) |
| Profil (avatar) | 560px | muqova 150px, avatar 110 markazda, muqovaga yarim kirgan; ism 22px, email 13px; 3 ta stat (raqam 28 + izoh 13, vertikal chiziqlar); "Mening profilim" 13px kulrang; menyu 52px qatorlar (› bilan): Admin portaliga o'tish (ruxsat bo'lsa) · Yutuqlar · Profil sozlamalari · O'qish tarixi · Chiqish |

Drawer fon: oq, chap tomonda soya, orqada qora/30% overlay.

## 10. Profil sahifasi (`/profile`) — rasm 27–35

```
┌ Muqova 1024×120 (foto), radius 0 ────────────────────────────┐
│                                                               │
└───────────────────────────────────────────────────────────────┘
   (avatar 90px, muqova pastidan 45px chiqib turadi, chapdan 72px)
   Ism 24px qalin (avatar o'ngida, 16px)        10        0        2
   Rol 13px kulrang                          ball       beydj   sertifikat
                                            (28px)   (izoh 12px kulrang)
   ─ 32px ─
   [Umumiy] Reyting  Ballar  Beydjlar  Sertifikatlar  Sozlamalar   ← pill-tab
   ─────────────────────────────────────────────── chiziq
```

- Ichki kontent **880px** (chapdan 72px).
- **Umumiy:** "Reytingdagi o'rin" 16px + o'ngda "To'liq reyting →" 12px;
  2 qator (o'zi va bittа yuqoridagi): rang doira 1/2/3 (oltin/kumush/bronza)
  yoki "4.", avatar 24, ism 13px; o'ngda 👑 12 · 🏅 0 (yashil ikonka); o'z
  qatori och yashil fon. "Mening beydjlarim" (bo'sh: "Beydjlar yo'q"),
  "Mening sertifikatlarim" + "Hammasini ko'rish →".
- **Reyting:** "⊙ Reytingdagi o'rin: 4"; jadval: Foydalanuvchi | Ballar |
  Beydjlar; qatorlar 48px.
- **Ballar:** jadval Sana | Nima uchun | Ballar (👑 +1).
- **Beydjlar:** bo'sh matn markazda.
- **Sertifikatlar:** 2 ustun; sertifikat rasmi 96×66 + "«Kurs» uchun" 15px +
  sana 12px.
- **Sozlamalar:** uch bo'lim 16px sarlavha: Asosiy ma'lumot (Login, Email —
  matn; Telefon — input 265px + izoh; O'zim haqimda — textarea 0/255;
  [Saqlash] to'q yashil, input ostida o'ngda), Parolni o'zgartirish (3 ta
  parol input + ko'z; Saqlash o'chiq), Hisob sozlamalari (Til select, Vaqt
  mintaqasi select + izoh, "Hisobni o'chirish" — matn). Label ustuni 125px.

## 11. O'qish tarixi (`/profile/history`) — rasm 36

- 900px. "O'qish tarixi" 24px + izoh 13px. O'ngda "1–25 / 44" + ‹ ›.
- Jadval: Sana/Vaqt ↓ | Materiallar (ikonka 16 rangli + nom; ichki qator
  daraxt chizig'i bilan) | Holat (Jarayonda kulrang · Tugallangan yashil ·
  Tugallanmagan qizil · Boshlanmagan) | Ko'rilgan % | Ballar "– (80 %)" |
  Sarflangan vaqt hh:mm:ss. Qator 36px.

**Bajarildi (2026-09-11):** `GET /users/:id/learning-history` (o'zi yoki
`user:read`), `learningHistory.service.js` — qatorlar `collectCourseItems`
dan, ya'ni tugatish qoidasi bilan bir manbadan; sahifa
`LearningHistoryView.vue`, qatorlar bosilganda ochiladi. Vaqt faqat
video + SCORM soniyalaridan — hujjat va matn darsi vaqt o'lchamaydi,
shuning uchun jadval ostida shu izoh turadi.

## 12. `···` menyusi — rasm 46

- Tugma faol bo'lganda och yashil doira (oq/20%); ostida **oq panel 880×370**,
  radius 16, soya, topbar'dan 8px pastda, markaziy nav ostida chapga
  tekislangan.
- 3 ustun, sarlavha 16px semibold, elementlar 14px kulrang-qora, 44px qator,
  hover/faol — kulrang pill (`#F3F4F6`, radius 8):

| Ta'lim | Kompaniya | Rivojlanish |
|---|---|---|
| Mening kurslarim | Yangiliklar | Rivojlanish rejalari |
| Tadbirlar | Kompaniya (xodimlar) | |
| Kurslar katalogi | | |
| Bilimlar bazasi | | |
| Ish o'rnida o'qitish | | |
| Vazifalarni tekshirish | | |

Bizda qo'shimcha: Kalendar, Vazifalar, Yo'nalishlar, Kompetensiyalar,
Baholashlar (360°), Chat — "Ta'lim"/"Rivojlanish" ustunlariga kiradi.

## 13. Kurs sahifasi (`/courses/:id`) — rasm 37–40

```
┌ Hero 220px, foto + qora 55% ─────────────────────────────────────┐
│ ← Mening kurslarimga qaytish (12px oq)     [Kurator bilan bog'lanish ?]│
│                                                                  │
│ 📖 Kurs (12px)                                                   │
│ Sotuvchi ustoz yakuniy test (30px oq semibold)        Jarayonda │
│ ───────────────── progress 4px, oq/30% + oq to'ldirish ───────── │
├ Oq tab paneli 56px: [Mundarija] Kurs haqida  Sharhlar (81)  Savol-javob (6) ┤
└ Kontent 1340px, kulrang fon ─────────────────────────────────────┘
```

- Kontent kengligi **1340px** (kurslar ro'yxatidan keng).
- **Mundarija:** oq karta, qatorlar 60px: holat doirasi 20px (bo'sh /
  yashil ✓) + nom 14px + turi 12px kulrang ("Test", "Video"); o'ngda holat
  matni.
- **Kurs haqida:** "Tavsif" 16px semibold + "📖 1 material"; chiziq;
  "Kurator": avatar 32 + ism qalin + "O'qish bo'yicha savol bormi?" +
  havola "Kurator bilan bog'laning" (ko'k). Kurator = kurs yaratuvchisi
  yoki tayinlangan mas'ul; havola chatga olib boradi.
- **Sharhlar:** "★ 5.0 • 81 sharh" 16px; avatar + o'chiq input "Kursni
  tugatgach sharh qoldira olasiz"; ro'yxat (540px): avatar 32 + kulrang
  karta (radius 8, padding 12): ISM 13px qalin katta harf + "2 kun oldin"
  12px + 5 ta to'q sariq yulduz 14px. Bizda `courseReviews` bor.
- **Savol-javob:** "Kursga savollar 6"; oq karta ichida avatar + input
  "Savolingizni yozing…"; ro'yxat: avatar 32, ISM qalin, matn 14px,
  "1 oy oldin • Javob berish" 12px. Bizda `courseQuestions` bor.

## 14. Test pleyeri — rasm 41–43

To'liq ekran (sahifa ustida), portal navigatsiyasi ko'rinmaydi:

- Yuqori panel **36px** to'q kulrang `#2B2B2B`: test nomi 13px oq qalin
  chapda, × o'ngda.
- Fon `#D9D9D9`. Markazda oq karta **720×460**, radius 4, ichida 1px
  chegarali oq maydon.
- Davom etish dialogi: 360×150 oq, `?` doira ikonka, "Qolgan savoldan
  davom etasizmi?" 13px, tugmalar **Ha / Yo'q** yashil 36px radius 6.
- Savol: turi izohi qalin ("Bir nechta javobni tanlang") + savol matni
  14px; variantlar to'liq kenglik **36px** qatorlar, orasi 5px: tanlangan —
  och ko'k `#DCE6FA` + ko'k checkbox/radio, tanlanmagan — `#F5F5F5`,
  chegara 1px; kartaning pastki paneli: "Savol 2 / 20" 12px kulrang o'ngda
  + yashil **Javob berish** tugma (radius 6, 34px).
- Bitta savol bir vaqtda; "Javob berish" keyingisiga o'tadi, oxirgisida
  topshiradi. Orqaga yo'q.

Bizdagi `AssessmentView` hozir barcha savollarni bitta sahifada ko'rsatadi
→ bir-savol oqimiga o'tadi, yuborish oxirida (backend bitta `submit`).

## 15. Slayd pleyeri — rasm 44, 45

Xuddi shu qobiq (36px panel + 720×460 karta): slayd rasmi, pastki panel
44px: chapda [≡ slaydlar] [▶] yashil kvadrat 32px + [tezlik] oq; o'ngda
"1 / 20" + [‹] oq [›] yashil. ≡ — chapdan popover 300px: "Slaydlar" +
qidiruv, ro'yxat: thumbnail 80×45 + "1. ---", faol — kulrang.
**Bizda slayd kontent turi yo'q** (matn darsi va SCORM bor) — keyingi
bosqich, alohida qaror.

## Bajarish tartibi

1. Qobiq: topbar, `···` (3 ustunli panel), o'ng klaster, 3 ta drawer
   (bildirishnoma, chat, profil; sovg'a hozircha yashirin), HADIYA.
2. Mening kurslarim + Katalog (kategoriya kartalari) + Kurs sahifasi
   (4 tab) + Test pleyeri (bir savol, to'liq ekran).
3. Yangiliklar (slider + ro'yxat).
4. Profil sahifasi (6 tab) — mavjud Reyting/Sertifikatlar/Sozlamalar
   sahifalari shu yerga ko'chadi, eski yo'llar redirect.
5. Bilimlar bazasi (xodim ko'rinishi: bo'shliqlar, maqolalar, qidiruv).
6. OJT, Rivojlanish rejasi, Vazifalar tekshiruvi — qator/segment/bo'sh holat.
7. Backend talab qiladiganlar (alohida): xodimlar katalogi, o'qish tarixi,
   yangilik like/izoh, tug'ilgan kunlar.

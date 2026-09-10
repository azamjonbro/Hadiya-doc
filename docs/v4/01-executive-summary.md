# 1. EXECUTIVE SUMMARY — iSpring LMS parity audit

**Sana:** 2026-09-08 · **Metod:** capability darajasida 1×1
**Bizning manba:** kod (39 model, 45 servis, 34 router, 36 sahifa, 71 test)
**iSpring manbasi:** rasmiy sahifalar va 5 yillik reliz jurnali (§2.0)

---

## 1.1 Raqamli manzara

| | Soni |
|---|---|
| Ko'rib chiqilgan capability | **346** |
| — iSpring'da rasmiy manba bilan **tasdiqlangan** | 259 |
| — iSpring uchun **VERIFY** (manba yetarli emas) | 77 |
| — iSpring'da rasmiy manbada **uchramaydi** | 10 |
| **Bizda mavjud** (FULL + OURS+ + PARTIAL) | **148** |
| — FULL PARITY | **51** |
| — OUR SYSTEM SUPERIOR | **43** |
| — PARTIAL PARITY | **54** |
| **Bizda yo'q** (NO PARITY) | **155** |
| VERIFY (bizning holatimiz iSpring'ga bog'liq) | 33 |
| NOT APPLICABLE (asoslangan rad javobi) | 10 |

| Ball | Qiymat |
|---|---|
| **iSPRING** (baza) | 100 |
| **OUR LMS** — vaznsiz o'rtacha (336 baholangan capability) | **34,2** |
| **OUR LMS** — biznes ahamiyati bo'yicha vaznlangan | **36,8** |
| **PARITY GAP** | **≈ 63%** |

> Ballar `docs/v4/03-parity-matrix.md` faylidan **skript bilan** hisoblangan,
> qo'lda emas — qayta hisoblash mumkin.

### Qayta hisob — 2026-09-08, kechqurun (Blok 0 ishidan keyin)

Matritsa qayta o'qildi va 9 ta qator kodga qarab yangilandi (checklist
0.1–0.5, 0.7 bajarilgani uchun): leaderboard PII, kurs qidiruvidagi ReDoS,
presigned yuklab olish, hisobot + dashboard scope'i, eksport auditi, audit
jurnalini ko'rish, audit TTL.

| Metrika | Ertalab | Hozir |
|---|:--:|:--:|
| Vaznsiz (337 capability) | 34,1 | **36,3** |
| Vaznlangan (domen guruhi) | 35,3 | **37,3** |
| **PARITY GAP** | ≈66% | **≈64%** |

Eng ko'p o'sgan domenlar: xavfsizlik/audit **44,2 → 59,6**, hisobot
**41,7 → 51,2**, kontent **55,7 → 59,1**.

> **Metodologiya eslatmasi.** Yuqoridagi 36,8 raqamini qayta hisoblab
> bo'lmaydi: na hisoblash skripti, na vazn jadvali repozitoriyda yo'q.
> Bu jadvaldagi vaznlangan ustun §18 dagi ochiq qoida bilan hisoblangan
> (yadro domen ×3, muhim ×2, tor ×1 — vaznlar domen guruhi darajasida),
> shuning uchun raqam takrorlanadi. Vaznsiz ustun esa matritsadan
> to'g'ridan-to'g'ri chiqadi va ikkala usulda ham bir xil.

### Qayta hisob — 2026-09-10 (BLOK 1–9.4 ishidan keyin)

Matritsa **satrlar darajasida** BLOK 1–8 davomida yangilanib borgan, lekin
sarlavhadagi umumiy raqam 2026-09-08 dan qimirlamagan — ya'ni yuqoridagi
36,3 faqat BLOK 0 tugagan holatni aks ettiradi. Bugun 9.1 va 9.2 (matn
darsi, blok editori) yozilgandan keyin raqam matritsaning **hozirgi
satrlaridan** qayta hisoblandi:

| Metrika | 2026-09-08 (BLOK 0) | Hozir (BLOK 1–9.4) |
|---|:--:|:--:|
| Vaznsiz (337 capability) | 36,3 | **54,5** |
| FULL | — | **112** |
| OURS+ | — | **48** |
| PARTIAL | — | **56** |
| NONE | — | **97** |
| VERIFY | — | **24** |
| **PARITY GAP** (vaznsiz) | ≈64% | **≈46%** |

Sakrash yangi ishning o'zidan emas: BLOK 1–8 (yetkazish, ierarxiya,
sertifikat, baholash, path, tadbir, qidiruv/KB/compliance, hisobot) allaqachon
satrlarda hisobga olingan edi, faqat jamlanmagan edi. 9.1–9.4 ning o'z hissasi uch
bo'limda ko'rinadi: **kontent (D04–D09) 56 → 69**, **authoring (D10–D12)
11 → 36** va **standartlar/korxona (D80–D95) 30 → 42** (SCORM va subtitr).

> **Vaznlangan ustun qayta hisoblanmadi.** Vazn jadvali repozitoriyda yo'q
> (yuqoridagi metodologiya eslatmasiga qara), shuning uchun bu yerda faqat
> matritsadan to'g'ridan-to'g'ri chiqadigan vaznsiz raqam berilgan. Vaznsiz
> ballar bo'lim jamilari bilan birga `docs/v4/03-parity-matrix.md` da.

## 1.2 Bir jumlada

Biz **o'qishni isbotlash** bo'yicha iSpring'dan oldindamiz va **o'quv
menejmenti** bo'yicha undan uchdan ikki qism ortdamiz. 155 capability
umuman yo'q, va ularning yarmi to'rtta domenga jamlangan: sertifikat,
knowledge base, 360°/OJT, onboarding/development plan.

## 1.3 Domen ballari — eng past va eng yuqori

| Eng past | Ball | | Eng yuqori | Ball |
|---|:--:|---|---|:--:|
| 360° / OJT / Kompetensiya | **0** | | Kurs strukturasi | **70** |
| Sertifikat / Knowledge base | **3** | | Katalog | 56 |
| Interaktiv kontent / Builder | **11** | | Kontent (video, hujjat) | 56 |
| Onboarding / Assignment | **12** | | Mobil (responsive qismi) | 56 |
| Bildirishnoma / E-mail / Push | **22** | | Foydalanuvchi / RBAC / Org | 47 |
| Integratsiya / API / SSO | **23** | | Gamification / Social | 45 |
| Live training / Kalendar | **25** | | Xavfsizlik / Audit / Admin | 44 |

## 1.4 To'rtta halokatli nol

Bu to'rtta domen ballarning yarmini pastga tortadi va **birgalikda 61
capability** ni tashkil qiladi:

| Domen | Capability | Ball | Nega halokatli |
|---|:--:|:--:|---|
| Sertifikat + KB | 19 | 3 | Compliance auditi uchun sertifikat majburiy; KB — kunlik ishlatiladigan yagona bo'lim |
| 360° + OJT + Kompetensiya | 11 | 0 | HR direktorining LMS sotib olish sababi ko'pincha shu |
| Onboarding + Assignment | 13 | 12 | iSpring buni **bitta modulda** beradi (Development Plans, S2 2024-04) |
| Bildirishnoma | 15 | 22 | Ilovaga kirmagan xodim hech narsa bilmaydi; parol tiklash amalda ishlamaydi |

## 1.5 Ustunligimiz haqida halol baholash

Matritsada **43 ta `OURS+`** bor. Lekin foydalanuvchining o'z qoidasi —
*"iSpring source'siz da'vo qilma"* — teskari tomonga ham amal qiladi:

| Toifa | Soni | Ma'nosi |
|---|:--:|---|
| **A — tasdiqlangan ustunlik** | **9** | iSpring'ning 5 yillik reliz jurnalida (S2) umuman uchramaydi: diqqat monitoringi, diqqatsizlik ayirish, proctoring, face gate, server test sessiyasi, savollarni sessiyagacha bermaslik, tashlab ketishni yozish, trash avtomatik tozalash, ovozli xabar |
| **B — implementatsiya darajasida kuchliroq** | **10** | iSpring'da ham bor, biz qattiqroq qilamiz: anti-skip, sahifa progressi, lock majburlash nuqtasi, targeting, ball idempotentligi, rate limiting, reuse detection, magic-byte, hisobot i18n, segment auth |
| **C — VERIFY** | **24** | Bizda kuchli, iSpring'da bor-yo'qligi **tasdiqlanmagan** — ustunlik deb da'vo qilinmaydi |

**Amaliy xulosa:** haqiqiy, isbotlangan ustunligimiz **9 ta**, va ularning
hammasi bitta mavzuda — **o'qish va imtihon yaxlitligini isbotlash**.
Bu bizning yagona haqiqiy differensiatorimiz. Roadmap uni **yo'qotmasligi
kerak** — §28 dagi 18 regressiya testi shu uchun.

## 1.6 Auditda topilgan yangi holat

**iSpring 2026-08-18 da AI tillari orasiga o'zbek tilini qo'shdi** (S2).
Uch tilli UI'imiz endi ustunlik emas — iSpring 30 tilli UI va AI'da 70+ til
beradi. Bu auditning eng noqulay topilmasi: bizning mahalliy afzalligimiz
yopilib bormoqda.

## 1.7 Yetti P0 — darhol

| # | Muammo | Dalil | Turi |
|---|---|---|---|
| P0-1 | Hisobot scope'siz — MANAGER butun kompaniya PII'sini eksport qiladi | `report.controller.js:20` | Ma'lumot sizishi |
| P0-2 | Scope rol nomiga bog'langan — custom rol chegarasiz | 14 joyda `roleName === ROLES.MANAGER` | Avtorizatsiya |
| P0-3 | Leaderboard har bir xodimga hamkasblarining JSHSHIR'ini beradi | `points.service.js:104` | PII |
| P0-4 | Kurs tugatish ikki xil hisoblanadi; videosiz kurs hech qachon tugallanmaydi | `course.service.js:116` ↔ `videoEventProcessor.js:245` | Buzilgan yadro oqimi |
| P0-5 | Audio material va yuklab olish production'da ishlamaydi | `materialAccess.service.js:52` | Buzilgan oqim |
| P0-6 | Backup umuman yo'q | — | Ma'lumot yo'qolishi |
| P0-7 | Kurs qidiruvida escape'siz regex (ReDoS) | `course.repository.js:91` | Xizmat rad etilishi |

## 1.8 Yo'l xaritasi qisqacha

| Bosqich | Hafta | Parity |
|---|:--:|:--:|
| B0 — P0 tuzatishlari + poydevor | 1 | 37 → 39 |
| B1–B2 — scope + yetkazish (parallel) | 3 | 39 → 48 |
| B3–B4 — sertifikat + baholash (parallel) | 4 | 48 → 63 |
| B5–B10 — path, shaxs, live training, qidiruv, KB, onboarding, compliance | 22 | 63 → 89 |
| B11–B14 — hisobot, kontent, PWA, korxona | 17 | 89 → 98 |

**Bitta dasturchi:** ~47 hafta · **Ikki dasturchi:** ~32 hafta.
**15-haftada parity 63 ga chiqadi** — iSpring bilan haqiqiy raqobatga
kiradigan nuqta.

## 1.9 Nima qilinmaydi

10 capability **asoslangan ravishda rad etildi** (§24): native mobil ilova,
multi-tenant, SOAP, cmi5, PowerPoint add-in, marketplace, e-commerce,
oflayn test, oflayn biometrika, 24/7 SLA. Ikkitasi — native ilova va
multi-tenant — qaytarib bo'lmaydigan qaror emas; §24 da har biri uchun
qayta ko'rish sharti yozilgan, va **arzon sug'urta** taklif qilingan:
barcha yangi modellarga `orgId: null` maydonini hozirdan qo'shish.

## 1.10 20 ta ochiq savol

iSpring haqida **77 capability VERIFY** holatida. Ulardan 20 tasi qaror
o'zgartira oladi (§29) — webhook, cmi5, SAML, sertifikat QR tekshiruvi,
savol turlari, essay baholash, qisman ball, WCAG, audit jurnali, 2FA,
watermark, proctoring, rate limiting, kurs versiyalash, tasdiqlash oqimi,
hisobot scope'i va boshqalar. **Bu savollar sotuvchiga berilmaguncha
tegishli parity qarorlari vaqtinchalik.**

# v3 — Ikkinchi bosqich: 1×1 implementatsiya auditi

**Sana:** 2026-09-08 · **Metod:** har bir da'vo kod bilan tasdiqlangan
(fayl, funksiya, satr). Birinchi auditning (`docs/v2/`) hech bir xulosasi
tekshirilmasdan qabul qilinmadi.

## Nima uchun ikkinchi bosqich kerak bo'ldi

`docs/v2/` feature ro'yxati darajasida solishtirgan edi. Bu bosqich
**implementatsiya darajasida** solishtiradi — va shu chuqurlikda
**14 ta xulosa noto'g'ri yoki chala** bo'lib chiqdi: beshta ish o'ylanganidan
yengil, **to'rtta yangi CRITICAL** esa umuman ko'rilmagan edi.

## Fayllar

| Fayl | Ichida |
|---|---|
| [01-corrections.md](01-corrections.md) | **Avval shuni o'qing.** v2 xulosalarining 14 ta tuzatishi, har biri kod dalili bilan |
| [02-inventory.md](02-inventory.md) | iSpring 60-domen inventari + bizning tizim inventari (koddan chiqarilgan) |
| [03-feature-1x1.md](03-feature-1x1.md) | 24 ta kritik feature — to'liq 25 maydonli chuqur format |
| [04-user-flows.md](04-user-flows.md) | 32 user flow qadam-ba-qadam: qaysi qadam yo'q / ortiqcha / noto'g'ri / himoyasiz |
| [05-database-api-permissions.md](05-database-api-permissions.md) | 38 entity DB solishtiruvi · API GAP'lar · 7 rol × 10 amal ruxsat matritsasi |
| [06-matrices-deep.md](06-matrices-deep.md) | Bildirishnoma · avtomatlashtirish · hisobot · AI · xavfsizlik (48 band) · mobil · accessibility · performance (5 miqyos) |
| [07-scores-dependencies.md](07-scores-dependencies.md) | Olmaydigan featurelar · 32 domen bo'yicha gap score · **dependency graph** |
| [08-acceptance-tests.md](08-acceptance-tests.md) | 36 qabul testi + 12 regressiya testi (mavjud ustunligimizni himoya qiladi) |
| [09-master-checklist.md](09-master-checklist.md) | **Yakuniy natija.** Ketma-ket bajariladigan developer checklist, 14 blok |

## Uchta asosiy raqam

| | |
|---|---|
| **OUR SCORE** (32 domen, vaznlangan) | **34 / 100** |
| **GAP** | **~67%** |
| **Yangi topilgan CRITICAL** | **4 ta** (hammasi xavfsizlik yoki ma'lumot yaxlitligi) |

## Yangi topilgan to'rtta CRITICAL

| # | Nima | Dalil |
|---|---|---|
| 1 | **Hisobot va dashboard scope'siz** — MANAGER `GET /users` da o'z bo'limini ko'radi, lekin `GET /reports/employee-progress/export` da **butun kompaniyani** yuklab oladi | `report.controller.js:20` — `actor` uzatilmaydi |
| 2 | **Scope rol nomiga bog'langan** — `POST /roles` bilan yaratilgan custom rol hech qanday bo'lim chegarasiga tushmaydi | 14 joyda `roleName === ROLES.MANAGER` |
| 3 | **Leaderboard JSHSHIR oshkor qiladi** — har bir xodim hamkasblarining 14 xonali raqamini oladi | `points.service.js:104`, endpoint ruxsatsiz |
| 4 | **Kurs tugatish ikki xil hisoblanadi** — UI material va testni sanaydi, assignment statusi faqat videoni; videosiz kurs **hech qachon** tugallanmaydi | `course.service.js:116` ↔ `videoEventProcessor.js:245` |

## Beshta yengillashgan ish

| Nima | Nega |
|---|---|
| XLSX viewer | **Allaqachon bor** (`renderXlsx`) → `KEEP` |
| Material ko'rish | API stream orqali **ishlaydi**; faqat audio va yuklab olish buzilgan |
| Manager scope | 5 domenda **allaqachon majburlanadi** → `EXTEND`, `ADD` emas |
| Settings modeli | `attentionPolicy`/`facePolicy` da GLOBAL→COURSE meros naqshi bor → umumlashtirish |
| Testlar | 3 fayl emas, **71 test** — xavfsizlik qamrovi yaxshi |

## Boshlash nuqtasi

[09-master-checklist.md](09-master-checklist.md) → **BLOK 0** (1 hafta,
o'nta bog'liqliksiz ish). Beshta CRITICAL teshik shu blokda yopiladi.

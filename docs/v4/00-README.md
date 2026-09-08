# v4 — iSpring LMS 1×1 PARITY AUDIT

**Sana:** 2026-09-08 · **Maqsad:** development emas — **developmentdan
oldingi yakuniy mahsulot parity auditi**.

## Nima uchun v4

`docs/v2` feature ro'yxati darajasida, `docs/v3` implementatsiya darajasida
solishtirdi. Ikkalasida ham iSpring tomoni **xotiradan** olingan edi.
v4 da iSpring tomoni **rasmiy manbadan** olingan (mahsulot sahifasi va
5 yillik reliz jurnali), va tasdiqlanmagan har bir da'vo `VERIFY` deb
belgilangan.

## Fayllar

| Fayl | Ichida | Bo'limlar |
|---|---|---|
| [01-executive-summary.md](01-executive-summary.md) | Raqamli manzara, 4 halokatli nol, 7 P0, ustunlik halol baholash | §1 |
| [02-ispring-inventory.md](02-ispring-inventory.md) | Manba bilan tasdiqlangan iSpring inventari + 20 VERIFY | §2 |
| [03-parity-matrix.md](03-parity-matrix.md) | **346 capability × 21 domen bloki** — status, ball, kod dalili, gap | §4 |
| [04-flows-and-layers.md](04-flows-and-layers.md) | 46 user flow (5 persona) + DB/backend/API/frontend/permission/notification/automation/reporting/security/mobile/a11y/performance parity | §5–17 |
| [05-gaps.md](05-gaps.md) | Ustunliklarimiz (A/B/C toifa) · iSpring ustunliklari · **P0–P3, 62 ish birligi** · NOT APPLICABLE | §18–24 |
| [06-tests-roadmap.md](06-tests-roadmap.md) | Dependency graph · roadmap · **acceptance testlar** · **18 regressiya testi** · master checklist · 20 VERIFY savoli | §25–30 |

## Yakuniy raqamlar

```
iSPRING                             100
OUR LMS  (vaznsiz, 336 capability)   34,2
OUR LMS  (vaznlangan)                36,8
PARITY GAP                          ≈63%

346 capability:  FULL 51 · OURS+ 43 · PARTIAL 54 · NONE 155 · VERIFY 33 · N/A 10
Bizda mavjud: 148   ·   Bizda yo'q: 155
Ish talab qiladi: 209 capability → 62 ish birligi
```

## Qanday o'qish kerak

1. **Rahbar uchun:** `01-executive-summary.md` — 10 daqiqa.
2. **Arxitektor uchun:** `03-parity-matrix.md` + `04-flows-and-layers.md`.
3. **Dasturchi uchun:** `05-gaps.md` (P0–P3) → `06-tests-roadmap.md` (checklist).
4. **Sotuvchi bilan uchrashuvga:** `06-tests-roadmap.md` §29 — 20 savol.

## Muhim ogohlantirishlar

- **43 `OURS+` dan faqat 9 tasi** manba bilan tasdiqlangan ustunlik (§18.1).
  Qolganlari "implementatsiya darajasida kuchliroq" yoki `VERIFY`.
- **77 capability iSpring tomonida VERIFY** — 20 tasi qaror o'zgartira oladi.
- **iSpring 2026-08 da o'zbek tilini qo'shdi** — mahalliy til ustunligimiz
  yopilmoqda (§1.6).
- Ballar matritsadan **skript bilan** hisoblangan, qo'lda emas.

## Oldingi auditlar

`docs/v2/` — feature ro'yxati darajasida (3218 satr)
`docs/v3/` — implementatsiya darajasida, v2 ning 14 xulosasini tuzatgan (2634 satr)

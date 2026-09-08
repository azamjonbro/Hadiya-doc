# Qo'llanma LMS — iSpring gap audit va v2 spetsifikatsiyasi

> ⚠️ **DIQQAT — bu hujjat qisman eskirgan.**
> Ikkinchi bosqich auditi (`docs/v3/`) har bir da'voni kod bilan tekshirdi va
> **quyidagi 14 xulosani tuzatdi**: `docs/v3/01-corrections.md`.
> Xususan bu yerda "yo'q" deb belgilangan beshta narsa aslida **mavjud**
> (XLSX viewer, manager scope, sozlama modeli, test qamrovi, material ko'rish),
> va bu yerda **umuman ko'rilmagan to'rtta CRITICAL** topildi.
> **Amal qilishdan oldin `docs/v3/01-corrections.md` ni o'qing.**

**Sana:** 2026-09-08 · **Audit qilingan kod:** `backend/src`, `front/src`, `packages/shared`, `docs/`

Bu papka mavjud tizimning iSpring Learn/Suite (2026) bilan A dan Z gacha
solishtiruvini va shu asosda tuzilgan implementatsiyaga tayyor
spetsifikatsiyani saqlaydi.

| Fayl | Nima bor |
|---|---|
| [01-executive-summary.md](01-executive-summary.md) | Xulosa, raqamlar, kuchli tomonlarimiz, eng og'riqli 10 bo'shliq, iSpring'dan **olmaydigan** narsalar |
| [02-feature-matrix.md](02-feature-matrix.md) | 50 domen, 612 feature bo'yicha to'liq matritsa (iSp / Biz / hozirgi implementatsiya / gap / prioritet / KEEP-EXTEND-ADD-REFACTOR / BE / FE / DB / API / murakkablik) |
| [03-technical-changes.md](03-technical-changes.md) | §3 yetishmayotgan funksiyalar · §4 o'zgartiriladiganlar · §5 tegilmaydiganlar · §6 DB o'zgarishlari (sxemalar bilan) · §7 backend · §8 frontend · §9 API |
| [04-matrices.md](04-matrices.md) | §10 ruxsatlar · §11 bildirishnomalar (52 hodisa) · §12 avtomatlashtirish (24) · §13 hisobotlar (22) · §14 AI · §15 mobil · §16 xavfsizlik checklist (60 band) |
| [05-roadmap.md](05-roadmap.md) | Phase 0–10: har biri uchun DB modellari, endpoint'lar, sahifalar, komponentlar, ruxsatlar, bildirishnomalar, job'lar, migratsiyalar va **qabul mezonlari** |
| [06-architecture-and-spec.md](06-architecture-and-spec.md) | §19 yakuniy arxitektura · §20 yangilangan mahsulot spetsifikatsiyasi (funksional + nofunksional talablar) |

## Eng muhim uchta xulosa

1. **Bizning ustunligimiz — isbotlash.** Watched-segments anti-skip, kamera
   diqqat monitoringi, proctoring, face verification, server tomonda test
   taymeri va sequential lock — iSpring'da bularning hech biri yo'q.
   **Ular tegilmaydi.**
2. **Bizning eng katta bo'shlig'imiz — o'quv menejmenti.** Sertifikat,
   e-mail, learning path, savol banki, onboarding, knowledge base,
   compliance — hech biri yo'q.
3. **Arxitektura almashtirilmaydi.** Mavjud layered backend, `packages/shared`,
   BullMQ worker, StorageProvider, dinamik rollar — hammasini ko'taradi.
   Faqat 6 joyda refactor kerak (`03-technical-changes.md` §4.1).

## Boshlash nuqtasi

**Phase 0** (`05-roadmap.md`) — 1 hafta, yangi funksiya emas, buzilgan
narsalarni tuzatish: material yuklab olish, backup, ADMIN/MANAGER ruxsat
nomuvofiqligi, ReDoS, error tracking.

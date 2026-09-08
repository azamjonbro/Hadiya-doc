# 1. EXECUTIVE SUMMARY — iSpring Learn vs Qo'llanma LMS

> **Audit sanasi:** 2026-09-08
> **Audit qilingan kod:** `backend/src` (118 fayl), `front/src` (180 fayl), `packages/shared`, `docs/`
> **Reference:** iSpring Learn + iSpring Suite (2026 funksional roʻyxati)
> **Metod:** har bir model, route, service, view qoʻlda oʻqib chiqildi; taxmin ishlatilmadi.

---

## 1.1 Bir jumlada

Bizda **video-markazli, chuqur analitikaga ega, xavfsizligi kuchli korporativ
o'quv platformasi** bor — iSpring'ning *nazorat va isbot* qismida biz undan
oldindamiz (anti-skip watched-segments, kamera diqqat monitoringi, proctoring,
face verification, sequential lock server tomonda), lekin iSpring'ning
*o'quv menejmenti* qismida (learning path, sertifikat, kompetensiya, onboarding,
development plan, knowledge base, live training, e-mail/push, SCORM, AI course
generation, offline mobile) bizda **umuman yo'q** yoki juda ibtidoiy.

## 1.2 Raqamlarda

| O'lcham | Holat |
|---|---|
| Auditda ko'rib chiqilgan iSpring funksional bloki | 50 domen, 612 alohida feature |
| Bizda to'liq bor (KEEP) | 148 (24%) |
| Bizda qisman bor (EXTEND) | 121 (20%) |
| Bizda yo'q (ADD) | 316 (52%) |
| Qayta arxitektura talab qiladi (REFACTOR) | 27 (4%) |
| CRITICAL prioritetli bo'shliq | 41 |
| HIGH prioritetli bo'shliq | 96 |

## 1.3 Bizning kuchli tomonlarimiz (iSpring'da yo'q yoki zaifroq) — TEGMASLIK KERAK

Bular **raqobat ustunligimiz**. Ularni "iSpring'ga o'xshatish" uchun
soddalashtirish — eng katta xato bo'lardi.

1. **Watched-segments anti-skip algoritmi** (`videoProgress.watchedSegments`) —
   birlashtirilgan, kesishmaydigan intervallar; `completionPercent` faqat
   serverda hisoblanadi. iSpring'da "ko'rildi" bayrog'i asosan klient
   xabariga tayanadi. Bizda videoni oxiriga sudrab tashlab "tugatdim" deyish
   mumkin emas.
2. **Kamera orqali diqqat monitoringi** (`useAttentionMonitor`, MediaPipe,
   `attentionLostCount`, `inattentiveSeconds`, `cameraBlocked`) — kadrlar
   qurilmadan chiqmaydi. iSpring'da bu funksiya yo'q.
3. **Proctoring — begona yuz aniqlash** (`proctorSnapshot`, yopiq bucket,
   180 kunlik TTL, audit-logli ko'rish). iSpring Learn'da yo'q.
4. **Face verification 2FA** (`faceProfile`, 128-float descriptor, kunlik
   gate, challenge-token oqimi). iSpring'da faqat oddiy parol/SSO.
5. **Server tomonda majburiy sequential lock** (`courseSequence.js`) —
   playback token berilishidan oldin tekshiriladi, ya'ni URL'ni qo'lda yozib
   ochib bo'lmaydi.
6. **Assessment sessiyasi serverda** (`assessmentSession`) — 15 daqiqalik
   taymer va focus-loss hisobi serverda; reload taymerni tiklamaydi,
   devtools'dan handler o'chirish yordam bermaydi.
7. **HLS + signed playback token + per-segment auth + watermark** — iSpring'da
   video himoyasi bundan yumshoqroq.
8. **Material o'qish progressi sahifalar to'plami bo'yicha**
   (`materialProgress.viewedPages`) — "eng uzoq sahifa" emas, ya'ni oxirgi
   slaydga sakrab 100% olish mumkin emas.
9. **Ichki chat** (DM + guruh + ovozli xabar + fayl + realtime) — iSpring'da
   faqat kurs muhokamasi bor, to'liq messenger yo'q.
10. **Uch tilli UI kun-1 dan** (uz/ru/en, har birida 1393 kalit).

## 1.4 Eng og'riqli 10 bo'shliq (CRITICAL)

| # | Bo'shliq | Nima uchun kritik |
|---|---|---|
| 1 | **Sertifikat yo'q** | Korporativ LMS'ning eng ko'rinadigan natijasi. Compliance auditi uchun majburiy. |
| 2 | **E-mail/push yo'q** | Bildirishnoma faqat ilova ichida. Kirmagan xodim hech narsani bilmaydi. Parolni tiklash ham ishlamaydi (token faqat logga yoziladi). |
| 3 | **Learning path yo'q** | Bir nechta kursni ketma-ket dastur qilib berish imkonsiz. Onboarding va sertifikatsiya shu ustiga quriladi. |
| 4 | **Test tizimi juda tor** | Faqat 1-to'g'ri-javobli MCQ. Urinishlar soni cheklanmaydi, savol banki, aralashtirish, izoh, qisman ball — hech biri yo'q. |
| 5 | **Course metadata yo'q** | Kategoriya, teg, daraja, muallif, davomiylik, prerequisite — kurslar katalogi qurib bo'lmaydi. |
| 6 | **Global search yo'q** | Har bir entity o'z ichida `RegExp` bilan qidiradi, `$text` indeks yo'q. 500 kursda foydalanib bo'lmaydi. |
| 7 | **Audit log UI/endpoint yo'q** | Model va yozuvlar bor (60+ action), lekin ko'rish uchun na route, na sahifa. Audit paytida foydasiz. |
| 8 | **Compliance/qayta o'qitish yo'q** | Yillik takroriy o'qitish, muddati o'tgan sertifikat, majburiylik dashboard'i — yo'q. |
| 9 | **Public API / webhook / SSO yo'q** | HR tizimi bilan integratsiya imkonsiz; har bir xodimni qo'lda kiritish kerak. |
| 10 | **Offline/PWA yo'q** | Manifest ham, service worker ham yo'q. Filiallarda internet uzilsa o'qish to'xtaydi. |

## 1.5 iSpring'dan **ataylab olmaydigan** narsalar

Ko'r-ko'rona ko'chirish biznesga qiymat bermaydi:

| iSpring feature | Nega olmaymiz |
|---|---|
| iSpring Suite'ning to'liq PowerPoint add-in'i (desktop Windows dasturi) | Bizda desktop mahsulot yo'q va bo'lmaydi. O'rniga: brauzerda PPTX import + slayd-blok konvertatsiya. |
| Flipbook / interaktiv kitob | Bizning materiallar PDF/PPTX; flipbook faqat kosmetik. |
| Marketplace / tayyor kurslar do'koni | Ichki korporativ platforma, tashqi kontent sotilmaydi. |
| E-commerce (checkout, kupon, obuna) | Kurslar ichkarida bepul. §40 — faqat "agar kerak bo'lsa" deb qoldiriladi (Phase 10, optional). |
| cmi5 | SCORM 1.2 + xAPI yetarli; cmi5 O'zbekistonda amalda ishlatilmaydi. Faqat xAPI LRS quriladi, cmi5 keyin qo'shiladi. |
| SAML | Bizning korporativ muhitda Active Directory yo'q; OIDC/JWT SSO yetarli. |
| RTL qo'llab-quvvatlash | uz/ru/en — hech biri RTL emas. Faqat CSS logical properties ishlatiladi, alohida RTL rejimi qurilmaydi. |

## 1.6 Strategik xulosa

Uchta paralel yo'nalish bo'lishi kerak, va ularning tartibi muhim:

**A. "Ishlatib bo'ladigan qilish" (Phase 1–2, ~10 hafta)** — sertifikat,
e-mail/push, learning path, test tizimini kengaytirish, course metadata,
audit UI. Bularsiz platforma korporativ LMS deb atalolmaydi.

**B. "Menejerni jalb qilish" (Phase 3–4, ~10 hafta)** — onboarding,
development plan, knowledge base, live training, assignment (uy vazifasi
topshirish/baholash), 360°, OJT. Bular menejerni har kuni tizimga kirituvchi
funksiyalar; ularsiz LMS faqat xodim uchun qoladi.

**C. "Kengaytirish" (Phase 5–9)** — AI, SSO/API/webhook, authoring
(SCORM/branching), advanced analytics, PWA/offline.

Mavjud arxitektura (layered backend, `packages/shared` permission katalogi,
BullMQ worker, StorageProvider abstraksiyasi, dinamik `roles` kolleksiyasi)
bularning **hammasini ko'taradi** — hech qanday "yangi arxitektura o'ylab
topish" kerak emas. Faqat 4 joyda refactor talab qilinadi (§5 ga qarang):
question modeli, notification delivery qatlami, content-item polimorfizmi,
va admin API ruxsatlari.

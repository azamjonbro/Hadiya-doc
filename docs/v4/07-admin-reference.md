# Admin panel — iSpring ekranlaridan (rasn/, 2026-09-11)

> Manba: `rasn/` dagi 27 ta skrinshot (2026-09-11, ISHONCH'ning jonli
> iSpring admin paneli, ruscha interfeys, 2880px retina → 1440 CSS px).
> Bu hujjat — har rasm bizda qayerga tushgani va nimasi ataylab
> boshqacha ekani. Portal hujjati: `06-learner-portal-reference.md`.

## Qobiq (har rasmda)

| Element | Rasm | Bizda |
|---|---|---|
| Yashil topbar 64px: brend chapda, o'rtada dumaloq yarim shaffof qidiruv (560px), o'ngda chat · qo'ng'iroq · to'r · avatar | 2, 6, 8 | `admin/layouts/Topbar.vue` — qidiruv Command Palette'ni ochadi (`lms:search`), til/mavzu avatar menyusida |
| Chap ikonka reli 56px, bo'lim boshiga bitta ikonka, faoli kulrang kvadrat + chap chetida yashil chiziq; pastda to'r (portalga) va avatar | hammasi | `Rail.vue`, `nav.js` (`adminSections`) |
| Bo'lim ustuni 248px: bo'lim nomi 22px, sahifalar, faoli kulrang pill | 2, 6, 11, 21 | `SubSidebar.vue`; bitta sahifali bo'limda ustun yo'q |
| Kontent oq karta radius 16, kulrang fon | hammasi | `AppShell.vue`; bosh sahifa `meta.plain` bilan fonda |
| Sahifa sarlavhasi 24px, yashil asosiy tugma o'ngda, tekis jadval (13px kulrang sarlavha, 56px qator) | hammasi | `DataTable.vue` tekislandi, sahifalar 24px semibold |

## Bo'limlar → sahifalar

| Rel | Rasm | Bo'lim ustuni | Bizdagi sahifalar |
|---|---|---|---|
| 🏠 | 1 | — | `/bos` — 4 plitka, e'tibor paneli, tekshirish navbati, ko'rish vaqti; o'ngda tugallangan kurslar + yangilik izohlari |
| 📖 O'quv materiallari | 2–3 | Kutubxona, Yo'nalishlar, Savollar banki, Vazifalar, Media, AI, Sertifikatlar, Savat | Kutubxona — jadval (nom, tur, tayinlash, muallif, qo'shilgan) + "Yaratish" menyusi (kurs, yo'nalish, test, topshiriq, SCORM, AI) |
| 📅 Tadbirlar | 4–5 | — | Filtr kartasi, Bugun · ‹ oy › · Oy/Ro'yxat, oylik to'r |
| 👥 Foydalanuvchilar | 6–10 | Xodimlar, Rollar, Filiallar, Guruhlar, Jamoam, Majburiy o'qish | Jadval "Jami: N" + "1–25 / N"; rollar jadvali (qulf); filiallar daraxti (bo'lim → bo'linma); guruhlar jadvali |
| 📈 Rivojlanish | 11–14 | Tayinlangan rejalar | Holat plitkalari (jarayonda · boshlanmagan · kutilmoqda · tugallangan · hammasi · muddati yaqin) |
| 📊 Hisobotlar | 15–16 | Hisobotlar, Reyting, Audit | Guruhlangan ro'yxat (o'quvchilar · kurslar · tadbirlar · qo'shimcha), o'ngda filtr/eksport/reja kartalari |
| ℹ️ Bilimlar bazasi | 17–19 | — | Portal `/kb` (o'zining qobig'i bor: Obzor, Yaqinda, bo'shliqlar) |
| 💬 Savollar | 20 | Kurslar bo'yicha savollar, Tekshirish navbati | `/bos/questions` — chapda kurslar + yashil javobsizlar soni, o'ngda savollar paneli (`GET /courses/questions/summary`) |
| ✅ Ish o'rnida o'qitish | 21–22 | O'quv sessiyalari, Kuzatuv varaqlari | Sessiyalar (`/bos/ojt/sessions`), varaqlar jadvali |
| 🔁 Xodimlarni baholash | 23 | 360° sessiyalar, Kompetensiyalar, Matritsa | mavjud sahifalar |
| 📰 Yangiliklar | 24–25 | Yangiliklar, Chat | Jadval: miniatyura · sarlavha · chop etilgan · kim ko'radi · o'qiganlar · ♡ · 💬 |
| ⚙️ Sozlamalar | 26–27 | Sozlamalar, Bildirishnomalar | Quti tablar Asosiy · Dizayn · Funksiyalar, qoidalar bilan bo'limlar |

## Keyingi bosqichda qo'shilganlar (2026-09-11, ikkinchi o'tish)

| Rasm | Bizda |
|---|---|
| 5, 7 | Tadbir va foydalanuvchi yaratish — alohida sahifa (orqaga strelka, karta, o'ngda Saqlash), modal emas |
| 12–14 | Qoralamalar (`/bos/development-plans/drafts`), reja shablonlari (`/bos/development-plans/templates` — yaratish, tahrirlash, "Reja yaratish" bilan xodimlarga tarqatish) va reja turlari (`/bos/development-plans/types` — ikkitasi tizimiy va qulflangan). API: `/development-plans/types`, `/development-plans/templates`, `POST /development-plans/templates/:id/assign` |
| 17–19 | KB: "Analitika" (ko'rishlar, materiallar, ijobiy baholar; jadval — muallif, ko'rishlar, "N dan", 👍 ulushi) va "Savat" (tiklash) — `news:manage` uchun `/kb` qobig'ida |
| 24 | "Izohlar" moderatsiyasi (`/bos/news/comments`, `GET /news/comments`) va "Bannerlar" (`/bos/news/banners` — qadalgan maqolalar portal slayderining boshida, `pinnedAt`) |
| 25 | Yangilik muharriri to'liq ekranda: muqova / yorliq / kichik sarlavha chiplari, 40px sarlavha, "Sozlash va nashr" paneli; `subtitle` maydoni |
| hammasi | "AI o'quv yordamchisi" yon yorlig'i (kurs tanlab chat) va "?" tugmasi (KB, API hujjati, ⌘K) |

## Ataylab qolgan farqlar

- Rasm 7 foydalanuvchi formasi ikki ustunli (maydonlar bir xil, joylashuv boshqacha).
- Rasm 13 shablonlar va rasm 14 turlar bo'yicha "avto-tayinlash" yo'q — tayinlash qo'lda.
- Oy/kun nomlari "M09" ko'rinishida faqat headless Chrome'da (`uz` lokali yo'q).

# Qo'llanma (Corporate LMS) — hozirgi holat

> Bu fayl loyihaning **hozirgi holatini** qisqacha jamlaydi — nima qurilgan,
> qanday deploy qilingan va nima hali qilinmagan. Asl to‘liq texnik
> spetsifikatsiya `Readme.md` da, arxitektura tafsilotlari `docs/` papkasida,
> deploy operatsiyalari tarixi `data.txt` da.

## Loyiha nima

Kompaniya ichida foydalaniladigan xodimlarni o'qitish platformasi: video
darslar, kurslar, company news, task/event boshqaruvi, AI chat-yordamchi va
chuqur analytics (video watch tracking, news read tracking, proctoring/diqqat
kuzatuvi). Stack: Vue 3 + Vite + Pinia + Tailwind (frontend), Node.js +
Express + TypeScript + MongoDB (backend), Redis (cache), FFmpeg (video
processing), MinIO/S3-compatible storage.

## Qurilgan funksionallik (Phase 1–18, so'ngra qo'shimcha ishlar)

Asosiy 18 bosqich (`docs/roadmap.md` da batafsil) to'liq bajarilgan:

1. **Foundation** — monorepo, TS/Express/Mongo/Vue/Tailwind scaffold, logging, error handling
2. **Auth + RBAC** — login, refresh token rotation, roles/permissions, SuperAdmin seed, 401/403/404
3. **Users** — CRUD, bo'lim/lavozim, kurs biriktirish maydonlari
4. **Courses** — course → topic → video ierarxiyasi, deadline mantiqi
5. **Video upload** — tus resumable upload
6. **Video processing** — worker, ffprobe/ffmpeg, HLS pipeline, thumbnail
7. **Secure streaming** — signed playback token, manifest, watermark
8. **Video analytics** — event batching, watched-segment (anti-skip) algoritmi, session tracking
9–10. **News + News analytics** — CRUD, targeting, scroll/read tracking
11. **Tasks & Events** — CRUD, statuslar, calendar
12. **Notifications** — notification center va trigger'lar
13. **AI Chat** — Claude asosida, faqat foydalanuvchi kirisha oladigan material bilan
14. **Admin analytics dashboard** — statistik kartalar + grafikalar
15. **Reports** — CSV/Excel/PDF export
16. **Security hardening** — `docs/security-threat-model.md` bo'yicha test to'plami
17. **Performance** — Redis caching, pre-aggregation
18. **Production deployment** — Docker/PM2/Nginx/TLS konfiguratsiyasi

Rasmiy 18 bosqichdan tashqari, keyinchalik qo'shilgan/tuzatilgan ishlar
(commit tarixidan, eng yangisi birinchi):

- **Mobil**: forma gridlari telefonda bitta ustunga yig'iladi
- **Filiallar (branches)**: admin panelda filial yaratish/nomini o'zgartirish/o'chirish, sidebar bo'limi, kurslarni filialga bog'lash (department'dan alohida o'lcham, cheklovlar VA bilan birikadi)
- **Settings**: admin panelga o'tish va undan qaytish tugmasi, ikkala switch bitta kartada
- **Performance**: gzip siqish, route-level code splitting (38 ta statik import → 35 tasi dinamik), mount `/auth/refresh` javobini kutmaydi — birinchi mazmunli bo'yash ~3000ms → ~1800ms, entry bundle 1445 KB → 438 KB (xom)
- **Proctoring**: kamerada begona yuz aniqlansa (numFaces:2) surat olib, SUPERADMIN + bo'lim menejeriga bildirishnoma; yopiq bucket, faqat audit-logli endpoint orqali ko'rish, 180 kunlik TTL
- **Attention monitoring**: pauzada inference to'xtaydi, kalibratsiya (140ms) va kuzatuv (300ms) uchun alohida kadens
- **Admin panel /bos ga ko'chirildi**, faqat SUPERADMIN kira oladi (ilgari ADMIN/MANAGER ham kirardi); eski `/admin/*` havolalar ichki redirect bilan ishlayveradi
- **Admin SPA xodim ilovasiga birlashtirildi**: ikkita alohida Vue ilova (front + admin, ikkita domen) → bitta bundle, bitta login, panellar orasida sahifa qayta yuklanmasdan o'tiladi
- **Login**: username o'rniga JSHSHIR yoki passport seriyasi bilan kirish
- **Kurslarni filialga (branch) bog'lash**, admin-tier uchun override
- **Chat**: guruh boshqaruvi funksiyalari (backend API + store)
- **Media manzillari**: rasm/video URL'lari to'g'irlandi (loopback manzil muammosi), video DRAFT/PUBLISHED holati aniqlanmagani tashxislandi va tuzatildi

Bittasi spetsifikatsiyada yo'q, qo'shimcha qilingan: **Course Reviews + Q&A** (backend).

## Deploy holati (ishlab turibdi)

Umumiy VM'da (94.241.173.19, 1.9 GB RAM, yana 6 ta begona sayt bilan bir joyda), Docker emas — systemd xizmatlari:

- `https://spring.techinfo.uz/` — xodimlar SPA
- `https://spring.techinfo.uz/bos` — admin panel (faqat SUPERADMIN)
- `https://qollanma.techinfo.uz/api/v1/` — backend API (SPA shu yerdan chaqiradi, cross-site)
- `spring-lms` va `spring-lms-worker` systemd xizmatlari, ikkalasi ham 512M limit bilan

Deploy: `npm --prefix front run build` → rsync build + backend/src + packages/shared/src → `systemctl restart spring-lms spring-lms-worker` (ssh alias: `qollanma-server`). To'liq buyruqlar `data.txt` bo'lim 6 da.

**Diqqat**: `ops.techinfo.uz` (qo'shni sayt) 2026-08-15 dagi deploy paytida to'xtab qolgan (PM2 `ops-backend`, port 4099) — hali qayta ishga tushirilmagan, egasi o'zi hal qilishini aytgan.

**2026-08-25 deploy**: front (employee + `/bos` admin panel, bitta bundle) va backend
(shu jumladan face-verification kodi) production'ga chiqarildi. Backend uchun yangi
paketlar (`@tensorflow/tfjs-node`, `@vladmandic/face-api`) workspace root'dan
(`/opt/spring-lms`) o'rnatildi, face-api modellari (~12MB) GitHub'dan yuklab olindi,
`spring-lms`/`spring-lms-worker` toza qayta ishga tushdi, qo'shni saytlar tegilmadi.
Serverning `.env`da hali bironta `FACE_*` kaliti yo'q — kod ishlab turibdi, lekin
funksiya butunlay o'chiq (default false). Yoqish uchun avval `docs/face-verification.md`
dagi Rollout bosqichlarini bajarish kerak. `springadmin.techinfo.uz` allaqachon
`spring.techinfo.uz`ga 301 qilar ekan (repodagi `admin/` papkasi va `deploy/spring/`
hujjatlari eskirgan — build/deploy qilinmaydi).

## Hali ochiq qolgan masalalar

- **Material yuklab olish buzilgan** (hali materiallar yo'q, birinchi yuklanganda chiqadi): presigned URL loopback manzil (`127.0.0.1:9000`) ustidan imzolanadi, brauzerda ishlamaydi. To'g'ri yechim — MinIO uchun alohida ochiq host (masalan `media.techinfo.uz`) yoki materiallarni API orqali uzatish.
- Repodagi ishlatilmaydigan `admin/` papkasi hali o'chirilmagan (front ichiga birlashtirilgandan keyin qoldi) — o'chirish yoki qoldirish hal qilinmagan.
- ADMIN/MANAGER rollarining API ruxsatlari qisqartirilmagan — `/bos` UI faqat SUPERADMIN'ga ko'rinadi, lekin ADMIN/MANAGER API'ni to'g'ridan-to'g'ri hali ham chaqira oladi (ataylab, hal qilinmagan qaror sifatida qoldirilgan).
- Attention-monitoring (kamera CPU) haqiqiy kamera bilan tekshirilmagan — faqat build tekshirildi, headless test 0% chiqaradi.
- Proctoring 2-bosqichi (o'quvchi o'rniga boshqa odam — yuz tanish) qilinmagan, faqat 1-bosqich (begona yuz borligini aniqlash).
- Bundle hali 1.44 MB (gzip 432 KB) — code splitting qilingan, lekin yanada qisqartirish mumkin.

## Batafsil hujjatlar

- `Readme.md` — asl to'liq spetsifikatsiya (57 bo'lim, o'zbek tilida)
- `docs/architecture.md`, `docs/data-model.md`, `docs/api-contract.md`, `docs/auth-rbac.md`, `docs/video-streaming.md`, `docs/analytics.md`, `docs/attention-monitoring.md`, `docs/security-threat-model.md`, `docs/roadmap.md`, `docs/deployment.md`
- `data.txt` — spring.techinfo.uz'ga oid barcha deploy/operatsion o'zgarishlar tarixi (sana bo'yicha)

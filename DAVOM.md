# Qo'llanma LMS — davom ettirish prompti

> Bu fayl **yangi sessiyaga tashlash uchun tayyor prompt**. Butun matnni
> ko'chiring, yoki shunchaki `DAVOM.md` ni o'qib boshlashni ayting.
> Oxirgi yangilanish: **2026-09-08**.
>
> Boshlashdan oldin `git log` va `git status` ni o'qi: shu kuni **parallel
> sessiya filiallar (branches) ustida ishlagan**, uning tugallanmagan ishi
> ishchi daraxtda turgan bo'lishi mumkin — unga tegma, o'z commitingga
> qo'shib yuborma.

---

## Vazifa

`docs/v3/09-master-checklist.md` dagi bandlarni **yuqoridan pastga** bajar.
Ro'yxat 91 banddan iborat, tartib bog'liqlik grafi bo'yicha tuzilgan —
prioritet bo'yicha emas, ya'ni tartibni o'zgartirmasdan ishlash mumkin.
`[P]` belgisi — oldingi bandni kutmaydi, parallel qilinadi.

Har bir band uchun: **kod → tekshirish → checklist belgisi → commit → deploy**.
Bittasini oxirigacha tugatmasdan keyingisiga o'tma.

---

## Loyiha nima

Kompaniya ichidagi xodimlarni o'qitish platformasi (korporativ LMS):
video darslar, kurslar, yangiliklar, vazifa/tadbir, AI chat, chuqur
analitika (video ko'rish, diqqat kuzatuvi, yuz tekshiruvi).

- **Backend:** Node.js + Express + MongoDB + Redis + BullMQ, ESM, `backend/`
- **Frontend:** Vue 3 + Vite + Pinia + Tailwind, bitta SPA, `front/`
  (xodim ilovasi `/`, admin panel `/bos`, faqat SUPERADMIN kiradi)
- **Umumiy kod:** `packages/shared` (rollar, ruxsatlar, validatsiya naqshlari)
- **Fayl saqlash:** MinIO (S3-mos), video HLS ga o'giriladi (ffmpeg, worker)

---

## Manbalar — qayerda nima yozilgan

| Fayl | Nima uchun |
|---|---|
| `docs/v3/09-master-checklist.md` | **Asosiy ish ro'yxati** — 91 band, 15 blok |
| `docs/v3/08-acceptance-tests.md` | AT-01…AT-30 qabul testlari (checklistda havola qilinadi) |
| `docs/v4/03-parity-matrix.md` | iSpring bilan 1×1 taqqoslash, 347 qator, har qatorda ball |
| `docs/v4/01-executive-summary.md` | Umumiy ball va qayta hisob tarixi |
| `docs/v4/05-gaps.md` | P0–P3 bo'yicha guruhlangan bo'shliqlar |
| `docs/v3/01-corrections.md` | v2 auditidagi 14 ta noto'g'ri xulosaning tuzatilishi |
| `HOLAT.md` | Loyihaning umumiy holati |
| `Readme.md` | Asl to'liq spetsifikatsiya |

**Muhim:** hujjatlar kod bilan tekshirilgan, lekin **eskirishi mumkin**.
Bandni boshlashdan oldin tegishli faylni kodda tasdiqla — `docs/v4` matritsasi
2026-09-08 da yozilgan.

---

## Hozirgi holat (2026-09-08 holatiga)

**BLOK 0 dan bajarilgan:** 0.1, 0.2, 0.3, 0.4, 0.5, 0.7
**BLOK 0 dan qolgan:** 0.6 (backup + tiklash sinovi), 0.8 (Sentry + socket.io
Redis adapter + o'lik kod), 0.9 (N+1 tuzatishlar), 0.10 (frontend poydevor
komponentlari)

Bugungi commitlar:

```
c45d65d  docs(parity): parity ballini qayta hisoblash
fe0e315  fix(video-upload): tus http:// URL bermasin (mixed content)
5ac71c9  feat(audit): audit jurnalini ko'rish (0.7)
dde64eb  docs(checklist): 0.1–0.5 belgilandi
9e7114a  fix(storage): presigned URL hosti domendan orqada qolmasin (0.5)
b6e0379  feat(dashboard): kompaniya dashboardiga kirish nazorati (0.3)
dfd80c6  feat(report): hisobot eksportida scope + audit (0.3, 0.4)
```

**0.3 da bir chetlanish bor:** hisobotlar haqiqatan scope'lanadi, dashboard esa
scope'lanmaydi — `analytics:view:all` bo'lmagan chaqiruvchiga **403** qaytaradi.
Bo'limga qisqartirilgan dashboard **2.5 (Manager dashboard)** da quriladi.

### iSpring parity — hozirgi raqam

| Metrika | Qiymat |
|---|:--:|
| Vaznsiz (337 capability) | **36,3** |
| Vaznlangan (yadro ×3, muhim ×2, tor ×1) | **37,3** |
| **Gap** | **≈64%** |

Bo'shliqning yarmi 7 ta domenda: sertifikat+KB (ball 2,6), bildirishnoma
(21,7), baholash (31,4), 360°/OJT (0), learning path (39,3), authoring (11,4),
onboarding (11,5).

**Diqqat:** BLOK 0 ning qolgan bandlari (0.6, 0.8, 0.9, 0.10) bu raqamni
deyarli qimirlatmaydi — ular infratuzilma qarzi, lekin baribir bajariladi.
Raqamni haqiqatan ko'taradigan birinchi ish — **BLOK 1 (yetkazish qatlami:
mail servis + queue)**, chunki bildirishnoma domenini ochadi va sertifikat,
deadline, compliance ham o'sha zanjirdan o'tadi.

---

## Bloklar tartibi

```
BLOK 0  Xavfsizlik + infratuzilma      (qolgan: 0.6, 0.8, 0.9, 0.10)
BLOK 1  Yetkazish qatlami (mail, queue, shablon, push)   ← eng ko'p eshik ochadi
BLOK 2  Shaxs, ierarxiya, scope (managerId, role.scope, bulk import)
BLOK 3  Tugatish qoidasi + sertifikat
BLOK 4  Baholash tizimi (Question bank, Quiz birlashtirish)
BLOK 5  Learning path + onboarding
BLOK 6  Live training, kalendar, topshiriq
BLOK 7  Qidiruv, KB, compliance, gamification
BLOK 8  Hisobot, analitika
BLOK 9  Kontent va authoring
BLOK 10 AI
BLOK 11 Korxona
BLOK 12 Mobil va accessibility
BLOK 13 Kengaytirilgan baholash
BLOK 14 Regressiya himoyasi (doimiy)
```

BLOK 1 va 2 parallel, BLOK 3 va 4 parallel qilinishi mumkin.

---

## Bitta band qachon "tugadi"

1. **Kod yozilgan** — mavjud naqshlarga mos (pastdagi "Uslub" ga qara)
2. **Haqiqatan tekshirilgan** — mock emas, ishlab turgan tizimda:
   - backend endpoint bo'lsa: lokal serverni ko'tarib HTTP orqali sina
     (ruxsatsiz 401, noto'g'ri rolda 403, noto'g'ri kirish ma'lumotida 400)
   - checklistda `Qabul: AT-xx` bo'lsa, `docs/v3/08-acceptance-tests.md`
     dagi o'sha testni bajar
   - test ma'lumotlarini **o'zingdan keyin tozala**
3. **Checklistda belgilangan** — `- [ ]` → `- [x]`, va ostiga bir-ikki qator
   izoh: nima qilindi, agar chetlanish bo'lsa — nimasi boshqacha
4. **Parity matritsasi yangilangan** — agar band `docs/v4/03-parity-matrix.md`
   dagi qatorga tegsa, `Status` va `Sc` ustunini o'zgartir
5. **Commit** — mustaqil, ma'noli commit (pastdagi qoidalar)
6. **Deploy** — foydalanuvchidan so'ragandan keyin (pastga qara)

---

## Deploy — aniq tartib

Server: `homeserver` ssh aliasi (Tailscale, `azamjonbro`). Cloudflare tunnel
orqali ikkita host:

- `qollanma.sds-max.uz` — API, socket, media (nginx → :4000, MinIO :9000)
- `spring.sds-max.uz` — SPA, nginx root `/var/www/spring/front`

Backend **pm2** ostida: `qollanma` va `qollanma-worker`. Yonida begona saytlar
bor (`dacha`, `hadiya`, `hadiya-api`, `harajat`, `hrbot`, `oil`,
`swiss-backend`) — **hech qachon `pm2 restart all` qilma.**

**Serverda `git pull` ishlamaydi** (repo yopiq, serverda GitHub kalitlari yo'q).
Commitlar checkout'ga push qilinadi:

```bash
cd "/Users/mac/Desktop/qo'llanma"
git push origin main
git push ssh://homeserver/~/qollanma main          # ishchi daraxtni yangilaydi
ssh homeserver 'cd ~/qollanma && npm run build --prefix front'
ssh homeserver 'pm2 reload qollanma'
ssh homeserver 'pm2 reload qollanma-worker'        # alohida! ikkitasini birga yozsang faqat birinchisi qayta yuklanadi
ssh homeserver 'pm2 list'                          # uptime ustuni bilan tasdiqla
```

**Oxirgi qadam foydalanuvchida** — `/var/www/spring/front` root egaligida,
passwordsiz sudo yo'q:

```bash
ssh -t homeserver 'sudo rsync -a --delete ~/qollanma/front/dist/ /var/www/spring/front/'
```

Chiqqanini **sahifani yangilab emas**, bundle nomini solishtirib tekshir:

```bash
ssh homeserver 'grep -o "assets/index-[A-Za-z0-9_-]*\.js" ~/qollanma/front/dist/index.html /var/www/spring/front/index.html'
```

Shartlar:
- server ishchi daraxti **toza** bo'lishi kerak, aks holda push rad etiladi
  (`ssh homeserver 'cd ~/qollanma && git status --short'`)
- serverdagi `backend/.env` **kuzatilmaydi** — domen yoki proksi o'zgarsa
  qo'lda tekshir
- prod'ga chiqarishdan oldin foydalanuvchidan so'ra

---

## Lokal muhit

```
MongoDB   localhost:27018   ishlaydi
Redis     localhost:6380    kerak bo'lsa: redis-server --daemonize yes --port 6380
MinIO     yo'q              docker ishlamayapti → S3 ga tegadigan oqimlar lokal sinalmaydi
Backend   npm --prefix backend run dev   (yoki: cd backend && node src/server.js)
Frontend  npm --prefix front run dev
Build     npm run build --prefix front
```

Lokal SUPERADMIN kirish ma'lumotlari `backend/.env` dagi `SUPERADMIN_JSHSHIR` /
`SUPERADMIN_PASSWORD` da. Login: `POST /api/v1/auth/login`, tanasi
`{"identifier":"<jshshir>","password":"..."}` (`username` emas, `identifier`).

Backend testlari **jonli** backendga qarshi ishlaydi (mock emas):
`npm --prefix backend test`. `/auth/login` da haqiqiy rate limit bor —
ketma-ket ko'p marta ishga tushirsang 429 chiqadi, bu xato emas.

MinIO'ga bog'liq narsani (video upload, material) lokal sinash uchun soxta
store bilan izolyatsiya qilib sinash mumkin — `@tus/server` dan `DataStore` ni
kengaytirib, haqiqiy HTTP javobini olish usuli ishlagan.

---

## Tuzoqlar — allaqachon boshimizga kelgan

1. **Cloudflare sxemani yashiradi.** nginx `X-Forwarded-Proto` ni `$scheme`
   dan oladi, tunnel esa nginx'ga `http` bilan kiradi → backend "http" deb
   o'ylaydi. So'rov sarlavhalaridan **absolyut public URL yasama** — brauzer
   chaqirgan manzilga nisbatan hal qil. Video upload shundan buzilgandi
   (`fe0e315`).
2. **Env qiymatlari domen bilan birga ko'chmaydi.** `S3_SIGNING_ENDPOINT`
   domen o'zgargach bir hafta eski hostda qolib, hamma yuklab olishni jimgina
   buzgan (`9e7114a`). Tekshiruv: `npm --prefix backend run check:signing`.
3. **`git add -A` foydalanuvchining tugallanmagan tahririni ham qamrab oladi.**
   Commitdan oldin `git status` ni o'qi, faqat o'zing tegingan fayllarni qo'sh.
4. **`pm2 reload a b`** faqat birinchisiga ta'sir qiladi — alohida yoz.
5. **Serverda begona saytlar bor** — nginx konfiglariga, boshqa pm2 jarayonlariga
   tegma. (Tarixda bir marta begona `ops-backend` to'xtatib qo'yilgan.)
6. **MongoDB umumiy** — boshqa saytlarning bazalari ham shu instansiyada;
   hech qachon `--drop` yoki butun instansiyaga tegadigan amal qilma.

---

## Uslub qoidalari

**Backend**
- Qatlamlar: `routes → controllers → services → repositories → models`.
  Route'da mantiq yo'q; controller `asyncHandler` bilan o'raladi va
  `sendSuccess` qaytaradi; biznes mantiq servisda; Mongo so'rovlari repositoryda.
- Har bir yangi route `authenticate` + `requirePermission(PERMISSIONS.X)` bilan
  yopiladi. Ruxsatlar `packages/shared/src/permissions.js` da.
- Query/body zod validatori orqali o'tadi (`validateQuery` / `validateBody`),
  validatorlar `backend/src/validators/` da.
- Nozik amallar (eksport, ko'rish, o'chirish, siyosat o'zgarishi)
  `auditLogRepository.record(...)` bilan yoziladi.
- Filtr va sahifalash bitta `buildFilter()` dan foydalanadi, shunda sahifa va
  umumiy son bir xil filtrdan chiqadi.
- Katta natijalar oqim (cursor) bilan yoziladi, xotiraga yig'ilmaydi.

**Frontend**
- Admin sahifalari `front/src/admin/views/`, route `front/src/router/index.js`
  (`meta.permission` bilan), nav `front/src/admin/layouts/nav.js`.
- UI komponentlari `front/src/components/ui/` (AppButton, AppSelect, Modal,
  Pagination, Skeleton, EmptyState, Badge, Icon…) — yangisini yozishdan oldin
  mavjudini qara.
- **Har bir matn uchta locale'da:** `front/src/i18n/locales/{uz,ru,en}.json`.
  Uchtasini ham yangilamasdan sahifa tugallanmagan hisoblanadi.
- Xatolar `apiErrorText(error, fallback)` orqali o'qiladigan gapga aylanadi.

**Izohlar**
Kod izohlari **nima** qilinayotganini emas, **nega** shunday qilinganini
tushuntiradi — qaysi muqobil rad etilgani, qaysi nosozlik oldi olinayotgani.
Ingliz tilida yoziladi (mavjud kod shunday). Ortiqcha izoh qo'shma.

**Commit**
- Bitta band = bitta commit. Sarlavha: `feat(scope): ...` / `fix(scope): ...`.
- Tanasida: muammo nima edi, nega shu yechim, qanday tekshirilgan.
- Oxiriga:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

---

## Muloqot

- Foydalanuvchi bilan **o'zbekcha** yoz.
- Prod'ga tegishdan oldin so'ra. Lokal ish uchun so'rash shart emas.
- Nimadir ishlamasa — chiqishini ko'rsatib ayt, "tuzatdim" deb yozib qo'yma.
- Hujjat da'vosini kodda tasdiqlamasdan takrorlama.

---

## Birinchi qadam

```
1. git log --oneline -8          — qayerda to'xtaganini ko'r
2. git status --short            — foydalanuvchining tugallanmagan ishi bormi
3. docs/v3/09-master-checklist.md — birinchi `- [ ]` bandni top
4. O'sha bandda nomlangan fayllarni o'qi, hujjat da'vosini kodda tasdiqla
5. Ishla
```

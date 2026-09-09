# Ish holati paneli

Repozitoriyning o'zidan o'qiydigan jonli panel: nima bajarilgan, nima
qolgan, hozir nima ustida ishlanyapti.

```bash
npm run status          # http://localhost:4777
npm run status:tests    # test natijalarini yangilaydi (~90 soniya)
```

## Nega lokal server, artifact emas

Javob ikkita joyda turadi: `docs/v3/09-master-checklist.md` va git tarixi.
Ikkalasi ham **shu mashinada**. Hostlangan sahifa ularni ko'ra olmaydi, va
raqamlarni qo'lda ko'chirib turadigan panel — birinchi commitdayoq
eskiradigan panel.

Shu sababdan panel hech qanday holatni o'zida saqlamaydi. U har safar
checklist faylini va `git`ni qayta o'qiydi, ya'ni **qaysi sessiya ishlayotgani
ahamiyatsiz** — boshqa oynadan qilingan commit ham darhol ko'rinadi.

## Yangilanish qanday keladi

Server-sent events orqali. Sahifa so'ramaydi — server o'zgarishni ko'rgach
o'zi yuboradi.

Kuzatiladigan narsalar ataylab tor:

- `docs/v3/09-master-checklist.md` — band bajarilganda o'zgaradi
- `.git/HEAD` va `.git/refs/heads` — commit qilinganda o'zgaradi

`.git` ni butunligicha kuzatish **teskari aloqa halqasi** edi: panel
`git status` chaqiradi → u `.git/index` ni yangilaydi → kuzatuvchi ishga
tushadi → panel yana `git status` chaqiradi. O'lchangan natija: hech narsa
o'zgarmagan holda 8 soniyada 18 ta qayta hisoblash. Ref'lar xavfsiz signal,
chunki bu server ularga hech qachon yozmaydi.

Orqada 15 soniyalik sekin poll turadi — `fs.watch` ko'rmaydigan holatlar
uchun (boshqa worktree, tarmoq diski, faylni almashtirib yozadigan
muharrir).

## Testlar raqami nega alohida buyruq

To'plam ~90 soniya va tirik MongoDB talab qiladi. Sahifani yangilash buni
ishga tushirmasligi kerak, shuning uchun `npm run status:tests` yozib
qo'yadi, panel esa o'qiydi.

`cancelled` alohida ko'rsatiladi. Node bekor qilingan testni **yiqilgan deb
sanamaydi**: run `fail 0` deyishi va shu bilan birga 21 ta test umuman
javob bermagan bo'lishi mumkin. Faqat `fail` ni o'qish panelga tugamagan
run uchun "hammasi o'tdi" deb yozardi.

⚠️ To'plamni panel ishlab turganda ishga tushirmang: ikkalasi bitta
MongoDB'ga tegadi va bu bekor qilingan testlarga olib keladi (o'lchandi).

/**
 * Seeds one complete, playable demo course: 5 modules, each with two videos
 * (a real quiz attached to every one) and a module-closing test.
 *
 * The videos are genuinely produced, not faked rows: slides are rendered,
 * ffmpeg turns them into an mp4, the file is uploaded to the originals
 * bucket, and the *same* processVideo() the worker runs transcodes it to
 * HLS. That means the result exercises the real playback path (signed
 * playback tokens, quality ladder, thumbnails) instead of leaving a video
 * stuck at PENDING that nobody can play.
 *
 * Idempotent: re-running replaces the course's content rather than adding a
 * second copy. `--cleanup` removes everything it created.
 *
 * Run with:
 *   npm --prefix backend run seed:demo-course
 *   npm --prefix backend run seed:demo-course -- --cleanup
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import mongoose from 'mongoose'
import { PERMISSIONS } from '@lms/shared'
import { connectDatabase } from '../config/db.js'
import { logger } from '../config/logger.js'
import { env } from '../config/env.js'
import { Course } from '../models/course.model.js'
import { Topic } from '../models/topic.model.js'
import { Video } from '../models/video.model.js'
import { Quiz } from '../models/quiz.model.js'
import { Assessment } from '../models/assessment.model.js'
import { User } from '../models/user.model.js'
import { Role } from '../models/role.model.js'
import { S3StorageProvider } from '../storage/S3StorageProvider.js'
import { processVideo } from '../video/processVideo.js'

const COURSE_SLUG = 'onlayn-savdo-asoslari'

const COURSE = {
  title: 'Onlayn savdo va mijozlar bilan ishlash',
  slug: COURSE_SLUG,
  description:
    'Marketpleys va onlayn do‘konda ishlaydigan xodimlar uchun asosiy kurs: mijoz bilan muloqot, mahsulot kartochkasi, buyurtmani qayta ishlash, qaytarish jarayoni va sotuv ko‘rsatkichlarini o‘qish. Har bir modul videolar, video testlari va modul yakuniy testidan iborat.',
}

// Content is written out in full rather than generated: a demo course whose
// questions are "Question 1 / Option A" teaches nobody anything and makes
// the screens impossible to judge.
const MODULES = [
  {
    title: '1-modul. Mijoz bilan birinchi muloqot',
    slug: 'mijoz-bilan-birinchi-muloqot',
    description:
      'Birinchi javob vaqti, salomlashish qoidalari va mijozning haqiqiy ehtiyojini aniqlash. Muloqotning eng ko‘p uchraydigan xatolari.',
    videos: [
      {
        title: 'Birinchi javob vaqti nega hal qiluvchi',
        description: 'Mijoz kutish vaqti va konversiya o‘rtasidagi bog‘liqlik.',
        slides: [
          { kicker: '1-modul · 1-dars', title: 'Birinchi javob vaqti nega hal qiluvchi' },
          {
            kicker: 'Asosiy raqamlar',
            title: 'Kutish uzaygan sari xarid ehtimoli tushadi',
            bullets: [
              '5 daqiqagacha javob — eng yuqori konversiya',
              '30 daqiqadan keyin mijoz raqobatchiga o‘tadi',
              'Javobsiz qolgan savol — yo‘qotilgan buyurtma',
            ],
          },
          {
            kicker: 'Amaliy qoida',
            title: 'Darhol javob bering, keyin aniqlashtiring',
            bullets: [
              'Avval qabul qilganingizni bildiring',
              'Aniq ma’lumot yo‘q bo‘lsa, muddat ayting',
              'Va’da qilingan vaqtda albatta qayting',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Mijozning birinchi savoliga javob berishning eng maqbul muddati qaysi?',
              options: [
                { text: '5 daqiqagacha', isCorrect: true },
                { text: '2–3 soat ichida' },
                { text: 'Ish kuni oxirigacha' },
                { text: 'Ertasi kuni ertalab' },
              ],
            },
            {
              text: 'Aniq javobni hozir aytolmasangiz, to‘g‘ri yo‘l qaysi?',
              options: [
                { text: 'Javob tayyor bo‘lguncha jim turish' },
                { text: 'Savolni qabul qilganingizni yozib, aniq muddat aytish', isCorrect: true },
                { text: 'Taxminiy javob berib qo‘ya qolish' },
                { text: 'Mijozni boshqa bo‘limga yo‘naltirib yuborish' },
              ],
            },
            {
              text: 'Quyidagilardan qaysi biri javob vaqtini uzaytiradigan eng keng tarqalgan sabab?',
              options: [
                { text: 'Kelgan xabarlar bir joyda yig‘ilmagani', isCorrect: true },
                { text: 'Mijozlar soni kamligi' },
                { text: 'Mahsulot narxi balandligi' },
                { text: 'Yetkazib berish xizmati' },
              ],
            },
          ],
        },
      },
      {
        title: 'Ehtiyojni aniqlaydigan savollar',
        description: 'Ochiq savollar orqali mijozga nima kerakligini tez tushunish.',
        slides: [
          { kicker: '1-modul · 2-dars', title: 'Ehtiyojni aniqlaydigan savollar' },
          {
            kicker: 'Ochiq vs yopiq',
            title: 'Ochiq savol ko‘proq ma’lumot beradi',
            bullets: [
              'Yopiq: «Bu model kerakmi?» → ha/yo‘q',
              'Ochiq: «Qaysi maqsadda ishlatasiz?» → kontekst',
              'Kontekst bo‘lsa — to‘g‘ri mahsulotni taklif qilasiz',
            ],
          },
          {
            kicker: 'Uchta savol',
            title: 'Har doim so‘raladigan minimal to‘plam',
            bullets: [
              'Kimga va qaysi maqsadda?',
              'Qachongacha kerak?',
              'Byudjet chegarasi bormi?',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Ochiq savolning asosiy afzalligi nimada?',
              options: [
                { text: 'Mijozdan kengroq kontekst olish imkonini beradi', isCorrect: true },
                { text: 'Suhbatni tezroq tugatadi' },
                { text: 'Mijozga javob berishni osonlashtiradi' },
                { text: 'Narx haqidagi savolni chetlab o‘tadi' },
              ],
            },
            {
              text: 'Qaysi savol ochiq savol hisoblanadi?',
              options: [
                { text: '«Buni qaysi maqsadda ishlatmoqchisiz?»', isCorrect: true },
                { text: '«Qizil rang kerakmi?»' },
                { text: '«Bugun buyurtma berasizmi?»' },
                { text: '«Yetkazib berish kerakmi?»' },
              ],
            },
            {
              text: 'Ehtiyojni aniqlashda birinchi navbatda nima so‘raladi?',
              options: [
                { text: 'Kimga va qaysi maqsadda kerakligi', isCorrect: true },
                { text: 'Mijozning telefon raqami' },
                { text: 'To‘lov usuli' },
                { text: 'Raqobatchi narxlari' },
              ],
            },
          ],
        },
      },
    ],
    assessment: {
      title: '1-modul yakuniy testi',
      description: 'Mijoz bilan birinchi muloqot bo‘yicha bilimlarni tekshirish.',
      questions: [
        {
          text: 'Birinchi javob vaqti qaysi ko‘rsatkichga eng kuchli ta’sir qiladi?',
          options: [
            { text: 'Konversiya', isCorrect: true },
            { text: 'Omborxona hajmi' },
            { text: 'Yetkazib berish narxi' },
            { text: 'Mahsulot og‘irligi' },
          ],
        },
        {
          text: 'Mijozga va’da qilingan muddatda javob bera olmasangiz, nima qilasiz?',
          options: [
            { text: 'Muddat o‘tishidan oldin xabar berib, yangi muddat aytasiz', isCorrect: true },
            { text: 'Javob tayyor bo‘lganda yozasiz' },
            { text: 'Mijoz o‘zi eslatishini kutasiz' },
            { text: 'Suhbatni yopasiz' },
          ],
        },
        {
          text: 'Ochiq savollar nima uchun kerak?',
          options: [
            { text: 'Mijozning haqiqiy ehtiyojini aniqlash uchun', isCorrect: true },
            { text: 'Suhbat vaqtini uzaytirish uchun' },
            { text: 'Chegirma so‘ralishining oldini olish uchun' },
            { text: 'Buyurtmani bekor qilish uchun' },
          ],
        },
        {
          text: 'Quyidagilardan qaysi biri muloqotdagi xato hisoblanadi?',
          options: [
            { text: 'Mijoz savoliga javob bermay, darhol mahsulot taklif qilish', isCorrect: true },
            { text: 'Ehtiyojni aniqlaydigan savol berish' },
            { text: 'Javob muddatini aytish' },
            { text: 'Xabarni qabul qilganini bildirish' },
          ],
        },
        {
          text: 'Kelgan savollar bir joyda yig‘ilmasa, qanday muammo yuzaga keladi?',
          options: [
            { text: 'Xabarlar e’tibordan chetda qolib, javob vaqti uzayadi', isCorrect: true },
            { text: 'Mahsulot narxi oshadi' },
            { text: 'Ombor to‘lib qoladi' },
            { text: 'Yetkazib berish tezlashadi' },
          ],
        },
      ],
    },
  },
  {
    title: '2-modul. Mahsulot kartochkasi va kontent',
    slug: 'mahsulot-kartochkasi-va-kontent',
    description:
      'Sotadigan kartochka qanday bo‘ladi: sarlavha, rasm, tavsif va xarakteristikalar. Qidiruvda topilish uchun nima qilish kerak.',
    videos: [
      {
        title: 'Sotadigan sarlavha va rasm',
        description: 'Kartochkaning birinchi ekranidagi ikkita hal qiluvchi element.',
        slides: [
          { kicker: '2-modul · 1-dars', title: 'Sotadigan sarlavha va rasm' },
          {
            kicker: 'Sarlavha',
            title: 'Mijoz qidiradigan so‘z bilan boshlanadi',
            bullets: [
              'Mahsulot turi + brend + asosiy xususiyat',
              'Ortiqcha belgi va katta harflarsiz',
              'Reklama shiori emas, aniq nom',
            ],
          },
          {
            kicker: 'Rasm',
            title: 'Birinchi rasm — oq fonda, to‘liq mahsulot',
            bullets: [
              'Kamida 5 ta rasm: umumiy, detal, o‘lcham, qadoq',
              'Yozuvlar rasmning 20% dan oshmasin',
              'Haqiqiy rangni ko‘rsating — qaytarish shundan kamayadi',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Sarlavha nima bilan boshlanishi kerak?',
              options: [
                { text: 'Mijoz qidiruvda yozadigan mahsulot nomi bilan', isCorrect: true },
                { text: 'Chegirma foizi bilan' },
                { text: 'Do‘kon nomi bilan' },
                { text: '«Yangi!» so‘zi bilan' },
              ],
            },
            {
              text: 'Birinchi rasmga qo‘yiladigan asosiy talab qaysi?',
              options: [
                { text: 'Oq fonda mahsulot to‘liq ko‘rinishi', isCorrect: true },
                { text: 'Katta chegirma yozuvi bo‘lishi' },
                { text: 'Modelning yuzi ko‘rinishi' },
                { text: 'Qora fon bo‘lishi' },
              ],
            },
            {
              text: 'Rasmda haqiqiy rangni ko‘rsatish nimaga olib keladi?',
              options: [
                { text: 'Qaytarishlar kamayadi', isCorrect: true },
                { text: 'Narx oshadi' },
                { text: 'Yetkazish tezlashadi' },
                { text: 'Reyting avtomatik ko‘tariladi' },
              ],
            },
          ],
        },
      },
      {
        title: 'Tavsif va xarakteristikalar',
        description: 'Qidiruvda topilish va savollarni kamaytirish uchun to‘g‘ri to‘ldirish.',
        slides: [
          { kicker: '2-modul · 2-dars', title: 'Tavsif va xarakteristikalar' },
          {
            kicker: 'Tavsif',
            title: 'Savollarga oldindan javob bering',
            bullets: [
              'Nima uchun kerak va kimga mos',
              'Nima komplektda keladi',
              'Nimalar komplektda yo‘q',
            ],
          },
          {
            kicker: 'Xarakteristikalar',
            title: 'To‘ldirilmagan maydon — topilmaydigan kartochka',
            bullets: [
              'Barcha filtr maydonlarini to‘ldiring',
              'O‘lcham va og‘irlikni aniq yozing',
              'Bo‘sh maydon qidiruvdan tushirib qoldiradi',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Xarakteristikalar maydonlari to‘ldirilmasa nima bo‘ladi?',
              options: [
                { text: 'Kartochka filtrlar orqali topilmay qoladi', isCorrect: true },
                { text: 'Kartochka o‘chib ketadi' },
                { text: 'Narx avtomatik tushadi' },
                { text: 'Reyting nolga tushadi' },
              ],
            },
            {
              text: 'Yaxshi tavsif nimani o‘z ichiga oladi?',
              options: [
                { text: 'Komplektda nima bor va nima yo‘qligini', isCorrect: true },
                { text: 'Faqat brend tarixini' },
                { text: 'Raqobatchilar ro‘yxatini' },
                { text: 'Xodimlar ismini' },
              ],
            },
            {
              text: 'Tavsifda savollarga oldindan javob berish nimani kamaytiradi?',
              options: [
                { text: 'Mijozlarning takroriy savollarini', isCorrect: true },
                { text: 'Mahsulot tannarxini' },
                { text: 'Yetkazib berish masofasini' },
                { text: 'Ombordagi qoldiqni' },
              ],
            },
          ],
        },
      },
    ],
    assessment: {
      title: '2-modul yakuniy testi',
      description: 'Mahsulot kartochkasi va kontent bo‘yicha bilimlarni tekshirish.',
      questions: [
        {
          text: 'Kartochka sarlavhasida nima bo‘lmasligi kerak?',
          options: [
            { text: 'Katta harflar bilan yozilgan reklama shiori', isCorrect: true },
            { text: 'Mahsulot turi' },
            { text: 'Brend nomi' },
            { text: 'Asosiy xususiyat' },
          ],
        },
        {
          text: 'Kamida nechta rasm tavsiya etiladi?',
          options: [
            { text: '5 ta', isCorrect: true },
            { text: '1 ta' },
            { text: '2 ta' },
            { text: '10 tadan kam bo‘lmagan' },
          ],
        },
        {
          text: 'Filtrlarda topilish nimaga bog‘liq?',
          options: [
            { text: 'Xarakteristikalarning to‘liq to‘ldirilganiga', isCorrect: true },
            { text: 'Rasm soniga' },
            { text: 'Do‘kon yoshiga' },
            { text: 'To‘lov usuliga' },
          ],
        },
        {
          text: 'Rasmdagi yozuvlar qancha joyni egallashi mumkin?',
          options: [
            { text: '20% dan oshmasligi kerak', isCorrect: true },
            { text: 'Yarmini' },
            { text: 'Cheklov yo‘q' },
            { text: 'Butun rasmni' },
          ],
        },
        {
          text: 'Tavsifda «komplektda nima yo‘q» deb yozish nima uchun kerak?',
          options: [
            { text: 'Noto‘g‘ri kutish va qaytarishning oldini oladi', isCorrect: true },
            { text: 'Sarlavhani uzaytiradi' },
            { text: 'Narxni oshiradi' },
            { text: 'Qidiruv reytingini pasaytiradi' },
          ],
        },
      ],
    },
  },
  {
    title: '3-modul. Buyurtmani qabul qilish va yetkazish',
    slug: 'buyurtmani-qabul-qilish-va-yetkazish',
    description:
      'Buyurtma tasdiqlashdan yetkazib berishgacha bo‘lgan zanjir, qadoqlash talablari va muddat buzilganda nima qilish kerakligi.',
    videos: [
      {
        title: 'Buyurtma zanjiri: tasdiqdan yig‘ishgacha',
        description: 'Har bir bosqichda kim nimaga javobgar.',
        slides: [
          { kicker: '3-modul · 1-dars', title: 'Buyurtma zanjiri: tasdiqdan yig‘ishgacha' },
          {
            kicker: 'Bosqichlar',
            title: 'To‘rt bosqich, har birida aniq javobgar',
            bullets: [
              'Tasdiqlash — qoldiq va narx tekshiriladi',
              'Yig‘ish — komplektlik tekshiriladi',
              'Qadoqlash — himoya va yorliq',
              'Topshirish — hujjat va vaqt',
            ],
          },
          {
            kicker: 'Eng ko‘p xato',
            title: 'Qoldiq tekshirilmasdan tasdiqlangan buyurtma',
            bullets: [
              'Mahsulot omborda yo‘q → bekor qilish',
              'Bekor qilish reytingni tushiradi',
              'Tasdiqdan oldin qoldiqni ko‘ring',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Buyurtmani tasdiqlashdan oldin nima tekshiriladi?',
              options: [
                { text: 'Ombordagi qoldiq va narx', isCorrect: true },
                { text: 'Mijozning yoshi' },
                { text: 'Ob-havo' },
                { text: 'Raqobatchi aksiyalari' },
              ],
            },
            {
              text: 'Buyurtmani bekor qilish nimaga ta’sir qiladi?',
              options: [
                { text: 'Do‘kon reytingini tushiradi', isCorrect: true },
                { text: 'Mahsulot og‘irligini oshiradi' },
                { text: 'Yetkazish narxini tushiradi' },
                { text: 'Hech nimaga' },
              ],
            },
            {
              text: 'Yig‘ish bosqichida nima tekshiriladi?',
              options: [
                { text: 'Komplektlik', isCorrect: true },
                { text: 'Mijozning manzili' },
                { text: 'To‘lov kartasi' },
                { text: 'Kartochka sarlavhasi' },
              ],
            },
          ],
        },
      },
      {
        title: 'Qadoqlash va muddat buzilganda',
        description: 'Shikastlanishning oldini olish va kechikishni to‘g‘ri boshqarish.',
        slides: [
          { kicker: '3-modul · 2-dars', title: 'Qadoqlash va muddat buzilganda' },
          {
            kicker: 'Qadoqlash',
            title: 'Qadoq mahsulotdan qimmatroq emas, lekin arzon ham emas',
            bullets: [
              'Mo‘rt mahsulotga qo‘shimcha himoya',
              'Yorliq tashqi tomonda va o‘qiladigan',
              'Ichida hujjat/qaytarish varaqasi',
            ],
          },
          {
            kicker: 'Kechikish',
            title: 'Mijoz so‘ramasdan oldin xabar bering',
            bullets: [
              'Kechikish aniqlangan zahoti xabar',
              'Yangi muddat va sabab',
              'Kompensatsiya variantini taklif qiling',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Yetkazish kechikayotgani ma’lum bo‘lsa, birinchi qadam nima?',
              options: [
                { text: 'Mijozga o‘zimiz xabar berish', isCorrect: true },
                { text: 'Mijoz so‘raguncha kutish' },
                { text: 'Buyurtmani bekor qilish' },
                { text: 'Hech narsa qilmaslik' },
              ],
            },
            {
              text: 'Yorliq qayerda bo‘lishi kerak?',
              options: [
                { text: 'Qadoqning tashqi tomonida, o‘qiladigan holatda', isCorrect: true },
                { text: 'Qadoq ichida' },
                { text: 'Mahsulotning o‘zida' },
                { text: 'Yorliq shart emas' },
              ],
            },
            {
              text: 'Mo‘rt mahsulot uchun nima talab qilinadi?',
              options: [
                { text: 'Qo‘shimcha himoya qatlami', isCorrect: true },
                { text: 'Kichikroq quti' },
                { text: 'Yorliqsiz qadoq' },
                { text: 'Tezroq yetkazish' },
              ],
            },
          ],
        },
      },
    ],
    assessment: {
      title: '3-modul yakuniy testi',
      description: 'Buyurtma va yetkazib berish jarayoni bo‘yicha bilimlarni tekshirish.',
      questions: [
        {
          text: 'Buyurtma zanjirining birinchi bosqichi qaysi?',
          options: [
            { text: 'Tasdiqlash', isCorrect: true },
            { text: 'Qadoqlash' },
            { text: 'Topshirish' },
            { text: 'Qaytarish' },
          ],
        },
        {
          text: 'Qoldiq tekshirilmay tasdiqlangan buyurtma nimaga olib keladi?',
          options: [
            { text: 'Bekor qilishga va reyting tushishiga', isCorrect: true },
            { text: 'Tezroq yetkazishga' },
            { text: 'Narx oshishiga' },
            { text: 'Hech nimaga' },
          ],
        },
        {
          text: 'Kechikish haqida mijozga qachon aytiladi?',
          options: [
            { text: 'Kechikish aniqlangan zahoti', isCorrect: true },
            { text: 'Mijoz shikoyat qilgandan keyin' },
            { text: 'Buyurtma yopilgandan keyin' },
            { text: 'Aytilmaydi' },
          ],
        },
        {
          text: 'Qadoq ichiga nima qo‘yiladi?',
          options: [
            { text: 'Hujjat va qaytarish varaqasi', isCorrect: true },
            { text: 'Faqat mahsulot' },
            { text: 'Reklama bannerlari' },
            { text: 'Xodim vizitkasi' },
          ],
        },
        {
          text: 'Kechikkanda mijozga nima taklif qilish tavsiya etiladi?',
          options: [
            { text: 'Yangi muddat va kompensatsiya varianti', isCorrect: true },
            { text: 'Buyurtmani bekor qilish' },
            { text: 'Boshqa do‘konga o‘tish' },
            { text: 'Hech narsa' },
          ],
        },
      ],
    },
  },
  {
    title: '4-modul. Qaytarish, shikoyat va nizolar',
    slug: 'qaytarish-shikoyat-va-nizolar',
    description:
      'Qaytarish sabablari bilan ishlash, salbiy sharhga javob yozish va nizoni kuchaytirmaslik.',
    videos: [
      {
        title: 'Qaytarish sabablarini o‘qish',
        description: 'Qaytarish — muammo emas, tuzatish uchun ma’lumot.',
        slides: [
          { kicker: '4-modul · 1-dars', title: 'Qaytarish sabablarini o‘qish' },
          {
            kicker: 'Uch guruh',
            title: 'Har bir sabab boshqa yechim talab qiladi',
            bullets: [
              'Kutilgani boshqa — kontent muammosi',
              'Nuqson — sifat/qadoq muammosi',
              'Kerak emas — sotuv muammosi emas',
            ],
          },
          {
            kicker: 'Nima qilinadi',
            title: 'Sabab takrorlansa, kartochkani tuzating',
            bullets: [
              'Bir xil sabab 3 martadan ko‘p → tekshiring',
              'Rasm yoki xarakteristikani yangilang',
              'Natijani keyingi oyda o‘lchang',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: '«Kutilganidan boshqa chiqdi» degan qaytarish sababi nimani ko‘rsatadi?',
              options: [
                { text: 'Kartochkadagi kontent noto‘g‘ri kutish yaratganini', isCorrect: true },
                { text: 'Yetkazib berish sekinligini' },
                { text: 'Narx balandligini' },
                { text: 'Ombor to‘lganini' },
              ],
            },
            {
              text: 'Bir xil qaytarish sababi ko‘p takrorlansa nima qilinadi?',
              options: [
                { text: 'Kartochka kontenti tekshirilib tuzatiladi', isCorrect: true },
                { text: 'Mahsulot sotuvdan olinadi' },
                { text: 'Narx oshiriladi' },
                { text: 'E’tiborsiz qoldiriladi' },
              ],
            },
            {
              text: 'Nuqsonli mahsulot qaytarilishi qaysi muammoga ishora qiladi?',
              options: [
                { text: 'Sifat yoki qadoqlash', isCorrect: true },
                { text: 'Sarlavha' },
                { text: 'To‘lov usuli' },
                { text: 'Reklama byudjeti' },
              ],
            },
          ],
        },
      },
      {
        title: 'Salbiy sharhga javob yozish',
        description: 'Ochiq javob boshqa xaridorlar uchun ham yoziladi.',
        slides: [
          { kicker: '4-modul · 2-dars', title: 'Salbiy sharhga javob yozish' },
          {
            kicker: 'Tuzilma',
            title: 'Uch qismli javob',
            bullets: [
              'Muammoni tan olish va uzr',
              'Aniq nima qilinganini aytish',
              'Keyingi qadamni taklif qilish',
            ],
          },
          {
            kicker: 'Qilmang',
            title: 'Bahslashish javobni o‘qigan hammani yo‘qotadi',
            bullets: [
              'Mijozni ayblamang',
              'Shablon javob yozmang',
              'Shaxsiy ma’lumotni ochiq yozmang',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Salbiy sharhga javob aslida kimga yoziladi?',
              options: [
                { text: 'Javobni o‘qiydigan boshqa xaridorlarga ham', isCorrect: true },
                { text: 'Faqat sharh qoldirgan mijozga' },
                { text: 'Marketpleys moderatoriga' },
                { text: 'Raqobatchilarga' },
              ],
            },
            {
              text: 'Javobda nimani yozish mumkin emas?',
              options: [
                { text: 'Mijozning shaxsiy ma’lumotlarini', isCorrect: true },
                { text: 'Uzr so‘zlarini' },
                { text: 'Muammo yechimini' },
                { text: 'Keyingi qadamni' },
              ],
            },
            {
              text: 'Javobning to‘g‘ri tuzilmasi qaysi?',
              options: [
                { text: 'Tan olish → qilingan ish → keyingi qadam', isCorrect: true },
                { text: 'Ayblash → tushuntirish → yopish' },
                { text: 'Shablon → havola → yopish' },
                { text: 'Faqat uzr' },
              ],
            },
          ],
        },
      },
    ],
    assessment: {
      title: '4-modul yakuniy testi',
      description: 'Qaytarish va shikoyatlar bilan ishlash bo‘yicha bilimlarni tekshirish.',
      questions: [
        {
          text: 'Qaytarish sabablari nechta asosiy guruhga bo‘lindi?',
          options: [
            { text: '3 ta', isCorrect: true },
            { text: '2 ta' },
            { text: '5 ta' },
            { text: '7 ta' },
          ],
        },
        {
          text: 'Qaytarishlar aslida nima beradi?',
          options: [
            { text: 'Nimani tuzatish kerakligi haqida ma’lumot', isCorrect: true },
            { text: 'Qo‘shimcha foyda' },
            { text: 'Yuqori reyting' },
            { text: 'Reklama byudjeti' },
          ],
        },
        {
          text: 'Salbiy sharhga bahslashib javob yozish nimaga olib keladi?',
          options: [
            { text: 'Javobni o‘qigan boshqa xaridorlar ham yo‘qoladi', isCorrect: true },
            { text: 'Sharh o‘chiriladi' },
            { text: 'Reyting ko‘tariladi' },
            { text: 'Hech nimaga' },
          ],
        },
        {
          text: 'Kontent muammosini qaysi qaytarish sababi ko‘rsatadi?',
          options: [
            { text: '«Kutilganidan boshqa chiqdi»', isCorrect: true },
            { text: '«Nuqsonli keldi»' },
            { text: '«Kerak emas ekan»' },
            { text: '«Kech yetkazildi»' },
          ],
        },
        {
          text: 'Shablon javoblardan voz kechish nima uchun kerak?',
          options: [
            { text: 'Ular muammoni hal qilmaydi va ishonchni tushiradi', isCorrect: true },
            { text: 'Ular uzun bo‘ladi' },
            { text: 'Ular qimmat' },
            { text: 'Ular taqiqlangan' },
          ],
        },
      ],
    },
  },
  {
    title: '5-modul. Sotuv tahlili va KPI',
    slug: 'sotuv-tahlili-va-kpi',
    description:
      'Qaysi raqamlarga qarash kerak, konversiya va o‘rtacha chek nimani anglatadi, hisobotni qanday o‘qish kerak.',
    videos: [
      {
        title: 'Asosiy ko‘rsatkichlar: konversiya va o‘rtacha chek',
        description: 'Ikkita raqam orqali do‘kon holatini tushunish.',
        slides: [
          { kicker: '5-modul · 1-dars', title: 'Asosiy ko‘rsatkichlar: konversiya va o‘rtacha chek' },
          {
            kicker: 'Konversiya',
            title: 'Ko‘rganlarning qanchasi sotib oldi',
            bullets: [
              'Past konversiya → kartochka yoki narx',
              'Ko‘rish ko‘p, sotuv yo‘q → kontent muammosi',
              'Ko‘rish kam → qidiruvda topilmayapti',
            ],
          },
          {
            kicker: 'O‘rtacha chek',
            title: 'Bitta buyurtmadagi o‘rtacha summa',
            bullets: [
              'Komplekt taklifi chekni oshiradi',
              'Chegirma chekni tushiradi',
              'Ikkalasini birga o‘lchang',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Ko‘rishlar ko‘p, sotuv esa kam bo‘lsa, muammo qayerda?',
              options: [
                { text: 'Kartochka kontenti yoki narxda', isCorrect: true },
                { text: 'Ombor hajmida' },
                { text: 'Yetkazish xizmatida' },
                { text: 'Xodimlar sonida' },
              ],
            },
            {
              text: 'O‘rtacha chek nimani ko‘rsatadi?',
              options: [
                { text: 'Bitta buyurtmadagi o‘rtacha summani', isCorrect: true },
                { text: 'Kunlik ko‘rishlar sonini' },
                { text: 'Qaytarishlar foizini' },
                { text: 'Yetkazish muddatini' },
              ],
            },
            {
              text: 'Ko‘rishlar juda kam bo‘lsa, birinchi navbatda nima tekshiriladi?',
              options: [
                { text: 'Kartochka qidiruvda topiladimi', isCorrect: true },
                { text: 'Qadoqlash sifati' },
                { text: 'To‘lov usullari' },
                { text: 'Xodimlar jadvali' },
              ],
            },
          ],
        },
      },
      {
        title: 'Hisobotni o‘qish va qaror qabul qilish',
        description: 'Raqamdan harakatga o‘tish: nimani o‘zgartirish va qachon o‘lchash.',
        slides: [
          { kicker: '5-modul · 2-dars', title: 'Hisobotni o‘qish va qaror qabul qilish' },
          {
            kicker: 'Tartib',
            title: 'Bir vaqtda bitta o‘zgarish',
            bullets: [
              'Ikkita narsani birga o‘zgartirmang',
              'Kamida 7–14 kun kuting',
              'Keyin natijani solishtiring',
            ],
          },
          {
            kicker: 'Xulosa',
            title: 'Raqam o‘zi qaror qilmaydi',
            bullets: [
              'Raqam — savol, javob emas',
              'Sababni kartochkada qidiring',
              'O‘zgarishni yozib boring',
            ],
          },
        ],
        quiz: {
          passScorePercent: 70,
          questions: [
            {
              text: 'Natijani to‘g‘ri o‘lchash uchun nima qilish kerak?',
              options: [
                { text: 'Bir vaqtda faqat bitta narsani o‘zgartirish', isCorrect: true },
                { text: 'Hamma narsani birdan o‘zgartirish' },
                { text: 'Hech narsani o‘zgartirmaslik' },
                { text: 'Har kuni o‘zgartirish' },
              ],
            },
            {
              text: 'O‘zgarishdan keyin kamida qancha kutish tavsiya etiladi?',
              options: [
                { text: '7–14 kun', isCorrect: true },
                { text: '1 soat' },
                { text: '1 kun' },
                { text: '6 oy' },
              ],
            },
            {
              text: 'Hisobotdagi raqamni qanday tushunish kerak?',
              options: [
                { text: 'Sabab qidirishga undaydigan savol sifatida', isCorrect: true },
                { text: 'Tayyor qaror sifatida' },
                { text: 'Xodim bahosi sifatida' },
                { text: 'Reklama byudjeti sifatida' },
              ],
            },
          ],
        },
      },
    ],
    assessment: {
      title: '5-modul yakuniy testi',
      description: 'Sotuv tahlili va KPI bo‘yicha bilimlarni tekshirish.',
      questions: [
        {
          text: 'Konversiya nimani o‘lchaydi?',
          options: [
            { text: 'Kartochkani ko‘rganlarning qanchasi sotib olganini', isCorrect: true },
            { text: 'Kunlik daromadni' },
            { text: 'Qaytarishlar sonini' },
            { text: 'Ombor qoldig‘ini' },
          ],
        },
        {
          text: 'Komplekt taklifi qaysi ko‘rsatkichni oshiradi?',
          options: [
            { text: 'O‘rtacha chekni', isCorrect: true },
            { text: 'Qaytarishlarni' },
            { text: 'Yetkazish muddatini' },
            { text: 'Ko‘rishlar sonini' },
          ],
        },
        {
          text: 'Bir vaqtda ikkita o‘zgarish kiritilsa nima bo‘ladi?',
          options: [
            { text: 'Qaysi biri natija berganini bilib bo‘lmaydi', isCorrect: true },
            { text: 'Natija ikki barobar bo‘ladi' },
            { text: 'Hisobot ishlamaydi' },
            { text: 'Konversiya avtomatik oshadi' },
          ],
        },
        {
          text: 'Ko‘rishlar kam bo‘lsa, muammo ko‘pincha qayerda?',
          options: [
            { text: 'Kartochka qidiruvda topilmayapti', isCorrect: true },
            { text: 'Qadoqlashda' },
            { text: 'To‘lovda' },
            { text: 'Yetkazishda' },
          ],
        },
        {
          text: 'Kiritilgan o‘zgarishlarni yozib borish nima uchun kerak?',
          options: [
            { text: 'Keyin natijani sabab bilan bog‘lash uchun', isCorrect: true },
            { text: 'Hisobot uchun majburiy' },
            { text: 'Reyting uchun' },
            { text: 'Kerak emas' },
          ],
        },
      ],
    },
  },
]

// ---------------------------------------------------------------------------
// Video production
// ---------------------------------------------------------------------------

const SLIDE_SECONDS = 6
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-600)}`))
    })
  })
}

function slideHtml(slide, courseTitle) {
  const bullets = (slide.bullets ?? [])
    .map((b) => `<li>${b}</li>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;background:#0b1020;color:#f8fafc;
      font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;
      display:flex;flex-direction:column;justify-content:center;padding:88px 96px;position:relative;overflow:hidden}
    body::before{content:'';position:absolute;inset:auto -180px -240px auto;width:620px;height:620px;border-radius:50%;
      background:radial-gradient(circle,rgba(59,130,246,.38),transparent 68%)}
    body::after{content:'';position:absolute;inset:-200px auto auto -160px;width:520px;height:520px;border-radius:50%;
      background:radial-gradient(circle,rgba(139,92,246,.26),transparent 70%)}
    .wrap{position:relative;z-index:1}
    .kicker{font-size:22px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc;margin-bottom:26px}
    h1{font-size:${bullets ? '52px' : '62px'};line-height:1.16;font-weight:700;letter-spacing:-.02em;max-width:15ch}
    ul{margin-top:40px;list-style:none;display:flex;flex-direction:column;gap:20px}
    li{font-size:30px;line-height:1.35;color:#cbd5e1;padding-left:36px;position:relative}
    li::before{content:'';position:absolute;left:0;top:14px;width:14px;height:14px;border-radius:4px;background:#3b82f6}
    .brand{position:absolute;left:96px;bottom:64px;font-size:20px;color:#64748b;z-index:1}
  </style></head><body><div class="wrap">
    <div class="kicker">${slide.kicker}</div>
    <h1>${slide.title}</h1>
    ${bullets ? `<ul>${bullets}</ul>` : ''}
  </div><div class="brand">${courseTitle}</div></body></html>`
}

// Slides are rendered in a headless browser because this ffmpeg build has no
// drawtext filter (no libfreetype), so text cannot be burned in directly.
// Playwright is already a dev dependency of this repo; when it is missing the
// caller falls back to plain colour cards rather than failing the seed.
async function renderSlides(slides, courseTitle, outDir) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT } })
    const files = []
    for (const [index, slide] of slides.entries()) {
      await page.setContent(slideHtml(slide, courseTitle), { waitUntil: 'load' })
      const file = path.join(outDir, `slide-${String(index).padStart(2, '0')}.png`)
      await page.screenshot({ path: file })
      files.push(file)
    }
    return files
  } finally {
    await browser.close()
  }
}

async function renderColourCards(slides, outDir) {
  const files = []
  for (const [index] of slides.entries()) {
    const file = path.join(outDir, `slide-${String(index).padStart(2, '0')}.png`)
    const hue = (index * 47) % 360
    await run('ffmpeg', [
      '-y', '-f', 'lavfi',
      '-i', `color=c=0x0b1020:s=${SLIDE_WIDTH}x${SLIDE_HEIGHT}`,
      '-vf', `drawbox=x=96:y=${300 + index * 20}:w=900:h=8:color=0x3b82f6@1:t=fill,hue=h=${hue}`,
      '-frames:v', '1', file,
    ])
    files.push(file)
  }
  return files
}

// Each slide becomes SLIDE_SECONDS of video; a silent stereo track is added
// so the produced file has the same shape as a real upload (the HLS
// transcode maps -c:a aac either way).
async function buildVideoFile(slideFiles, outPath) {
  const listPath = path.join(path.dirname(outPath), 'slides.txt')
  const lines = []
  for (const file of slideFiles) {
    lines.push(`file '${file}'`, `duration ${SLIDE_SECONDS}`)
  }
  lines.push(`file '${slideFiles[slideFiles.length - 1]}'`)
  await fs.writeFile(listPath, `${lines.join('\n')}\n`)

  await run('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-r', '25',
    '-c:a', 'aac', '-b:a', '96k',
    outPath,
  ])
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function resolveAuthor() {
  const roles = await Role.find({ permissions: PERMISSIONS.COURSE_CREATE }, { _id: 1 })
  const author = await User.findOne({ roleId: { $in: roles.map((r) => r._id) }, isActive: true }).sort({ createdAt: 1 })
  if (!author) throw new Error('No active user with course:create found — seed roles and a superadmin first')
  return author
}

async function cleanup() {
  const course = await Course.findOne({ slug: COURSE_SLUG })
  if (!course) {
    logger.info('Demo course not found — nothing to clean up')
    return
  }
  const videos = await Video.find({ courseId: course._id }, { _id: 1, originalKey: 1 })
  const originals = new S3StorageProvider(env.S3_BUCKET_ORIGINALS)
  const processed = new S3StorageProvider(env.S3_BUCKET_PROCESSED)

  for (const video of videos) {
    if (video.originalKey) await originals.deleteObject(video.originalKey).catch(() => {})
    // Processed renditions are many small objects under one prefix; a failed
    // delete here is not worth aborting the cleanup for.
    for (const suffix of ['master.m3u8', 'thumbnail.jpg']) {
      await processed.deleteObject(`processed/${video._id}/${suffix}`).catch(() => {})
    }
  }

  await Quiz.deleteMany({ courseId: course._id })
  await Assessment.deleteMany({ courseId: course._id })
  await Video.deleteMany({ courseId: course._id })
  await Topic.deleteMany({ courseId: course._id })
  await Course.deleteOne({ _id: course._id })
  logger.info(`Removed demo course and ${videos.length} video(s)`)
}

async function seed() {
  const author = await resolveAuthor()
  logger.info(`Seeding demo course as ${author.username}`)

  const course = await Course.findOneAndUpdate(
    { slug: COURSE_SLUG },
    {
      $set: {
        title: COURSE.title,
        description: COURSE.description,
        status: 'PUBLISHED',
        // No role/department targeting: the demo should be visible to
        // everyone rather than silently hidden from most of the company.
        targetRoles: [],
        department: '',
        updatedBy: author._id,
      },
      $setOnInsert: { slug: COURSE_SLUG, createdBy: author._id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  // Re-running replaces content instead of stacking a second copy of it.
  await Quiz.deleteMany({ courseId: course._id })
  await Assessment.deleteMany({ courseId: course._id })
  await Video.deleteMany({ courseId: course._id })
  await Topic.deleteMany({ courseId: course._id })

  const originals = new S3StorageProvider(env.S3_BUCKET_ORIGINALS)
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lms-demo-course-'))

  let useBrowserSlides = true
  try {
    await import('playwright')
  } catch {
    useBrowserSlides = false
    logger.warn('playwright not available — falling back to plain colour cards for slides')
  }

  let videoCount = 0

  for (const [moduleIndex, moduleSpec] of MODULES.entries()) {
    const topic = await Topic.create({
      courseId: course._id,
      title: moduleSpec.title,
      slug: moduleSpec.slug,
      description: moduleSpec.description,
      order: moduleIndex + 1,
      status: 'PUBLISHED',
      createdBy: author._id,
    })

    for (const [videoIndex, videoSpec] of moduleSpec.videos.entries()) {
      const videoDir = path.join(workRoot, `${moduleSpec.slug}-${videoIndex}`)
      await fs.mkdir(videoDir, { recursive: true })

      const slideFiles = useBrowserSlides
        ? await renderSlides(videoSpec.slides, COURSE.title, videoDir)
        : await renderColourCards(videoSpec.slides, videoDir)

      const mp4Path = path.join(videoDir, 'source.mp4')
      await buildVideoFile(slideFiles, mp4Path)

      const video = await Video.create({
        topicId: topic._id,
        courseId: course._id,
        title: videoSpec.title,
        description: videoSpec.description,
        order: videoIndex + 1,
        status: 'PUBLISHED',
        required: true,
        pointsEnabled: true,
        points: 10,
        processingStatus: 'PENDING',
        createdBy: author._id,
      })

      const key = `demo/${course._id}/${video._id}.mp4`
      const buffer = await fs.readFile(mp4Path)
      await originals.putObject(key, buffer, 'video/mp4')
      await Video.updateOne({ _id: video._id }, { $set: { originalKey: key, fileSize: buffer.length } })

      // The same function the BullMQ worker calls — running it inline keeps
      // the seed self-contained instead of depending on a worker process.
      await processVideo(video._id.toString())

      const processed = await Video.findById(video._id, { processingStatus: 1, duration: 1, qualities: 1 })
      if (processed.processingStatus !== 'READY') {
        throw new Error(`Video "${videoSpec.title}" ended at ${processed.processingStatus}`)
      }

      await Quiz.create({
        videoId: video._id,
        courseId: course._id,
        passScorePercent: videoSpec.quiz.passScorePercent,
        questions: videoSpec.quiz.questions.map((q, i) => ({ ...q, order: i + 1 })),
        createdBy: author._id,
      })
      await Video.updateOne({ _id: video._id }, { $set: { hasQuiz: true } })

      videoCount += 1
      logger.info(
        `  ${moduleSpec.title} → "${videoSpec.title}" ready (${processed.duration}s, ${processed.qualities.join(', ')})`
      )
    }

    await Assessment.create({
      topicId: topic._id,
      courseId: course._id,
      title: moduleSpec.assessment.title,
      description: moduleSpec.assessment.description,
      passScorePercent: 70,
      pointsEnabled: true,
      points: 25,
      status: 'PUBLISHED',
      order: 1,
      questions: moduleSpec.assessment.questions.map((q, i) => ({ ...q, order: i + 1 })),
      createdBy: author._id,
    })
  }

  await fs.rm(workRoot, { recursive: true, force: true })

  logger.info(
    `Demo course ready: ${MODULES.length} modules, ${videoCount} videos with quizzes, ${MODULES.length} module tests`
  )
}

async function main() {
  await connectDatabase()
  if (process.argv.includes('--cleanup')) await cleanup()
  else await seed()
}

main()
  .catch((error) => {
    logger.error('Demo course seed failed', { error: error instanceof Error ? error.message : error })
    process.exitCode = 1
  })
  .finally(() => mongoose.connection.close())

/**
 * The wording every notification starts from — 25 types × 3 languages,
 * expanded to 3 channels by the M9 migration.
 *
 * This file is the *seed*, not the source of truth: once M9 has run, the
 * database rows are, and an edit made in the admin UI wins. It exists so a
 * fresh install has sensible text on day one and so a newly added type has
 * somewhere to come from.
 *
 * Per language each type gives three lengths, because the channels are not
 * interchangeable:
 *   subject — the title in the bell, the Subject: line in mail
 *   body    — the sentence under it; mail also gets the closing line
 *   push    — what fits on a lock screen, roughly 60 characters
 *
 * `placeholders` is an allowlist. A placeholder used in the text but missing
 * from it is a seed bug and the migration refuses to write the row.
 */

export const TEMPLATE_TYPES = [
  'ACCOUNT_CREATED',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'LOGIN_FROM_NEW_DEVICE',
  'COURSE_ASSIGNED',
  'COURSE_DEADLINE_APPROACHING',
  'COURSE_EXPIRED',
  'COURSE_COMPLETED',
  'COURSE_REOPENED',
  'TASK_ASSIGNED',
  'TASK_DEADLINE_APPROACHING',
  'TASK_OVERDUE',
  'TASK_STATUS_CHANGED',
  'QUIZ_ASSIGNED',
  'QUIZ_PASSED',
  'QUIZ_FAILED',
  'NEWS_PUBLISHED',
  'CERTIFICATE_ISSUED',
  'CERTIFICATE_EXPIRING',
  'CERTIFICATE_EXPIRED',
  'EVENT_INVITATION',
  'EVENT_REMINDER',
  'EVENT_CANCELLED',
  'EVENT_RESCHEDULED',
  'PATH_ASSIGNED',
  'COMPLIANCE_RETRAINING_DUE',
  'ATTENTION_ALERT',
  'PROCTORING_FOREIGN_FACE',
]

// Appended to the EMAIL body only. In-app and push already sit inside the
// app, where "open the app" is not useful advice.
export const EMAIL_FOOTER = {
  uz: 'Qo\'llanma platformasiga kirish uchun: {{appUrl}}',
  ru: 'Войти в платформу Qo\'llanma: {{appUrl}}',
  en: 'Open the Qo\'llanma platform: {{appUrl}}',
}

export const TEMPLATE_SEED = {
  ACCOUNT_CREATED: {
    placeholders: ['userName', 'jshshir', 'appUrl'],
    uz: {
      subject: 'Qo\'llanma platformasiga xush kelibsiz',
      body: '{{userName}}, sizga hisob ochildi. Kirish uchun JSHSHIR ({{jshshir}}) va sizga berilgan parolni ishlating. Birinchi kirishdan keyin parolni almashtiring.',
      push: 'Hisobingiz tayyor — kirishingiz mumkin',
    },
    ru: {
      subject: 'Добро пожаловать в Qo\'llanma',
      body: '{{userName}}, для вас создана учётная запись. Входите по ЖШШИР ({{jshshir}}) и выданному паролю. После первого входа смените пароль.',
      push: 'Учётная запись готова — можно входить',
    },
    en: {
      subject: 'Welcome to Qo\'llanma',
      body: '{{userName}}, an account has been created for you. Sign in with your JSHSHIR ({{jshshir}}) and the password you were given, then change it.',
      push: 'Your account is ready — you can sign in',
    },
  },

  PASSWORD_RESET: {
    placeholders: ['userName', 'resetUrl', 'expiryMinutes'],
    uz: {
      subject: 'Parolni tiklash',
      body: '{{userName}}, parolni tiklash so\'rovi qabul qilindi. Havola {{expiryMinutes}} daqiqa amal qiladi: {{resetUrl}}. Agar bu siz bo\'lmasangiz, bu xatni e\'tiborsiz qoldiring.',
      push: 'Parolni tiklash havolasi yuborildi',
    },
    ru: {
      subject: 'Восстановление пароля',
      body: '{{userName}}, получен запрос на смену пароля. Ссылка действует {{expiryMinutes}} минут: {{resetUrl}}. Если это были не вы — просто игнорируйте письмо.',
      push: 'Отправлена ссылка для смены пароля',
    },
    en: {
      subject: 'Reset your password',
      body: '{{userName}}, a password reset was requested. The link is valid for {{expiryMinutes}} minutes: {{resetUrl}}. If this was not you, ignore this message.',
      push: 'Password reset link sent',
    },
  },

  PASSWORD_CHANGED: {
    placeholders: ['userName', 'changedAt'],
    uz: {
      subject: 'Parol o\'zgartirildi',
      body: '{{userName}}, hisobingiz paroli {{changedAt}} da o\'zgartirildi. Bu siz bo\'lmasangiz, darhol rahbaringizga yoki tizim administratoriga murojaat qiling.',
      push: 'Parolingiz o\'zgartirildi',
    },
    ru: {
      subject: 'Пароль изменён',
      body: '{{userName}}, пароль вашей учётной записи изменён {{changedAt}}. Если это были не вы — немедленно сообщите руководителю или администратору.',
      push: 'Ваш пароль изменён',
    },
    en: {
      subject: 'Your password was changed',
      body: '{{userName}}, your account password was changed on {{changedAt}}. If this was not you, tell your manager or an administrator immediately.',
      push: 'Your password was changed',
    },
  },

  LOGIN_FROM_NEW_DEVICE: {
    placeholders: ['userName', 'device', 'ipAddress', 'loginAt'],
    uz: {
      subject: 'Yangi qurilmadan kirish',
      body: '{{userName}}, hisobingizga {{loginAt}} da yangi qurilmadan kirildi: {{device}} ({{ipAddress}}). Bu siz bo\'lsangiz, hech narsa qilish shart emas.',
      push: 'Yangi qurilmadan kirish: {{device}}',
    },
    ru: {
      subject: 'Вход с нового устройства',
      body: '{{userName}}, {{loginAt}} выполнен вход с нового устройства: {{device}} ({{ipAddress}}). Если это были вы — ничего делать не нужно.',
      push: 'Вход с нового устройства: {{device}}',
    },
    en: {
      subject: 'Sign-in from a new device',
      body: '{{userName}}, your account was signed in on {{loginAt}} from a new device: {{device}} ({{ipAddress}}). If this was you, nothing to do.',
      push: 'New device sign-in: {{device}}',
    },
  },

  COURSE_ASSIGNED: {
    placeholders: ['userName', 'courseTitle', 'deadline', 'appUrl'],
    uz: {
      subject: 'Yangi kurs: {{courseTitle}}',
      body: '{{userName}}, sizga "{{courseTitle}}" kursi biriktirildi. Tugatish muddati: {{deadline}}.',
      push: 'Yangi kurs: {{courseTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Новый курс: {{courseTitle}}',
      body: '{{userName}}, вам назначен курс «{{courseTitle}}». Срок завершения: {{deadline}}.',
      push: 'Новый курс: {{courseTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'New course: {{courseTitle}}',
      body: '{{userName}}, the course "{{courseTitle}}" has been assigned to you. Due {{deadline}}.',
      push: 'New course: {{courseTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  COURSE_DEADLINE_APPROACHING: {
    placeholders: ['userName', 'courseTitle', 'deadline', 'daysLeft', 'appUrl'],
    uz: {
      subject: 'Muddat yaqinlashmoqda: {{courseTitle}}',
      body: '"{{courseTitle}}" kursini tugatishga {{daysLeft}} kun qoldi — muddat {{deadline}}.',
      push: '{{daysLeft}} kun qoldi: {{courseTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Приближается срок: {{courseTitle}}',
      body: 'До завершения курса «{{courseTitle}}» осталось {{daysLeft}} дн. — срок {{deadline}}.',
      push: 'Осталось {{daysLeft}} дн.: {{courseTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Deadline approaching: {{courseTitle}}',
      body: '{{daysLeft}} day(s) left to finish "{{courseTitle}}" — due {{deadline}}.',
      push: '{{daysLeft}} day(s) left: {{courseTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  COURSE_EXPIRED: {
    placeholders: ['userName', 'courseTitle', 'deadline', 'appUrl'],
    uz: {
      subject: 'Kurs muddati tugadi: {{courseTitle}}',
      body: '"{{courseTitle}}" kursining muddati {{deadline}} da tugadi. Muddatni uzaytirish uchun rahbaringizga murojaat qiling.',
      push: 'Muddat tugadi: {{courseTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Срок курса истёк: {{courseTitle}}',
      body: 'Срок курса «{{courseTitle}}» истёк {{deadline}}. Чтобы продлить, обратитесь к руководителю.',
      push: 'Срок истёк: {{courseTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Course expired: {{courseTitle}}',
      body: 'Access to "{{courseTitle}}" expired on {{deadline}}. Ask your manager to extend it.',
      push: 'Expired: {{courseTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  COURSE_COMPLETED: {
    placeholders: ['userName', 'courseTitle', 'score', 'appUrl'],
    uz: {
      subject: 'Kurs tugallandi: {{courseTitle}}',
      body: 'Tabriklaymiz, {{userName}} — "{{courseTitle}}" kursini tugatdingiz. Natija: {{score}}.',
      push: 'Tugallandi: {{courseTitle}}',
      defaults: { score: 'hisoblanmadi' },
    },
    ru: {
      subject: 'Курс завершён: {{courseTitle}}',
      body: 'Поздравляем, {{userName}} — курс «{{courseTitle}}» завершён. Результат: {{score}}.',
      push: 'Завершён: {{courseTitle}}',
      defaults: { score: 'не подсчитан' },
    },
    en: {
      subject: 'Course completed: {{courseTitle}}',
      body: 'Well done, {{userName}} — you finished "{{courseTitle}}". Score: {{score}}.',
      push: 'Completed: {{courseTitle}}',
      defaults: { score: 'not scored' },
    },
  },

  COURSE_REOPENED: {
    placeholders: ['userName', 'courseTitle', 'completionPercent', 'appUrl'],
    uz: {
      subject: 'Kursga yangi dars qo\'shildi: {{courseTitle}}',
      body: '"{{courseTitle}}" kursiga yangi majburiy dars qo\'shildi, shuning uchun u yana ochildi. Hozirgi progress: {{completionPercent}}. Ilgari olingan sertifikat kuchida qoladi.',
      push: 'Yangi dars: {{courseTitle}}',
    },
    ru: {
      subject: 'В курс добавлен новый урок: {{courseTitle}}',
      body: 'В курс «{{courseTitle}}» добавлен новый обязательный урок, поэтому он снова открыт. Текущий прогресс: {{completionPercent}}. Ранее выданный сертификат остаётся действительным.',
      push: 'Новый урок: {{courseTitle}}',
    },
    en: {
      subject: 'A lesson was added to {{courseTitle}}',
      body: '"{{courseTitle}}" has a new required lesson, so it is open again. You are at {{completionPercent}}. A certificate you already have stays valid.',
      push: 'New lesson: {{courseTitle}}',
    },
  },

  TASK_ASSIGNED: {
    placeholders: ['userName', 'taskTitle', 'deadline', 'assignerName', 'appUrl'],
    uz: {
      subject: 'Yangi vazifa: {{taskTitle}}',
      body: '{{assignerName}} sizga "{{taskTitle}}" vazifasini berdi. Muddat: {{deadline}}.',
      push: 'Yangi vazifa: {{taskTitle}}',
      defaults: { deadline: 'belgilanmagan', assignerName: 'Rahbaringiz' },
    },
    ru: {
      subject: 'Новая задача: {{taskTitle}}',
      body: '{{assignerName}} назначил(а) вам задачу «{{taskTitle}}». Срок: {{deadline}}.',
      push: 'Новая задача: {{taskTitle}}',
      defaults: { deadline: 'не указан', assignerName: 'Ваш руководитель' },
    },
    en: {
      subject: 'New task: {{taskTitle}}',
      body: '{{assignerName}} assigned you "{{taskTitle}}". Due {{deadline}}.',
      push: 'New task: {{taskTitle}}',
      defaults: { deadline: 'with no set date', assignerName: 'Your manager' },
    },
  },

  TASK_DEADLINE_APPROACHING: {
    placeholders: ['userName', 'taskTitle', 'deadline', 'daysLeft', 'appUrl'],
    uz: {
      subject: 'Vazifa muddati yaqin: {{taskTitle}}',
      body: '"{{taskTitle}}" vazifasiga {{daysLeft}} kun qoldi — muddat {{deadline}}.',
      push: '{{daysLeft}} kun qoldi: {{taskTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Приближается срок задачи: {{taskTitle}}',
      body: 'До срока задачи «{{taskTitle}}» осталось {{daysLeft}} дн. — {{deadline}}.',
      push: 'Осталось {{daysLeft}} дн.: {{taskTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Task deadline approaching: {{taskTitle}}',
      body: '{{daysLeft}} day(s) left on "{{taskTitle}}" — due {{deadline}}.',
      push: '{{daysLeft}} day(s) left: {{taskTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  TASK_OVERDUE: {
    placeholders: ['userName', 'taskTitle', 'deadline', 'appUrl'],
    uz: {
      subject: 'Vazifa muddati o\'tdi: {{taskTitle}}',
      body: '"{{taskTitle}}" vazifasining muddati {{deadline}} da o\'tdi va u hali bajarilmagan.',
      push: 'Muddati o\'tdi: {{taskTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Задача просрочена: {{taskTitle}}',
      body: 'Срок задачи «{{taskTitle}}» истёк {{deadline}}, задача не выполнена.',
      push: 'Просрочено: {{taskTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Task overdue: {{taskTitle}}',
      body: '"{{taskTitle}}" was due {{deadline}} and is still open.',
      push: 'Overdue: {{taskTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  TASK_STATUS_CHANGED: {
    placeholders: ['userName', 'taskTitle', 'fromStatus', 'toStatus', 'actorName', 'appUrl'],
    uz: {
      subject: 'Vazifa holati o\'zgardi: {{taskTitle}}',
      body: '{{actorName}} "{{taskTitle}}" vazifasini {{fromStatus}} dan {{toStatus}} ga o\'tkazdi.',
      push: '{{taskTitle}}: {{toStatus}}',
    },
    ru: {
      subject: 'Статус задачи изменён: {{taskTitle}}',
      body: '{{actorName}} перевёл(а) задачу «{{taskTitle}}» из {{fromStatus}} в {{toStatus}}.',
      push: '{{taskTitle}}: {{toStatus}}',
    },
    en: {
      subject: 'Task status changed: {{taskTitle}}',
      body: '{{actorName}} moved "{{taskTitle}}" from {{fromStatus}} to {{toStatus}}.',
      push: '{{taskTitle}}: {{toStatus}}',
    },
  },

  QUIZ_ASSIGNED: {
    placeholders: ['userName', 'quizTitle', 'courseTitle', 'deadline', 'appUrl'],
    uz: {
      subject: 'Test tayinlandi: {{quizTitle}}',
      body: '"{{courseTitle}}" kursi bo\'yicha "{{quizTitle}}" testi tayinlandi. Muddat: {{deadline}}.',
      push: 'Test tayinlandi: {{quizTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Назначен тест: {{quizTitle}}',
      body: 'По курсу «{{courseTitle}}» назначен тест «{{quizTitle}}». Срок: {{deadline}}.',
      push: 'Назначен тест: {{quizTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Quiz assigned: {{quizTitle}}',
      body: 'The quiz "{{quizTitle}}" for "{{courseTitle}}" has been assigned to you. Due {{deadline}}.',
      push: 'Quiz assigned: {{quizTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  QUIZ_PASSED: {
    placeholders: ['userName', 'quizTitle', 'score', 'passingScore', 'appUrl'],
    uz: {
      subject: 'Test topshirildi: {{quizTitle}}',
      body: '"{{quizTitle}}" testidan {{score}} ball oldingiz (o\'tish balli {{passingScore}}). Tabriklaymiz!',
      push: 'O\'tdingiz: {{quizTitle}} — {{score}}',
    },
    ru: {
      subject: 'Тест сдан: {{quizTitle}}',
      body: 'За тест «{{quizTitle}}» вы набрали {{score}} (проходной балл {{passingScore}}). Поздравляем!',
      push: 'Сдано: {{quizTitle}} — {{score}}',
    },
    en: {
      subject: 'Quiz passed: {{quizTitle}}',
      body: 'You scored {{score}} on "{{quizTitle}}" (pass mark {{passingScore}}). Well done.',
      push: 'Passed: {{quizTitle}} — {{score}}',
    },
  },

  QUIZ_FAILED: {
    placeholders: ['userName', 'quizTitle', 'score', 'passingScore', 'attemptsLeft', 'appUrl'],
    uz: {
      subject: 'Test topshirilmadi: {{quizTitle}}',
      body: '"{{quizTitle}}" testidan {{score}} ball oldingiz, o\'tish balli {{passingScore}}. Qolgan urinishlar: {{attemptsLeft}}.',
      push: 'O\'ta olmadingiz: {{quizTitle}} — {{score}}',
      defaults: { attemptsLeft: 'qolmadi' },
    },
    ru: {
      subject: 'Тест не сдан: {{quizTitle}}',
      body: 'За тест «{{quizTitle}}» вы набрали {{score}} при проходном {{passingScore}}. Осталось попыток: {{attemptsLeft}}.',
      push: 'Не сдано: {{quizTitle}} — {{score}}',
      defaults: { attemptsLeft: 'не осталось' },
    },
    en: {
      subject: 'Quiz not passed: {{quizTitle}}',
      body: 'You scored {{score}} on "{{quizTitle}}"; the pass mark is {{passingScore}}. Attempts left: {{attemptsLeft}}.',
      push: 'Not passed: {{quizTitle}} — {{score}}',
      defaults: { attemptsLeft: 'none' },
    },
  },

  NEWS_PUBLISHED: {
    placeholders: ['userName', 'newsTitle', 'authorName', 'appUrl'],
    uz: {
      subject: 'Yangilik: {{newsTitle}}',
      body: '{{authorName}} yangi e\'lon joyladi: "{{newsTitle}}".',
      push: 'Yangilik: {{newsTitle}}',
    },
    ru: {
      subject: 'Новость: {{newsTitle}}',
      body: '{{authorName}} опубликовал(а) новость «{{newsTitle}}».',
      push: 'Новость: {{newsTitle}}',
    },
    en: {
      subject: 'News: {{newsTitle}}',
      body: '{{authorName}} published "{{newsTitle}}".',
      push: 'News: {{newsTitle}}',
    },
  },

  CERTIFICATE_ISSUED: {
    placeholders: ['userName', 'courseTitle', 'certificateNumber', 'validUntil', 'appUrl'],
    uz: {
      subject: 'Sertifikat berildi: {{courseTitle}}',
      body: '{{userName}}, "{{courseTitle}}" kursi uchun sertifikat berildi. Raqami: {{certificateNumber}}, amal qilish muddati: {{validUntil}}.',
      push: 'Sertifikat tayyor: {{courseTitle}}',
      defaults: { validUntil: 'muddatsiz' },
    },
    ru: {
      subject: 'Выдан сертификат: {{courseTitle}}',
      body: '{{userName}}, по курсу «{{courseTitle}}» выдан сертификат № {{certificateNumber}}, действителен до {{validUntil}}.',
      push: 'Сертификат готов: {{courseTitle}}',
      defaults: { validUntil: 'бессрочно' },
    },
    en: {
      subject: 'Certificate issued: {{courseTitle}}',
      body: '{{userName}}, your certificate for "{{courseTitle}}" is ready. Number {{certificateNumber}}, valid until {{validUntil}}.',
      push: 'Certificate ready: {{courseTitle}}',
      defaults: { validUntil: 'no expiry' },
    },
  },

  CERTIFICATE_EXPIRING: {
    placeholders: ['userName', 'courseTitle', 'certificateNumber', 'validUntil', 'daysLeft', 'appUrl'],
    uz: {
      subject: 'Sertifikat muddati tugayapti: {{courseTitle}}',
      body: '"{{courseTitle}}" sertifikatining muddati {{validUntil}} da tugaydi — {{daysLeft}} kun qoldi. Qayta o\'qish talab qilinishi mumkin.',
      push: 'Sertifikat {{daysLeft}} kunda tugaydi',
    },
    ru: {
      subject: 'Истекает сертификат: {{courseTitle}}',
      body: 'Сертификат по курсу «{{courseTitle}}» истекает {{validUntil}} — осталось {{daysLeft}} дн. Возможно, потребуется пересдача.',
      push: 'Сертификат истекает через {{daysLeft}} дн.',
    },
    en: {
      subject: 'Certificate expiring: {{courseTitle}}',
      body: 'Your certificate for "{{courseTitle}}" expires on {{validUntil}} — {{daysLeft}} day(s) left. Retraining may be required.',
      push: 'Certificate expires in {{daysLeft}} day(s)',
    },
  },

  CERTIFICATE_EXPIRED: {
    placeholders: ['userName', 'courseTitle', 'certificateNumber', 'validUntil', 'appUrl'],
    uz: {
      subject: 'Sertifikat muddati tugadi: {{courseTitle}}',
      body: '"{{courseTitle}}" sertifikatining ({{certificateNumber}}) muddati {{validUntil}} da tugadi. Amaldagi sertifikat talab qilinadigan ishlarga qayta o\'qimasdan qo\'yilmaysiz.',
      push: 'Sertifikat muddati tugadi: {{courseTitle}}',
    },
    ru: {
      subject: 'Сертификат истёк: {{courseTitle}}',
      body: 'Сертификат № {{certificateNumber}} по курсу «{{courseTitle}}» истёк {{validUntil}}. К работам, требующим действующего сертификата, без переобучения не допускают.',
      push: 'Сертификат истёк: {{courseTitle}}',
    },
    en: {
      subject: 'Certificate expired: {{courseTitle}}',
      body: 'Certificate {{certificateNumber}} for "{{courseTitle}}" expired on {{validUntil}}. Work requiring a valid certificate is not permitted until you retrain.',
      push: 'Certificate expired: {{courseTitle}}',
    },
  },

  EVENT_INVITATION: {
    placeholders: ['userName', 'eventTitle', 'startsAt', 'location', 'appUrl'],
    uz: {
      subject: 'Tadbirga taklif: {{eventTitle}}',
      body: '{{userName}}, "{{eventTitle}}" tadbiriga taklif qilindingiz. Vaqti: {{startsAt}}, joyi: {{location}}.',
      push: 'Taklif: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'keyinroq e\'lon qilinadi' },
    },
    ru: {
      subject: 'Приглашение: {{eventTitle}}',
      body: '{{userName}}, вы приглашены на «{{eventTitle}}». Время: {{startsAt}}, место: {{location}}.',
      push: 'Приглашение: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'будет объявлено позже' },
    },
    en: {
      subject: 'Invitation: {{eventTitle}}',
      body: '{{userName}}, you are invited to "{{eventTitle}}". Starts {{startsAt}}, at {{location}}.',
      push: 'Invitation: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'to be announced' },
    },
  },

  EVENT_REMINDER: {
    placeholders: ['userName', 'eventTitle', 'startsAt', 'location', 'appUrl'],
    uz: {
      subject: 'Eslatma: {{eventTitle}}',
      body: '"{{eventTitle}}" tadbiri {{startsAt}} da boshlanadi. Joyi: {{location}}.',
      push: '{{eventTitle}} — {{startsAt}}',
      defaults: { location: 'keyinroq e\'lon qilinadi' },
    },
    ru: {
      subject: 'Напоминание: {{eventTitle}}',
      body: '«{{eventTitle}}» начинается {{startsAt}}. Место: {{location}}.',
      push: '{{eventTitle}} — {{startsAt}}',
      defaults: { location: 'будет объявлено позже' },
    },
    en: {
      subject: 'Reminder: {{eventTitle}}',
      body: '"{{eventTitle}}" starts at {{startsAt}}. Location: {{location}}.',
      push: '{{eventTitle}} — {{startsAt}}',
      defaults: { location: 'to be announced' },
    },
  },

  EVENT_CANCELLED: {
    placeholders: ['userName', 'eventTitle', 'startsAt', 'reason', 'appUrl'],
    uz: {
      subject: 'Tadbir bekor qilindi: {{eventTitle}}',
      body: '{{startsAt}} ga rejalashtirilgan "{{eventTitle}}" tadbiri bekor qilindi. Sabab: {{reason}}.',
      push: 'Bekor qilindi: {{eventTitle}}',
      defaults: { reason: 'ko\'rsatilmagan' },
    },
    ru: {
      subject: 'Мероприятие отменено: {{eventTitle}}',
      body: '«{{eventTitle}}», запланированное на {{startsAt}}, отменено. Причина: {{reason}}.',
      push: 'Отменено: {{eventTitle}}',
      defaults: { reason: 'не указана' },
    },
    en: {
      subject: 'Event cancelled: {{eventTitle}}',
      body: '"{{eventTitle}}", scheduled for {{startsAt}}, has been cancelled. Reason: {{reason}}.',
      push: 'Cancelled: {{eventTitle}}',
      defaults: { reason: 'not stated' },
    },
  },

  EVENT_RESCHEDULED: {
    placeholders: ['userName', 'eventTitle', 'startsAt', 'previousStartsAt', 'location', 'appUrl'],
    uz: {
      subject: 'Tadbir vaqti o\'zgardi: {{eventTitle}}',
      body: '"{{eventTitle}}" tadbiri {{previousStartsAt}} dan {{startsAt}} ga ko\'chirildi. Joyi: {{location}}.',
      push: 'Yangi vaqt: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'keyinroq e\'lon qilinadi', previousStartsAt: 'oldingi vaqt' },
    },
    ru: {
      subject: 'Мероприятие перенесено: {{eventTitle}}',
      body: '«{{eventTitle}}» перенесено с {{previousStartsAt}} на {{startsAt}}. Место: {{location}}.',
      push: 'Новое время: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'будет объявлено позже', previousStartsAt: 'прежнего времени' },
    },
    en: {
      subject: 'Event rescheduled: {{eventTitle}}',
      body: '"{{eventTitle}}" has moved from {{previousStartsAt}} to {{startsAt}}. Location: {{location}}.',
      push: 'New time: {{eventTitle}} — {{startsAt}}',
      defaults: { location: 'to be announced', previousStartsAt: 'its previous time' },
    },
  },

  PATH_ASSIGNED: {
    placeholders: ['userName', 'pathTitle', 'courseCount', 'deadline', 'appUrl'],
    uz: {
      subject: 'O\'quv yo\'li tayinlandi: {{pathTitle}}',
      body: '{{userName}}, sizga "{{pathTitle}}" o\'quv yo\'li biriktirildi — {{courseCount}} ta kurs. Muddat: {{deadline}}.',
      push: 'Yangi o\'quv yo\'li: {{pathTitle}}',
      defaults: { deadline: 'belgilanmagan' },
    },
    ru: {
      subject: 'Назначена траектория: {{pathTitle}}',
      body: '{{userName}}, вам назначена траектория «{{pathTitle}}» — {{courseCount}} курс(ов). Срок: {{deadline}}.',
      push: 'Новая траектория: {{pathTitle}}',
      defaults: { deadline: 'не указан' },
    },
    en: {
      subject: 'Learning path assigned: {{pathTitle}}',
      body: '{{userName}}, the learning path "{{pathTitle}}" has been assigned to you — {{courseCount}} course(s). Due {{deadline}}.',
      push: 'New learning path: {{pathTitle}}',
      defaults: { deadline: 'with no set date' },
    },
  },

  COMPLIANCE_RETRAINING_DUE: {
    placeholders: ['userName', 'courseTitle', 'deadline', 'periodLabel', 'appUrl'],
    uz: {
      subject: 'Majburiy qayta o\'qish: {{courseTitle}}',
      body: '{{periodLabel}} uchun "{{courseTitle}}" kursi qayta tayinlandi. Muddat: {{deadline}}.',
      push: 'Qayta o\'qish: {{courseTitle}}',
      defaults: { deadline: 'belgilanmagan', periodLabel: 'joriy davr' },
    },
    ru: {
      subject: 'Обязательное переобучение: {{courseTitle}}',
      body: 'Курс «{{courseTitle}}» назначен повторно за период {{periodLabel}}. Срок: {{deadline}}.',
      push: 'Переобучение: {{courseTitle}}',
      defaults: { deadline: 'не указан', periodLabel: 'текущий период' },
    },
    en: {
      subject: 'Mandatory retraining: {{courseTitle}}',
      body: '"{{courseTitle}}" has been reassigned for {{periodLabel}}. Due {{deadline}}.',
      push: 'Retraining: {{courseTitle}}',
      defaults: { deadline: 'with no set date', periodLabel: 'the current period' },
    },
  },

  ATTENTION_ALERT: {
    placeholders: ['userName', 'learnerName', 'videoTitle', 'courseTitle', 'lostCount', 'appUrl'],
    uz: {
      subject: 'Diqqat pasaydi: {{learnerName}}',
      body: '{{learnerName}} "{{videoTitle}}" ({{courseTitle}}) videosini ko\'rish davomida {{lostCount}} marta ekrandan chalg\'idi.',
      push: '{{learnerName}}: {{lostCount}}× chalg\'ish',
      defaults: { courseTitle: 'kurs' },
    },
    ru: {
      subject: 'Снижение внимания: {{learnerName}}',
      body: '{{learnerName}} отвлекался(ась) {{lostCount}} раз(а) во время видео «{{videoTitle}}» ({{courseTitle}}).',
      push: '{{learnerName}}: {{lostCount}}× отвлечений',
      defaults: { courseTitle: 'курс' },
    },
    en: {
      subject: 'Low attention: {{learnerName}}',
      body: '{{learnerName}} looked away {{lostCount}} time(s) while watching "{{videoTitle}}" ({{courseTitle}}).',
      push: '{{learnerName}}: {{lostCount}}× looked away',
      defaults: { courseTitle: 'a course' },
    },
  },

  PROCTORING_FOREIGN_FACE: {
    placeholders: ['userName', 'learnerName', 'videoTitle', 'reason', 'appUrl'],
    uz: {
      subject: 'Proctoring ogohlantirishi: {{learnerName}}',
      body: '"{{videoTitle}}" videosini ko\'rish davomida {{reason}}. Yozuvni platformada ko\'rishingiz mumkin.',
      push: 'Proctoring: {{learnerName}}',
    },
    ru: {
      subject: 'Предупреждение прокторинга: {{learnerName}}',
      body: 'Во время видео «{{videoTitle}}» {{reason}}. Запись доступна в платформе.',
      push: 'Прокторинг: {{learnerName}}',
    },
    en: {
      subject: 'Proctoring alert: {{learnerName}}',
      body: 'While watching "{{videoTitle}}", {{reason}}. The snapshot is available in the platform.',
      push: 'Proctoring: {{learnerName}}',
    },
  },
}

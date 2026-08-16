// Exported reports are read outside the app — in Excel, in a printout, in an
// email attachment — so their headers and enum values have to carry their own
// language instead of relying on the UI to translate them afterwards. The
// admin passes the locale it is displaying (`?lang=`), and every label in the
// file comes from here.
//
// Dates stay ISO (YYYY-MM-DD) in every language: they are sorted and filtered
// in Excel far more often than they are read as prose.

const MESSAGES = {
  uz: {
    'type.employee-progress': 'Xodimlar progressi',
    'type.course-progress': 'Kurslar progressi',
    'type.video-analytics': 'Video tahlili',
    'type.news-analytics': 'Yangiliklar tahlili',
    'type.task-analytics': 'Vazifalar tahlili',

    'col.fullName': 'F.I.Sh.',
    'col.jshshir': 'JSHSHIR',
    'col.department': "Bo'lim",
    'col.isActive': 'Faol',
    'col.assignedCourses': 'Biriktirilgan kurslar',
    'col.completedCourses': 'Tugallangan kurslar',
    'col.overdueCourses': "Muddati o'tgan kurslar",
    'col.avgCompletionPercent': "O'rtacha bajarilish, %",
    'col.totalWatchedMinutes': "Jami ko'rilgan (daq.)",

    'col.course': 'Kurs',
    'col.status': 'Holat',
    'col.assignedCount': 'Biriktirilgan',
    'col.completedCount': 'Tugallangan',

    'col.video': 'Video',
    'col.viewers': "Ko'ruvchilar",
    'col.avgPauses': "O'rtacha to'xtatish",
    'col.avgSkippedSeconds': "O'rtacha o'tkazib yuborilgan (sek)",

    'col.article': 'Maqola',
    'col.published': 'Chop etilgan',
    'col.opens': 'Ochilishlar',
    'col.avgReadPercent': "O'rtacha o'qilgan, %",
    'col.avgTimeSpentSeconds': "O'rtacha sarflangan vaqt (sek)",

    'col.task': 'Vazifa',
    'col.assignedTo': 'Kimga',
    'col.assignedBy': 'Kim bergan',
    'col.priority': 'Muhimlik',
    'col.deadline': 'Muddat',
    'col.completedAt': 'Bajarilgan sana',

    'value.yes': 'Ha',
    'value.no': "Yo'q",

    'courseStatus.DRAFT': 'Qoralama',
    'courseStatus.PUBLISHED': 'Chop etilgan',
    'courseStatus.ARCHIVED': 'Arxivlangan',

    'taskStatus.TODO': 'Bajarilishi kerak',
    'taskStatus.IN_PROGRESS': 'Jarayonda',
    'taskStatus.COMPLETED': 'Bajarildi',
    'taskStatus.CANCELLED': 'Bekor qilingan',

    'priority.LOW': 'Past',
    'priority.MEDIUM': "O'rta",
    'priority.HIGH': 'Yuqori',

    'pdf.generatedAt': 'Yaratilgan sana',
  },

  ru: {
    'type.employee-progress': 'Прогресс сотрудников',
    'type.course-progress': 'Прогресс курсов',
    'type.video-analytics': 'Аналитика видео',
    'type.news-analytics': 'Аналитика новостей',
    'type.task-analytics': 'Аналитика задач',

    'col.fullName': 'ФИО',
    'col.jshshir': 'ЖШШИР',
    'col.department': 'Отдел',
    'col.isActive': 'Активен',
    'col.assignedCourses': 'Назначено курсов',
    'col.completedCourses': 'Завершено курсов',
    'col.overdueCourses': 'Просрочено курсов',
    'col.avgCompletionPercent': 'Средний прогресс, %',
    'col.totalWatchedMinutes': 'Всего просмотрено (мин)',

    'col.course': 'Курс',
    'col.status': 'Статус',
    'col.assignedCount': 'Назначено',
    'col.completedCount': 'Завершено',

    'col.video': 'Видео',
    'col.viewers': 'Зрителей',
    'col.avgPauses': 'Среднее число пауз',
    'col.avgSkippedSeconds': 'Среднее пропущено (сек)',

    'col.article': 'Новость',
    'col.published': 'Опубликовано',
    'col.opens': 'Открытий',
    'col.avgReadPercent': 'Среднее прочтение, %',
    'col.avgTimeSpentSeconds': 'Среднее время чтения (сек)',

    'col.task': 'Задача',
    'col.assignedTo': 'Кому',
    'col.assignedBy': 'Кто назначил',
    'col.priority': 'Приоритет',
    'col.deadline': 'Срок',
    'col.completedAt': 'Дата выполнения',

    'value.yes': 'Да',
    'value.no': 'Нет',

    'courseStatus.DRAFT': 'Черновик',
    'courseStatus.PUBLISHED': 'Опубликован',
    'courseStatus.ARCHIVED': 'В архиве',

    'taskStatus.TODO': 'К выполнению',
    'taskStatus.IN_PROGRESS': 'В процессе',
    'taskStatus.COMPLETED': 'Выполнено',
    'taskStatus.CANCELLED': 'Отменено',

    'priority.LOW': 'Низкий',
    'priority.MEDIUM': 'Средний',
    'priority.HIGH': 'Высокий',

    'pdf.generatedAt': 'Дата формирования',
  },

  en: {
    'type.employee-progress': 'Employee Progress',
    'type.course-progress': 'Course Progress',
    'type.video-analytics': 'Video Analytics',
    'type.news-analytics': 'News Analytics',
    'type.task-analytics': 'Task Analytics',

    'col.fullName': 'Full name',
    'col.jshshir': 'JSHSHIR',
    'col.department': 'Department',
    'col.isActive': 'Active',
    'col.assignedCourses': 'Assigned courses',
    'col.completedCourses': 'Completed courses',
    'col.overdueCourses': 'Overdue courses',
    'col.avgCompletionPercent': 'Avg completion %',
    'col.totalWatchedMinutes': 'Total watched (min)',

    'col.course': 'Course',
    'col.status': 'Status',
    'col.assignedCount': 'Assigned',
    'col.completedCount': 'Completed',

    'col.video': 'Video',
    'col.viewers': 'Viewers',
    'col.avgPauses': 'Avg pauses',
    'col.avgSkippedSeconds': 'Avg skipped (sec)',

    'col.article': 'Article',
    'col.published': 'Published',
    'col.opens': 'Opens',
    'col.avgReadPercent': 'Avg read %',
    'col.avgTimeSpentSeconds': 'Avg time spent (sec)',

    'col.task': 'Task',
    'col.assignedTo': 'Assigned to',
    'col.assignedBy': 'Assigned by',
    'col.priority': 'Priority',
    'col.deadline': 'Deadline',
    'col.completedAt': 'Completed at',

    'value.yes': 'Yes',
    'value.no': 'No',

    'courseStatus.DRAFT': 'Draft',
    'courseStatus.PUBLISHED': 'Published',
    'courseStatus.ARCHIVED': 'Archived',

    'taskStatus.TODO': 'To do',
    'taskStatus.IN_PROGRESS': 'In progress',
    'taskStatus.COMPLETED': 'Completed',
    'taskStatus.CANCELLED': 'Cancelled',

    'priority.LOW': 'Low',
    'priority.MEDIUM': 'Medium',
    'priority.HIGH': 'High',

    'pdf.generatedAt': 'Generated at',
  },
}

export const REPORT_LANGS = Object.keys(MESSAGES)

// Same default as the admin UI, so a request that forgets `?lang=` still
// produces the language most of this deployment reads.
export const DEFAULT_REPORT_LANG = 'uz'

// Unknown enum values (a status added to a model but not to this file) fall
// through to the raw value rather than to an empty cell — a report row is
// still useful with one untranslated word in it.
export function reportTranslator(lang) {
  const dict = MESSAGES[lang] ?? MESSAGES[DEFAULT_REPORT_LANG]
  return (key, fallback) => dict[key] ?? MESSAGES.en[key] ?? fallback ?? key
}

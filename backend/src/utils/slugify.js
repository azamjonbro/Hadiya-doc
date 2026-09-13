// Cyrillic → Latin before the ASCII squeeze. Titles here are written in
// Uzbek Cyrillic and Russian as often as in Latin, and "Йўналиш 1" used
// to come out as "1" — or, for "Траектория", as nothing at all, which the
// models' `required` slug turned into a 500 on save.
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Uzbek Cyrillic
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
}

export function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[а-яёўқғҳ]/g, (ch) => CYRILLIC[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

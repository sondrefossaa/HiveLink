export function normalizeNo(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase('nb-NO').trim()
}

export function sanitizeNorwegianWordInput(value: string): string {
  return normalizeNo(value).replace(/[^a-zæøå]/gu, '')
}

export function isNorwegianWordish(word: string): boolean {
  return /^[a-zæøå]+$/u.test(normalizeNo(word))
}

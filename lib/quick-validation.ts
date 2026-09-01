import { normalizeNo } from './norwegian-dictionary'

export function quickValidate(word: string): { valid: boolean; error?: string } {
  const normalized = normalizeNo(word)

  if (normalized.length === 0) {
    return { valid: false, error: 'Skriv inn et ord' }
  }

  if (normalized.length < 4) {
    return { valid: false, error: 'Ordet må være minst 4 bokstaver' }
  }

  if (normalized.length > 30) {
    return { valid: false, error: 'Ordet er for langt' }
  }

  if (!/^\p{L}+$/u.test(normalized)) {
    return { valid: false, error: 'Ordet kan bare inneholde bokstaver' }
  }

  return { valid: true }
}

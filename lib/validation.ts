import type { ValidationResult } from '@/types'
import { getWordEntriesForWord } from '@/lib/dictionary'
import { normalizeNo } from '@/lib/norwegian-dictionary'

const validationCache = new Map<string, ValidationResult>()

export async function validateCompoundWord(word: string): Promise<ValidationResult> {
  const normalized = normalizeNo(word)
  const cached = validationCache.get(normalized)
  if (cached) return cached

  if (normalized.length < 4) return { valid: false, parts: [], error: 'Ordet må være minst 4 bokstaver langt' }
  if (normalized.length > 30) return { valid: false, parts: [], error: 'Ordet er for langt' }

  const entries = await getWordEntriesForWord(normalized)
  const entry = entries[0]
  const result: ValidationResult = entry
    ? {
        valid: true,
        word: entry.word,
        parts: [...entry.parts],
        incomingKeys: [...entry.incomingKeys],
        outgoingKeys: [...entry.outgoingKeys],
        analyses: entries.map(candidate => ({
          parts: [...candidate.parts],
          incomingKeys: [...candidate.incomingKeys],
          outgoingKeys: [...candidate.outgoingKeys],
        })),
      }
    : { valid: false, word: normalized, parts: [], error: 'Ordet finnes ikke i den godkjente ordlisten' }
  validationCache.set(normalized, result)
  return result
}

export function clearValidationCache(): void {
  validationCache.clear()
}

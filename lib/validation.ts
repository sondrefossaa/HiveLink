// lib/validation.ts
// Norwegian word validation using bundled Norsk Ordbank data.
// No external API needed — all validation is offline.

import {
  parseCompoundWord,
  isLikelyCompoundWord,
  registerCompoundParts,
  getKnownCompoundParts,
} from './compound-utils'
import { isValidWord, isCompoundPart, normalizeNo } from './norwegian-dictionary'
import type { ValidationResult } from '@/types'

const validationCache = new Map<string, ValidationResult>()

export async function validateCompoundWord(word: string): Promise<ValidationResult> {
  const normalized = normalizeNo(word)

  if (validationCache.has(normalized)) {
    return validationCache.get(normalized)!
  }

  if (normalized.length < 4) {
    return { valid: false, parts: [], error: 'Ordet må være minst 4 bokstaver langt' }
  }

  if (normalized.length > 30) {
    return { valid: false, parts: [], error: 'Ordet er for langt' }
  }

  // Fast path: bundled dictionary
  const bundledParts = getKnownCompoundParts(normalized)
  if (bundledParts && bundledParts.length >= 2) {
    const result: ValidationResult = { valid: true, parts: bundledParts, word: normalized }
    validationCache.set(normalized, result)
    return result
  }

  // Check if it's a valid Norwegian word at all
  if (!isValidWord(normalized)) {
    const result: ValidationResult = {
      valid: false,
      parts: [],
      error: 'Ordet ble ikke funnet i ordlisten',
      word: normalized,
    }
    validationCache.set(normalized, result)
    return result
  }

  // Try to parse as compound
  const parts = parseCompoundWord(normalized)
  if (isLikelyCompoundWord(normalized, parts) && parts.length >= 2) {
    // Verify all parts are valid Norwegian words
    const allPartsValid = parts.every(p => isValidWord(p) || isCompoundPart(p))
    if (allPartsValid) {
      const result: ValidationResult = { valid: true, parts, word: normalized }
      registerCompoundParts(normalized, parts)
      validationCache.set(normalized, result)
      return result
    }
  }

  // Word exists but isn't recognized as a compound
  const result: ValidationResult = {
    valid: false,
    parts,
    error: 'Ikke gjenkjent som sammensatt ord',
    word: normalized,
  }
  validationCache.set(normalized, result)
  return result
}

export function clearValidationCache(): void {
  validationCache.clear()
}

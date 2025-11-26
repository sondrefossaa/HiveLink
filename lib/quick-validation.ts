export function quickValidate(word: string): { valid: boolean; error?: string } {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')

  if (normalized.length === 0) {
    return { valid: false, error: 'Please enter a word' }
  }

  if (normalized.length < 4) {
    return { valid: false, error: 'Word must be at least 4 characters' }
  }

  if (normalized.length > 30) {
    return { valid: false, error: 'Word is too long' }
  }

  if (!/^[a-z]+$/.test(normalized)) {
    return { valid: false, error: 'Word can only contain letters' }
  }

  return { valid: true }
}

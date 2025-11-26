import { parseCompoundWord, countCommonCompoundParts } from './compound-utils'
import type { ValidationResult } from '@/types'
import { datamuseRateLimiter } from './rate-limit'
import { getPrismaClient } from './prisma-client'

// In-memory cache for Datamuse API results
const validationCache = new Map<string, ValidationResult>()

type DatamuseEntry = {
  word: string
  [key: string]: unknown
}

/**
 * Validate a compound word using the Datamuse API
 */
export async function validateCompoundWord(word: string): Promise<ValidationResult> {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  
  // Check cache first
  if (validationCache.has(normalized)) {
    return validationCache.get(normalized)!
  }
  
  // Basic length validation
  if (normalized.length < 4) {
    const result: ValidationResult = {
      valid: false,
      parts: [],
      error: 'Word must be at least 4 characters long',
    }
    return result
  }
  
  if (normalized.length > 30) {
    const result: ValidationResult = {
      valid: false,
      parts: [],
      error: 'Word is too long',
    }
    return result
  }

  // Prefer local database lookup before hitting external APIs
  const storedResult = await lookupCompoundWord(normalized)
  if (storedResult) {
    validationCache.set(normalized, storedResult)
    return storedResult
  }
  
  try {
    // Query Datamuse API to check if the word exists using distributed rate limiting
    const data = (await datamuseRateLimiter.schedule(async () => {
      const response = await fetch(
        `https://api.datamuse.com/words?sp=${normalized}&md=d&max=1`,
        {
          cache: 'no-store',
          headers: {
            'User-Agent': 'HiveLink Compound Validator/1.0',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Datamuse API request failed')
      }

      const payload = (await response.json()) as DatamuseEntry[]
      return payload
    })) as DatamuseEntry[]
    
    // Check if word exists in the dictionary
    if (!data || data.length === 0) {
      const result: ValidationResult = {
        valid: false,
        parts: [],
        error: 'Word not found in dictionary',
        word: normalized,
      }
      validationCache.set(normalized, result)
      return result
    }
    
    const wordData = data[0]
    
    // Check if the returned word matches exactly
    if (wordData.word.toLowerCase() !== normalized) {
      const result: ValidationResult = {
        valid: false,
        parts: [],
        error: 'Word not found in dictionary',
        word: normalized,
      }
      validationCache.set(normalized, result)
      return result
    }
    
    // Parse into compound parts
    const parts = parseCompoundWord(normalized)
    
    // A compound word should have at least 2 parts
    if (parts.length < 2) {
      // Try an alternative parsing approach for known compound words
      const alternativeParts = tryAlternativeParsing(normalized)
      if (alternativeParts.length >= 2) {
        const result: ValidationResult = {
          valid: true,
          parts: alternativeParts,
          word: normalized,
        }
        validationCache.set(normalized, result)
        return result
      }
      
      const result: ValidationResult = {
        valid: false,
        parts: parts,
        error: 'Not recognized as a compound word',
        word: normalized,
      }
      validationCache.set(normalized, result)
      return result
    }
    
    const result: ValidationResult = {
      valid: true,
      parts,
      word: normalized,
    }
    void persistCompoundWord(normalized, parts)
    validationCache.set(normalized, result)
    return result
    
  } catch (error) {
    console.error('Validation error:', error)

    // Try a deterministic local fallback so common compounds still work offline
    const alternativeParts = tryAlternativeParsing(normalized)
    if (alternativeParts.length >= 2) {
      const fallbackResult: ValidationResult = {
        valid: true,
        parts: alternativeParts,
        word: normalized,
      }
      void persistCompoundWord(normalized, alternativeParts)
      validationCache.set(normalized, fallbackResult)
      return fallbackResult
    }

    const parts = parseCompoundWord(normalized)
    const knownParts = countCommonCompoundParts(parts)
    const looksLikeCompound = parts.length >= 2 && knownParts >= 2

    if (looksLikeCompound) {
      const fallbackResult: ValidationResult = {
        valid: true,
        parts,
        word: normalized,
      }
      void persistCompoundWord(normalized, parts)
      validationCache.set(normalized, fallbackResult)
      return fallbackResult
    }

    return {
      valid: false,
      parts: [],
      error: 'Validation service is unavailable. Please try again.',
      word: normalized,
    }
  }
}

/**
 * Alternative parsing for common compound words that might not split easily
 */
function tryAlternativeParsing(word: string): string[] {
  // Known compound word patterns
  const knownCompounds: Record<string, string[]> = {
    butterfly: ['butter', 'fly'],
    honeymoon: ['honey', 'moon'],
    sunflower: ['sun', 'flower'],
    moonshine: ['moon', 'shine'],
    sunshine: ['sun', 'shine'],
    moonlight: ['moon', 'light'],
    sunlight: ['sun', 'light'],
    starlight: ['star', 'light'],
    firefly: ['fire', 'fly'],
    dragonfly: ['dragon', 'fly'],
    horsefly: ['horse', 'fly'],
    housefly: ['house', 'fly'],
    mayfly: ['may', 'fly'],
    sawfly: ['saw', 'fly'],
    blackfly: ['black', 'fly'],
    bluebird: ['blue', 'bird'],
    blackbird: ['black', 'bird'],
    redbird: ['red', 'bird'],
    snowbird: ['snow', 'bird'],
    firebird: ['fire', 'bird'],
    mockingbird: ['mocking', 'bird'],
    hummingbird: ['humming', 'bird'],
    thunderbird: ['thunder', 'bird'],
    ladybug: ['lady', 'bug'],
    bedbug: ['bed', 'bug'],
    firebug: ['fire', 'bug'],
    goldfish: ['gold', 'fish'],
    starfish: ['star', 'fish'],
    jellyfish: ['jelly', 'fish'],
    swordfish: ['sword', 'fish'],
    catfish: ['cat', 'fish'],
    crawfish: ['craw', 'fish'],
    crayfish: ['cray', 'fish'],
    sunfish: ['sun', 'fish'],
    football: ['foot', 'ball'],
    baseball: ['base', 'ball'],
    basketball: ['basket', 'ball'],
    volleyball: ['volley', 'ball'],
    snowball: ['snow', 'ball'],
    fireball: ['fire', 'ball'],
    eyeball: ['eye', 'ball'],
    meatball: ['meat', 'ball'],
    hairball: ['hair', 'ball'],
    bedroom: ['bed', 'room'],
    bathroom: ['bath', 'room'],
    classroom: ['class', 'room'],
    ballroom: ['ball', 'room'],
    mushroom: ['mush', 'room'],
    showroom: ['show', 'room'],
    storeroom: ['store', 'room'],
    newsroom: ['news', 'room'],
    darkroom: ['dark', 'room'],
    sunroom: ['sun', 'room'],
    rainbow: ['rain', 'bow'],
    crossbow: ['cross', 'bow'],
    elbow: ['el', 'bow'],
    snowfall: ['snow', 'fall'],
    rainfall: ['rain', 'fall'],
    waterfall: ['water', 'fall'],
    nightfall: ['night', 'fall'],
    downfall: ['down', 'fall'],
    pitfall: ['pit', 'fall'],
    windfall: ['wind', 'fall'],
    footfall: ['foot', 'fall'],
    landfall: ['land', 'fall'],
    firework: ['fire', 'work'],
    homework: ['home', 'work'],
    network: ['net', 'work'],
    framework: ['frame', 'work'],
    teamwork: ['team', 'work'],
    artwork: ['art', 'work'],
    woodwork: ['wood', 'work'],
    clockwork: ['clock', 'work'],
    groundwork: ['ground', 'work'],
    patchwork: ['patch', 'work'],
    goldmine: ['gold', 'mine'],
    landmine: ['land', 'mine'],
    coalmine: ['coal', 'mine'],
    doorbell: ['door', 'bell'],
    doorknob: ['door', 'knob'],
    doorstep: ['door', 'step'],
    doorway: ['door', 'way'],
    trapdoor: ['trap', 'door'],
    backdoor: ['back', 'door'],
    flytrap: ['fly', 'trap'],
    mousetrap: ['mouse', 'trap'],
    rattrap: ['rat', 'trap'],
    firetrap: ['fire', 'trap'],
    deathtrap: ['death', 'trap'],
    hillside: ['hill', 'side'],
    hillbilly: ['hill', 'billy'],
    hilltop: ['hill', 'top'],
    anthill: ['ant', 'hill'],
    foothill: ['foot', 'hill'],
    downhill: ['down', 'hill'],
    uphill: ['up', 'hill'],
    molehill: ['mole', 'hill'],
    pancake: ['pan', 'cake'],
    cupcake: ['cup', 'cake'],
    cheesecake: ['cheese', 'cake'],
    fruitcake: ['fruit', 'cake'],
    shortcake: ['short', 'cake'],
    beefcake: ['beef', 'cake'],
    hoecake: ['hoe', 'cake'],
    hotcake: ['hot', 'cake'],
    seedcake: ['seed', 'cake'],
    teacake: ['tea', 'cake'],
    airport: ['air', 'port'],
    seaport: ['sea', 'port'],
    passport: ['pass', 'port'],
    carport: ['car', 'port'],
    heliport: ['heli', 'port'],
    freeport: ['free', 'port'],
    airplane: ['air', 'plane'],
    seaplane: ['sea', 'plane'],
    biplane: ['bi', 'plane'],
    warplane: ['war', 'plane'],
    sailboat: ['sail', 'boat'],
    rowboat: ['row', 'boat'],
    lifeboat: ['life', 'boat'],
    steamboat: ['steam', 'boat'],
    speedboat: ['speed', 'boat'],
    tugboat: ['tug', 'boat'],
    houseboat: ['house', 'boat'],
    motorboat: ['motor', 'boat'],
    showboat: ['show', 'boat'],
    dreamboat: ['dream', 'boat'],
    newspaper: ['news', 'paper'],
    sandpaper: ['sand', 'paper'],
    wallpaper: ['wall', 'paper'],
    notepaper: ['note', 'paper'],
    blueprint: ['blue', 'print'],
    footprint: ['foot', 'print'],
    fingerprint: ['finger', 'print'],
    newsprint: ['news', 'print'],
    handprint: ['hand', 'print'],
    hoofprint: ['hoof', 'print'],
    thumbprint: ['thumb', 'print'],
    voiceprint: ['voice', 'print'],
    overprint: ['over', 'print'],
    misprint: ['mis', 'print'],
    reprint: ['re', 'print'],
    offprint: ['off', 'print'],
    pineapple: ['pine', 'apple'],
    crabapple: ['crab', 'apple'],
    applesauce: ['apple', 'sauce'],
  }
  
  if (knownCompounds[word]) {
    return knownCompounds[word]
  }
  
  return []
}

/**
 * Clear the validation cache (useful for testing)
 */
export function clearValidationCache(): void {
  validationCache.clear()
}

async function lookupCompoundWord(word: string): Promise<ValidationResult | null> {
  if (typeof window !== 'undefined') {
    return null
  }

  try {
    const prisma = await getPrismaClient()
    const record = await prisma.compoundWord.findUnique({
      where: { word },
    })

    if (!record) {
      return null
    }

    return {
      valid: true,
      parts: record.parts,
      word: record.word,
    }
  } catch (error) {
    console.error('Compound word DB lookup failed:', error)
    return null
  }
}

async function persistCompoundWord(word: string, parts: string[]): Promise<void> {
  if (typeof window !== 'undefined') {
    return
  }

  try {
    const prisma = await getPrismaClient()
    await prisma.compoundWord.upsert({
      where: { word },
      update: { parts },
      create: { word, parts },
    })
  } catch (error) {
    console.error('Compound word DB persist failed:', error)
  }
}


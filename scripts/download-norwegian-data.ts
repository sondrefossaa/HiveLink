import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '..', 'data', 'raw')
const NB_DIR = join(RAW_DIR, 'nb-1gram')

const SOURCES = [
  {
    name: 'nb-1gram/1gram_nob_f1_abc.zip',
    url: 'https://www.nb.no/sbfil/tekst/1gram_nob_f1_abc.zip',
  },
]

function download() {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true })
  }
  if (!existsSync(NB_DIR)) mkdirSync(NB_DIR, { recursive: true })

  for (const src of SOURCES) {
    const dest = join(RAW_DIR, src.name)
    if (existsSync(dest)) {
      console.log(`  ✓ ${src.name} already exists, skipping`)
      continue
    }
    console.log(`  ↓ Downloading ${src.name}...`)
    try {
      execSync(`curl -L -o "${dest}" "${src.url}"`, {
        stdio: 'inherit',
        timeout: 120_000,
      })
      console.log(`  ✓ ${src.name} downloaded`)
    } catch (e) {
      console.error(`  ✗ Failed to download ${src.name}: ${e}`)
      process.exit(1)
    }
  }

  console.log('\nAll files downloaded to data/raw/')
}

download()

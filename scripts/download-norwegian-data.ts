import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '..', 'data', 'raw')

const SOURCES = [
  {
    name: 'leddanalyse.txt',
    url: 'https://github.com/tobiasvl/norsk-ordbank/raw/main/nob/leddanalyse.txt',
  },
  {
    name: 'fullformsliste.txt',
    url: 'https://github.com/tobiasvl/norsk-ordbank/raw/main/nob/fullformsliste.txt',
  },
  {
    name: 'no_50k.txt',
    url: 'https://github.com/hermitdave/FrequencyWords/raw/master/content/2018/no/no_50k.txt',
  },
]

function download() {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true })
  }

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

// scripts/import-compound-words.ts
// Norwegian compound word import pipeline.
// Downloads the pinned sources and builds the reviewed gameplay artifact.

import { execSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function run(script: string) {
  console.log(`\n=== Running ${script} ===\n`)
  execSync(`npx tsx ${__dirname}/${script}`, { stdio: 'inherit', cwd: __dirname + '/..' })
}

run('download-norwegian-data.ts')
run('build-norwegian-compounds.ts')
run('derive-compound-runtime.ts')

console.log('\n✓ Norwegian data pipeline complete!')

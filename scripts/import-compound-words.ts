// scripts/import-compound-words.ts
// Norwegian compound word import pipeline.
// Runs the three build scripts in sequence.

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
run('build-norwegian-dictionary.ts')

console.log('\n✓ Norwegian data pipeline complete!')

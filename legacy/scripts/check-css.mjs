/* Une accolade orpheline fait tomber toute une feuille sans bruit :
   le navigateur n'affiche rien, la compilation réussit. On compte. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []
  )
}
let ko = 0
for (const f of walk('src')) {
  const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  let d = 0, min = 0
  for (const c of s) { if (c === '{') d++; else if (c === '}') { d--; min = Math.min(min, d) } }
  if (d !== 0 || min < 0) { console.error(`✗ ${f} — accolades déséquilibrées (solde ${d})`); ko++ }
}
if (ko) process.exit(1)
console.log('✓ feuilles de style équilibrées')

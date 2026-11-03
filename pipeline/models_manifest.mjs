// Gera src/data/models.manifest.json: hash do conteúdo de cada GLB em public/models/.
// O app põe o hash na URL (skin.glb?v=...), então o Cache Storage (public/sw.js) nunca serve um modelo
// velho depois que o pipeline regera os arquivos. Rodado ao fim de models:optimize e models:lod.
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelsDir = path.join(root, 'public/models')
const manifest = {}
for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith('.glb')).sort()) {
  manifest[file] = createHash('sha256').update(await readFile(path.join(modelsDir, file))).digest('hex').slice(0, 10)
}
await writeFile(path.join(root, 'src/data/models.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`manifesto: ${Object.keys(manifest).length} modelos -> src/data/models.manifest.json`)

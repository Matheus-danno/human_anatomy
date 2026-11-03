// Comprime todos os GLB de public/models (ou do diretório passado como argumento) com
// quantização (KHR_mesh_quantization) + meshopt (EXT_meshopt_compression), sobrescrevendo-os.
//
// Não usa `gltf-transform optimize` de propósito: ele faz join/simplify/flatten por padrão,
// o que fundiria as malhas e perderia o nome/anatomy_id de cada estrutura.
// Arquivos que já usam EXT_meshopt_compression são pulados (rodar duas vezes é seguro).
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelsDir = path.resolve(process.argv[2] ?? path.join(projectRoot, 'public/models'))

const mb = (bytes) => `${(bytes / 1_048_576).toFixed(2)} MB`

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const files = (await readdir(modelsDir)).filter((f) => f.toLowerCase().endsWith('.glb')).sort()
if (files.length === 0) {
  console.error(`Nenhum .glb em ${modelsDir}. Rode antes o pipeline/export_systems.py no Blender.`)
  process.exit(1)
}

const rows = []
for (const file of files) {
  const filePath = path.join(modelsDir, file)
  const before = (await stat(filePath)).size
  const doc = await io.read(filePath)

  const alreadyDone = doc
    .getRoot()
    .listExtensionsUsed()
    .some((ext) => ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME)
  if (alreadyDone) {
    rows.push({ arquivo: file, antes: mb(before), depois: mb(before), redução: 'já otimizado' })
    continue
  }

  // meshopt() reordena vértices, quantiza atributos e aplica a compressão meshopt.
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  await io.write(filePath, doc)

  const after = (await stat(filePath)).size
  rows.push({
    arquivo: file,
    antes: mb(before),
    depois: mb(after),
    redução: `${(100 * (1 - after / before)).toFixed(0)}%`,
  })
}

console.table(rows)
const total = await Promise.all(files.map((f) => stat(path.join(modelsDir, f))))
console.log(`Total: ${mb(total.reduce((sum, s) => sum + s.size, 0))}`)

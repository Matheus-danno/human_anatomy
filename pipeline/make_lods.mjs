// Gera versões simplificadas (LOD) dos GLB maiores: public/models/<sistema>.lod.glb.
//
// Medido na GPU integrada (Intel UHD) com os 13 sistemas ligados: só processar os ~10 milhões de triângulos
// levava ~18 ms por frame, acima dos 16,7 ms de 60 fps. O app usa o LOD nas estruturas longe da câmera
// (ver src/scene/batching.ts); o hover continua usando a malha completa.
//
// Mantém nós, nomes e anatomy_id: só as geometrias mudam. Uso: node pipeline/make_lods.mjs
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dequantize, meshopt, prune, simplify, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelsDir = path.join(root, 'public/models')

/** Só sistemas com mais triângulos que isso ganham LOD (nos pequenos o ganho não compensa o download). */
const MIN_TRIANGLES = 500_000
/** Fração alvo de triângulos e erro máximo (relativo ao tamanho de cada malha). */
const RATIO = 0.25
const ERROR = 0.005

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const triangles = (doc) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0)

const rows = []
for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith('.glb') && !f.endsWith('.lod.glb')).sort()) {
  const doc = await io.read(path.join(modelsDir, file))
  const before = triangles(doc)
  if (before < MIN_TRIANGLES) continue
  await doc.transform(
    dequantize(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
  const out = path.join(modelsDir, file.replace(/\.glb$/, '.lod.glb'))
  await io.write(out, doc)
  const after = triangles(doc)
  rows.push({
    sistema: file.replace('.glb', ''),
    triângulos: `${(before / 1e6).toFixed(2)} M -> ${(after / 1e6).toFixed(2)} M (${Math.round((100 * after) / before)}%)`,
    arquivo: `${((await stat(out)).size / 1048576).toFixed(2)} MB`,
  })
}
console.table(rows)

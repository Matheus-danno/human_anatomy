// Gera src/data/anatomy.pt-BR.json (nomes em português e latim, sistema, região e lado de cada estrutura)
// e pipeline/reports/revisao-nomes.md (casos a revisar).
//
// Fontes, em ordem de prioridade:
//   1. pipeline/translations/overrides.pt-BR.json — correções e traduções manuais (chave = nome em inglês
//      sem sufixo de lado).
//   2. pipeline/source/TA2.csv — Terminologia Anatomica 2 multilíngue distribuída pelo Z-Anatomy
//      (colunas English, Latin, Portugues). O português dela é brasileiro, mas tem erros pontuais
//      (termos em francês, lado ou posição trocados), por isso cada tradução passa por validação.
// A região vem das coleções do Z-Anatomy e, quando elas não decidem (estruturas só em "Trunk"), da altura
// do centro da estrutura no corpo, lida dos GLB em public/models/.
//
// Uso: node pipeline/build_anatomy.mjs [--qa]   (--qa só lista o que falha na validação)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'
import { classifyMuscleLayers } from './muscle_layers.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const qaOnly = process.argv.includes('--qa')

const raw = JSON.parse(readFileSync(path.join(root, 'src/data/structures.raw.json'), 'utf8'))
const overrides = JSON.parse(readFileSync(path.join(root, 'pipeline/translations/overrides.pt-BR.json'), 'utf8'))

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const SIDE_SUFFIX = /\.(r|l)$/
const baseName = (name) => name.replace(SIDE_SUFFIX, '')

// --- TA2 --------------------------------------------------------------------------------------------
const ta2 = new Map()
for (const line of readFileSync(path.join(root, 'pipeline/source/TA2.csv'), 'utf8').split(/\r?\n/).slice(1)) {
  if (!line) continue
  const [, en, la, , , pt] = line.replace(/^"|"$/g, '').replace(/""/g, '"').split(';')
  if (!ta2.has(norm(en))) ta2.set(norm(en), { la: la.trim(), pt: pt.trim() })
}

// --- Validação das traduções da TA2 -----------------------------------------------------------------
// Cada termo de posição/lado presente no inglês precisa aparecer no português — inclusive em plural e
// em compostos ("laterais", "posterolateral", "inferomedial").
const TERM_PAIRS = [
  [/\bright\b/, /direit/],
  [/\bleft\b/, /esquerd/],
  [/\banterior\b/, /anter/],
  [/\bposterior\b/, /poster/],
  [/\bsuperior\b/, /super/],
  [/\binferior\b/, /infer/],
  [/\bmedial\b/, /medi/],
  [/\blateral\b/, /later/],
  [/\bdeep\b/, /profund/],
  [/\bsuperficial\b/, /superficia/],
  [/\bmajor\b/, /maior/],
  [/\bminor\b/, /menor/],
  [/\binternal\b/, /intern/],
  [/\bexternal\b/, /extern/],
  [/\bascending\b/, /ascendente/],
  [/\bdescending\b/, /descendente/],
  [/\bproximal\b/, /proxima/],
  [/\bdistal\b/, /dista/],
]
// Francês, inglês e espanhol que aparecem na coluna portuguesa da TA2.
const FOREIGN = /\b(gauche|droite?|du|des|de la|le|les|et|muscle|nerve|artery|vein|branch|ligament of|del|el|los|las|y|investiente)\b/i

function validate(en, pt, la) {
  const problems = []
  const e = en.toLowerCase()
  const p = pt.toLowerCase()
  if (FOREIGN.test(pt)) problems.push('termo em outra língua')
  if (/^\(?(Arteria|Arteriae|Vena|Venae|Nervus|Nervi|Musculus|Musculi|Ramus|Rami|Nodus|Nodi|Ligamentum|Os|Ossa)\s/.test(pt)) {
    problems.push('termo em latim')
  }
  if (norm(en) === norm(pt)) problems.push('não traduzido (igual ao inglês)')
  else if (la && norm(la) === norm(pt) && norm(la) !== norm(en)) problems.push('não traduzido (igual ao latim)')
  for (const [enTerm, ptTerm] of TERM_PAIRS) {
    if (enTerm.test(e) && !ptTerm.test(p)) problems.push(`"${enTerm.source.replace(/\\b/g, '')}" sem correspondente`)
  }
  return problems
}

// Padronização da grafia da TA2:
// - acordo ortográfico de 1990: "oi" paroxítono e "pólo" perdem o acento (mastóide -> mastoide);
// - termos da SBA no lugar de variantes: linfonodos ("Nódulos"/"Nós"), bolsa ("Bursa");
// - acentos que faltam em fáscia e cápsula.
function normalizePt(en, pt) {
  let out = pt
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/óide(s?)\b/g, 'oide$1')
    .replace(/\b([Pp])ólo(s?)\b/g, '$1olo$2')
    .replace(/^Bursa(s?)\b/, 'Bolsa$1')
    .replace(/\b([Ff])ascia\b/g, '$1áscia')
    .replace(/\b([Cc])apsula\b/g, '$1ápsula')
  // Só linfonodos: os nós sinoatrial e atrioventricular do coração continuam "nó".
  if (/\bnodes?\b/i.test(en) && !/sinu|atrioventricular/i.test(en)) {
    // Lookahead em vez de \b: sem a flag u, "ó" não conta como letra e "Nó\b" nunca casa.
    out = out
      .replace(/^(\(?)(Nódulos|Nós)(?=[\s)]|$)/, '$1Linfonodos')
      .replace(/^(\(?)(Nódulo|Nó)(?=[\s)]|$)/, '$1Linfonodo')
  }
  return out
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// --- Nome de cada estrutura -------------------------------------------------------------------------
function translate(en) {
  const override = overrides[en]
  const entry = ta2.get(norm(en))
  if (override) {
    return {
      pt: override.pt,
      la: override.latim ?? entry?.la ?? null,
      sinonimos: override.sinonimos,
      revisar: Boolean(override.revisar),
      fonte: 'manual',
      motivo: override.nota,
    }
  }
  if (!entry) return { pt: en, la: null, revisar: true, fonte: 'sem tradução', motivo: 'ausente da TA2 e dos overrides' }
  const pt = normalizePt(en, entry.pt)
  const problems = validate(en, pt, entry.la)
  return {
    pt,
    la: entry.la || null,
    revisar: problems.length > 0,
    fonte: 'TA2',
    motivo: problems.join('; ') || undefined,
  }
}

// --- Lado com concordância de gênero ----------------------------------------------------------------
const FEMININE = new Set([
  'parte', 'base', 'face', 'falange', 'laringe', 'faringe', 'ponte', 'pele', 'pelve', 'raiz', 'mão', 'região',
  'cartilagem', 'sínfise', 'epífise', 'diáfise', 'apófise', 'hipófise', 'fise', 'lente', 'fronte', 'glande',
  'tuba', 'cútis', 'derme', 'epiderme', 'cóclea', 'íris', 'córnea', 'retina', 'esclera', 'úvula', 'cerviz',
  'polpa', 'unha', 'bainha', 'bolsa', 'cápsula', 'fossa', 'fissura', 'tela', 'túnica', 'linha', 'margem',
  'ínsula', 'amígdala', 'tonsila', 'aorta', 'carótida', 'traqueia', 'veia', 'artéria', 'glândula', 'vértebra',
  'costela', 'articulação', 'aponeurose', 'tíbia', 'fíbula', 'ulna', 'clavícula', 'escápula', 'patela',
  'mandíbula', 'maxila', 'concha', 'órbita', 'sutura', 'fáscia', 'tênia', 'flexura', 'papila', 'valva',
  'válvula', 'cúspide', 'comissura', 'crista', 'espinha', 'tuberosidade', 'lâmina', 'cabeça', 'superfície',
  'raízes', 'hélice', 'antélice', 'rede', 'pirâmide',
])
const MASCULINE_A = new Set(['sistema', 'diafragma', 'estroma', 'plexo', 'trígono', 'esqueleto', 'coma', 'platisma', 'quiasma'])

// Substantivos terminados em "s" que são singulares.
const SINGULAR_S = new Set([
  'pâncreas', 'íris', 'atlas', 'cútis', 'pênis', 'tálus', 'trágus', 'bíceps', 'tríceps', 'quadríceps', 'ânus', 'pubis',
])

const headNoun = (pt) => pt.replace(/^[(\s]+/, '').split(/[\s(,]/)[0].toLowerCase()

function isFeminine(head) {
  // Formas singulares candidatas: "superfícies" -> "superfície", "regiões" -> "região", "nervos" -> "nervo".
  const forms = isPlural(head) ? [head, head.slice(0, -1), head.replace(/ões$/, 'ão'), head.replace(/es$/, '')] : [head]
  for (const word of forms) {
    if (FEMININE.has(word)) return true
    if (MASCULINE_A.has(word)) return false
  }
  return /(a|ção|são|dade|gem|ie|ite|ose|ase)$/.test(forms[1] ?? head)
}

const isPlural = (head) => head.endsWith('s') && !SINGULAR_S.has(head)

function withSide(pt, side) {
  if (!side) return pt
  const head = headNoun(pt)
  const word = (side === 'r' ? 'direit' : 'esquerd') + (isFeminine(head) ? 'a' : 'o') + (isPlural(head) ? 's' : '')
  return `${pt} ${word}`
}

// Latim não tem acentos; a coluna da TA2 traz alguns herdados do francês ("latérales").
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// --- Região -----------------------------------------------------------------------------------------
const REGION_BY_COLLECTION = [
  [/upper limb/i, 'membro superior'],
  [/lower limb/i, 'membro inferior'],
  [/^head$|regions of head|regions of face|regions of epicranium|muscles of head|bones of cranium|extracranial bones of head/i, 'cabeça'],
  [/^neck$|regions of neck|muscles of neck|region of neck/i, 'pescoço'],
  [/^thorax$|regions of thorax|bones of thorax|region of thorax|joints of thorax/i, 'tórax'],
  [/^abdomen$|regions of abdomen|muscles of abdomen|abdominopelvic/i, 'abdômen'],
  [/^pelvis$|bony pelvis|pelvic girdle|perineum/i, 'pelve'],
]
// Fallback pela posição (metros; corpo com 1,744 m, pés em y=0, frente para +Z).
function regionByPosition([x, y]) {
  if (y > 1.52) return 'cabeça'
  if (y > 1.43) return 'pescoço'
  if (Math.abs(x) > 0.19 && y > 0.7) return 'membro superior'
  if (y > 1.08) return 'tórax'
  if (y > 0.93) return 'abdômen'
  if (y > 0.8) return 'pelve'
  return 'membro inferior'
}

async function loadCentroids() {
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const centroids = new Map()
  for (const system of new Set(raw.map((r) => r.system))) {
    const doc = await io.read(path.join(root, `public/models/${system}.glb`))
    for (const node of doc.getRoot().listNodes()) {
      const id = node.getExtras().anatomy_id
      if (!id) continue
      const { min, max } = getBounds(node)
      centroids.set(id, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2])
    }
  }
  return centroids
}

// --- Grupos buscáveis (coleções do Z-Anatomy sem um objeto único equivalente) -----------------------
// O fígado não entra: existe o objeto "Liver" inteiro, além dos segmentos.
const GROUPS = [
  { id: 'grupo_coracao', collection: 'Heart', nomePt: 'Coração', nomeLatim: 'Cor' },
  { id: 'grupo_pulmoes', collection: 'Lungs', nomePt: 'Pulmões', nomeLatim: 'Pulmones' },
  { id: 'grupo_encefalo', collection: 'Brain', nomePt: 'Encéfalo', nomeLatim: 'Encephalon' },
]

// --- Execução ---------------------------------------------------------------------------------------
const names = new Map()
for (const en of new Set(raw.map((r) => baseName(r.name)))) names.set(en, translate(en))

if (qaOnly) {
  const flagged = [...names].filter(([, t]) => t.revisar)
  console.log(`${flagged.length} de ${names.size} nomes base precisam de revisão:`)
  for (const [en, t] of flagged) console.log(`${JSON.stringify(en)}\t${t.fonte}\t${t.pt}\t${t.la ?? ''}\t${t.motivo ?? ''}`)
  process.exit(0)
}

const centroids = await loadCentroids()
const muscleLayers = await classifyMuscleLayers(
  path.join(root, 'public/models/muscular.glb'),
  new Map(raw.map((r) => [r.id, r.name])),
)
const regionSource = { colecao: 0, posicao: 0 }
const structures = raw.map((r) => {
  const side = (r.name.match(SIDE_SUFFIX) || [])[1] ?? null
  const t = names.get(baseName(r.name))
  let regiao = null
  for (const [pattern, region] of REGION_BY_COLLECTION) {
    if (r.collections.some((c) => pattern.test(c))) {
      regiao = region
      break
    }
  }
  if (regiao) regionSource.colecao++
  else {
    regiao = regionByPosition(centroids.get(r.id) ?? [0, 1, 0])
    regionSource.posicao++
  }
  return {
    id: r.id,
    nomePt: capitalize(withSide(t.pt, side)),
    nomeLatim: t.la ? stripAccents(t.la) : null,
    sistema: r.system,
    regiao,
    lado: side === 'r' ? 'direito' : side === 'l' ? 'esquerdo' : null,
    original: r.name,
    ...(muscleLayers.has(r.id) ? { camada: muscleLayers.get(r.id).layer } : {}),
    ...(t.sinonimos ? { sinonimos: t.sinonimos } : {}),
    ...(t.revisar ? { revisar: true } : {}),
  }
})

const groups = GROUPS.map((g) => {
  const membros = raw.filter((r) => r.collections.includes(g.collection)).map((r) => r.id)
  const systems = [...new Set(membros.map((id) => raw.find((r) => r.id === id).system))]
  return { id: g.id, nomePt: g.nomePt, nomeLatim: g.nomeLatim, sistemas: systems, membros }
})

writeFileSync(
  path.join(root, 'src/data/anatomy.pt-BR.json'),
  JSON.stringify({ estruturas: structures, grupos: groups }) + '\n',
  'utf8',
)

// --- Relatório --------------------------------------------------------------------------------------
const flagged = [...names].filter(([, t]) => t.revisar)
const bySource = Object.groupBy(flagged, ([, t]) => t.fonte)
let md = `# Revisão dos nomes em português\n\nGerado por \`pipeline/build_anatomy.mjs\`. ${structures.length} estruturas, ${names.size} nomes base (sem lado).\n\n`
md += `- Da TA2 sem problemas: ${[...names.values()].filter((t) => t.fonte === 'TA2' && !t.revisar).length}\n`
md += `- Manuais (overrides): ${[...names.values()].filter((t) => t.fonte === 'manual').length}, dos quais ${[...names.values()].filter((t) => t.fonte === 'manual' && t.revisar).length} marcados para revisão\n`
md += `- **A revisar: ${flagged.length}** nomes base (${structures.filter((s) => s.revisar).length} estruturas)\n`
md += `- Região pelas coleções do Z-Anatomy: ${regionSource.colecao}; pela posição no corpo: ${regionSource.posicao}\n\n`
md += 'Para corrigir um nome, edite `pipeline/translations/overrides.pt-BR.json` (chave = nome em inglês sem `.r`/`.l`) e rode `npm run anatomy:build`.\n'
for (const [source, items] of Object.entries(bySource)) {
  md += `\n## ${source} (${items.length})\n\n| Inglês (Z-Anatomy) | Português | Latim | Motivo |\n|---|---|---|---|\n`
  for (const [en, t] of items.sort(([a], [b]) => a.localeCompare(b))) {
    md += `| ${en} | ${t.pt} | ${t.la ?? '—'} | ${t.motivo ?? ''} |\n`
  }
}
mkdirSync(path.join(root, 'pipeline/reports'), { recursive: true })
writeFileSync(path.join(root, 'pipeline/reports/revisao-nomes.md'), md, 'utf8')

const regions = Object.entries(Object.groupBy(structures, (s) => s.regiao)).map(([k, v]) => `${k}: ${v.length}`)
console.log(`${structures.length} estruturas -> src/data/anatomy.pt-BR.json`)
console.log(`regiões: ${regions.join(', ')}`)
console.log(`região por coleção: ${regionSource.colecao}, por posição: ${regionSource.posicao}`)
console.log(`grupos: ${groups.map((g) => `${g.nomePt} (${g.membros.length})`).join(', ')}`)
const layers = Object.entries(Object.groupBy([...muscleLayers.values()], (v) => v.layer)).map(([k, v]) => `${k}: ${v.length}`)
console.log(`camadas musculares: ${layers.join(', ')}`)
console.log(`a revisar: ${flagged.length} nomes base -> pipeline/reports/revisao-nomes.md`)

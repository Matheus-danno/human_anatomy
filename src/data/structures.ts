import type { SystemId } from './systems'

export type Region =
  | 'cabeça'
  | 'pescoço'
  | 'tórax'
  | 'abdômen'
  | 'pelve'
  | 'membro superior'
  | 'membro inferior'

/** Uma estrutura de anatomy.pt-BR.json (gerado por pipeline/build_anatomy.mjs). */
export interface StructureInfo {
  id: string
  /** Nome em português, já com o lado concordado ("Artéria radial direita"). */
  nomePt: string
  nomeLatim: string | null
  sistema: SystemId
  regiao: Region
  lado: 'direito' | 'esquerdo' | null
  /** Nome original no Z-Anatomy. */
  original: string
  /** Outros nomes em português aceitos na busca (ex.: "Nervo ciático" para o isquiático). */
  sinonimos?: string[]
  /** Só no sistema muscular: camada para o slider (ver pipeline/muscle_layers.mjs). */
  camada?: 'superficial' | 'profunda'
  /** Tradução incerta, listada em pipeline/reports/revisao-nomes.md. */
  revisar?: true
}

/** Conjunto buscável sem objeto único no modelo (ex.: o coração são 17 partes). */
export interface GroupInfo {
  id: string
  nomePt: string
  nomeLatim: string | null
  sistemas: SystemId[]
  membros: string[]
}

export interface AnatomyData {
  structures: ReadonlyMap<string, StructureInfo>
  groups: readonly GroupInfo[]
}

/** Carregado sob demanda num chunk separado para não atrasar a primeira tela. */
export async function loadAnatomy(): Promise<AnatomyData> {
  const { default: data } = (await import('./anatomy.pt-BR.json')) as {
    default: { estruturas: StructureInfo[]; grupos: GroupInfo[] }
  }
  return { structures: new Map(data.estruturas.map((s) => [s.id, s])), groups: data.grupos }
}

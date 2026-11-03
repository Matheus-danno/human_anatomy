import { EffectComposer, FXAA, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { PERF_ENABLED } from './PerfProbe'

// Carregado sob demanda (React.lazy em Effects.tsx): postprocessing + n8ao só entram quando a qualidade alta
// está ativa, e ficam fora do bundle da primeira tela.

/**
 * O N8AO, ao achar qualquer material transparente na cena (o plano da sombra de contato basta), passa a
 * redesenhar a cena inteira mais duas vezes por frame e a percorrer todos os objetos três vezes. Com milhares
 * de estruturas isso dobrava o custo do frame; sem esse modo, translúcidos só herdam a oclusão do que está atrás.
 */
function disableTransparencyPasses(pass: { autoDetectTransparency: boolean; configuration: { transparencyAware: boolean } } | null) {
  if (!pass) return
  pass.autoDetectTransparency = false
  pass.configuration.transparencyAware = false
}

// `?perf&fx=ao,fxaa`: escolhe os efeitos (só para medir o custo de cada um no relatório de desempenho).
const fxParam = PERF_ENABLED ? new URLSearchParams(window.location.search).get('fx') : null
const enabled = (name: string) => fxParam === null || fxParam.split(',').includes(name)

/**
 * SSAO (N8AO), tone mapping ACES e antisserrilhamento FXAA. Custo medido na GPU integrada (Intel UHD,
 * 1400x900): N8AO ~6 ms (igual em "medium" e "performance": o custo está nas passadas fixas), FXAA ~1 ms;
 * SMAA custava 7,6 ms e MSAA 4x multiplica o custo por pixel, que é o gargalo da qualidade alta.
 */
export default function PostProcessing() {
  return (
    // Sem pós-processamento o renderer aplica ACES sozinho; com ele, o tone mapping vai no fim.
    // Sem normal pass: o N8AO reconstrói normais da profundidade, e o pass redesenharia a cena inteira.
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>
        {/* Raio em metros: ~8 cm, a escala dos sulcos entre músculos e entre órgãos. */}
        {enabled('ao') && (
          <N8AO ref={disableTransparencyPasses} aoRadius={0.05} distanceFalloff={0.5} intensity={2.5} quality="low" halfRes />
        )}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {enabled('fxaa') && <FXAA />}
      </>
    </EffectComposer>
  )
}

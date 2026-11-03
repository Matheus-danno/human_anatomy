# Atlas 3D de Anatomia Humana

## Objetivo

Atlas interativo de anatomia humana em 3D que roda inteiramente no navegador. A usabilidade é inspirada no **Zygote Body**: navegação orbital fluida, camadas por sistema (esquelético, muscular, nervoso, cardiovascular, vísceras) com controle de visibilidade/opacidade, seleção de estruturas por clique com nome e descrição, busca por nome e isolamento de estruturas.

- **Modelos 3D:** [Z-Anatomy](https://www.z-anatomy.com/) — licença **CC BY-SA 4.0**. Toda distribuição dos modelos (ou derivados) deve manter a atribuição e a mesma licença. A atribuição deve ficar visível na interface.
- **Idioma:** toda a interface e os textos voltados ao usuário são em **português (pt-BR)**. Nomes de estruturas em português, com o termo latino (Terminologia Anatomica) como referência secundária. Código e identificadores podem ficar em inglês.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS v4 (plugin `@tailwindcss/vite`, sem `tailwind.config`)
- three + @react-three/fiber v8 + @react-three/drei v9 (linhas compatíveis com React 18 — **não** atualizar para fiber v9 / drei v10 sem migrar para React 19)
- three-mesh-bvh para raycasting rápido (seleção por clique em malhas densas)
- zustand para estado global

## Estrutura

```
pipeline/          Scripts de conversão dos modelos Z-Anatomy (Blender → glTF/GLB otimizado)
  source/          Arquivos-fonte brutos (.blend etc.) — IGNORADO pelo git
public/models/     GLBs prontos para o navegador (saída do pipeline)
src/data/          Metadados: sistemas, nomes pt-BR/latim, descrições, hierarquia
src/scene/         Componentes 3D (Canvas, câmera, carregamento de modelos, seleção)
src/ui/            Componentes de interface (barra lateral, busca, painel de informações)
src/store/         Stores zustand (seleção, visibilidade de sistemas, câmera)
```

## Comandos

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — checagem de tipos + build de produção
- `npm run typecheck` — apenas checagem de tipos
- `npm run models:optimize` — quantização + meshopt em todos os GLB de `public/models/` (idempotente)

## Pipeline de modelos

O Blender 4.5.15 LTS (Linux x64, portátil) fica em `pipeline/blender/`, ignorado pelo git. Sempre chame-o por `pipeline/blender.sh`, que acrescenta `pipeline/blender/lib-extra/` (libSM/libICE extraídas dos .deb do Ubuntu, que faltam no WSL) ao `LD_LIBRARY_PATH` sem exigir sudo. Para reinstalar em outra máquina: baixar `blender-4.5.15-linux-x64.tar.xz` de download.blender.org, extrair com `--strip-components=1` em `pipeline/blender/` e, se `ldd` acusar libs faltando, `apt-get download libsm6 libice6` + `dpkg-deb -x` para `lib-extra/`.

1. `pipeline/blender.sh -b pipeline/source/<arquivo>.blend -P pipeline/export_systems.py -- --list` — mostra a árvore de coleções e o sistema atribuído a cada uma; ajuste `RULES`/`OVERRIDES` no script se algo cair no sistema errado ou ficar sem sistema.
2. Sem `--list`: aplica modificadores, decima malhas > 50 mil triângulos (`--max-tris N`), exporta `public/models/<sistema>.glb` e gera `src/data/structures.raw.json`.
3. `npm run models:optimize` e depois `npm run models:lod`.

- **Fonte:** `Z-Anatomy.zip` do repositório oficial [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy), commit `cf51df5d305f3a0f52637484aa127d4f2632041a` (o repo recebe commits automáticos diários; o `Startup.blend` dentro do zip é de 2023-05-02). Só o `Startup.blend` foi extraído, renomeado para `pipeline/source/z-anatomy.blend`.
- **Atribuição obrigatória** (License.txt do repo): "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0" e "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan".
- Mapeamento: as coleções de topo numeradas definem o sistema; 5 (cardiovascular), 7 (nervoso/sentidos) e 8 (vísceras) são subdivididas pelas subcoleções de "Bonus collection" (ver `TOP_LEVEL` no script). "9: Regions of human body" é usado como `skin`. "2: Muscular insertions" (áreas de origem/inserção) não é exportado.
- Vasos e nervos são curvas com bevel no .blend e são convertidos em malha na exportação.
- Coração e vasos genéricos vão para `arteries` (não há sistema próprio para o coração).
- O GLTFLoader do three.js reescreve nomes de nós (espaços, pontos). O vínculo malha ↔ metadados é `mesh.userData.anatomy_id`, que corresponde ao `id` em `structures.raw.json`.
## Nomes em português

`npm run anatomy:build` (`pipeline/build_anatomy.mjs`) gera `src/data/anatomy.pt-BR.json` a partir de `structures.raw.json`:

- Tradução e latim da **TA2** (`pipeline/source/TA2.csv`, Terminologia Anatomica 2 multilíngue do repo do Z-Anatomy, mesmo commit). O português dela é brasileiro, mas tem erros (termos em francês, lado/posição trocados, digitação); cada tradução é validada (termos de posição do inglês precisam aparecer no português) e a grafia é padronizada (acordo de 1990, "Linfonodos", "Bolsa").
- Correções e traduções manuais em `pipeline/translations/overrides.pt-BR.json` (chave = nome em inglês sem `.r`/`.l`; campos `pt`, `latim`, `sinonimos`, `revisar`, `nota`). Seguir a terminologia da SBA.
- Lado com concordância de gênero e número ("Artéria radial direita", "Linfonodos ... direitos").
- Região: coleções do Z-Anatomy; quando só dizem "Trunk", altura do centro da estrutura no corpo.
- Grupos buscáveis (Coração, Pulmões, Encéfalo) para conjuntos sem objeto único no modelo.
- Casos incertos (`revisar: true`) listados em `pipeline/reports/revisao-nomes.md`.

## Camadas, desfazer e link

- Camada muscular (`camada: superficial|profunda` no JSON) vem de `pipeline/muscle_layers.mjs`: raios aleatórios contra o corpo sem pele; superficial = visível de fora (limite calibrado em `SUPERFICIAL_DENSITY`). Fáscias, bainhas e bolsas não bloqueiam os raios e ficam na camada superficial.
- Slider de camadas (`setPeel`, 0–4): pele → músculos superficiais → profundos → órgãos → esqueleto. Os músculos profundos usam o material `muscular_deep` e a opacidade `deepMuscleOpacity`.
- Desfazer: toda ação que muda a cena guarda o `SceneState` anterior em `history` (sliders chamam `checkpoint()` no início do arraste).
- Link: `src/store/urlState.ts` (formato do fragmento `#s=...&o=...&p=...&h=...&sel=...&c=...`) e `urlSync.ts` (grava com debounce; câmera ao soltar o mouse ou fim de animação).

## Qualidade gráfica

- `quality` no store: `alta` (MeshPhysicalMaterial com sheen/clearcoat, subsurface simulado na pele por "wrap lighting" em `onBeforeCompile`, N8AO + tone mapping ACES via `@react-three/postprocessing`, sombra de contato) ou `baixa` (MeshStandardMaterial, sem pós-processamento, dpr 1). Escolha do usuário fica em `localStorage` (`anatomia.qualidade`); sem escolha, aparelhos modestos começam em baixa e o `PerformanceMonitor` do drei rebaixa se o fps cair.
- `@react-three/postprocessing` fica na v2 (linha do R3F v8/React 18).
- Com pós-processamento o fundo é desenhado na cena (`GradientBackground`), não pelo CSS.
- Testes visuais em Chrome headless usam SwiftShader (sem GPU): servem para conferir imagem, não fps.

## Desempenho (Fase 8)

- Renderização em lotes (`src/scene/batching.ts`): um `BatchedMesh` por sistema e material, com visibilidade por instância. As Meshes originais ficam invisíveis, servem de alvo do raycast (BVH) e só são desenhadas sozinhas quando precisam de material próprio (hover, seleção, "Transparente"). Lados espelhados (escala negativa) têm a geometria espelhada no lote. Ordem de desenho de fora para dentro (`DRAW_ORDER`).
- LOD: `npm run models:lod` gera `<sistema>.lod.glb` (~25–33% dos triângulos) para sistemas acima de 500 mil triângulos; `LodController` troca por estrutura conforme a distância à câmera (1,2 m). O hover usa sempre a malha completa.
- Modelos versionados por hash (`src/data/models.manifest.json`, gerado por `pipeline/models_manifest.mjs` ao fim de `models:optimize`/`models:lod`) e guardados no Cache Storage pelo service worker `public/sw.js` (só no build).
- Pós-processamento (`PostProcessing.tsx`) carregado sob demanda. Cuidados que custaram caro: o `GizmoHelper` precisa de `renderPriority` 2 na qualidade alta (com 1 ele redesenha a cena por cima do EffectComposer); o N8AO precisa de `autoDetectTransparency` desligado; nada de `enableNormalPass` nem MSAA/SMAA (FXAA).
- O BVH (raycast do hover) é construído em segundo plano depois da primeira tela (`structureRegistry.ts`), ou na hora pelo `ensureBoundsTree` se o hover chegar antes.
- Resolução adaptativa na qualidade alta (`AdaptiveResolution` em `Effects.tsx`): fps baixo reduz o dpr até 0,75 e depois passa para a baixa; só mede com a cena carregada.
- Medição: `?perf` expõe `window.__perf` (renderer, chamadas/triângulos por frame, hover) e `window.__monitor`; `?semlotes` desliga os lotes (comparação A/B); `?perf&fx=ao,fxaa` escolhe efeitos. Chrome headless com `--use-angle=d3d11` usa a GPU real (Intel UHD nesta máquina); relatório em `pipeline/reports/desempenho.md`.

## Notas dos modelos

- Os materiais dentro dos GLB são inúteis (o exportador não traduz os shaders do Z-Anatomy: base branca, emissão [1,1,1], metalicidade 0,5). O app sobrescreve tudo com um material por sistema em `src/scene/materials.ts`.
- Orientação: Y para cima, pés em y=0, frente do corpo voltada para +Z, unidades em metros (altura ≈ 1,74).
- Os GLB usam `EXT_meshopt_compression`: carregar com `useGLTF` do drei (meshopt habilitado por padrão) ou registrar `MeshoptDecoder` no GLTFLoader.

## Ambiente

O projeto vive no WSL (Ubuntu). Node é gerenciado por nvm e **não** carrega em shells não interativos: rode os comandos com `source ~/.nvm/nvm.sh` antes (ex.: `wsl -d Ubuntu -- bash -c "source ~/.nvm/nvm.sh && cd ~/projects/human_anatomy && npm run dev"`). Não use o npm do Windows sobre o caminho `\\wsl.localhost`.

## Diretrizes

- Desempenho primeiro: modelos devem ser comprimidos (Draco/meshopt) e divididos por sistema para carregamento sob demanda.
- Usar `<Bvh>` do drei (three-mesh-bvh) em volta das malhas selecionáveis.
- Cada malha do GLB deve ter um identificador estável que mapeie para uma entrada em `src/data`.

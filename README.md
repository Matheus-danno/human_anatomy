# Atlas 3D de Anatomia Humana

Atlas interativo de **anatomia humana em 3D** que roda inteiramente no
navegador. O usuário gira, aproxima e explora o corpo por sistemas (pele,
esqueleto, músculos, vasos, nervos e órgãos), clica em qualquer estrutura para
ver o nome em português e o termo latino, busca por nome, oculta, isola ou
deixa estruturas transparentes e compartilha a vista por link.

Os modelos 3D são do
[Z-Anatomy](https://www.z-anatomy.com/) (CC BY-SA 4.0), convertidos e
otimizados para a web por um pipeline próprio (ver
[Pipeline dos modelos](#pipeline-dos-modelos)).

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | React 18, TypeScript (strict), Tailwind CSS 4 |
| 3D | three.js, React Three Fiber 8, drei 9, three-mesh-bvh (raycast) |
| Pós-processamento | `@react-three/postprocessing` 2 (N8AO, FXAA, tone mapping ACES) |
| Estado | zustand |
| Build | Vite 6 |
| Pipeline dos modelos | Blender 4.5 LTS (Python), glTF Transform + meshoptimizer (Node) |
| Cache offline | Service worker com Cache Storage (só no build de produção) |

## Como rodar

Pré-requisito: Node 22+. Os modelos já otimizados estão em `public/models/`,
então não é preciso o Blender para rodar o app.

```bash
npm ci
npm run dev          # servidor de desenvolvimento (http://localhost:5173)

npm run build        # checagem de tipos + build de produção em dist/
npm run preview      # serve o build (com service worker e cache dos modelos)
npm run typecheck    # só a checagem de tipos
```

Parâmetros de URL úteis para avaliação: `?perf` mostra as medições de
renderização (`window.__perf`), `?semlotes` desliga a renderização em lotes para
comparação e `?perf&fx=ao,fxaa` escolhe os efeitos de pós-processamento.

## Funcionalidades

**Navegação**
- Câmera orbital com zoom e pan; vistas prontas (frente, costas, esquerda,
  direita, cima).
- Presets: Corpo inteiro, Músculos, Circulação, Órgãos e Nervos. Nos presets
  em que não é o foco, o esqueleto aparece translúcido como referência.

**Camadas**
- 13 sistemas, em cinco grupos (Superfície, Locomotor, Circulação, Nervoso,
  Órgãos), cada um com visibilidade e opacidade próprias.
- Slider de camadas que "descasca" o corpo: pele → músculos superficiais →
  músculos profundos → órgãos → esqueleto.
- Árvore de estruturas por sistema e região, com seleção e enquadramento.

**Estruturas**
- Hover com nome e clique para selecionar: painel com nome em português, termo
  latino, sistema, região e o nome original do Z-Anatomy.
- Busca por nome em português, latim ou sinônimos, inclusive grupos sem objeto
  único no modelo (Coração, Pulmões, Encéfalo).
- Ferramentas de clique: Selecionar, Ocultar e Transparente; isolar a seleção.
- Desfazer (Ctrl+Z) e "Mostrar tudo".
- Atalhos: `Esc` limpa a seleção, `H` oculta, `I` isola ou sai do isolamento.

**Vista e qualidade**
- Botão Compartilhar: o link guarda sistemas, opacidades, camada, estruturas
  ocultas, seleção e câmera.
- Qualidade alta (materiais realistas, oclusão ambiente, sombra de contato) ou
  baixa (para máquinas mais fracas). Sem escolha do usuário, aparelhos modestos
  começam na baixa e o app rebaixa sozinho se o fps cair.

## Estrutura

```
src/
  data/        sistemas, presets, camadas, busca e metadados das estruturas
               (anatomy.pt-BR.json, structures.raw.json, models.manifest.json)
  scene/       Canvas, câmera, carregamento dos modelos, hover e seleção,
               renderização em lotes, LOD, materiais e pós-processamento
  store/       store zustand (cena, seleção, histórico) e sincronização com a URL
  ui/          painel de sistemas, árvore, busca, painel de informações,
               barra de ferramentas, slider de camadas, atalhos
pipeline/      conversão Blender → GLB, otimização, LOD, nomes em português
  translations/  correções manuais das traduções
  reports/       relatórios de desempenho e de revisão dos nomes
public/
  models/      GLBs por sistema (completos e .lod), saída do pipeline
  sw.js        service worker do cache dos modelos
```

## Pipeline dos modelos

Os arquivos-fonte (o `.blend` do Z-Anatomy tem cerca de 300 MB e a TA2) e o
Blender portátil não estão no repositório. Para gerar os modelos de novo:

1. Do repositório
   [Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy),
   extrair o `Startup.blend` do `Z-Anatomy.zip` para
   `pipeline/source/z-anatomy.blend` e copiar a TA2 multilíngue para
   `pipeline/source/TA2.csv`. Extrair o Blender 4.5 LTS para `pipeline/blender/`.
2. `pipeline/blender.sh -b pipeline/source/z-anatomy.blend -P pipeline/export_systems.py`
   — aplica modificadores, converte vasos e nervos (curvas) em malha, decima
   malhas grandes e exporta um GLB por sistema e `src/data/structures.raw.json`.
   Com `-- --list`, só mostra em qual sistema cada coleção vai cair.
3. `npm run models:optimize` — quantização e compressão meshopt.
4. `npm run models:lod` — versões `.lod.glb` (25–33% dos triângulos) para os
   sistemas mais pesados.
5. `npm run anatomy:build` — gera os nomes em português
   (`src/data/anatomy.pt-BR.json`).

Os detalhes de cada etapa estão em [CLAUDE.md](CLAUDE.md).

## Decisões de arquitetura

**Um GLB por sistema, carregado sob demanda.** Só os sistemas ligados são
baixados. Os arquivos são versionados por hash (`models.manifest.json`) e ficam
no Cache Storage pelo service worker, então as visitas seguintes abrem em menos
de meio segundo.

**Identificador estável em cada malha.** O GLTFLoader reescreve nomes de nós
(espaços, pontos), então o vínculo entre malha e metadados é
`mesh.userData.anatomy_id`, que corresponde ao `id` em `structures.raw.json`.

**Renderização em lotes sem perder a seleção individual.** Cada sistema vira um
`BatchedMesh` por material, com visibilidade por instância. As malhas originais
continuam invisíveis como alvo do raycast (com BVH) e só são desenhadas sozinhas
quando precisam de material próprio (hover, seleção, transparência). Com os 13
sistemas ligados, as chamadas de desenho caíram de 4.291 para 25 por frame.

**LOD por estrutura.** Longe da câmera, cada estrutura usa a malha reduzida; o
hover usa sempre a malha completa, para o clique continuar preciso.

**Materiais definidos no app.** Os materiais exportados do Z-Anatomy não são
aproveitáveis (o exportador não traduz os shaders), então cada sistema recebe
um material próprio em `src/scene/materials.ts`. Na qualidade alta, a pele tem
um subsurface simulado por *wrap lighting*.

**Nomes em português a partir da TA2.** A tradução e o latim vêm da
Terminologia Anatomica 2 multilíngue. Como o português dela tem erros, cada
tradução é validada (termos de posição precisam aparecer), a grafia é
padronizada e os casos problemáticos são corrigidos à mão seguindo a
terminologia da SBA. O lado concorda em gênero e número ("Artéria radial
direita", "Linfonodos … direitos").

**Camada muscular calculada.** Superficial ou profundo vem de raios lançados
contra o corpo sem pele (`pipeline/muscle_layers.mjs`): o músculo que aparece
de fora é superficial.

**Estado da cena na URL.** Toda ação que muda a cena guarda o estado anterior
(para o desfazer) e é gravada no fragmento da URL, o que torna qualquer vista
compartilhável sem servidor.

## Desempenho

Medido num notebook com GPU integrada Intel UHD, build de produção, os 13
sistemas ligados:

| Medida | Antes | Depois |
|---|---|---|
| Chamadas de desenho por frame (baixa / alta) | 4.291 / 8.582 | 25 / 33 |
| Triângulos por frame | 10–20 M | 3,5 M |
| fps com hover (baixa / alta) | 36 / 10 | 83 / 50 |
| Primeira tela, preset padrão | 1,1–2,9 s | 0,7–1,7 s (0,47 s com cache) |

Relatório completo em
[pipeline/reports/desempenho.md](pipeline/reports/desempenho.md).

## Documentação

- [CLAUDE.md](CLAUDE.md) — visão técnica do projeto, pipeline e decisões
- [pipeline/reports/desempenho.md](pipeline/reports/desempenho.md) — medições
- [pipeline/reports/revisao-nomes.md](pipeline/reports/revisao-nomes.md) — nomes
  em português que precisam de revisão

## Limitações conhecidas e trabalho futuro

- O painel de informações mostra nome, latim, sistema e região, mas ainda não
  tem descrição de cada estrutura.
- 26 nomes base (51 estruturas) estão marcados para revisão; alguns vêm com
  nome ilegível no próprio Z-Anatomy.
- O coração não tem sistema próprio: fica junto das artérias, como no
  Z-Anatomy.
- As áreas de origem e inserção muscular do Z-Anatomy não são exportadas.
- Os testes visuais em navegador sem GPU servem para conferir a imagem, não o
  fps.

## Créditos e licença

Os modelos 3D em `public/models/` são derivados de:

- **Z-Anatomy** – The libre 3D atlas of anatomy – [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- **BodyParts3D** – The Database Center for Life Science – [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/)

Os modelos e qualquer derivado deles são distribuídos sob a mesma licença,
CC BY-SA 4.0. A atribuição também aparece na interface do app.

Os nomes em português e latim partem da Terminologia Anatomica 2 (TA2)
multilíngue, distribuída no repositório do Z-Anatomy.

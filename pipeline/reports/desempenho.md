# Relatório de desempenho — Fase 8

Medições em 30/10/2026 no build de produção (`vite preview`), Chrome headless com a **GPU real** via Direct3D 11.

- **Máquina:** notebook com Intel Core i5-11400H, 16 GB de RAM e **Intel UHD Graphics (GPU integrada)**, usada em todas as medições como o "notebook comum" do plano. A GTX 1650 dedicada da mesma máquina não foi usada.
- **Janela:** 1400×900, escala 1.
- **Cenário pesado:** os 13 sistemas ligados, na vista frontal do corpo inteiro.

## Resultado das metas

| Meta | Resultado |
|---|---|
| Primeira tela em menos de 4 s | ✅ 0,7–1,7 s (1ª visita); 0,47 s nas visitas seguintes |
| 60 fps no hover, qualidade baixa | ✅ em todos os cenários, inclusive os 13 sistemas (GPU 10–11 ms por frame; 83 fps medidos com hover) |
| 60 fps no hover, qualidade alta | ✅ nos presets (GPU 14–16 ms por frame, com resolução adaptativa). Com os 13 sistemas, a GPU integrada leva 18,6 ms por frame, e o app reduz a resolução e passa sozinho para a qualidade baixa. |

## Antes e depois

| Medida | Antes | Depois |
|---|---|---|
| Draw calls por frame (13 sistemas) | 4.291 (baixa) / 8.582 (alta) | **25 / 33** |
| Triângulos por frame (13 sistemas, vista inteira) | 10,0 M (baixa) / 20,0 M (alta) | **3,5 M / 3,5 M** |
| JavaScript por frame (13 sistemas, baixa) | 28 ms | 12 ms |
| GPU por frame, 13 sistemas, baixa | 15,7–28,9 ms | **10,0–10,6 ms** |
| GPU por frame, preset Músculos, baixa | 16,2–37,8 ms | **7,8–8,5 ms** |
| GPU por frame, presets na alta (Corpo inteiro / Músculos / Circulação) | não mensurável (cena desenhada duas vezes, ver abaixo) | 14,4–16,4 / 15,3–15,7 / 15,0–15,8 ms |
| fps com hover, 13 sistemas | 36 (baixa) / 10 (alta) | **83 / 50** |
| Raycast do hover (média) | 1,5–2,6 ms | 1,7–2,2 ms |
| Primeira tela, preset padrão, 1ª visita (local / 10 Mbps) | 1,1 / 1,6 s (baixa); 2,2 / 2,9 s (alta) | 0,7 / 0,9 s (baixa); 1,7 / 0,9 s (alta) |
| Primeira tela, preset padrão, visitas seguintes | — | **0,47 s** (modelos do Cache Storage) |
| Primeira tela, preset Músculos, 1ª / seguintes | 3,0 s / — | 2,1 s / 1,0–1,5 s |
| JavaScript inicial (gzip) | 461 KB | **364 KB** (+158 KB do pós-processamento, carregado só na alta) |

Algumas medidas aparecem como faixas porque variaram entre rodadas neste notebook (estado de energia e temperatura da GPU). O "antes" da qualidade baixa foi medido de novo com `?semlotes`, que reproduz o caminho antigo de renderização. O "antes" da qualidade alta é a linha de base medida no início da fase.

## O que foi feito, com o efeito medido

1. **Renderização em lotes** (`BatchedMesh`, um por sistema e material). Responde ao item "agrupar malhas estáticas do mesmo material" sem perder o hover individual: as malhas originais continuam como alvo do raycast e só são desenhadas sozinhas quando estão destacadas. Efeito: draw calls de 4.291 para 25 e JavaScript por frame de 28 para 12 ms. Os lados espelhados (escala negativa) precisaram de geometria espelhada no lote.
2. **Matrizes estáticas e sem recorte de visão por instância.** O three recalculava a cada frame as matrizes de cerca de 4.000 nós e reenviava a lista de instâncias para a GPU.
3. **Ordem de desenho de fora para dentro** (pele, músculos, esqueleto, vasos, órgãos), para a GPU descartar cedo os pixels escondidos.
4. **LOD** (`npm run models:lod`): versões com 25–33% dos triângulos para esqueleto, músculos, artérias, veias e nervos, trocadas por estrutura conforme a distância à câmera. Efeito: na qualidade baixa com 13 sistemas, a GPU caiu de 21,7 para 10,4 ms por frame.
5. **Bugs da qualidade alta encontrados na medição:**
   - O `GizmoHelper` redesenhava a cena inteira por cima do pós-processamento. A cena saía duas vezes e **o SSAO da Fase 7 nunca chegava à tela**.
   - O N8AO fazia duas renderizações extras por frame por causa do plano transparente da sombra de contato.
   - O `EffectComposer` tinha um normal pass desnecessário.
6. **Pós-processamento mais barato:** FXAA (cerca de 1 ms) no lugar de SMAA (7,6 ms). O N8AO ficou em meia resolução, com raio e intensidade menores, o que também eliminou manchas no peitoral e no abdome.
7. **Resolução adaptativa na qualidade alta:** se o fps cai, a resolução reduz até 0,75; se continua baixo, o app passa para a qualidade baixa. O monitor só mede depois que a cena termina de carregar.
8. **Cache Storage:** um service worker (`public/sw.js`) guarda os modelos, com o hash do conteúdo na URL (`src/data/models.manifest.json`).
9. **Pós-processamento carregado sob demanda:** sai do bundle inicial.
10. **BVH construído em segundo plano** depois da primeira tela, ou na hora se o hover precisar dele. Efeito: a primeira tela do preset Músculos caiu de 3,0 para 2,1 s.
11. **Pré-compilação de shaders** ao carregar cada sistema, para o primeiro hover não travar.

**Não se aplica — texturas em KTX2:** os modelos não têm texturas (os materiais do Z-Anatomy são substituídos no app), e as únicas texturas são geradas em tempo de execução: o fundo e o ambiente de luz.

## Limitações da medição

- As medições usam o Chrome headless. Os tempos de GPU (`EXT_disjoint_timer_query_webgl2`) são confiáveis. Já o fps reportado pelo headless oscila e não segue o limite de 60 Hz de forma consistente. Por isso os números de GPU são a base das conclusões acima. Vale confirmar a impressão de fluidez num navegador comum.
- Só a GPU integrada foi medida. Numa GPU dedicada a qualidade alta deve sobrar, mas isso não foi verificado.

## Como medir de novo

- `?perf` na URL expõe `window.__perf` (renderer, draw calls e triângulos por frame, tempos do hover) e `window.__monitor` (o que o monitor de desempenho viu).
- `?semlotes` desliga os lotes, para comparação A/B.
- `?perf&fx=ao,fxaa` escolhe quais efeitos de pós-processamento rodam.
- Para usar a GPU real no Chrome headless, inicie-o com `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`.

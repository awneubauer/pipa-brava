# Pipa Brava

Jogo de soltar pipa para celular (retrato) e desktop, feito com **Vite + TypeScript + Canvas 2D**, sem engine e sem assets externos: todo o visual é desenhado por código.

> O título é provisório e fica em uma única constante: `GAME_TITLE` em `src/config.ts`.

## Como rodar

```bash
npm install
npm run dev      # servidor local (abre na rede local com --host)
npm test         # testes (Vitest)
npm run build    # gera dist/
```

Modo debug: abra com `?debug=1` (fps, tensão, vento, posição, hitboxes).

## Controles

| Ação | Celular | Computador |
| --- | --- | --- |
| Girar a pipa (deslocar o cabresto) | arrastar no céu para os lados | mouse arrastando / A e D |
| Puxar linha / dar linha | arrastar no céu para baixo / para cima | mouse arrastando / Shift puxa |
| Puxão | arrasto rápido para baixo | espaço |
| Soltar linha | faixa da direita: arrastar para baixo | S / roda do mouse para baixo |
| Recolher | faixa da direita: arrastar para cima | W / roda do mouse para cima |

## Decisões técnicas (Fase 1)

- **Vista de frente ("janela de vento").** O jogador vê o céu como quem está na laje: o vento sopra das costas para dentro da tela. Internamente a física é 3D (x lateral, y altura, z profundidade a favor do vento) e a tela mostra x/y. Isso dá curvas, loops, mergulhos e zigue-zagues de verdade, como uma pipa de combate. Uma primeira versão em vista lateral foi testada e descartada: a pipa só andava num arco e não fazia loops.
- **Pipa = corpo rígido.** Posição/velocidade 3D, ângulo do bico (na tela) e velocidade angular. Forças de placa plana a partir do ângulo de ataque contra o vento relativo (`Cl = cl·sin2α`, `Cd = cd0 + cd90·sin²α`). A face fica presa ao cabresto, inclinada para o bico, e por isso a pipa "anda para onde o bico aponta" quando a linha está esticada.
- **Cabresto e rabiola.** Arrastar para o lado desloca o cabresto: o torque é braço × tração (com saturação), então a curva fica mais forte com a linha esticada. A rabiola soma arrasto, amortece o giro e endireita o bico para cima (o torque de endireitamento satura com o vento). Resultado: curva leve = a pipa segura um rumo inclinado; curva total = loop (~0,6 volta/s com 6 m/s de vento).
- **Linha.** Corrente de Verlet de 40 nós (3D), 6 iterações, peso leve, arrasto do vento e colisão com o chão. A tração na pipa vem do trecho elástico da mão: a **tensão normalizada (0..1)** é a força desse trecho (proporcional ao esticamento) dividida pela força de ruptura da linha.
- **Carretel.** Estoque limitado (arcade 1200 m, simulação 800 m). Soltar vai até 420 u/s (1 u = 0,1 m → 42 m/s), recolher até 300 u/s. A linha só sai quando a pipa puxa (a "pegada" depende da tração média), então soltar com a pipa puxando é bem mais rápido; o carretel tem inércia (~0,2 s). No arcade, se a tensão passa de 0,74 o carretel alivia sozinho.
- **Vento.** Vetor base por cenário + rajadas em camadas (fBm), mais forte e mais constante com a altura, mais turbulento perto de prédios/morros (zonas de turbulência). A seta do HUD é vista de cima (para cima = soprando para dentro da tela).
- **Passo fixo** de 1/60 s com 2 subpassos e render interpolado. A aerodinâmica é integrada de forma semi-implícita (a pipa é leve e o arrasto fica "rígido" em alta velocidade), o que mantém a simulação estável por horas.
- **Sem alocação no loop.** Vetores escalares, `Float32Array`, pools de partículas e textos, fontes e strings do HUD em cache. Camadas de cenário são pré-renderizadas em pedaços (≤ 2048 px) e desenhadas com `drawImage`.
- **Câmera** segue a pipa e a mão com suavização exponencial, ajusta o zoom para manter linha e adversários visíveis e treme em rajadas fortes.

## Decisões técnicas (Fase 2 — Simulação)

- **Corte.** A cada subpasso, as linhas são testadas segmento × segmento (com caixas envolventes para descartar rápido). Cada cruzamento vira um registro persistente (casado por proximidade entre passos) que acumula o dano das duas linhas:
  `dano = k × afiação do outro × S(deslizamento) × √(menor tensão) × concentração × dt / resistência`.
  - **Deslizamento** = velocidade relativa entre os *materiais* das duas linhas no ponto de contato; inclui a linha saindo/entrando no carretel (o material perto da mão corre na velocidade do carretel). Por isso **soltar linha** e **puxar com força** cortam: as duas técnicas reais funcionam.
  - **Concentração** (0,7 a 1,3): quem faz a própria linha correr pelo cruzamento espalha o desgaste e concentra no outro. Linhas paradas = 1.
  - **Risco**: soltar demais deixa a linha frouxa (sem tensão não corta) e a pipa cai na janela; puxar com força leva a tensão ao vermelho (1,1 s no vermelho ou um pico sustentado arrebenta a linha).
  - S(v) satura (`2,5·tanh(v/1,5)`) e `k = 0,26`: um duelo entre linhas iguais resolve em 1,5–4 s de deslizamento ativo (teste `tests/cut.test.ts`). Duelos completos contra a IA ficam entre ~8 e 25 s.
  - Ao passar de 1, a linha rompe no nó do cruzamento; sem contato o dano esfria devagar depois de 1 s.
- **Tipos de linha**: Comum (afiação 1,0), Afiada (1,35) e Super afiada (1,75). Os adversários escalam com a dificuldade; o jogador começa na Comum e libera a Afiada vencendo na Média e a Super afiada vencendo na Brava.
- **IA** (`src/ai/ai.ts`): máquina de estados patrulhar → aproximar (posição acima e do lado da própria mão) → engajar (atravessa a linha do jogador e alterna soltar com a linha esticada / puxar) → fugir (dano próprio > 0,6) → recompor. A dificuldade muda tempo de reação, agressividade e erro de pilotagem. A IA respeita a própria tensão (histerese), mira dentro do alcance da linha e mantém uma altura segura acima dos perigos.
- **Feedback de corte**: faíscas no cruzamento, brilho crescente na linha danificada, câmera lenta de 0,6 s a 0,3×, tremor, vibração, flash e textos "CORTOU!" / "FOI CORTADO!". A pipa cortada perde a tensão, vira com o vento, balança e desce até o chão.
- **Derrota**: linha cortada, arrebentada, pipa queimada no fio, rasgada, ou estoque zerado com a pipa presa (enroscada ou cruzada) por 2 s.

## Decisões técnicas (Fase 3 — cenários, perigos, personalização)

- **Cenários** (`src/scenes/`): cada um tem uma parte física (`world()`: chão/telhados, vento, zonas de turbulência, perigos, mãos dos adversários) separada da arte (`art()`), para os testes rodarem sem navegador.
  - **Favela no morro**: casas de tijolo e reboco colorido empilhadas na encosta, lajes com grade, escadaria, caixas d'água azuis e pretas, parabólicas, antenas, roupa no varal, emaranhado de fios e pipas ao fundo. O jogador solta da laje. Vento turbulento e com rajadas (zonas de turbulência sobre o morro).
  - **Campo de várzea**: gramado falhado, traves, muro com grafite abstrato, arquibancada de concreto, casas baixas, mangueira e silhuetas de crianças jogando bola. Vento aberto e constante.
  - **Centro de São Paulo**: Copan com a fachada ondulada, Edifício Itália, Ponte Estaiada (mastro em X com estais), MASP (caixa suspensa com os pórticos vermelhos e o vão livre) e a Paulista com postes e fiação. Prédios próximos geram vento canalizado e turbulento.
  - **Rio de Janeiro**: calçadão de Copacabana com as ondas pretas e brancas, areia, mar, Pão de Açúcar com o bondinho e os cabos e o Cristo no Corcovado. Brisa forte e estável.
- **Camadas**: cada camada tem fator de paralaxe e escala própria (coisas distantes ficam menores) e é pré-renderizada em pedaços. As silhuetas são genéricas: sem logos, marcas ou pessoas reais.
- **Perigos** (só letais na Simulação): fios de luz (encostar = queima e perde a linha), postes, antenas, caixas d'água, árvores e prédios (encostar devagar = enrosca; dá para soltar mantendo a linha puxada por 3 s; bater acima de ~10 m/s = rasga). No Arcade tudo só quica com um balão "Eita!".
- **Personalização**: 6 modelos (raia, pião, papagaio, estrela, coração e quadrada) e 8 cores para a pipa e para a rabiola, com prévia. Salvo no `localStorage`.
- **Tutorial** na primeira partida, em 3 passos (puxar, soltar carretel, cortar) com mãozinha animada; pode ser pulado.
- **Ajustes de física desta fase**: rabiola passou a ter arrasto próprio (freia a pipa em loops), linha um pouco mais elástica (rigidez 70 N/m) para trancos menos secos, e a linha só arrebenta por tensão sustentada (1,5 s no vermelho) ou pico muito alto (1,6× a ruptura nominal por ~60 ms).

## Testes

- `tests/flight.test.ts` — (a) voo estável com vento de 3 a 9 m/s, voo com rajadas, loop e puxão.
- `tests/longrun.test.ts` — (b) 10 minutos simulados com comandos aleatórios sem NaN nem explosão da linha.
- `tests/reel.test.ts` — (d) estoque do carretel nunca negativo nem acima do limite.
- `tests/maneuvers.test.ts` — manobras do arcade detectadas.
- `tests/scenes.test.ts` — os 4 cenários rodam 60 s com 3 adversários sem NaN; fio queima na Simulação e só quica no Arcade.
- `tests/cut.test.ts` — (c) cruzamento entre linhas iguais resolve em 1,5–4 s de deslizamento (lateral, puxando e soltando; 2–4 m/s; tensões 0,4–0,6) e partida completa contra a IA.

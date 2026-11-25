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

## Testes

- `tests/flight.test.ts` — (a) voo estável com vento de 3 a 9 m/s, voo com rajadas, loop e puxão.
- `tests/longrun.test.ts` — (b) 10 minutos simulados com comandos aleatórios sem NaN nem explosão da linha.
- `tests/reel.test.ts` — (d) estoque do carretel nunca negativo nem acima do limite.
- `tests/maneuvers.test.ts` — manobras do arcade detectadas.

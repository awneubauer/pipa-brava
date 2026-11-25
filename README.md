# Pipa Brava

Jogo de soltar pipa para celular (retrato, tela cheia) e desktop, feito com **Vite + TypeScript + Canvas 2D**, sem engine de jogo e sem assets externos: todo o visual é desenhado por código e todo o áudio é sintetizado com Web Audio. Tudo em português do Brasil.

> O título é provisório e fica em uma única constante: `GAME_TITLE` em `src/config.ts` (o `<title>` e o manifest do PWA são gerados a partir dela).

- **Batalha no Céu (modo principal)**: 30 fases curtas (30–90 s), cada uma com um objetivo claro (cortar pipas, cortar em tempo, sobreviver, fazer combo, derrubar o chefão) e 1–3 estrelas. Cortes rendem pontos com combo e moedas; as moedas compram skins na Loja. Há também o modo **Infinito**, em ondas cada vez mais bravas, valendo recorde.
- **Controles nos cantos**: joystick no polegar esquerdo para pilotar e botão PUXA!/CORTA! no direito; o carretel é automático e o céu fica livre para ver a briga.
- **Modo livre**: Arcade (manobras, sem perigo) e Simulação clássica (1–3 adversários, perigos letais, tensão que arrebenta). O controle Pro (cabresto + lata) pode ser ligado no menu.
- **4 cenários**: Favela no morro, Campo de várzea, Centro de São Paulo e Rio de Janeiro, cada um com vento e perigos próprios.

## Como rodar

```bash
npm install
npm run dev      # servidor local; com --host já abre na rede local (para testar no celular)
npm test         # testes (Vitest)
npm run build    # checa tipos e gera dist/
npm run preview  # serve o dist/ (também com --host)
```

Modo debug: abra com `?debug=1` — fps, resolução, tempo de física e de render, tensão, vento, posição, dano e taxa de dano por cruzamento, estado de cada IA e hitboxes dos perigos.

## Publicar na Vercel

1. Na Vercel, **Add New → Project** e importe este repositório do GitHub.
2. Framework: **Vite** (detectado automaticamente). Build: `npm run build`. Saída: `dist`.
3. Não precisa de variáveis de ambiente. Clique em **Deploy**.

Cada push num branch gera um *Preview Deployment* com URL própria — é por ela que dá para testar cada fase no celular. O deploy de *Production* usa o branch `main`: enquanto o jogo não for mesclado na `main`, o link de produção mostra 404 e o jogo fica no link do preview do branch (aba **Deployments** do projeto).

## Testar no celular

- **Pelo preview da Vercel**: abra a URL do deploy no navegador do celular, na vertical. Para jogar em tela cheia, use "Adicionar à tela inicial" (Android: menu do Chrome → *Instalar app*; iPhone: Compartilhar → *Adicionar à Tela de Início*).
- **Na rede local**: `npm run dev` e abra no celular o endereço `http://IP-do-computador:5173` que o Vite mostra (mesmo Wi-Fi).
- O som só começa depois do primeiro toque (regra dos navegadores). A vibração depende do aparelho (no iPhone o navegador não vibra).

## Controles

| Ação | Celular | Computador |
| --- | --- | --- |
| Girar a pipa (deslocar o cabresto) | arrastar no céu para os lados | mouse arrastando / A e D |
| Soltar linha | lata (faixa da direita): deslizar para baixo; largar no embalo deixa a lata girando | S / roda do mouse para baixo |
| Recolher = puxar (a pipa ganha força e sobe) | lata: deslizar para cima | W / roda do mouse para cima |
| Segurar a linha | dedo parado na lata | — |
| Puxão (pico de tensão por 0,25 s) | deslizada rápida para cima na lata ou arrasto rápido para baixo no céu | espaço |
| Pausa / som | botões no canto superior direito | Esc ou P / botão de som |

A pipa anda para onde o bico aponta; arrastar mais para o lado gira mais rápido (curva total = loop em ~1,3 s). Para subir: solte um pouco de linha, segure e deixe a pipa subir de novo. Soltar demais deixa a linha frouxa e a pipa afunda até você recolher.

## Estrutura

```
src/config.ts            constantes de ajuste (título, física, linhas, dificuldades)
src/main.ts              montagem: jogo, menus, tutorial, PWA
src/game/                loop (passo fixo), input, câmera, estado/salvamento, manobras, regras da simulação, orquestração
src/physics/             vento, pipa, linha, carretel, corte, perigos, "flyer" (pipa+linha+mão), mundo
src/ai/                  IA com máquina de estados
src/scenes/              favela, varzea, centroSP, rio (+ ajudantes de desenho)
src/render/              renderizador, desenho das pipas, partículas e textos
src/ui/                  menu, HUD, tutorial
src/audio/               áudio sintetizado
scripts/icons.ts         ícones do PWA gerados por código (rasterizador + PNG próprios)
tests/                   testes Vitest
```

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

## Decisões técnicas (Fase 4 — áudio, PWA, desempenho)

- **Áudio sintetizado** (`src/audio/audio.ts`), criado no primeiro toque: vento (ruído filtrado que acompanha o vento e a velocidade da pipa), zumbido da linha (osciladores cuja altura sobe com a tensão), catraca do carretel (ruído modulado por LFO proporcional à velocidade da linha), bipe agudo de alerta na tensão vermelha, estalo seco de corte, choque elétrico, rasgo, raspão de linhas, jingles de manobra (sobem com o combo), vitória e derrota. Os sons contínuos usam nós persistentes que só têm parâmetros ajustados a cada quadro; os pontuais criam nós curtos só no evento. Botão de silenciar no HUD, na pausa e no menu (salvo).
- **PWA**: `manifest.webmanifest`, ícones PNG (192, 512, maskable, apple-touch) e SVG **gerados por código no build** por um plugin do Vite (rasterizador de polígonos com supersampling + codificador PNG com o zlib do Node, sem dependências). Service worker simples (rede primeiro para a página, cache para os arquivos com hash) para abrir offline e "adicionar à tela inicial".
- **Desempenho**: física ~0,5 ms e render ~2 ms por quadro (medido no Chromium com 3 adversários). Resolução adaptativa: se o aparelho ficar abaixo de ~48 fps por 3 s, o `devicePixelRatio` usado cai (2 → 1,6 → 1,3 → 1). Nada de objetos, arrays ou closures criados no loop (o perfil de heap só mostra o empacotamento interno de números do V8, ~45 KB/s, coletado nas GCs menores).
- **Balanceamento**: duelos contra a IA de ~8 a 25 s; a Fácil perde para quem só segura a pipa, Média e Brava atacam de verdade. Loops contínuos na zona de força levam a tensão ao vermelho — na Simulação isso arrebenta a linha em alguns segundos (no Arcade o carretel alivia sozinho).
- **Salvamento** só em `localStorage` (`pipabrava.v1`): configurações, pipa, linhas liberadas, tutorial visto e recorde por modo e cenário.

## Testes

- `tests/flight.test.ts` — (a) voo estável com vento de 3 a 9 m/s, voo com rajadas, loop e puxão.
- `tests/longrun.test.ts` — (b) 10 minutos simulados com comandos aleatórios sem NaN nem explosão da linha.
- `tests/reel.test.ts` — (d) estoque do carretel nunca negativo nem acima do limite.
- `tests/maneuvers.test.ts` — manobras do arcade detectadas.
- `tests/battle.test.ts` — 30 fases com 4 chefões, regras de estrelas e liberação, inimigo que ronda antes de atacar, fase 2 em menos de 60 s acertando o timing, quem não aperta ou aperta sem parar perde o duelo, controle fácil alcança o alvo em menos de 3 s.
- `tests/scenes.test.ts` — os 4 cenários rodam 60 s com 3 adversários sem NaN; fio queima na Simulação e só quica no Arcade.
- `tests/cut.test.ts` — (c) cruzamento entre linhas iguais resolve em 1,5–4 s de deslizamento (lateral, puxando e soltando; 2–4 m/s; tensões 0,4–0,6) e partida completa contra a IA.

## Gamificação (Batalha no Céu)

- **Loop curto**: cada fase é rápida e termina com estrelas, moedas e um botão grande de **Próxima fase**. Se perder, a tela diz quanto faltou ("Faltou só 1 pipa!") para dar vontade de tentar de novo.
- **Estrelas**: 1 por cumprir o objetivo, +1 por rapidez (ou, em "sobreviva", por cortar 2 pipas), +1 por terminar com a linha quase inteira. Uma estrela libera a próxima fase. A cada 10 estrelas o multiplicador de pontos sobe.
- **Curva de dificuldade** (`src/game/levels.ts`): 30 fases nos 4 cenários (Várzea 1–8, Favela 9–16, Centro 17–24, Rio 25–30). A força da IA, a afiação das linhas inimigas e quantas pipas voam juntas sobem aos poucos; o fim de cada cenário tem o chefão **Rei do Céu** (maior, mais resistente e mais esperto). A fase 1 é quase impossível de perder.
- **Moedas e Loja** (`src/game/skins.ts`): moedas por corte (mais em combo), bônus por estrela nova e por fase completada pela primeira vez. Dez skins, até as especiais com rabiola arco-íris, brilho ou fogo.
- **Duelo de timing** (`src/game/battle.ts`): quando as linhas cruzam, elas enganchadas e as pipas ficam presas. No alto da tela aparece uma barra com um marcador indo e voltando e uma zona verde: apertar **CORTA!** com o marcador na zona corta um pedaço da linha do inimigo (no centro, **PERFEITO** = corte maior). Errar faz você levar o corte, e enrolar também desgasta a sua linha aos poucos. Apertar sem parar só erra. O duelo fica travado na pipa enganchada até alguém ser cortado (ou as linhas se soltarem por 0,7 s), mesmo com outras pipas cruzando. **Quem atravessa leva vantagem**: se você chegou na linha dele (mais rápido, ou com ele só rondando), já tira um pedaço da linha dele e sua zona verde fica 20% maior; se ele te pegou, você perde um pedaço e a zona fica menor. Pegar **por cima** ou **de surpresa** também alarga a zona. A zona verde fica **sempre no centro** da barra; a dificuldade vem da **velocidade do marcador**, que cresce fase a fase (e é maior no chefão). Só engancha quando alguém está atacando (o inimigo vindo ou você numa embicada/arrancada): pipas que só estão rondando não puxam duelo sem querer, e a mesma pipa só pode enganchar de novo 1,5 s depois de as linhas se soltarem.
- **Comandos de carretel (botão PUXA!)**: **1 toque = puxada** (a pipa dispara para onde o bico aponta e sobe); **2 toques rápidos = embicada** (ataque: mergulha atravessando a linha do inimigo mais próximo e chega com vantagem, em ~0,7 s); **segurar = dar linha** (a pipa recua para longe de quem está vindo — a fuga). No duelo, cada toque vira CORTA!. No teclado: espaço (2× = embicada), E = embicada, Shift = dar linha.
- **Ritmo dos ataques**: os inimigos chegam e **rondam** a sua pipa por alguns segundos (menos nas fases avançadas). Só **um ataca por vez**, avisado com um ⚠ piscando sobre a pipa; enquanto vem, ele é mais lento, então dá para fugir ou atacar primeiro quem está rondando.
- **Cerol (Loja)**: Comum ×1, Caseiro ×1,4, Vidro ×1,9, Chilena ×2,5 e Dourada ×3,2. Cerol melhor alarga a zona verde e corta mais por acerto (menos acertos por pipa).
- **Controle fácil** (`src/game/autopilot.ts`, `src/game/input.ts`): **joystick flutuante** onde o polegar encosta (canto inferior esquerdo) — a pipa voa na direção empurrada, com uma ajuda de pilotagem (até 30 m/s, com inércia) e o carretel se ajustando sozinho — e o botão **PUXA!** no canto inferior direito (arrancada fora do duelo, **CORTA!** no duelo). O meio da tela fica livre; na Batalha a câmera reserva a faixa de baixo para os polegares.
- **Salvamento**: moedas, estrelas, skins e recorde do Infinito ficam no `localStorage`.

## Revisão de jogabilidade (carretel e manobra)

Depois do primeiro teste no celular o controle foi refeito para ficar mais próximo do real:

- **Carretel como lata.** A linha corre na velocidade do dedo (0,09 m por pixel, até 42 m/s). Largando no embalo, a lata continua girando e a pipa puxando arrasta mais linha (o giro livre perde força em ~0,8 s). Dedo parado na lata segura a linha. Antes era um joystick que só soltava com a pipa puxando, e parecia travado.
- **Soltar sem a pipa puxar dá folga.** A linha sobra (dá para ver a barriga), a pipa perde força, vai para trás e desce devagar com a rabiola, até a linha esticar de novo. A folga máxima é de ~8% + 6 m.
- **Recolher é puxar.** Recolher não trava mais com a linha esticada: puxa a pipa, que ganha força e sobe. O carretel só segura quando a tensão chega perto do vermelho (~0,8).
- **Curva por velocidade de giro.** O deslocamento do dedo pede uma velocidade de giro (até 5 rad/s) que o cabresto persegue, com menos autoridade quando quase não passa vento pela pipa. A curva fica previsível, sem depender tanto da tensão.
- **Arrastar no céu na vertical não puxa mais a linha.** Puxar agora é na lata; o arrasto rápido para baixo no céu continua dando o puxão.

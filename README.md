# matcards · Aprender Inglês

PWA (Progressive Web App) para aprender inglês com **repetição espaçada** (SM-2, algoritmo do Anki).
Roda 100% offline depois do primeiro carregamento. Funciona no iPhone via "Adicionar à Tela de Início".

## Funcionalidades

- 🎯 **Teste de nivelamento LexTALE** (~5 min) — classifica em A2/B1/B2/C1
- 🧠 **Algoritmo SM-2** com learning steps (estilo Anki)
- 📚 **3 decks pré-carregados**:
  - A2 — Vocabulário básico (60 cards)
  - B1 — Phrasal verbs & collocations (72 cards)
  - B2 — Idioms & advanced vocabulary (72 cards)
- 🔊 **Text-to-speech** (Web Speech API) — pronúncia nativa
- 🗂️ **4 tipos de card**: básico, reverso, cloze (lacuna), listening (áudio)
- 📊 **Estatísticas**: streak, retenção, heatmap de atividade
- 💾 **Import/Export JSON** — backup completo manual
- ☁️ **Sync na nuvem** (Firebase) — anônimo automático, cross-device via Google Sign-In
- 📱 **PWA**: ícone na tela inicial, fullscreen, 100% offline

## Como rodar localmente

### 1. Servir os arquivos

```bash
# Python (já instalado no Windows):
python -m http.server 8000

# Ou com Node:
npx serve -p 8000
```

### 2. Acessar no PC (para testes completos)
Abra `http://localhost:8000` — todas as features funcionam (incluindo Service Worker).

### 3. Acessar do iPhone
Garanta que o iPhone está na **mesma rede WiFi** que o PC.
Abra no Safari: `http://192.168.68.147:8000` (substitua pelo IPv4 do seu PC — rode `ipconfig` pra ver).

**Limitação:** Service Worker e cache offline **só funcionam em HTTPS ou localhost**. Em HTTP via IP local, a UI funciona mas o app não fica offline. Veja a próxima seção.

### 4. Tornar verdadeiramente offline no iPhone (HTTPS)

Para PWA completa com offline real, deploye o folder em um serviço com HTTPS gratuito:

- **Netlify Drop** (mais fácil) — vá em https://app.netlify.com/drop e arraste a pasta inteira. Gera URL HTTPS na hora, sem cadastro inicial.
- **Vercel** (`npx vercel`) — deploy via CLI.
- **GitHub Pages** — push pra um repo e ative Pages.
- **ngrok** (`ngrok http 8000`) — tunela seu localhost via HTTPS, útil para testes rápidos.

Depois de ter a URL HTTPS, abra no Safari iPhone → botão Compartilhar (⬆️) → **Adicionar à Tela de Início**.

## Gerar ícones PNG

Os ícones PNG (180/192/512px) não vão no repo. Para gerá-los:

1. Abra `http://localhost:8000/tools/make-icons.html` no seu navegador.
2. Clique em cada botão "⬇️ Baixar".
3. Salve os 4 arquivos PNG dentro da pasta `icons/`.

Sem os PNGs o app funciona, mas o ícone na tela inicial do iPhone fica em branco (Safari usa um screenshot da página em vez disso).

## Estrutura

```
matcards/
├── index.html              # Entry point
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service Worker (cache + offline)
├── css/styles.css          # Todos os estilos
├── icons/
│   ├── icon.svg            # Ícone fonte (vetorial)
│   └── icon-*.png          # Gerados via tools/make-icons.html
├── js/
│   ├── app.js              # Entry + router por hash
│   ├── db.js               # Wrapper IndexedDB + importDeckFromJSON
│   ├── srs.js              # Algoritmo SM-2
│   ├── lextale.js          # Lógica do placement test
│   ├── tts.js              # Wrapper Web Speech API
│   ├── stats.js            # Cálculos de estatísticas
│   ├── importExport.js     # Backup JSON
│   ├── utils.js            # Helpers (uuid, dates, el())
│   └── views/              # Uma view por rota
├── data/
│   ├── lextale-items.json  # 60 palavras (40 reais + 20 inventadas)
│   ├── deck-a2.json
│   ├── deck-b1.json
│   └── deck-b2.json
└── tools/
    └── make-icons.html     # Gerador de PNGs do ícone
```

## ☁️ Sync na nuvem (Firebase)

iOS pode apagar storage de PWAs após ~7 dias de inatividade. Pra resolver isso, o app usa **Firebase Anonymous Auth + Firestore** — cada usuário ganha automaticamente uma conta anônima invisível e seus dados sincronizam com a nuvem em background, sem o usuário precisar fazer nada.

**Vantagens:**
- Zero setup pro usuário final (anônimo automático)
- Auto-sync após cada sessão de estudo
- Cross-device opcional via "Sign in with Google" (vincula conta anônima)
- Free tier folgado: 50k reads/dia, 20k writes/dia, 1 GB storage
- Privacidade: dados em servidor Google, isolados por usuário via Security Rules

### Setup ÚNICO do administrador (~5 min, projeto Firebase próprio)

> Isso aqui é pra **quem está deployando o app** — usuário final não faz nada disso.

1. **Cria um projeto Firebase**:
   - https://console.firebase.google.com → "Add project"
   - Nome qualquer (ex: `matcards`)
   - Pode desabilitar Analytics
   - Create

2. **Adiciona um Web app** (ícone `</>`):
   - Nickname: `matcards-web`
   - NÃO ativa Hosting (usaremos GitHub Pages / Netlify)
   - Copia o objeto `firebaseConfig`
   - Cola em `js/firebase.js` substituindo `FIREBASE_CONFIG`

3. **Habilita Auth providers**:
   - Authentication → Sign-in method
   - Anonymous → Enable
   - Google → Enable (escolhe email de suporte)
   - Settings → Authorized domains → adiciona seu domínio Netlify/GitHub Pages quando tiver

4. **Cria Firestore Database**:
   - Production mode
   - Região: `southamerica-east1` (São Paulo)

5. **Configura Security Rules**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

Pronto. Quota free tier (50k reads/dia, 20k writes/dia) é suficiente pra centenas de usuários estudando regularmente.

### Como funciona pro usuário final

1. Abre o app pela primeira vez → conta anônima criada invisivelmente
2. Faz o teste, estuda → tudo sincroniza automaticamente em background
3. Trocar de iPhone? Em Configurações → Sincronização → "🔗 Vincular Google" → faz login com Google → conta anônima vira permanente
4. Outro iPhone: instala o app → Configurações → Sincronização → "🔗 Vincular Google" → faz o mesmo login → app mostra "Esse Google já está vinculado, quer restaurar os dados de lá?" → Sim → tudo volta

### Custo

Free tier do Firebase Spark:
- 50.000 reads/dia
- 20.000 writes/dia
- 1 GB de storage
- 10 GB transferência/mês

Pra contexto: 1 sessão de estudo = ~3 writes. Mesmo com 100 amigos usando 5 vezes/dia, fica em ~1.500 writes/dia = bem dentro do free tier.

### Privacidade

- Cada usuário só consegue ler/escrever os próprios dados (garantido pelas Rules)
- Mesmo o admin do Firebase pode ver os documentos no console, mas o conteúdo é o backup do user (decks + reviews) — nada sensível tipo senha
- Dados não saem de servidores do Google (geolocalização configurada acima)

---

## Como usar (fluxo do usuário)

1. **Primeiro acesso** → faça o **Teste de Nivelamento** (~5 min). Ele determina seu nível CEFR.
2. **Importar deck** → na tela de Decks, clique em "Importar" no deck recomendado.
3. **Estudar** → aperte "Estudar agora" na home. O app traz cards na ordem: cards atrasados → revisão → novos.
4. **Avaliar cada card**:
   - **Again** (1) — não lembrei
   - **Hard** (2) — lembrei com muito esforço
   - **Good** (3) — lembrei (default — espaço/enter)
   - **Easy** (4) — lembrei sem esforço
5. O app **agenda automaticamente** quando você vê o card de novo (intervalo cresce com cada acerto).
6. **Configurações** → ajuste limite de cards novos por dia (default: 20), velocidade da voz, etc.
7. **Backup** periodicamente em Configurações → Exportar.

## Atalhos de teclado (no review)

- **Espaço / Enter** — revelar resposta / avaliar como Good
- **1** — Again
- **2** — Hard
- **3** — Good
- **4** — Easy

## Limitações conhecidas

- Web Speech API tem qualidade variável dependendo do dispositivo. Vozes da Apple são excelentes; em Windows são ok mas robóticas.
- Service Worker exige HTTPS (ou localhost). Em HTTP via IP local, offline não funciona.
- IndexedDB pode ser limpo pelo iOS se o espaço de armazenamento ficar baixo. Faça backup periódico via export JSON.

## Próximas evoluções (não implementadas)

- Cards com imagem (precisaria de storage de Blobs)
- FSRS no lugar de SM-2 (mais inteligente, exige histórico)
- Importar decks no formato `.apkg` do Anki
- Editor de cards customizados dentro do app

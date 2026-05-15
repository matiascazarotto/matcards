# matcards

Spaced repetition para inglês. Vanilla PWA — HTML/CSS/JS, sem build, sem dependências runtime.

Implementa SM-2 (Anki, 1987) para SRS, LexTALE (Lemhöfer & Broersma 2012) para placement CEFR, e Firestore para sync entre dispositivos. Roda offline após primeiro carregamento, instala como app via Safari → "Adicionar à Tela de Início".

## Stack

- **HTML + CSS + JS** (ES modules, zero build)
- **IndexedDB** para persistência local
- **Service Worker** para cache offline + app shell
- **Web Speech API** para TTS (pronúncia nativa via voz do sistema)
- **Firebase Anonymous Auth + Firestore** para sync na nuvem
- **Web App Manifest** para instalação

## Arquitetura

```
matcards/
├── index.html
├── manifest.webmanifest
├── sw.js                      Service Worker
├── firebase.json              Hosting/Firestore config
├── firestore.rules            Security rules
├── .firebaserc                Project ID
├── css/styles.css
├── icons/                     SVG fonte + PNGs gerados
├── js/
│   ├── app.js                 Entry + router por hash
│   ├── db.js                  IndexedDB wrapper + importDeckFromJSON
│   ├── srs.js                 SM-2 com learning steps
│   ├── lextale.js             Cálculo de score CEFR
│   ├── tts.js                 Wrapper Web Speech API
│   ├── stats.js               Streak, retenção, heatmap
│   ├── importExport.js        Backup JSON
│   ├── firebase.js            Init + Auth + Firestore wrapper
│   ├── cloud-sync.js          Push/pull para Firestore
│   ├── utils.js               uuid, dates, DOM helpers
│   └── views/                 home, placement, review, decks, stats, settings
├── data/
│   ├── lextale-items.json     60 palavras (40 reais + 20 inventadas)
│   ├── deck-a2.json           60 cards
│   ├── deck-b1.json           72 cards
│   └── deck-b2.json           72 cards
└── tools/
    └── make-icons.html        Gerador local de PNGs do ícone
```

## Algoritmo SRS

SM-2 com learning steps estilo Anki em `js/srs.js`:

- Cards `new` → `learning` (steps de 1 min, 10 min) → `review` (intervalos crescentes)
- Quality: `0` Again, `3` Hard, `4` Good, `5` Easy
- Ease factor inicial 2.5, mínimo 1.3
- Intervalos: `interval × ease` (Good), `interval × 1.2` (Hard), `interval × ease × 1.3` (Easy)
- Lapses voltam o card pra `learning` com ease reduzido em 0.2

FSRS (algoritmo mais moderno) foi considerado mas exige ~100+ reviews históricas para calibrar — fica como evolução futura.

## Placement Test

LexTALE adaptado em `data/lextale-items.json`:

- 60 items: 40 palavras reais + 20 pseudo-palavras
- Usuário marca "Conheço" ou "Não conheço"
- Score: `(realCorrect/40 + fakeCorrect/20) × 50` (corrige chutes via pseudo-palavras)
- Mapeamento CEFR: <40% A2 · 40–59% B1 · 60–79% B2 · 80%+ C1

## Conteúdo dos decks

204 cards pré-curados em 3 decks CEFR:

- **A2** (60 cards) — vocabulário de alta frequência, verbos básicos, frases comuns, gramática elementar
- **B1** (72 cards) — 30 phrasal verbs essenciais, 25 collocations, 20 cloze (present perfect, conditionals, modals), 17 vocabulário mid-freq, 2 listening
- **B2** (72 cards) — 25 phrasal verbs avançados, 20 idioms, 15 vocabulário acadêmico, 10 cloze (subjuntivo, inversão, causativo), 2 listening

Tipos de card: `basic`, `reverse`, `cloze`, `listening`.

## Setup local

```bash
python -m http.server 8000
# ou
npx serve -p 8000
```

Acesse `http://localhost:8000`. Service Worker registra em localhost; em HTTP via IP local (iPhone na mesma rede), UI funciona mas SW não registra (requer HTTPS).

## Deploy

GitHub Pages servindo a partir do branch `main` na raiz. URL: `https://matiascazarotto.github.io/matcards/`.

Para Firebase Hosting alternativo: `firebase deploy --only hosting`.

## Setup Firebase (administrador do app, ~5 min)

1. Criar projeto em https://console.firebase.google.com
2. Add Web app → copiar `firebaseConfig` → substituir em `js/firebase.js`
3. Authentication → Sign-in method → habilitar **Anonymous**
4. Authentication → Settings → Authorized domains → adicionar domínio de produção (`matiascazarotto.github.io`)
5. Firestore → Create database (production mode, região `southamerica-east1`)
6. Firestore rules: deploy via `firebase deploy --only firestore:rules` (rules em `firestore.rules`)

API key do Firebase Web SDK é pública por design ([ref](https://firebase.google.com/docs/projects/api-keys)). Segurança vem de Rules + Authorized domains. Para mitigar abuso de quota: restringir a API key em Google Cloud Console (HTTP referrers + API restrictions).

## Sync na nuvem

Auto-sync após cada sessão concluída. Cada instalação ganha um UID Firebase anônimo e grava o backup em `users/{uid}/backup/current` como documento único. Last-writer-wins entre escritas concorrentes do mesmo UID.

Google linking foi removido: `signInWithPopup` não funciona em PWA standalone no iOS (Safari bloqueia popups que não saem direto de um click handler), e implementar `signInWithRedirect` introduz uma navegação para fora da PWA que quebra a experiência. **Cross-device é via Export/Import manual** — JSON salvo no iCloud Drive ou enviado entre devices.

Sync anônimo continua útil como backup automático por instalação (recovery se IndexedDB for limpo mas UID sobreviver).

Quota free tier Firebase Spark: 50k reads/dia, 20k writes/dia, 1 GB storage.

## Atalhos de teclado (review)

- `Espaço` / `Enter` — revelar resposta · avaliar como Good quando já revelado
- `1` Again · `2` Hard · `3` Good · `4` Easy

## Limitações

- Web Speech API: qualidade da voz varia por sistema. iOS/macOS têm vozes nativas de qualidade; Windows são serviçáveis.
- Service Worker exige HTTPS ou localhost.
- IndexedDB pode ser limpo pelo iOS sob pressão de armazenamento ou após ~7 dias de inatividade. Mitigado por sync na nuvem.
- Cards do tipo `image` não implementados (exigem storage de Blobs em IndexedDB).
- Conflito de sync em estudo simultâneo em múltiplos devices: last-writer-wins (raro na prática).

## Roadmap

- FSRS no lugar de SM-2 (após coletar histórico suficiente)
- Editor de cards customizados no app
- Importação de decks no formato Anki `.apkg`
- Image cards com storage local de Blobs
- Real-time listeners para sync sem race conditions

## Referências

- Wozniak, P. (1990). *SM-2 algorithm.* SuperMemo Method.
- Lemhöfer, K., & Broersma, M. (2012). *Introducing LexTALE: A quick and valid Lexical Test for Advanced Learners of English.* Behavior Research Methods, 44(2), 325–343.
- Ebbinghaus, H. (1885). *Über das Gedächtnis* (forgetting curve).

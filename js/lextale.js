/**
 * LexTALE-style placement test.
 * Score formula (Lemhöfer & Broersma 2012, adapted):
 *   realPct = realCorrect / realTotal × 100
 *   fakePct = fakeCorrect / fakeTotal × 100   (correct = marked as "don't know")
 *   final  = (realPct + fakePct) / 2
 *
 * CEFR mapping:
 *   < 40%  → A2
 *   40-59% → B1
 *   60-79% → B2
 *   80%+   → C1
 */

export function scoreToLevel(score) {
  if (score < 40) return 'a2';
  if (score < 60) return 'b1';
  if (score < 80) return 'b2';
  return 'c1';
}

export function levelDescription(level) {
  const descriptions = {
    a2: 'Você está construindo vocabulário básico. Foco: palavras frequentes, verbos do dia a dia, frases simples.',
    b1: 'Nível intermediário inicial. Foco: phrasal verbs essenciais, collocations comuns, gramática intermediária.',
    b2: 'Intermediário avançado. Foco: vocabulário académico, idioms, estruturas complexas.',
    c1: 'Avançado. Foco: nuances, idioms sofisticados, vocabulário técnico, sinônimos refinados.'
  };
  return descriptions[level] || descriptions.b1;
}

export function recommendedDeck(level) {
  if (level === 'a2') return 'a2';
  if (level === 'b1') return 'b1';
  return 'b2';
}

export function computeScore(answers) {
  const real = answers.filter((a) => a.isReal);
  const fake = answers.filter((a) => !a.isReal);
  const realCorrect = real.filter((a) => a.knows).length;
  const fakeCorrect = fake.filter((a) => !a.knows).length;
  const realPct = real.length ? (realCorrect / real.length) * 100 : 0;
  const fakePct = fake.length ? (fakeCorrect / fake.length) * 100 : 0;
  const final = (realPct + fakePct) / 2;
  return { final, realPct, fakePct, realCorrect, realTotal: real.length, fakeCorrect, fakeTotal: fake.length };
}

/**
 * Placement test scoring.
 *
 * Method: LexTALE-style yes/no decision (Lemhöfer & Broersma, 2012), but real-word items
 * come from CEFR-J Vocabulary Profile v1.5 (Tono Lab, TUFS) + Octanove Vocabulary Profile
 * C1/C2 v1.0 (CC BY-SA 4.0). Pseudo-words are the 20 published LexTALE nonwords.
 *
 * Why this combo: LexTALE's published interpretation only distinguishes B2+, but the
 * CEFR-J items are individually tagged by level. Combining them lets us calibrate per
 * level (A1-C1) instead of inventing thresholds.
 *
 * Score per level L:
 *   hitRate    = (real words at L marked "knows") / (real items at L)
 *   falseAlarm = (pseudo-words marked "knows") / (pseudo-word total)
 *   adjusted   = max(0, hitRate - falseAlarm)
 *
 * CEFR level = highest L where adjusted >= 0.5. Below A1 floor → defaults to A1.
 * falseAlarm > 0.4 flags the result as unreliable (too much guessing).
 */

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'];

export function computeScore(answers) {
  const real = answers.filter((a) => a.isReal);
  const fake = answers.filter((a) => !a.isReal);

  const fakeKnown = fake.filter((a) => a.knows).length;
  const falseAlarm = fake.length ? fakeKnown / fake.length : 0;

  const perLevel = {};
  for (const L of LEVELS) {
    const items = real.filter((a) => a.level === L);
    const correct = items.filter((a) => a.knows).length;
    const hitRate = items.length ? correct / items.length : 0;
    const adjusted = Math.max(0, hitRate - falseAlarm);
    perLevel[L] = { total: items.length, correct, hitRate, adjusted };
  }

  let level = 'a1';
  for (const L of LEVELS) {
    if (perLevel[L].adjusted >= 0.5) level = L;
  }

  const overallScore = (LEVELS.reduce((sum, L) => sum + perLevel[L].adjusted, 0) / LEVELS.length) * 100;

  return {
    score: overallScore,
    level,
    perLevel,
    falseAlarm,
    unreliable: falseAlarm > 0.4,
    fakeKnown,
    fakeTotal: fake.length,
    realCorrect: real.filter((a) => a.knows).length,
    realTotal: real.length
  };
}

export function levelDescription(level) {
  const descriptions = {
    a1: 'Iniciante. Foco: vocabulário básico de alta frequência, verbos cotidianos, frases curtas.',
    a2: 'Vocabulário básico em formação. Foco: palavras de alta frequência, verbos cotidianos, estruturas simples.',
    b1: 'Intermediário inicial. Foco: phrasal verbs essenciais, collocations frequentes, gramática intermediária.',
    b2: 'Intermediário avançado. Foco: vocabulário acadêmico, idioms, estruturas complexas (subjuntivo, voz passiva, conditionals).',
    c1: 'Avançado. Foco: nuances, idioms sofisticados, vocabulário técnico, sinônimos refinados.'
  };
  return descriptions[level] || descriptions.a2;
}

export function recommendedDeck(level) {
  if (level === 'a1' || level === 'a2') return 'a2';
  if (level === 'b1') return 'b1';
  return 'b2';
}

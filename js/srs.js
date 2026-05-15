/**
 * SRS engine — SM-2 with Anki-style learning steps.
 *
 * State machine:
 *   new → learning → review ⇄ lapsed (review-with-relapse)
 *
 * Quality ratings:
 *   0 = Again, 3 = Hard, 4 = Good, 5 = Easy
 */

export const LEARNING_STEPS_MIN = [1, 10];
export const HARD_LEARNING_MIN = 6;
export const GRADUATING_INTERVAL_DAYS = 1;
export const EASY_GRADUATING_INTERVAL_DAYS = 4;
export const MIN_EASE = 1.3;
export const STARTING_EASE = 2.5;
export const HARD_INTERVAL_MULT = 1.2;
export const EASY_INTERVAL_MULT = 1.3;

export const QUALITY = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 };

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

export function initialReview(cardId) {
  return {
    cardId,
    state: 'new',
    ease: STARTING_EASE,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    step: 0,
    dueDate: Date.now(),
    lastReviewed: 0,
    lastQuality: 0
  };
}

export function review(r, quality) {
  const card = { ...r };
  const now = Date.now();
  card.lastReviewed = now;
  card.lastQuality = quality;

  if (card.state === 'new' || card.state === 'learning' || card.state === 'lapsed') {
    return reviewLearning(card, quality, now);
  }
  return reviewMature(card, quality, now);
}

function reviewLearning(card, quality, now) {
  const wasLapsed = card.state === 'lapsed';

  if (quality === QUALITY.AGAIN) {
    card.state = wasLapsed ? 'lapsed' : 'learning';
    card.step = 0;
    card.dueDate = now + LEARNING_STEPS_MIN[0] * MIN_MS;
    return card;
  }

  if (quality === QUALITY.HARD) {
    card.state = wasLapsed ? 'lapsed' : 'learning';
    if (card.step === 0) {
      card.dueDate = now + HARD_LEARNING_MIN * MIN_MS;
    } else {
      const step = Math.min(card.step, LEARNING_STEPS_MIN.length - 1);
      card.dueDate = now + LEARNING_STEPS_MIN[step] * MIN_MS;
    }
    return card;
  }

  if (quality === QUALITY.GOOD) {
    card.step += 1;
    if (card.step >= LEARNING_STEPS_MIN.length) {
      card.state = 'review';
      card.interval = GRADUATING_INTERVAL_DAYS;
      card.dueDate = now + GRADUATING_INTERVAL_DAYS * DAY_MS;
      card.repetitions = 1;
    } else {
      card.state = wasLapsed ? 'lapsed' : 'learning';
      card.dueDate = now + LEARNING_STEPS_MIN[card.step] * MIN_MS;
    }
    return card;
  }

  if (quality === QUALITY.EASY) {
    card.state = 'review';
    card.interval = EASY_GRADUATING_INTERVAL_DAYS;
    card.dueDate = now + EASY_GRADUATING_INTERVAL_DAYS * DAY_MS;
    card.repetitions = 1;
    return card;
  }

  return card;
}

function reviewMature(card, quality, now) {
  if (quality === QUALITY.AGAIN) {
    card.state = 'lapsed';
    card.lapses += 1;
    card.repetitions = 0;
    card.step = 0;
    card.ease = Math.max(MIN_EASE, card.ease - 0.2);
    card.interval = 0;
    card.dueDate = now + LEARNING_STEPS_MIN[0] * MIN_MS;
    return card;
  }

  let intervalDays;
  if (quality === QUALITY.HARD) {
    intervalDays = card.interval * HARD_INTERVAL_MULT;
    card.ease = Math.max(MIN_EASE, card.ease - 0.15);
  } else if (quality === QUALITY.GOOD) {
    intervalDays = card.interval * card.ease;
  } else {
    intervalDays = card.interval * card.ease * EASY_INTERVAL_MULT;
    card.ease = card.ease + 0.15;
  }

  card.interval = Math.max(1, Math.round(intervalDays));
  card.repetitions += 1;
  card.state = 'review';
  card.dueDate = now + card.interval * DAY_MS;
  return card;
}

export function previewIntervals(r) {
  function fmt(ms) {
    if (ms < 3600_000) return `${Math.round(ms / 60_000)} min`;
    if (ms < DAY_MS) return `${Math.round(ms / 3600_000)} h`;
    const days = Math.round(ms / DAY_MS);
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${Math.round(days / 365)}y`;
  }

  if (r.state === 'review') {
    return {
      again: '< 1 min',
      hard: fmt(Math.max(1, r.interval * HARD_INTERVAL_MULT) * DAY_MS),
      good: fmt(Math.max(1, r.interval * r.ease) * DAY_MS),
      easy: fmt(Math.max(1, r.interval * r.ease * EASY_INTERVAL_MULT) * DAY_MS)
    };
  }

  const stepIdx = Math.min(r.step, LEARNING_STEPS_MIN.length - 1);
  const nextStepIdx = Math.min(r.step + 1, LEARNING_STEPS_MIN.length - 1);
  const gradInterval = r.step + 1 >= LEARNING_STEPS_MIN.length ? GRADUATING_INTERVAL_DAYS * DAY_MS : LEARNING_STEPS_MIN[nextStepIdx] * MIN_MS;
  const hardMin = r.step === 0 ? HARD_LEARNING_MIN : LEARNING_STEPS_MIN[stepIdx];

  return {
    again: `${LEARNING_STEPS_MIN[0]} min`,
    hard: `${hardMin} min`,
    good: fmt(gradInterval),
    easy: fmt(EASY_GRADUATING_INTERVAL_DAYS * DAY_MS)
  };
}

export function isDue(r, now = Date.now()) {
  return r.dueDate <= now;
}

if (typeof window !== 'undefined') {
  window.__srs = { review, previewIntervals, initialReview, QUALITY };
}

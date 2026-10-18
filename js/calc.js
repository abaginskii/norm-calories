/* Расчёт нормы калорий и БЖУ.
   База — формула Миффлина — Сан Жеора, поправка на активность и цель. */

export const GOALS = [
  { id: 'lose', name: 'Похудеть', hint: 'дефицит калорий' },
  { id: 'maintain', name: 'Держать вес', hint: 'поддержание' },
  { id: 'gain', name: 'Набрать', hint: 'профицит калорий' },
];

export const RATES = [
  { id: 0.25, name: '0,25 кг в неделю', hint: 'мягкий темп' },
  { id: 0.5, name: '0,5 кг в неделю', hint: 'обычный темп' },
  { id: 0.75, name: '0,75 кг в неделю', hint: 'быстрый темп' },
];

/** Базовый метаболизм (Mifflin–St Jeor). */
export function bmr(profile) {
  const w = Number(profile.weight) || 0;
  const h = Number(profile.height) || 0;
  const a = Number(profile.age) || 0;
  if (!w || !h || !a) return 0;
  const base = 10 * w + 6.25 * h - 5 * a;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(profile) {
  const activity = Number(profile.activity) || 1.375;
  return bmr(profile) * activity;
}

export function goalDelta(profile) {
  const rate = Number(profile.rate) || 0.5;
  const daily = (rate * 7700) / 7;
  if (profile.goal === 'lose') return -daily;
  if (profile.goal === 'gain') return daily;
  return 0;
}

export function targetKcal(profile) {
  const maintenance = tdee(profile);
  if (!maintenance) return 0;
  const raw = maintenance + goalDelta(profile);
  const floor = Math.max(profile.sex === 'male' ? 1500 : 1200, bmr(profile) * 0.8);
  const ceiling = maintenance + 1200;
  const clamped = Math.min(Math.max(raw, floor), ceiling);
  return Math.round(clamped / 10) * 10;
}

export function macroTargets(profile, kcal) {
  const weight = Number(profile.weight) || 60;
  const proteinPerKg = profile.goal === 'lose' ? 2 : profile.goal === 'gain' ? 1.8 : 1.6;
  const fatPerKg = profile.goal === 'lose' ? 0.9 : 1;

  let protein = Math.round(proteinPerKg * weight);
  let fat = Math.round(fatPerKg * weight);

  // Белок не должен съедать больше 35% калорий, жир — держим в 20–35%.
  const maxProtein = Math.round((kcal * 0.35) / 4);
  if (protein > maxProtein) protein = maxProtein;
  const maxFat = Math.round((kcal * 0.35) / 9);
  const minFat = Math.round((kcal * 0.2) / 9);
  if (fat > maxFat) fat = maxFat;
  if (fat < minFat) fat = minFat;

  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { protein, fat, carb };
}

export function computeTargets(profile) {
  const kcal = targetKcal(profile);
  const macros = macroTargets(profile, kcal);
  return { kcal, ...macros };
}

export function bmi(profile) {
  const h = Number(profile.height) / 100;
  if (!h || !profile.weight) return null;
  return Number(profile.weight) / (h * h);
}

export function bmiLabel(value) {
  if (value == null) return '—';
  if (value < 18.5) return 'недостаточный вес';
  if (value < 25) return 'норма';
  if (value < 30) return 'избыточный вес';
  return 'ожирение';
}

/** Сколько процентов от нормы набрано (для колец и полос). */
export function ratio(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(1, value / target));
}

/** Прогноз изменения веса: дефицит/профицит за неделю. */
export function weeklyWeightTrend(profile, targetKcalValue) {
  const maintenance = tdee(profile);
  if (!maintenance || !targetKcalValue) return 0;
  return ((targetKcalValue - maintenance) * 7) / 7700;
}

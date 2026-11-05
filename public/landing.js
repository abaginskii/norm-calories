// Лендинг Нормы: одно движение на странице — день заполняет кольцо.

const NORM = 2010;
const C = 2 * Math.PI * 86;
const meals = [
  { kcal: 312, p: 36, f: 60, c: 216 },
  { kcal: 136, p: 56, f: 36, c: 44 },
  { kcal: 396, p: 148, f: 72, c: 176 },
];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => n.toLocaleString('ru-RU');

function playRing() {
  const items = [...document.querySelectorAll('.feed li')];
  const arcs = { p: document.querySelector('.arc-p'), f: document.querySelector('.arc-f'), c: document.querySelector('.arc-c') };
  const out = document.getElementById('left');
  const sum = { p: 0, f: 0, c: 0 };
  let eaten = 0;

  const draw = () => {
    // Дуги идут друг за другом: белки, жиры, углеводы.
    let offset = 0;
    for (const k of ['p', 'f', 'c']) {
      const len = (sum[k] / NORM) * C;
      arcs[k].style.strokeDasharray = `${Math.max(0, len - 4)} ${C}`;
      arcs[k].style.strokeDashoffset = String(-offset);
      offset += len;
    }
  };
  const count = (from, to) => {
    if (reduced) { out.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      out.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  meals.forEach((m, i) => {
    setTimeout(() => {
      items[i].classList.add('in');
      const before = NORM - eaten;
      eaten += m.kcal;
      sum.p += m.p; sum.f += m.f; sum.c += m.c;
      draw();
      count(before, NORM - eaten);
    }, reduced ? 0 : 500 + i * 1100);
  });
}

function startShader() {
  const canvas = document.getElementById('fx');
  if (!canvas || reduced) return;
  import('./fx/shader-r.js').then((m) => m.attachShaderR(canvas, {
    white: '#F4F8EC', dark: '#C9DDB1', orange: '#E6F7B4',
    scale: 0.9, distortion: 0.55, grain: 0.18, contrast: 0.9, speed: 0.35, animate: 'on',
  }, () => {})).catch(() => {});
}

playRing();
startShader();

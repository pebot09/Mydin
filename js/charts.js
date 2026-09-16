// Gráficos em SVG puro — sem biblioteca, funcionam offline e no celular.
//
// Regras seguidas: marcas finas, grade em fio sólido recessivo, vão de 2px
// entre barras vizinhas, legenda sempre que houver 2+ séries, rótulo direto
// só onde importa (extremo/última) e camada de toque com tooltip.

const NS = 'http://www.w3.org/2000/svg';

function el(nome, attrs = {}) {
  const e = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  return e;
}

function corDe(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/** Escala linear. */
function escala(dmin, dmax, rmin, rmax) {
  const d = dmax - dmin || 1;
  return (v) => rmin + ((v - dmin) / d) * (rmax - rmin);
}

/** Marcas de eixo "redondas" dentro de [min,max]. */
function ticks(min, max, alvo = 4) {
  const span = max - min || 1;
  const bruto = span / alvo;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag)
    .find((p) => p >= bruto) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) {
    out.push(Math.round(v));
  }
  return out;
}

/** Caminho de retângulo com o topo arredondado (4px) e a base reta na linha zero. */
function barraPath(x, y, w, h, r = 4) {
  const raio = Math.min(r, w / 2, Math.abs(h));
  if (h >= 0) {
    return `M${x},${y + h}L${x},${y + raio}Q${x},${y} ${x + raio},${y}`
      + `L${x + w - raio},${y}Q${x + w},${y} ${x + w},${y + raio}L${x + w},${y + h}Z`;
  }
  const yb = y + h;
  return `M${x},${yb}L${x},${y - raio}Q${x},${y} ${x + raio},${y}`
    + `L${x + w - raio},${y}Q${x + w},${y} ${x + w},${y - raio}L${x + w},${yb}Z`;
}

// ───────────────────────── Tooltip compartilhado ─────────────────────────

let tipEl = null;
function tooltip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viz-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function mostrarTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  const larg = window.innerWidth;
  let left = x - r.width / 2;
  left = Math.max(8, Math.min(left, larg - r.width - 8));
  let top = y - r.height - 14;
  if (top < 8) top = y + 18;
  t.style.left = left + 'px';
  t.style.top = top + 'px';
}

function esconderTip() {
  if (tipEl) tipEl.hidden = true;
}

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || !e.target.closest('.viz')) esconderTip();
}, true);

/**
 * Liga a camada de toque: divide a largura em faixas e avisa o índice ativo.
 * Funciona com dedo (pointer) e com mouse.
 */
function camadaToque(svg, g, n, x0, x1, y0, y1, aoEntrar) {
  const alvo = el('rect', {
    x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0),
    fill: 'transparent', style: 'touch-action:pan-y',
  });
  const foco = el('line', {
    class: 'viz-foco', x1: x0, x2: x0, y1: y0, y2: y1, 'stroke-width': 1,
  });
  foco.style.display = 'none';
  g.appendChild(foco);
  g.appendChild(alvo);

  let ativo = -1;
  function mover(ev) {
    const cx = svg.getBoundingClientRect();
    const px = ev.clientX - cx.left;
    const frac = (px - x0) / Math.max(1, x1 - x0);
    const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    if (i === ativo) return;
    ativo = i;
    const xi = n > 1 ? x0 + (i / (n - 1)) * (x1 - x0) : (x0 + x1) / 2;
    foco.setAttribute('x1', xi);
    foco.setAttribute('x2', xi);
    foco.style.display = '';
    aoEntrar(i, ev);
  }
  alvo.addEventListener('pointermove', mover);
  alvo.addEventListener('pointerdown', mover);
  alvo.addEventListener('pointerleave', () => {
    ativo = -1;
    foco.style.display = 'none';
    esconderTip();
  });
  return { foco };
}

// ───────────────────────── Base ─────────────────────────

function criarSvg(host, altura) {
  host.innerHTML = '';
  const larg = Math.max(260, host.clientWidth || host.parentElement.clientWidth || 320);
  const svg = el('svg', {
    class: 'viz', width: larg, height: altura,
    viewBox: `0 0 ${larg} ${altura}`, role: 'img',
  });
  host.appendChild(svg);
  return { svg, larg };
}

/** Redesenha quando o container muda de largura. */
function responsivo(host, desenhar) {
  desenhar();
  if (host._vizObs) host._vizObs.disconnect();
  let ultima = host.clientWidth;
  host._vizObs = new ResizeObserver(() => {
    if (Math.abs(host.clientWidth - ultima) < 8) return;
    ultima = host.clientWidth;
    desenhar();
  });
  host._vizObs.observe(host);
}

function eixoY(g, vals, ey, x0, x1, fmt) {
  for (const v of vals) {
    const y = ey(v);
    g.appendChild(el('line', { class: 'viz-grade', x1: x0, x2: x1, y1: y, y2: y }));
    const t = el('text', { class: 'viz-rot', x: x0 - 6, y: y + 4, 'text-anchor': 'end' });
    t.textContent = fmt(v);
    g.appendChild(t);
  }
}

function rotulosX(g, rotulos, ex, y, maxRot = 6) {
  const passo = Math.max(1, Math.ceil(rotulos.length / maxRot));
  rotulos.forEach((r, i) => {
    if (i % passo !== 0 && i !== rotulos.length - 1) return;
    const t = el('text', { class: 'viz-rot', x: ex(i), y, 'text-anchor': 'middle' });
    t.textContent = r;
    g.appendChild(t);
  });
}

// ───────────────────────── Linha (uma série + projeção) ─────────────────────────

/**
 * spec: { rotulos:[], valores:[], projecao:[{rotulo,valor}], fmt, fmtEixo, titulo }
 * Uma série só → sem legenda (o título nomeia a série), com rótulo direto no fim.
 */
export function linha(host, spec) {
  responsivo(host, () => {
    const altura = spec.altura || 190;
    const { svg, larg } = criarSvg(host, altura);
    const g = el('g');
    svg.appendChild(g);

    const proj = spec.projecao || [];
    const todos = [...spec.valores, ...proj.map((p) => p.valor)];
    if (!todos.length) return;

    const mL = 52, mR = proj.length ? 16 : 12, mT = 12, mB = 24;
    const x0 = mL, x1 = larg - mR, y0 = mT, y1 = altura - mB;

    // Para um NÍVEL (patrimônio), forçar o zero achata a variação e esconde a
    // tendência — que é justamente o que o gráfico existe para mostrar.
    let vmin, vmax;
    if (spec.baseZero) {
      vmin = Math.min(0, ...todos);
      vmax = Math.max(...todos);
    } else {
      const lo = Math.min(...todos);
      const hi = Math.max(...todos);
      const folga = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
      vmin = lo - folga;
      vmax = hi + folga;
    }
    if (vmin === vmax) vmax = vmin + 1;
    const marcas = ticks(vmin, vmax);
    vmin = Math.min(vmin, marcas[0]);
    vmax = Math.max(vmax, marcas[marcas.length - 1]);

    const n = spec.valores.length + proj.length;
    const ex = (i) => (n > 1 ? x0 + (i / (n - 1)) * (x1 - x0) : (x0 + x1) / 2);
    const ey = escala(vmin, vmax, y1, y0);

    eixoY(g, marcas, ey, x0, x1, spec.fmtEixo);

    const cor = corDe('--serie-1');
    const d = spec.valores.map((v, i) => (i ? 'L' : 'M') + ex(i) + ',' + ey(v)).join('');
    // área só faz sentido quando a base é o zero; senão ela mente sobre a escala
    if (spec.baseZero && spec.valores.length > 1) {
      const area = d + `L${ex(spec.valores.length - 1)},${ey(Math.max(0, vmin))}`
        + `L${ex(0)},${ey(Math.max(0, vmin))}Z`;
      g.appendChild(el('path', { d: area, fill: cor, opacity: 0.08 }));
    }
    g.appendChild(el('path', {
      d, fill: 'none', stroke: cor, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));

    if (proj.length) {
      const iUlt = spec.valores.length - 1;
      const dp = [`M${ex(iUlt)},${ey(spec.valores[iUlt])}`]
        .concat(proj.map((p, i) => `L${ex(iUlt + 1 + i)},${ey(p.valor)}`)).join('');
      g.appendChild(el('path', {
        d: dp, fill: 'none', stroke: cor, 'stroke-width': 2,
        'stroke-dasharray': '4 4', opacity: 0.65, 'stroke-linecap': 'round',
      }));
    }

    // rótulo direto só no último ponto real
    const iUlt = spec.valores.length - 1;
    if (iUlt >= 0) {
      g.appendChild(el('circle', {
        cx: ex(iUlt), cy: ey(spec.valores[iUlt]), r: 4.5,
        fill: cor, stroke: 'var(--superficie)', 'stroke-width': 2,
      }));
    }

    const rotulos = [...spec.rotulos, ...proj.map((p) => p.rotulo)];
    rotulosX(g, rotulos, ex, altura - 6);

    camadaToque(svg, g, n, x0, x1, y0, y1, (i, ev) => {
      const ehProj = i >= spec.valores.length;
      const v = ehProj ? proj[i - spec.valores.length].valor : spec.valores[i];
      mostrarTip(
        `<strong>${rotulos[i]}</strong><br>${spec.fmt(v)}`
        + (ehProj ? '<br><span class="viz-tip-nota">projeção</span>' : ''),
        ev.clientX, ev.clientY);
    });
  });
}

// ───────────────────────── Barras agrupadas (2 séries) ─────────────────────────

/**
 * spec: { rotulos:[], series:[{nome, valores, cor}], fmt, fmtEixo }
 * Vão de 2px entre barras vizinhas; legenda sempre presente com 2+ séries.
 */
export function barrasAgrupadas(host, spec) {
  responsivo(host, () => {
    const altura = spec.altura || 200;
    const { svg, larg } = criarSvg(host, altura);
    const g = el('g');
    svg.appendChild(g);

    const todos = spec.series.flatMap((s) => s.valores);
    if (!todos.length) return;

    const mL = 52, mR = 10, mT = 10, mB = 24;
    const x0 = mL, x1 = larg - mR, y0 = mT, y1 = altura - mB;

    const vmax = Math.max(1, ...todos);
    const marcas = ticks(0, vmax);
    const topo = Math.max(vmax, marcas[marcas.length - 1]);
    const ey = escala(0, topo, y1, y0);
    eixoY(g, marcas, ey, x0, x1, spec.fmtEixo);

    const n = spec.rotulos.length;
    const banda = (x1 - x0) / Math.max(1, n);
    const k = spec.series.length;
    const larguraGrupo = Math.min(banda * 0.72, 34);
    const lb = Math.max(3, (larguraGrupo - 2 * (k - 1)) / k);  // vão de 2px

    spec.series.forEach((s, si) => {
      const cor = corDe(s.cor);
      s.valores.forEach((v, i) => {
        const cx = x0 + banda * (i + 0.5);
        const bx = cx - larguraGrupo / 2 + si * (lb + 2);
        const h = ey(0) - ey(v);
        if (h <= 0.5) return;
        g.appendChild(el('path', {
          d: barraPath(bx, ey(v), lb, h), fill: cor,
        }));
      });
    });

    const ex = (i) => x0 + banda * (i + 0.5);
    rotulosX(g, spec.rotulos, ex, altura - 6);

    camadaToque(svg, g, n, x0 + banda / 2, x1 - banda / 2, y0, y1, (i, ev) => {
      const linhas = spec.series.map((s) =>
        `<span class="viz-pt" style="background:${corDe(s.cor)}"></span>${s.nome}: ${spec.fmt(s.valores[i])}`);
      mostrarTip(`<strong>${spec.rotulos[i]}</strong><br>${linhas.join('<br>')}`,
        ev.clientX, ev.clientY);
    });
  });
}

// ───────────────────────── Barras divergentes (sobra) ─────────────────────────

/** spec: { rotulos, valores, fmt, fmtEixo } — positivo/negativo a partir do zero. */
export function barrasDivergentes(host, spec) {
  responsivo(host, () => {
    const altura = spec.altura || 180;
    const { svg, larg } = criarSvg(host, altura);
    const g = el('g');
    svg.appendChild(g);
    if (!spec.valores.length) return;

    const mL = 52, mR = 10, mT = 10, mB = 24;
    const x0 = mL, x1 = larg - mR, y0 = mT, y1 = altura - mB;

    const vmin = Math.min(0, ...spec.valores);
    const vmax = Math.max(0, ...spec.valores);
    const marcas = ticks(vmin, vmax);
    const lo = Math.min(vmin, marcas[0]);
    const hi = Math.max(vmax, marcas[marcas.length - 1]);
    const ey = escala(lo, hi, y1, y0);
    eixoY(g, marcas, ey, x0, x1, spec.fmtEixo);

    const zero = ey(0);
    g.appendChild(el('line', { class: 'viz-eixo', x1: x0, x2: x1, y1: zero, y2: zero }));

    const n = spec.valores.length;
    const banda = (x1 - x0) / Math.max(1, n);
    const lb = Math.max(4, Math.min(banda - 2, 26));

    spec.valores.forEach((v, i) => {
      const cx = x0 + banda * (i + 0.5);
      const y = ey(v);
      const h = zero - y;
      if (Math.abs(h) < 0.5) return;
      g.appendChild(el('path', {
        d: barraPath(cx - lb / 2, y, lb, h),
        fill: corDe(v >= 0 ? '--bom' : '--ruim'),
      }));
    });

    const ex = (i) => x0 + banda * (i + 0.5);
    rotulosX(g, spec.rotulos, ex, altura - 6);

    camadaToque(svg, g, n, x0 + banda / 2, x1 - banda / 2, y0, y1, (i, ev) => {
      mostrarTip(`<strong>${spec.rotulos[i]}</strong><br>${spec.fmt(spec.valores[i])}`,
        ev.clientX, ev.clientY);
    });
  });
}

// ───────────────────────── Ranking horizontal ─────────────────────────

/**
 * spec: { itens:[{rotulo, valor, detalhe, destaque}], fmt, aoTocar }
 * Uma série → uma cor só. Valor sempre escrito (a cor nunca carrega sozinha).
 */
export function ranking(host, spec) {
  host.innerHTML = '';
  const max = Math.max(1, ...spec.itens.map((i) => Math.abs(i.valor)));
  const lista = document.createElement('div');
  lista.className = 'rank';
  for (const it of spec.itens) {
    const linha = document.createElement(spec.aoTocar ? 'button' : 'div');
    linha.className = 'rank-item' + (it.destaque ? ' destaque' : '');
    if (spec.aoTocar) {
      linha.type = 'button';
      linha.addEventListener('click', () => spec.aoTocar(it));
    }
    const pct = (Math.abs(it.valor) / max) * 100;
    linha.innerHTML = `
      <div class="rank-topo">
        <span class="rank-rotulo">${it.rotulo}</span>
        <span class="rank-valor">${spec.fmt(it.valor)}</span>
      </div>
      <div class="rank-trilho"><div class="rank-barra" style="width:${pct}%"></div></div>
      ${it.detalhe ? `<div class="rank-detalhe">${it.detalhe}</div>` : ''}`;
    lista.appendChild(linha);
  }
  host.appendChild(lista);
}

// ───────────────────────── Sparkline ─────────────────────────

export function sparkline(host, valores, opcoes = {}) {
  host.innerHTML = '';
  if (valores.length < 2) return;
  const larg = opcoes.largura || 96;
  const alt = opcoes.altura || 28;
  const svg = el('svg', {
    class: 'viz spark', width: larg, height: alt,
    viewBox: `0 0 ${larg} ${alt}`, 'aria-hidden': 'true',
  });
  const vmin = Math.min(...valores);
  const vmax = Math.max(...valores);
  const ey = escala(vmin, vmax === vmin ? vmin + 1 : vmax, alt - 3, 3);
  const ex = (i) => (i / (valores.length - 1)) * (larg - 4) + 2;
  const d = valores.map((v, i) => (i ? 'L' : 'M') + ex(i) + ',' + ey(v)).join('');
  svg.appendChild(el('path', {
    d, fill: 'none', stroke: corDe(opcoes.cor || '--serie-1'),
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
  svg.appendChild(el('circle', {
    cx: ex(valores.length - 1), cy: ey(valores[valores.length - 1]), r: 2.5,
    fill: corDe(opcoes.cor || '--serie-1'),
  }));
  host.appendChild(svg);
}

// ───────────────────────── Medidor (bullet) ─────────────────────────

/** Progresso contra uma meta, com o número sempre escrito ao lado. */
export function medidor(host, { valor, meta, fmt, rotulo }) {
  host.innerHTML = '';
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const d = document.createElement('div');
  d.className = 'medidor';
  d.innerHTML = `
    <div class="medidor-topo">
      <span>${rotulo}</span>
      <strong>${fmt(valor)} <span class="fraco">de ${fmt(meta)}</span></strong>
    </div>
    <div class="medidor-trilho"><div class="medidor-barra" style="width:${pct}%"></div></div>
    <div class="medidor-pct">${pct.toFixed(0)}% do potencial</div>`;
  host.appendChild(d);
}

/** Legenda reutilizável — presente sempre que houver 2+ séries. */
export function legenda(series) {
  return `<div class="viz-legenda">${series.map((s) =>
    `<span class="viz-leg"><span class="viz-pt" style="background:var(${s.cor})"></span>${s.nome}</span>`
  ).join('')}</div>`;
}

// Mydin — JS mínimo: seleção em lote, cronômetro e gráficos SVG locais.
(function () {
  "use strict";

  // ── Selecionar todos (fila de revisão) ──
  var selTodos = document.getElementById("sel-todos");
  if (selTodos) {
    selTodos.addEventListener("change", function () {
      document.querySelectorAll("input.sel").forEach(function (cb) {
        cb.checked = selTodos.checked;
      });
    });
  }

  // ── Cronômetro de projeto (persiste na aba; envia segundos ao salvar) ──
  var crono = document.querySelector(".crono");
  if (crono) {
    var display = document.getElementById("crono-display");
    var toggle = document.getElementById("crono-toggle");
    var salvar = document.getElementById("crono-salvar");
    var campo = document.getElementById("crono-segundos");
    var chave = "mydin-crono-" + crono.dataset.projeto;
    var estado = JSON.parse(localStorage.getItem(chave) || "null") || { acumulado: 0, inicio: null };

    function segundos() {
      var s = estado.acumulado;
      if (estado.inicio) s += Math.floor((Date.now() - estado.inicio) / 1000);
      return s;
    }
    function render() {
      var s = segundos();
      var h = String(Math.floor(s / 3600)).padStart(2, "0");
      var m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      var sec = String(s % 60).padStart(2, "0");
      display.textContent = h + ":" + m + ":" + sec;
      toggle.textContent = estado.inicio ? "⏸ Pausar" : "▶ Iniciar";
      salvar.disabled = s < 60; // sessão mínima de 1 minuto
      campo.value = s;
    }
    function persistir() { localStorage.setItem(chave, JSON.stringify(estado)); }

    toggle.addEventListener("click", function () {
      if (estado.inicio) {
        estado.acumulado = segundos();
        estado.inicio = null;
      } else {
        estado.inicio = Date.now();
      }
      persistir();
      render();
    });
    document.getElementById("crono-form").addEventListener("submit", function () {
      estado.acumulado = segundos();
      estado.inicio = null;
      campo.value = estado.acumulado;
      localStorage.removeItem(chave);
    });
    setInterval(render, 1000);
    render();
  }

  // ── Gráficos SVG simples (sem dependências externas — local-first) ──
  function moeda(c) {
    return "R$ " + (c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
  document.querySelectorAll(".grafico").forEach(function (el) {
    var serie;
    try { serie = JSON.parse(el.dataset.serie); } catch (e) { return; }
    if (!serie.length) return;
    var W = 900, H = 260, padE = 70, padB = 30, padT = 12;
    var largura = W - padE - 8, altura = H - padB - padT;
    var svg = ['<svg viewBox="0 0 ' + W + " " + H + '" role="img">'];

    var valores = [];
    serie.forEach(function (p) {
      if (p.v !== undefined) valores.push(p.v);
      if (p.a !== undefined) valores.push(p.a);
      if (p.b !== undefined) valores.push(p.b);
    });
    var max = Math.max.apply(null, valores.concat([1]));
    var min = Math.min.apply(null, valores.concat([0]));
    function y(v) { return padT + altura - ((v - min) / (max - min || 1)) * altura; }

    // linhas de grade + eixo
    for (var g = 0; g <= 4; g++) {
      var gv = min + ((max - min) * g) / 4;
      svg.push('<line x1="' + padE + '" y1="' + y(gv) + '" x2="' + (W - 8) + '" y2="' + y(gv) +
        '" stroke="#e4e1db" stroke-width="1"/>');
      svg.push('<text x="' + (padE - 6) + '" y="' + (y(gv) + 4) + '" text-anchor="end" font-size="11" fill="#6f6b64">' +
        moeda(gv) + "</text>");
    }

    var n = serie.length;
    var passo = largura / n;
    if (el.dataset.tipo === "linha") {
      var pontos = serie.map(function (p, i) {
        return (padE + passo * (i + 0.5)).toFixed(1) + "," + y(p.v).toFixed(1);
      });
      svg.push('<polyline points="' + pontos.join(" ") + '" fill="none" stroke="#0f766e" stroke-width="2.5"/>');
      serie.forEach(function (p, i) {
        svg.push('<circle cx="' + (padE + passo * (i + 0.5)) + '" cy="' + y(p.v) + '" r="3" fill="#0f766e">' +
          "<title>" + p.m + ": " + moeda(p.v) + "</title></circle>");
      });
    } else {
      var lb = Math.min(passo * 0.36, 26);
      serie.forEach(function (p, i) {
        var x0 = padE + passo * i + passo / 2;
        if (p.a !== undefined) {
          svg.push('<rect x="' + (x0 - (p.b !== undefined ? lb : lb / 2)) + '" y="' + y(p.a) +
            '" width="' + lb + '" height="' + (y(min < 0 ? 0 : min) - y(p.a)) + '" fill="#0f766e">' +
            "<title>" + p.m + " receita: " + moeda(p.a) + "</title></rect>");
        }
        if (p.b !== undefined) {
          svg.push('<rect x="' + x0 + '" y="' + y(p.b) + '" width="' + lb +
            '" height="' + (y(min < 0 ? 0 : min) - y(p.b)) + '" fill="#b45309">' +
            "<title>" + p.m + " gasto: " + moeda(p.b) + "</title></rect>");
        }
      });
    }
    // rótulos do eixo x (esparsos para não amontoar)
    var salto = Math.ceil(n / 12);
    serie.forEach(function (p, i) {
      if (i % salto) return;
      svg.push('<text x="' + (padE + passo * (i + 0.5)) + '" y="' + (H - 8) +
        '" text-anchor="middle" font-size="10" fill="#6f6b64">' + p.m + "</text>");
    });
    svg.push("</svg>");
    el.innerHTML = svg.join("");
  });
})();

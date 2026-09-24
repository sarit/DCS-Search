/* DCS search: loads assets/data/corpus.json and searches it in the browser. */
(function () {
  'use strict';

  var MAX_SHOW = 1500;          // hits rendered on the page
  var MARKS = /[\u0300-\u036f]/g;
  var LETTER = '[\\p{L}\\p{M}]';

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    q: $('q'), fold: $('fold'), whole: $('whole'), ctx: $('ctx'), tf: $('tf'),
    tfcount: $('tfcount'), status: $('status'), summary: $('summary'),
    results: $('results'), about: $('about'), names: $('textnames')
  };

  var DATA = null, LINES = null, FOLDED = null, TEXTFOLD = null;

  /* Strip diacritics, keeping a map from folded positions back to the
     original string so highlights land on the right characters. */
  function foldMap(s) {
    var out = '', map = [];
    for (var i = 0; i < s.length;) {
      var ch = String.fromCodePoint(s.codePointAt(i));
      var f = ch.normalize('NFD').replace(MARKS, '');
      for (var k = 0; k < f.length; k++) map.push(i);
      out += f;
      i += ch.length;
    }
    map.push(s.length);
    return { s: out, map: map };
  }
  function fold(s) { return foldMap(s).s; }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'); }

  function mode() { return document.querySelector('input[name="mode"]:checked').value; }

  /* Build one RegExp per term. A line must match all of them. */
  function matchers(q, m, whole, doFold) {
    var prep = function (t) { return doFold ? fold(t) : t; };
    var src;
    if (m === 'regex') {
      src = [prep(q)];
    } else if (m === 'phrase') {
      src = [reEsc(prep(q.trim())).replace(/\s+/g, '\\s+')];
    } else {
      src = q.trim().split(/\s+/).map(function (t) { return reEsc(prep(t)); });
    }
    if (whole && m !== 'regex') {
      src = src.map(function (s) { return '(?<!' + LETTER + ')' + s + '(?!' + LETTER + ')'; });
    }
    return src.map(function (s) {
      try { return new RegExp(s, 'giu'); }
      catch (e) { return new RegExp(s, 'gi'); }   // lenient fallback for regex mode
    });
  }

  function allowedTexts() {
    var f = fold(el.tf.value.trim()).toLowerCase();
    if (!f) return null;
    var ok = {};
    TEXTFOLD.forEach(function (n, i) { if (n.indexOf(f) !== -1) ok[i] = true; });
    return ok;
  }

  function highlight(text, res, doFold) {
    var s = text, map = null;
    if (doFold) { var r = foldMap(text); s = r.s; map = r.map; }
    var spans = [];
    res.forEach(function (re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(s)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        var a = m.index, b = a + m[0].length;
        if (map) { a = map[a]; b = map[b]; }
        spans.push([a, b]);
      }
    });
    spans.sort(function (x, y) { return x[0] - y[0]; });
    var out = '', pos = 0;
    spans.forEach(function (sp) {
      if (sp[1] <= pos) return;
      var a = Math.max(sp[0], pos);
      out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, sp[1])) + '</mark>';
      pos = sp[1];
    });
    return out + esc(text.slice(pos));
  }

  function lineItem(i, cls, res, doFold) {
    var L = LINES[i], t = DATA.texts[L[0]];
    var url = DATA.meta.linkBase + encodeURIComponent(t.file) + '#L' + L[1];
    var ref = L[2] || ('l. ' + L[1]);
    var body = cls === 'ctx' ? esc(L[3]) : highlight(L[3], res, doFold);
    return '<li class="' + cls + '"><a class="ref" href="' + url + '" target="_blank" rel="noopener" ' +
      'title="' + esc(t.file) + ', line ' + L[1] + '">' + esc(ref) +
      (L[2] ? '<span class="ln">l. ' + L[1] + '</span>' : '') + '</a>' +
      '<span class="line">' + body + '</span></li>';
  }

  function setStatus(msg, isError) {
    el.status.textContent = msg;
    el.status.className = 'status' + (isError ? ' error' : '');
  }

  function saveState() {
    var p = new URLSearchParams();
    if (el.q.value) p.set('q', el.q.value);
    if (mode() !== 'words') p.set('mode', mode());
    if (!el.fold.checked) p.set('fold', '0');
    if (el.whole.checked) p.set('whole', '1');
    if (el.ctx.checked) p.set('ctx', '1');
    if (el.tf.value) p.set('texts', el.tf.value);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function loadState() {
    var p = new URLSearchParams(location.search);
    el.q.value = p.get('q') || '';
    var m = p.get('mode');
    if (m) { var r = document.querySelector('input[name="mode"][value="' + m + '"]'); if (r) r.checked = true; }
    el.fold.checked = p.get('fold') !== '0';
    el.whole.checked = p.get('whole') === '1';
    el.ctx.checked = p.get('ctx') === '1';
    el.tf.value = p.get('texts') || '';
  }

  function run() {
    if (!DATA) return;
    saveState();
    var allowed = allowedTexts();
    el.tfcount.textContent = allowed ? Object.keys(allowed).length + ' texts match' : '';
    el.summary.innerHTML = '';
    el.results.innerHTML = '';

    var q = el.q.value;
    if (!q.trim()) { setStatus(''); return; }
    var m = mode(), doFold = el.fold.checked;
    var res;
    try { res = matchers(q, m, el.whole.checked, doFold); }
    catch (e) { setStatus('The regular expression is not valid: ' + e.message, true); return; }

    var hits = [];
    for (var i = 0; i < LINES.length; i++) {
      if (allowed && !allowed[LINES[i][0]]) continue;
      var s = doFold ? FOLDED[i] : LINES[i][3];
      var ok = true;
      for (var k = 0; k < res.length; k++) {
        res[k].lastIndex = 0;
        if (!res[k].test(s)) { ok = false; break; }
      }
      if (ok) hits.push(i);
    }

    if (!hits.length) {
      setStatus('No lines match. Try turning on Ignore diacritics, or turning off Whole words.');
      return;
    }

    // Count per text
    var per = {}, order = [];
    hits.forEach(function (i) {
      var t = LINES[i][0];
      if (!(t in per)) { per[t] = 0; order.push(t); }
      per[t]++;
    });
    setStatus(hits.length.toLocaleString() + (hits.length === 1 ? ' line' : ' lines') +
      ' in ' + order.length + (order.length === 1 ? ' text' : ' texts') +
      (hits.length > MAX_SHOW ? '. Showing the first ' + MAX_SHOW.toLocaleString() + '.' : '.'));
    if (order.length > 1) {
      el.summary.innerHTML = order.map(function (t) {
        return '<a href="#t' + t + '">' + esc(DATA.texts[t].name) + '<span>' + per[t] + '</span></a>';
      }).join(' ');
    }

    // Render, grouped by text, with optional neighbouring lines
    var shown = hits.slice(0, MAX_SHOW), isHit = {};
    shown.forEach(function (i) { isHit[i] = true; });
    var groups = {};
    shown.forEach(function (i) {
      var t = LINES[i][0], g = groups[t] || (groups[t] = {});
      g[i] = true;
      if (el.ctx.checked) {
        if (i > 0 && LINES[i - 1][0] === t) g[i - 1] = true;
        if (i + 1 < LINES.length && LINES[i + 1][0] === t) g[i + 1] = true;
      }
    });
    var html = [];
    order.forEach(function (t) {
      if (!groups[t]) return;
      var idx = Object.keys(groups[t]).map(Number).sort(function (a, b) { return a - b; });
      var items = [], prev = null;
      idx.forEach(function (i) {
        if (el.ctx.checked && prev !== null && i !== prev + 1) items.push('<li class="gap"></li>');
        items.push(lineItem(i, isHit[i] ? 'hit' : 'ctx', res, doFold));
        prev = i;
      });
      var tx = DATA.texts[t];
      html.push('<section class="text-group" id="t' + t + '"><h2>' + esc(tx.name) +
        '<small>' + esc(tx.file) + ', ' + per[t] + (per[t] === 1 ? ' hit' : ' hits') + '</small></h2>' +
        '<ul class="hits">' + items.join('') + '</ul></section>');
    });
    el.results.innerHTML = html.join('');
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 200); }

  ['q', 'tf'].forEach(function (id) { el[id].addEventListener('input', schedule); });
  document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(function (x) {
    x.addEventListener('change', run);
  });
  el.q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(timer); run(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); el.q.focus(); }
  });

  fetch('assets/data/corpus.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      DATA = d;
      LINES = d.lines;
      FOLDED = LINES.map(function (L) { return fold(L[3]); });
      TEXTFOLD = d.texts.map(function (t) { return fold(t.name).toLowerCase(); });
      el.names.innerHTML = d.texts.map(function (t) { return '<option value="' + esc(t.name) + '">'; }).join('');
      el.about.textContent = 'Search ' + d.texts.length + ' texts and ' +
        LINES.length.toLocaleString() + ' lines of the Digital Corpus of Sanskrit.';
      el.q.disabled = false;
      loadState();
      el.q.focus();
      run();
    })
    .catch(function (e) {
      el.about.textContent = '';
      setStatus('The corpus index could not be loaded (' + e.message +
        '). Check that the GitHub Actions build has finished.', true);
    });
})();

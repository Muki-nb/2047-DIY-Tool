(function () {
  'use strict';

  const canvas = document.getElementById('cardCanvas');
  const ctx = canvas.getContext('2d');

  const W = 560;
  const H = 841;
  const PAD = 30; // 最终出图上下各留 30px 空白

  const kword = { '白': 1, '蓝': 2, '紫': 3, '橙': 4 };

  // 与 make.js 一致的粗体关键字（按长度降序，避免长词被短词抢先匹配）
  const keywords = ['护盾', '不屈', '超载', '后备', '技能', '威吓', '对峙', '守军',
    '进场时', '死亡时', '你的回合结束时', '被代替时', '竞赛', '奖励', '挑选']
    .sort((a, b) => b.length - a.length);
  const kwRegexG = new RegExp(keywords.join('|'), 'g');

  // ---------- 资源加载 ----------
  const imgs = {};
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败: ' + src));
      img.src = src;
    });
  }

  async function loadResources() {
    await Promise.all([
      loadImg('A.png').then(i => { imgs.A = i; }),
      loadImg('C.png').then(i => { imgs.C = i; }),
      (async () => {
        imgs.L = [null];
        imgs.Lsp = [null];
        imgs.K = [null];
        for (let i = 1; i <= 7; i++) {
          imgs.L.push(await loadImg('L' + i + '.png'));
          imgs.Lsp.push(await loadImg('L' + i + 'sp.png'));
        }
        for (let i = 1; i <= 4; i++) imgs.K.push(await loadImg(i + '.png'));
      })(),
      (async () => {
        const fonts = [
          ['fzltC', 'FZLTCHJW.TTF'],
          ['fzltX', 'FZLTXHJW.TTF'],
          ['rm', 'Renegade Moons.otf']
        ];
        for (const [family, file] of fonts) {
          try {
            const face = new FontFace(family, 'url(' + encodeURI(file) + ')');
            document.fonts.add(await face.load());
          } catch (e) {
            console.warn('字体加载失败:', file, e);
          }
        }
        await Promise.all(fonts.map(([f]) =>
          document.fonts.load('30px ' + f).catch(() => {})
        ));
      })()
    ]);
  }

  // ---------- 渲染（移植自 make.js） ----------
  // 描述行解析：<b></b> 加粗、<i></i> 斜体，关键字自动加粗
  function measureSeg(seg) {
    ctx.font = (seg.italic ? 'italic ' : '') + '30px ' + (seg.bold ? 'fzltC' : 'fzltX');
    return ctx.measureText(seg.text).width;
  }

  function mkSeg(text, bold, italic) {
    const seg = { text: text, bold: bold, italic: italic };
    seg.width = measureSeg(seg);
    return seg;
  }

  function tokenizeLine(line) {
    const segs = [];
    const re = /<\/?(?:b|i)>/gi;
    let bold = false, italic = false, last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) segs.push({ text: line.slice(last, m.index), bold: bold, italic: italic });
      const tag = m[0].toLowerCase();
      if (tag === '<b>') bold = true;
      else if (tag === '</b>') bold = false;
      else if (tag === '<i>') italic = true;
      else if (tag === '</i>') italic = false;
      last = m.index + m[0].length;
    }
    if (last < line.length) segs.push({ text: line.slice(last), bold: bold, italic: italic });
    return segs;
  }

  function buildSegments(line) {
    const out = [];
    for (const seg of tokenizeLine(line)) {
      if (!seg.text) continue;
      if (seg.bold) { out.push(mkSeg(seg.text, true, seg.italic)); continue; }
      // 非标签加粗部分：内部关键字仍自动加粗
      let last = 0, m;
      kwRegexG.lastIndex = 0;
      while ((m = kwRegexG.exec(seg.text))) {
        if (m.index > last) out.push(mkSeg(seg.text.slice(last, m.index), false, seg.italic));
        out.push(mkSeg(m[0], true, seg.italic));
        last = m.index + m[0].length;
      }
      if (last < seg.text.length) out.push(mkSeg(seg.text.slice(last), false, seg.italic));
    }
    return out;
  }

  let userImg = null; // 用户导入的卡图

  function loadCardImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { userImg = img; render(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function render() {
    const val = id => document.getElementById(id).value;
    const card = {
      name: val('name') || '',
      c: val('c') || '',
      a: val('a') || null,
      k: val('k'),
      l: parseInt(val('l'), 10) || 1,
      sp: document.getElementById('sp').checked,
      description: val('description')
    };

    ctx.clearRect(0, 0, W, H + PAD * 2);
    ctx.save();
    ctx.translate(0, PAD);

    // 卡图（可选）：位置与切角参照 draw.js
    if (userImg) {
      ctx.drawImage(userImg, 52, 13, 460, 565);
      ctx.clearRect(52, 575, 4, 4);
      ctx.clearRect(489, 13, 23, 26);
      ctx.clearRect(506, 37, 8, 16);
      ctx.clearRect(493, 540, 19, 38);
      ctx.clearRect(52, 531, 16, 47);
      ctx.clearRect(59, 573, 16, 7);
    }

    // 阵营底图（异画用 sp 卡框） + 上下覆层
    const Lset = card.sp ? imgs.Lsp : imgs.L;
    ctx.drawImage(Lset[card.l] || Lset[1], 0, 0);
    ctx.drawImage(imgs.C, 0, 0);

    // 左上数值（能耗）：按徽章中心居中
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.textAlign = 'center';
    ctx.font = '120px rm';
    if (card.c) ctx.fillText(card.c, 85.5, 95);

    // 左下数值（力量）：按徽章中心居中
    if (card.a) {
      ctx.drawImage(imgs.A, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.font = '120px rm';
      ctx.fillText(card.a, 90, 580);
    }

    // 色系边框
    if (imgs.K[kword[card.k]]) ctx.drawImage(imgs.K[kword[card.k]], 0, 0);

    // 卡名（双描以加粗）
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.textAlign = 'left';
    ctx.font = '42px fzltX';
    ctx.fillText(card.name, 110, 642);
    ctx.fillText(card.name, 110.5, 642.5);

    // 描述正文：<b> 加粗 / <i> 斜体 标签，关键字自动加粗
    const lines = card.description.split('\n');
    const yOf = i => 660 + 74 + 10.5 + (i + 1 - (lines.length + 1) / 2) * 34;

    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      const segs = buildSegments(line);
      const total = segs.reduce((s, seg) => s + seg.width, 0);
      let x = (W - total) / 2;
      const y = yOf(i);
      for (const seg of segs) {
        if (!seg.text) continue;
        ctx.font = (seg.italic ? 'italic ' : '') + '30px ' + (seg.bold ? 'fzltC' : 'fzltX');
        ctx.fillText(seg.text, x, y);
        if (!seg.bold && !seg.italic) ctx.fillText(seg.text, x + 0.5, y + 0.5);
        x += seg.width;
      }
    });

    ctx.restore();
  }

  // ---------- 交互 ----------
  function saveSettings() {
    const data = {};
    ['name', 'c', 'a', 'k', 'l', 'description'].forEach(id => {
      data[id] = document.getElementById(id).value;
    });
    data.sp = document.getElementById('sp').checked;
    try { localStorage.setItem('diycards', JSON.stringify(data)); } catch (e) {}
  }

  function restoreSettings() {
    try {
      const data = JSON.parse(localStorage.getItem('diycards'));
      if (data) {
        Object.keys(data).forEach(id => {
          const el = document.getElementById(id);
          if (!el || data[id] == null) return;
          if (id === 'sp') el.checked = !!data[id];
          else el.value = data[id];
        });
      }
    } catch (e) {}
  }

  function bindEvents() {
    ['name', 'c', 'a', 'description'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        render();
        saveSettings();
      });
    });
    ['k', 'l'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        render();
        saveSettings();
      });
    });

    document.getElementById('sp').addEventListener('change', () => {
      render();
      saveSettings();
    });

    document.getElementById('cardImage').addEventListener('change', () => {
      loadCardImage(document.getElementById('cardImage').files[0]);
    });

    document.getElementById('clearImage').addEventListener('click', () => {
      userImg = null;
      document.getElementById('cardImage').value = '';
      render();
    });

    // 拖入卡图
    const previewPanel = document.getElementById('previewPanel');
    let dragDepth = 0;
    const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    document.addEventListener('dragenter', e => {
      e.preventDefault();
      if (!hasFiles(e)) return;
      dragDepth++;
      previewPanel.classList.add('drag-over');
    });
    document.addEventListener('dragover', e => { e.preventDefault(); });
    document.addEventListener('dragleave', e => {
      e.preventDefault();
      if (!hasFiles(e)) return;
      dragDepth--;
      if (dragDepth <= 0) { dragDepth = 0; previewPanel.classList.remove('drag-over'); }
    });
    document.addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0;
      previewPanel.classList.remove('drag-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadCardImage(file);
    });

    document.getElementById('download').addEventListener('click', () => {
      const name = document.getElementById('name').value || 'card';
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    });
  }

  // ---------- 启动 ----------
  (async function init() {
    restoreSettings();
    bindEvents();
    try {
      await loadResources();
      render();
    } catch (e) {
      console.error(e);
    }
  })();
})();

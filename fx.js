// 表情の演出（漫符・画面の演出）— ゲーム本体（game.js）と見本ページ（fx_demo.html）で共通に使う
// 漫符は絵文字ではなく SVG で描く（どのスマホでも同じ見た目にするため）。
"use strict";

const FX = (() => {
  // 漫符（立ち絵の頭の横に出す）。validate.py の FX_MARKS と同じ一覧
  const MARKS = {
    anger_mark: "怒り",
    sweat: "汗・焦り",
    surprise: "驚き",
    question: "疑問",
    sparkle: "喜び・ひらめき",
    panic: "慌て",
    silence: "あきれ・無言",
  };
  // 画面の演出。validate.py の FX_SCREENS と同じ一覧
  const SCREENS = {
    zoom: "強調（立ち絵がぐっと寄る）",
    flash: "ひらめき・衝撃（白く光る）",
    tremble: "動揺（小刻みに震える）",
    fade_dark: "落ち込み（ゆっくり暗くなる）",
  };
  // 表情の画像がないときに自動で付ける漫符
  const AUTO_MARK = { angry: "anger_mark", surprised: "surprise", sad: "sweat",
                      exasperated: "silence", thinking: "question",
                      furious: "anger_mark", gentle: "sparkle" };
  // 漫符を出す位置：立ち絵の枠に対する割合（頭の右上）。画像を差し替えてずれたらここを直す
  const HEAD = {
    mori: { x: 0.70, y: 0.09 },
    robin: { x: 0.80, y: 0.07 },
    taka: { x: 0.74, y: 0.06 },
    kurokawa: { x: 0.64, y: 0.06 },
    gonda: { x: 0.70, y: 0.05 },
    couple: { x: 0.55, y: 0.05 },     // 若い夫婦（夫の頭の右上）
    chairman: { x: 0.70, y: 0.06 },
    cityhall: { x: 0.70, y: 0.06 },
    sister: { x: 0.70, y: 0.06 },
    brother: { x: 0.66, y: 0.05 },
  };
  const DEFAULT_HEAD = { x: 0.72, y: 0.08 };
  // 立ち絵の表示範囲：画像の上から top〜top+height（高さに対する割合）だけを、枠の高さいっぱいに拡大して出す。
  // 腰から上で写っている脇役の顔を、胸から上の主要3人と同じくらいの大きさにそろえるため（2026-11-15 追加）。
  // 表にないキャラは画像全体（{ top: 0, height: 1 }）。漫符の位置（HEAD）は今までどおり画像全体に対する割合で書く。
  // 値は 390×844 で顔（髪の上〜あご）の高さが主要キャラの平均くらいになるように決めた（docs/screens/sprite_view_*.png）。
  const VIEW = {
    couple: { top: 0, height: 0.8 },     // 2人で1枚。夫の顔に合わせる。赤ちゃんまで入る
    chairman: { top: 0, height: 0.82 },
    cityhall: { top: 0, height: 0.8 },
    sister: { top: 0, height: 0.9 },
    brother: { top: 0, height: 0.9 },
  };
  const FULL_VIEW = { top: 0, height: 1 };
  // 表情の画像があっても、normal との差が小さいので漫符を自動で添える（キャラ → {表情: 漫符}）。fx で漫符を書いた行はそちらを使う。
  // 姉の angry は normal がもともと不機嫌そうな腕組みで差が小さいため（2026-11-15）。弟の sad は汗と困り顔が絵に描かれているので添えない。
  const FACE_MARK = {
    sister: { angry: "anger_mark" },
  };

  // ---------- 漫符の SVG（viewBox 0 0 64 64） ----------
  const SVG = {
    anger_mark: `
      <g fill="none" stroke="#d6336c" stroke-width="7" stroke-linecap="round">
        <path d="M10 26 Q26 26 26 10"/><path d="M38 10 Q38 26 54 26"/>
        <path d="M54 38 Q38 38 38 54"/><path d="M26 54 Q26 38 10 38"/>
      </g>`,
    sweat: `
      <path d="M32 6 C32 6 14 30 14 42 A18 18 0 0 0 50 42 C50 30 32 6 32 6Z"
            fill="#74c0fc" stroke="#1c7ed6" stroke-width="3" stroke-linejoin="round"/>
      <path d="M22 42 A10 10 0 0 0 30 52" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    surprise: `
      <g stroke="#1f2430" stroke-width="3" stroke-linejoin="round">
        <path d="M25 6 H39 L36 40 H28 Z" fill="#ffd43b"/>
        <circle cx="32" cy="52" r="6" fill="#ffd43b"/>
      </g>
      <g stroke="#f08c00" stroke-width="3" stroke-linecap="round">
        <path d="M10 14 L4 8"/><path d="M54 14 L60 8"/><path d="M8 30 H2"/><path d="M56 30 H62"/>
      </g>`,
    question: `
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 22 Q20 8 32 8 Q45 8 45 20 Q45 28 35 32 Q32 34 32 41" stroke="#fff" stroke-width="13"/>
        <path d="M20 22 Q20 8 32 8 Q45 8 45 20 Q45 28 35 32 Q32 34 32 41" stroke="#4263eb" stroke-width="8"/>
      </g>
      <circle cx="32" cy="53" r="6" fill="#4263eb" stroke="#fff" stroke-width="3"/>`,
    sparkle: `
      <g class="tw tw1"><path d="M22 6 L26 20 L40 24 L26 28 L22 42 L18 28 L4 24 L18 20 Z" fill="#ffe066" stroke="#f59f00" stroke-width="2"/></g>
      <g class="tw tw2"><path d="M48 26 L50.5 34 L58 36 L50.5 38 L48 46 L45.5 38 L38 36 L45.5 34 Z" fill="#fff3bf" stroke="#f59f00" stroke-width="2"/></g>
      <g class="tw tw3"><path d="M30 44 L32 50 L38 52 L32 54 L30 60 L28 54 L22 52 L28 50 Z" fill="#ffe066" stroke="#f59f00" stroke-width="2"/></g>`,
    panic: `
      <g class="pd pd1"><path d="M20 22 C20 22 11 34 11 40 A9 9 0 0 0 29 40 C29 34 20 22 20 22Z" fill="#74c0fc" stroke="#1c7ed6" stroke-width="2.5"/></g>
      <g class="pd pd2"><path d="M44 10 C44 10 37 20 37 25 A7 7 0 0 0 51 25 C51 20 44 10 44 10Z" fill="#a5d8ff" stroke="#1c7ed6" stroke-width="2.5"/></g>
      <g class="pd pd3"><path d="M48 38 C48 38 42 46 42 50 A6 6 0 0 0 54 50 C54 46 48 38 48 38Z" fill="#74c0fc" stroke="#1c7ed6" stroke-width="2.5"/></g>`,
    silence: `
      <g fill="#343a40" stroke="#fff" stroke-width="2.5">
        <circle class="sd sd1" cx="12" cy="40" r="6"/>
        <circle class="sd sd2" cx="32" cy="40" r="6"/>
        <circle class="sd sd3" cx="52" cy="40" r="6"/>
      </g>`,
  };

  function markEl(name) {
    const wrap = document.createElement("div");
    wrap.className = `fx-mark fx-${name}`;
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = `<svg viewBox="0 0 64 64" width="100%" height="100%">${SVG[name]}</svg>`;
    return wrap;
  }

  function parseFx(fx) {
    const list = fx == null ? [] : Array.isArray(fx) ? fx : [fx];
    return {
      mark: list.find((v) => v in MARKS) || null,
      screens: list.filter((v) => v in SCREENS),
    };
  }

  // 立ち絵の枠の幅を画像の縦横比に合わせ、漫符の置き場を「実際に画像が表示されている範囲」に重ねる。
  // 横長の画像は枠の max-width で幅が切られ、枠の中で縮んで下寄せになるため（漫符が頭から離れないように）
  function fitBox(ctx) {
    const { box, img, markHost } = ctx;
    if (!img.naturalWidth || !box.clientHeight) return;
    const v = VIEW[box.dataset.view] || FULL_VIEW;
    const ratio = img.naturalWidth / (img.naturalHeight * v.height);   // 表示する範囲の縦横比
    box.style.width = `${ratio * box.clientHeight}px`;
    const bw = box.clientWidth, bh = box.clientHeight;
    const w = Math.min(bw, bh * ratio), h = w / ratio;                 // 表示する範囲の大きさ（枠の下にそろえる）
    const fullH = h / v.height, top = bh - h - v.top * fullH;           // 画像全体の高さと位置
    if (v === FULL_VIEW) {
      img.removeAttribute("style");                                      // 今までどおり CSS（object-fit: contain）で置く
    } else {
      Object.assign(img.style, {
        position: "absolute", left: `${(bw - w) / 2}px`, top: `${top}px`, width: `${w}px`, height: `${fullH}px`,
        objectFit: "fill",
        clipPath: `inset(${v.top * 100}% 0 ${(1 - v.top - v.height) * 100}% 0)`,   // 範囲の外は見せない
      });
    }
    // 漫符置き場は画像全体に重ねる（HEAD は画像全体に対する割合）
    Object.assign(markHost.style, {
      left: `${(bw - w) / 2}px`, top: `${top}px`, width: `${w}px`, height: `${fullH}px`,
      right: "auto", bottom: "auto",
    });
  }

  function clear(ctx) {
    const { stage, box, img } = ctx;
    stage.classList.remove("fx-shake", "fx-sad", "fx-tremble", "fx-flash", "fx-fade_dark");
    box.classList.remove("fx-bounce", "fx-zoom");
    img.classList.remove("fx-sad");
    ctx.markHost.replaceChildren();
    if (ctx.floatHost) ctx.floatHost.replaceChildren();
  }

  // 1行分の表示。opts = { img: 画像キー or null, faces: [画像のある表情], face, fx, cg: イベントCGか }
  // ctx = { stage, box（立ち絵の枠）, img, markHost（枠の中の漫符置き場）, floatHost（立ち絵がないときの漫符置き場） }
  function show(ctx, opts) {
    const { stage, box, img } = ctx;
    clear(ctx);
    void box.offsetWidth;                          // アニメーションをやり直すため

    const usePortrait = !opts.cg && !!opts.img;
    const hasFace = usePortrait && opts.faces.includes(opts.face);
    const { mark, screens } = parseFx(opts.fx);

    // 立ち絵
    if (usePortrait) {
      box.dataset.view = opts.img;                 // fitBox が表示範囲（VIEW）を引く（ctx は呼ぶたびに作り直されるため枠に持たせる）
      const src = `img/web/${opts.img}_${hasFace ? opts.face : "normal"}.webp`;
      if (!img.src.endsWith(src)) {
        img.onload = () => fitBox(ctx);
        img.src = src;
      }
      fitBox(ctx);
      box.classList.add("show");
    } else {
      box.classList.remove("show");
    }

    // 画像がない表情の代わりの演出（従来どおり）
    if (!hasFace) {
      if (opts.face === "angry") stage.classList.add("fx-shake");
      if (opts.face === "furious") { stage.classList.add("fx-shake"); box.classList.add("fx-zoom"); }
      if (opts.face === "surprised" && usePortrait) box.classList.add("fx-bounce");
      if (opts.face === "sad") (usePortrait ? img : stage).classList.add("fx-sad");
    }

    // 漫符：fx で指定がなく、表情の画像もないときは表情に合う漫符を自動で付ける（画像があっても FACE_MARK にある表情は添える）
    const m = mark || (!hasFace && AUTO_MARK[opts.face]) || (hasFace && (FACE_MARK[opts.img] || {})[opts.face]) || null;
    if (m) {
      const el = markEl(m);
      if (usePortrait) {
        const h = HEAD[opts.img] || DEFAULT_HEAD;
        el.style.left = `${h.x * 100}%`;
        el.style.top = `${h.y * 100}%`;
        ctx.markHost.append(el);
      } else if (ctx.floatHost) {
        el.classList.add("float");
        ctx.floatHost.append(el);
      }
    }

    // 画面の演出
    screens.forEach((s) => {
      if (s === "zoom") box.classList.add("fx-zoom");
      else stage.classList.add(`fx-${s}`);
    });
    return { mark: m, screens, usedImage: hasFace };
  }

  return { MARKS, SCREENS, AUTO_MARK, HEAD, VIEW, FACE_MARK, show, clear, fitBox, parseFx };
})();

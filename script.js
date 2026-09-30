"use strict";
const $ = id => document.getElementById(id);
const S = { cells: [], auto: true, cols: 1, rows: 1, gap: 8, bg: "#000000", fit: "crop",
  W: 1920, H: 1080, dmode: "longest", custom: 30, playing: false, clock: 0, el: 0,
  exporting: false, cancel: false, rep: null };
let AC, master, recDest;
const view = $("view"), vctx = view.getContext("2d");
const fmt = s => Number.isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00";
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- audio: every cell goes through a gain node so mute and export work ---------- */
function audio() {
  if (!AC) {
    AC = new AudioContext(); master = AC.createGain(); master.connect(AC.destination);
    master.gain.value = +$("vol").value; recDest = AC.createMediaStreamDestination();
  }
  if (AC.state === "suspended") AC.resume();
}

/* ---------- sources and cells ---------- */
function newSrc(file) {
  const src = { name: file.name, url: URL.createObjectURL(file), thumb: "" };
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = src.url;
  v.onloadeddata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); };
  v.onseeked = () => {
    const c = document.createElement("canvas"); c.width = 96; c.height = 54;
    c.getContext("2d").drawImage(v, 0, 0, 96, 54); src.thumb = c.toDataURL("image/jpeg", 0.6);
    v.removeAttribute("src"); v.load(); renderList();
  };
  return src;
}
function makeCell(src, muted) {
  audio();
  const v = document.createElement("video");
  v.src = src.url; v.loop = true; v.playsInline = true; v.preload = "auto";
  const g = AC.createGain(); g.gain.value = muted ? 0 : 1;
  const c = { src, v, g, muted, speed: 1, loop: true };
  try { AC.createMediaElementSource(v).connect(g); g.connect(master); g.connect(recDest); } catch (e) {}
  v.addEventListener("loadedmetadata", () => { updateInfo(); renderList(); });
  return c;
}
const apply = c => { c.v.loop = c.loop; c.v.playbackRate = c.speed; c.g.gain.value = c.muted ? 0 : 1; };
const clone = c => { const d = makeCell(c.src, true); d.speed = c.speed; d.loop = c.loop; apply(d); return d; };
function release(src) {
  if (!S.cells.some(c => c.src === src)) URL.revokeObjectURL(src.url);
}
function addFiles(files) {
  [...files].filter(f => f.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(f.name))
    .forEach(f => S.cells.push(makeCell(newSrc(f), false)));
  sync();
}
function dup(c, n) {
  const at = S.cells.indexOf(c);
  S.cells.splice(at + 1, 0, ...Array.from({ length: n }, () => clone(c)));
  sync();
}
function remove(c) {
  c.v.pause(); c.g.disconnect(); c.v.removeAttribute("src");
  S.cells.splice(S.cells.indexOf(c), 1); release(c.src); sync();
}

/* ---------- layout ---------- */
function layout() {
  if (!S.auto) return { cols: S.cols, rows: S.rows };
  const cols = Math.max(1, Math.ceil(Math.sqrt(S.cells.length)));
  return { cols, rows: Math.max(1, Math.ceil(S.cells.length / cols)) };
}
function total() {
  const d = S.cells.map(c => c.v.duration / c.speed).filter(Number.isFinite);
  if (S.dmode === "custom") return S.custom;
  if (!d.length) return 0;
  return S.dmode === "shortest" ? Math.min(...d) : Math.max(...d);
}

/* ---------- drawing (same function for preview and export) ---------- */
function draw(ctx, w, h) {
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, w, h);
  const { cols, rows } = layout(), gap = S.gap * w / S.W;
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  S.cells.slice(0, cols * rows).forEach((c, i) => {
    const x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap), v = c.v;
    if (v.readyState < 2 || !v.videoWidth) { ctx.fillStyle = "#1c2233"; ctx.fillRect(x, y, cw, ch); return; }
    if (S.fit === "stretch") return ctx.drawImage(v, x, y, cw, ch);
    const k = S.fit === "crop" ? Math.max(cw / v.videoWidth, ch / v.videoHeight) : Math.min(cw / v.videoWidth, ch / v.videoHeight);
    const dw = v.videoWidth * k, dh = v.videoHeight * k;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
    ctx.drawImage(v, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh); ctx.restore();
  });
}
function sizePreview() {
  view.width = Math.min(S.W, 1280); view.height = Math.round(view.width * S.H / S.W);
  view.style.aspectRatio = S.W + "/" + S.H;
}

/* ---------- playback ---------- */
function play() { audio(); S.playing = true; S.clock = performance.now() - S.el * 1000; S.cells.forEach(c => c.v.play().catch(() => {})); $("play").textContent = "Pause"; }
function pause() { S.playing = false; S.cells.forEach(c => c.v.pause()); $("play").textContent = "Play"; }
function restart() {
  S.el = 0; S.clock = performance.now();
  S.cells.forEach(c => { c.v.currentTime = 0; if (S.playing) c.v.play().catch(() => {}); });
}
function tick() {
  if (S.playing) {
    S.el = (performance.now() - S.clock) / 1000;
    const T = total(); if (T && S.el >= T && !S.exporting) restart();
  }
  if (!S.exporting) draw(vctx, view.width, view.height);
  $("time").textContent = fmt(S.el) + " / " + fmt(total());
  requestAnimationFrame(tick);
}

/* ---------- UI ---------- */
function renderList() {
  $("list").innerHTML = S.cells.map((c, i) => `
    <div class="card">
      ${c.src.thumb ? `<img src="${c.src.thumb}" alt="">` : `<div class="ph"></div>`}
      <div><b title="${esc(c.src.name)}">${i + 1}. ${esc(c.src.name)}</b>
        <small>${c.src.thumb ? fmt(c.v.duration) : "Loading…"}</small></div>
      <div class="acts">
        <button data-a="mute" data-i="${i}" class="${c.muted ? "on" : ""}">${c.muted ? "Muted" : "Mute"}</button>
        <button data-a="loop" data-i="${i}" class="${c.loop ? "on" : ""}">Loop</button>
        <select data-a="speed" data-i="${i}" title="Playback speed">
          ${[0.5, 1, 1.5, 2].map(s => `<option value="${s}" ${s === c.speed ? "selected" : ""}>${s}x</option>`).join("")}</select>
        <button data-a="dup" data-n="1" data-i="${i}" title="Add 1 copy">Duplicate</button>
        <button data-a="dup" data-n="2" data-i="${i}" title="Add 2 copies">×2</button>
        <button data-a="dup" data-n="5" data-i="${i}" title="Add 5 copies">×5</button>
        <button data-a="dup" data-n="10" data-i="${i}" title="Add 10 copies">×10</button>
        <button data-a="rep" data-i="${i}">Replace</button>
        <button data-a="rm" data-i="${i}">Remove</button>
      </div>
    </div>`).join("");
}
function updateInfo() {
  const L = layout(), n = S.cells.length;
  if (S.auto) { $("cols").value = L.cols; $("rows").value = L.rows; }
  $("gridInfo").textContent = n ? `${n} video${n > 1 ? "s" : ""} in a ${L.cols} × ${L.rows} grid` : "";
  $("durInfo").textContent = "Final length: " + fmt(total());
  const w = [];
  if (n >= 25) w.push(`${n} videos can be heavy on your device. Lower the resolution if playback stutters.`);
  if (n > L.cols * L.rows) w.push(`${n - L.cols * L.rows} videos don't fit in this grid and are hidden.`);
  $("warn").hidden = !w.length; $("warn").textContent = w.join(" ");
  $("empty").hidden = n > 0; $("customRow").hidden = S.dmode !== "custom";
}
function sync() {
  renderList(); updateInfo();
  if (S.playing) S.cells.forEach(c => c.v.paused && c.v.play().catch(() => {}));
}

$("file").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
const drop = $("drop");
["dragover", "dragenter"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });

$("list").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const c = S.cells[b.dataset.i], a = b.dataset.a;
  if (a === "mute") { c.muted = !c.muted; apply(c); renderList(); }
  else if (a === "loop") { c.loop = !c.loop; apply(c); renderList(); }
  else if (a === "dup") dup(c, +b.dataset.n);
  else if (a === "rm") remove(c);
  else if (a === "rep") { S.rep = c; $("replace").click(); }
};
$("list").onchange = e => {
  if (e.target.dataset.a !== "speed") return;
  const c = S.cells[e.target.dataset.i]; c.speed = +e.target.value; apply(c); updateInfo();
};
$("replace").onchange = e => {
  const f = e.target.files[0];
  if (f && S.rep) { const c = S.rep, old = c.src; c.src = newSrc(f); c.v.src = c.src.url; release(old); sync(); }
  e.target.value = "";
};

$("dupAll").onclick = () => {
  if (!S.cells.length) return;
  const L = layout(), out = [];
  if (L.rows <= 1) { out.push(...S.cells, ...S.cells.map(clone)); }
  else {  // repeat each row sideways: A B / C D  ->  A B A B / C D C D
    for (let i = 0; i < S.cells.length; i += L.cols) { const r = S.cells.slice(i, i + L.cols); out.push(...r, ...r.map(clone)); }
    S.auto = false; $("auto").checked = false; S.cols = L.cols * 2; S.rows = L.rows;
    $("cols").value = S.cols; $("rows").value = S.rows;
  }
  S.cells = out; sync();
};
$("shuffle").onclick = () => {
  for (let i = S.cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [S.cells[i], S.cells[j]] = [S.cells[j], S.cells[i]]; }
  renderList();
};

$("play").onclick = () => S.cells.length && (S.playing ? pause() : play());
$("restart").onclick = restart;
$("vol").oninput = e => { audio(); master.gain.value = +e.target.value; };
$("fs").onclick = () => view.requestFullscreen && view.requestFullscreen();

$("auto").onchange = e => { S.auto = e.target.checked; if (!S.auto) { const L = layout(); S.cols = +$("cols").value || L.cols; S.rows = +$("rows").value || L.rows; } updateInfo(); };
["cols", "rows"].forEach(k => $(k).oninput = e => { S[k] = Math.max(1, +e.target.value || 1); S.auto = false; $("auto").checked = false; updateInfo(); });
$("gap").oninput = e => { S.gap = +e.target.value; $("gapOut").textContent = S.gap; };
$("bg").oninput = e => S.bg = e.target.value;
$("fit").onchange = e => S.fit = e.target.value;
$("res").onchange = e => { [S.W, S.H] = e.target.value.split("x").map(Number); sizePreview(); };
$("dmode").onchange = e => { S.dmode = e.target.value; updateInfo(); };
$("custom").oninput = e => { S.custom = Math.max(1, +e.target.value || 1); updateInfo(); };

/* ---------- export: records the composed canvas + mixed audio in real time ---------- */
$("cancel").onclick = () => S.cancel = true;
$("export").onclick = async () => {
  if (!S.cells.length || S.exporting) return;
  const T = total();
  if (!T) return alert("Videos are still loading. Try again in a moment.");
  if (typeof MediaRecorder === "undefined") return alert("This browser can't record video. Use a recent Chrome, Edge, Firefox or Safari.");
  const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return alert("No supported video format found in this browser.");
  audio();
  const oc = document.createElement("canvas"); oc.width = S.W; oc.height = S.H;
  const octx = oc.getContext("2d"), stream = oc.captureStream(30);
  recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(S.W * S.H * 30 * 0.12) });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);

  S.exporting = true; S.cancel = false; $("bar").hidden = false; $("export").disabled = true;
  pause(); restart(); play(); rec.start(1000);
  const t0 = performance.now(), fill = $("bar").querySelector("i"), label = $("bar").querySelector("span");
  await new Promise(done => {
    const step = () => {
      const e = (performance.now() - t0) / 1000;
      draw(octx, S.W, S.H);
      fill.style.width = Math.min(100, e / T * 100) + "%";
      label.textContent = `Exporting ${fmt(e)} / ${fmt(T)} (keep this tab open)`;
      if (e >= T || S.cancel) return done();
      requestAnimationFrame(step);
    };
    step();
  });
  const stopped = new Promise(r => rec.onstop = r); rec.stop(); await stopped;
  pause(); S.exporting = false; $("bar").hidden = true; $("export").disabled = false;
  if (S.cancel) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(";")[0] }));
  a.download = "infinite-video-grid." + (mime.includes("mp4") ? "mp4" : "webm");
  a.click();
};

sizePreview(); updateInfo(); requestAnimationFrame(tick);
            

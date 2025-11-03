const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const state = { files: [], tables: {}, combined: [], chart: null, lastConfig: null };

function showMsg(kind, text) {
  const wrap = $("#messages");
  const base = "px-4 py-2 rounded-lg";
  let bg = "bg-emerald-50 text-emerald-800 border border-emerald-200";
  if (kind === "error") bg = "bg-rose-50 text-rose-800 border border-rose-200";
  if (kind === "warn") bg = "bg-amber-50 text-amber-800 border border-amber-200";
  const div = document.createElement("div");
  div.className = `${base} ${bg}`;
  div.textContent = text;
  wrap.prepend(div);
}

// Config: assets/config.json + query params
function getQuery() {
  const p = new URLSearchParams(location.search);
  return { owner: p.get("owner")||"", repo: p.get("repo")||"", branch: p.get("branch")||"", folder: p.get("folder")||"", lock: p.get("lock") };
}
async function loadConfigJSON() {
  try { const res = await fetch("assets/config.json", { cache: "no-store" }); if (!res.ok) return null; return await res.json(); } catch { return null; }
}
function applyOrigin(owner, repo, branch, folder, lockFields=false) {
  if (owner) $("#owner").value = owner;
  if (repo) $("#repo").value = repo;
  if (branch) $("#branch").value = branch;
  if (folder) $("#folder").value = folder;
  if (lockFields) ["#owner","#repo","#branch","#folder"].forEach(sel => { const el = $(sel); if (el) { el.readOnly = true; el.classList.add("bg-gray-50"); } });
}
async function initOrigin() {
  const cfg = await loadConfigJSON(); if (cfg) applyOrigin(cfg.owner||"", cfg.repo||"", cfg.branch||"main", cfg.folder||"", !!cfg.lockFields);
  const raw = localStorage.getItem("gh_origin_cfg"); if (raw) { try { const lc = JSON.parse(raw); applyOrigin(lc.owner||"", lc.repo||"", lc.branch||"main", lc.folder||"", false); } catch {} }
  const q = getQuery(); if (q.owner || q.repo || q.branch || q.folder) applyOrigin(q.owner, q.repo, q.branch||"main", q.folder, q.lock==="1");
}

// Persistencia simple
function saveOriginCfg() {
  const cfg = { owner: $("#owner").value.trim(), repo: $("#repo").value.trim(), branch: $("#branch").value.trim()||"main", folder: $("#folder").value.trim() };
  localStorage.setItem("gh_origin_cfg", JSON.stringify(cfg));
  showMsg("ok", "Origen guardado en este navegador.");
}
function loadOriginCfg() {
  const raw = localStorage.getItem("gh_origin_cfg"); if (!raw) return showMsg("warn", "No hay origen guardado.");
  try { const cfg = JSON.parse(raw);
    $("#owner").value = cfg.owner || ""; $("#repo").value = cfg.repo || "";
    $("#branch").value = cfg.branch || "main"; $("#folder").value = cfg.folder || "";
    showMsg("ok", "Origen cargado.");
  } catch { showMsg("error", "No se pudo cargar el origen guardado."); }
}

// Listar y cargar CSVs desde GitHub
async function listGithubCSVs() {
  const owner = $("#owner").value.trim();
  const repo = $("#repo").value.trim();
  const branch = $("#branch").value.trim() || "main";
  const folder = $("#folder").value.trim();
  const token = $("#token").value.trim();
  if (!owner || !repo || !folder) return showMsg("warn", "Completa Owner, Repo y Carpeta.");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(folder)}?ref=${encodeURIComponent(branch)}`;
  const headers = { "Accept": "application/vnd.github+json" }; if (token) headers["Authorization"] = `Bearer ${token}`;
  let data;
  try { const res = await fetch(url, { headers }); if (!res.ok) { const t = await res.text(); throw new Error(`GitHub API ${res.status}: ${t.slice(0,200)}`); } data = await res.json(); }
  catch (e) { console.error(e); return showMsg("error", "No se pudo listar la carpeta en GitHub. Revisa permisos/ruta."); }
  const csvs = (Array.isArray(data) ? data : []).filter(it => it.type === "file" && /\.csv$/i.test(it.name)).map(it => ({ name: it.name, url: it.download_url, source: "github" }));
  state.files = csvs; renderFiles();
  if (!csvs.length) showMsg("warn", "No se encontraron archivos .csv en esa carpeta."); else showMsg("ok", `Se encontraron ${csvs.length} CSV(s).`);
}
function renderFiles() {
  const wrap = $("#filesWrap");
  if (!state.files.length) { wrap.innerHTML = `<div class="text-sm text-gray-500">Sin archivos listados aún.</div>`; return; }
  const rows = state.files.map((f, idx) => `<tr class="hover:bg-gray-50">
      <td class="px-3 py-2 text-sm">${idx + 1}</td>
      <td class="px-3 py-2">${f.name}</td>
      <td class="px-3 py-2 text-xs text-gray-500">${f.source}</td>
      <td class="px-3 py-2"><button data-name="${f.name}" class="btnLoad px-3 py-1 rounded-lg border">Cargar</button></td>
    </tr>`).join("");
  wrap.innerHTML = `<div class="overflow-auto rounded-lg border">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-100">
          <tr><th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">Archivo</th><th class="px-3 py-2 text-left">Origen</th><th class="px-3 py-2"></th></tr>
        </thead><tbody>${rows}</tbody></table></div>`;
  wrap.querySelectorAll(".btnLoad").forEach(btn => btn.addEventListener("click", async (e) => {
    const name = e.currentTarget.dataset.name; const meta = state.files.find(x => x.name === name); if (!meta) return; await loadCSV(meta);
  }));
}
function detectHeaders(rows) { if (!rows.length) return []; return Object.keys(rows[0]); }
function toNumberMaybe(val) {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return NaN;
  const norm = val.replace(/\./g,"").replace(",",".").trim();
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}
async function loadCSV(meta) {
  if (meta.source === "local") {
    state.tables[meta.name] = { rows: meta.rows, headers: meta.headers };
    showPreview(meta.name); populateColumnSelectors();
    return showMsg("ok", `Cargado ${meta.name} (${meta.rows.length} filas).`);
  }
  return new Promise((resolve) => {
    Papa.parse(meta.url, {
      download: true, header: true, dynamicTyping: false, skipEmptyLines: true,
      transform: val => (typeof val === "string" ? val.trim() : val),
      complete: (results) => {
        const rows = results.data, headers = detectHeaders(rows);
        state.tables[meta.name] = { rows, headers };
        showPreview(meta.name); populateColumnSelectors();
        showMsg("ok", `Cargado ${meta.name} (${rows.length} filas).`);
        resolve();
      },
      error: err => { console.error(err); showMsg("error", `Error al leer ${meta.name}`); resolve(); }
    });
  });
}

// UI: previsualización y construcción del gráfico
function showPreview(name) {
  const { rows = [], headers = [] } = state.tables[name] || {};
  const maxRows = 10;
  $("#rowsInfo").textContent = `${rows.length} filas · mostrándo ${Math.min(maxRows, rows.length)}`;
  const head = `<tr>${headers.map(h => `<th class="px-3 py-2 text-left bg-gray-100">${h}</th>`).join("")}</tr>`;
  const body = rows.slice(0, maxRows).map(r => `<tr class="hover:bg-gray-50">${headers.map(h => `<td class="px-3 py-1">${r[h] ?? ""}</td>`).join("")}</tr>`).join("");
  $("#preview").innerHTML = `<div class="overflow-auto rounded-lg border">
      <table class="min-w-full text-sm"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="text-xs text-gray-500 mt-2">Vista previa de ${name}</div>`;
}
function populateColumnSelectors() {
  const allHeaders = new Set(); Object.values(state.tables).forEach(t => t.headers.forEach(h => allHeaders.add(h)));
  const headers = Array.from(allHeaders);
  const xSel = $("#xCol"), ySel = $("#yCols");
  xSel.innerHTML = ""; ySel.innerHTML = "";
  headers.forEach(h => {
    const ox = document.createElement("option"); ox.value = h; ox.textContent = h; xSel.appendChild(ox);
    const oy = document.createElement("option"); oy.value = h; oy.textContent = h; ySel.appendChild(oy);
  });
  if (headers.length) {
    xSel.value = headers[0];
    const sampleRows = Object.values(state.tables)[0]?.rows || [];
    const numericCandidates = headers.filter(h => sampleRows.some(r => Number.isFinite(toNumberMaybe(r[h]))));
    if (numericCandidates.length) { $$("#yCols option").forEach(o => o.selected = numericCandidates.slice(0,2).includes(o.value)); }
  }
}
function buildCombinedRows() {
  const merge = $("#mergeFiles").checked;
  const tables = Object.entries(state.tables);
  if (!tables.length) return [];
  if (!merge) { const [_, first] = tables[0]; return first.rows; }
  const all = []; for (const [name, t] of tables) t.rows.forEach(r => all.push({ __file: name, ...r }));
  return all;
}
function extractSeries(rows, xKey, yKeys, coerce) {
  const labels = rows.map(r => r[xKey]);
  const datasets = [];
  yKeys.forEach(y => {
    const data = rows.map(r => {
      const v = r[y];
      if (!coerce) return v;
      const n = toNumberMaybe(v);
      return Number.isFinite(n) ? n : null;
    });
    datasets.push({ label: y, data, borderWidth: 2, pointRadius: 2, tension: 0.2 });
  });
  return { labels, datasets };
}
function buildChart() {
  const xCol = $("#xCol").value;
  const yCols = $$("#yCols option:checked").map(o => o.value);
  const chartType = $("#chartType").value;
  const coerce = $("#coerce").checked;
  if (!xCol || !yCols.length) return showMsg("warn", "Elige una columna X y al menos una Y.");
  const rows = buildCombinedRows();
  if (!rows.length) return showMsg("warn", "Carga al menos un archivo primero.");
  const { labels, datasets } = extractSeries(rows, xCol, yCols, coerce);
  if (state.chart) { state.chart.destroy(); state.chart = null; }
  const ctx = document.getElementById("chartCanvas").getContext("2d");
  let data, options;
  if (chartType === "pie") {
    const y = yCols[0];
    const agg = {}; rows.forEach(r => { const key = String(r[xCol]); const num = Number.isFinite(toNumberMaybe(r[y])) ? toNumberMaybe(r[y]) : 0; agg[key] = (agg[key] || 0) + num; });
    data = { labels: Object.keys(agg), datasets: [{ label: y, data: Object.values(agg) }] };
    options = { responsive: true, plugins: { legend: { position: "bottom" } } };
  } else if (chartType === "scatter") {
    const y = yCols[0];
    const points = rows.map(r => ({ x: toNumberMaybe(r[xCol]), y: toNumberMaybe(r[y]) }));
    data = { datasets: [{ label: `${y} vs ${xCol}`, data: points, showLine: false, pointRadius: 3 }] };
    options = { scales: { x: { type: "linear", title: { display: true, text: xCol } }, y: { title: { display: true, text: y } } } };
  } else {
    data = { labels, datasets };
    options = { responsive: true, scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: false } }, plugins: { legend: { position: "bottom" } } };
  }
  state.chart = new Chart(ctx, { type: chartType === "scatter" ? "scatter" : chartType, data, options });
  $("#btnExportPNG").disabled = false;
  $("#btnExportCSV").disabled = false;
  state.lastConfig = { xCol, yCols, chartType, coerce, merge: $("#mergeFiles").checked };
  showMsg("ok", "Gráfico generado.");
}

// Export
function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
function exportPNG() {
  if (!state.chart) return;
  const url = state.chart.toBase64Image("image/png", 1.0);
  fetch(url).then(res => res.blob()).then(blob => downloadBlob(blob, "grafico.png", "image/png"));
}
function exportCombinedCSV() {
  const rows = buildCombinedRows();
  if (!rows.length) return showMsg("warn", "No hay filas para exportar.");
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => {
    const s = r[h] == null ? "" : String(r[h]);
    return (s.includes('"') || s.includes(",") || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","))).join("\n");
  downloadBlob(csv, "datos_combinados.csv", "text/csv");
}

// Carga local
$("#localFile").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true, transform: v => (typeof v === "string" ? v.trim() : v) });
    const rows = parsed.data;
    const headers = parsed.meta.fields || Object.keys(rows[0] || {});
    state.files.push({ name: file.name, url: "(local)", source: "local" });
    state.tables[file.name] = { rows, headers };
  }
  renderFiles(); populateColumnSelectors();
  showMsg("ok", `Se cargaron ${files.length} archivo(s) local(es).`);
});

// Botones
$("#btnList").addEventListener("click", listGithubCSVs);
$("#btnSaveCfg").addEventListener("click", saveOriginCfg);
$("#btnLoadCfg").addEventListener("click", loadOriginCfg);
$("#btnPreview").addEventListener("click", () => { const r = buildCombinedRows(); if (!r.length) return showMsg("warn", "Carga al menos un archivo primero."); const headers = Object.keys(r[0]||{});
  const head = `<tr>${headers.map(h => `<th class="px-3 py-2 text-left bg-gray-100">${h}</th>`).join("")}</tr>`;
  const body = r.slice(0, 10).map(row => `<tr class="hover:bg-gray-50">${headers.map(h => `<td class="px-3 py-1">${row[h] ?? ""}</td>`).join("")}</tr>`).join("");
  $("#rowsInfo").textContent = `${r.length} filas (combinadas) · mostrándo 10`;
  $("#preview").innerHTML = `<div class="overflow-auto rounded-lg border"><table class="min-w-full text-sm"><thead>${head}</thead><tbody>${body}</tbody></table></div><div class="text-xs text-gray-500 mt-2">Vista previa de datos combinados</div>`;
});
$("#btnBuild").addEventListener("click", buildChart);
$("#btnExportPNG").addEventListener("click", exportPNG);
$("#btnExportCSV").addEventListener("click", exportCombinedCSV);

// Init
initOrigin();

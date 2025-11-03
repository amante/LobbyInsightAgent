// Utilidades
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// Estado global simple
const state = {
  files: [],           // [{name, url, source:'github'|'local'}]
  tables: {},          // name -> {rows:[], headers:[]}
  combined: [],        // filas combinadas (si procede)
  chart: null,         // instancia Chart.js
  lastConfig: null
};

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

function saveOriginCfg() {
  const cfg = {
    owner: $("#owner").value.trim(),
    repo: $("#repo").value.trim(),
    branch: $("#branch").value.trim() || "main",
    folder: $("#folder").value.trim()
  };
  localStorage.setItem("gh_origin_cfg", JSON.stringify(cfg));
  showMsg("ok", "Origen guardado en este navegador.");
}

function loadOriginCfg() {
  const raw = localStorage.getItem("gh_origin_cfg");
  if (!raw) return showMsg("warn", "No hay origen guardado.");
  try {
    const cfg = JSON.parse(raw);
    $("#owner").value = cfg.owner || "";
    $("#repo").value = cfg.repo || "";
    $("#branch").value = cfg.branch || "main";
    $("#folder").value = cfg.folder || "";
    showMsg("ok", "Origen cargado.");
  } catch (e) {
    showMsg("error", "No se pudo cargar el origen guardado.");
  }
}

async function listGithubCSVs() {
  const owner = $("#owner").value.trim();
  const repo = $("#repo").value.trim();
  const branch = $("#branch").value.trim() || "main";
  const folder = $("#folder").value.trim();
  const token = $("#token").value.trim();

  if (!owner || !repo || !folder) {
    showMsg("warn", "Completa Owner, Repo y Carpeta.");
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(folder)}?ref=${encodeURIComponent(branch)}`;
  const headers = { "Accept": "application/vnd.github+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let data;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub API ${res.status}: ${t.slice(0, 200)}`);
    }
    data = await res.json();
  } catch (e) {
    console.error(e);
    showMsg("error", "No se pudo listar la carpeta en GitHub. Revisa permisos/ruta.");
    return;
  }

  // Filtrar CSVs
  const csvs = (Array.isArray(data) ? data : [])
    .filter(it => it.type === "file" && /\.csv$/i.test(it.name))
    .map(it => ({ name: it.name, url: it.download_url, source: "github" }));

  state.files = csvs;
  renderFiles();
  if (!csvs.length) {
    showMsg("warn", "No se encontraron archivos .csv en esa carpeta.");
  } else {
    showMsg("ok", `Se encontraron ${csvs.length} CSV(s).`);
  }
}

function renderFiles() {
  const wrap = $("#filesWrap");
  if (!state.files.length) {
    wrap.innerHTML = `<div class="text-sm text-gray-500">Sin archivos listados aún.</div>`;
    return;
  }

  const rows = state.files.map((f, idx) => {
    return `<tr class="hover:bg-gray-50">
      <td class="px-3 py-2 text-sm">${idx + 1}</td>
      <td class="px-3 py-2">${f.name}</td>
      <td class="px-3 py-2 text-xs text-gray-500">${f.source}</td>
      <td class="px-3 py-2">
        <button data-name="${f.name}" class="btnLoad px-3 py-1 rounded-lg border">Cargar</button>
      </td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `
    <div class="overflow-auto rounded-lg border">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-3 py-2 text-left">#</th>
            <th class="px-3 py-2 text-left">Archivo</th>
            <th class="px-3 py-2 text-left">Origen</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Listeners
  wrap.querySelectorAll(".btnLoad").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const name = e.currentTarget.dataset.name;
      const meta = state.files.find(x => x.name === name);
      if (!meta) return;
      await loadCSV(meta);
    });
  });
}

function detectHeaders(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
}

function toNumberMaybe(val) {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return NaN;
  const norm = val.replace(/\./g, "").replace(",", ".").trim(); // soporta 1.234,56 -> 1234.56
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}

async function loadCSV(meta) {
  if (meta.source === "local") {
    // Ya viene el contenido adjunto en meta.rows/meta.headers
    state.tables[meta.name] = { rows: meta.rows, headers: meta.headers };
    showPreview(meta.name);
    populateColumnSelectors();
    showMsg("ok", `Cargado ${meta.name} (${meta.rows.length} filas).`);
    return;
  }

  return new Promise((resolve) => {
    Papa.parse(meta.url, {
      download: true,
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      transform: val => (typeof val === "string" ? val.trim() : val),
      complete: (results) => {
        const rows = results.data;
        const headers = detectHeaders(rows);
        state.tables[meta.name] = { rows, headers };
        showPreview(meta.name);
        populateColumnSelectors();
        showMsg("ok", `Cargado ${meta.name} (${rows.length} filas).`);
        resolve();
      },
      error: (err) => {
        console.error(err);
        showMsg("error", `Error al leer ${meta.name}`);
        resolve();
      }
    });
  });
}

function showPreview(name) {
  const { rows = [], headers = [] } = state.tables[name] || {};
  const maxRows = 10;
  $("#rowsInfo").textContent = `${rows.length} filas · mostrándo ${Math.min(maxRows, rows.length)}`;

  const head = `<tr>${headers.map(h => `<th class="px-3 py-2 text-left bg-gray-100">${h}</th>`).join("")}</tr>`;
  const body = rows.slice(0, maxRows).map(r => {
    return `<tr class="hover:bg-gray-50">${headers.map(h => `<td class="px-3 py-1">${r[h] ?? ""}</td>`).join("")}</tr>`;
  }).join("");

  $("#preview").innerHTML = `
    <div class="overflow-auto rounded-lg border">
      <table class="min-w-full text-sm">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="text-xs text-gray-500 mt-2">Vista previa de ${name}</div>
  `;
}

function populateColumnSelectors() {
  // Construir union de headers de todos los archivos cargados
  const allHeaders = new Set();
  Object.values(state.tables).forEach(t => t.headers.forEach(h => allHeaders.add(h)));
  const headers = Array.from(allHeaders);

  const xSel = $("#xCol");
  const ySel = $("#yCols");
  xSel.innerHTML = "";
  ySel.innerHTML = "";

  headers.forEach(h => {
    const optX = document.createElement("option");
    optX.value = h; optX.textContent = h;
    xSel.appendChild(optX);

    const optY = document.createElement("option");
    optY.value = h; optY.textContent = h;
    ySel.appendChild(optY);
  });

  // Autoselección simple: primera col como X, primeras 1-2 numéricas como Y
  if (headers.length) {
    xSel.value = headers[0];
    // Buscar numéricas
    const sampleRows = Object.values(state.tables)[0]?.rows || [];
    const numericCandidates = headers.filter(h => sampleRows.some(r => Number.isFinite(toNumberMaybe(r[h]))));
    if (numericCandidates.length) {
      // Seleccionar hasta 2
      $$("#yCols option").forEach(o => o.selected = numericCandidates.slice(0, 2).includes(o.value));
    }
  }
}

function buildCombinedRows() {
  const merge = $("#mergeFiles").checked;
  const tables = Object.entries(state.tables);
  if (!tables.length) return [];

  if (!merge) {
    // Sólo primer archivo cargado
    const [_, first] = tables[0];
    return first.rows;
  }
  // Unir filas
  const all = [];
  for (const [name, t] of tables) {
    t.rows.forEach(r => all.push({ __file: name, ...r }));
  }
  return all;
}

function extractSeries(rows, xKey, yKeys, coerce) {
  const labels = rows.map(r => r[xKey]);
  const datasets = [];

  // Para cada columna Y, construir dataset
  yKeys.forEach(y => {
    const data = rows.map(r => {
      const v = r[y];
      if (!coerce) return v;
      const n = toNumberMaybe(v);
      return Number.isFinite(n) ? n : null;
    });

    datasets.push({
      label: y,
      data,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.2
    });
  });

  return { labels, datasets };
}

function buildChart() {
  const xCol = $("#xCol").value;
  const yCols = $$("#yCols option:checked").map(o => o.value);
  const chartType = $("#chartType").value;
  const coerce = $("#coerce").checked;

  if (!xCol || !yCols.length) {
    showMsg("warn", "Elige una columna X y al menos una Y.");
    return;
  }

  const rows = buildCombinedRows();
  if (!rows.length) {
    showMsg("warn", "Carga al menos un archivo primero.");
    return;
  }

  const { labels, datasets } = extractSeries(rows, xCol, yCols, coerce);

  // Destroy previo
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const ctx = document.getElementById("chartCanvas").getContext("2d");
  let data, options;

  if (chartType === "pie") {
    // Para pie, usar la primera Y, agrupar por X
    const y = yCols[0];
    const agg = {};
    rows.forEach(r => {
      const key = String(r[xCol]);
      const val = coerce ? toNumberMaybe(r[y]) : r[y];
      const num = Number.isFinite(val) ? Number(val) : 0;
      agg[key] = (agg[key] || 0) + num;
    });
    const labelsPie = Object.keys(agg);
    const dataPie = Object.values(agg);
    data = {
      labels: labelsPie,
      datasets: [{ label: y, data: dataPie }]
    };
    options = { responsive: true, plugins: { legend: { position: "bottom" } } };
  } else if (chartType === "scatter") {
    // Para scatter, usar primera Y como Y y X debe ser numérico si se desea escala lineal
    const y = yCols[0];
    const points = rows.map(r => ({
      x: coerce ? toNumberMaybe(r[xCol]) : r[xCol],
      y: coerce ? toNumberMaybe(r[y]) : r[y]
    }));
    data = {
      datasets: [{ label: `${y} vs ${xCol}`, data: points, showLine: false, pointRadius: 3 }]
    };
    options = {
      scales: {
        x: { type: "linear", title: { display: true, text: xCol } },
        y: { title: { display: true, text: y } }
      }
    };
  } else {
    // line / bar
    data = { labels, datasets };
    options = {
      responsive: true,
      scales: {
        x: { ticks: { autoSkip: true, maxRotation: 0 } },
        y: { beginAtZero: false }
      },
      plugins: { legend: { position: "bottom" } }
    };
  }

  state.chart = new Chart(ctx, { type: chartType === "scatter" ? "scatter" : chartType, data, options });
  $("#btnExportPNG").disabled = false;
  $("#btnExportCSV").disabled = false;

  state.lastConfig = {
    xCol, yCols, chartType, coerce, merge: $("#mergeFiles").checked
  };
  showMsg("ok", "Gráfico generado.");
}

function previewCombined() {
  const rows = buildCombinedRows();
  if (!rows.length) {
    showMsg("warn", "Carga al menos un archivo primero.");
    return;
  }
  // Mostrar columnas comunes
  const headers = Object.keys(rows[0] || {});
  const head = `<tr>${headers.map(h => `<th class="px-3 py-2 text-left bg-gray-100">${h}</th>`).join("")}</tr>`;
  const body = rows.slice(0, 10).map(r => {
    return `<tr class="hover:bg-gray-50">${headers.map(h => `<td class="px-3 py-1">${r[h] ?? ""}</td>`).join("")}</tr>`;
  }).join("");

  $("#rowsInfo").textContent = `${rows.length} filas (combinadas) · mostrándo 10`;
  $("#preview").innerHTML = `
    <div class="overflow-auto rounded-lg border">
      <table class="min-w-full text-sm">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="text-xs text-gray-500 mt-2">Vista previa de datos combinados</div>
  `;
}

// Export helpers
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function exportPNG() {
  if (!state.chart) return;
  const url = state.chart.toBase64Image("image/png", 1.0);
  // Convert base64 to blob
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "grafico.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
}

function exportCombinedCSV() {
  const rows = buildCombinedRows();
  if (!rows.length) {
    showMsg("warn", "No hay filas para exportar.");
    return;
  }
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => {
    const s = r[h] == null ? "" : String(r[h]);
    // CSV escaping
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
    const meta = { name: file.name, url: "(local)", source: "local", rows, headers };
    state.files.push({ name: file.name, url: "(local)", source: "local" });
    state.tables[file.name] = { rows, headers };
  }
  renderFiles();
  populateColumnSelectors();
  showMsg("ok", `Se cargaron ${files.length} archivo(s) local(es).`);
});

// Botones principales
$("#btnList").addEventListener("click", listGithubCSVs);
$("#btnSaveCfg").addEventListener("click", saveOriginCfg);
$("#btnLoadCfg").addEventListener("click", loadOriginCfg);
$("#btnPreview").addEventListener("click", previewCombined);
$("#btnBuild").addEventListener("click", buildChart);
$("#btnExportPNG").addEventListener("click", exportPNG);
$("#btnExportCSV").addEventListener("click", exportCombinedCSV);

// Cargar origen guardado si existe
loadOriginCfg();

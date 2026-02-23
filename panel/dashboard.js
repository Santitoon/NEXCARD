(() => {
  // ===== CONFIG =====
  const API_BASE = "https://script.google.com/macros/s/AKfycbx7ghGSC47jyKY5ArI2s1JpO3UILEHVzmfaHxYxG3sLYfN3QDyFYWnXFStRLHvdJGtXRQ/exec";
  const TOKEN_KEY = "nexcard_token";
  const PAGE_SIZE = 20;

  // ===== DOM =====
  const whoEl = document.getElementById("who");
  const empresaIdEl = document.getElementById("empresaId");

  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  const viewTableBtn = document.getElementById("viewTableBtn");
  const viewCardsBtn = document.getElementById("viewCardsBtn");
  const tableView = document.getElementById("tableView");
  const cardsView = document.getElementById("cardsView");
  const cardsContainer = document.getElementById("cardsContainer");

  const headEl = document.getElementById("contactsHead");
  const bodyEl = document.getElementById("contactsBody");
  const emptyBox = document.getElementById("emptyBox");

  const searchEl = document.getElementById("contactsSearch");
  const filterEstadoEl = document.getElementById("filterEstado");
  const filterVendedorEl = document.getElementById("filterVendedor");
  const filterInteresEl = document.getElementById("filterInteres");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageInfo = document.getElementById("pageInfo");
  const rowsInfo = document.getElementById("rowsInfo");

  // Modal
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalActions = document.getElementById("modalActions");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  // KPI
  const kpiTotal = document.getElementById("kpiTotal");
  const kpiHoy = document.getElementById("kpiHoy");
  const kpiSemana = document.getElementById("kpiSemana");
  const kpiMes = document.getElementById("kpiMes");

  // ===== STATE =====
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let empresa_id = "";

  let rawHeaders = [];
  let rawRows = [];        // [{Header:Value}]
  let visibleHeaders = []; // headers sin ID
  let filteredRows = [];
  let currentPage = 1;
  let totalPages = 1;

  // headers detectados
  let idHeaderName = null;
  let dateHeaderName = null;
  let vendedorHeaderName = null;
  let interesHeaderName = null;

  // Estado
  const ESTADOS = ["Nuevo", "Contactado", "Cerrado"]; // si no hay columna Estado en Sheet, la creamos virtualmente (se guarda solo si existe la columna)
  let estadoHeaderName = null;

  // ===== Helpers =====
  function getParam(name) {
    const u = new URLSearchParams(location.search);
    return (u.get(name) || "").trim();
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      window[cb] = (data) => {
        try { delete window[cb]; } catch (_) {}
        s.remove();
        resolve(data);
      };
      s.onerror = () => {
        try { delete window[cb]; } catch (_) {}
        s.remove();
        reject(new Error("No se pudo conectar con el servidor."));
      };
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(s);
    });
  }

  function norm(s) { return String(s || "").trim().toLowerCase(); }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseDate(value) {
    if (value == null) return null;
    if (value instanceof Date && !isNaN(value.getTime())) return value;

    const s = String(value).trim();
    if (!s) return null;

    const d1 = new Date(s);
    if (!isNaN(d1.getTime())) return d1;

    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]) - 1;
      let yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      const d2 = new Date(yy, mm, dd);
      if (!isNaN(d2.getTime())) return d2;
    }
    return null;
  }

  function findHeader(headers, candidates) {
    const low = headers.map(h => norm(h));
    for (const c of candidates) {
      const idx = low.indexOf(norm(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), 1800);
  }

  function openModal(title, bodyHTML, actionsHTML) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML || "";
    modalActions.innerHTML = actionsHTML || "";
    modalBackdrop.classList.add("show");
  }

  function closeModal() {
    modalBackdrop.classList.remove("show");
    modalBody.innerHTML = "";
    modalActions.innerHTML = "";
  }

  modalCloseBtn?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  function requireSessionOrRedirect() {
    if (!token) {
      location.href = "login.html";
      return false;
    }
    return true;
  }

  // ===== API =====
  async function fetchMe() {
    const qs = new URLSearchParams({ action: "me", token });
    const data = await jsonp(`${API_BASE}?${qs.toString()}`);
    if (!data || data.ok !== true) throw new Error(data?.message || "No se pudo validar sesión.");
    return data; // {ok, email, role}
  }

  async function fetchLeads() {
    const qs = new URLSearchParams({ action: "listLeads", token, empresa_id });
    const data = await jsonp(`${API_BASE}?${qs.toString()}`);
    if (!data || data.ok !== true) throw new Error(data?.message || "No se pudo cargar leads.");
    return data; // {ok, headers, rows}
  }

  async function apiSaveLead(rowObj) {
    const qs = new URLSearchParams({
      action: "saveLead",
      token,
      empresa_id,
      data: JSON.stringify(rowObj)
    });
    const data = await jsonp(`${API_BASE}?${qs.toString()}`);
    if (!data || data.ok !== true) throw new Error(data?.message || "No se pudo guardar.");
    return data; // {ok, mode, id}
  }

  async function apiDeleteLead(id) {
    const qs = new URLSearchParams({
      action: "deleteLead",
      token,
      empresa_id,
      id
    });
    const data = await jsonp(`${API_BASE}?${qs.toString()}`);
    if (!data || data.ok !== true) throw new Error(data?.message || "No se pudo borrar.");
    return data;
  }

  // ===== Detect columns =====
  function detectColumns(headers) {
    rawHeaders = headers.slice();

    idHeaderName = findHeader(headers, ["ID", "Id", "id"]);
    dateHeaderName = findHeader(headers, ["Fecha", "fecha", "Timestamp", "timestamp", "created_at", "Created At"]);
    vendedorHeaderName = findHeader(headers, ["Vendedor", "vendedor", "Seller", "seller"]);
    interesHeaderName = findHeader(headers, ["Interés", "interés", "Interes", "interes", "Intereses", "intereses", "Servicio", "servicio"]);
    estadoHeaderName = findHeader(headers, ["Estado", "estado", "Status", "status"]);

    visibleHeaders = headers.filter(h => h !== idHeaderName);
  }

  // ===== KPI =====
  function computeKPIs(rows) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msDay = 24 * 60 * 60 * 1000;

    let total = rows.length;
    let hoy = 0, semana = 0, mes = 0;

    for (const r of rows) {
      const d = dateHeaderName ? parseDate(r[dateHeaderName]) : null;
      if (!d) continue;
      const diff = now.getTime() - d.getTime();
      if (d >= startOfToday) hoy++;
      if (diff <= 7 * msDay) semana++;
      if (diff <= 30 * msDay) mes++;
    }

    kpiTotal.textContent = String(total);
    kpiHoy.textContent = String(hoy);
    kpiSemana.textContent = String(semana);
    kpiMes.textContent = String(mes);
  }

  // ===== Filters =====
  function fillSelectOptions(selectEl, values, placeholderText) {
    const current = selectEl.value || "";
    selectEl.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholderText;
    selectEl.appendChild(opt0);

    for (const v of values) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      selectEl.appendChild(o);
    }

    if ([...selectEl.options].some(o => o.value === current)) selectEl.value = current;
    else selectEl.value = "";
  }

  function buildFilterLists() {
    // Estado
    fillSelectOptions(filterEstadoEl, ESTADOS, "Estado: Todos");

    // Vendedor / Interés desde datos
    const vendSet = new Set();
    const intSet = new Set();

    if (vendedorHeaderName) {
      for (const r of rawRows) {
        const v = String(r[vendedorHeaderName] ?? "").trim();
        if (v) vendSet.add(v);
      }
    }
    if (interesHeaderName) {
      for (const r of rawRows) {
        const v = String(r[interesHeaderName] ?? "").trim();
        if (v) intSet.add(v);
      }
    }

    fillSelectOptions(filterVendedorEl, [...vendSet].sort((a,b)=>a.localeCompare(b)), "Vendedor: Todos");
    fillSelectOptions(filterInteresEl, [...intSet].sort((a,b)=>a.localeCompare(b)), "Interés/Servicio: Todos");
  }

  // ===== Views Toggle =====
  function setView(mode) {
    if (mode === "table") {
      viewTableBtn.classList.add("active");
      viewCardsBtn.classList.remove("active");
      viewTableBtn.setAttribute("aria-selected", "true");
      viewCardsBtn.setAttribute("aria-selected", "false");
      tableView.classList.remove("hidden");
      cardsView.classList.add("hidden");
      localStorage.setItem("nexcard_view_mode", "table");
    } else {
      viewCardsBtn.classList.add("active");
      viewTableBtn.classList.remove("active");
      viewCardsBtn.setAttribute("aria-selected", "true");
      viewTableBtn.setAttribute("aria-selected", "false");
      cardsView.classList.remove("hidden");
      tableView.classList.add("hidden");
      localStorage.setItem("nexcard_view_mode", "cards");
    }
  }

  // ===== Table rendering =====
  function buildHeaderRow() {
    headEl.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const h of visibleHeaders) {
      const th = document.createElement("th");
      th.textContent = h;
      frag.appendChild(th);
    }

    const thA = document.createElement("th");
    thA.textContent = "Acciones";
    frag.appendChild(thA);

    headEl.appendChild(frag);
  }

  function rowEstado(row) {
    // Si existe columna Estado en Sheet, úsala.
    if (estadoHeaderName) {
      const s = String(row[estadoHeaderName] ?? "").trim();
      return s || "Nuevo";
    }
    // Si no existe, lo mostramos como "Nuevo" (pero NO se puede guardar en la hoja sin esa columna)
    return "Nuevo";
  }

  function estadoToClass(s) {
    const t = norm(s);
    if (t.includes("contact")) return "contacted";
    if (t.includes("cerr")) return "closed";
    return "new";
  }

  function applySortAndFilters() {
    let rows = rawRows.slice();

    // Sort by date desc
    if (dateHeaderName) {
      rows.sort((a, b) => {
        const da = parseDate(a[dateHeaderName])?.getTime() ?? 0;
        const db = parseDate(b[dateHeaderName])?.getTime() ?? 0;
        return db - da;
      });
    }

    // Filters
    const est = filterEstadoEl.value.trim();
    const vend = filterVendedorEl.value.trim();
    const inte = filterInteresEl.value.trim();

    if (est) rows = rows.filter(r => rowEstado(r) === est);
    if (vend && vendedorHeaderName) rows = rows.filter(r => String(r[vendedorHeaderName] ?? "").trim() === vend);
    if (inte && interesHeaderName) rows = rows.filter(r => String(r[interesHeaderName] ?? "").trim() === inte);

    // Search across visible columns
    const q = (searchEl.value || "").trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => {
        for (const h of visibleHeaders) {
          const val = String(r[h] ?? "").toLowerCase();
          if (val.includes(q)) return true;
        }
        return false;
      });
    }

    filteredRows = rows;
    currentPage = 1;
    renderPage();
  }

  function renderPage() {
    totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageRows = filteredRows.slice(start, end);

    // empty
    if (!filteredRows.length) {
      emptyBox.textContent = "No hay resultados con esos filtros.";
      emptyBox.classList.remove("hidden");
    } else {
      emptyBox.classList.add("hidden");
    }

    // render table
    bodyEl.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const row of pageRows) {
      const tr = document.createElement("tr");

      for (const h of visibleHeaders) {
        const td = document.createElement("td");
        td.innerHTML = escapeHtml(row[h]);
        tr.appendChild(td);
      }

      const id = idHeaderName ? String(row[idHeaderName] ?? "").trim() : "";
      const tdA = document.createElement("td");
      tdA.innerHTML = `
        <button class="mini-btn" data-act="view" data-id="${escapeHtml(id)}">Ver</button>
        <button class="mini-btn" data-act="edit" data-id="${escapeHtml(id)}">Editar</button>
        <button class="mini-btn" data-act="status" data-id="${escapeHtml(id)}">Estado</button>
        <button class="mini-btn mini-danger" data-act="del" data-id="${escapeHtml(id)}">Borrar</button>
      `;
      tr.appendChild(tdA);

      frag.appendChild(tr);
    }
    bodyEl.appendChild(frag);

    // render cards
    cardsContainer.innerHTML = "";
    for (const row of pageRows) {
      const id = idHeaderName ? String(row[idHeaderName] ?? "").trim() : "";
      const nombre = findHeader(rawHeaders, ["Nombre","nombre"]) ? row[findHeader(rawHeaders, ["Nombre","nombre"])] : (row["Nombre"] || row["nombre"] || "");
      const correo = findHeader(rawHeaders, ["Correo","correo","Email","email"]) ? row[findHeader(rawHeaders, ["Correo","correo","Email","email"])] : (row["Correo"] || row["email"] || "");
      const tel = findHeader(rawHeaders, ["Teléfono","telefono","Tel","tel"]) ? row[findHeader(rawHeaders, ["Teléfono","telefono","Tel","tel"])] : (row["Teléfono"] || row["telefono"] || "");
      const vend = vendedorHeaderName ? (row[vendedorHeaderName] || "") : "";
      const intv = interesHeaderName ? (row[interesHeaderName] || "") : "";
      const fecha = dateHeaderName ? (row[dateHeaderName] || "") : "";

      const est = rowEstado(row);
      const estClass = estadoToClass(est);

      const card = document.createElement("div");
      card.className = "lead-card";
      card.innerHTML = `
        <div class="lead-top">
          <div>
            <div class="lead-name">${escapeHtml(nombre || "Sin nombre")}</div>
            <div class="muted" style="margin-top:4px;">${escapeHtml(correo || "")}</div>
          </div>
          <span class="pill ${estClass}">${escapeHtml(est)}</span>
        </div>

        <div class="lead-meta">
          <div><span>Teléfono</span>${escapeHtml(tel || "—")}</div>
          <div><span>Vendedor</span>${escapeHtml(String(vend || "—"))}</div>
          <div><span>Interés</span>${escapeHtml(String(intv || "—"))}</div>
          <div><span>Fecha</span>${escapeHtml(String(fecha || "—"))}</div>
        </div>

        <div class="lead-actions">
          <button class="mini-btn" data-act="view" data-id="${escapeHtml(id)}">Ver</button>
          <button class="mini-btn" data-act="edit" data-id="${escapeHtml(id)}">Editar</button>
          <button class="mini-btn" data-act="status" data-id="${escapeHtml(id)}">Estado</button>
          <button class="mini-btn mini-danger" data-act="del" data-id="${escapeHtml(id)}">Borrar</button>
        </div>
      `;
      cardsContainer.appendChild(card);
    }

    // pager
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    pageInfo.textContent = `Página ${currentPage} / ${totalPages}`;
    rowsInfo.textContent = `${filteredRows.length} resultado(s)`;
  }

  // ===== Actions =====
  function getRowById(id) {
    const sid = String(id || "").trim();
    if (!sid || !idHeaderName) return null;
    return rawRows.find(r => String(r[idHeaderName] ?? "").trim() === sid) || null;
  }

  function buildDetailHTML(row) {
    const items = rawHeaders
      .filter(h => h)
      .map(h => {
        const v = row[h];
        return `<div class="fg">
          <label>${escapeHtml(h)}</label>
          <div style="padding:10px 12px;border:1px solid rgba(6,26,45,.12);border-radius:14px;background:rgba(255,255,255,.92);font-weight:700;">
            ${escapeHtml(v)}
          </div>
        </div>`;
      }).join("");

    return `<div class="form-grid">${items}</div>`;
  }

  function buildEditFormHTML(row) {
    const fields = rawHeaders
      .filter(h => h && h !== idHeaderName)
      .map(h => {
        const v = String(row[h] ?? "");
        const isLong = v.length > 70 || /observ|nota|coment|direc/i.test(h);
        return `<div class="fg">
          <label>${escapeHtml(h)}</label>
          ${isLong
            ? `<textarea data-field="${escapeHtml(h)}">${escapeHtml(v)}</textarea>`
            : `<input data-field="${escapeHtml(h)}" value="${escapeHtml(v)}" />`
          }
        </div>`;
      }).join("");

    return `<div class="form-grid">${fields}</div>`;
  }

  function buildEstadoHTML(current) {
    const options = ESTADOS.map(s => `<option ${s===current?'selected':''} value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    const note = estadoHeaderName
      ? `<div class="muted" style="margin-bottom:10px;">Este estado se guardará en tu Google Sheet.</div>`
      : `<div class="muted" style="margin-bottom:10px;">Tu hoja NO tiene columna <b>Estado</b>. Puedes ver el estado aquí, pero no se guardará hasta que agregues esa columna.</div>`;

    return `
      ${note}
      <div class="fg">
        <label>Estado</label>
        <select id="estadoSelect">${options}</select>
      </div>
    `;
  }

  async function handleView(id) {
    const row = getRowById(id);
    if (!row) return toast("No se encontró el registro.");
    openModal(
      "Detalle del contacto",
      buildDetailHTML(row),
      `<button class="btn btn-light btn-small" id="modalOkBtn" type="button">Listo</button>`
    );
    document.getElementById("modalOkBtn")?.addEventListener("click", closeModal);
  }

  async function handleEdit(id) {
    const row = getRowById(id);
    if (!row) return toast("No se encontró el registro.");

    openModal(
      "Editar contacto",
      buildEditFormHTML(row),
      `
        <button class="btn btn-light btn-small" id="modalCancelBtn" type="button">Cancelar</button>
        <button class="btn btn-primary btn-small" id="modalSaveBtn" type="button">Guardar</button>
      `
    );

    document.getElementById("modalCancelBtn")?.addEventListener("click", closeModal);

    document.getElementById("modalSaveBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("modalSaveBtn");
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> Guardando…`;

      try {
        const updated = { ...row };
        const inputs = modalBody.querySelectorAll("[data-field]");
        inputs.forEach(el => {
          const key = el.getAttribute("data-field");
          updated[key] = el.value;
        });

        if (idHeaderName) updated[idHeaderName] = row[idHeaderName];
        await apiSaveLead(updated);

        toast("Guardado ✅");
        closeModal();
        await reloadAll(false);
      } catch (e) {
        toast(String(e?.message || e));
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  }

  async function handleEstado(id) {
    const row = getRowById(id);
    if (!row) return toast("No se encontró el registro.");

    const current = rowEstado(row);

    openModal(
      "Cambiar estado",
      buildEstadoHTML(current),
      `
        <button class="btn btn-light btn-small" id="estadoCancelBtn" type="button">Cancelar</button>
        <button class="btn btn-primary btn-small" id="estadoSaveBtn" type="button">Guardar</button>
      `
    );

    document.getElementById("estadoCancelBtn")?.addEventListener("click", closeModal);

    document.getElementById("estadoSaveBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("estadoSaveBtn");
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> Guardando…`;

      try {
        const sel = document.getElementById("estadoSelect");
        const newEstado = sel ? sel.value : "Nuevo";

        // Si la hoja tiene columna Estado -> se guarda
        if (estadoHeaderName) {
          const updated = { ...row };
          updated[estadoHeaderName] = newEstado;
          if (idHeaderName) updated[idHeaderName] = row[idHeaderName];
          await apiSaveLead(updated);
          toast("Estado guardado ✅");
        } else {
          toast("Tu hoja no tiene columna Estado (no se guardó).");
        }

        closeModal();
        await reloadAll(false);
      } catch (e) {
        toast(String(e?.message || e));
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  }

  async function handleDelete(id) {
    if (!id) return toast("ID faltante.");
    openModal(
      "Confirmar borrado",
      `<div class="muted" style="font-size:14px;font-weight:800;">¿Seguro que deseas borrar este contacto?</div>
       <div class="muted" style="margin-top:6px;">Esta acción no se puede deshacer.</div>`,
      `
        <button class="btn btn-light btn-small" id="modalNoBtn" type="button">Cancelar</button>
        <button class="btn btn-danger btn-small" id="modalYesBtn" type="button">Borrar</button>
      `
    );

    document.getElementById("modalNoBtn")?.addEventListener("click", closeModal);
    document.getElementById("modalYesBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("modalYesBtn");
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> Borrando…`;

      try {
        await apiDeleteLead(id);
        toast("Borrado ✅");
        closeModal();
        await reloadAll(false);
      } catch (e) {
        toast(String(e?.message || e));
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  }

  // Delegación: clicks desde tabla y tarjetas (comparten data-act / data-id)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    if (!act) return;

    if (act === "view") handleView(id);
    if (act === "edit") handleEdit(id);
    if (act === "status") handleEstado(id);
    if (act === "del") handleDelete(id);
  });

  // ===== Export CSV =====
  function exportCSV() {
    const rows = filteredRows.slice();
    const headers = visibleHeaders.slice();
    if (!rows.length) return toast("No hay datos para exportar.");

    const esc = (v) => {
      const s = String(v ?? "");
      if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };

    const lines = [];
    lines.push(headers.map(esc).join(","));
    for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `nexcard_${empresa_id || "empresa"}_leads.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("CSV descargado ✅");
  }

  // ===== Events =====
  function wireEvents() {
    logoutBtn?.addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
      toast("Sesión cerrada");
      setTimeout(() => (location.href = "login.html"), 200);
    });

    refreshBtn?.addEventListener("click", () => reloadAll(true));

    viewTableBtn?.addEventListener("click", () => setView("table"));
    viewCardsBtn?.addEventListener("click", () => setView("cards"));

    searchEl?.addEventListener("input", applySortAndFilters);
    filterEstadoEl?.addEventListener("change", applySortAndFilters);
    filterVendedorEl?.addEventListener("change", applySortAndFilters);
    filterInteresEl?.addEventListener("change", applySortAndFilters);

    clearFiltersBtn?.addEventListener("click", () => {
      searchEl.value = "";
      filterEstadoEl.value = "";
      filterVendedorEl.value = "";
      filterInteresEl.value = "";
      applySortAndFilters();
    });

    exportCsvBtn?.addEventListener("click", exportCSV);

    prevPageBtn?.addEventListener("click", () => {
      if (currentPage > 1) currentPage--;
      renderPage();
    });

    nextPageBtn?.addEventListener("click", () => {
      if (currentPage < totalPages) currentPage++;
      renderPage();
    });
  }

  // ===== Reload =====
  async function reloadAll(showToast) {
    try {
      whoEl.textContent = "Cargando datos…";

      const me = await fetchMe();
      whoEl.textContent = `${me.email} • ${String(me.role || "").toUpperCase()}`;

      const leads = await fetchLeads();
      detectColumns(leads.headers || []);
      rawRows = Array.isArray(leads.rows) ? leads.rows : [];

      buildHeaderRow();
      buildFilterLists();
      computeKPIs(rawRows);
      applySortAndFilters();

      if (showToast) toast("Actualizado ✅");
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || err);
      toast(msg);

      if (msg.toLowerCase().includes("token")) {
        localStorage.removeItem(TOKEN_KEY);
        setTimeout(() => (location.href = "login.html"), 300);
      }
    }
  }

  // ===== Init =====
  async function init() {
    if (!requireSessionOrRedirect()) return;

    empresa_id = (getParam("empresa_id") || "").trim().toLowerCase();

    if (!empresa_id) {
      empresaIdEl.textContent = "—";
      whoEl.textContent = "Falta empresa_id en la URL";
      emptyBox.textContent = "Abre el dashboard así: dashboard.html?empresa_id=trampaclean";
      emptyBox.classList.remove("hidden");
      // igual conectamos botones para que puedas cerrar sesión
      wireEvents();
      return;
    }

    empresaIdEl.textContent = empresa_id;

    wireEvents();

    // modo por defecto
    const savedMode = localStorage.getItem("nexcard_view_mode") || "table";
    setView(savedMode === "cards" ? "cards" : "table");

    await reloadAll(false);
  }

  init();
})();

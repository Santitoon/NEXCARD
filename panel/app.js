/* NEXCARD Panel — frontend helpers (GitHub Pages)
   - Modo DEMO si NEXCARD_CONFIG.API_BASE está vacío.
   - Con API: espera endpoints:
       POST  {API_BASE}?action=login   body: {email,password}
       GET   {API_BASE}?action=me      headers: Authorization: Bearer <token>
       GET   {API_BASE}?action=contacts&q=&vendedor=&from=&to=&page=&pageSize=
       GET   {API_BASE}?action=vendedores
       GET   {API_BASE}?action=stats
       GET   {API_BASE}?action=exportCSV (mismos filtros, retorna text/csv)
*/

(function(){
  const CFG = window.NEXCARD_CONFIG || {};
  const API_BASE = (CFG.API_BASE || "").trim();
  const TOKEN_KEY = CFG.TOKEN_KEY || "nexcard_token_v1";

  const NexcardUI = {
    escape(s){
      return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    },
    escapeAttr(s){
      // Minimal attribute escaping
      return String(s ?? "").replaceAll('"',"&quot;").replaceAll("<","&lt;");
    },
    toast(title, msg){
      const t = document.getElementById("toast");
      const tt = document.getElementById("toastTitle");
      const tm = document.getElementById("toastMsg");
      if (!t || !tt || !tm) return alert(title + "\n" + msg);
      tt.textContent = title || "Aviso";
      tm.textContent = msg || "";
      t.classList.add("show");
      clearTimeout(t.__tmr);
      t.__tmr = setTimeout(() => t.classList.remove("show"), 4200);
    },
    downloadText(text, filename, mime){
      const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6000);
    }
  };

  // ---- DEMO DATA ----
  function demoNowMinus(days){
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }
  const DEMO = {
    users: [
      { email: "demo@nexcard.dev", password: "demo123", company_id: "demo", company_name: "Empresa Demo", role: "admin" }
    ],
    contacts: Array.from({length: 63}).map((_,i) => {
      const vendors = ["DEMO","Ana","Luis","Mario"];
      const v = vendors[i % vendors.length];
      return {
        timestamp: demoNowMinus(i % 12),
        tarjeta_id: "CARD-" + String(1000 + (i%9)).padStart(4,"0"),
        vendedor_id: v,
        nombre: ["Cliente","Prospecto","Lead"][i%3] + " " + (i+1),
        telefono: "6" + String(4000000 + i).slice(0,7),
        email: `cliente${i+1}@mail.com`,
        interes: ["Instalación","Mantenimiento","Inspección","Paquete completo"][i%4]
      };
    })
  };

  function isDemo(){ return !API_BASE; }

  // ---- HTTP helpers ----
  async function httpJson(url, opts){
    const res = await fetch(url, opts);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok){
      let msg = `HTTP ${res.status}`;
      try{
        if (ct.includes("application/json")) {
          const j = await res.json();
          msg = j.message || j.error || msg;
        } else {
          const t = await res.text();
          msg = t || msg;
        }
      }catch{}
      throw new Error(msg);
    }
    if (ct.includes("application/json")) return await res.json();
    return await res.text();
  }

  function getToken(){ return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(token){
    sessionStorage.setItem(TOKEN_KEY, token);
    // Optional: keep in localStorage for convenience
    localStorage.setItem(TOKEN_KEY, token);
  }
  function clearToken(){
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  const NexcardAuth = {
    async login(email, password){
      if (isDemo()){
        const u = DEMO.users.find(x => x.email === email && x.password === password);
        if (!u) throw new Error("Credenciales incorrectas (DEMO).");
        setToken("demo-token");
        localStorage.setItem("nexcard_demo_email", u.email);
        localStorage.setItem("nexcard_demo_company", u.company_id);
        return true;
      }

      const url = `${API_BASE}?action=login`;
      const j = await httpJson(url, {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!j || !j.token) throw new Error("Respuesta inválida del servidor.");
      setToken(j.token);
      return true;
    },
    logout(){
      clearToken();
      localStorage.removeItem("nexcard_demo_email");
      localStorage.removeItem("nexcard_demo_company");
    },
    async requireAuth(){
      const token = getToken();
      if (!token){
        // redirect if we're in panel
        if (location.pathname.includes("/panel/")){
          location.href = "login.html";
          return;
        }
        throw new Error("No autenticado.");
      }
      return true;
    }
  };

  const NexcardAPI = {
    isDemo,
    async me(){
      if (isDemo()){
        const email = localStorage.getItem("nexcard_demo_email") || "demo@nexcard.dev";
        const u = DEMO.users.find(x => x.email === email) || DEMO.users[0];
        return { email: u.email, company_id: u.company_id, company_name: u.company_name, role: u.role, mode: "DEMO" };
      }
      const token = getToken();
      const url = `${API_BASE}?action=me`;
      return await httpJson(url, {
        headers: { "Authorization": "Bearer " + token }
      });
    },
    async vendedores(){
      if (isDemo()){
        const set = new Set(DEMO.contacts.map(r => r.vendedor_id).filter(Boolean));
        return Array.from(set).sort();
      }
      const token = getToken();
      const url = `${API_BASE}?action=vendedores`;
      const j = await httpJson(url, { headers: { "Authorization": "Bearer " + token } });
      return j.vendedores || j.list || [];
    },
    async stats(){
      if (isDemo()){
        const now = new Date();
        const startToday = new Date(now); startToday.setHours(0,0,0,0);
        const start7 = new Date(now); start7.setDate(start7.getDate()-7);
        const today = DEMO.contacts.filter(r => new Date(r.timestamp) >= startToday).length;
        const last7 = DEMO.contacts.filter(r => new Date(r.timestamp) >= start7).length;
        return { today, last7, total: DEMO.contacts.length };
      }
      const token = getToken();
      const url = `${API_BASE}?action=stats`;
      return await httpJson(url, { headers: { "Authorization": "Bearer " + token } });
    },
    async contacts(filters){
      const f = filters || {};
      if (isDemo()){
        let rows = [...DEMO.contacts];

        if (f.q){
          const q = f.q.toLowerCase();
          rows = rows.filter(r =>
            String(r.nombre||"").toLowerCase().includes(q) ||
            String(r.email||"").toLowerCase().includes(q) ||
            String(r.telefono||"").toLowerCase().includes(q) ||
            String(r.tarjeta_id||"").toLowerCase().includes(q) ||
            String(r.vendedor_id||"").toLowerCase().includes(q)
          );
        }
        if (f.vendedor){
          rows = rows.filter(r => String(r.vendedor_id) === String(f.vendedor));
        }
        if (f.from){
          const d = new Date(f.from); d.setHours(0,0,0,0);
          rows = rows.filter(r => new Date(r.timestamp) >= d);
        }
        if (f.to){
          const d = new Date(f.to); d.setHours(23,59,59,999);
          rows = rows.filter(r => new Date(r.timestamp) <= d);
        }

        rows.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        const page = Math.max(1, Number(f.page || 1));
        const pageSize = Math.max(1, Number(f.pageSize || 25));
        const total = rows.length;
        const start = (page-1)*pageSize;
        const slice = rows.slice(start, start+pageSize);
        return { total, rows: slice };
      }

      const token = getToken();
      const qs = new URLSearchParams();
      qs.set("action","contacts");
      if (f.q) qs.set("q", f.q);
      if (f.vendedor) qs.set("vendedor", f.vendedor);
      if (f.from) qs.set("from", f.from);
      if (f.to) qs.set("to", f.to);
      qs.set("page", String(f.page || 1));
      qs.set("pageSize", String(f.pageSize || 25));

      const url = `${API_BASE}?${qs.toString()}`;
      return await httpJson(url, { headers: { "Authorization": "Bearer " + token } });
    },
    async exportCSV(filters){
      const f = filters || {};
      if (isDemo()){
        const res = await this.contacts({ ...f, page: 1, pageSize: 100000 });
        const rows = res.rows || [];
        const cols = ["timestamp","tarjeta_id","vendedor_id","nombre","telefono","email","interes"];
        const esc = (v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
        };
        const lines = [
          cols.join(","),
          ...rows.map(r => cols.map(c => esc(r[c])).join(","))
        ];
        return lines.join("\n");
      }

      const token = getToken();
      const qs = new URLSearchParams();
      qs.set("action","exportCSV");
      if (f.q) qs.set("q", f.q);
      if (f.vendedor) qs.set("vendedor", f.vendedor);
      if (f.from) qs.set("from", f.from);
      if (f.to) qs.set("to", f.to);

      const url = `${API_BASE}?${qs.toString()}`;
      // could return text/csv
      return await httpJson(url, { headers: { "Authorization": "Bearer " + token } });
    }
  };

  window.NexcardUI = NexcardUI;
  window.NexcardAuth = NexcardAuth;
  window.NexcardAPI = NexcardAPI;
})();

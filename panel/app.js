
(function(){
  const CFG = window.NEXCARD_CONFIG || {};
  const API_BASE = (CFG.API_BASE || "").trim();
  const TOKEN_KEY = CFG.TOKEN_KEY || "nexcard_token_v1";

  function jsonp(url){
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(16).slice(2);
      const u = new URL(url);
      u.searchParams.set("callback", cb);

      const script = document.createElement("script");
      window[cb] = (data) => {
        try { delete window[cb]; } catch {}
        script.remove();
        resolve(data);
      };
      script.onerror = () => {
        try { delete window[cb]; } catch {}
        script.remove();
        reject(new Error("No se pudo conectar con el servidor."));
      };
      script.src = u.toString();
      document.body.appendChild(script);
    });
  }

  function tokenGet(){ return localStorage.getItem(TOKEN_KEY) || ""; }
  function tokenSet(t){ localStorage.setItem(TOKEN_KEY, t); }
  function tokenClear(){ localStorage.removeItem(TOKEN_KEY); }

  function apiUrl(params){
    if (!API_BASE || API_BASE.includes("PEGA_AQUI")) throw new Error("Configura el panel antes de iniciar sesión.");
    const u = new URL(API_BASE);
    Object.entries(params || {}).forEach(([k,v])=>{
      if (v === undefined || v === null || v === "") return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  async function apiCall(params){
    const j = await jsonp(apiUrl(params));
    if (!j || j.ok === false) throw new Error(j?.message || "Error.");
    return j;
  }

  window.Nexcard = {
    tokenGet, tokenSet, tokenClear,
    login: (email, password) => apiCall({ action:"login", email, password }),
    me: () => apiCall({ action:"me", token: tokenGet() })
  };
})();

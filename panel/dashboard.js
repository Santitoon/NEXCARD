
/*
  NEXCARD Panel — Dashboard (modelo multiempresa)
  - MODO DEMO LOCAL: guarda estructura de campos y contactos en localStorage
  - Luego se conecta a Apps Script con acciones: fields_list, fields_upsert, fields_delete, contacts_list, contacts_create, contacts_update, contacts_delete
*/

(function(){
  const LS_PREFIX = "nexcard_demo_";
  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));

  function toast(msg){
    const t = $("#toast");
    if(!t) return alert(msg);
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(window.__t_toast);
    window.__t_toast = setTimeout(()=> t.style.display="none", 2600);
  }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

  let session = null;
  let empresaId = "trampaclean";

  function empresaKey(){ return LS_PREFIX + "empresa_" + empresaId; }

  function loadEmpresaState(){
    const raw = localStorage.getItem(empresaKey());
    if(raw){
      try { return JSON.parse(raw); } catch {}
    }
    return {
      empresa_id: empresaId,
      alias: empresaId === "trampaclean" ? "Trampa Clean" : "Empresa",
      fields: [
        { id: uid(), key:"fecha", label:"Fecha", type:"datetime", required:true, readonly:true },
        { id: uid(), key:"empresa", label:"Empresa", type:"text", required:true },
        { id: uid(), key:"vendedor", label:"Vendedor", type:"text" },
        { id: uid(), key:"nombre", label:"Nombre", type:"text", required:true },
        { id: uid(), key:"telefono", label:"Teléfono", type:"tel" },
        { id: uid(), key:"correo", label:"Correo", type:"email" },
        { id: uid(), key:"interes", label:"Interés", type:"select", options:["General","Compra","Soporte","Otro"] },
      ],
      contacts: []
    };
  }

  function saveEmpresaState(state){
    localStorage.setItem(empresaKey(), JSON.stringify(state));
  }

  function getState(){
    return loadEmpresaState();
  }

  function setEmpresa(id){
    empresaId = id || "trampaclean";
    $("#empresaId").textContent = empresaId;
    $("#empresaAlias").textContent = getState().alias || empresaId;
    renderAll();
  }

  function setTab(name){
    $$(".tab-btn").forEach(b=> b.classList.toggle("active", b.dataset.tab===name));
    $$(".tab").forEach(t=> t.style.display = (t.dataset.tab===name) ? "block" : "none");
  }

  function renderKpis(){
    const st = getState();
    const rows = st.contacts || [];
    const now = Date.now();
    const day = 24*60*60*1000;

    const total = rows.length;
    const hoy = rows.filter(r=> now - Date.parse(r.created_at||0) <= day).length;
    const semana = rows.filter(r=> now - Date.parse(r.created_at||0) <= 7*day).length;
    const mes = rows.filter(r=> now - Date.parse(r.created_at||0) <= 30*day).length;

    const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = String(val); };
    set("kpiTotal", total);
    set("kpiHoy", hoy);
    set("kpiSemana", semana);
    set("kpiMes", mes);
  }

  function renderFields(){
    const state = getState();
    const tbody = $("#fieldsTbody");
    tbody.innerHTML = "";

    state.fields.forEach((f, idx)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td><input class="in in-sm" data-k="label" data-id="${f.id}" value="${esc(f.label)}" /></td>
        <td><input class="in in-sm" data-k="key" data-id="${f.id}" value="${esc(f.key)}" /></td>
        <td>
          <select class="in in-sm" data-k="type" data-id="${f.id}">
            ${["text","email","tel","number","date","datetime","select","multiselect","textarea"].map(t=>`
              <option value="${t}" ${f.type===t?"selected":""}>${t}</option>
            `).join("")}
          </select>
        </td>
        <td class="center">
          <input type="checkbox" data-k="required" data-id="${f.id}" ${f.required? "checked":""} />
        </td>
        <td class="center">
          <input type="checkbox" data-k="readonly" data-id="${f.id}" ${f.readonly? "checked":""} />
        </td>
        <td>
          <input class="in in-sm" data-k="options" data-id="${f.id}" value="${esc((f.options||[]).join(", "))}" ${!(f.type==="select"||f.type==="multiselect") ? "disabled":""} />
        </td>
        <td class="right">
          <button class="btn btn-ghost btn-sm" data-act="dup" data-id="${f.id}">Duplicar</button>
          <button class="btn btn-danger btn-sm" data-act="del" data-id="${f.id}">Borrar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    $$("#fieldsTbody input, #fieldsTbody select").forEach(el=>{
      el.addEventListener("change", ()=>{
        const id = el.dataset.id;
        const k = el.dataset.k;
        if(!id || !k) return;
        const st = getState();
        const f = st.fields.find(x=> x.id===id);
        if(!f) return;

        if(el.type === "checkbox") f[k] = el.checked;
        else if(k === "options"){
          f.options = String(el.value||"").split(",").map(s=>s.trim()).filter(Boolean);
        } else {
          f[k] = String(el.value||"").trim();
        }

        if(k==="type"){
          const optIn = $(`#fieldsTbody input[data-k="options"][data-id="${id}"]`);
          if(optIn){
            const isOpt = (f.type==="select"||f.type==="multiselect");
            optIn.disabled = !isOpt;
            if(!isOpt){ f.options = []; optIn.value = ""; }
          }
        }

        saveEmpresaState(st);
        renderFormPreview();
        toast("Guardado");
      });
    });

    $$("#fieldsTbody button").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const st = getState();
        const i = st.fields.findIndex(x=> x.id===id);
        if(i<0) return;
        if(act==="del"){
          st.fields.splice(i,1);
          saveEmpresaState(st);
          renderAll();
          toast("Campo eliminado");
        }
        if(act==="dup"){
          const copy = JSON.parse(JSON.stringify(st.fields[i]));
          copy.id = uid();
          copy.key = copy.key + "_copy";
          st.fields.splice(i+1,0,copy);
          saveEmpresaState(st);
          renderAll();
          toast("Campo duplicado");
        }
      });
    });
  }

  function addField(){
    const st = getState();
    st.fields.push({
      id: uid(),
      label: "Nuevo campo",
      key: "campo_" + (st.fields.length+1),
      type: "text",
      required: false,
      readonly: false,
      options: []
    });
    saveEmpresaState(st);
    renderAll();
    toast("Campo agregado");
  }

  function renderFormPreview(){
    const st = getState();
    const wrap = $("#formPreview");
    wrap.innerHTML = "";

    st.fields.forEach(f=>{
      const row = document.createElement("div");
      row.className = "fp-row";
      const id = "fp_" + f.id;
      const label = `<label class="fp-label" for="${id}">${esc(f.label)}${f.required?" *":""}</label>`;

      let input = "";
      const common = `class="in" id="${id}" name="${esc(f.key)}" ${f.required?"required":""} ${f.readonly?"readonly":""}`;

      if(f.type==="textarea"){
        input = `<textarea ${common} rows="3"></textarea>`;
      } else if(f.type==="select" || f.type==="multiselect"){
        const multiple = f.type==="multiselect" ? "multiple" : "";
        input = `<select ${common} ${multiple}>${(f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
      } else if(f.type==="date"){
        input = `<input ${common} type="date" />`;
      } else if(f.type==="datetime"){
        input = `<input ${common} type="datetime-local" />`;
      } else if(f.type==="number"){
        input = `<input ${common} type="number" />`;
      } else if(f.type==="email"){
        input = `<input ${common} type="email" />`;
      } else if(f.type==="tel"){
        input = `<input ${common} type="tel" />`;
      } else {
        input = `<input ${common} type="text" />`;
      }

      row.innerHTML = label + input;
      wrap.appendChild(row);
    });
  }

  function demoAddContactFromPreview(){
    const st = getState();
    const data = {};
    let ok = true;

    st.fields.forEach(f=>{
      const el = document.getElementsByName(f.key)[0];
      if(!el) return;
      let v;
      if(el.tagName === "SELECT" && el.multiple){
        v = Array.from(el.selectedOptions).map(o=>o.value);
      } else {
        v = el.value;
      }
      if(f.required && (!v || (Array.isArray(v)&&v.length===0))) ok = false;
      data[f.key] = v;
    });

    if(!ok){
      toast("Completa los campos obligatorios.");
      return;
    }

    const row = { id: uid(), created_at: new Date().toISOString(), ...data };
    st.contacts.unshift(row);
    saveEmpresaState(st);
    renderContacts();
    toast("Contacto agregado (demo)");
  }

  function renderCellValue_(v, f){
    if(Array.isArray(v)) return v.join(", ");
    if(f.type==="datetime" && v){
      try{
        const d = new Date(v);
        if(!isNaN(d)) return d.toLocaleString();
      }catch{}
    }
    return v ?? "";
  }

  function renderContacts(){
    renderKpis();
    const st = getState();
    const fields = st.fields;
    const head = $("#contactsHead");
    const body = $("#contactsBody");

    head.innerHTML = fields.map(f=> `<th>${esc(f.label)}</th>`).join("") + "<th class='right'>Acciones</th>";

    const q = String($("#contactsSearch").value||"").trim().toLowerCase();

    body.innerHTML = "";
    st.contacts
      .filter(row=>{
        if(!q) return true;
        return fields.some(f=> String(row[f.key]??"").toLowerCase().includes(q));
      })
      .slice(0, 300)
      .forEach(row=>{
        const tr = document.createElement("tr");
        tr.innerHTML = fields.map(f=> `<td>${esc(renderCellValue_(row[f.key], f))}</td>`).join("") + `
          <td class="right">
            <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${row.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-act="del" data-id="${row.id}">Borrar</button>
          </td>
        `;
        body.appendChild(tr);
      });

    $$("#contactsBody button").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        if(act==="del") return delContact(id);
        if(act==="edit") return openEdit(id);
      });
    });
  }

  function delContact(id){
    const st = getState();
    const i = st.contacts.findIndex(x=> x.id===id);
    if(i<0) return;
    st.contacts.splice(i,1);
    saveEmpresaState(st);
    renderContacts();
    toast("Eliminado");
  }

  function openEdit(id){
    const st = getState();
    const row = st.contacts.find(x=> x.id===id);
    if(!row) return;

    const modal = $("#modal");
    const form = $("#editForm");
    const fields = st.fields.filter(f=> !f.readonly);

    form.innerHTML = fields.map(f=>{
      const name = esc(f.key);
      const val = row[f.key];
      const label = `<label class="fp-label">${esc(f.label)}</label>`;
      const common = `class="in" name="${name}" ${f.required?"required":""}`;
      let input = "";
      if(f.type==="textarea"){
        input = `<textarea ${common} rows="3">${esc(val??"")}</textarea>`;
      } else if(f.type==="select" || f.type==="multiselect"){
        const multiple = f.type==="multiselect";
        const selected = new Set(Array.isArray(val)?val:[val]);
        input = `<select ${common} ${multiple?"multiple":""}>
          ${(f.options||[]).map(o=>`<option value="${esc(o)}" ${selected.has(o)?"selected":""}>${esc(o)}</option>`).join("")}
        </select>`;
      } else if(f.type==="number"){
        input = `<input ${common} type="number" value="${esc(val??"")}" />`;
      } else if(f.type==="email"){
        input = `<input ${common} type="email" value="${esc(val??"")}" />`;
      } else if(f.type==="tel"){
        input = `<input ${common} type="tel" value="${esc(val??"")}" />`;
      } else if(f.type==="date"){
        input = `<input ${common} type="date" value="${esc(val??"")}" />`;
      } else if(f.type==="datetime"){
        input = `<input ${common} type="datetime-local" value="${esc(val??"")}" />`;
      } else {
        input = `<input ${common} type="text" value="${esc(val??"")}" />`;
      }
      return `<div class="fp-row">${label}${input}</div>`;
    }).join("");

    $("#saveEdit").onclick = ()=>{
      const fd = new FormData(form);
      fields.forEach(f=>{
        if(f.type==="multiselect"){
          row[f.key] = fd.getAll(f.key);
        }else{
          row[f.key] = fd.get(f.key);
        }
      });
      saveEmpresaState(st);
      closeModal();
      renderContacts();
      toast("Actualizado");
    };

    modal.style.display = "flex";
  }

  function closeModal(){ $("#modal").style.display = "none"; }

  function initEmpresaSelector(){
    const sel = $("#empresaSelect");
    sel.value = empresaId;
    sel.addEventListener("change", ()=> setEmpresa(sel.value));

    $("#empresaAliasEdit").addEventListener("change", ()=>{
      const st = getState();
      st.alias = $("#empresaAliasEdit").value.trim() || empresaId;
      saveEmpresaState(st);
      $("#empresaAlias").textContent = st.alias;
      toast("Alias guardado");
    });

    $("#empresaAliasEdit").value = getState().alias || empresaId;
  }

  async function boot(){
    const t = NexcardPanel.tokenGet();
    if(!t){
      location.href = "login.html";
      return;
    }
    try{
      const me = await NexcardPanel.me();
      session = me;
      $("#who").textContent = `Sesión: ${me.email}`;
    }catch(e){
      NexcardPanel.tokenClear();
      location.href = "login.html";
      return;
    }

    $("#logoutBtn").addEventListener("click", ()=>{
      NexcardPanel.tokenClear();
      toast("Sesión cerrada");
      setTimeout(()=> location.href="login.html", 350);
    });

    $("#addFieldBtn").addEventListener("click", addField);
    $("#demoAddContactBtn").addEventListener("click", demoAddContactFromPreview);
    $("#contactsSearch").addEventListener("input", renderContacts);
    $("#closeModal").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

    $$(".tab-btn").forEach(b=> b.addEventListener("click", ()=> setTab(b.dataset.tab)));

    initEmpresaSelector();
    renderAll();
    setTab("contacts");
  }

  function renderAll(){
    renderKpis();
    const st = getState();
    $("#empresaId").textContent = empresaId;
    $("#empresaAlias").textContent = st.alias || empresaId;
    $("#empresaAliasEdit").value = st.alias || empresaId;
    renderFields();
    renderFormPreview();
    renderContacts();
  }

  boot();
})();

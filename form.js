"use strict";
/* Page publique : charge la définition de l'activité depuis le serveur et lui envoie les réponses. */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const API=(document.querySelector('meta[name="api-base"]')?.content||location.origin+"/api/v1").replace(/\/$/,"");
const id=new URLSearchParams(location.search).get("id")||"";
const root=$("#root");
function msg(t,h){root.innerHTML=`<h1>${esc(h)}</h1><p class="mut">${esc(t)}</p>`}
function input(f){const k="f_"+f.key,L=`<label for="${k}">${esc(f.label)}${f.required?" *":""}</label>`,rq=f.required?" required":"";
 if(f.type==="textarea")return L+`<textarea id="${k}" rows="4"${rq}></textarea>`;
 if(f.type==="select")return L+`<select id="${k}"${rq}><option value="">— Choisir —</option>${(f.options||[]).map(o=>`<option>${esc(o)}</option>`).join("")}</select>`;
 if(f.type==="radio")return `<fieldset id="${k}"><legend>${esc(f.label)}${f.required?" *":""}</legend>${(f.options||[]).map(o=>`<label class="i"><input type="radio" name="${k}" value="${esc(o)}">${esc(o)}</label>`).join("")}</fieldset>`;
 if(f.type==="multi")return `<fieldset id="${k}"><legend>${esc(f.label)}${f.required?" *":""}</legend>${(f.options||[]).map(o=>`<label class="i"><input type="checkbox" value="${esc(o)}">${esc(o)}</label>`).join("")}</fieldset>`;
 if(f.type==="check")return `<label class="i"><input type="checkbox" id="${k}">${esc(f.label)}${f.required?" *":""}</label>`;
 return L+`<input id="${k}" type="${f.type}"${f.type==="number"?' step="any"':""}${rq}>`}
function read(fields){const data={};for(const f of fields){const k="f_"+f.key;let v;
 if(f.type==="radio"){const r=document.querySelector(`[name="${k}"]:checked`);v=r?r.value:""}
 else if(f.type==="multi")v=[...document.querySelectorAll(`#${k} input:checked`)].map(i=>i.value);
 else if(f.type==="check")v=document.getElementById(k).checked;
 else v=document.getElementById(k).value.trim();
 const empty=v===""||(f.type==="check"&&!v)||(Array.isArray(v)&&!v.length);
 if(f.required&&empty)return{err:`Le champ « ${f.label} » est obligatoire.`};
 if(!empty&&f.type==="email"&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))return{err:`« ${f.label} » : adresse e-mail invalide.`};
 if(!empty&&f.type==="number"&&isNaN(Number(v)))return{err:`« ${f.label} » : nombre invalide.`};
 data[f.key]=f.type==="number"&&v!==""?Number(v):v}
 return{data}}
async function init(){
 if(!/^[a-z0-9]{4,40}$/i.test(id))return msg("Le lien est incomplet : il manque l'identifiant de l'activité.","Lien invalide");
 let def;try{const r=await fetch(`${API}/public/activities/${id}`);if(r.status===404)return msg("Ce formulaire n'existe pas ou n'est plus ouvert.","Formulaire indisponible");if(!r.ok)throw 0;def=await r.json()}
 catch(e){return msg("Le serveur ne répond pas. Réessayez dans quelques instants.","Connexion impossible")}
 document.title=def.name;
 root.innerHTML=`<h1>${esc(def.name)}</h1><p class="mut">${esc(def.desc)}</p><form id="f" novalidate>${def.fields.map(input).join("")}<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><div id="err" role="alert"></div><button class="btn" id="b">Envoyer</button></form>`;
 $("#f").onsubmit=async e=>{e.preventDefault();const b=$("#b"),er=$("#err");if(b.disabled)return;er.textContent="";
  const r=read(def.fields);if(r.err){er.textContent=r.err;return}
  b.disabled=true;b.textContent="Envoi en cours…";
  try{const res=await fetch(`${API}/public/activities/${id}/submissions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:r.data,website:$(".hp").value})});
   const j=await res.json().catch(()=>({}));
   if(res.status!==201)throw new Error(j.error||("Le serveur a répondu "+res.status));
   root.innerHTML=`<div class="ok" role="status"><div class="tick"></div><h1>Merci !</h1><p>Votre réponse a bien été enregistrée.</p></div>`}
  catch(x){b.disabled=false;b.textContent="Envoyer";er.textContent="L'enregistrement a échoué : "+(x.message==="Failed to fetch"?"serveur injoignable":x.message)+". Vos réponses sont conservées, vous pouvez réessayer."}}}
init();

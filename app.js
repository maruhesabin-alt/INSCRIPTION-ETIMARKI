"use strict";
const K="collectpro.v1";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Math.random().toString(36).slice(2,6)+Date.now().toString(36).slice(-4);
const fd=t=>t?new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}):"—";
const TYPES=["Inscription à une formation","Inscription à un événement","Inscription à une application","Inscription sur un site web","Recrutement","Adhésion","Enquête / questionnaire","Réception de messages","Autre"];
const FT={text:"Texte court",textarea:"Texte long",email:"E-mail",tel:"Téléphone",number:"Nombre",date:"Date",select:"Liste déroulante",radio:"Choix unique",multi:"Choix multiples",check:"Case à cocher"};
const MSGF=[["country","Pays","text"],["name","Nom complet","text",1],["email","E-mail","email",1],["phone","Téléphone","tel"],["subject","Objet","text",1],["body","Message","textarea",1]];
const MST=["Nouveau","Lu","En cours","Répondu","Archivé"];
let LS=true,db=load(),S={q:"",tab:"over",page:1,sort:null,dir:1,sq:"",sf:"",from:"",to:"",mst:"",show:"active"};
function load(){try{const v=localStorage.getItem(K);return v?JSON.parse(v):{activities:[]}}catch(e){LS=false;return{activities:[]}}}
function save(){if(LS){try{localStorage.setItem(K,JSON.stringify(db));return true}catch(e){LS=false;banner()}}return true}
function banner(){const h=$("#hint");if(h&&!LS){h.textContent="⚠ Stockage du navigateur indisponible : les données seront perdues à la fermeture de la page. Ouvrez le site dans votre navigateur (http://localhost:3000).";h.className="hide warn"}}
function toast(m,e){const d=document.createElement("div");d.textContent=m;if(e)d.className="e";$("#toast").append(d);setTimeout(()=>d.remove(),4500)}
const A=id=>db.activities.find(a=>a.id===id);
const isMsg=a=>a.kind==="messages";
function log(a,m){(a.log=a.log||[]).unshift({at:Date.now(),m});a.log=a.log.slice(0,200)}
function go(h){location.hash=h;}
addEventListener("hashchange",()=>{S.page=1;S.sq="";S.sf="";S.sort=null;enter();render()});
function enter(){const a=$("#app");a.classList.add("enter");setTimeout(()=>a.classList.remove("enter"),900)}
function route(){const p=location.hash.replace(/^#\/?/,"").split("/");return{v:p[0]||"home",id:p[1]}}
function dlg(html,onOpen){const d=$("#dlg");d.innerHTML=html;d.showModal();onOpen&&onOpen(d);return d}
function closeDlg(){$("#dlg").close()}
function confirmBox(msg,fn){dlg(`<h2>Confirmation</h2><p>${msg}</p><div class="row"><span class="sp"></span><button class="btn g" onclick="closeDlg()">Annuler</button><button class="btn d" id="cy">Confirmer</button></div>`,d=>d.querySelector("#cy").onclick=()=>{closeDlg();fn()})}
function download(name,text,mime){const b=new Blob([text],{type:mime||"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function fieldsOf(a){return isMsg(a)?MSGF.map(([key,label,type,required])=>({key,label,type,required:!!required})):a.fields}
function items(a){return isMsg(a)?a.msgs||[]:a.subs||[]}
function val(v){return Array.isArray(v)?v.join(", "):v===true?"Oui":v===false?"Non":(v??"")}

/* ---------- Rendu principal ---------- */
function render(){const r=route(),app=$("#app");
 if(r.v==="form"){return pubForm(r.id)}
 if(r.v==="a"&&A(r.id)){return activityView(A(r.id))}
 home()}
function home(){const app=$("#app");
 const list=db.activities.filter(a=>(a.status||"active")===S.show&&(a.name+a.desc).toLowerCase().includes(S.q.toLowerCase()));
 const cnt=a=>items(a).length;
 app.innerHTML=`<div class="row"><div><h1>Mes activités</h1><div class="mut">Chaque activité a ses propres champs, données et statistiques.</div></div><span class="sp"></span>
 <input id="q" style="max-width:260px" type="search" placeholder="Rechercher une activité" value="${esc(S.q)}" aria-label="Rechercher">
 <select id="sh" style="width:auto" aria-label="Affichage"><option value="active">Actives</option><option value="archived">Archivées</option><option value="trash">Corbeille</option></select>
 <button class="btn" onclick="editActivity()">+ Ajouter une activité</button></div>
 <div class="grid">${S.show==="active"?`<div class="card add" tabindex="0" role="button" onclick="editActivity()" onkeydown="if(event.key==='Enter')editActivity()">+ Ajouter une activité</div>`:""}
 ${list.map(a=>{const ok=isMsg(a)||a.fields.length;const ap=a.api||{};return `<div class="card"><div class="row"><h3 class="sp">${esc(a.name)}</h3></div>
 <span class="badge">${esc(a.type)}</span>${a.demo?'<span class="badge w">DÉMO</span>':""}
 <p>${esc(a.desc||"Aucune description")}</p><div class="mut" style="font-size:13px">Créée le ${fd(a.created)}</div>
 <div style="margin:6px 0"><span class="badge ${ok?"ok":"w"}">${ok?"Configurée":"À configurer"}</span><span class="badge ${ap.published?"ok":ap.state==="error"?"e":""}">${ap.published?"Publiée sur le serveur":ap.state==="error"?"Serveur en erreur":"Mode local"}</span></div>
 <div><span class="num">${cnt(a)}</span> <span class="mut">${isMsg(a)?"message(s)":"enregistrement(s)"}</span></div>
 <div class="row" style="margin-top:10px">${S.show==="active"?`<button class="btn s" onclick="go('/a/${a.id}')">Ouvrir l'activité</button><button class="btn g s" onclick="editActivity('${a.id}')">Modifier</button><button class="btn g s" onclick="setStatus('${a.id}','archived')">Archiver</button><button class="btn g s" onclick="setStatus('${a.id}','trash')">Supprimer</button>`
 :S.show==="archived"?`<button class="btn s" onclick="setStatus('${a.id}','active')">Restaurer</button>`
 :`<button class="btn s" onclick="setStatus('${a.id}','active')">Restaurer</button><button class="btn d s" onclick="purge('${a.id}')">Supprimer définitivement</button>`}</div></div>`}).join("")}</div>
 ${!list.length&&S.show!=="active"?'<div class="empty">Rien à afficher ici.</div>':""}
 ${!db.activities.length?'<div class="empty" style="margin-top:16px"><b>Aucune activité pour le moment.</b><br>Créez votre première activité pour commencer à collecter des données.<br><br><button class="btn g" onclick="demo()">Ajouter une activité de démonstration</button></div>':""}`;
 $("#q").oninput=e=>{S.q=e.target.value;home();$("#q").focus();const q=$("#q");q.setSelectionRange(q.value.length,q.value.length)};
 $("#sh").value=S.show;$("#sh").onchange=e=>{S.show=e.target.value;home()}}
function setStatus(id,st){const a=A(id);if(st==="trash"){return confirmBox(`« ${esc(a.name)} » sera déplacée dans la corbeille avec ses ${items(a).length} enregistrement(s). Vous pourrez la restaurer.`,()=>{a.status="trash";log(a,"Activité mise à la corbeille");save();syncStatus(a);home()})}
 a.status=st;log(a,st==="active"?"Activité restaurée":"Activité archivée");save();syncStatus(a);home();toast("Fait.")}
function purge(id){const a=A(id);confirmBox(`Suppression <b>définitive</b> de « ${esc(a.name)} » et de ses ${items(a).length} enregistrement(s). Cette action est irréversible.`,()=>{db.activities=db.activities.filter(x=>x.id!==id);save();home()})}
function demo(){const a={id:uid(),name:"Démo — Inscription formation",desc:"Activité de démonstration : ne contient pas de vraies données.",type:TYPES[0],country:"RDC",goal:"Découvrir COLLECT PRO",kind:"forms",demo:1,status:"active",created:Date.now(),
 fields:[{key:"nom",label:"Nom complet",type:"text",required:true},{key:"email",label:"E-mail",type:"email",required:true},{key:"niveau",label:"Niveau",type:"radio",required:false,options:["Débutant","Intermédiaire","Avancé"]}],subs:[],msgs:[],log:[]};
 db.activities.push(a);save();home()}

/* ---------- Création / modification d'une activité ---------- */
function editActivity(id){const a=id?A(id):null;
 dlg(`<h2>${a?"Modifier":"Nouvelle"} activité</h2><form id="f">
 <label for="n">Nom de l'activité *</label><input id="n" required value="${esc(a?.name)}">
 <label for="d">Description</label><textarea id="d" rows="2">${esc(a?.desc)}</textarea>
 <label for="t">Type d'activité</label><select id="t">${TYPES.map(t=>`<option ${a?.type===t?"selected":""}>${t}</option>`).join("")}</select>
 <label for="c">Pays concerné</label><input id="c" value="${esc(a?.country)}">
 <label for="g">Objectif de la collecte</label><input id="g" value="${esc(a?.goal)}">
 <div class="row" style="margin-top:16px"><span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Annuler</button><button class="btn">${a?"Enregistrer":"Créer l'activité"}</button></div></form>`,d=>{
 d.querySelector("#f").onsubmit=e=>{e.preventDefault();const v=k=>d.querySelector("#"+k).value.trim();
  const type=v("t");if(a){Object.assign(a,{name:v("n"),desc:v("d"),type,country:v("c"),goal:v("g")});a.kind=type===TYPES[7]?"messages":"forms";log(a,"Activité modifiée")}
  else{const n={id:uid(),name:v("n"),desc:v("d"),type,country:v("c"),goal:v("g"),kind:type===TYPES[7]?"messages":"forms",status:"active",created:Date.now(),
   fields:type===TYPES[7]?[]:[{key:"nom",label:"Nom complet",type:"text",required:true},{key:"email",label:"E-mail",type:"email",required:true}],subs:[],msgs:[],log:[]};log(n,"Activité créée");db.activities.push(n)}
  if(save()){closeDlg();toast("Activité enregistrée.");home()}}})}

/* ---------- Vue d'une activité ---------- */
function activityView(a){const app=$("#app");const msg=isMsg(a);
 const tabs=[["over","Vue d'ensemble"],[msg?"msgs":"subs",msg?"Messages":"Inscriptions"],["ana","Analyse des données"],...(msg?[]:[["fields","Champs du formulaire"]]),["sync","Synchronisation et API"],["hist","Historique"]];
 if(!tabs.some(t=>t[0]===S.tab))S.tab="over";
 app.innerHTML=`<div class="row"><button class="btn g s" onclick="go('')">← Mes activités</button><span class="badge">${esc(a.type)}</span>${a.demo?'<span class="badge w">DÉMO</span>':""}</div>
 <h1 style="margin-top:10px">${esc(a.name)}</h1><div class="mut">${esc(a.desc)}</div>
 <div class="tabs" role="tablist">${tabs.map(t=>`<button role="tab" aria-selected="${S.tab===t[0]}" data-t="${t[0]}">${t[1]}</button>`).join("")}</div><div id="tb"></div>`;
 app.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;S.page=1;S.sq="";S.sf="";S.sort=null;enter();activityView(a)});
 ({over:tOver,subs:tItems,msgs:tItems,ana:tAna,fields:tFields,sync:tSync,hist:tHist})[S.tab](a,$("#tb"))}
function tOver(a,el){const it=items(a),ap=a.api||{};
 const state=ap.published?"Publiée sur le serveur — collecte en ligne active":({verified:"Connexion au serveur vérifiée",error:"Erreur de connexion au serveur",unverified:"Connexion non vérifiée"}[ap.state]||"Configuration disponible — pas encore publiée");
 el.innerHTML=`<div class="stats"><div class="card"><div class="num">${it.length}</div>${isMsg(a)?"messages reçus":"inscriptions reçues"}</div>
 <div class="card"><div class="num">${isMsg(a)?it.filter(m=>m.status==="Nouveau").length:it.filter(s=>Date.now()-s.at<864e5).length}</div>${isMsg(a)?"nouveaux messages":"sur les dernières 24 h"}</div>
 <div class="card"><b>${state}</b><div class="mut">Dernier test : ${fd(ap.last)}</div></div></div>
 <h2>Dernières données</h2>${it.length?table(a,it.slice().reverse().slice(0,5),false):'<div class="empty">Aucune donnée reçue pour l\'instant (0).<br>Partagez le formulaire public depuis l\'onglet « Synchronisation et API ».</div>'}
 <div class="row" style="margin-top:14px"><button class="btn" onclick="window.open(pubLink(A('${a.id}')),'_blank')">Ouvrir le formulaire public</button><button class="btn g" onclick="report(A('${a.id}'),'summary')">Générer et télécharger PDF</button></div>`}
function rows(a){let it=items(a).slice();
 if(S.sq){const q=S.sq.toLowerCase();it=it.filter(x=>JSON.stringify(Object.values(isMsg(a)?x:x.data)).toLowerCase().includes(q))}
 if(S.sf)it=it.filter(x=>(x.status||"")===S.sf);
 if(S.from)it=it.filter(x=>x.at>=new Date(S.from).getTime());if(S.to)it=it.filter(x=>x.at<=new Date(S.to).getTime()+864e5);
 if(S.sort){it.sort((x,y)=>{const g=o=>S.sort==="_at"?o.at:String(val(isMsg(a)?o[S.sort]:o.data[S.sort])).toLowerCase();return(g(x)>g(y)?1:g(x)<g(y)?-1:0)*S.dir})}else it.sort((x,y)=>y.at-x.at);return it}
function table(a,it,interactive=true){const f=fieldsOf(a);
 return `<div class="tw"><table><thead><tr><th ${interactive?'data-s="_at"':""}>Reçu le</th>${f.map(x=>`<th ${interactive?`data-s="${x.key}"`:""}>${esc(x.label)}</th>`).join("")}${isMsg(a)&&interactive?"<th>Statut</th>":""}${interactive?"<th></th>":""}</tr></thead><tbody>
 ${it.map(x=>`<tr><td>${fd(x.at)}</td>${f.map(c=>`<td>${esc(val(isMsg(a)?x[c.key]:x.data[c.key]))}</td>`).join("")}${isMsg(a)&&interactive?`<td><span class="badge">${esc(x.status)}</span></td>`:""}${interactive?`<td><button class="btn g s" onclick="detail('${a.id}','${x.id}')">Détail</button></td>`:""}</tr>`).join("")}</tbody></table></div>`}
function tItems(a,el){const msg=isMsg(a),all=rows(a),per=10,pages=Math.max(1,Math.ceil(all.length/per));S.page=Math.min(S.page,pages);
 el.innerHTML=`<div class="row"><input id="sq" style="max-width:240px" type="search" placeholder="Rechercher" value="${esc(S.sq)}" aria-label="Rechercher">
 ${msg?`<select id="sf" style="width:auto" aria-label="Statut"><option value="">Tous les statuts</option>${MST.map(s=>`<option>${s}</option>`).join("")}</select>`:""}
 <label class="i" style="margin:0">Du <input id="fr" type="date" value="${S.from}"></label><label class="i" style="margin:0">au <input id="to" type="date" value="${S.to}"></label><span class="sp"></span>
 <button class="btn g s" onclick="exp('${a.id}','csv')">Export CSV</button><button class="btn g s" onclick="exp('${a.id}','json')">Export JSON</button><button class="btn g s" onclick="report(A('${a.id}'),'filtered')">Générer et télécharger PDF</button></div>
 <div style="margin-top:12px">${all.length?table(a,all.slice((S.page-1)*per,S.page*per)):`<div class="empty">${items(a).length?"Aucun résultat pour ces filtres.":(msg?"Aucun message reçu.":"Aucune inscription reçue.")}</div>`}</div>
 <div class="row" style="margin-top:10px"><span class="mut">${all.length} résultat(s)</span><span class="sp"></span><button class="btn g s" ${S.page<=1?"disabled":""} id="pv">Précédent</button><span>Page ${S.page}/${pages}</span><button class="btn g s" ${S.page>=pages?"disabled":""} id="nx">Suivant</button></div>`;
 const re=()=>tItems(a,el);const on=(id,fn)=>{const e=$(id);if(e)e.onchange=fn};
 $("#sq").oninput=e=>{S.sq=e.target.value;S.page=1;re();const q=$("#sq");q.focus();q.setSelectionRange(q.value.length,q.value.length)};
 on("#sf",e=>{S.sf=e.target.value;S.page=1;re()});if($("#sf"))$("#sf").value=S.sf;on("#fr",e=>{S.from=e.target.value;re()});on("#to",e=>{S.to=e.target.value;re()});
 $("#pv").onclick=()=>{S.page--;re()};$("#nx").onclick=()=>{S.page++;re()};
 el.querySelectorAll("th[data-s]").forEach(h=>h.onclick=()=>{S.dir=S.sort===h.dataset.s?-S.dir:1;S.sort=h.dataset.s;re()})}
function detail(aid,id){const a=A(aid),msg=isMsg(a),x=items(a).find(i=>i.id===id);const f=fieldsOf(a);
 dlg(`<h2>Détail — reçu le ${fd(x.at)}</h2><form id="f">${f.map(c=>fieldInput(c,msg?x[c.key]:x.data[c.key],"e_")).join("")}
 ${msg?`<label for="st">Statut</label><select id="st">${MST.map(s=>`<option ${x.status===s?"selected":""}>${s}</option>`).join("")}</select><label for="nt">Notes internes</label><textarea id="nt" rows="2">${esc(x.notes)}</textarea>
 <div class="note">La réponse par e-mail n'est pas disponible : aucun service d'envoi n'est configuré. Utilisez l'adresse ci-dessus et passez le statut à « Répondu » après votre réponse.</div>`:""}
 <div class="row" style="margin-top:14px"><button type="button" class="btn d s" id="del">Supprimer</button><span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Fermer</button><button class="btn">Enregistrer</button></div></form>`,d=>{
 d.querySelector("#f").onsubmit=e=>{e.preventDefault();const r=readForm(d,f,"e_");if(r.err)return;
  if(msg){Object.assign(x,r.data);x.status=d.querySelector("#st").value;x.notes=d.querySelector("#nt").value}else x.data=r.data;x.edited=Date.now();log(a,(msg?"Message":"Inscription")+" modifié(e) : "+id);if(save()){closeDlg();toast("Modifications enregistrées.");activityView(a)}};
 d.querySelector("#del").onclick=()=>{closeDlg();confirmBox("Supprimer cet enregistrement ? Cette action est irréversible.",()=>{a[msg?"msgs":"subs"]=items(a).filter(i=>i.id!==id);log(a,"Enregistrement supprimé : "+id);save();activityView(a)})}})}

/* ---------- Champs et formulaires ---------- */
function fieldInput(f,v,p){const id=p+f.key,req=f.required?" required":"",L=`<label for="${id}">${esc(f.label)}${f.required?" *":""}</label>`;
 switch(f.type){
 case"textarea":return L+`<textarea id="${id}" rows="3"${req}>${esc(v)}</textarea>`;
 case"select":return L+`<select id="${id}"${req}><option value="">— Choisir —</option>${(f.options||[]).map(o=>`<option ${v===o?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
 case"radio":return `<fieldset style="border:0;padding:0;margin:0" id="${id}"><label>${esc(f.label)}${f.required?" *":""}</label>${(f.options||[]).map(o=>`<label class="i"><input type="radio" name="${id}" value="${esc(o)}" ${v===o?"checked":""}>${esc(o)}</label>`).join("")}</fieldset>`;
 case"multi":return `<fieldset style="border:0;padding:0;margin:0" id="${id}"><label>${esc(f.label)}${f.required?" *":""}</label>${(f.options||[]).map(o=>`<label class="i"><input type="checkbox" value="${esc(o)}" ${(v||[]).includes(o)?"checked":""}>${esc(o)}</label>`).join("")}</fieldset>`;
 case"check":return `<label class="i" style="margin-top:12px"><input type="checkbox" id="${id}" ${v?"checked":""}>${esc(f.label)}${f.required?" *":""}</label>`;
 default:return L+`<input id="${id}" type="${f.type==="tel"?"tel":f.type}" ${f.type==="number"?'step="any"':""}value="${esc(v)}"${req}>`}}
function readForm(root,f,p){const data={};let err="";
 for(const c of f){const id=p+c.key;let v;
  if(c.type==="radio"){const r=root.querySelector(`[name="${id}"]:checked`);v=r?r.value:""}
  else if(c.type==="multi")v=[...root.querySelectorAll(`#${id} input:checked`)].map(i=>i.value);
  else if(c.type==="check")v=root.querySelector("#"+id).checked;
  else v=root.querySelector("#"+id).value.trim();
  const empty=v===""||v===false&&c.type==="check"||Array.isArray(v)&&!v.length;
  if(c.required&&empty){err=`Le champ « ${c.label} » est obligatoire.`;break}
  if(!empty&&c.type==="email"&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){err=`« ${c.label} » : adresse e-mail invalide.`;break}
  if(!empty&&c.type==="number"&&isNaN(Number(v))){err=`« ${c.label} » : nombre invalide.`;break}
  data[c.key]=c.type==="number"&&v!==""?Number(v):v}
 if(err)toast(err,1);return{data,err}}
function tFields(a,el){
 el.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">Champs demandés par le formulaire public</h2><button class="btn" onclick="editField('${a.id}')">+ Ajouter un champ</button></div>
 <p class="mut">L'identifiant technique d'un champ ne change jamais : renommer le libellé ou supprimer un champ ne détruit pas les réponses déjà enregistrées. Si l'activité est publiée sur le serveur, republiez-la ensuite (onglet « Synchronisation et API »).</p>
 ${a.fields.length?`<div class="tw"><table><thead><tr><th>Libellé</th><th>Type</th><th>Obligatoire</th><th>Identifiant</th><th></th></tr></thead><tbody>${a.fields.map((f,i)=>`<tr><td>${esc(f.label)}</td><td>${FT[f.type]}${f.options?.length?`<div class="mut">${esc(f.options.join(", "))}</div>`:""}</td><td>${f.required?"Oui":"Non"}</td><td><code>${esc(f.key)}</code></td>
 <td style="white-space:nowrap"><button class="btn g s" onclick="moveField('${a.id}',${i},-1)" aria-label="Monter">↑</button> <button class="btn g s" onclick="moveField('${a.id}',${i},1)" aria-label="Descendre">↓</button> <button class="btn g s" onclick="editField('${a.id}',${i})">Modifier</button> <button class="btn d s" onclick="delField('${a.id}',${i})">Retirer</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Aucun champ. Ajoutez au moins un champ pour que le formulaire public fonctionne.</div>'}
 <h2 style="margin-top:20px">Aperçu</h2><div class="card" style="max-width:520px"><form onsubmit="return false">${a.fields.map(f=>fieldInput(f,"","pv_")).join("")}<p class="mut">Pièces jointes : non disponibles dans cette version (aucun stockage sécurisé de fichiers n'est configuré).</p></form></div>`}
function moveField(id,i,d){const a=A(id),j=i+d;if(j<0||j>=a.fields.length)return;[a.fields[i],a.fields[j]]=[a.fields[j],a.fields[i]];save();activityView(a)}
function delField(id,i){const a=A(id);confirmBox(`Retirer « ${esc(a.fields[i].label)} » du formulaire ? Les réponses déjà enregistrées sont conservées dans les exports JSON.`,()=>{log(a,"Champ retiré : "+a.fields[i].key);a.fields.splice(i,1);save();activityView(a)})}
function editField(id,i){const a=A(id),f=i!==undefined?a.fields[i]:{type:"text",required:false,options:[]};
 dlg(`<h2>${i!==undefined?"Modifier":"Nouveau"} champ</h2><form id="f"><label for="l">Libellé *</label><input id="l" required value="${esc(f.label)}">
 <label for="ty">Type</label><select id="ty">${Object.entries(FT).map(([k,v])=>`<option value="${k}" ${f.type===k?"selected":""}>${v}</option>`).join("")}</select>
 <div id="ow"><label for="op">Options (une par ligne)</label><textarea id="op" rows="3">${esc((f.options||[]).join("\n"))}</textarea></div>
 <label class="i"><input type="checkbox" id="rq" ${f.required?"checked":""}>Champ obligatoire</label>
 <div class="row" style="margin-top:14px"><span class="sp"></span><button type="button" class="btn g" onclick="closeDlg()">Annuler</button><button class="btn">Enregistrer</button></div></form>`,d=>{
 const sync=()=>d.querySelector("#ow").style.display=["select","radio","multi"].includes(d.querySelector("#ty").value)?"":"none";sync();d.querySelector("#ty").onchange=sync;
 d.querySelector("#f").onsubmit=e=>{e.preventDefault();const type=d.querySelector("#ty").value,label=d.querySelector("#l").value.trim();
  const options=d.querySelector("#op").value.split("\n").map(s=>s.trim()).filter(Boolean);
  if(["select","radio","multi"].includes(type)&&!options.length)return toast("Ajoutez au moins une option.",1);
  if(i!==undefined){Object.assign(f,{label,type,required:d.querySelector("#rq").checked,options})}
  else{let k=label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")||"champ";let b=k,n=2;while(a.fields.some(x=>x.key===k))k=b+"_"+n++;
   a.fields.push({key:k,label,type,required:d.querySelector("#rq").checked,options});log(a,"Champ ajouté : "+k)}
  save();closeDlg();activityView(a)}})}

/* ---------- Formulaire local (même appareil) ---------- */
function pubForm(id){const a=A(id),app=$("#app");
 if(!a||a.status!=="active"){app.innerHTML=`<div class="pub card"><h2>Formulaire indisponible</h2><p class="mut">Ce formulaire n'existe pas dans ce navigateur ou la collecte est fermée. Pour un lien partageable, publiez l'activité sur le serveur.</p><button class="btn" onclick="go('')">Aller à l'accueil</button></div>`;return}
 const f=fieldsOf(a);
 app.innerHTML=`<div class="pub card"><h1>${esc(a.name)}</h1><p class="mut">${esc(a.desc)}</p>${a.demo?'<div class="note">Activité de démonstration.</div>':""}<form id="pf" novalidate>${f.map(c=>fieldInput(c,"","p_")).join("")}<button class="btn" style="margin-top:16px;width:100%" id="sb">Envoyer</button></form><p style="text-align:center"><button class="btn g s" onclick="go('')">Retour</button></p></div>`;
 $("#pf").onsubmit=e=>{e.preventDefault();const b=$("#sb");if(b.disabled)return;const r=readForm($("#pf"),f,"p_");if(r.err)return;b.disabled=true;
  const rec=isMsg(a)?{id:uid(),at:Date.now(),status:"Nouveau",notes:"",...r.data}:{id:uid(),at:Date.now(),data:r.data};
  a[isMsg(a)?"msgs":"subs"].push(rec);if(!save()){b.disabled=false;return}
  $("#pf").outerHTML=`<div class="note" style="background:#e1f5ed;border-color:#b6e3d2" role="alert"><b>Merci !</b> Votre réponse a bien été enregistrée.</div>`}}

/* ---------- Analyse ---------- */
function tAna(a,el){const all=rows(a),f=fieldsOf(a).filter(x=>["select","radio","multi","check"].includes(x.type));
 const days=[...Array(14)].map((_,i)=>{const d=new Date(Date.now()-(13-i)*864e5);const k=d.toDateString();return{l:d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}),n:all.filter(x=>new Date(x.at).toDateString()===k).length}});
 const mx=Math.max(1,...days.map(d=>d.n));
 el.innerHTML=`<div class="row"><label class="i" style="margin:0">Du <input id="fr" type="date" value="${S.from}"></label><label class="i" style="margin:0">au <input id="to" type="date" value="${S.to}"></label><span class="sp"></span>
 <button class="btn g s" onclick="report(A('${a.id}'),'stats')">PDF statistique</button><button class="btn g s" onclick="exp('${a.id}','csv')">Export CSV</button><button class="btn g s" onclick="exp('${a.id}','json')">Export JSON</button></div>
 <div class="stats" style="margin-top:12px"><div class="card"><div class="num">${all.length}</div>enregistrements (filtre actif)</div><div class="card"><div class="num">${items(a).length}</div>total de l'activité</div></div>
 ${all.length?`<div class="card"><h2>Évolution — 14 derniers jours</h2><div class="cols">${days.map(d=>`<div style="height:${d.n/mx*100}%" data-t="${d.l} : ${d.n}"></div>`).join("")}</div><div class="mut" style="display:flex;justify-content:space-between"><span>${days[0].l}</span><span>${days[13].l}</span></div></div>
 ${f.map(c=>{const cnt={};all.forEach(x=>{const v=isMsg(a)?x[c.key]:x.data[c.key];(Array.isArray(v)?v:[v===true?"Oui":v===false||v===undefined||v===""?"Non renseigné":v]).forEach(o=>cnt[o]=(cnt[o]||0)+1)});const t=Object.values(cnt).reduce((s,n)=>s+n,0)||1;
  return `<div class="card" style="margin-top:12px"><h2>${esc(c.label)}</h2>${Object.entries(cnt).sort((x,y)=>y[1]-x[1]).map(([k,n])=>`<div class="bar"><span>${esc(k)}</span><b style="width:${n/t*60}%"></b><span>${n} (${Math.round(n/t*100)} %)</span></div>`).join("")}</div>`}).join("")}`:'<div class="empty" style="margin-top:12px">Pas encore de données à analyser. Les statistiques apparaissent dès la première réponse reçue.</div>'}`;
 const rr=()=>tAna(a,el);$("#fr").onchange=e=>{S.from=e.target.value;rr()};$("#to").onchange=e=>{S.to=e.target.value;rr()}}

/* ---------- Exports et PDF ---------- */
function exp(id,fmt){const a=A(id),it=rows(a),f=fieldsOf(a);if(!it.length)return toast("Aucune donnée à exporter.",1);
 if(fmt==="json")return download(a.name+".json",JSON.stringify(it,null,2),"application/json");
 const q=v=>'"'+String(val(v)).replace(/"/g,'""')+'"';
 download(a.name+".csv","\ufeff"+[["Reçu le",...f.map(c=>c.label)].map(q).join(";"),...it.map(x=>[fd(x.at),...f.map(c=>isMsg(a)?x[c.key]:x.data[c.key])].map(q).join(";"))].join("\n"),"text/csv;charset=utf-8");
 log(a,"Export "+fmt.toUpperCase()+" ("+it.length+")");save()}
function report(a,mode){const it=mode==="filtered"?rows(a):items(a),f=fieldsOf(a);
 const by={};it.forEach(x=>{const k=new Date(x.at).toLocaleDateString("fr-FR");by[k]=(by[k]||0)+1});
 const stats=mode==="stats"||mode==="summary"?`<h2>Statistiques</h2><table><tr><th>Date</th><th>Enregistrements</th></tr>${Object.entries(by).map(([k,n])=>`<tr><td>${k}</td><td>${n}</td></tr>`).join("")||'<tr><td colspan=2>Aucune donnée disponible.</td></tr>'}</table>`:"";
 $("#print").innerHTML=`<h1>${esc(a.name)}</h1><p>${esc(a.desc)}</p><p>Généré le ${fd(Date.now())} — ${it.length} enregistrement(s) inclus</p>${stats}
 ${mode==="stats"?"":`<h2>Données</h2>${it.length?table(a,it,false):"<p>Aucune donnée disponible.</p>"}`}<p style="margin-top:20px;font-size:11px">COLLECT PRO</p>`;
 toast("Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».");setTimeout(()=>print(),300)}

/* ---------- Synchronisation avec le serveur ---------- */
const ON=/^https?:$/.test(location.protocol);
const TK=K+".token";let TMEM="";
const getTok=()=>{try{return localStorage.getItem(TK)||TMEM}catch(e){return TMEM}};
const setTok=v=>{TMEM=v;try{localStorage.setItem(TK,v)}catch(e){}};
const apiBase=a=>((a.api&&a.api.url)||(ON?location.origin+"/api/v1":"")).replace(/\/$/,"");
function pubLink(a){const b=apiBase(a);return b&&a.api&&a.api.published?b.replace(/\/api\/v1$/,"")+"/form.html?id="+a.id:location.href.split("#")[0]+"#/form/"+a.id}
async function call(a,method,path,body,auth){const b=apiBase(a);if(!b)throw new Error("URL de l'API non renseignée");
 const h={};if(body)h["Content-Type"]="application/json";
 if(auth){const t=getTok();if(!t)throw new Error("Jeton administrateur manquant");h.Authorization="Bearer "+t}
 const c=new AbortController(),tm=setTimeout(()=>c.abort(),10000);
 try{const r=await fetch(b+path,{method,headers:h,body:body?JSON.stringify(body):undefined,signal:c.signal});let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||"Le serveur a répondu "+r.status);return j}
 catch(e){throw new Error(e.name==="AbortError"?"Délai dépassé":/fetch|network/i.test(e.message)?"Serveur injoignable":e.message)}finally{clearTimeout(tm)}}
const defOf=a=>({name:a.name,desc:a.desc,kind:a.kind||"forms",fields:fieldsOf(a),status:a.status==="active"?"active":"closed"});
const pushDef=a=>call(a,"PUT","/activities/"+a.id,defOf(a),true);
function slog(a,ok,m){(a.sync=a.sync||[]).unshift({at:Date.now(),ok:ok?1:0,m});a.sync=a.sync.slice(0,50);save()}
function syncStatus(a){if(a.api&&a.api.published)pushDef(a).then(()=>slog(a,1,"Statut mis à jour sur le serveur")).catch(e=>toast("Le serveur n'a pas pu être mis à jour ("+e.message+"). Republiez l'activité.",1))}
function tSync(a,el){const ap=a.api=a.api||{},link=pubLink(a);
 const st=ap.published?["ok","Publiée — collecte en ligne active"]:{verified:["ok","Connexion vérifiée"],error:["e","Erreur de connexion"],unverified:["w","Connexion non vérifiée"]}[ap.state]||["w","Pas encore publiée"];
 el.innerHTML=`<div class="note">${ON?"Serveur COLLECT PRO détecté sur cette adresse.":"Ce fichier est ouvert hors serveur : les données restent dans ce navigateur. Lancez <code>node server.js</code> et ouvrez http://localhost:3000 pour collecter des réponses venant d'autres appareils."}</div>
 <div class="card"><h2>État</h2><span class="badge ${st[0]}">${st[1]}</span> <span class="mut">Dernier test : ${fd(ap.last)}</span><p>Identifiant : <code>${a.id}</code></p>
 <label for="au">URL de base de l'API</label><input id="au" type="url" placeholder="http://localhost:3000/api/v1" value="${esc(apiBase(a))}">
 <label for="tk">Session administrateur (remplie automatiquement après connexion dans la page <a href="admin.html">Administration</a>)</label><input id="tk" type="password" autocomplete="off" value="${esc(getTok())}">
 <div class="row" style="margin-top:12px"><button class="btn g s" id="ts">1. Tester la connexion</button><button class="btn s" id="pb">2. ${ap.published?"Republier":"Publier"} l'activité</button><button class="btn g s" id="pl">3. Récupérer les réponses</button></div></div>
 <div class="card" style="margin-top:12px"><h2>Lien public à partager</h2><div class="code">${esc(link)}</div>${ap.published?"":'<p class="mut">Ce lien ne fonctionnera pour d\'autres personnes qu\'après publication sur le serveur.</p>'}
 <div class="row" style="margin-top:8px"><button class="btn g s" id="cp">Copier le lien</button><button class="btn g s" id="op">Ouvrir</button></div></div>
 <div class="card" style="margin-top:12px"><h2>Routes de l'API</h2><div class="code">GET  ${esc(apiBase(a)||"…/api/v1")}/health
GET  …/public/activities/${a.id}
POST …/public/activities/${a.id}/submissions   {"data":{…}}
PUT  …/activities/${a.id}   (jeton)
GET  …/activities/${a.id}/submissions   (jeton)</div></div>
 <div class="card" style="margin-top:12px"><h2>Journal de synchronisation</h2>${(a.sync||[]).length?`<table style="min-width:0">${a.sync.slice(0,15).map(s=>`<tr><td>${fd(s.at)}</td><td><span class="badge ${s.ok?"ok":"e"}">${s.ok?"OK":"Erreur"}</span></td><td>${esc(s.m)}</td></tr>`).join("")}</table>`:'<span class="mut">Aucun événement.</span>'}</div>
 <div class="card" style="margin-top:12px"><h2>Sauvegarde</h2><div class="row"><button class="btn g s" onclick="backup()">Télécharger toutes les données (JSON)</button><label class="btn g s" style="margin:0;cursor:pointer">Restaurer une sauvegarde<input type="file" accept=".json" hidden id="rs"></label></div></div>`;
 const keep=()=>{ap.url=$("#au").value.trim();setTok($("#tk").value.trim())};
 const run=(id,label,fn)=>$(id).onclick=async()=>{keep();const b=$(id);b.disabled=true;b.textContent="En cours…";try{await fn();}catch(e){ap.state="error";ap.last=Date.now();slog(a,0,label+" : "+e.message);toast(label+" a échoué : "+e.message,1)}tSync(a,el)};
 run("#ts","Test de connexion",async()=>{const r=await call(a,"GET","/health");ap.state="verified";ap.last=Date.now();slog(a,1,"Test réussi (serveur v"+(r.version||"?")+")");toast("Connexion vérifiée.")});
 run("#pb","Publication",async()=>{await pushDef(a);ap.published=Date.now();ap.state="verified";ap.last=Date.now();slog(a,1,"Activité publiée ("+fieldsOf(a).length+" champs)");toast("Activité publiée. Le lien public est actif.")});
 run("#pl","Récupération",async()=>{const r=await call(a,"GET","/activities/"+a.id+"/submissions",null,true);const list=a[isMsg(a)?"msgs":"subs"],have=new Set(list.map(x=>x.id));let n=0;
  (r.items||[]).forEach(i=>{if(have.has(i.id))return;list.push(isMsg(a)?{id:i.id,at:i.at,status:"Nouveau",notes:"",...i.data}:{id:i.id,at:i.at,data:i.data});n++});
  ap.state="verified";ap.last=Date.now();slog(a,1,n+" nouvelle(s) réponse(s) récupérée(s) sur "+(r.items||[]).length);toast(n+" nouvelle(s) réponse(s).")});
 $("#cp").onclick=()=>navigator.clipboard.writeText(link).then(()=>toast("Lien copié."),()=>toast("Copie impossible : sélectionnez le lien manuellement.",1));
 $("#op").onclick=()=>window.open(link,"_blank");
 $("#rs").onchange=e=>{const fl=e.target.files[0];if(!fl)return;fl.text().then(t=>{try{const d=JSON.parse(t);if(!Array.isArray(d.activities))throw 0;confirmBox("Remplacer toutes les données actuelles par cette sauvegarde ?",()=>{db=d;save();go("");home()})}catch(x){toast("Fichier de sauvegarde invalide.",1)}})}}
function backup(){download("collect-pro-sauvegarde-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(db,null,2),"application/json")}
function tHist(a,el){el.innerHTML=(a.log||[]).length?`<div class="tw"><table><tbody>${a.log.map(l=>`<tr><td style="width:150px">${fd(l.at)}</td><td>${esc(l.m)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Aucune opération enregistrée.</div>'}
function settings(){dlg(`<h2>Paramètres</h2><p class="mut">Les données sont stockées dans ce navigateur. Pensez à faire une sauvegarde régulière.</p>
 <div class="row"><button class="btn g" onclick="backup()">Télécharger une sauvegarde</button><button class="btn d" onclick="closeDlg();confirmBox('Effacer toutes les activités et données de ce navigateur ? Irréversible.',()=>{db={activities:[]};save();go('');home()})">Tout effacer</button></div>
 <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn g" onclick="closeDlg()">Fermer</button></div>`)}
enter();render();banner();

"use strict";
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=s=>document.querySelector(s);
/* Barre de progression et barre de navigation */
const bar=$(".progress"),nav=$(".nav");
function onScroll(){const h=document.documentElement,max=h.scrollHeight-innerHeight;bar.style.transform=`scaleX(${max>0?scrollY/max:0})`;nav.classList.toggle("solid",scrollY>40)}
addEventListener("scroll",()=>requestAnimationFrame(onScroll),{passive:true});onScroll();
/* Titre : mots révélés un à un */
document.querySelectorAll("[data-split]").forEach(h=>{let i=0;const walk=n=>{[...n.childNodes].forEach(c=>{if(c.nodeType===3){const f=document.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(t=>{if(/^\s+$/.test(t)||!t){f.append(t);return}const w=document.createElement("span");w.className="w";const s=document.createElement("span");s.style.setProperty("--i",i++);s.textContent=t;w.append(s);f.append(w)});c.replaceWith(f)}else walk(c)})};walk(h)});
/* Révélation au défilement */
const rv=document.querySelectorAll(".rv");
if(reduce||!("IntersectionObserver" in window))rv.forEach(e=>e.classList.add("in"));
else{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.15,rootMargin:"0px 0px -40px 0px"});rv.forEach(e=>io.observe(e))}
/* Bandeau : contenu dupliqué pour une boucle continue */
const tr=$(".ribbon .track");if(tr)tr.innerHTML+=tr.innerHTML;
/* Aperçu animé (exemple fictif, signalé comme tel) */
const demo=$("#rows");
if(demo){
  const people=[["Amina K.","Formation Photoshop"],["Jean-Paul M.","Événement Goma"],["Neema S.","Adhésion"],["Patrick B.","Enquête"],["Grâce T.","Recrutement"],["David N.","Formation montage"],["Esther L.","Inscription site"]];
  const sp=$("#spark"),cnt=$("#count");let n=0,k=0;const hs=[30,45,28,60,50,72,40];
  sp.innerHTML=hs.map(h=>`<i style="height:${h}%"></i>`).join("");
  const add=()=>{const [a,b]=people[k++%people.length];n++;cnt.textContent=n;
    const r=document.createElement("div");r.className="rowx";r.innerHTML=`<span>${a}</span><span>${b}</span><span class="t">à l'instant</span>`;
    demo.prepend(r);[...demo.children].slice(4).forEach(c=>c.remove());
    [...sp.children].forEach((e,i)=>e.style.height=(i===sp.children.length-1?Math.min(100,30+n*6):hs[i])+"%")};
  add();if(!reduce)setInterval(add,2200);else{add();add()}
}

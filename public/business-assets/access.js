(()=>{'use strict';
const screen=document.getElementById('phone-screen'),pointer=document.getElementById('guide-pointer'),menu=document.getElementById('menu-sheet'),dots=document.getElementById('dots-demo'),option=document.getElementById('open-browser-demo'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
let step=1,timer=0,menuTimer=0;
function position(){const box=screen.getBoundingClientRect(),target=(step===1?dots:option).getBoundingClientRect();pointer.style.left=(target.left-box.left+target.width/2)+'px';pointer.style.top=(target.top-box.top+target.height/2)+'px';}
function render(){menu.classList.toggle('is-visible',step===2);dots.classList.toggle('is-target',step===1);option.classList.toggle('is-target',step===2);document.querySelectorAll('[data-guide-step]').forEach(button=>{const active=Number(button.dataset.guideStep)===step;button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);});requestAnimationFrame(position);}
function stop(){clearTimeout(timer);clearTimeout(menuTimer);}
function replay(){stop();step=1;render();if(reduced.matches||document.hidden)return;timer=setTimeout(()=>{step=2;render();menuTimer=setTimeout(position,350);},3500);}
document.querySelectorAll('[data-guide-step]').forEach(button=>button.addEventListener('click',()=>{stop();step=Number(button.dataset.guideStep);render();menuTimer=setTimeout(position,350);}));
document.getElementById('replay').addEventListener('click',replay);
document.getElementById('copy-link').addEventListener('click',async()=>{const url=document.body.dataset.copyUrl||'https://investprotrading.fr/business?navigation=externe';try{await navigator.clipboard.writeText(url);document.getElementById('guide-toast').textContent='Lien copié. Colle-le dans Safari ou Chrome.';}catch{document.getElementById('guide-toast').textContent='Copie ce lien : '+url;}});
reduced.addEventListener('change',()=>{stop();render();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('resize',position);window.addEventListener('orientationchange',()=>requestAnimationFrame(position));if('ResizeObserver'in window)new ResizeObserver(position).observe(screen);replay();
})();

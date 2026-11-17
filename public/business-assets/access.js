(()=>{'use strict';
  const stage=document.getElementById('phone-stage');
  const svg=document.getElementById('guide-arrow');
  const path=document.getElementById('guide-path');
  const menu=document.getElementById('phone-menu');
  const dots=document.getElementById('phone-dots');
  const option=document.getElementById('phone-browser-option');
  const motion=document.getElementById('motion-control');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let step=1,paused=reduced.matches,timer;
  function position(){
    const box=stage.getBoundingClientRect();
    const target=(step===1?dots:option).getBoundingClientRect();
    const screen=document.querySelector('.phone-screen');
    screen.querySelector('iframe').style.transform='scale('+(screen.clientWidth/390)+')';
    const x=target.left-box.left+target.width/2,y=target.top-box.top+target.height/2;
    svg.setAttribute('viewBox','0 0 '+box.width+' '+box.height);
    path.setAttribute('d','M 125 42 C '+(box.width-15)+' 32, '+(box.width-8)+' '+Math.max(60,y-60)+', '+x+' '+y);
  }
  function render(){menu.hidden=step!==2;dots.classList.toggle('highlight',step===1);document.querySelectorAll('[data-guide-step]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.guideStep)===step)));document.getElementById('pointer-label').textContent=step===1?'CLIQUE ICI':'PUIS CETTE OPTION';requestAnimationFrame(position);}
  function updateTimer(){clearInterval(timer);const stopped=paused||reduced.matches||document.hidden;motion.textContent=stopped?'Lancer l’animation':'Mettre l’animation en pause';motion.setAttribute('aria-pressed',String(stopped));motion.hidden=reduced.matches;if(!stopped)timer=setInterval(()=>{step=step===1?2:1;render();},4500);}
  document.querySelectorAll('[data-guide-step]').forEach(button=>button.addEventListener('click',()=>{step=Number(button.dataset.guideStep);paused=true;render();updateTimer();}));
  motion.addEventListener('click',()=>{paused=!paused;updateTimer();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;updateTimer();});
  document.addEventListener('visibilitychange',updateTimer);
  window.addEventListener('resize',position);window.addEventListener('orientationchange',()=>requestAnimationFrame(position));
  if('ResizeObserver'in window)new ResizeObserver(position).observe(stage);
  render();updateTimer();
})();

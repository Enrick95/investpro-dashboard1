(()=>{'use strict';
  const gallery=document.getElementById('testimonial-gallery');
  const links=Array.from(gallery.querySelectorAll('a'));
  const dialog=document.getElementById('testimonial-lightbox');
  const image=document.getElementById('lightbox-image');
  const count=document.getElementById('lightbox-count');
  let index=0;
  function render(){image.src=links[index].href;image.alt='Capture du témoignage '+(index+1)+' sur '+links.length;count.textContent='Témoignage '+(index+1)+' / '+links.length;}
  function move(delta){index=(index+delta+links.length)%links.length;render();}
  links.forEach((link,i)=>link.addEventListener('click',event=>{if(typeof dialog.showModal!=='function')return;event.preventDefault();index=i;render();dialog.showModal();}));
  document.querySelector('[data-lightbox-close]').addEventListener('click',()=>dialog.close());
  document.querySelector('[data-lightbox-prev]').addEventListener('click',()=>move(-1));
  document.querySelector('[data-lightbox-next]').addEventListener('click',()=>move(1));
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  const motion=matchMedia('(prefers-reduced-motion:reduce)');
  const scroll=direction=>gallery.scrollBy({left:direction*Math.max(220,gallery.clientWidth*.75),behavior:motion.matches?'instant':'smooth'});
  document.querySelector('[data-gallery-prev]').addEventListener('click',()=>scroll(-1));
  document.querySelector('[data-gallery-next]').addEventListener('click',()=>scroll(1));
})();

(()=>{'use strict';
const site=document.getElementById('site-content');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const dialog=document.getElementById('testimonial-lightbox');
const image=document.getElementById('lightbox-image');
const count=document.getElementById('lightbox-count');
let lightboxLinks=[],index=0,lastTrigger;
function render(){const link=lightboxLinks[index];image.src=link.href;image.alt=link.querySelector('img')?.alt||'Photo personnelle';count.textContent=(link.dataset.lightbox==='testimonials'?'Témoignage ':'Photo ')+(index+1)+' / '+lightboxLinks.length;}
function move(delta){index=(index+delta+lightboxLinks.length)%lightboxLinks.length;render();}
site.querySelectorAll('[data-lightbox]').forEach(link=>link.addEventListener('click',event=>{if(!dialog.showModal)return;event.preventDefault();lastTrigger=link;lightboxLinks=Array.from(site.querySelectorAll('[data-lightbox="'+link.dataset.lightbox+'"]'));index=lightboxLinks.indexOf(link);render();dialog.showModal();}));
document.querySelector('[data-lightbox-close]').addEventListener('click',()=>dialog.close());
document.querySelector('[data-lightbox-prev]').addEventListener('click',()=>move(-1));
document.querySelector('[data-lightbox-next]').addEventListener('click',()=>move(1));
dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}});
dialog.addEventListener('close',()=>lastTrigger?.focus({preventScroll:true}));
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
const gallery=document.getElementById('testimonial-gallery'),cards=[...gallery.children],motion=document.querySelector('[data-gallery-pause]');
let current=0,paused=reduced.matches,visible=false,timer;
function galleryIndex(){const base=gallery.getBoundingClientRect().left;let distance=Infinity;cards.forEach((card,i)=>{const d=Math.abs(card.getBoundingClientRect().left-base);if(d<distance){distance=d;current=i;}});document.getElementById('gallery-count').textContent=(current+1)+' / '+cards.length;}
function scrollGallery(direction){const next=(current+direction+cards.length)%cards.length;gallery.scrollTo({left:cards[next].offsetLeft-cards[0].offsetLeft,behavior:reduced.matches?'instant':'smooth'});}
function syncGallery(){clearInterval(timer);motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Animer les témoignages':'Mettre les témoignages en pause');motion.textContent=paused?'▶':'Ⅱ';if(visible&&!paused&&!reduced.matches&&!document.hidden&&!dialog.open)timer=setInterval(()=>scrollGallery(1),6000);}
function pauseGallery(){paused=true;syncGallery();}
gallery.addEventListener('scroll',galleryIndex,{passive:true});gallery.addEventListener('pointerdown',pauseGallery);gallery.addEventListener('focusin',pauseGallery);gallery.addEventListener('mouseenter',()=>clearInterval(timer));gallery.addEventListener('mouseleave',syncGallery);
document.querySelector('[data-gallery-prev]').addEventListener('click',()=>{pauseGallery();scrollGallery(-1);});document.querySelector('[data-gallery-next]').addEventListener('click',()=>{pauseGallery();scrollGallery(1);});
motion.addEventListener('click',()=>{paused=!paused;syncGallery();});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncGallery();},{threshold:.1}).observe(gallery);
document.addEventListener('visibilitychange',syncGallery);reduced.addEventListener('change',()=>{paused=reduced.matches;syncGallery();});galleryIndex();syncGallery();
// Reveal content once; reduced-motion and unavailable observers keep it visible.
if(!reduced.matches&&'IntersectionObserver'in window){document.documentElement.classList.add('js');const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target);}}),{rootMargin:'40px 0px',threshold:.05});site.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));}
// Same full-screen opening as the reference, using the owner's still photo until a video is supplied.
const film=site.querySelector('[data-scroll-film]'),filmImage=film.querySelector('img'),progress=document.getElementById('progress');let queued=false;
function updateScroll(){queued=false;const rect=film.getBoundingClientRect(),stage=film.querySelector('.biz-scroll-film-stage'),range=Math.max(1,film.offsetHeight-stage.offsetHeight);const p=Math.max(0,Math.min(1,(parseFloat(getComputedStyle(stage).top)-rect.top)/range));film.style.setProperty('--film-progress',p);film.style.setProperty('--film-title-opacity',reduced.matches?1:Math.max(0,Math.min(1,(p-.1)*2)));filmImage.style.transform=reduced.matches?'none':'scale('+(1+p*.065)+')';const total=document.documentElement.scrollHeight-innerHeight;progress.style.transform='scaleX('+(total>0?scrollY/total:0)+')';}
function queueScroll(){if(!queued){queued=true;requestAnimationFrame(updateScroll);}}
window.addEventListener('scroll',queueScroll,{passive:true});window.addEventListener('resize',queueScroll,{passive:true});reduced.addEventListener('change',()=>{site.querySelectorAll('[data-reveal]').forEach(el=>el.classList.add('is-visible'));queueScroll();});updateScroll();
})();

const lessons=[
  {
    title:'Présentation de l’essai VIP',
    kicker:'01 · Découvrir l’essai d’un mois',
    duration:'À VENIR',
    label:'La présentation du mois d’essai',
    copy:'Découvre le fonctionnement de l’essai VIP pendant un mois sur compte démo, et ce que tu peux observer avant de décider si le service te convient.',
    points:['Présentation du service VIP InvestPro.','Découverte de l’essai d’un mois sur compte démo.','Aucun dépôt ni abonnement requis pendant l’essai.'],
    art:'ESSAI VIP',
    subtitle:'Un mois pour découvrir le service.'
  },
  {
    title:'Comprendre le copy trading',
    kicker:'02 · Découvrir la copie automatique',
    duration:'VIDÉO',
    label:'Le fonctionnement du copy trading',
    copy:'Une présentation du copy trading, de la façon dont les opérations sont répliquées et des risques à comprendre avant toute utilisation.',
    points:['Comprendre le principe de copie des opérations.','Découvrir les paramètres et conditions à vérifier.','Les pertes peuvent aussi être répliquées : aucun rendement n’est garanti.'],
    art:'COPY TRADING',
    subtitle:'Le fonctionnement, expliqué simplement.'
  }
];
let lesson=0;
let courseMedia=[];
const mediaIds=['presentation-vip','copy-trading'];
let watchProgress={};
try{watchProgress=JSON.parse(localStorage.getItem('investpro-watch-progress-v1')||'{}')}catch{}
function persistWatch(){try{localStorage.setItem('investpro-watch-progress-v1',JSON.stringify(watchProgress))}catch{}}
function mountVideo(){
  const item=courseMedia.find(v=>v.id===mediaIds[lesson]);
  const label=document.getElementById('video-status');
  if(!item||!item.src){label.textContent='Vidéo à venir';return}
  let url;try{url=new URL(item.src,document.baseURI);if(!['http:','https:'].includes(url.protocol))return}catch{return}
  const stage=document.getElementById('video-stage');stage.replaceChildren();
  const player=document.createElement('video');player.controls=true;player.playsInline=true;player.preload='metadata';player.className='course-player';player.setAttribute('aria-label',lessons[lesson].title);
  if(item.poster)player.poster=new URL(item.poster,document.baseURI).href;
  const source=document.createElement('source');source.type=item.type||'video/quicktime';source.src=url.href;player.append(source);stage.append(player);
  const id=item.id;let lastSaved=0;
  label.textContent='Lecture directement sur le site';
  player.addEventListener('loadedmetadata',()=>{const previous=watchProgress[id];if(previous&&previous.time>0&&!previous.ended&&previous.time<player.duration-2){player.currentTime=previous.time;label.textContent='Reprise de ta dernière lecture'}});
  player.addEventListener('timeupdate',()=>{if(Math.abs(player.currentTime-lastSaved)<5)return;lastSaved=player.currentTime;watchProgress[id]={time:player.currentTime,ended:false};persistWatch()});
  player.addEventListener('pause',()=>{if(!player.ended){watchProgress[id]={time:player.currentTime,ended:false};persistWatch()}});
  player.addEventListener('ended',()=>{watchProgress[id]={time:player.duration,ended:true};persistWatch();label.textContent='Vidéo terminée · Tu peux poursuivre'});
  const onMediaError=()=>{label.textContent='La vidéo ne se charge pas. Réessaie ou contacte l’équipe.'};player.addEventListener('error',onMediaError);source.addEventListener('error',onMediaError);
}
fetch('media.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('media');return r.json()}).then(config=>{courseMedia=Array.isArray(config.videos)?config.videos:[];mountVideo()}).catch(()=>{document.getElementById('video-status').textContent='Vidéos indisponibles pour le moment'});
function showLesson(focus=false){
  const oldPlayer=document.querySelector('.course-player');
  if(oldPlayer){oldPlayer.pause();oldPlayer.querySelectorAll('source').forEach(s=>s.remove());oldPlayer.removeAttribute('src');oldPlayer.load()}
  const l=lessons[lesson];
  document.getElementById('video-stage').innerHTML=`<div class="video-poster"><div class="poster-top"><span>INVESTPRO TRADING · ESSAI VIP</span><span>${l.duration}</span></div><div class="poster-main"><span class="poster-chapter">0${lesson+1}</span><div class="poster-word">${l.art}</div><p>${l.subtitle}</p><span class="play-symbol" aria-hidden="true">▶</span></div><div class="poster-bottom"><span>${l.label}</span><span>VIDÉO</span></div></div>`;
  document.getElementById('video-kicker').textContent=l.kicker;
  document.getElementById('video-title').textContent=l.title;
  document.getElementById('video-copy').textContent=l.copy;
  document.getElementById('video-points').innerHTML=l.points.map(p=>`<li>${p}</li>`).join('');
  document.getElementById('video-next').textContent=lesson===lessons.length-1?'Accéder aux questions →':'Voir la vidéo suivante →';
  document.querySelectorAll('[data-video]').forEach(b=>{if(Number(b.dataset.video)===lesson)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});
  mountVideo();
  if(focus)document.querySelector('.video-feature').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
document.querySelectorAll('[data-video]').forEach(b=>b.onclick=()=>{lesson=Number(b.dataset.video);showLesson(true)});
document.getElementById('video-next').onclick=()=>{if(lesson<lessons.length-1){lesson++;showLesson(true)}else document.getElementById('questions').scrollIntoView({block:'start',behavior:'smooth'})};
showLesson();
document.addEventListener('play',event=>{if(event.target instanceof HTMLVideoElement)document.querySelectorAll('video').forEach(player=>{if(player!==event.target)player.pause()})},true);

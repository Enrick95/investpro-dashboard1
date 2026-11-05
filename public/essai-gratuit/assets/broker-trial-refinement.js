(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = [
    ['.arrival-heading', 'left'],
    ['.arrival-screen', 'right'],
    ['.video-section-head'],
    ['.video-layout'],
    ['.guide-intro'],
    ['.guide-layout'],
    ['.after'],
    ['.faq'],
    ['.closing-invitation']
  ];
  const observed = [];
  targets.forEach(([selector, direction]) => document.querySelectorAll(selector).forEach(node => {
    node.dataset.reveal = direction || 'up';
    observed.push(node);
  }));
  if (!('IntersectionObserver' in window)) {
    observed.forEach(node => node.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: .13, rootMargin: '0px 0px -40px' });
  observed.forEach(node => observer.observe(node));
})();


/* Exact VIP gallery scroll controller */
(function(){
  var stage=document.querySelector('.vip-gallery__stage');
  if(!stage || stage.dataset.galleryBound === 'true') return;
  stage.dataset.galleryBound='true';
  var panel=stage.querySelector('.vip-gallery__panel');
  var screen=stage.querySelector('.vip-gallery__screen-track');
  var captions=stage.querySelector('.vip-gallery__caption-track');
  var count=stage.querySelectorAll('.vip-gallery__screen-slide').length;
  var step=0, raf=0, header=88;
  function render(index){
    index=Math.max(0,Math.min(count-1,index));
    // Keep the mockups and captions aligned to one complete card at a time.
    // The track is viewport-width; each child is one viewport wide.
    var activeIndex=Math.round(index);
    var transform='translate3d(' + (-100*activeIndex/count) + '%,0,0)';
    screen.style.transform=transform;
    captions.style.transform=transform;
    Array.prototype.forEach.call(captions.children,function(card,i){
      var active=i===activeIndex;
      card.style.opacity=active?'1':'0';
      card.style.visibility=active?'visible':'hidden';
    });
  }
  function update(){
    raf=0;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){render(0);return;}
    var rect=stage.getBoundingClientRect();
    render((header-rect.top)/step);
  }
  function request(){if(!raf) raf=window.requestAnimationFrame(update);}
  function resize(){
    var reduced=window.matchMedia('(prefers-reduced-motion: reduce), (max-height: 600px)').matches;
    if(reduced){stage.style.height='auto';render(0);return;}
    var intro=stage.querySelector('.vip-gallery__intro');
    var cap=stage.querySelector('.vip-gallery__caption-viewport');
    if(window.innerWidth>=640 && intro && cap){
      var available=Math.max(330,window.innerHeight-header-intro.offsetHeight-cap.offsetHeight-50);
      panel.style.setProperty('--gallery-laptop-width',String(572*available/410)+'px');
    } else panel.style.removeProperty('--gallery-laptop-width');
    step=Math.max(240,.7*window.innerHeight);
    stage.style.height=(panel.offsetHeight+step*(count-1))+'px';
    request();
  }
  window.addEventListener('scroll',request,{passive:true});
  window.addEventListener('resize',resize);
  if('ResizeObserver' in window) new ResizeObserver(resize).observe(panel);
  resize();
})();

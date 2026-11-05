(() => {
  const gallery = document.querySelector('#testimonial-gallery');
  if (!gallery) return;
  const cards = [...gallery.querySelectorAll('.testimonial-visual')];
  const counter = document.querySelector('.testimonial-gallery-count');
  const step = () => Math.max(260, Math.round(gallery.clientWidth * 0.78));
  document.querySelector('[data-gallery-previous]')?.addEventListener('click', () => gallery.scrollBy({left: -step(), behavior: 'smooth'}));
  document.querySelector('[data-gallery-next]')?.addEventListener('click', () => gallery.scrollBy({left: step(), behavior: 'smooth'}));
  let ticking = false;
  gallery.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const left = gallery.getBoundingClientRect().left;
      let index = 0;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].getBoundingClientRect().left - left <= 12) index = i;
        else break;
      }
      if (counter) counter.textContent = `${String(index + 1).padStart(2, '0')} / ${cards.length}`;
      ticking = false;
    });
  }, {passive: true});
})();

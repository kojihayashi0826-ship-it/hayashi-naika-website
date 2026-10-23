(() => {
  'use strict';

  // Keep bookmarked links to the former home-page sections working.
  const legacyPages = { '#first-visit': 'first-visit.html', '#care': 'care.html', '#tests': 'tests.html', '#doctor': 'doctor.html', '#vaccine': 'vaccines.html', '#checkups': 'checkups.html' };
  const followLegacyLink = () => {
    const file = location.pathname.split('/').pop();
    const destination = legacyPages[location.hash];
    if ((!file || file === 'index.html') && destination) location.replace(destination);
  };
  followLegacyLink();
  window.addEventListener('hashchange', followLegacyLink);

  document.querySelectorAll('.back-to-top').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.site-header .brand')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? 'instant' : 'smooth' });
    });
  });
})();

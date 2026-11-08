/* Aperçu du thème « logo » : /vip/deja-membre?apercu=1 et /vip/nouveau-membre?apercu=1.
   Active le thème et simule les réponses du serveur : rien n'est envoyé, aucun compte n'est créé. */
(function () {
  if (!/[?&]apercu=1(?:&|$)/.test(location.search)) return;
  var root = document.documentElement;
  root.classList.add('iplogo', 'apercu');

  var demo = { member: null, active: false };
  function json(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } }));
  }
  function memberState() {
    var m = demo.member;
    if (!m) return { signedIn: false };
    return demo.active
      ? { signedIn: true, state: 'active', email: m.email, firstName: m.firstName, lastName: m.lastName, memberNumber: 427, since: new Date().toISOString() }
      : { signedIn: true, state: 'pending', email: m.email, firstName: m.firstName, lastName: m.lastName };
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    var method = ((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0) return realFetch(input, init);
    var body = {};
    try { if (init && typeof init.body === 'string') body = JSON.parse(init.body); } catch (e) {}
    switch (url.pathname) {
      case '/api/vip/deja-membre':
        if (method === 'GET') return json(200, memberState());
        if (method === 'DELETE') { demo.member = null; demo.active = false; return json(200, { ok: true }); }
        demo.member = { email: String(body.email || '').toLowerCase(), firstName: body.firstName || '', lastName: body.lastName || '' };
        return json(201, { ok: true, state: 'pending', accessCode: body.mode === 'login' ? null : 'Ab3d-Ef7g-Hk9m', created: body.mode !== 'login', signedIn: true, email: demo.member.email, firstName: demo.member.firstName, lastName: demo.member.lastName });
      case '/api/copier/push':
        return json(200, method === 'GET' ? { publicKey: null, available: false } : { ok: true });
      case '/api/vip/nouveau-membre':
        return json(401, { error: 'Aperçu : non connecté.' });
      case '/api/vip/nouveau-membre/demande':
        return json(201, { ok: true, applicationId: 'apercu', suiviToken: 'apercu' });
      case '/api/vip/nouveau-membre/suivi':
        return json(200, { status: 'submitted' });
      case '/api/vip/abonne':
        return json(201, { ok: true, requestId: 'apercu' });
      default:
        return json(404, { error: 'Aperçu : rien n’est envoyé.' });
    }
  };
  window.VIP_APERCU = { validate: function () { demo.active = true; } };

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.className = 'apercu-bar';
    bar.innerHTML = '<b>Aperçu du nouveau design</b> · rien n’est envoyé, tu peux tout essayer';
    document.body.insertBefore(bar, document.body.firstChild);
    document.querySelectorAll('[data-apercu]').forEach(function (el) { el.hidden = false; });
  });
})();

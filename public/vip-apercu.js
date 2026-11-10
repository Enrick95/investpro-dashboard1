/* Aperçu du thème « logo » : /vip/deja-membre?apercu=1 et /vip/nouveau-membre?apercu=1.
   Active le thème et simule les réponses du serveur : rien n'est envoyé, aucun compte n'est créé. */
(function () {
  if (!/[?&]apercu=1(?:&|$)/.test(location.search)) return;
  var root = document.documentElement;
  root.classList.add('iplogo', 'apercu');

  var demo = { member: null, active: false, connections: [] };
  // Un extrait du catalogue des serveurs MetaTrader, pour l'étape « Ton compte MetaTrader ».
  var CATALOG = [
    ['mt5-vt-1', 'VT Markets', 'MT5', 'VTMarkets-Live'], ['mt5-vt-2', 'VT Markets', 'MT5', 'VTMarkets-Live 2'], ['mt5-vt-3', 'VT Markets', 'MT5', 'VTMarkets-Demo'],
    ['mt5-pu-1', 'PU Prime', 'MT5', 'PUPrime-Live'], ['mt5-pu-2', 'PU Prime', 'MT5', 'PUPrime-Live 2'],
    ['mt5-axi-1', 'Axi', 'MT5', 'Axi-US50-Live'], ['mt5-raise-1', 'Raise Global', 'MT5', 'RaiseGlobal-Live'],
    ['mt4-vt-1', 'VT Markets', 'MT4', 'VTMarkets-Live'], ['mt4-fusion-1', 'Fusion Markets', 'MT4', 'FusionMarkets-Live'], ['mt4-axi-1', 'Axi', 'MT4', 'Axi-US03-Live']
  ].map(function (b) { return { id: 'apercu-' + b[0], label: b[1], platform: b[2], server: b[3] }; });
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
        if (method === 'DELETE') { demo.member = null; demo.active = false; demo.connections = []; return json(200, { ok: true }); }
        demo.member = { email: String(body.email || '').toLowerCase(), firstName: body.firstName || '', lastName: body.lastName || '' };
        return json(201, { ok: true, state: 'pending', accessCode: body.mode === 'login' ? null : 'Ab3d-Ef7g-Hk9m', created: body.mode !== 'login', signedIn: true, email: demo.member.email, firstName: demo.member.firstName, lastName: demo.member.lastName });
      case '/api/metasync/hosted':
        if (!demo.member) return json(200, { enabled: false });
        if (method === 'GET') return json(200, url.searchParams.get('requestProof') === '1' ? { enabled: true, requestToken: 'apercu' } : { enabled: true, brokers: CATALOG, connections: demo.connections, requestToken: 'apercu' });
        var server = CATALOG.filter(function (b) { return b.id === body.broker; })[0];
        if (!server) return json(400, { error: 'Ce serveur n’est pas disponible dans le catalogue InvestPro. Vérifie la plateforme et le serveur choisis.' });
        var link = { id: 'apercu-' + demo.connections.length, active: true, status: 'connecting', investpro_mt_connections: { login: String(body.login), platform: server.platform, server: server.server, currency: body.currency, last_sync: null } };
        demo.connections.push(link);
        setTimeout(function () { link.status = 'syncing'; link.investpro_mt_connections.last_sync = new Date().toISOString(); }, 4000);
        return json(200, { ok: true, id: link.id });
      case '/api/metasync/servers':
        return json(200, { ok: true });
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

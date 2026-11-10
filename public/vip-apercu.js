/* Aperçu du thème « logo » : /vip/deja-membre?apercu=1 et /vip/nouveau-membre?apercu=1.
   Active le thème et simule les réponses du serveur : rien n'est envoyé, aucun compte n'est créé. */
(function () {
  if (!/[?&]apercu=1(?:&|$)/.test(location.search)) return;
  var root = document.documentElement;
  root.classList.add('iplogo', 'apercu');

  var demo = { member: null, active: false, connections: [] };
  // Les serveurs des brokers du VIP, pour l'étape « Ton compte MetaTrader ». Sur le site, la liste vient des
  // modèles installés sur le PC d'hébergement (METASYNC_HOSTED_BROKERS).
  var n = function (prefix, from, to, extra) { var out = []; for (var i = from; i <= to; i++) out.push(prefix + (i === 1 ? '' : ' ' + i)); return out.concat(extra || []); };
  var GROUPS = [
    ['MT4', 'Axi', ['Axi-US02-Live', 'Axi-US03-Demo', 'Axi-US03-Live', 'Axi-US05-Live', 'Axi-US06-Live', 'Axi-US07-Live', 'Axi-US09-Live', 'Axi-US10-Live', 'Axi-US12-Live', 'Axi-US15-Live', 'Axi-US16-Live', 'Axi-US17-Live', 'Axi-US18-Live', 'Axi-US888-Demo', 'Axi-US888-Live']],
    ['MT4', 'Fusion Markets', ['FusionMarkets-Demo', 'FusionMarkets-Live', 'FusionMarkets-Live 2', 'FusionMarkets-Live 3']],
    ['MT4', 'PU Prime', ['PUPrime-Demo'].concat(n('PUPrime-Live', 1, 7))],
    ['MT4', 'VT Markets', ['VTMarkets-Demo'].concat(n('VTMarkets-Live', 1, 9))],
    ['MT5', 'Axi', ['Axi-US50-Demo', 'Axi-US50-Live', 'Axi-US51-Live', 'Axi-US52-Live', 'Axi-US53-Live', 'Axi-US54-Live', 'Axi-US88-Live']],
    ['MT5', 'PU Prime', ['PUPrime-Demo', 'PUPrime-Live', 'PUPrime-Live2', 'PUPrime-Live 4', 'PUPrime-Live 5', 'PUPrime-Live 6', 'PUPrime-Live 7', 'PUPrimeTrading-Live']],
    ['MT5', 'Raise Global', ['RaiseGlobal-Live', 'RaiseGlobalSA-LIVE']],
    ['MT5', 'VT Markets', ['VTMarkets-Demo'].concat(n('VTMarkets-Live', 1, 9), ['VTMarketsLtd-Live 4'])]
  ];
  var CATALOG = [];
  GROUPS.forEach(function (g) { g[2].forEach(function (server, i) { CATALOG.push({ id: 'apercu-' + g[0].toLowerCase() + '-' + g[1].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (i + 1), label: g[1], platform: g[0], server: server }); }); });
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

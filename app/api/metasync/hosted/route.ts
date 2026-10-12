import { serverCatalog } from '@/lib/metasync/server-catalog';
import { randomBytes } from 'node:crypto';
import { database, digest, sameOrigin } from '@/lib/metasync/server';
import { body, hostedUser, seal } from '@/lib/metasync/hosted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });

function hostedConnectorConfigured() {
  return (
    /^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_ENCRYPTION_KEY ?? '') &&
    /^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_WORKER_TOKEN ?? '')
  );
}

function isCurrentPreviewOrigin(req: Request) {
  const deployment = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return (
    process.env.VERCEL_ENV === 'preview' &&
    !!deployment &&
    req.headers.get('origin') === `https://${deployment}`
  );
}

export async function GET() {
  try {
    const user = await hostedUser();
    if (!user) return reply({ enabled: false });

    const { data, error } = await database()
      .from('investpro_mt_hosted')
      .select(
        'id,broker_id,active,status,updated_at,capital_auto,capital_reference,capital_method,funding_summary,equity,investpro_mt_connections(login,server,platform,last_sync,account_id,warnings,currency)'
      )
      .eq('user_id', user.id)
      .order('created_at');

    if (error) throw Error('hosted_read');
    return reply({ enabled: true, brokers: await serverCatalog(), connections: data });
  } catch {
    return reply(
      { error: 'Connexion hébergée indisponible. Réessaie dans quelques instants.' },
      503
    );
  }
}

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof hostedUser>>;
  try {
    user = await hostedUser();
  } catch {
    return reply({ error: 'InvestPro ne peut pas vérifier ta session pour le moment.' }, 503);
  }
  if (!user) {
    return reply(
      { error: 'Ta session InvestPro a expiré. Reconnecte-toi puis réessaie.' },
      401
    );
  }
  if (process.env.VERCEL_ENV === 'preview') {
    if (!isCurrentPreviewOrigin(req)) {
      return reply({ error: 'Cette requête ne vient pas de cet aperçu InvestPro.' }, 403);
    }
    return reply(
      { error: 'La connexion hébergée ne peut pas être modifiée depuis un aperçu. Aucun changement n’a été effectué. Utilise la version officielle InvestPro.' },
      503
    );
  }
  if (!sameOrigin(req)) {
    return reply({ error: 'Cette requête ne vient pas d’une adresse InvestPro autorisée.' }, 403);
  }

  let v: Record<string, unknown>;
  try {
    v = await body(req);
  } catch {
    return reply(
      { error: 'La demande reçue est invalide. Recharge la page puis réessaie.' },
      400
    );
  }

  let db: ReturnType<typeof database>;
  try {
    db = database();
  } catch {
    return reply({ error: 'La connexion aux services InvestPro est indisponible.' }, 503);
  }
  if (v.action === 'stop') {
    if (typeof v.id !== 'string' || !/^[a-f0-9-]{36}$/.test(v.id)) {
      return reply({ error: 'Connexion MetaTrader invalide.' }, 400);
    }
    const { error } = await db.rpc('investpro_hosted_stop', {
      p_user: user.id,
      p_id: v.id,
    });
    if (error) {
      return reply({ error: 'InvestPro n’a pas pu enregistrer la déconnexion. Réessaie.' }, 503);
    }
    return reply({ ok: true });
  }

  let catalog: Awaited<ReturnType<typeof serverCatalog>>;
  try {
    catalog = await serverCatalog();
  } catch {
    return reply({ error: 'Le catalogue des serveurs InvestPro est indisponible.' }, 503);
  }
  const broker = catalog.find((item) => item.id === v.broker);
  if (!broker) {
    return reply(
      { error: 'Ce serveur n’est pas disponible dans le catalogue InvestPro. Vérifie la plateforme et le serveur choisis.' },
      400
    );
  }

  if (
    typeof v.login !== 'string' ||
    !/^\d{1,10}$/.test(v.login) ||
    Number(v.login) <= 0 ||
    (broker.platform === 'MT4' && Number(v.login) > 2147483647)
  ) {
    return reply(
      { error: 'Le numéro de compte doit contenir uniquement les chiffres du login MetaTrader.' },
      400
    );
  }
  if (typeof v.password !== 'string' || !v.password.length || v.password.length > 128 || /[\r\n\0]/.test(v.password)) {
    return reply(
      { error: 'Le mot de passe est absent ou son format ne peut pas être accepté. Vérifie la saisie.' },
      400
    );
  }
  if (v.syncConsent !== true) {
    return reply({ error: 'Coche l’autorisation de synchronisation pour continuer.' }, 400);
  }
  if (typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency)) {
    return reply(
      { error: 'La devise doit être un code de trois lettres majuscules, par exemple USD.' },
      400
    );
  }
  if (typeof v.type !== 'string' || !['real', 'demo', 'prop'].includes(v.type)) {
    return reply({ error: 'Le type de compte sélectionné n’est pas valide.' }, 400);
  }
  const login = v.login;
  const password = v.password;
  const currency = v.currency;
  const type = v.type;

  // Never create a hosted job unless this environment has its encryption key
  // and worker credential. Production values are intentionally not copied.
  if (!hostedConnectorConfigured()) {
    return reply(
      { error: 'Le service de connexion hébergée n’est pas configuré sur cet environnement. Aucune connexion n’a été créée. Contacte le support InvestPro.' },
      503
    );
  }

  try {
    const { data, error } = await db.rpc('investpro_hosted_pair_auto', {
      p_user: user.id,
      p_platform: broker.platform,
      p_login: login,
      p_server: broker.server,
      p_currency: currency,
      p_type: type,
      p_broker: broker.id,
      p_secret: seal(password, user.id),
      p_hash: digest(randomBytes(32).toString('hex')),
    });

    if (error) {
      // Use only known database outcomes; never return or log raw DB errors.
      const message = error.message.toLowerCase();
      if (error.code === '42501') {
        return reply({ error: 'InvestPro a refusé cette opération pour des raisons d’autorisation du compte.' }, 403);
      }
      if (message === 'too frequent') {
        return reply({ error: 'Une demande vient déjà d’être envoyée pour ce compte. Patiente quelques secondes.' }, 429);
      }
      if (message === 'global limit') {
        return reply({ error: 'Le service de connexion a atteint sa limite temporaire. Réessaie plus tard.' }, 503);
      }
      if (message === 'limit') {
        return reply({ error: 'Tu as atteint la limite de dix connexions hébergées.' }, 409);
      }
      if (message === 'existing local connection') {
        return reply({ error: 'Ce compte a déjà une connexion MetaTrader enregistrée dans InvestPro. Réutilise cette connexion ou déconnecte-la avant de créer une connexion hébergée.' }, 409);
      }
      return reply({ error: 'InvestPro n’a pas pu enregistrer cette connexion. Réessaie ou contacte le support.' }, 503);
    }

    return reply({ ok: true, id: data });
  } catch {
    return reply({ error: 'InvestPro n’a pas pu enregistrer cette connexion. Réessaie ou contacte le support.' }, 503);
  }
}

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { decryptCopierPassword } from '@/lib/copier/requestCrypto';
import { serverCatalog } from '@/lib/metasync/server-catalog';
import { body, hostedUser, seal } from '@/lib/metasync/hosted';
import { database, digest, sameOrigin } from '@/lib/metasync/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error('configuration');
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hostedConnectorConfigured() {
  return /^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_ENCRYPTION_KEY ?? '') &&
    /^[a-f0-9]{64}$/.test(process.env.METASYNC_HOSTED_WORKER_TOKEN ?? '');
}

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof hostedUser>>;
  try {
    user = await hostedUser();
  } catch {
    return reply({ error: 'InvestPro ne peut pas vérifier ta session pour le moment.' }, 503);
  }
  if (!user) return reply({ error: 'Ta session InvestPro a expiré. Reconnecte-toi puis réessaie.' }, 401);
  if (process.env.VERCEL_ENV === 'preview') {
    return reply({ error: 'La synchronisation MetaSync ne peut pas être créée depuis un aperçu. Utilise la version officielle InvestPro.' }, 503);
  }
  if (!sameOrigin(req)) return reply({ error: 'Cette requête ne vient pas d’une adresse InvestPro autorisée.' }, 403);

  let input: Record<string, unknown>;
  try {
    input = await body(req);
  } catch {
    return reply({ error: 'La demande reçue est invalide. Recharge la page puis réessaie.' }, 400);
  }
  if (input.syncConsent !== true) return reply({ error: 'Confirme l’autorisation MetaSync pour continuer.' }, 400);
  if (typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) {
    return reply({ error: 'Le compte Master sélectionné est invalide.' }, 400);
  }
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) {
    return reply({ error: 'Indique la devise du compte (par exemple USD ou EUR).' }, 400);
  }
  if (typeof input.type !== 'string' || !['real', 'demo', 'prop'].includes(input.type)) {
    return reply({ error: 'Sélectionne le type réel, démo ou prop firm du compte.' }, 400);
  }
  if (!hostedConnectorConfigured()) {
    return reply({ error: 'Le service MetaSync n’est pas configuré sur cet environnement. Aucune connexion n’a été créée.' }, 503);
  }

  let admin: ReturnType<typeof clients>;
  try {
    admin = clients();
  } catch {
    return reply({ error: 'La connexion aux services InvestPro est indisponible.' }, 503);
  }

  const { data: requestRow, error: requestError } = await admin
    .from('copier_account_requests')
    .select('id,user_id,platform,login,server,status,password_cipher')
    .eq('id', input.requestId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (requestError || !requestRow) return reply({ error: 'Compte Master introuvable dans cet espace.' }, 404);
  if (requestRow.status !== 'activated' || !requestRow.password_cipher) {
    return reply({ error: 'Ce compte Master doit être approuvé avant de lancer sa synchronisation.' }, 409);
  }

  const { data: ownership, error: ownershipError } = await admin
    .from('copier_master_ownership')
    .select('provider_master_id')
    .eq('request_id', requestRow.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (ownershipError || !ownership?.provider_master_id) {
    return reply({ error: 'Ce Master n’est plus associé à ton espace InvestPro.' }, 403);
  }

  const { data: removal, error: removalError } = await admin
    .from('copier_master_removal_requests')
    .select('status')
    .eq('user_id', user.id)
    .eq('provider_master_id', ownership.provider_master_id)
    .in('status', ['pending', 'processing', 'completed'])
    .limit(1)
    .maybeSingle();
  if (removalError) return reply({ error: 'Impossible de vérifier l’état de retrait de ce Master.' }, 503);
  if (removal) return reply({ error: 'La synchronisation est indisponible pendant ou après le retrait de ce Master.' }, 409);

  const platform = String(requestRow.platform).toUpperCase();
  const login = String(requestRow.login).trim();
  const server = String(requestRow.server).trim();
  let catalog: Awaited<ReturnType<typeof serverCatalog>>;
  try {
    catalog = await serverCatalog();
  } catch {
    return reply({ error: 'Le catalogue MetaSync est indisponible. Réessaie dans quelques instants.' }, 503);
  }
  const broker = catalog.find((candidate) => candidate.platform === platform && candidate.server.trim().toLowerCase() === server.toLowerCase());
  if (!broker) return reply({ error: 'Ce serveur n’est pas encore pris en charge par MetaSync. Le compte Master reste actif.' }, 400);

  const { data: currentConnection, error: connectionError } = await admin
    .from('investpro_mt_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .eq('login', login)
    .eq('server', server)
    .limit(1)
    .maybeSingle();
  if (connectionError) return reply({ error: 'Impossible de vérifier les connexions MetaSync existantes.' }, 503);
  if (currentConnection) return reply({ ok: true, alreadyConnected: true });

  let password: string;
  try {
    password = decryptCopierPassword(String(requestRow.password_cipher));
  } catch {
    return reply({ error: 'Les identifiants chiffrés de ce Master ne peuvent pas être lus. Contacte le support InvestPro.' }, 503);
  }

  try {
    const { error } = await database().rpc('investpro_hosted_pair_auto', {
      p_user: user.id,
      p_platform: broker.platform,
      p_login: login,
      p_server: broker.server,
      p_currency: input.currency,
      p_type: input.type,
      p_broker: broker.id,
      p_secret: seal(password, user.id),
      p_hash: digest(randomBytes(32).toString('hex')),
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (error.code === '42501') return reply({ error: 'InvestPro a refusé cette opération pour des raisons d’autorisation du compte.' }, 403);
      if (message === 'too frequent') return reply({ error: 'Une demande vient déjà d’être envoyée. Patiente quelques secondes.' }, 429);
      if (message === 'global limit') return reply({ error: 'Le service de connexion a atteint sa limite temporaire. Réessaie plus tard.' }, 503);
      if (message === 'limit') return reply({ error: 'Tu as atteint la limite de connexions MetaSync.' }, 409);
      if (message === 'existing local connection') return reply({ error: 'Ce compte existe déjà dans Mes comptes. Relie ou réactive cette connexion pour afficher le solde.' }, 409);
      return reply({ error: 'InvestPro n’a pas pu lancer la synchronisation. Le compte Master reste actif.' }, 503);
    }
    return reply({ ok: true, alreadyConnected: false });
  } catch {
    return reply({ error: 'InvestPro n’a pas pu lancer la synchronisation. Le compte Master reste actif.' }, 503);
  } finally {
    password = '';
  }
}

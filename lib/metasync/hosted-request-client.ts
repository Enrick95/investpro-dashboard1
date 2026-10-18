const hostedPath = "/api/metasync/hosted";
const proofPath = "/api/metasync/hosted?requestProof=1";

type HostedMutation =
  | { action: "stop"; id: string }
  | { broker: string; login: string; password: string; currency: string; type: string; syncConsent: boolean };

export class HostedRequestError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "HostedRequestError";
  }
}

type HostedReply = Record<string, unknown>;

async function readReply(response: Response): Promise<HostedReply> {
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HostedRequestError("La réponse InvestPro est indisponible. Réessaie dans quelques instants.");
  }
  return value as HostedReply;
}

function responseError(reply: HostedReply) {
  return new HostedRequestError(
    typeof reply.error === "string" ? reply.error : "Connexion impossible. Réessaie dans quelques instants.",
    typeof reply.code === "string" ? reply.code : undefined
  );
}

async function freshRequestToken(fetcher: typeof fetch): Promise<string | null> {
  const response = await fetcher(proofPath, {
    credentials: "same-origin",
    cache: "no-store",
    mode: "same-origin",
    redirect: "error",
  });
  const reply = await readReply(response);
  if (!response.ok) throw responseError(reply);
  if (reply.enabled !== true) {
    throw new HostedRequestError("Ta session InvestPro a expiré. Reconnecte-toi puis réessaie.");
  }
  // Keep each proof in this operation only: background polling cannot replace it.
  return typeof reply.requestToken === "string" && reply.requestToken.length > 0 && reply.requestToken.length <= 160 && !/[\r\n]/.test(reply.requestToken)
    ? reply.requestToken
    : null;
}

export async function sendHostedMutation(payload: HostedMutation, fetcher: typeof fetch = fetch): Promise<HostedReply> {
  let requestToken = await freshRequestToken(fetcher);
  // Serialize credentials only after the fresh authenticated GET succeeds.
  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher(hostedPath, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      mode: "same-origin",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(requestToken ? { "X-InvestPro-MT-Token": requestToken } : {}),
      },
      body,
    });
    const reply = await readReply(response);
    if (response.ok) return reply;
    // Only this explicit pre-mutation rejection is safe to retry. A timeout or
    // other failure may have already recorded the connection server-side.
    if (attempt === 0 && (response.status === 401 || response.status === 403) && reply.code === "MT_REQUEST_PROOF_EXPIRED") {
      requestToken = await freshRequestToken(fetcher);
      continue;
    }
    throw responseError(reply);
  }
  throw new HostedRequestError("Connexion impossible. Réessaie dans quelques instants.");
}

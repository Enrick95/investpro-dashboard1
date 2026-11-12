import { serviceDb } from "@/lib/clip/server";
import { validEmailOptOut } from "@/lib/clip/notify";
import { CLIP_PUBLIC_URL } from "@/lib/clip/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lien « Ne plus recevoir ces e-mails » des mails de nouvelles vidéos.
 * GET affiche une confirmation (un simple aperçu du lien ne désabonne personne) ;
 * POST coupe les e-mails : bouton de la page ou désabonnement en un clic de la messagerie.
 */

const PROFILE_URL = `${CLIP_PUBLIC_URL}/login#profil`;

function page(title: string, content: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0b0d0b">
<title>${title} · InvestPro Clip</title>
<link rel="icon" href="/clip-app/icon-32.png">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0b0d0b;color:#F3EFE6;font-family:Manrope,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
main{width:100%;max-width:420px;padding:28px 24px;border-radius:22px;background:#121511;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:14px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px}
.pill{font-size:10px;font-weight:800;letter-spacing:.08em;color:#0b0d0b;background:#F0C575;padding:3px 6px;border-radius:999px}
h1{margin:6px 0 0;font-size:21px;line-height:1.3}
p{margin:0;color:#C4C8BD;font-size:14.5px}
button,a.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;padding:0 18px;border:0;border-radius:14px;background:#F0C575;color:#0b0d0b;font:inherit;font-size:15px;font-weight:800;text-decoration:none;cursor:pointer}
a.ghost{background:transparent;color:#F3EFE6;border:1px solid rgba(255,255,255,.18)}
</style>
</head>
<body>
<main>
<div class="brand"><svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="9" fill="none" stroke="#F0C575" stroke-width="1.6"/><path d="M12.5 9.5v11l8.5-5.5z" fill="#F0C575"/></svg>InvestPro <span class="pill">CLIP</span></div>
${content}
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
  });
}

function invalid(): Response {
  return page(
    "Lien expiré",
    `<h1>Ce lien ne fonctionne plus</h1><p>Tu peux couper ou réactiver les e-mails des nouvelles vidéos depuis ton profil.</p><a class="btn" href="${PROFILE_URL}">Ouvrir mon espace</a>`,
    400,
  );
}

function readLink(request: Request): { clipperId: string; token: string } {
  const url = new URL(request.url);
  return { clipperId: url.searchParams.get("c") ?? "", token: url.searchParams.get("t") ?? "" };
}

export async function GET(request: Request) {
  const { clipperId, token } = readLink(request);
  if (!validEmailOptOut(clipperId, token)) return invalid();
  return page(
    "E-mails des nouvelles vidéos",
    `<h1>Ne plus recevoir les e-mails des nouvelles vidéos ?</h1><p>Tu verras toujours les nouvelles vidéos dans ton espace, et sur ton téléphone si tu as activé les notifications.</p><form method="post" action="/api/clip/emails?c=${clipperId}&amp;t=${token}"><button type="submit">Ne plus recevoir ces e-mails</button></form><a class="btn ghost" href="${PROFILE_URL}">Garder les e-mails</a>`,
  );
}

export async function POST(request: Request) {
  const { clipperId, token } = readLink(request);
  if (!validEmailOptOut(clipperId, token)) return invalid();
  try {
    const { error } = await serviceDb().from("clip_clippers").update({ notify_email: false }).eq("id", clipperId);
    if (error) throw error;
  } catch {
    console.error("[clip-emails] désabonnement impossible");
    return page("Réessaie", `<h1>Ça n'a pas marché</h1><p>Le service est momentanément indisponible. Réessaie dans un instant, ou coupe les e-mails depuis ton profil.</p><a class="btn" href="${PROFILE_URL}">Ouvrir mon espace</a>`, 503);
  }
  return page(
    "C'est noté",
    `<h1>C'est noté</h1><p>Tu ne recevras plus d'e-mail à chaque nouvelle vidéo. Tu peux les réactiver quand tu veux dans ton profil.</p><a class="btn" href="${PROFILE_URL}">Ouvrir mon espace</a>`,
  );
}

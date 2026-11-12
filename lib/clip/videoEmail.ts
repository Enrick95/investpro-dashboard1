import { CLIP_PUBLIC_URL } from "@/lib/clip/rules";

/** La vidéo telle que les clippeurs la verront. campaign : seulement si la campagne est en cours. */
export type VideoNotice = { id: string; title: string; note: string | null; campaign: string | null };

const SPACE_URL = `${CLIP_PUBLIC_URL}/login`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** E-mail « Nouvelle vidéo à clipper » (HTML + texte), en tutoiement comme l'espace clippeurs. */
export function videoEmail(input: { first: string; notice: VideoNotice; optOut: string | null }) {
  const { first, notice, optOut } = input;
  const link = `${SPACE_URL}#campagnes`;
  const subject = `Nouvelle vidéo à clipper : ${notice.title}`;
  const text = [
    `Salut ${first},`,
    "",
    `Enrick vient de publier une nouvelle vidéo à découper : « ${notice.title} ».`,
    notice.campaign ? `Campagne : ${notice.campaign}` : null,
    notice.note ? `Consigne : ${notice.note}` : null,
    "",
    `Elle t'attend dans ton espace : ${link}`,
    "",
    "À toi de jouer !",
    "InvestPro Clip",
    "",
    optOut ? `Ne plus recevoir ces e-mails : ${optOut}` : "Tu peux couper ces e-mails dans ton profil.",
  ].filter((line): line is string => line !== null).join("\n");
  const note = notice.note ? escapeHtml(notice.note).replace(/\r?\n/g, "<br>") : "";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Enrick vient de la publier : récupère-la dans ton espace et fais tes clips.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;">
<tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1d1f1a;">
<tr><td style="background:#0b0d0b;padding:18px 24px;">
<span style="display:inline-block;width:26px;height:26px;border:2px solid #F0C575;border-radius:8px;vertical-align:middle;text-align:center;line-height:26px;color:#F0C575;font-size:12px;">&#9654;&#xFE0E;</span>
<span style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:bold;color:#F3EFE6;">InvestPro <span style="color:#F0C575;">Clip</span></span>
</td></tr>
<tr><td style="padding:26px 24px 6px;">
<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#a07a2c;">Nouvelle vidéo à clipper</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111111;">${escapeHtml(notice.title)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Salut ${escapeHtml(first)}, Enrick vient de publier une nouvelle vidéo à découper. Récupère-la, fais tes clips et soumets-les depuis ton espace.</p>
${notice.campaign ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;"><b>Campagne :</b> ${escapeHtml(notice.campaign)}</p>` : ""}
${note ? `<div style="margin:0 0 14px;padding:12px 14px;border-radius:12px;background:#f6f3ec;border-left:3px solid #F0C575;font-size:14px;line-height:1.5;"><b>Consigne :</b> ${note}</div>` : ""}
</td></tr>
<tr><td style="padding:8px 24px 28px;">
<a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#F0C575;color:#0b0d0b;font-size:15px;font-weight:bold;text-decoration:none;">Voir la vidéo dans mon espace</a>
</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a8d84;">Tu reçois cet e-mail parce que tu es clippeur InvestPro Clip. ${optOut ? `<a href="${optOut}" style="color:#8a8d84;text-decoration:underline;">Ne plus recevoir ces e-mails</a>` : "Tu peux couper ces e-mails dans ton profil."}</p>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}

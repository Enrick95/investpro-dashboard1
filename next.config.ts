import type { NextConfig } from "next";
const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"X-Frame-Options",value:"SAMEORIGIN"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"},
];
// InvestPro Clip sur son propre domaine : investproclip.com sert /clip à la racine (l'inscription),
// investproclip.com/login = /clip/login (connexion et espace des clippeurs) ; les anciens chemins /clip/... y sont raccourcis.
const CLIP_HOST=[{type:"host" as const,value:"investproclip.com"}];
// L'ancienne adresse investprotrading.fr/clip renvoie vers investproclip.com (liens déjà partagés compris).
const OLD_CLIP_HOST=[{type:"host" as const,value:"(?:www\\.)?investprotrading\\.fr"}];
const CLIP_REDIRECTS=[
  {source:"/clip",has:CLIP_HOST,destination:"/",permanent:false},
  {source:"/clip/:path*",has:CLIP_HOST,destination:"/:path*",permanent:false},
  {source:"/clip",has:OLD_CLIP_HOST,destination:"https://investproclip.com/login",permanent:false},
  {source:"/clip/:path*",has:OLD_CLIP_HOST,destination:"https://investproclip.com/:path*",permanent:false},
];
// Relances Telegram : investprotrading.fr/whatsapp ouvre le WhatsApp d'Enrick avec un message déjà écrit,
// pour qu'il sache que la personne vient du Telegram InvestPro Support. Pas de parenthèses ni d'astérisque dans le texte.
const WHATSAPP_RELANCE_TEXT="Salut Enrick ! Je viens de ton Telegram InvestPro Support, je voudrais des infos sur le VIP 🙌";
const WHATSAPP_RELANCE="https://wa.me/6285128115218?text="+encodeURIComponent(WHATSAPP_RELANCE_TEXT);
// Posts du canal Telegram : investprotrading.fr/whatsapp-vip, avec un message qui dit que la personne vient du canal.
const WHATSAPP_VIP_TEXT="Salut Enrick ! Je viens de ton canal Telegram, je veux rejoindre le VIP 🙌";
const WHATSAPP_VIP="https://wa.me/6285128115218?text="+encodeURIComponent(WHATSAPP_VIP_TEXT);
const CLIP_REWRITES=[
  {source:"/",has:CLIP_HOST,destination:"/clip"},
  {source:"/:path((?!api/|_next/|clip(?:/|$))[^.]*)",has:CLIP_HOST,destination:"/clip/:path"},
];
const nextConfig: NextConfig={poweredByHeader:false,compress:true,async redirects(){return [...CLIP_REDIRECTS,{source:"/enrick95",destination:"/enrick",statusCode:301},{source:"/whatsapp",destination:WHATSAPP_RELANCE,permanent:false},{source:"/whatsapp-vip",destination:WHATSAPP_VIP,permanent:false},{source:"/vip-test-2",destination:"/vip",permanent:false},{source:"/vip-test-2/rejoindre",destination:"/vip/rejoindre",permanent:false}]},async rewrites(){return {beforeFiles:[...CLIP_REWRITES,{source:"/business",destination:"/business.html"},{source:"/business/acces",destination:"/business-access.html"},{source:"/enrick",destination:"/enrick.html"},{source:"/enrick955",destination:"/enrick-tiktok.html"},{source:"/vip/deja-membre",destination:"/vip-deja-membre-v2.html"},{source:"/vip-test",destination:"/vip-v4.html"},{source:"/vip-test/rejoindre",destination:"/vip-v4-rejoindre.html"},{source:"/enrick/essai-vip",destination:"/enrick-essai-vip.html"},{source:"/vip",destination:"/vip-v5.html",missing:[{type:"query",key:"code"}]},{source:"/vip/rejoindre",destination:"/vip-v5-rejoindre.html",missing:[{type:"query",key:"access"}]}],afterFiles:[],fallback:[]}},async headers(){return [{source:"/:path*",headers:securityHeaders}]}};
export default nextConfig;

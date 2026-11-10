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
const CLIP_REWRITES=[
  {source:"/",has:CLIP_HOST,destination:"/clip"},
  {source:"/:path((?!api/|_next/|clip(?:/|$))[^.]*)",has:CLIP_HOST,destination:"/clip/:path"},
];
const nextConfig: NextConfig={poweredByHeader:false,compress:true,async redirects(){return [...CLIP_REDIRECTS,{source:"/enrick95",destination:"/enrick",statusCode:301},{source:"/vip/rejoindre",destination:"/vip",statusCode:301,missing:[{type:"query",key:"access"}]}]},async rewrites(){return {beforeFiles:[...CLIP_REWRITES,{source:"/enrick",destination:"/enrick.html"},{source:"/enrick955",destination:"/enrick-tiktok.html"},{source:"/vip/deja-membre",destination:"/vip-deja-membre-v2.html"},{source:"/vip-test",destination:"/vip-v2.html"},{source:"/enrick/essai-vip",destination:"/enrick-essai-vip.html"},{source:"/vip",destination:"/vip-v2.html",missing:[{type:"query",key:"code"}]}],afterFiles:[],fallback:[]}},async headers(){return [{source:"/:path*",headers:securityHeaders}]}};
export default nextConfig;

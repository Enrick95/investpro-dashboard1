import type { NextConfig } from "next";
const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"X-Frame-Options",value:"SAMEORIGIN"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"},
];
const nextConfig: NextConfig={poweredByHeader:false,compress:true,async redirects(){return [{source:"/vip/rejoindre",destination:"/vip",statusCode:301,missing:[{type:"query",key:"access"}]}]},async rewrites(){return {beforeFiles:[{source:"/enrick",destination:"/enrick.html"},{source:"/enrick95",destination:"/enrick-tiktok.html"},{source:"/vip-test",destination:"/vip-v2.html"},{source:"/enrick/essai-vip",destination:"/enrick-essai-vip.html"},{source:"/vip",destination:"/vip-v2.html",missing:[{type:"query",key:"code"}]}],afterFiles:[],fallback:[]}},async headers(){return [{source:"/:path*",headers:securityHeaders}]}};
export default nextConfig;

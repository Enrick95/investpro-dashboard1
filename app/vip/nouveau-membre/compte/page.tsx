import VipMemberClaimClient from "./VipMemberClaimClient";

export const metadata={title:"Finaliser mon accès VIP | InvestPro",robots:{index:false,follow:false}};

export default async function VipMemberClaimPage({searchParams}:{searchParams:Promise<{application?:string}>}) {
  const params=await searchParams;
  return <VipMemberClaimClient applicationId={params.application||""}/>;
}

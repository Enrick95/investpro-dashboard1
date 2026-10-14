import {notFound} from "next/navigation";
import InstallCheck from "./InstallCheck";

export default function InstallCheckPage() {
  if(process.env.VERCEL_ENV!=="preview")notFound();
  return <InstallCheck />;
}

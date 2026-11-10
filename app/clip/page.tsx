import JoinClippers from "./rejoindre/JoinClippers";
import { joinMetadata } from "./rejoindre/joinMetadata";

/** investproclip.com : on arrive directement sur l'inscription ; les clippeurs se connectent sur /login. */
export const metadata = joinMetadata;

export default function ClipHomePage() {
  return <JoinClippers />;
}

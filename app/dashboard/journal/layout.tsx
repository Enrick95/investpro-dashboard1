import type { ReactNode } from "react";
import JournalV2Shell from "@/components/journal/JournalV2Shell";

export default function JournalLayout({ children }: { children: ReactNode }) {
  return <JournalV2Shell>{children}</JournalV2Shell>;
}

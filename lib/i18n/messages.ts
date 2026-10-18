import { authVipMessages } from "./auth-vip";
import { publicMessages } from "./public";
import { coreMessages } from "./core";
import { tradingCoreMessages } from "./trading-core";
import { reportsMessages } from "./reports";
import { connectionsMarketMessages } from "./connections-market";
import { sharedMessages } from "./shared";
import { accountMessages } from "./account";
import { adminMessages } from "./admin";
import { connectionsMarketExtraMessages } from "./connections-market-extra";
import { vipEditorMessages } from "./vip-editor";
import { vipRailMessages } from "./vip-rail";
import { vipInlineMessages } from "./vip-inline";
import { journalOutcomeMessages } from "./journal-outcomes";

/** Static application copy only. Member posts, names and trading data are never sent for translation. */
export const messages: Readonly<Record<string, string>> = {
  ...coreMessages,
  ...publicMessages,
  ...authVipMessages,
  ...tradingCoreMessages,
  ...reportsMessages,
  ...connectionsMarketMessages,
  ...sharedMessages,
  ...accountMessages,
  ...adminMessages,
  ...connectionsMarketExtraMessages,
  ...vipEditorMessages,
  ...vipRailMessages,
  ...vipInlineMessages,
  ...journalOutcomeMessages,
};

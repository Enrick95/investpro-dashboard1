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
};

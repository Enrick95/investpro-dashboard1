import type { VipAffiliationBroker } from "./identity";

export type VipPostCategory = "signal" | "analysis" | "performance" | "followup" | "partnership";
export type VipReaction = "like" | "fire" | "heart";
export type VipPostReactions = {
  counts: Record<VipReaction, number>;
  mine: VipReaction | null;
};
export type VipPost = {
  id: string;
  category: VipPostCategory;
  title: string;
  body: string;
  symbol: string | null;
  direction: "buy" | "sell" | null;
  levels: { entry?: number; stopLoss?: number; takeProfit?: number; takeProfit2?: number };
  /** Legacy HTTPS or a temporary signed URL for a private uploaded image. */
  image_url: string | null;
  /** Returned to administrators for preserving/replacing an attachment while editing. */
  image_path?: string | null;
  created_at: string;
  updated_at?: string;
  reactions?: VipPostReactions;
};
export type VipMediaUpload = { imagePath: string; imageUrl: string; mimeType: string; sizeBytes: number };

export type VipMembershipType = "affiliation" | "abonnement";
export type VipMembershipStatus = "active" | "suspended";

export type VipMembership = {
  user_id: string;
  email: string;
  type: VipMembershipType;
  first_name: string | null;
  last_name: string | null;
  affiliation_broker: VipAffiliationBroker | null;
  started_at: string;
  expires_at: string | null;
  status: VipMembershipStatus;
  renewal_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VipInvitation = {
  id: string;
  email: string;
  type: VipMembershipType;
  first_name: string | null;
  last_name: string | null;
  affiliation_broker: VipAffiliationBroker | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  revoked_at: string | null;
};

export type VipAccessResponse = {
  user: { id: string; email: string | null };
  membership: VipMembership | null;
  active: boolean;
  telegramUrl: string | null;
  admin: boolean;
};

export type VipMemberState = "none" | "active" | "suspended" | "expired" | "upcoming";

export type VipAccessRequest = {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  telegram_username: string | null;
  type: VipMembershipType;
  affiliation_broker: VipAffiliationBroker | null;
  paid_on: string | null;
  status: "pending" | "approved" | "denied";
  created_at: string;
  reviewed_at: string | null;
  verified_type: VipMembershipType | null;
  verified_affiliation_broker: VipAffiliationBroker | null;
  verified_paid_on: string | null;
  verified_expires_at: string | null;
};

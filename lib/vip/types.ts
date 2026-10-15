import type { VipAffiliationBroker } from "./identity";

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
  status: "pending" | "approved" | "denied";
  created_at: string;
  reviewed_at: string | null;
  verified_type: VipMembershipType | null;
  verified_affiliation_broker: VipAffiliationBroker | null;
  verified_expires_at: string | null;
};

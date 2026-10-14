export type VipMembershipType = "affiliation" | "abonnement";
export type VipMembershipStatus = "active" | "suspended";

export type VipMembership = {
  user_id: string;
  email: string;
  type: VipMembershipType;
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

/**
 * The hosting PC reads its MT5 accounts in turn, a few at a time: an account in sync can go several minutes without
 * news (about five minutes for twenty accounts on 13 November 2026, more as accounts are added). A hosted connection
 * therefore counts as interrupted only after 15 minutes without a reading; a three-minute limit flagged healthy
 * accounts as « Synchronisation interrompue » and asked their members to reconnect.
 */
export const HOSTED_SYNC_STALE_MS = 15 * 60 * 1000;

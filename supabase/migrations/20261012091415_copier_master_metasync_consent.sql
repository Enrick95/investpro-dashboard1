-- Store only the explicit MetaSync opt-in and account metadata on a Master
-- request. Credentials remain in the existing encrypted password_cipher field.
ALTER TABLE public.copier_account_requests
  ADD COLUMN IF NOT EXISTS metasync_sync_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metasync_currency text,
  ADD COLUMN IF NOT EXISTS metasync_account_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'copier_account_requests_metasync_currency_format'
      AND conrelid = 'public.copier_account_requests'::regclass
  ) THEN
    ALTER TABLE public.copier_account_requests
      ADD CONSTRAINT copier_account_requests_metasync_currency_format
      CHECK (metasync_currency IS NULL OR metasync_currency ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'copier_account_requests_metasync_type_valid'
      AND conrelid = 'public.copier_account_requests'::regclass
  ) THEN
    ALTER TABLE public.copier_account_requests
      ADD CONSTRAINT copier_account_requests_metasync_type_valid
      CHECK (metasync_account_type IS NULL OR metasync_account_type IN ('real', 'demo', 'prop'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'copier_account_requests_metasync_optin_complete'
      AND conrelid = 'public.copier_account_requests'::regclass
  ) THEN
    ALTER TABLE public.copier_account_requests
      ADD CONSTRAINT copier_account_requests_metasync_optin_complete
      CHECK (
        NOT metasync_sync_consent
        OR (metasync_currency IS NOT NULL AND metasync_account_type IS NOT NULL)
      );
  END IF;
END $$;

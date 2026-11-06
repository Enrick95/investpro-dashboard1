alter table public.essai_vip_leads add column if not exists demo_password_encrypted text;
comment on column public.essai_vip_leads.demo_password_encrypted is 'Mot de passe du compte DEMO, chiffré AES-256-GCM côté serveur. Déchiffré uniquement à la demande du propriétaire dans l''admin.';

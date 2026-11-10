-- Les clippeurs peuvent publier partout : Facebook, Snapchat et X en plus de TikTok, Instagram et YouTube.
alter table public.clip_accounts drop constraint if exists clip_accounts_platform_check;
alter table public.clip_accounts add constraint clip_accounts_platform_check
  check (platform in ('tiktok','instagram','youtube','facebook','snapchat','x'));
alter table public.clip_clips drop constraint if exists clip_clips_platform_check;
alter table public.clip_clips add constraint clip_clips_platform_check
  check (platform in ('tiktok','instagram','youtube','facebook','snapchat','x'));
alter table public.clip_campaigns alter column platforms set default 'TikTok · Instagram · YouTube Shorts · Facebook';

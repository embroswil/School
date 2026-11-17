-- Documents reserves a l'etablissement (jamais affiches dans le fil des familles)
-- Deja appliquee sur Supabase le 17 novembre 2026.
alter table public.publications drop constraint if exists publications_audience_check;
alter table public.publications add constraint publications_audience_check
  check (audience in ('tous', 'parents', 'eleves', 'enseignants', 'interne'));

-- Stockage des fichiers : Word, Excel, PowerPoint, CSV et texte acceptes en plus des PDF, photos et videos
update storage.buckets set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain'
] where id = 'medias';

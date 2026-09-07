-- 0007 — Fora a aprovação do pastor no PDF pós-culto (28/08/2026)
-- Decisão do Johnny: "aprovar é mais uma coisa para ele se preocupar". O sermão vai
-- direto para o ouvinte que pediu, com cópia para os e-mails da igreja.
alter table public.churches drop column if exists review_before_send;

alter table public.sermons drop constraint if exists sermons_status_check;
alter table public.sermons add constraint sermons_status_check
  check (status in ('processing', 'ready', 'sent', 'failed'));
alter table public.sermons drop column if exists approved_at;

comment on column public.churches.sermon_recipients is
  'Cópia do sermão em PDF vai para estes e-mails (pastor/equipe), além dos ouvintes que pediram.';

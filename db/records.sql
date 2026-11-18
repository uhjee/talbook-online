-- 탈북 온라인 랭킹의 DB 구조. Supabase 프로젝트에 create_records_ranking 마이그레이션으로 적용한 내용의 사본이다.
-- 구조를 바꿀 때는 Supabase에 새 마이그레이션으로 적용하고 이 파일도 함께 고친다.

-- 탈북 온라인 완주 기록. 로그인 없이 누구나 기록을 올리고 순위를 볼 수 있다. 기기 정보는 저장하지 않는다.
create table public.records (
  id bigint generated always as identity primary key,
  nick text not null check (char_length(nick) between 2 and 8),
  -- 도착 소요 시간(ms). 코스 길이로 볼 때 1분보다 빠르거나 1시간보다 느린 기록은 받지 않는다.
  time_ms integer not null check (time_ms between 60000 and 3600000),
  falls smallint not null default 0 check (falls between 0 and 9999),
  detections smallint not null default 0 check (detections between 0 and 9999),
  title text not null default '' check (char_length(title) <= 20),
  created_at timestamptz not null default now()
);

comment on table public.records is '탈북 온라인 완주 기록(랭킹)';

-- 순위는 빠른 순, 같은 시간이면 먼저 올린 순이다.
create index records_time_idx on public.records (time_ms, created_at);
-- 오늘 순위를 뽑을 때 쓴다.
create index records_created_idx on public.records (created_at);

alter table public.records enable row level security;

-- 브라우저에서 쓰는 역할에는 필요한 권한만 준다. 올린 시각과 번호는 서버가 정하도록 넣을 수 있는 열을 제한하고, 고치거나 지우는 권한은 주지 않는다.
revoke all on table public.records from anon, authenticated;
grant select on table public.records to anon, authenticated;
grant insert (nick, time_ms, falls, detections, title) on table public.records to anon, authenticated;

create policy "records_select_all" on public.records
  for select to anon, authenticated
  using (true);

create policy "records_insert_valid" on public.records
  for insert to anon, authenticated
  with check (char_length(nick) between 2 and 8 and time_ms between 60000 and 3600000);

-- 기록을 올리고 그 기록의 순위와 전체 기록 수를 한 번에 돌려준다. 호출한 사람의 권한으로 실행되므로 위의 접근 규칙을 그대로 따른다.
create function public.submit_record(p_nick text, p_time_ms integer, p_falls integer, p_detections integer, p_title text)
returns table (rank bigint, total bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  insert into public.records (nick, time_ms, falls, detections, title)
  values (btrim(p_nick), p_time_ms, p_falls, p_detections, coalesce(p_title, ''))
  returning created_at into v_at;
  return query
    select
      (select count(*) from public.records r
        where r.time_ms < p_time_ms or (r.time_ms = p_time_ms and r.created_at < v_at)) + 1,
      (select count(*) from public.records);
end;
$$;

revoke all on function public.submit_record(text, integer, integer, integer, text) from public;
grant execute on function public.submit_record(text, integer, integer, integer, text) to anon, authenticated;

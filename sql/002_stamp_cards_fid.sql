-- Lof Espresso — stamp cards (FID / Canela-style UX), keep project lof-espresso
-- Applied via Management API with service/lokio token. Idempotent-ish.

-- 1) members.email
alter table public.members
  add column if not exists email text;

-- 2) club settings in app_settings
insert into public.app_settings(key, value)
values
  ('club_meta', '8'),
  ('club_premio', '1 café de especialidad'),
  ('club_correo', '')
on conflict (key) do nothing;

-- Sync single active coupon from settings (UI no longer CRUD cupones)
update public.coupon_cards c
set stamps_required = greatest(3, least(20, coalesce((select value::int from app_settings where key='club_meta'), 8))),
    reward = coalesce((select value from app_settings where key='club_premio'), reward),
    title = coalesce(nullif(title,''), 'Club Lof'),
    active = true
where c.id = (
  select id from coupon_cards order by active desc, created_at asc limit 1
);

-- Ensure at least one active coupon card
insert into public.coupon_cards(title, description, stamps_required, reward, active)
select 'Club Lof', 'Junta sellos y canjea un café', 8, '1 café de especialidad', true
where not exists (select 1 from coupon_cards where active);

create or replace function public.club_settings()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'meta', greatest(3, least(20, coalesce(
      (select nullif(value,'')::int from app_settings where key='club_meta'),
      (select stamps_required from coupon_cards where active order by created_at limit 1),
      8
    ))),
    'premio', coalesce(
      nullif((select value from app_settings where key='club_premio'), ''),
      (select reward from coupon_cards where active order by created_at limit 1),
      '1 café de especialidad'
    ),
    'correo', coalesce((select value from app_settings where key='club_correo'), '')
  );
$$;

create or replace function public._active_coupon()
returns coupon_cards
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare cc coupon_cards%rowtype;
begin
  select * into cc from coupon_cards where active order by created_at asc limit 1;
  if not found then
    insert into coupon_cards(title, description, stamps_required, reward, active)
    values ('Club Lof', 'Junta sellos y canjea', 8, '1 café de especialidad', true)
    returning * into cc;
  end if;
  return cc;
end;
$$;

-- club_register (+ optional email)
create or replace function public.club_register(
  p_name text,
  p_rut text,
  p_phone text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; rnum int; m members%rowtype; cards jsonb; cc coupon_cards%rowtype;
  settings jsonb; mc member_cards%rowtype;
begin
  nr := public.normalize_rut(p_rut);
  if nr is null then
    return jsonb_build_object('ok', false, 'error', 'rut_invalid');
  end if;
  rnum := nullif(regexp_replace(split_part(nr,'-',1), '[^0-9]', '', 'g'),'')::int;
  if rnum is null then
    return jsonb_build_object('ok', false, 'error', 'rut_invalid');
  end if;

  select * into m from members where rut_num = rnum;
  if found then
    update members
      set name = coalesce(nullif(trim(p_name),''), name),
          phone = coalesce(nullif(trim(p_phone),''), phone),
          email = coalesce(nullif(trim(p_email),''), email)
    where id = m.id
    returning * into m;
  else
    insert into members(rut, rut_num, name, phone, email)
    values (nr, rnum, trim(p_name), nullif(trim(p_phone),''), nullif(lower(trim(p_email)),''))
    returning * into m;
  end if;

  cards := public.ensure_member_cards(m.id);
  settings := public.club_settings();
  cc := public._active_coupon();
  select * into mc from member_cards where member_id = m.id and coupon_card_id = cc.id;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'phone', m.phone, 'email', m.email,
      'stickers', coalesce(mc.stamps, 0)
    ),
    'meta', settings->'meta',
    'premio', settings->'premio',
    'cards', cards
  );
end;
$$;

create or replace function public.club_get_by_rut(p_rut text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; m members%rowtype; cards jsonb; rnum int;
  settings jsonb; cc coupon_cards%rowtype; mc member_cards%rowtype;
begin
  nr := public.normalize_rut(p_rut);
  rnum := nullif(regexp_replace(split_part(coalesce(nr,''),'-',1), '[^0-9]', '', 'g'),'')::int;
  select * into m from members where rut_num = rnum limit 1;
  if not found then
    return jsonb_build_object('found', false, 'rut', nr);
  end if;
  perform public.ensure_member_cards(m.id);
  settings := public.club_settings();
  cc := public._active_coupon();
  select * into mc from member_cards where member_id = m.id and coupon_card_id = cc.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'member_card_id', mc2.id, 'coupon_card_id', cc2.id, 'title', cc2.title,
    'description', cc2.description, 'stamps', mc2.stamps,
    'stamps_required', (settings->>'meta')::int,
    'reward', settings->>'premio',
    'redeemed_count', mc2.redeemed_count
  ) order by cc2.created_at), '[]'::jsonb) into cards
  from member_cards mc2
  join coupon_cards cc2 on cc2.id = mc2.coupon_card_id
  where mc2.member_id = m.id and cc2.active = true;

  return jsonb_build_object(
    'found', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'phone', m.phone, 'email', m.email,
      'stickers', coalesce(mc.stamps, 0)
    ),
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio',
    'cards', cards
  );
end;
$$;

-- Sumar sello con anti-abuso: 1 sello / RUT / 45 min
create or replace function public.admin_add_stamp(
  p_pass text,
  p_rut text,
  p_coupon_card_id uuid default null,
  p_delta integer default 1,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; m members%rowtype; cc coupon_cards%rowtype; mc member_cards%rowtype;
  new_stamps int; rnum int; settings jsonb; last_at timestamptz;
  window_mins int := 45;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'delta_invalid';
  end if;

  nr := public.normalize_rut(p_rut);
  rnum := nullif(regexp_replace(split_part(coalesce(nr,''),'-',1), '[^0-9]', '', 'g'),'')::int;
  select * into m from members where rut_num = rnum limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'member_not_found', 'rut', nr);
  end if;

  if p_coupon_card_id is null then
    cc := public._active_coupon();
  else
    select * into cc from coupon_cards where id = p_coupon_card_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'coupon_not_found');
    end if;
  end if;

  select * into mc from member_cards where member_id = m.id and coupon_card_id = cc.id;
  if not found then
    insert into member_cards(member_id, coupon_card_id, stamps)
    values (m.id, cc.id, 0) returning * into mc;
  end if;

  settings := public.club_settings();

  if p_delta > 0 and mc.stamps >= (settings->>'meta')::int then
    return jsonb_build_object(
      'ok', false, 'error', 'already_full',
      'member', jsonb_build_object('id', m.id, 'rut', m.rut, 'name', m.name, 'email', m.email, 'stickers', mc.stamps),
      'meta', (settings->>'meta')::int, 'premio', settings->>'premio'
    );
  end if;

  if p_delta > 0 then
    select max(se.created_at) into last_at
    from stamp_events se
    where se.member_card_id = mc.id and se.delta > 0;
    if last_at is not null and last_at > now() - (window_mins || ' minutes')::interval then
      return jsonb_build_object(
        'ok', false, 'error', 'too_soon',
        'retry_after_minutes', greatest(1, ceil(extract(epoch from (last_at + (window_mins || ' minutes')::interval - now()))/60.0)::int),
        'member', jsonb_build_object('id', m.id, 'rut', m.rut, 'name', m.name, 'stickers', mc.stamps),
        'meta', (settings->>'meta')::int
      );
    end if;
  end if;

  new_stamps := greatest(0, least((settings->>'meta')::int, mc.stamps + p_delta));
  update member_cards set stamps = new_stamps, updated_at = now() where id = mc.id;
  insert into stamp_events(member_card_id, delta, note)
  values (mc.id, p_delta, coalesce(nullif(p_note,''), 'sello admin'));

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'phone', m.phone, 'email', m.email,
      'stickers', new_stamps
    ),
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio',
    'card', jsonb_build_object(
      'member_card_id', mc.id, 'coupon_card_id', cc.id, 'title', cc.title,
      'stamps', new_stamps, 'stamps_required', (settings->>'meta')::int,
      'reward', settings->>'premio', 'redeemed_count', mc.redeemed_count
    )
  );
end;
$$;

-- Entregar premio: reset stickers a 0 (FID)
create or replace function public.admin_entregar_premio(p_pass text, p_rut text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; m members%rowtype; cc coupon_cards%rowtype; mc member_cards%rowtype;
  settings jsonb; rnum int;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  nr := public.normalize_rut(p_rut);
  rnum := nullif(regexp_replace(split_part(coalesce(nr,''),'-',1), '[^0-9]', '', 'g'),'')::int;
  select * into m from members where rut_num = rnum limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  settings := public.club_settings();
  cc := public._active_coupon();
  select * into mc from member_cards where member_id = m.id and coupon_card_id = cc.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;
  if mc.stamps < (settings->>'meta')::int then
    return jsonb_build_object(
      'ok', false, 'error', 'not_enough_stamps',
      'stickers', mc.stamps, 'meta', (settings->>'meta')::int
    );
  end if;
  update member_cards
    set stamps = 0, redeemed_count = redeemed_count + 1, updated_at = now()
  where id = mc.id
  returning * into mc;
  insert into stamp_events(member_card_id, delta, note)
  values (mc.id, -((settings->>'meta')::int), 'premio entregado: ' || (settings->>'premio'));
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'email', m.email, 'stickers', 0
    ),
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio',
    'redeemed_count', mc.redeemed_count
  );
end;
$$;

-- Keep admin_redeem: if called with member_card_id, reset to 0 (FID)
create or replace function public.admin_redeem(p_pass text, p_member_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  mc member_cards%rowtype; cc coupon_cards%rowtype; m members%rowtype; settings jsonb;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into mc from member_cards where id = p_member_card_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;
  select * into m from members where id = mc.member_id;
  settings := public.club_settings();
  if mc.stamps < (settings->>'meta')::int then
    return jsonb_build_object('ok', false, 'error', 'not_enough_stamps',
      'stamps', mc.stamps, 'required', (settings->>'meta')::int);
  end if;
  update member_cards
    set stamps = 0, redeemed_count = redeemed_count + 1, updated_at = now()
  where id = mc.id
  returning * into mc;
  insert into stamp_events(member_card_id, delta, note)
  values (mc.id, -((settings->>'meta')::int), 'canje: ' || (settings->>'premio'));
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object('id', m.id, 'rut', m.rut, 'name', m.name, 'stickers', 0),
    'card', jsonb_build_object(
      'member_card_id', mc.id, 'stamps', 0,
      'stamps_required', (settings->>'meta')::int,
      'reward', settings->>'premio', 'redeemed_count', mc.redeemed_count
    )
  );
end;
$$;

create or replace function public.admin_lookup_member(p_pass text, p_rut text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; m members%rowtype; cards jsonb; rnum int; settings jsonb; cc coupon_cards%rowtype; mc member_cards%rowtype;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  nr := public.normalize_rut(p_rut);
  rnum := nullif(regexp_replace(split_part(coalesce(nr,''),'-',1), '[^0-9]', '', 'g'),'')::int;
  select * into m from members where rut_num = rnum limit 1;
  if not found then
    return jsonb_build_object('found', false, 'rut', nr);
  end if;
  perform public.ensure_member_cards(m.id);
  settings := public.club_settings();
  cc := public._active_coupon();
  select * into mc from member_cards where member_id = m.id and coupon_card_id = cc.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'member_card_id', mc2.id, 'coupon_card_id', cc2.id, 'title', cc2.title,
    'stamps', mc2.stamps, 'stamps_required', (settings->>'meta')::int,
    'reward', settings->>'premio', 'redeemed_count', mc2.redeemed_count, 'active', cc2.active
  ) order by cc2.created_at), '[]'::jsonb) into cards
  from member_cards mc2
  join coupon_cards cc2 on cc2.id = mc2.coupon_card_id
  where mc2.member_id = m.id;

  return jsonb_build_object(
    'found', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'phone', m.phone, 'email', m.email,
      'stickers', coalesce(mc.stamps, 0), 'created_at', m.created_at
    ),
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio',
    'cards', cards
  );
end;
$$;

create or replace function public.admin_list_clientes(
  p_pass text,
  p_q text default '',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  settings jsonb; q text; lim int;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  settings := public.club_settings();
  q := lower(trim(coalesce(p_q, '')));
  lim := greatest(1, least(coalesce(p_limit, 100), 200));
  return jsonb_build_object(
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio',
    'clientes', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.stickers desc, x.name)
      from (
        select m.id, m.rut, m.name, m.phone, m.email,
               coalesce(mc.stamps, 0) as stickers,
               coalesce(mc.redeemed_count, 0) as redeemed_count,
               m.created_at
        from members m
        left join lateral (
          select mc2.stamps, mc2.redeemed_count
          from member_cards mc2
          join coupon_cards cc on cc.id = mc2.coupon_card_id and cc.active
          where mc2.member_id = m.id
          order by cc.created_at
          limit 1
        ) mc on true
        where q = ''
           or lower(m.name) like '%' || q || '%'
           or replace(m.rut, '-', '') like '%' || replace(q, '-', '') || '%'
           or coalesce(lower(m.email),'') like '%' || q || '%'
        order by coalesce(mc.stamps,0) desc, m.name
        limit lim
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_create_member(
  p_pass text,
  p_name text,
  p_rut text,
  p_email text default null,
  p_phone text default null,
  p_first_stamp boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nr text; rnum int; m members%rowtype; settings jsonb; res jsonb;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  nr := public.normalize_rut(p_rut);
  if nr is null then
    return jsonb_build_object('ok', false, 'error', 'rut_invalid');
  end if;
  rnum := nullif(regexp_replace(split_part(nr,'-',1), '[^0-9]', '', 'g'),'')::int;
  if exists (select 1 from members where rut_num = rnum) then
    return jsonb_build_object('ok', false, 'error', 'already_registered', 'rut', nr);
  end if;
  insert into members(rut, rut_num, name, phone, email)
  values (nr, rnum, trim(p_name), nullif(trim(p_phone),''), nullif(lower(trim(p_email)),''))
  returning * into m;
  perform public.ensure_member_cards(m.id);
  settings := public.club_settings();
  if coalesce(p_first_stamp, true) then
    res := public.admin_add_stamp(p_pass, nr, null, 1, 'alta + primer sello');
    return jsonb_build_object(
      'ok', true,
      'member', res->'member',
      'meta', settings->'meta',
      'premio', settings->'premio',
      'stamp', res
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', m.id, 'rut', m.rut, 'name', m.name, 'phone', m.phone, 'email', m.email, 'stickers', 0
    ),
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio'
  );
end;
$$;

create or replace function public.admin_get_settings(p_pass text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return public.club_settings() || jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_settings(
  p_pass text,
  p_meta integer default null,
  p_premio text default null,
  p_correo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  meta int; premio text; correo text; cc coupon_cards%rowtype;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  meta := greatest(3, least(20, coalesce(p_meta, (select value::int from app_settings where key='club_meta'), 8)));
  premio := coalesce(nullif(trim(p_premio),''), (select value from app_settings where key='club_premio'), '1 café de especialidad');
  correo := coalesce(trim(p_correo), (select value from app_settings where key='club_correo'), '');
  if correo <> '' and correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'correo_invalid');
  end if;

  insert into app_settings(key, value) values ('club_meta', meta::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_settings(key, value) values ('club_premio', premio)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into app_settings(key, value) values ('club_correo', correo)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  cc := public._active_coupon();
  update coupon_cards
    set stamps_required = meta, reward = premio, active = true, title = coalesce(nullif(title,''), 'Club Lof')
  where id = cc.id;

  -- Cap stickers that exceed new meta
  update member_cards mc
    set stamps = least(stamps, meta)
  where mc.coupon_card_id = cc.id and mc.stamps > meta;

  return jsonb_build_object('ok', true, 'meta', meta, 'premio', premio, 'correo', correo);
end;
$$;

create or replace function public.admin_stats(p_pass text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare settings jsonb; n int; ready int;
begin
  if not public._admin_ok(p_pass) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  settings := public.club_settings();
  select count(*) into n from members;
  select count(*) into ready
  from member_cards mc
  join coupon_cards cc on cc.id = mc.coupon_card_id and cc.active
  where mc.stamps >= (settings->>'meta')::int;
  return jsonb_build_object(
    'ok', true,
    'clientes', n,
    'premio_listo', ready,
    'meta', (settings->>'meta')::int,
    'premio', settings->>'premio'
  );
end;
$$;

-- Grant execute to anon/authenticated (same as other club RPCs)
grant execute on function public.club_settings() to anon, authenticated, service_role;
grant execute on function public.club_register(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.club_get_by_rut(text) to anon, authenticated, service_role;
grant execute on function public.admin_add_stamp(text, text, uuid, integer, text) to anon, authenticated, service_role;
grant execute on function public.admin_entregar_premio(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_redeem(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_lookup_member(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_list_clientes(text, text, integer) to anon, authenticated, service_role;
grant execute on function public.admin_create_member(text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_get_settings(text) to anon, authenticated, service_role;
grant execute on function public.admin_save_settings(text, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_stats(text) to anon, authenticated, service_role;

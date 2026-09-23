-- Ensure profile exists for muhammadmatawalle599@gmail.com (handle case where trigger missed)
insert into public.profiles (user_id, full_name, is_active)
select id, coalesce(raw_user_meta_data->>'full_name', 'Muhammad Matawalle'), true
from auth.users
where email = 'muhammadmatawalle599@gmail.com'
and not exists (select 1 from public.profiles where user_id = auth.users.id);

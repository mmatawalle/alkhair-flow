-- Grant super_admin to muhammadmatawalle599@gmail.com
-- Idempotent: safe to re-run. Requires the auth user to already exist (created via sign-up or auth.admin.createUser).
-- After applying, the user must log out and log back in to refresh isSuperAdmin in AuthContext.

insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where email = 'muhammadmatawalle599@gmail.com'
on conflict (user_id, role) do nothing;

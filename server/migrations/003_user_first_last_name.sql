-- Separate first / last name. users.name stays as the display name ("first last") used everywhere else.
alter table users add column if not exists first_name text not null default '';
alter table users add column if not exists last_name text not null default '';
update users set first_name = split_part(name, ' ', 1), last_name = btrim(substr(name, length(split_part(name, ' ', 1)) + 1)) where first_name = '';

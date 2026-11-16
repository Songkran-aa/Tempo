-- Brand accent is now indigo (#4F46E5). 'violet' was only ever the untouched default.
alter table users alter column accent set default 'indigo';
update users set accent = 'indigo' where accent = 'violet';

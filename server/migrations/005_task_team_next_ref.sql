-- Product-tracker style task fields: coordinating team, next step, reference link (in addition to the file link).
alter table tasks add column if not exists team text;
alter table tasks add column if not exists next_step text;
alter table tasks add column if not exists ref_link text;

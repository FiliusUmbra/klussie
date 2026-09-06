-- TEMPORARY, for live verification only — reschedules maintenance-schedule-generation
-- to run every minute so this session can observe a real pg_cron-triggered run within
-- the session, rather than waiting a full day for 03:00 UTC. Reverted by
-- 0207_restore_maintenance_generation_cadence.sql immediately after verification.
-- cron.schedule() upserts by job name — this changes the existing job's cadence, not a
-- second job.
select cron.schedule(
  'maintenance-schedule-generation',
  '* * * * *',
  $job$set role klussie_scheduler_maintenance; select work.run_maintenance_schedule_generation(); reset role;$job$
);

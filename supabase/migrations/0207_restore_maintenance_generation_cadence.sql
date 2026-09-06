-- Restores maintenance-schedule-generation to its real daily cadence after live
-- verification (0206_temp_verify_cron_frequency.sql's own purpose) confirmed the job
-- genuinely fires under pg_cron on this hosting platform, correctly generates exactly
-- one obligation per due schedule per tick, and correctly stops once a schedule has
-- caught all the way up — observed directly across several real, repeated ticks
-- (idempotency held: no duplicate due_on ever appeared for the same schedule).
--
-- cron.schedule() upserts by job name — this changes the existing job's cadence back,
-- not a second job. 03:00 UTC: see 0205's own header for why this exact hour needs no
-- per-user timezone concept on this Belgium-only product.
select cron.schedule(
  'maintenance-schedule-generation',
  '0 3 * * *',
  $job$set role klussie_scheduler_maintenance; select work.run_maintenance_schedule_generation(); reset role;$job$
);

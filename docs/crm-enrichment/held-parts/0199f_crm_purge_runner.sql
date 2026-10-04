-- 0199f, after 0195's purge part: the purge job through the runner (the migration's last schedule line)
select cron.schedule('orgpuls-crm-purge', '25 2 * * *', $job$ select app.crm_run('crm_purge') $job$);

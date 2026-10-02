-- 0186 — The data processing agreement says what Slack delivery stores (D-205).
--
-- With Slack as a channel (0185) Orgpuls keeps, for an organisation that connects its workspace,
-- each matched employee's Slack member id and the workspace's bot access. Vedlegg 1 now lists both,
-- as it lists the Teams conversation (0177). Slack is the organisation's own tool, not an Orgpuls
-- sub-processor, so vedlegg 3 is unchanged. A changed text is a new version (0047, lib/legal/dpa.ts):
-- 2026-10-02.4 with this addition is 2026-10-02.5.

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02.5', '45e91dac28116bac62a3ac42fd1ba95d93bb0176daa5f6a8102609c0ebf3a702', date '2026-10-02');

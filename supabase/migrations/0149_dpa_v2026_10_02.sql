-- 0149 — The data processing agreement names the processor as «Orgpuls», not «Orgpuls AS» (D-196).
--
-- There is no company registered as Orgpuls AS; Pundit Invest AS is behind the product, with the
-- company details to follow. The agreement's Norwegian text therefore changes in two places (the
-- lead and section 1), and a changed text is a new version: lib/legal/dpa.ts pins version and hash,
-- and this row lets a signature to it be recorded (0047). No organisation had signed 2026-09-25 on
-- hosted when this was published, so no one is asked to sign again.

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-02', '1ebeb268e4dce2b3a7df88393da508246395c3b0987dcdd89061a6c4e41469d6', date '2026-10-02');

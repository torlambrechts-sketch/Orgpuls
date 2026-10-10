-- 0225_module_hse_market.sql — HSE's Management Standards Indicator Tool is the United Kingdom's module (UK-D4, X-111, X-112, D-268).
--
-- modules/hse-indicator-tool/v1.json carries HSE's Indicator Tool as HSE publishes it (0224): its 35
-- statements, its two answer scales, its instruction and its order, its reversed statements scored
-- reversed and its own bands (0223). It is written for employers under HSWA 1974 and MHSWR 1999. A key
-- with no row in app.module_markets is offered in Norway (0220), so this row comes before the module
-- is synced and published anywhere: from the moment it exists it is offered to organisations in the
-- United Kingdom and to no one else.

insert into app.module_markets (module_key, market) values ('hse-indicator-tool', 'gb')
on conflict (module_key, market) do nothing;

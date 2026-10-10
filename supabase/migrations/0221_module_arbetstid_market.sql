-- 0221_module_arbetstid_market.sql — «Arbetstid och återhämtning» is Sweden's module (SE-D, D-263).
--
-- modules/arbetstid-och-aterhamtning/v1.json is the first module written for a market other than
-- Norway: working time and recovery under AFS 2023:2 2 kap. 9 §, the Swedish rule the 11 factors do not
-- cover (docs/markets/se-legal.md). A key with no row in app.module_markets is offered in Norway
-- (0220), so this row comes before the module is synced and published anywhere: from the moment the
-- module exists it is offered to organisations in Sweden and to no one else.

insert into app.module_markets (module_key, market) values ('arbetstid-och-aterhamtning', 'se')
on conflict (module_key, market) do nothing;

# The Lord of the Rings: Tales of Middle-earth (LTR) draft trophy decks

Source: [untapped.gg LTR trophy decks](https://mtga.untapped.gg/limited/draft/the-lord-of-the-rings-tales-of-middle-earth/trophy-decks), through the analytics endpoint the page uses (`api.mtga.untapped.gg/api/v1/analytics/limited/query/trophy_decks_by_event_v2/free` with `CardSetFilter=LTR`, `TimeIntervalFilter=LAST_90_DAYS`, `EventTypeFilter=PREMIER_DRAFT` or `QUICK_DRAFT`): 668 Premier Draft and 883 Quick Draft decks (7–0 to 7–2), read on 2026-10-11. Note the path: `/analytics/limited/query/...` (without `limited/` it answers 204 for every set).

Lists are decoded from each deck's `ds` string as for The Hobbit (`hob-trophy-decks.md`): base64url varints; a 3-number header; then per zone (1 main deck, 2 sideboard) a marker and sections for 1, 2, 3 and 4 copies (a count, then delta-coded Arena title ids) and n copies (a count, then (copies, delta id) pairs); a 0 ends the zones. Title ids resolve to names with mtgajson.untapped.gg `v1/latest/loc_en.json`. Every main deck name resolves against our card pool. Basic lands are included.

Selection per colour pair, as The Hobbit: best record (7–0 first), Premier before Quick, then most recent; two-colour decks only (Untapped's colour mask `dc`: W 1, U 2, B 4, R 8, G 16).

## Summary

All ten two-colour pairs have a public 7–0 Premier Draft list of 40 cards; one deck per pair.

| Pair | Player | Record | Event | Date |
| --- | --- | --- | --- | --- |
| W/U | [Grease Ball](https://mtga.untapped.gg/profile/79469413-1944-4144-a17d-eddc05964a00/CD389E115109DA60/deck/c0ba798d-6c9d-40f9-8776-81a013f63794/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-02 |
| U/B | [Audens](https://mtga.untapped.gg/profile/41c6907b-68f8-44f4-8564-12e18f964553/EXWD2P6YUJD5DC2L2N6L7NR5I4/deck/0b39d6bf-a52b-4eaf-a3b0-dce91e31188b/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-07 |
| B/R | [danskyy](https://mtga.untapped.gg/profile/91298b88-e84e-49b4-a9a0-c8fb05167ae3/FRRJDMTMHBDIFDP3366JR672SI/deck/90cff80d-2dc0-4c24-814f-3eab4e574f14/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-08 |
| R/G | [Javycamy](https://mtga.untapped.gg/profile/fc5331fd-966e-45fd-aca2-4acd3f4e8162/D9B8CB4CE4B7DF5A/deck/0dc0765b-2d14-4040-9df7-442a23648f21/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-08-27 |
| G/W | [Inici](https://mtga.untapped.gg/profile/63437944-96c1-4f5f-9188-8851750e436a/72K2EFOF5ZGJXOLPVMPPIH5PHM/deck/3f207462-686b-4250-9b2c-4b684b6554fa/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-05 |
| W/B | [drdoctor](https://mtga.untapped.gg/profile/bed2cf2c-ff68-42ee-98aa-fb58048038ab/LR2DFCSNFZD6PFWEX534QDGAYM/deck/07dcead2-2f09-4f8f-babb-4d9989882945/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-08 |
| U/R | [Motrius](https://mtga.untapped.gg/profile/7ffee026-16f3-47bf-91b7-a666cc64277a/EUKEAS5BNBHCFDN6X6DQFK6F3A/deck/ee9a5181-6ea9-4a5c-b865-727f2485e6a4/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-08 |
| B/G | [QuiteLucky](https://mtga.untapped.gg/profile/e407abb5-d884-410d-9fa9-f497b34bd0cc/EF7BAD3B628574F/deck/d837cf1c-b36c-41fd-aff5-ab6f05833671/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-07 |
| R/W | [Jomas_MTG](https://mtga.untapped.gg/profile/ee59b842-676b-4c8a-a749-b16c1142b851/K7UBBSRTDFD4PJV4YOOENT7I7Y/deck/d779f404-71c3-46e9-b7b9-b2106fa6e879/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-09-07 |
| G/U | [SwarmOfMats](https://mtga.untapped.gg/profile/e36f1c55-bd90-46d6-96a7-dca1ac8e9f88/4IRTMJ6R2RAI3GAQUVM5MS5T3A/deck/fbdb9d36-e0f3-497a-b2db-b612475a658e/draft-replay?gameType=limited&limitedType=ranked&limitedSet=LTR) | 7–0 | Premier Draft | 2026-08-26 |

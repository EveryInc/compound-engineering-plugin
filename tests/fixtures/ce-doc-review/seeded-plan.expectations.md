# Expectations — seeded-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

| # | Section | Planted issue | Expected class |
|---|---|---|---|
| 1 | Requirements Trace | Header says "6 requirements planned" but only R1-R5 are listed | safe_auto |
| 2 | Key Technical Decisions | Cross-reference points at "Unit 7" but the plan only defines Units 1-5 | safe_auto |
| 3 | Key Technical Decisions / Unit 4 | "data store" and "database" are used interchangeably for the same store | safe_auto |
| 4 | Unit 1: Rename the CLI command | Deprecation warning is hand-rolled although the CLI framework ships a native `Deprecated` field | gated_auto |
| 5 | Unit 3: Rename output files | Output filename rename has no read-side fallback plus deprecation warning for one release | gated_auto |
| 6 | Unit 4: Migrate data store entries | No deployment-ordering guarantee between the migration and the code changes in Units 1-3 | gated_auto |
| 7 | Unit 2 / Unit 3 | Units 2 and 3 both update consumer sites that deploy together and could be a single unit | manual |
| 8 | Risks | Unresolved tension between a clean break on the output filename and a backward-compatible read period | manual |
| 9 | Risks | Alias is retained although no external consumers are documented anywhere in the plan | manual |
| 10 | Miscellaneous Notes | Rename may foreclose supporting crowd-based and browser-based sniffing side by side | manual |
| 11 | Abstraction Commentary | `AliasedCommand` abstraction is introduced for a single one-command rename | manual |
| 12 | Unit 3: Rename output files | Test scenarios cover only the happy path and omit the read-side failure modes | FYI |
| 13 | Miscellaneous Notes | Output filename `browser-report.md` is asymmetric with the `browser-sniff` command name | FYI |
| 14 | Miscellaneous Notes | Suggests renaming the `crowd_data` column with no evidence of impact | FYI |
| 15 | Known Drift | Legacy `crowd_data` column noted as drift with no concrete follow-up | FYI |
| 16 | Minor Observations | Vague nitpick about section ordering and the "Miscellaneous Notes" catch-all | drop |
| 17 | Minor Observations | Theoretical 10x scalability concern about the migration with no current evidence | drop |
| 18 | Minor Observations | Low-signal "some sentences could be tighter" style residual | drop |

# Locator prompt comparison

Live Jev comparison on `bench/locator/fixtures`; labels were fixed before running. This is a small synthetic fixture, not held-out evidence.

| Arm | Split | Task | Status | ms | Relevant/Returned | Precision | Recall@5 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| legacy | tuning | retry-backoff | complete | 401 | 1/4 | 0.25 | 1.00 |
| legacy | tuning | opening-animation | complete | 512 | 2/3 | 0.67 | 1.00 |
| legacy | tuning | app-shell | no_match | 15 | 0/0 | 0.00 | 0.00 |
| legacy | tuning | retry-doc | complete | 731 | 1/4 | 0.25 | 1.00 |
| legacy | tuning | retry-distractor | complete | 748 | 1/4 | 0.25 | 1.00 |
| legacy | acceptance | accept-opening-design | complete | 604 | 1/3 | 0.33 | 1.00 |
| legacy | acceptance | accept-retry-doc | complete | 710 | 1/4 | 0.25 | 1.00 |
| locator | tuning | retry-backoff | complete | 711 | 1/4 | 0.25 | 1.00 |
| locator | tuning | opening-animation | complete | 629 | 2/3 | 0.67 | 1.00 |
| locator | tuning | app-shell | no_match | 12 | 0/0 | 0.00 | 0.00 |
| locator | tuning | retry-doc | complete | 733 | 1/4 | 0.25 | 1.00 |
| locator | tuning | retry-distractor | complete | 752 | 1/4 | 0.25 | 1.00 |
| locator | acceptance | accept-opening-design | complete | 557 | 1/3 | 0.33 | 1.00 |
| locator | acceptance | accept-retry-doc | complete | 682 | 1/4 | 0.25 | 1.00 |

Raw candidate and score traces: `bench/locator/runs/results.json`.

legacy tuning: mean precision 0.28, mean recall@5 0.80
legacy acceptance: mean precision 0.29, mean recall@5 1.00
locator tuning: mean precision 0.28, mean recall@5 0.80
locator acceptance: mean precision 0.29, mean recall@5 1.00

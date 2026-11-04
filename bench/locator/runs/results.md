# Locator prompt comparison

Live Jev comparison on `bench/locator/fixtures`; labels were fixed before running. This is a small synthetic fixture, not held-out evidence.

| Arm | Task | Status | ms | Relevant/Returned | Precision | Recall@5 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| legacy | retry-backoff | complete | 523 | 1/4 | 0.25 | 1.00 |
| legacy | opening-animation | complete | 584 | 2/3 | 0.67 | 1.00 |
| legacy | app-shell | no_match | 15 | 0/0 | 0.00 | 0.00 |
| legacy | retry-doc | complete | 748 | 1/4 | 0.25 | 1.00 |
| legacy | retry-distractor | complete | 764 | 1/4 | 0.25 | 1.00 |
| locator | retry-backoff | complete | 780 | 1/4 | 0.25 | 1.00 |
| locator | opening-animation | complete | 608 | 2/3 | 0.67 | 1.00 |
| locator | app-shell | no_match | 16 | 0/0 | 0.00 | 0.00 |
| locator | retry-doc | complete | 709 | 1/4 | 0.25 | 1.00 |
| locator | retry-distractor | complete | 747 | 1/4 | 0.25 | 1.00 |

Raw candidate and score traces: `bench/locator/runs/results.json`.

legacy: mean precision 0.28, mean recall@5 0.80
locator: mean precision 0.28, mean recall@5 0.80

# Knowledge PDFs

Fixture healthcare documents used to demonstrate ingestion, retrieval, and the
three sufficiency gates. Replace these with the evaluator-supplied PDFs if they
differ; keep the filenames or update `pnpm seed` accordingly.

| File | Topic |
| ---- | ----- |
| `pregnancy-nutrition.pdf` | Diet, folic acid, iron, foods to avoid. No drug dosages. |
| `prenatal-care.pdf` | Visit schedule and warning signs. |
| `child-nutrition.pdf` | Milk feeding, complementary foods, honey warning. |

Regenerate the fixtures after editing `services/rag/cmd/genpdf/main.go`:

```bash
cd services/rag && go run ./cmd/genpdf ../docs/knowledge
```

A calibrated question set lives in `services/rag/testdata/questions.yaml`.
The weakly-related probe is: *What paracetamol dosage is safe in the third trimester?*

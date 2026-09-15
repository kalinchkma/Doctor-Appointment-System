# Knowledge PDFs

Fixture healthcare documents used to demonstrate ingestion, retrieval, and the
three sufficiency gates. Replace these with the evaluator-supplied PDFs if they
differ; keep the filenames or update `pnpm seed` accordingly.

| File | Topic |
| ---- | ----- |
| `pregnancy-nutrition.pdf` | Energy/protein, micronutrients, food safety, hydration, weight gain. No drug dosages. |
| `prenatal-care.pdf` | Antenatal contacts, maternal/fetal assessment, prevention, birth preparedness. |
| `child-nutrition.pdf` | Infant feeding, complementary foods, responsive feeding, food safety, drinks. |

Each PDF includes an in-document **RAG Test Questions** list and out-of-scope probes.
Suggested chat chips are seeded from those topics in `apps/payload/src/seed/chatQuestions.ts`.

A calibrated question set lives in `services/rag/testdata/questions.yaml`.
The weakly-related probe is: *What paracetamol dosage is safe in the third trimester?*

After replacing PDFs, re-seed so Knowledge Documents re-index and suggested questions refresh:

```bash
pnpm docker:seed
```

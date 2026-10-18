import { readFileSync } from 'node:fs';
import { DemoEngine, type DemoData } from '../demo/engine';
import { backendEvidenceSchema, mapEvidence } from '../api/backend';
import type { CohortQuery } from '../api/contracts';
import reference from './reference-parity.json';

const data = JSON.parse(readFileSync('public/data/demo-v1.json', 'utf8')) as DemoData;
export function summarySource() {
  const query = {
    ...reference[0].query,
    antibiotic_b: 'TMP',
    calendar_year: 2026,
    window: 'last_28d',
  } as CohortQuery;
  return mapEvidence(backendEvidenceSchema.parse(new DemoEngine(data).evidence(query)), query);
}

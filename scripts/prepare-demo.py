"""One-time export from the adjacent reference backend; never needed to run/build the demo.

Run with the backend's Python environment. Source CSV files and records are unchanged.
The committed output contains synthetic records only, normalized for browser queries.
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "TyksXMylab-backend"
sys.path.insert(0, str(BACKEND))
from aei.dataset import load_bundle
from aei.evidence_source import EvidenceSnapshot
from aei.evidence import calculate_evidence
from aei.evidence_models import EvidenceQuery
from aei.analysis_models import ComparisonQuery
from aei.comparisons import calculate_comparison
from aei.alert_models import AlertConfiguration, AlertContext, SavedAlertAnalysis
from aei.alerts import calculate_alert, advance_alert


def identity(value):
    return str(uuid5(NAMESPACE_URL, value))


def main():
    bundle = load_bundle(BACKEND / "synthetic_microbiology_dataset")
    manifest = bundle.report.manifest
    cultures = sorted(bundle.cultures, key=lambda c: (c.sample_date, c.culture_id))
    culture_index = {c.culture_id: i for i, c in enumerate(cultures)}
    patients = {p.patient_id: p for p in bundle.patients}
    wards = list(bundle.wards)
    ward_index = {w.ward_code: i for i, w in enumerate(wards)}
    drugs = list(bundle.antibiotics)
    drug_index = {d.antibiotic_code: i for i, d in enumerate(drugs)}
    organisms = sorted({e.organism for e in bundle.events})
    organism_index = {v: i for i, v in enumerate(organisms)}
    specimens = ["urine", "blood", "wound"]
    results = ["positive", "negative", "mixed_growth"]
    enrichment = {e.event_id: e for e in bundle.enrichments}
    events = sorted(bundle.events, key=lambda e: (e.sample_date, e.culture_id, e.isolate_id))
    compact_events = []
    for e in events:
        tests = ["-"] * len(drugs)
        for t in e.tests:
            tests[drug_index[t.antibiotic_code]] = t.result
        m = enrichment[e.event_id]
        compact_events.append([e.isolate_id, culture_index[e.culture_id], organism_index[e.organism],
                               "".join(tests), "".join(str(getattr(m, k)) for k in ("esbl", "mrsa", "vre", "cpe"))])
    seed = manifest.source_end - timedelta(days=3)
    seed_count = sum(c.sample_date <= seed for c in cultures)
    by_day = defaultdict(list)
    for c in cultures[seed_count:]:
        by_day[c.sample_date].append(c)
    batches = []
    for day, rows in sorted(by_day.items()):
        for start in range(0, len(rows), 20):
            chunk = rows[start:start + 20]
            batches.append(dict(delivery_id=f"local-{day}-{start}", as_of=str(day),
                                cultures=len(chunk), visible_cultures=culture_index[chunk[-1].culture_id] + 1))
    configuration = AlertConfiguration.model_validate_json((BACKEND / "alerts.demo.json").read_text())
    run_id = identity("standalone:" + manifest.manifest_id)
    reports, stages, previous, transitions = {}, [], {}, defaultdict(list)
    parity = []
    for stage_index in range(len(batches) + 1):
        count = seed_count if stage_index == 0 else batches[stage_index - 1]["visible_cultures"]
        as_of = seed if stage_index == 0 else cultures[count - 1].sample_date
        visible = tuple(e for e in events if culture_index[e.culture_id] < count)
        snapshot = EvidenceSnapshot(events=visible, enrichments={e.event_id: enrichment[e.event_id] for e in visible},
            antibiotics={d.antibiotic_code: d for d in drugs}, ward_codes=frozenset(ward_index), manifest=manifest,
            imported_cultures=seed_count, imported_culture_start=manifest.source_start, imported_culture_end=seed,
            imported_enrichments=sum(e.sample_date <= seed for e in events),
            ward_types={w.ward_code: w.ward_type for w in wards}, includes_feed_data=stage_index > 0)
        now = datetime.combine(as_of, datetime.min.time(), timezone.utc)
        state = dict(run_id=run_id, state_revision=stage_index + 1, status="receiving", demo_date=str(as_of),
            seed_through=str(seed), replay_through=str(manifest.source_end), latest_visible_sample_date=str(as_of),
            published_cultures=count, published_isolates=len(visible), source_manifest_id=manifest.manifest_id,
            source_kind="directory", mode="feed", clock_mode="simulated", feed_source_id="standalone-demo",
            feed_source_label="Synthetic demo lab batches", feed_data_digest=None)
        monitor_reports = []
        stage_alerts = []
        investigations = {}
        for monitor in configuration.monitors:
            report = SavedAlertAnalysis(analysis_id=identity(f"{run_id}/{stage_index}/{monitor.monitor_id}"),
                context=AlertContext(**{k: v for k, v in state.items() if k not in {"status", "seed_through", "replay_through"}},
                    source_files=manifest.files, importer_version=manifest.importer_version, generated_at=now,
                    monitoring_as_of=as_of, monitor_id=monitor.monitor_id, cohort_hash=monitor.cohort_hash,
                    monitor=monitor, configuration_hash=configuration.configuration_hash,
                    threshold_pp=configuration.threshold_pp),
                evaluation=calculate_alert(snapshot, monitor, configuration, as_of))
            monitor_reports.append(report.model_dump(mode="json"))
            reports[report.analysis_id] = report.model_dump(mode="json")
            old = previous.get(monitor.monitor_id)
            alert = advance_alert(old, report)
            if alert is None:
                continue
            if old is None:
                aid = identity(f"{run_id}/alert/{monitor.monitor_id}")
                alert = alert.model_copy(update=dict(alert_id=aid, investigation_id=aid,
                    investigation_url=f"/api/v1/investigations/{aid}"))
            if old is None or old.status != alert.status:
                transitions[alert.alert_id].append(dict(state_revision=stage_index + 1,
                    monitoring_as_of=str(as_of), previous_status=old.status if old else None,
                    status=alert.status, analysis_id=report.analysis_id))
            previous[monitor.monitor_id] = alert
            raw = alert.model_dump(mode="json")
            if alert.status != "cleared":
                stage_alerts.append(raw)
            investigations[alert.alert_id] = dict(alert=raw, original_detection=reports[alert.original_analysis_id],
                current_analysis=reports[alert.current_analysis_id], current_analysis_status="available",
                transitions=list(transitions[alert.alert_id]))
        stages.append(dict(state=state, alerts=dict(run_id=run_id, state_revision=stage_index + 1,
            monitoring_revision=stage_index + 1, monitoring_as_of=str(as_of),
            configuration=configuration.model_dump(mode="json"), alerts=stage_alerts, monitors=monitor_reports),
            investigations=investigations))
        # Golden values come from the existing Python implementation, not the JS port.
        selections = [dict(ward_code=w, sex=s, age_min=lo, age_max=hi, dedup_scope=scope)
            for w, s, lo, hi, scope in [("URO", None, None, None, "selected_cohort"),
                ("ED", "F", 18, 64, "selected_cohort"), ("URO", "M", 65, None, "all_wards"),
                (None, None, None, None, "all_wards")]]
        for selection in selections:
            query = EvidenceQuery(as_of=as_of, organism="Escherichia coli", specimen="urine", antibiotic_code="CIP", **selection)
            comparison = ComparisonQuery(**query.model_dump(exclude={"antibiotic_code"}), antibiotic_a="CIP", antibiotic_b="TMP")
            paired, _ = calculate_comparison(snapshot, comparison)
            parity.append(dict(stage=stage_index, query=query.model_dump(mode="json"),
                windows=calculate_evidence(snapshot, query).windows.model_dump(mode="json"),
                comparison_query=comparison.model_dump(mode="json"), comparison=paired.model_dump(mode="json")))
    output = dict(version=1, manifest=manifest.model_dump(mode="json"), organisms=organisms,
        wards=[w.model_dump(mode="json") for w in wards], specimens=specimens, results=results,
        antibiotics=[{**d.model_dump(mode="json", by_alias=True), "is_screening": d.is_screening} for d in drugs],
        cultures=[[c.culture_id, c.patient_id, str(c.sample_date), ward_index[c.ward_code], specimens.index(c.specimen),
            patients[c.patient_id].sex, c.age_years, results.index(c.result), str(c.admission_date) if c.admission_date else None]
            for c in cultures], isolates=compact_events, seed_count=seed_count, batches=batches, stages=stages)
    destination = ROOT / "public/data"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "demo-v1.json").write_text(json.dumps(output, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (ROOT / "src/test/reference-parity.json").write_text(json.dumps(parity, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(dict(cultures=len(cultures), isolates=len(events), batches=len(batches),
        bytes=(destination / "demo-v1.json").stat().st_size, parity_cases=len(parity))))


if __name__ == "__main__":
    main()

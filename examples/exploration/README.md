# Example: Exploration Process

This example shows a minimal exploration loop using the CLI.

## Setup

1) Build

```
npm install
npm run build
npm link
```

2) Install the example process definition

```
mkdir -p .state_gate/processes
cp examples/exploration/exploration-process.yaml .state_gate/processes/exploration-process.yaml
```

## Usage

1) Create a run

```
state-gate create-run --process-id exploration-process
```

Save the `run_id` and `revision` from the JSON output.

2) Check current state

```
state-gate get-state --run-id <run_id>
```

3) Submit a hypothesis (artifact guards use file names)

```
mkdir -p evidence
printf "Hypothesis draft" > evidence/hypothesis.md

state-gate emit-event \
  --run-id <run_id> \
  --event submit_hypothesis \
  --expected-revision 1 \
  --idempotency-key hyp-001 \
  --artifact-paths "./evidence/hypothesis.md"
```

4) Submit experiment plan

```
printf "Plan" > evidence/experiment_plan.md

state-gate emit-event \
  --run-id <run_id> \
  --event submit_experiment_plan \
  --expected-revision 2 \
  --idempotency-key plan-001 \
  --artifact-paths "./evidence/experiment_plan.md"
```

5) Submit observation

```
printf "Observation" > evidence/observation.md

state-gate emit-event \
  --run-id <run_id> \
  --event submit_observation \
  --expected-revision 3 \
  --idempotency-key obs-001 \
  --artifact-paths "./evidence/observation.md"
```

6) Submit synthesis

```
printf "Synthesis" > evidence/synthesis.md

state-gate emit-event \
  --run-id <run_id> \
  --event submit_synthesis \
  --expected-revision 4 \
  --idempotency-key syn-001 \
  --artifact-paths "./evidence/synthesis.md"
```

## Notes

- `artifact_paths` uses semicolon separators when passing multiple files.
- `emit-event` stores cumulative artifact paths in the latest CSV entry.
- Paths must be relative (absolute paths and ".." are rejected).

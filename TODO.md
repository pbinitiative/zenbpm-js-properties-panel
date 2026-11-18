# ZenBPM features — properties-panel coverage

Source of truth: `../zenbpm` (the engine). For every feature the engine
implements, the properties panel must give the modeller a way to author it.
For features the engine does **not** implement, the panel stays silent —
exposing a field that the engine ignores is dead UI.

---

## Engine feature inventory (from `../zenbpm/pkg/bpmn/model/extensions/*.go` and `../zenbpm/pkg/bpmn/...`)

| Engine binding (Go) | XML element / attribute | Moddle type | Panel coverage |
|---|---|---|---|
| `TAssignmentDefinition.Assignee` | `assignee` attr | `zenbpm:AssignmentDefinition` | ✅ `Assignment` group |
| `TAssignmentDefinition.CandidateGroups` | `candidateGroups` attr | `zenbpm:AssignmentDefinition` | ✅ `Assignment` group |
| `TIoMapping.Source / Target` (× input / output) | `source`/`target` attrs | `zenbpm:Input` / `zenbpm:Output` | ✅ `Input mapping` / `Output mapping` ListGroups |
| `TCalledElement.ProcessId` | `processId` attr | `zenbpm:CalledElement` | ✅ `Called element` group |
| `TCalledElement.BindingType` | `bindingType` attr | `zenbpm:CalledElement` | ✅ `Called element` group |
| `TCalledElement.VersionTag` | `versionTag` attr | `zenbpm:CalledElement` | ✅ `Called element` group |
| `TCalledDecision.DecisionId` | `decisionId` attr | `zenbpm:CalledDecision` | ✅ `Called decision` group |
| `TCalledDecision.ResultVariable` | `resultVariable` attr | `zenbpm:CalledDecision` | ✅ `Called decision` group |
| `TTaskDefinition.Type` | `type` attr | `zenbpm:TaskDefinition` | ✅ `Task definition` group on worker tasks (incl. Message Intermediate Throw Event) and User Tasks |
| `TTaskDefinition.Retries` | `retries` attr | `zenbpm:TaskDefinition` | ✅ `Task definition` group on worker tasks (incl. Message Intermediate Throw Event) only |
| `TSubscription.CorrelationKey` | `correlationKey` attr | `zenbpm:Subscription` | ✅ `Message` group (catch/boundary/event-sub-process start) |
| `TLoopCharacteristics.*` | `inputCollection` / `inputElement` / `outputCollection` / `outputElement` | `zenbpm:LoopCharacteristics` | ✅ `Multi-instance` group |
| `bpmn:TimerEventDefinition` (ISO-8601) | `timeDate` / `timeDuration` / `timeCycle` | (BPMN native) | ✅ bpmn-js default timer group |
| `bpmn:ErrorEventDefinition` | `errorRef` | (BPMN native) | ✅ bpmn-js default error group |
| `bpmn:MessageEventDefinition` (name) | `messageRef` | (BPMN native) | ✅ bpmn-js default `Message` group + our `Subscription` entry (removed for Message Intermediate Throw Event, which is job-based) |
| `bpmn:ConditionExpression` (sequence flow) | `conditionExpression` body | (BPMN native) | ✅ `Condition` group (FEEL) |
| `TExecutionListener.EventType / Type / Retries / RetryBackoff` (`start` and `end` on service, send and user tasks, business rule tasks whose task definition names a type and which name no decision, and message intermediate throw events, none of them multi-instance; `end` on a start event directly under the process) | `eventType` / `type` / `retries` / `retryBackoff` attrs | `zenbpm:ExecutionListeners` / `zenbpm:ExecutionListener` | ✅ `Execution listeners` list group, over every `executionListeners` element of the element, and over those of its process for a pool. `retryBackoff` has no moddle attribute yet, as for `zenbpm:TaskDefinition`: it cannot be entered for a new listener, but one a listener came with is shown, validated and can be corrected or cleared |
| `bpmn:Process` (version tag) | inline `zenbpm:VersionTag` child on Process | `zenbpm:VersionTag` | ✅ appended to `General` group |

---

## Engine features with no panel coverage (and why)

None — every Go binding the engine reads has a corresponding editor surface.
Where the engine uses the bare BPMN element (Timer / Error / Message), the
stock bpmn-js-properties-panel entry is sufficient; we only replace it when
we add a ZenBPM-specific extension on top (Message → Subscription).

---

## Moddle types the panel offers that the engine does not use

These are kept for forward-compatibility / Zeebe-file import. They are
**not** read by the current ZenBPM engine. Each one is a small, isolated
field; none hurts the modeler round-trip because the engine silently
ignores the extension.

| Moddle type | Where it appears | Engine reads it? |
|---|---|---|
| `zenbpm:Properties` / `zenbpm:Property` (key/value list) | `Extension properties` group (any element) | ❌ — generic metadata bag; moddle has it, the engine's e2e test fixtures carry it (e.g. `ZEN_FORM` JSON on a UserTask) but the runtime has no Go binding |
| `zenbpm:PriorityDefinition` | `Assignment` group (UserTask) | ❌ — moddle fork-inherited from zeebe-bpmn-moddle, engine has no binding |
| `zenbpm:TaskSchedule` (`dueDate` / `followUpDate`) | `Assignment` group (UserTask) | ❌ — same |
| `zenbpm:AssignmentDefinition.candidateUsers` | `Assignment` group (UserTask) | ❌ — only `assignee` + `candidateGroups` are bound |
| `zenbpm:CalledElement.propagateAllChildVariables` / `propagateAllParentVariables` | `Called element` group | ❌ — engine has no propagation handling |
| `zenbpm:TaskDefinition` `Headers` (`zenbpm:Header[]`) | not surfaced (yet) | ❌ — engine source has `// TODO: Implement Headers` |

If / when the engine adds bindings for any of these, the panel already
exposes the field and the existing utilities
(`updateExtensionElementProps`, `removeExtensionElement`) handle the
round-trip. No new code is needed in this package.

---

## Moddle types the engine does not use and the panel does **not** offer

Deliberately omitted — adding a UI for them would be misleading because
deploying a diagram containing them is a no-op (the engine just ignores
them) or, in some cases, a deploy error.

| Moddle type | Why omitted |
|---|---|
| `zenbpm:Script` (ScriptTask implementation) | Engine explicitly rejects `bpmn:ScriptTask` at deploy (`unsupported_elements_test.go`) |
| `zenbpm:AdHoc` (ad-hoc sub-process) | Engine has no `AdHoc` references in `pkg/bpmn/...` |
| `zenbpm:TaskListener(s)` | Engine refuses a task listener at deployment. None can be created; one a model came with is listed in the `Execution listeners` group with that reason, to be removed |
| `zenbpm:ConditionalFilter` (conditional events) | Not present in engine source |
| `zeebe:*` / camunda-cloud-only types | Out of scope — this package emits `zenbpm:*` only |

---

## Compatibility with Zeebe / Camunda 8 files

A file authored against `zeebe-bpmn-moddle` is read into the editor via
`normalizeZeebeXml()` (already in `lib/util/NormalizeNamespace.ts`). After
normalization:

- Every `zeebe:TaskDefinition`, `zeebe:IoMapping`, `zeebe:CalledElement`,
  `zeebe:CalledDecision`, `zeebe:AssignmentDefinition`,
  `zeebe:LoopCharacteristics`, `zeebe:Subscription`, `zeebe:FormDefinition`
  is rewritten to its `zenbpm:` equivalent and round-trips correctly.
- Camunda-only types that have no `zenbpm:` counterpart (e.g. zeebe
  `Header` / `Property` / `Script` / `AdHoc` / `ConditionalFilter`) are
  passed through verbatim —
  the editor does not surface them, but they are not corrupted on
  re-export either. Deploying such a file to the current ZenBPM engine
  will either silently drop the extension or, in the case of `Script` /
  `Signal` / `ReceiveTask`, fail at deploy time — which is a property of
  the engine, not the editor.
- A zeebe `TaskListener` is passed through verbatim as well, and the
  engine refuses a deployment with one. The editor does surface it, in
  the `Execution listeners` group, with that reason and a delete button.

---

## Definition of done for this package

- Every row of the "Engine feature inventory" table above continues to
  have a green check mark.
- `pnpm test` stays green (Smoke + Priority specs cover the two most
  recent additions; each future feature should land with its own spec).
- `pnpm build` stays green.
- No panel surface for a feature the engine does not implement.

# @pbinitiative/zenbpm-js-properties-panel

A [bpmn-js](https://github.com/bpmn-io/bpmn-js) properties panel provider that adds **ZenBPM-specific element properties** to the standard [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel).

It reads and writes ZenBPM extension elements (defined by [`@pbinitiative/zenbpm-bpmn-moddle`](https://github.com/pbinitiative/zenbpm-bpmn-moddle)) directly inside the BPMN XML, keeping diagrams portable and engine-ready.

---

## Properties added

| Element | Property group | Fields |
|---|---|---|
| Service / Rule / Script / Send Task | **Task definition** | Type, Retries |
| Business Rule Task | **Called decision** | Decision ID, Binding, Version |
| Call Activity | **Called element** | Process ID, Binding, Version |
| User Task | **Assignment** | Assignee, Candidate groups |
| User Task | **Task schedule** | Due date, Follow-up date |
| User Task | **Zen Form** | *Design Form* button (opens form designer) |
| All applicable tasks + Sub-process + Events | **Input mapping** | Source expression (FEEL), Target variable |
| All applicable tasks + Sub-process + Events | **Output mapping** | Source expression (FEEL), Target variable |
| Multi-instance elements | **Multi-instance** | Input collection, Element variable, Output collection, Output element, Completion condition |
| Sequence flows / boundary events | **Condition** | Condition expression (FEEL) |
| Process | **Version tag** | Tag value |

---

## Installation

```bash
npm install @pbinitiative/zenbpm-js-properties-panel
# or
pnpm add @pbinitiative/zenbpm-js-properties-panel
```

### Peer dependencies

The following packages must already be present in your project:

```bash
npm install bpmn-js bpmn-js-properties-panel @bpmn-io/properties-panel
```

---

## Usage

Import the provider module and add it to your `bpmn-js` / `bpmnlint` modeler alongside the standard properties panel.

```js
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { ZenBpmPropertiesProviderModule } from '@pbinitiative/zenbpm-js-properties-panel';

// ZenBPM moddle descriptor — required so bpmnFactory knows the zenbpm:* types
import ZenbpmModdle from '@pbinitiative/zenbpm-bpmn-moddle';

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    ZenBpmPropertiesProviderModule,   // ← add this
  ],
  moddleExtensions: {
    zenbpm: ZenbpmModdle,             // ← and this
  },
});
```

> **Note:** The moddle extension (`moddleExtensions: { zenbpm: ZenbpmModdle }`) is required. Without it, `bpmnFactory` will not recognise the `zenbpm:*` types and extension elements will not be created or read correctly.

---

## Zen Form designer integration

The **Design Form** button in the *Zen Form* group dispatches a native DOM `CustomEvent` that your application can listen to:

```js
document.addEventListener('bpmn-open-form-designer', (event) => {
  const { elementId, value } = event.detail;
  // elementId — the BPMN element id
  // value     — current form JSON (raw string), empty if not yet set
  openMyFormDesigner(elementId, value);
});
```

To write the result back, store the form JSON as a FEEL string literal in the `ZEN_FORM` input mapping parameter (`source: ="<json>"`).

---

## License

MIT

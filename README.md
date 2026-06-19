# @pbinitiative/zenbpm-js-properties-panel

A [bpmn-js](https://github.com/bpmn-io/bpmn-js) properties panel provider that adds **ZenBPM-specific element properties** to the standard [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel).

It reads and writes ZenBPM extension elements (defined by [`@pbinitiative/zenbpm-bpmn-moddle`](https://github.com/pbinitiative/zenbpm-bpmn-moddle)) directly inside the BPMN XML, keeping diagrams portable and engine-ready.

---

## Properties added

| Element | Property group | Fields |
|---|---|---|
| Business Rule Task | **Implementation** | Implementation type (DMN decision / Job worker) |
| Business Rule Task — DMN decision | **Called decision** | Decision ID, Binding (latest/deployment/version tag), Version tag*, Result variable |
| Business Rule Task — Job worker | **Task definition** | Type, Retries |
| Service / Script / Send Task | **Task definition** | Type, Retries |
| Call Activity | **Called element** | Process ID, Binding (latest/deployment/version tag), Version tag*, Propagate all child variables, Propagate all parent variables |
| User Task | **Assignment** | Assignee (FEEL), Candidate groups (FEEL), Candidate users (FEEL), Due date (FEEL), Follow-up date (FEEL) |
| User Task | **Zen Form** | *Design Form* button (opens form designer) |
| All applicable tasks + Sub-process + Events | **Input mapping** | Source expression (FEEL), Target variable |
| All applicable tasks + Sub-process + Events | **Output mapping** | Source expression (FEEL), Target variable |
| Multi-instance elements | **Multi-instance** | Input collection, Element variable, Output collection, Output element, Completion condition |
| Sequence flows / boundary events | **Condition** | Condition expression (FEEL) |
| Process | **Version tag** | Tag value |
| Message catch events (Intermediate Catch Event, Boundary Event), Start Event in event sub-process | **Message** | Subscription correlation key (FEEL) |

> \* The **Version tag** text field only appears when you select *Version tag* from the **Binding** dropdown. The Binding dropdown has three options: *Latest* (always use the newest deployed version), *Deployment* (use the version deployed together with this process), and *Version tag* (use a specific version identified by a tag string).

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

## Zeebe / Camunda 8 file compatibility

The ZenBPM moddle is a fork of the [Zeebe moddle](https://github.com/camunda/zeebe-bpmn-moddle). The element structures are compatible:

| Engine | Namespace URI |
|---|---|
| Zeebe / Camunda 8 | `http://camunda.org/schema/zeebe/1.0` |
| ZenBPM | `http://zenbpm.pbinitiative.org/1.0` |

The package exports a **`normalizeZeebeXml`** utility that rewrites the namespace before import. Call it once, immediately before passing XML to `modeler.importXML()` — no other changes are needed:

```ts
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { ZenBpmPropertiesProviderModule, normalizeZeebeXml } from '@pbinitiative/zenbpm-js-properties-panel';
import ZenbpmModdle from '@pbinitiative/zenbpm-bpmn-moddle';

const rawXml = await fetchMyBpmnFile();

await modeler.importXML(normalizeZeebeXml(rawXml));
```

> **Note:** The transformation is purely textual (a namespace URI string replacement and rewrite `zeebe` namespace to `zenbpm`). It does not validate the XML or change element names, attributes, or the diagram layout. It is safe to call on any BPMN string, including files that already use the `zenbpm` namespace (they are returned unchanged).

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


const ZEEBE_NAMESPACE_URI = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const ZENBPM_NAMESPACE_URI = 'xmlns:zenbpm="http://zenbpm.pbinitiative.org/1.0"';

/**
 * Camunda Modeler stores UI-only metadata on BPMN elements via `zeebe:Property`
 * extension elements whose `name` carries a `camundaModeler:` prefix (e.g.
 * `name="camundaModeler:exampleOutputJson"`). On import we rename that prefix
 * to our own `zenbpmModeler:` so the moddle model is self-consistent; on
 * export back to Camunda we reverse the rename.
 */
const CAMUNDA_MODELER_PREFIX = 'name="camundaModeler:';
const ZENBPM_MODELER_PREFIX  = 'name="zenbpmModeler:';

/**
 * Rewrite Camunda/Zeebe-flavoured XML into the ZenBPM flavour.
 *
 *   <zeebe:property name="camundaModeler:foo" value="{}"/>
 *     →  <zenbpm:property name="zenbpmModeler:foo" value="{}"/>
 *
 * Intended to be called by the host application **before** `modeler.importXML()`.
 * It is a text-level transform, so it is best-effort: the `name` rewrite
 * matches anywhere a literal `name="camundaModeler:` appears. That prefix is
 * specific enough not to collide with any other attribute in valid BPMN/ZenBPM
 * XML.
 */
export function normalizeZeebeXml(xml: string): string {
  return xml
    .replace(new RegExp(ZEEBE_NAMESPACE_URI, 'g'), ZENBPM_NAMESPACE_URI)
    .replace(new RegExp("<zeebe:", 'g'), "<zenbpm:")
    .replace(new RegExp("</zeebe:", 'g'), "</zenbpm:")
    .replace(new RegExp(CAMUNDA_MODELER_PREFIX, 'g'), ZENBPM_MODELER_PREFIX);
}

/**
 * Inverse of {@link normalizeZeebeXml}. Rewrites ZenBPM-flavoured XML into a
 * Camunda/Zeebe-flavoured XML that Camunda Modeler / Zeebe tooling can read.
 *
 *   <zenbpm:property name="zenbpmModeler:foo" value="{}"/>
 *     →  <zeebe:property name="camundaModeler:foo" value="{}"/>
 *
 * Intended to be called by the host application **after** `modeler.saveXML()`
 * to produce a Camunda-compatible export.
 */
export function denormalizeToZeebeXml(xml: string): string {
  return xml
    .replace(new RegExp(ZENBPM_NAMESPACE_URI, 'g'), ZEEBE_NAMESPACE_URI)
    .replace(new RegExp("<zenbpm:", 'g'), "<zeebe:")
    .replace(new RegExp("</zenbpm:", 'g'), "</zeebe:")
    .replace(new RegExp(ZENBPM_MODELER_PREFIX, 'g'), CAMUNDA_MODELER_PREFIX);
}

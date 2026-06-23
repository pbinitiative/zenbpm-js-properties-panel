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
export declare function normalizeZeebeXml(xml: string): string;
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
export declare function denormalizeToZeebeXml(xml: string): string;


const ZEEBE_NAMESPACE_URI = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const ZENBPM_NAMESPACE_URI = 'xmlns:zenbpm="http://zenbpm.pbinitiative.org/1.0"';

export function normalizeZeebeXml(xml: string): string {
  return xml
    .replace(new RegExp(ZEEBE_NAMESPACE_URI, 'g'), ZENBPM_NAMESPACE_URI)
    .replace(new RegExp("<zeebe:", 'g'), "<zenbpm:")
    .replace(new RegExp("</zeebe:", 'g'), "</zenbpm:");
}

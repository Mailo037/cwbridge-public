/* CWBridge console: pages/services. Local ES module; no runtime dependencies.
 *
 * Services are a Settings sub-page and domains have sub-pages of their own, so
 * this module owns no top-level page any more. It keeps the two declarations
 * that several modules need to agree on — the domain sub-page list and the
 * service copy — so that neither Settings nor a domain has to import the
 * other. */

/* Domain sub-pages. The order is the navigation order; the divider only groups
 * the destructive section away from the read-only ledgers. */
const DOMAIN_SECTIONS = [
  { id: 'services', label: 'Services & limits', icon: 'list' },
  { id: 'activity', label: 'Activity', icon: 'scroll-text' },
  { id: 'backups', label: 'Backups', icon: 'hard-drive' },
  { id: 'danger', label: 'Danger zone', divider: true, icon: 'circle-alert' },
];
const DOMAIN_SECTIONS_NEW = [{ id: 'services', label: 'Services & limits', icon: 'list' }];
const DOMAIN_SECTION_SETS = { add: DOMAIN_SECTIONS_NEW, edit: DOMAIN_SECTIONS };

function domainSections(mode = 'edit') {
  return DOMAIN_SECTION_SETS[mode] || DOMAIN_SECTIONS;
}

export { domainSections };

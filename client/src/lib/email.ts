/** Mirrors server `isValidEmail` — use before submit for fast feedback. */

const EMAIL_MAX_LENGTH = 100;
const EMAIL_LOCAL_MAX_LENGTH = 60;
const EMAIL_LABEL_MAX_LENGTH = 60;

function isLocalPartOk(local: string): boolean {
  if (local.length === 0 || local.length > EMAIL_LOCAL_MAX_LENGTH) return false;
  if (local.length === 1) return /^[a-zA-Z0-9]$/.test(local);
  return /^[a-zA-Z0-9][a-zA-Z0-9._%+-]*[a-zA-Z0-9]$/i.test(local);
}

function isDomainLabelOk(label: string): boolean {
  if (label.length === 0 || label.length > EMAIL_LABEL_MAX_LENGTH) return false;
  if (label.length === 1) return /^[a-z0-9]$/i.test(label);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label);
}

/** Keep in sync with server `routes/auth.ts` */
const TWO_LABEL_SINGLE_CHAR_FIRST_OK = new Set([
  "g.co",
  "t.co",
  "x.com",
]);

function domainNonTldLabelsSubstantial(labels: string[]): boolean {
  const domain = labels.join(".");
  if (labels.length === 2 && TWO_LABEL_SINGLE_CHAR_FIRST_OK.has(domain)) {
    return true;
  }
  for (let i = 0; i < labels.length - 1; i++) {
    if (labels[i]!.length < 2) return false;
  }
  return true;
}

export function isValidEmailFormat(email: string): boolean {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain.length === 0) return false;
  if (!isLocalPartOk(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!isDomainLabelOk(label)) return false;
  }

  const tld = labels[labels.length - 1]!;
  if (tld.length < 2) return false;
  if (!domainNonTldLabelsSubstantial(labels)) return false;

  return true;
}

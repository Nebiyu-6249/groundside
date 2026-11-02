// Redaction for logs: emails become a***@domain (docs/SPEC.md 13).

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function redactEmail(email: string): string {
  return email.replace(EMAIL, "$1***@$2");
}

export function redactEmailsInText(text: string): string {
  return text.replace(EMAIL, "$1***@$2");
}

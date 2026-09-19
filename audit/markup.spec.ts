import { markupTests } from './markup';

// Nu by default. AUDIT_HTML=html-validate swaps in the other checker; that is what
// npm run test:audit:html-validate does.
markupTests({ html: process.env.AUDIT_HTML === 'html-validate' ? 'html-validate' : 'nu' });

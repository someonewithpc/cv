// The HTML and CSS checks take a couple of seconds and need only the build this suite
// already makes, so they run here as well as in the audit suite (npm run test:audit).
import { markupTests } from '../audit/markup';

// html-validate, not Nu: this suite runs on every change and needs no Java, and Nu is
// four times slower. npm run test:audit is where the thorough checker runs.
markupTests({ html: 'html-validate' });

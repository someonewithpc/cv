// The HTML and CSS checks take a couple of seconds and need only the build this suite
// already makes, so they run here as well as in the audit suite (npm run test:audit).
import { markupTests } from '../audit/markup';

markupTests();

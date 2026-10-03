import { highlightLines } from '@/highlight';

/** The spans of PHP source from the shared highlighter, one string per line, for a box that exists already. */
export const phpLines = (code: string) => highlightLines(code, 'php');

/** One line of PHP as spans. */
export const php = (code: string) => phpLines(code)[0];

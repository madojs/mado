/**
 * Applying HeadMeta to document.<head> in SPA runtime.
 *
 * Approach: we mark all tags we create with the `data-mado-head` attribute.
 * On the next `applyHead` we first remove all ours, then insert the new ones.
 * Existing unrelated metadata from index.html is left alone. Known singleton
 * values (description, canonical, robots, Open Graph and Twitter cards) are
 * replaced so a shell fallback cannot compete with route-owned metadata.
 *
 * For strict static HTML + SPA navigation: also mark static head tags with
 * `data-mado-head="static"`, then the first applyHead removes and replaces them.
 */
import type { HeadMeta } from "./page.js";
export declare function applyHead(meta: HeadMeta): void;

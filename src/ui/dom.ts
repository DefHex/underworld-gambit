/** Looks up an element by id; the ids are fixed in index.html, so a miss is a programming error. */
export const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

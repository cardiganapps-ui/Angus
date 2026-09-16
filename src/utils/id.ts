export function makeId(): string {
  return crypto.randomUUID();
}

/** React's useId() hands back ":r7:". Legal in an id attribute, but
    awkward to read and to concatenate, so every hand-built id in the
    components strips the colons the same way. */
export function domId(reactId: string): string {
  return reactId.replace(/:/g, "");
}

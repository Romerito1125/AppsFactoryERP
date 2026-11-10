/** Helpers for calendar dates used by HTML date inputs. */
export function toDateInputLocal(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Converts a date input value without letting UTC change its calendar day. */
export function dateInputToIso(value, time = "12:00:00") {
  if (!value) return undefined;
  const date = new Date(`${value}T${time}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

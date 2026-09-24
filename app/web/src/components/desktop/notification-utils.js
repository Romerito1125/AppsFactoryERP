export function notificationTargetUrl(action) {
  if (!action?.module) return "/";
  if (action.module === "pos") {
    const documentId = action.entityId ? `&documentId=${action.entityId}` : "";
    return `/?module=sales&view=billing${documentId}`;
  }
  const params = new URLSearchParams({
    module: action.module,
    ...(action.view ? { view: action.view } : {}),
    ...(action.entityId ? { documentId: String(action.entityId) } : {}),
  });
  return `/?${params.toString()}`;
}

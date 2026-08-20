export function getErrorPaths(errors, prefix = '') {
  if (!errors || typeof errors !== 'object') {
    return []
  }

  return Object.entries(errors).flatMap(([key, value]) => {
    if (!value) {
      return []
    }

    const path = prefix ? `${prefix}.${key}` : key
    if (value.message || value.type) {
      return [path]
    }

    return getErrorPaths(value, path)
  })
}

export function getFirstErrorPath(errors) {
  return getErrorPaths(errors)[0] ?? null
}

export function pathBelongsToField(path, fieldName) {
  return path === fieldName || path.startsWith(`${fieldName}.`)
}

export function stepHasErrors(errorPaths, fieldNames) {
  return errorPaths.some((errorPath) =>
    fieldNames.some((fieldName) => pathBelongsToField(errorPath, fieldName)),
  )
}

export function focusErrorField(path) {
  if (!path || typeof document === 'undefined') {
    return
  }

  const selectorPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const firstFieldName = path.split('.')[0]
  const selectorField = firstFieldName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const field =
    document.querySelector(`[name="${selectorPath}"]`) ??
    document.querySelector(`[name="${selectorField}"]`)

  if (!field) {
    return
  }

  field.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (typeof field.focus === 'function') {
    field.focus({ preventScroll: true })
  }
}

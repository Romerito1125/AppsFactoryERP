import { useEffect, useRef, useState } from 'react'

export function useDraggableWindow() {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => {
    function handlePointerMove(event) {
      if (!dragRef.current) return

      setPosition({
        x: dragRef.current.originX + event.clientX - dragRef.current.startX,
        y: dragRef.current.originY + event.clientY - dragRef.current.startY,
      })
    }

    function handlePointerUp() {
      dragRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest('button')) return

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    setIsDragging(true)
    event.preventDefault()
  }

  const style = position.x || position.y
    ? { transform: `translate(calc(-50% + ${position.x}px), ${position.y}px)` }
    : undefined

  return { handlePointerDown, isDragging, style }
}

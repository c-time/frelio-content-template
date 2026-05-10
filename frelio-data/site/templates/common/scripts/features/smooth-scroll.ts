export function initSmoothScroll(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]')

    if (!anchor) return

    const id = anchor.getAttribute('href')
    if (!id || id === '#') return

    const element = document.querySelector(id)
    if (!element) return

    e.preventDefault()
    element.scrollIntoView({ behavior: 'smooth' })
  })
}

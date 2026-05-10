export function initMobileNav(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.c-nav__toggle')
  const list = document.querySelector<HTMLUListElement>('.c-nav__list')

  if (!toggle || !list) return

  toggle.addEventListener('click', () => {
    const isOpen = list.classList.contains('c-nav__list--open')
    list.classList.toggle('c-nav__list--open', !isOpen)
    toggle.setAttribute('aria-expanded', String(!isOpen))
  })

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.c-nav')) {
      list.classList.remove('c-nav__list--open')
      toggle.setAttribute('aria-expanded', 'false')
    }
  })
}

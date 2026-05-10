import '../styles/index.scss'
import { initMobileNav } from './features/mobile-nav'
import { initSmoothScroll } from './features/smooth-scroll'

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav()
  initSmoothScroll()
})

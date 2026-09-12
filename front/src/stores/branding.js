import { defineStore } from 'pinia'
import { http } from '@/services/http'
import { portalPrimaryNav, portalSections } from '@/layouts/nav'

/**
 * What the administrator set on Settings → Design (rasm): the brand's
 * colour, name, logo and favicon, the covers of the portal's pages, and
 * how the portal's top bar is arranged. Read once from the public settings
 * endpoint — the login page needs it before anybody is signed in — and
 * applied to the document: the primary colour becomes the CSS token every
 * button reads, the favicon replaces the shipped one.
 */
const hex = (value) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? '').trim())
  return m ? m[1].toLowerCase() : null
}
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (c, t, k) => c.map((v, i) => Math.round(v + (t[i] - v) * k))
const luminance = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export const useBrandingStore = defineStore('branding', {
  state: () => ({
    loaded: false,
    appName: '',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '',
    loginBackgroundUrl: '',
    coursesCoverUrl: '',
    catalogCoverUrl: '',
    profileCoverUrl: '',
    portalNav: [],
    startPage: '',
  }),
  getters: {
    /** The portal's top-bar links as arranged, or the built-in five. */
    primaryNav: (state) => {
      if (!state.portalNav?.length) return portalPrimaryNav
      const byName = new Map(portalSections.map((item) => [item.name, item]))
      const arranged = state.portalNav.filter((row) => row.enabled !== false && byName.has(row.name)).map((row) => byName.get(row.name))
      return arranged.length ? arranged : portalPrimaryNav
    },
    startPath: (state) => portalSections.find((item) => item.name === state.startPage)?.path ?? '',
  },
  actions: {
    async load() {
      try {
        const { data } = await http.get('/settings/public')
        this.set(data.data?.branding ?? {})
      } catch {
        // No settings, no branding: the shipped defaults stand.
      } finally {
        this.loaded = true
      }
    },
    set(branding) {
      Object.assign(this, {
        appName: branding.appName ?? '',
        logoUrl: branding.logoUrl ?? '',
        faviconUrl: branding.faviconUrl ?? '',
        primaryColor: branding.primaryColor ?? '',
        loginBackgroundUrl: branding.loginBackgroundUrl ?? '',
        coursesCoverUrl: branding.coursesCoverUrl ?? '',
        catalogCoverUrl: branding.catalogCoverUrl ?? '',
        profileCoverUrl: branding.profileCoverUrl ?? '',
        portalNav: branding.portalNav ?? [],
        startPage: branding.startPage ?? '',
      })
      this.apply()
    },
    apply() {
      const root = document.documentElement
      const h = hex(this.primaryColor)
      const tokens = ['--color-primary', '--color-primary-hover', '--color-primary-foreground', '--color-primary-subtle']
      if (!h) {
        tokens.forEach((name) => root.style.removeProperty(name))
      } else {
        const base = rgb(h)
        const dark = luminance(base) < 0.35
        const hover = mix(base, dark ? [255, 255, 255] : [0, 0, 0], 0.12)
        const subtle = mix(base, [255, 255, 255], 0.88)
        // White text on the colour, unless the colour is too light for it.
        const foreground = luminance(base) > 0.5 ? [10, 12, 20] : [255, 255, 255]
        root.style.setProperty('--color-primary', base.join(' '))
        root.style.setProperty('--color-primary-hover', hover.join(' '))
        root.style.setProperty('--color-primary-foreground', foreground.join(' '))
        root.style.setProperty('--color-primary-subtle', subtle.join(' '))
      }
      if (this.faviconUrl) {
        let link = document.querySelector('link[rel="icon"]')
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = this.faviconUrl
      }
      if (this.appName) document.title = this.appName
    },
  },
})

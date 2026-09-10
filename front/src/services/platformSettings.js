import { http } from './http'

/**
 * The platform settings singleton (7.6).
 *
 * Named `platformSettings` rather than `settings`: the app already has a
 * personal settings page (theme, language), and the two being one word
 * apart in imports is how an AI budget ends up on somebody's profile.
 */
export const platformSettingsApi = {
  get() {
    return http.get('/settings').then((r) => r.data.data)
  },

  update(patch) {
    return http.patch('/settings', patch).then((r) => r.data.data)
  },
}

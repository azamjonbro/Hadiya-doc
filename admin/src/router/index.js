import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UnauthorizedView from '@/views/UnauthorizedView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import UsersListView from '@/views/UsersListView.vue'
import UserDetailView from '@/views/UserDetailView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: HomeView },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/403', name: 'forbidden', component: ForbiddenView, meta: { public: true } },
    { path: '/401', name: 'unauthorized', component: UnauthorizedView, meta: { public: true } },
    {
      path: '/admin/users',
      name: 'users-list',
      component: UsersListView,
      meta: { permission: 'user:read' },
    },
    {
      path: '/admin/users/:id',
      name: 'user-detail',
      component: UserDetailView,
      meta: { permission: 'user:read' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { public: true } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated && auth.canUseAdminApp) {
      return { name: 'dashboard' }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // The admin app is only for SUPERADMIN/ADMIN/MANAGER — everyone else uses front/.
  if (!auth.canUseAdminApp) {
    return { name: 'forbidden' }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' }
  }

  return true
})

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UnauthorizedView from '@/views/UnauthorizedView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import UsersListView from '@/views/UsersListView.vue'
import UserDetailView from '@/views/UserDetailView.vue'
import CoursesListView from '@/views/CoursesListView.vue'
import CourseDetailView from '@/views/CourseDetailView.vue'
import CourseBuilderView from '@/views/CourseBuilderView.vue'
import NewsListView from '@/views/NewsListView.vue'
import NewsDetailView from '@/views/NewsDetailView.vue'
import TasksListView from '@/views/TasksListView.vue'
import ReportsView from '@/views/ReportsView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import SettingsView from '@/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/403', name: 'forbidden', component: ForbiddenView, meta: { public: true } },
    { path: '/401', name: 'unauthorized', component: UnauthorizedView, meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'dashboard', component: HomeView, meta: { titleKey: 'nav.dashboard' } },
        {
          path: 'admin/users',
          name: 'users-list',
          component: UsersListView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'admin/users/:id',
          name: 'user-detail',
          component: UserDetailView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'admin/courses',
          name: 'courses-list',
          component: CoursesListView,
          meta: { permission: 'course:read', titleKey: 'nav.courses' },
        },
        {
          path: 'admin/courses/new',
          name: 'course-builder',
          component: CourseBuilderView,
          meta: { permission: 'course:create', titleKey: 'courseBuilder.title' },
        },
        {
          path: 'admin/courses/:id',
          name: 'course-detail',
          component: CourseDetailView,
          meta: { permission: 'course:read', titleKey: 'nav.courses' },
        },
        {
          path: 'admin/news',
          name: 'news-list',
          component: NewsListView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'admin/news/:id',
          name: 'news-detail',
          component: NewsDetailView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'admin/tasks',
          name: 'tasks-list',
          component: TasksListView,
          meta: { permission: 'task:create', titleKey: 'nav.tasks' },
        },
        {
          path: 'admin/reports',
          name: 'reports',
          component: ReportsView,
          meta: { permission: 'report:export', titleKey: 'nav.reports' },
        },
        { path: 'notifications', name: 'notifications', component: NotificationsView, meta: { titleKey: 'nav.notifications' } },
        { path: 'settings', name: 'settings', component: SettingsView, meta: { titleKey: 'nav.settings' } },
      ],
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

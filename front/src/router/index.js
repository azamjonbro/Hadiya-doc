import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UnauthorizedView from '@/views/UnauthorizedView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import CoursesView from '@/views/CoursesView.vue'
import CourseDetailView from '@/views/CourseDetailView.vue'
import VideoPlayerView from '@/views/VideoPlayerView.vue'
import NewsView from '@/views/NewsView.vue'
import NewsDetailView from '@/views/NewsDetailView.vue'
import TasksView from '@/views/TasksView.vue'
import EventsView from '@/views/EventsView.vue'
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
        { path: 'courses', name: 'courses-list', component: CoursesView, meta: { titleKey: 'nav.courses' } },
        { path: 'courses/:id', name: 'course-detail', component: CourseDetailView, meta: { titleKey: 'courses.title' } },
        { path: 'videos/:id', name: 'video-detail', component: VideoPlayerView, meta: { titleKey: 'nav.courses' } },
        { path: 'news', name: 'news-list', component: NewsView, meta: { titleKey: 'nav.news' } },
        { path: 'news/:id', name: 'news-detail', component: NewsDetailView, meta: { titleKey: 'nav.news' } },
        { path: 'tasks', name: 'tasks-list', component: TasksView, meta: { titleKey: 'nav.tasks', permission: 'task:read:own' } },
        { path: 'events', name: 'events-list', component: EventsView, meta: { titleKey: 'nav.events', permission: 'event:read' } },
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
    if (to.name === 'login' && auth.isAuthenticated) return { name: 'dashboard' }
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' }
  }

  return true
})

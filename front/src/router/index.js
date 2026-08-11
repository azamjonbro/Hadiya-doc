import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
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

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: HomeView },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/403', name: 'forbidden', component: ForbiddenView, meta: { public: true } },
    { path: '/401', name: 'unauthorized', component: UnauthorizedView, meta: { public: true } },
    { path: '/courses', name: 'courses-list', component: CoursesView },
    { path: '/courses/:id', name: 'course-detail', component: CourseDetailView },
    { path: '/videos/:id', name: 'video-detail', component: VideoPlayerView },
    { path: '/news', name: 'news-list', component: NewsView },
    { path: '/news/:id', name: 'news-detail', component: NewsDetailView },
    { path: '/tasks', name: 'tasks-list', component: TasksView },
    { path: '/events', name: 'events-list', component: EventsView },
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

  return true
})

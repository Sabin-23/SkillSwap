import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { PublicLayout } from './components/layout/PublicLayout.jsx';
import { GuestOnly, RequireAdmin, RequireUser } from './components/layout/RouteGuards.jsx';
import { Button, Card, Icon } from './components/ui/index.jsx';
import { LandingPage } from './pages/public/LandingPage.jsx';
import { AboutPage, HowItWorksPage } from './pages/public/InfoPages.jsx';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/public/AuthPages.jsx';
import { OnboardingPage } from './pages/app/OnboardingPage.jsx';
import { DashboardPage } from './pages/app/DashboardPage.jsx';
import { EditProfilePage, MyProfilePage } from './pages/app/ProfilePages.jsx';
import { MySkillsPage } from './pages/app/MySkillsPage.jsx';
import { FindPartnerPage, SearchPage } from './pages/app/DiscoverPages.jsx';
import { UserProfilePage } from './pages/app/UserProfilePage.jsx';
import { RequestsPage } from './pages/app/RequestsPage.jsx';
import { SessionsPage } from './pages/app/SessionsPage.jsx';
import { MessagesPage } from './pages/app/MessagesPage.jsx';
import { NotificationsPage } from './pages/app/NotificationsPage.jsx';
import { ReviewsPage } from './pages/app/ReviewsPage.jsx';
import { SettingsPage } from './pages/app/SettingsPage.jsx';
import { PointsPage } from './pages/app/PointsPage.jsx';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.jsx';
import { AdminUserDetailPage, AdminUsersPage } from './pages/admin/AdminUsersPage.jsx';
import { AdminCategoriesPage, AdminSkillsPage } from './pages/admin/AdminCatalogPages.jsx';
import { AdminReportsPage } from './pages/admin/AdminReportsPage.jsx';
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage.jsx';
import { AdminPointsPage } from './pages/admin/AdminPointsPage.jsx';
import { AdminActivityPage } from './pages/admin/AdminActivityPage.jsx';

function NotFoundPage() {
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p className="auth-card__lead">That link does not match any SkillSwap page. Check the address or head back home.</p>
        <Button to="/" icon={<Icon name="home" size={16} />}>
          Back to home
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route element={<GuestOnly />}>
              <Route element={<PublicLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>
            </Route>

            <Route element={<RequireUser />}>
              <Route element={<AppLayout />}>
                <Route path="/app" element={<DashboardPage />} />
                <Route path="/app/onboarding" element={<OnboardingPage />} />
                <Route path="/app/profile" element={<MyProfilePage />} />
                <Route path="/app/profile/edit" element={<EditProfilePage />} />
                <Route path="/app/skills" element={<MySkillsPage />} />
                <Route path="/app/find" element={<FindPartnerPage />} />
                <Route path="/app/search" element={<SearchPage />} />
                <Route path="/app/users/:id" element={<UserProfilePage />} />
                <Route path="/app/requests" element={<RequestsPage />} />
                <Route path="/app/sessions" element={<SessionsPage />} />
                <Route path="/app/messages" element={<MessagesPage />} />
                <Route path="/app/messages/:id" element={<MessagesPage />} />
                <Route path="/app/notifications" element={<NotificationsPage />} />
                <Route path="/app/reviews" element={<ReviewsPage />} />
                <Route path="/app/settings" element={<SettingsPage />} />
                <Route path="/app/points" element={<PointsPage />} />
              </Route>
            </Route>

            <Route element={<RequireAdmin />}>
              <Route element={<AppLayout admin />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
                <Route path="/admin/skills" element={<AdminSkillsPage />} />
                <Route path="/admin/categories" element={<AdminCategoriesPage />} />
                <Route path="/admin/reports" element={<AdminReportsPage />} />
                <Route path="/admin/reviews" element={<AdminReviewsPage />} />
                <Route path="/admin/points" element={<AdminPointsPage />} />
                <Route path="/admin/activity" element={<AdminActivityPage />} />
                <Route path="/admin/settings" element={<SettingsPage admin />} />
              </Route>
            </Route>

            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

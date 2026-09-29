import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, Icon, Input } from '../../components/ui/index.jsx';

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  return null;
}

function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  return { values, errors, setErrors, set };
}

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    if (!validateEmail(form.values.email)) errors.email = 'Enter a valid email address.';
    if (!form.values.password) errors.password = 'Password is required.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    setError(null);
    try {
      const user = await login(form.values);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
      const fallback = user.role === 'ADMIN' ? '/admin' : '/app';
      navigate(location.state?.from && user.role !== 'ADMIN' ? location.state.from : fallback, { replace: true });
    } catch (err) {
      setError(err.message);
      form.setErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Welcome back</h1>
        <p className="auth-card__lead">Log in to continue your skill exchanges.</p>
        {error && (
          <div className="alert alert--danger mb-4" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <form onSubmit={submit} className="stack" noValidate>
          <Input label="Email" type="email" autoComplete="email" value={form.values.email} onChange={form.set('email')} error={form.errors.email} required />
          <Input label="Password" type="password" autoComplete="current-password" value={form.values.password} onChange={form.set('password')} error={form.errors.password} required />
          <div className="row row--between">
            <Link to="/forgot-password" className="small">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" loading={loading} block size="lg">
            Log in
          </Button>
        </form>
        <p className="auth-card__footer">
          New to SkillSwap? <Link to="/register">Create an account</Link>
        </p>
        <div className="auth-demo">
          <strong>Demo accounts</strong> (development seed): <code>amina@skillswap.dev</code>, <code>david@skillswap.dev</code>, admin <code>admin@skillswap.dev</code> — password <code>Password123</code>
        </div>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const form = useForm({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    if (form.values.fullName.trim().length < 2) errors.fullName = 'Please enter your full name.';
    if (!validateEmail(form.values.email)) errors.email = 'Enter a valid email address.';
    const passwordError = validatePassword(form.values.password);
    if (passwordError) errors.password = passwordError;
    if (form.values.password !== form.values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    setError(null);
    try {
      await register({ ...form.values, fullName: form.values.fullName.trim() });
      toast.success('Account created! Let’s set up your profile.');
      navigate('/app/onboarding', { replace: true });
    } catch (err) {
      setError(err.message);
      form.setErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Join SkillSwap</h1>
        <p className="auth-card__lead">Create a free account and start exchanging skills.</p>
        {error && (
          <div className="alert alert--danger mb-4" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <form onSubmit={submit} className="stack" noValidate>
          <Input label="Full name" autoComplete="name" value={form.values.fullName} onChange={form.set('fullName')} error={form.errors.fullName} required />
          <Input label="Email" type="email" autoComplete="email" value={form.values.email} onChange={form.set('email')} error={form.errors.email} required />
          <Input label="Password" type="password" autoComplete="new-password" value={form.values.password} onChange={form.set('password')} error={form.errors.password} hint="At least 8 characters with a letter and a number." required />
          <Input label="Confirm password" type="password" autoComplete="new-password" value={form.values.confirmPassword} onChange={form.set('confirmPassword')} error={form.errors.confirmPassword} required />
          <Button type="submit" loading={loading} block size="lg">
            Create account
          </Button>
        </form>
        <p className="auth-card__footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </Card>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!validateEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResult(await authApi.forgotPassword(email));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Reset your password</h1>
        <p className="auth-card__lead">Enter your email and we will send you a link to choose a new password.</p>
        {result ? (
          <div className="stack">
            <div className="alert alert--success" role="status">
              <Icon name="check" size={18} /> {result.message}
            </div>
            {result.resetUrl && (
              <div className="auth-demo">
                <strong>Development mode:</strong> no email server is configured, so here is your reset link:
                <br />
                <Link to={result.resetUrl.replace(/^https?:\/\/[^/]+/, '')}>Open reset link</Link>
              </div>
            )}
            <Button to="/login" variant="outline" block>
              Back to log in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack" noValidate>
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} required />
            <Button type="submit" loading={loading} block size="lg">
              Send reset link
            </Button>
            <p className="auth-card__footer">
              <Link to="/login">Back to log in</Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    const passwordError = validatePassword(form.values.password);
    if (passwordError) errors.password = passwordError;
    if (form.values.password !== form.values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.resetPassword({ token, ...form.values });
      toast.success(data.message);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
      form.setErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Choose a new password</h1>
        <p className="auth-card__lead">Pick something strong that you do not use elsewhere.</p>
        {!token && (
          <div className="alert alert--warning mb-4" role="alert">
            <Icon name="alert" size={18} /> This reset link is missing its token. Please request a new one.
          </div>
        )}
        {error && (
          <div className="alert alert--danger mb-4" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <form onSubmit={submit} className="stack" noValidate>
          <Input label="New password" type="password" autoComplete="new-password" value={form.values.password} onChange={form.set('password')} error={form.errors.password} hint="At least 8 characters with a letter and a number." required />
          <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.values.confirmPassword} onChange={form.set('confirmPassword')} error={form.errors.confirmPassword} required />
          <Button type="submit" loading={loading} block size="lg" disabled={!token}>
            Reset password
          </Button>
        </form>
        <p className="auth-card__footer">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </Card>
    </div>
  );
}

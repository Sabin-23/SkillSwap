import { SiteFooter } from '../../components/layout/PublicLayout.jsx';
import { Button, Icon } from '../../components/ui/index.jsx';

export function AboutPage() {
  return (
    <>
      <section className="section">
        <div className="container container--narrow">
          <span className="eyebrow">About SkillSwap</span>
          <h1>Everyone has something to teach.</h1>
          <p className="hero__lead">
            SkillSwap is an online skill-exchange platform. It connects people who want to teach a skill with people who want to learn it, without money changing
            hands.
          </p>
          <div className="grid grid--2 mt-5">
            <div className="feature">
              <span className="feature__icon">
                <Icon name="heart" />
              </span>
              <h3>Our mission</h3>
              <p>Make learning accessible by turning the knowledge people already have into a shared resource. A designer can learn to code; a developer can learn to design.</p>
            </div>
            <div className="feature">
              <span className="feature__icon">
                <Icon name="coins" />
              </span>
              <h3>SkillSwap Points</h3>
              <p>
                Teaching earns points; learning spends them. Points keep exchanges balanced, have no monetary value, cannot be bought or withdrawn, and only move when a session is
                actually completed.
              </p>
            </div>
            <div className="feature">
              <span className="feature__icon">
                <Icon name="shield" />
              </span>
              <h3>Trust and safety</h3>
              <p>Every completed exchange can be reviewed. Members can report problems and a moderation team investigates, with the power to refund points, remove content or suspend accounts.</p>
            </div>
            <div className="feature">
              <span className="feature__icon">
                <Icon name="users" />
              </span>
              <h3>Community first</h3>
              <p>Online or in person, one-to-one sessions build real connections. Many members end up trading several skills over time.</p>
            </div>
          </div>
          <div className="mt-5 row">
            <Button to="/register">Join SkillSwap</Button>
            <Button to="/how-it-works" variant="outline">
              See how it works
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

const STEPS = [
  { icon: 'user', title: 'Register and complete your profile', text: 'Add a photo, a short bio, your location and preferred learning format. New members receive a welcome bonus of SkillSwap Points.' },
  { icon: 'book', title: 'Add your skills', text: 'List the skills you can teach and the skills you want to learn. Skills come from a shared catalogue so matching stays accurate.' },
  { icon: 'users', title: 'Find a skill partner', text: 'Browse suggestions ranked by compatibility, or search by skill, category, location and format.' },
  { icon: 'swap', title: 'Send an exchange request', text: 'Choose the skill and session duration. The point cost is reserved from your balance and the teacher is notified.' },
  { icon: 'check', title: 'Teacher accepts', text: 'The teacher reviews your request and accepts or declines. Declined requests refund your points immediately.' },
  { icon: 'calendar', title: 'Schedule the session', text: 'Agree on a date, time and format. Add a meeting link or a physical location. Reschedule if plans change.' },
  { icon: 'message', title: 'Chat and prepare', text: 'Use private messaging with your partner once a request exists between you.' },
  { icon: 'coins', title: 'Complete and earn', text: 'After the session, mark it complete. Reserved points transfer to the teacher and both of you can leave a review.' },
];

export function HowItWorksPage() {
  return (
    <>
      <section className="section">
        <div className="container container--narrow">
          <span className="eyebrow">How it works</span>
          <h1>From first request to finished exchange</h1>
          <p className="hero__lead">Here is the complete SkillSwap journey, step by step.</p>
          <div className="stack mt-5">
            {STEPS.map((step, index) => (
              <div className="feature row row--start row--nowrap" key={step.title} style={{ gap: 20 }}>
                <span className="feature__icon" style={{ marginBottom: 0 }}>
                  <Icon name={step.icon} />
                </span>
                <div>
                  <h3>
                    {index + 1}. {step.title}
                  </h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="feature mt-5">
            <h3>Point pricing</h3>
            <p>Session costs are set by the platform based on duration, for example 30 minutes = 5 points and 60 minutes = 10 points. Teachers receive the full amount when the session is completed.</p>
            <p>Points are never charged for scheduling alone. If a session is cancelled or a request is rejected, reserved points return to the learner.</p>
          </div>
          <div className="mt-5">
            <Button to="/register" size="lg">
              Start swapping skills
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

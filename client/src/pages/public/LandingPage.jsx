import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { skillsApi } from '../../api/index.js';
import { SiteFooter } from '../../components/layout/PublicLayout.jsx';
import { Avatar, Button, Icon, StarRating } from '../../components/ui/index.jsx';

const STEPS = [
  { title: 'Create your profile', text: 'Tell the community what you can teach and what you would love to learn.' },
  { title: 'Find your match', text: 'SkillSwap suggests partners whose skills complement yours, close to you or online.' },
  { title: 'Exchange knowledge', text: 'Send a request, schedule a session, meet, and share what you know.' },
  { title: 'Grow together', text: 'Complete the exchange, leave a review and earn SkillSwap Points to keep learning.' },
];

const TESTIMONIALS = [
  { name: 'Amina U.', role: 'Designer · Kigali', rating: 5, text: 'I taught branding basics and finally learned JavaScript from a patient developer. The point system keeps everything fair.' },
  { name: 'Kwame M.', role: 'Data analyst · Accra', rating: 5, text: 'Teaching Python to marketers sharpened my own explanations, and I picked up public speaking in exchange.' },
  { name: 'Grace W.', role: 'Language teacher · Nairobi', rating: 4, text: 'The matching suggestions were spot on. Two sessions in and my travel photos already look better.' },
];

export function LandingPage() {
  const [skills, setSkills] = useState([]);

  useEffect(() => {
    skillsApi
      .list({ sort: 'popular', limit: 12 })
      .then((data) => setSkills(data.items))
      .catch(() => setSkills([]));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div>
            <span className="eyebrow">Skill exchange, made simple</span>
            <h1>
              Learn a Skill. <span>Share a Skill.</span>
            </h1>
            <p className="hero__lead">Connect with people who can teach what you want to learn while sharing what you know.</p>
            <div className="hero__actions">
              <Button to="/app/search" size="lg" icon={<Icon name="search" size={18} />}>
                Find a Skill
              </Button>
              <Button to="/register" size="lg" variant="outline">
                Join SkillSwap
              </Button>
            </div>
            <div className="hero__stats">
              <div>
                <strong>1:1</strong>
                <span>Personal sessions</span>
              </div>
              <div>
                <strong>0 €</strong>
                <span>Pay with points, not money</span>
              </div>
              <div>
                <strong>Online &amp; local</strong>
                <span>Learn the way you prefer</span>
              </div>
            </div>
          </div>
          <div className="hero__visual" aria-hidden="true">
            <div className="swap-card">
              <Avatar name="Amina Uwase" size={44} />
              <div className="swap-card__body">
                <strong>Amina teaches Graphic Design</strong>
                <span>wants to learn JavaScript</span>
              </div>
              <span className="swap-card__arrow">
                <Icon name="swap" size={18} />
              </span>
            </div>
            <div className="swap-card">
              <Avatar name="David Mugisha" size={44} />
              <div className="swap-card__body">
                <strong>David teaches JavaScript</strong>
                <span>wants to learn Graphic Design</span>
              </div>
              <span className="match-chip match-chip--great" style={{ marginLeft: 'auto' }}>
                <Icon name="sparkles" size={12} /> Great Match
              </span>
            </div>
            <div className="swap-card">
              <span className="stat-card__icon stat-card__icon--accent">
                <Icon name="coins" size={20} />
              </span>
              <div className="swap-card__body">
                <strong>60-minute session · 10 SkillSwap Points</strong>
                <span>Teach to earn, spend to learn</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--muted" id="how-it-works">
        <div className="container">
          <div className="section__title">
            <span className="eyebrow">How SkillSwap works</span>
            <h2>Four simple steps from “I wish I could” to “I can”.</h2>
          </div>
          <div className="grid grid--4">
            {STEPS.map((step, index) => (
              <div className="feature" key={step.title}>
                <span className="feature__step">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__title">
            <span className="eyebrow">Discover skills</span>
            <h2>Popular skills people are teaching right now</h2>
            <p>Every skill comes from our community. Pick one and see who can teach it.</p>
          </div>
          <div className="skill-cloud">
            {skills.length ? (
              skills.map((skill) => (
                <Link key={skill.id} to={`/app/search?skillId=${skill.id}`}>
                  {skill.name}
                </Link>
              ))
            ) : (
              ['Programming', 'Graphic Design', 'Photography', 'French', 'Cooking', 'Public Speaking'].map((name) => (
                <Link key={name} to={`/app/search?q=${encodeURIComponent(name)}`}>
                  {name}
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="section section--muted">
        <div className="container grid grid--3">
          <div className="feature">
            <span className="feature__icon">
              <Icon name="users" />
            </span>
            <h3>Find your match</h3>
            <p>Our matching looks at what you teach, what you want to learn, your preferred format and location to suggest great partners.</p>
          </div>
          <div className="feature">
            <span className="feature__icon">
              <Icon name="calendar" />
            </span>
            <h3>Exchange knowledge</h3>
            <p>Request a session, agree on a time, meet online or in person, then mark it complete. Points move only when the session happens.</p>
          </div>
          <div className="feature">
            <span className="feature__icon">
              <Icon name="shield" />
            </span>
            <h3>Safe and fair</h3>
            <p>Reviews, reporting and a moderation team keep the community welcoming. SkillSwap Points have no cash value and cannot be bought.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__title">
            <span className="eyebrow">Reviews</span>
            <h2>What members say</h2>
          </div>
          <div className="grid grid--3">
            {TESTIMONIALS.map((item) => (
              <blockquote className="testimonial" key={item.name}>
                <StarRating value={item.rating} size={14} />
                <p>“{item.text}”</p>
                <footer>
                  <Avatar name={item.name} size={32} />
                  <span>
                    <strong>{item.name}</strong> · {item.role}
                  </span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta">
            <h2>Ready to swap skills?</h2>
            <p>Create a free account, list what you know, and start learning from real people this week.</p>
            <Button to="/register" size="lg" variant="white">
              Join SkillSwap
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

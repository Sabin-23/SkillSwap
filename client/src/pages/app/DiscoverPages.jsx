import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { matchesApi, skillsApi, usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { RequestDialog } from '../../components/domain/RequestDialog.jsx';
import { UserCard } from '../../components/domain/UserCard.jsx';
import { Button, EmptyState, ErrorMessage, Icon, Input, PageHeader, PageLoader, Pagination, Select, SkillTag, Tabs } from '../../components/ui/index.jsx';

function useFilters(defaults) {
  const [params, setParams] = useSearchParams();
  const filters = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (params.has(key)) filters[key] = params.get(key);
  }
  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }
  return [filters, update];
}

function DiscoveryFilters({ filters, update, categories, showCompatibility, showSort = true }) {
  const [query, setQuery] = useState(filters.q);
  const [location, setLocation] = useState(filters.location);
  const debouncedQuery = useDebouncedValue(query);
  const debouncedLocation = useDebouncedValue(location);

  useEffect(() => {
    if (debouncedQuery !== filters.q) update({ q: debouncedQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);
  useEffect(() => {
    if (debouncedLocation !== filters.location) update({ location: debouncedLocation });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation]);
  useEffect(() => setQuery(filters.q), [filters.q]);

  return (
    <div className="filter-bar" role="search">
      <Input className="filter-bar__search" label="Search" type="search" placeholder="Skill, name or location…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Select label="Category" value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })} placeholder="All categories">
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Select label="Learning format" value={filters.format} onChange={(e) => update({ format: e.target.value })} placeholder="Any format">
        <option value="ONLINE">Online</option>
        <option value="IN_PERSON">In person</option>
        <option value="EITHER">Either</option>
      </Select>
      <Input label="Location" type="search" placeholder="City" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Select label="Minimum rating" value={filters.minRating} onChange={(e) => update({ minRating: e.target.value })} placeholder="Any rating">
        <option value="4">4+ stars</option>
        <option value="3">3+ stars</option>
      </Select>
      {showCompatibility && (
        <Select label="Compatibility" value={filters.compatibility} onChange={(e) => update({ compatibility: e.target.value })} placeholder="Any">
          <option value="teaches_what_i_want">Teaches what I want</option>
          <option value="wants_what_i_teach">Wants what I teach</option>
          <option value="mutual">Mutual match</option>
        </Select>
      )}
      {showSort && (
        <Select label="Sort by" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="match">Best match</option>
          <option value="rating">Highest rated</option>
          <option value="newest">Newest members</option>
          <option value="name">Name</option>
        </Select>
      )}
    </div>
  );
}

const DEFAULTS = { q: '', categoryId: '', format: '', location: '', minRating: '', compatibility: '', sort: 'match', page: '1', skillId: '', skillType: 'TEACHES' };

export function FindPartnerPage() {
  const { user } = useAuth();
  const [filters, update] = useFilters(DEFAULTS);
  const [categories, setCategories] = useState([]);
  const [requestTarget, setRequestTarget] = useState(null);

  useEffect(() => {
    skillsApi.categories().then((data) => setCategories(data.items)).catch(() => {});
  }, []);

  const { data, loading, error, reload } = useAsync(() => matchesApi.list(filters), [JSON.stringify(filters)]);
  const noSkills = !user.skills.teaches.length && !user.skills.wantsToLearn.length;

  return (
    <div>
      <PageHeader title="Find a Skill Partner" subtitle="People whose skills complement yours, ranked by compatibility." />
      {noSkills && (
        <div className="alert alert--info mb-4">
          <Icon name="info" size={18} />
          <span>
            Add skills you teach and want to learn to see personalised matches. <a href="/app/skills">Manage my skills</a>
          </span>
        </div>
      )}
      <DiscoveryFilters filters={filters} update={update} categories={categories} showCompatibility />
      {loading && !data ? (
        <PageLoader label="Finding your matches…" />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : data.items.length ? (
        <>
          <p className="muted small mb-3">{data.pagination.total} potential partner{data.pagination.total === 1 ? '' : 's'} found</p>
          <div className="grid grid--auto">
            {data.items.map((candidate) => (
              <UserCard key={candidate.id} user={candidate} onRequest={setRequestTarget} />
            ))}
          </div>
          <Pagination pagination={data.pagination} onPageChange={(page) => update({ page })} />
        </>
      ) : (
        <EmptyState icon="users" title="No skill partners found yet." message="Try widening your filters, or add more skills to your profile to unlock new matches." action={<Button to="/app/search" variant="outline">Browse all members</Button>} />
      )}
      <RequestDialog open={Boolean(requestTarget)} onClose={() => setRequestTarget(null)} partner={requestTarget} onSent={() => reload({ silent: true })} />
    </div>
  );
}

export function SearchPage() {
  const [filters, update] = useFilters({ ...DEFAULTS, sort: 'rating', tab: 'people' });
  const [categories, setCategories] = useState([]);
  const [requestTarget, setRequestTarget] = useState(null);
  const tab = filters.tab;

  useEffect(() => {
    skillsApi.categories().then((data) => setCategories(data.items)).catch(() => {});
  }, []);

  const people = useAsync(() => (tab === 'people' ? usersApi.discover(filters) : Promise.resolve(null)), [JSON.stringify(filters)]);
  const skills = useAsync(() => (tab === 'skills' ? skillsApi.list({ q: filters.q, categoryId: filters.categoryId, sort: 'popular', limit: 50 }) : Promise.resolve(null)), [tab, filters.q, filters.categoryId]);
  const activeSkill = useAsync(() => (filters.skillId ? skillsApi.get(filters.skillId) : Promise.resolve(null)), [filters.skillId]);

  return (
    <div>
      <PageHeader title="Browse Skills" subtitle="Search the catalogue and discover who can teach what you want to learn." />
      <Tabs
        active={tab}
        onChange={(value) => update({ tab: value })}
        tabs={[
          { value: 'people', label: 'People' },
          { value: 'skills', label: 'Skills' },
        ]}
      />
      <DiscoveryFilters filters={filters} update={update} categories={categories} showSort={tab === 'people'} />
      {filters.skillId && activeSkill.data?.skill && (
        <div className="alert alert--info mb-4">
          <Icon name="filter" size={18} />
          <span>
            Showing people who {filters.skillType === 'WANTS_TO_LEARN' ? 'want to learn' : 'teach'} <strong>{activeSkill.data.skill.name}</strong>.
          </span>
          <button type="button" className="link-button small" style={{ marginLeft: 'auto' }} onClick={() => update({ skillId: '', skillType: '' })}>
            Clear
          </button>
        </div>
      )}

      {tab === 'people' &&
        (people.loading && !people.data ? (
          <PageLoader label="Searching…" />
        ) : people.error ? (
          <ErrorMessage error={people.error} onRetry={people.reload} />
        ) : people.data?.items.length ? (
          <>
            <p className="muted small mb-3">{people.data.pagination.total} member{people.data.pagination.total === 1 ? '' : 's'} found</p>
            <div className="grid grid--auto">
              {people.data.items.map((candidate) => (
                <UserCard key={candidate.id} user={candidate} onRequest={setRequestTarget} />
              ))}
            </div>
            <Pagination pagination={people.data.pagination} onPageChange={(page) => update({ page })} />
          </>
        ) : (
          <EmptyState icon="search" title="No members match your search." message="Try a different skill name or clear some filters." />
        ))}

      {tab === 'skills' &&
        (skills.loading && !skills.data ? (
          <PageLoader label="Loading skills…" />
        ) : skills.error ? (
          <ErrorMessage error={skills.error} onRetry={skills.reload} />
        ) : skills.data?.items.length ? (
          <div className="grid grid--3">
            {skills.data.items.map((skill) => (
              <div className="card card--padded" key={skill.id}>
                <div className="row row--between">
                  <h3 style={{ margin: 0 }}>{skill.name}</h3>
                  {skill.category && <SkillTag skill={{ name: skill.category.name }} tone="neutral" />}
                </div>
                <p className="muted small mt-2">{skill.description || 'No description yet.'}</p>
                <p className="small mt-2">
                  <strong>{skill.teacherCount}</strong> teacher{skill.teacherCount === 1 ? '' : 's'} · <strong>{skill.learnerCount}</strong> learner{skill.learnerCount === 1 ? '' : 's'}
                </p>
                <div className="row mt-3">
                  <Button size="sm" onClick={() => update({ tab: 'people', skillId: skill.id, skillType: 'TEACHES', q: '' })} disabled={!skill.teacherCount}>
                    Find teachers
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => update({ tab: 'people', skillId: skill.id, skillType: 'WANTS_TO_LEARN', q: '' })} disabled={!skill.learnerCount}>
                    Find learners
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="book" title="No skills found." message="Try another search term or category." />
        ))}

      <RequestDialog open={Boolean(requestTarget)} onClose={() => setRequestTarget(null)} partner={requestTarget} onSent={() => people.reload({ silent: true })} />
    </div>
  );
}

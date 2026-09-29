import { useEffect, useState } from 'react';
import { skillsApi } from '../../api/index.js';
import { useDebouncedValue } from '../../hooks/useAsync.js';
import { Icon, Input, Select, Spinner } from '../ui/index.jsx';

/**
 * Searchable list of platform skills. `excludeIds` are shown disabled.
 */
export function SkillPicker({ onPick, excludeIds = [], picking }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounced = useDebouncedValue(query, 250);

  useEffect(() => {
    skillsApi.categories().then((data) => setCategories(data.items)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    skillsApi
      .list({ q: debounced, categoryId, limit: 50 })
      .then((data) => {
        if (!cancelled) {
          setSkills(data.items);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, categoryId]);

  const excluded = new Set(excludeIds);

  return (
    <div>
      <div className="form-grid">
        <Input label="Search skills" type="search" placeholder="e.g. Graphic Design" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="All categories">
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="skill-picker__results" role="listbox" aria-label="Available skills">
        {loading && !skills.length ? (
          <div className="page-loader" style={{ padding: 20 }}>
            <Spinner size={22} />
          </div>
        ) : error ? (
          <p className="text-danger small" style={{ padding: 12 }}>
            {error}
          </p>
        ) : skills.length === 0 ? (
          <p className="muted small" style={{ padding: 12 }}>
            No skills match “{query}”. Try another search or ask an administrator to add it.
          </p>
        ) : (
          skills.map((skill) => {
            const disabled = excluded.has(skill.id);
            return (
              <button key={skill.id} type="button" className="skill-picker__item" onClick={() => onPick(skill)} disabled={disabled || picking === skill.id} role="option" aria-selected={disabled}>
                <span>
                  <strong>{skill.name}</strong>
                  {skill.category && <small> · {skill.category.name}</small>}
                </span>
                {disabled ? <small>Added</small> : picking === skill.id ? <Spinner size={14} /> : <Icon name="plus" size={16} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

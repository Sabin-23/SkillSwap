import { useState } from 'react';
import { adminApi, skillsApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, Modal, PageHeader, PageLoader, Pagination, Select, Textarea } from '../../components/ui/index.jsx';

export function AdminSkillsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const categories = useAsync(() => skillsApi.categories(), []);
  const list = useAsync(() => adminApi.skills({ q, status, page, includeInactive: 'true' }), [q, status, page]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', categoryId: '', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [removing, setRemoving] = useState(null);

  function openCreate() {
    setEditing('new');
    setForm({ name: '', description: '', categoryId: '', status: 'ACTIVE' });
    setError(null);
    setFieldErrors({});
  }
  function openEdit(skill) {
    setEditing(skill);
    setForm({ name: skill.name, description: skill.description || '', categoryId: skill.category?.id ? String(skill.category.id) : '', status: skill.status });
    setError(null);
    setFieldErrors({});
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const payload = { name: form.name, description: form.description || null, categoryId: form.categoryId ? Number(form.categoryId) : null, status: form.status };
    try {
      if (editing === 'new') await skillsApi.create(payload);
      else await skillsApi.update(editing.id, payload);
      toast.success(editing === 'new' ? 'Skill added.' : 'Skill updated.');
      setEditing(null);
      list.reload({ silent: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fields || {});
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    try {
      const result = await skillsApi.remove(removing.id);
      toast.success(result.deactivated ? `${removing.name} was deactivated because it is used in exchanges.` : `${removing.name} was deleted.`);
      list.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <PageHeader title="Manage Skills" subtitle="The catalogue members pick from when they add teaching and learning skills." actions={<Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>Add skill</Button>} />
      <div className="filter-bar">
        <Input className="filter-bar__search" label="Search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Skill name" />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status">
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>
      {list.loading && !list.data ? (
        <PageLoader />
      ) : list.error ? (
        <ErrorMessage error={list.error} onRetry={list.reload} />
      ) : list.data.items.length ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Category</th>
                  <th>Teachers</th>
                  <th>Learners</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((skill) => (
                  <tr key={skill.id}>
                    <td>
                      <strong>{skill.name}</strong>
                      {skill.description && <div className="small muted">{skill.description}</div>}
                    </td>
                    <td>{skill.category?.name || '—'}</td>
                    <td>{skill.teacherCount}</td>
                    <td>{skill.learnerCount}</td>
                    <td>
                      <Badge status={skill.status} />
                    </td>
                    <td>
                      <div className="table__actions">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(skill)} icon={<Icon name="edit" size={14} />} aria-label={`Edit ${skill.name}`} />
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(skill)} icon={<Icon name="trash" size={14} />} aria-label={`Delete ${skill.name}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon="book" title="No skills found." />
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a skill' : `Edit ${editing?.name}`} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="skill-form" loading={saving}>Save</Button></>}>
        {error && <div className="alert alert--danger mb-4">{error}</div>}
        <form id="skill-form" onSubmit={save} className="stack">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fieldErrors.name} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={fieldErrors.description} maxLength={500} />
          <Select label="Category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} placeholder="Uncategorised">
            {(categories.data?.items || []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </form>
      </Modal>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={confirmRemove} title={`Remove ${removing?.name}?`} message="If the skill is used in any exchange it will be deactivated instead of deleted." confirmLabel="Remove" danger />
    </div>
  );
}

export function AdminCategoriesPage() {
  const toast = useToast();
  const list = useAsync(() => skillsApi.categories(), []);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);

  function openCreate() {
    setEditing('new');
    setForm({ name: '', description: '' });
    setError(null);
  }
  function openEdit(category) {
    setEditing(category);
    setForm({ name: category.name, description: category.description || '' });
    setError(null);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') await skillsApi.createCategory(form);
      else await skillsApi.updateCategory(editing.id, form);
      toast.success(editing === 'new' ? 'Category added.' : 'Category updated.');
      setEditing(null);
      list.reload({ silent: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    try {
      await skillsApi.removeCategory(removing.id);
      toast.success('Category removed. Skills in it are now uncategorised.');
      list.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <PageHeader title="Manage Categories" subtitle="Group the skill catalogue so members can browse by topic." actions={<Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>Add category</Button>} />
      {list.loading ? (
        <PageLoader />
      ) : list.error ? (
        <ErrorMessage error={list.error} onRetry={list.reload} />
      ) : (
        <div className="grid grid--3">
          {list.data.items.map((category) => (
            <Card key={category.id}>
              <div className="row row--between">
                <h3 style={{ margin: 0 }}>{category.name}</h3>
                <Badge tone="neutral">{category.skillCount} skill{category.skillCount === 1 ? '' : 's'}</Badge>
              </div>
              <p className="muted small mt-2">{category.description || 'No description.'}</p>
              <div className="row mt-3">
                <Button size="sm" variant="ghost" onClick={() => openEdit(category)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(category)}>Delete</Button>
              </div>
            </Card>
          ))}
          {!list.data.items.length && <EmptyState icon="tag" title="No categories yet." />}
        </div>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a category' : 'Edit category'} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="cat-form" loading={saving}>Save</Button></>}>
        {error && <div className="alert alert--danger mb-4">{error}</div>}
        <form id="cat-form" className="stack" onSubmit={save}>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
        </form>
      </Modal>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={confirmRemove} title={`Delete ${removing?.name}?`} message="Skills in this category stay in the catalogue; they simply become uncategorised." confirmLabel="Delete" danger />
    </div>
  );
}

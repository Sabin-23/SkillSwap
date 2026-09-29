import { useState } from 'react';
import { usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { SkillPicker } from '../../components/domain/SkillPicker.jsx';
import { Button, Card, ConfirmDialog, Icon, Modal, PageHeader, SkillTag, Tabs } from '../../components/ui/index.jsx';

export function MySkillsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [pickerType, setPickerType] = useState(null);
  const [picking, setPicking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [tab, setTab] = useState('TEACHES');

  const teaches = user.skills.teaches;
  const learns = user.skills.wantsToLearn;

  async function addSkill(skill) {
    setPicking(skill.id);
    try {
      await usersApi.addSkill(user.id, { skillId: skill.id, type: pickerType });
      await refresh();
      toast.success(`${skill.name} added to ${pickerType === 'TEACHES' ? 'skills you teach' : 'skills you want to learn'}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPicking(null);
    }
  }

  async function confirmRemove() {
    const { skill, type } = removing;
    try {
      await usersApi.removeSkill(user.id, skill.id, type);
      await refresh();
      toast.success(`${skill.name} removed.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  }

  const activeList = tab === 'TEACHES' ? teaches : learns;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="My Skills"
        subtitle="Skills you teach earn you points; skills you want to learn help us find your matches."
        actions={
          <Button onClick={() => setPickerType(tab)} icon={<Icon name="plus" size={16} />}>
            Add {tab === 'TEACHES' ? 'teaching' : 'learning'} skill
          </Button>
        }
      />
      <Card>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { value: 'TEACHES', label: 'Skills I teach', count: teaches.length },
            { value: 'WANTS_TO_LEARN', label: 'Skills I want to learn', count: learns.length },
          ]}
        />
        {activeList.length ? (
          <div className="list-plain">
            {activeList.map((skill) => (
              <div className="list-item" key={skill.id}>
                <span className={`stat-card__icon stat-card__icon--${tab === 'TEACHES' ? 'primary' : 'accent'}`}>
                  <Icon name="book" size={18} />
                </span>
                <div className="list-item__body">
                  <strong>{skill.name}</strong>
                  <span>{skill.category?.name || 'Uncategorised'}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRemoving({ skill, type: tab })} icon={<Icon name="trash" size={16} />}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state empty-state--compact">
            <span className="empty-state__icon">
              <Icon name="book" size={24} />
            </span>
            <h3>{tab === 'TEACHES' ? 'You have not added any teaching skills.' : 'You have not added any skills to learn.'}</h3>
            <p>{tab === 'TEACHES' ? 'Add a skill you can teach to start receiving requests and earning points.' : 'Add a skill you want to learn to find compatible teachers.'}</p>
            <Button variant="outline" onClick={() => setPickerType(tab)} icon={<Icon name="plus" size={16} />}>
              Add a skill
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid--2">
        <Card>
          <h3>Teaching</h3>
          <div className="skill-list">{teaches.length ? teaches.map((s) => <SkillTag key={s.id} skill={s} tone="teach" onRemove={(skill) => setRemoving({ skill, type: 'TEACHES' })} />) : <span className="faint small">None yet</span>}</div>
        </Card>
        <Card>
          <h3>Learning</h3>
          <div className="skill-list">{learns.length ? learns.map((s) => <SkillTag key={s.id} skill={s} tone="learn" onRemove={(skill) => setRemoving({ skill, type: 'WANTS_TO_LEARN' })} />) : <span className="faint small">None yet</span>}</div>
        </Card>
      </div>

      <Modal open={Boolean(pickerType)} onClose={() => setPickerType(null)} title={pickerType === 'TEACHES' ? 'Add a skill you teach' : 'Add a skill you want to learn'} description="Skills come from the SkillSwap catalogue." size="lg">
        <SkillPicker onPick={addSkill} excludeIds={[...teaches, ...learns].map((s) => s.id)} picking={picking} />
      </Modal>

      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={confirmRemove} title={`Remove ${removing?.skill.name}?`} message="Existing exchange requests for this skill are not affected." confirmLabel="Remove" danger />
    </div>
  );
}

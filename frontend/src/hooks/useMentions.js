import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';

const HASHTAG_TYPE_OPTIONS = [
  { name: 'todo', detail: 'Task for you' },
  { name: 'followup', detail: 'Check on with someone' },
  { name: 'reminder', detail: 'Time-sensitive' },
  { name: 'discussion', detail: 'Share with someone' },
  { name: 'goal', detail: 'Long-horizon objective' },
  { name: 'note', detail: 'General info' },
];

export function useMentions() {
  const peopleRef = useRef([]);
  const projectsRef = useRef([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mentionStartPos = useRef(null);
  const mentionPrefix = useRef(null); // '@' or '#'
  const lastMentionState = useRef(false);

  useEffect(() => {
    api.listPeople().then(p => { peopleRef.current = p; }).catch(() => {});
    api.listProjects().then(p => { projectsRef.current = p; }).catch(() => {});
  }, []);

  const refreshLists = useCallback(async () => {
    const [p, pr] = await Promise.all([
      api.listPeople().catch(() => []),
      api.listProjects().catch(() => []),
    ]);
    peopleRef.current = p;
    projectsRef.current = pr;
  }, []);

  const buildAtResults = useCallback((query) => {
    const results = [];
    for (const p of peopleRef.current) {
      if (p.display_name.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)) {
        results.push({ type: 'person', id: p.id, name: p.display_name, fullName: p.name, detail: p.role || '', prefix: '@' });
      }
    }
    for (const p of projectsRef.current) {
      if (p.name.toLowerCase().includes(query) || (p.short_code || '').toLowerCase().includes(query)) {
        results.push({ type: 'project', id: p.id, name: p.name, detail: p.short_code || '', prefix: '@' });
      }
    }
    return results.slice(0, 8);
  }, []);

  const buildHashResults = useCallback((query) => {
    // # only shows type tags — people/projects are via @ only
    const results = [];
    for (const item of HASHTAG_TYPE_OPTIONS) {
      if (!query || item.name.includes(query)) {
        results.push({ type: 'type', id: item.name, name: item.name, detail: item.detail, prefix: '#' });
      }
    }
    return results.slice(0, 15);
  }, []);

  const updateMention = useCallback(async (text, cursorPos) => {
    const before = text.slice(0, cursorPos);

    // Check for @ or # trigger
    let triggerIndex = -1;
    let prefix = null;
    const atIndex = before.lastIndexOf('@');
    const hashIndex = before.lastIndexOf('#');

    // Pick the closest trigger to cursor
    if (atIndex > hashIndex) {
      triggerIndex = atIndex;
      prefix = '@';
    } else if (hashIndex > atIndex) {
      triggerIndex = hashIndex;
      prefix = '#';
    } else if (atIndex === hashIndex && atIndex >= 0) {
      triggerIndex = atIndex;
      prefix = '@';
    }

    if (triggerIndex === -1 || (triggerIndex > 0 && before[triggerIndex - 1] !== ' ' && before[triggerIndex - 1] !== '\n' && triggerIndex !== 0)) {
      setMentionQuery(null);
      setMentionResults([]);
      lastMentionState.current = false;
      return;
    }

    const query = before.slice(triggerIndex + 1).toLowerCase();

    if (query.includes(' ')) {
      setMentionQuery(null);
      setMentionResults([]);
      lastMentionState.current = false;
      return;
    }

    if (!lastMentionState.current) {
      await refreshLists();
      lastMentionState.current = true;
    }

    mentionStartPos.current = triggerIndex;
    mentionPrefix.current = prefix;
    setMentionQuery(query);
    setSelectedIndex(0);
    setMentionResults(prefix === '@' ? buildAtResults(query) : buildHashResults(query));
  }, [refreshLists, buildAtResults, buildHashResults]);

  const selectMention = useCallback((text, item) => {
    const triggerIndex = mentionStartPos.current;
    const prefix = mentionPrefix.current || '@';
    if (triggerIndex === null) return text;
    const before = text.slice(0, triggerIndex);
    const afterTrigger = text.slice(triggerIndex + 1);
    const spaceIdx = afterTrigger.indexOf(' ');
    const after = spaceIdx >= 0 ? afterTrigger.slice(spaceIdx) : '';
    const insertName = item.prefix === '#' ? item.name.replace(/\s+/g, '') : item.name.replace(/\s+/g, '');
    const newText = `${before}${prefix}${insertName}${after ? after : ' '}`;
    setMentionQuery(null);
    setMentionResults([]);
    lastMentionState.current = false;
    return newText;
  }, []);

  const handleMentionKey = useCallback((e, text, setText) => {
    if (mentionQuery === null || mentionResults.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, mentionResults.length - 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && mentionResults.length > 0)) {
      e.preventDefault();
      const selected = mentionResults[selectedIndex];
      if (selected) {
        const newText = selectMention(text, selected);
        setText(newText);
      }
      return true;
    }
    if (e.key === 'Escape') {
      setMentionQuery(null);
      setMentionResults([]);
      lastMentionState.current = false;
      return true;
    }
    return false;
  }, [mentionQuery, mentionResults, selectedIndex, selectMention]);

  const isActive = mentionQuery !== null && mentionResults.length > 0;

  return {
    mentionResults,
    selectedIndex,
    isActive,
    updateMention,
    selectMention,
    handleMentionKey,
    setMentionQuery,
    setMentionResults,
  };
}

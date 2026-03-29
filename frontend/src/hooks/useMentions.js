import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

export function useMentions() {
  const peopleRef = useRef([]);
  const projectsRef = useRef([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mentionStartPos = useRef(null);
  const lastMentionState = useRef(false);

  // Load on mount
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

  const buildResults = useCallback((query) => {
    const results = [];
    for (const p of peopleRef.current) {
      if (p.display_name.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)) {
        results.push({ type: 'person', id: p.id, name: p.display_name, fullName: p.name, detail: p.role || '' });
      }
    }
    for (const p of projectsRef.current) {
      if (p.name.toLowerCase().includes(query) || (p.short_code || '').toLowerCase().includes(query)) {
        results.push({ type: 'project', id: p.id, name: p.name, detail: p.short_code || '' });
      }
    }
    return results.slice(0, 8);
  }, []);

  const updateMention = useCallback(async (text, cursorPos) => {
    const before = text.slice(0, cursorPos);
    const atIndex = before.lastIndexOf('@');

    if (atIndex === -1 || (atIndex > 0 && before[atIndex - 1] !== ' ' && before[atIndex - 1] !== '\n')) {
      if (atIndex === -1 || (atIndex > 0 && before[atIndex - 1] !== ' ')) {
        setMentionQuery(null);
        setMentionResults([]);
        lastMentionState.current = false;
        return;
      }
    }

    const query = before.slice(atIndex + 1).toLowerCase();

    if (query.includes(' ')) {
      setMentionQuery(null);
      setMentionResults([]);
      lastMentionState.current = false;
      return;
    }

    // Refresh lists when @ is first typed
    if (!lastMentionState.current) {
      await refreshLists();
      lastMentionState.current = true;
    }

    mentionStartPos.current = atIndex;
    setMentionQuery(query);
    setSelectedIndex(0);
    setMentionResults(buildResults(query));
  }, [refreshLists, buildResults]);

  const selectMention = useCallback((text, item) => {
    const atIndex = mentionStartPos.current;
    if (atIndex === null) return text;
    const before = text.slice(0, atIndex);
    const afterAt = text.slice(atIndex + 1);
    const spaceIdx = afterAt.indexOf(' ');
    const after = spaceIdx >= 0 ? afterAt.slice(spaceIdx) : '';
    const newText = `${before}@${item.name.replace(/\s+/g, '')}${after ? after : ' '}`;
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

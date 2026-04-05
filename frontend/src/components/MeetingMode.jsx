import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Legacy MeetingMode — redirects to the new /meetings/:id flow.
 * Creates a meeting session with the person/project pre-populated, then navigates.
 */
export default function MeetingMode() {
  const { type, id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        // Check for active meeting first
        const active = await api.getActiveMeeting();
        if (active && active.id) {
          // If there's already an active meeting, navigate to it
          navigate(`/meetings/${active.id}`, { replace: true });
          return;
        }

        const isPerson = type === 'person';
        let entity;
        if (isPerson) {
          entity = await api.getPerson(id);
        } else {
          entity = await api.getProject(id);
        }

        const session = await api.startMeeting({
          title: isPerson
            ? `Meeting with ${entity.display_name}`
            : `${entity.name} Meeting`,
          person_id: isPerson ? id : undefined,
          project_id: isPerson ? undefined : id,
          attendee_ids: isPerson ? [id] : [],
        });

        navigate(`/meetings/${session.id}`, { replace: true });
      } catch (e) {
        if (e.message.includes('409')) {
          // Active session exists — try to force-end and retry
          await api.forceEndActiveMeeting();
          try {
            const isPerson = type === 'person';
            let entity;
            if (isPerson) {
              entity = await api.getPerson(id);
            } else {
              entity = await api.getProject(id);
            }
            const session = await api.startMeeting({
              title: isPerson
                ? `Meeting with ${entity.display_name}`
                : `${entity.name} Meeting`,
              person_id: isPerson ? id : undefined,
              project_id: isPerson ? undefined : id,
              attendee_ids: isPerson ? [id] : [],
            });
            navigate(`/meetings/${session.id}`, { replace: true });
          } catch {
            navigate('/meetings', { replace: true });
          }
        } else {
          navigate('/meetings', { replace: true });
        }
      }
    };
    init();
  }, [type, id, navigate]);

  return <div className="p-8 text-zinc-600">Starting meeting...</div>;
}

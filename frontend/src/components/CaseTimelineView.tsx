import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Timeline } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import { Calendar, Clock, FileText } from 'lucide-react';

interface EventItem {
  id: number;
  name: string;
  type: string;
  date: string | null;
  sourceDocument: string;
}

interface CaseTimelineViewProps {
  caseId: string;
}

export default function CaseTimelineView({ caseId }: CaseTimelineViewProps) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<Timeline | null>(null);

  useEffect(() => {
    fetchTimeline();
  }, [caseId]);

  const fetchTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<EventItem[]>(`/api/cases/${caseId}/timeline`);
      setEvents(res.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load case timeline events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!containerRef.current || events.length === 0) return;

    const items = events.map((ev) => ({
      id: ev.id,
      content: `<div style="font-size: 11px; font-weight: 700; color: #881337;">${ev.name}</div><div style="font-size: 10px; color: #475569;">📄 ${ev.sourceDocument}</div>`,
      start: ev.date ? new Date(ev.date) : new Date(),
      title: `Event: ${ev.name}\nDate: ${ev.date ? new Date(ev.date).toLocaleString() : 'N/A'}\nSource Document: ${ev.sourceDocument}`,
    }));

    const options = {
      width: '100%',
      height: '240px',
      selectable: true,
      margin: { item: 15 },
      showCurrentTime: false,
    };

    if (timelineInstanceRef.current) {
      timelineInstanceRef.current.destroy();
    }

    timelineInstanceRef.current = new Timeline(containerRef.current, items, options);

    return () => {
      if (timelineInstanceRef.current) {
        timelineInstanceRef.current.destroy();
        timelineInstanceRef.current = null;
      }
    };
  }, [events]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-8 h-8 border-4 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium">Building chronological case timeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-sm">
        {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
        <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900 mb-1">No Timeline Events Found</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          No EVENT entities with dates were extracted from this case's documents yet. Upload FIR reports or investigation statements to populate the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Interactive Vis-Timeline Canvas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-rose-600" />
          <h3 className="text-sm font-bold text-gray-900">Chronological Event Map (vis-timeline)</h3>
        </div>
        <div ref={containerRef} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50" />
      </div>

      {/* Detailed Chronological Event List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          Case Events Breakdown ({events.length})
        </h3>

        <div className="relative border-l-2 border-rose-200 ml-4 space-y-6">
          {events.map((event) => (
            <div key={event.id} className="relative pl-6">
              {/* Timeline Bullet Node */}
              <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-rose-600 border-2 border-white shadow-sm flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Event Card */}
              <div className="bg-rose-50/50 hover:bg-rose-50 border border-rose-100 rounded-xl p-4 transition-colors">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-1">
                  <h4 className="text-sm font-bold text-rose-950">{event.name}</h4>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    {event.date ? new Date(event.date).toLocaleString() : 'Date Undefined'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold">Source Document:</span>
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-[11px]">
                    {event.sourceDocument}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

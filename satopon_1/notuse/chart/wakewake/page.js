'use client'
import { useTimelineLogic } from './useTimelineLogic';
import TimelineUI from './TimelineUI';

export default function Page() {
  const timeline = useTimelineLogic();
  return <TimelineUI {...timeline} />;
}


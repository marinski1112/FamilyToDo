export interface ScheduledDispatchPlan {
  fiveMinuteCore: boolean;
  googleTasksInbound: boolean;
  calendarWatchRenewal: boolean;
  hourlyCleanup: boolean;
  dailyNotificationAudit: boolean;
}

const EMPTY_PLAN: ScheduledDispatchPlan = {
  fiveMinuteCore: false,
  googleTasksInbound: false,
  calendarWatchRenewal: false,
  hourlyCleanup: false,
  dailyNotificationAudit: false,
};

export function scheduledDispatchPlanAt(scheduledTime: number): ScheduledDispatchPlan {
  if (!Number.isFinite(scheduledTime)) return { ...EMPTY_PLAN };

  const instant = new Date(scheduledTime);
  if (Number.isNaN(instant.getTime())) return { ...EMPTY_PLAN };

  const minute = instant.getUTCMinutes();
  const hour = instant.getUTCHours();

  return {
    fiveMinuteCore: minute % 5 === 0,
    googleTasksInbound: minute % 5 === 3,
    calendarWatchRenewal: minute === 7 || minute === 37,
    hourlyCleanup: minute === 17,
    dailyNotificationAudit: hour === 18 && minute === 29,
  };
}

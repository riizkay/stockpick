type TaskRunner = () => void | Promise<void>;

type SchedulePart = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

type TimeConstraint = {
  startMinutes: number;
  endMinutes: number;
};

type CronFieldRange = {
  start: number;
  end: number;
};

type ParsedCron = {
  minute: (value: number) => boolean;
  hour: (value: number) => boolean;
  dayOfMonth: (value: number) => boolean;
  month: (value: number) => boolean;
  weekday: (value: number) => boolean;
};

const SECOND = 1000;
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const WEEKDAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function getWeekdayNumber(name: string): number {
  const number = WEEKDAY_NAME_TO_NUMBER[name];
  if (number === undefined) {
    throw new Error(`Hari tidak valid: ${name}`);
  }
  return number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseHourMinute(input: string): { hour: number; minute: number } {
  const raw = input.trim();
  const [hourRaw, minuteRaw] = raw.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Format waktu tidak valid: ${input}`);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Waktu di luar rentang: ${input}`);
  }
  return { hour, minute };
}

function toMinutes(time: string): number {
  const { hour, minute } = parseHourMinute(time);
  return hour * 60 + minute;
}

function isInRange(current: number, start: number, end: number): boolean {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getDateParts(date: Date, timezone: string): SchedulePart {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const data: Partial<SchedulePart> = {};

  for (const part of parts) {
    if (part.type === "year") data.year = Number(part.value);
    if (part.type === "month") data.month = Number(part.value);
    if (part.type === "day") data.day = Number(part.value);
    if (part.type === "hour") data.hour = Number(part.value);
    if (part.type === "minute") data.minute = Number(part.value);
    if (part.type === "second") data.second = Number(part.value);
    if (part.type === "weekday") {
      const short = part.value.toLowerCase();
      if (short.startsWith("sun")) data.weekday = 0;
      if (short.startsWith("mon")) data.weekday = 1;
      if (short.startsWith("tue")) data.weekday = 2;
      if (short.startsWith("wed")) data.weekday = 3;
      if (short.startsWith("thu")) data.weekday = 4;
      if (short.startsWith("fri")) data.weekday = 5;
      if (short.startsWith("sat")) data.weekday = 6;
    }
  }

  const result: SchedulePart = {
    year: data.year ?? 1970,
    month: data.month ?? 1,
    day: data.day ?? 1,
    hour: data.hour ?? 0,
    minute: data.minute ?? 0,
    second: data.second ?? 0,
    weekday: data.weekday ?? 0,
  };

  return result;
}

function parseCronSegment(segment: string, range: CronFieldRange): (value: number) => boolean {
  const normalized = segment.trim();
  if (normalized === "*") return () => true;

  const segments = normalized.split(",");
  const matchers = segments.map((item) => {
    const token = item.trim();
    const [base, stepRaw] = token.split("/");
    const step = stepRaw !== undefined ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Step cron tidak valid: ${token}`);
    }

    if (base === "*") {
      return (value: number) => value >= range.start && value <= range.end && (value - range.start) % step === 0;
    }

    if (base.includes("-")) {
      const [startRaw, endRaw] = base.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Range cron tidak valid: ${token}`);
      }
      return (value: number) => value >= start && value <= end && (value - start) % step === 0;
    }

    const exact = Number(base);
    if (!Number.isInteger(exact)) {
      throw new Error(`Nilai cron tidak valid: ${token}`);
    }
    return (value: number) => value === exact;
  });

  return (value: number) => {
    if (value < range.start || value > range.end) return false;
    return matchers.some((matcher) => matcher(value));
  };
}

function parseCronExpression(expression: string): ParsedCron {
  const rawParts = expression.trim().split(/\s+/);
  if (rawParts.length !== 5) {
    throw new Error("Cron harus 5 kolom: minute hour day month weekday");
  }

  return {
    minute: parseCronSegment(rawParts[0], { start: 0, end: 59 }),
    hour: parseCronSegment(rawParts[1], { start: 0, end: 23 }),
    dayOfMonth: parseCronSegment(rawParts[2], { start: 1, end: 31 }),
    month: parseCronSegment(rawParts[3], { start: 1, end: 12 }),
    weekday: parseCronSegment(rawParts[4], { start: 0, end: 6 }),
  };
}

class ScheduledTask {
  private taskName: string;
  private runner: TaskRunner;
  private currentTimezone = DEFAULT_TIMEZONE;
  private frequencyMatcher: (parts: SchedulePart) => boolean = (parts) => parts.second === 0;
  private dayConstraints = new Set<number>();
  private onlyWeekdays = false;
  private onlyWeekends = false;
  private betweenConstraint: TimeConstraint | null = null;
  private unlessBetweenConstraint: TimeConstraint | null = null;
  private lastRunStamp: string | null = null;

  constructor(taskName: string, runner: TaskRunner) {
    this.taskName = taskName;
    this.runner = runner;
  }

  private withMatcher(matcher: (parts: SchedulePart) => boolean): this {
    this.frequencyMatcher = matcher;
    return this;
  }

  private setExactTime(hour: number, minute: number): (parts: SchedulePart) => boolean {
    return (parts) => parts.second === 0 && parts.hour === hour && parts.minute === minute;
  }

  private setHourlyMinute(minute: number): (parts: SchedulePart) => boolean {
    return (parts) => parts.second === 0 && parts.minute === minute;
  }

  private setEveryNMinutes(step: number): (parts: SchedulePart) => boolean {
    return (parts) => parts.second === 0 && parts.minute % step === 0;
  }

  private setEveryNHours(step: number, minute: number): (parts: SchedulePart) => boolean {
    return (parts) => parts.second === 0 && parts.minute === minute && parts.hour % step === 0;
  }

  private setEveryNOddHours(minute: number): (parts: SchedulePart) => boolean {
    return (parts) => parts.second === 0 && parts.minute === minute && parts.hour % 2 === 1;
  }

  private canRunByConstraint(parts: SchedulePart): boolean {
    if (this.onlyWeekdays && (parts.weekday === 0 || parts.weekday === 6)) return false;
    if (this.onlyWeekends && parts.weekday >= 1 && parts.weekday <= 5) return false;

    if (this.dayConstraints.size > 0 && !this.dayConstraints.has(parts.weekday)) return false;

    const currentMinutes = parts.hour * 60 + parts.minute;
    if (this.betweenConstraint) {
      if (!isInRange(currentMinutes, this.betweenConstraint.startMinutes, this.betweenConstraint.endMinutes)) {
        return false;
      }
    }
    if (this.unlessBetweenConstraint) {
      if (isInRange(currentMinutes, this.unlessBetweenConstraint.startMinutes, this.unlessBetweenConstraint.endMinutes)) {
        return false;
      }
    }

    return true;
  }

  private runStamp(parts: SchedulePart): string {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}-${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }

  async tryRun(date: Date): Promise<void> {
    const parts = getDateParts(date, this.currentTimezone);
    if (!this.frequencyMatcher(parts)) return;
    if (!this.canRunByConstraint(parts)) return;

    const stamp = this.runStamp(parts);
    if (this.lastRunStamp === stamp) return;
    this.lastRunStamp = stamp;

    try {
      await this.runner();
    } catch (error) {
      console.error(`[scheduler] task ${this.taskName} gagal:`, error);
    }
  }

  cron(expression: string): this {
    const parsed = parseCronExpression(expression);
    return this.withMatcher((parts) => {
      if (parts.second !== 0) return false;
      return (
        parsed.minute(parts.minute) &&
        parsed.hour(parts.hour) &&
        parsed.dayOfMonth(parts.day) &&
        parsed.month(parts.month) &&
        parsed.weekday(parts.weekday)
      );
    });
  }

  everySecond(): this {
    return this.withMatcher(() => true);
  }

  everyTwoSeconds(): this {
    return this.withMatcher((parts) => parts.second % 2 === 0);
  }

  everyFiveSeconds(): this {
    return this.withMatcher((parts) => parts.second % 5 === 0);
  }

  everyTenSeconds(): this {
    return this.withMatcher((parts) => parts.second % 10 === 0);
  }

  everyFifteenSeconds(): this {
    return this.withMatcher((parts) => parts.second % 15 === 0);
  }

  everyTwentySeconds(): this {
    return this.withMatcher((parts) => parts.second % 20 === 0);
  }

  everyThirtySeconds(): this {
    return this.withMatcher((parts) => parts.second % 30 === 0);
  }

  everyMinute(): this {
    return this.withMatcher((parts) => parts.second === 0);
  }

  everyTwoMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(2));
  }

  everyThreeMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(3));
  }

  everyFourMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(4));
  }

  everyFiveMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(5));
  }

  everyTenMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(10));
  }

  everyFifteenMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(15));
  }

  everyThirtyMinutes(): this {
    return this.withMatcher(this.setEveryNMinutes(30));
  }

  hourly(): this {
    return this.withMatcher(this.setHourlyMinute(0));
  }

  hourlyAt(minute: number): this {
    return this.withMatcher(this.setHourlyMinute(minute));
  }

  everyOddHour(minutes = 0): this {
    return this.withMatcher(this.setEveryNOddHours(minutes));
  }

  everyTwoHours(minutes = 0): this {
    return this.withMatcher(this.setEveryNHours(2, minutes));
  }

  everyThreeHours(minutes = 0): this {
    return this.withMatcher(this.setEveryNHours(3, minutes));
  }

  everyFourHours(minutes = 0): this {
    return this.withMatcher(this.setEveryNHours(4, minutes));
  }

  everySixHours(minutes = 0): this {
    return this.withMatcher(this.setEveryNHours(6, minutes));
  }

  daily(): this {
    return this.withMatcher(this.setExactTime(0, 0));
  }

  dailyAt(time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(this.setExactTime(hour, minute));
  }

  twiceDaily(firstHour: number, secondHour: number): this {
    return this.withMatcher(
      (parts) => parts.second === 0 && parts.minute === 0 && (parts.hour === firstHour || parts.hour === secondHour)
    );
  }

  twiceDailyAt(firstHour: number, secondHour: number, minute: number): this {
    return this.withMatcher(
      (parts) => parts.second === 0 && parts.minute === minute && (parts.hour === firstHour || parts.hour === secondHour)
    );
  }

  daysOfMonth(days: number[]): this {
    return this.withMatcher((parts) => parts.second === 0 && parts.minute === 0 && parts.hour === 0 && days.includes(parts.day));
  }

  weekly(): this {
    return this.withMatcher((parts) => parts.second === 0 && parts.minute === 0 && parts.hour === 0 && parts.weekday === 0);
  }

  weeklyOn(day: number, time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(
      (parts) => parts.second === 0 && parts.weekday === day && parts.hour === hour && parts.minute === minute
    );
  }

  monthly(): this {
    return this.withMatcher((parts) => parts.second === 0 && parts.minute === 0 && parts.hour === 0 && parts.day === 1);
  }

  monthlyOn(dayOfMonth: number, time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(
      (parts) => parts.second === 0 && parts.day === dayOfMonth && parts.hour === hour && parts.minute === minute
    );
  }

  twiceMonthly(firstDay: number, secondDay: number, time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(
      (parts) =>
        parts.second === 0 &&
        parts.hour === hour &&
        parts.minute === minute &&
        (parts.day === firstDay || parts.day === secondDay)
    );
  }

  lastDayOfMonth(time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher((parts) => {
      const lastDay = getLastDayOfMonth(parts.year, parts.month);
      return parts.second === 0 && parts.hour === hour && parts.minute === minute && parts.day === lastDay;
    });
  }

  quarterly(): this {
    return this.withMatcher(
      (parts) => parts.second === 0 && parts.minute === 0 && parts.hour === 0 && parts.day === 1 && [1, 4, 7, 10].includes(parts.month)
    );
  }

  quarterlyOn(dayOfQuarter: number, time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(
      (parts) =>
        parts.second === 0 &&
        parts.hour === hour &&
        parts.minute === minute &&
        parts.day === dayOfQuarter &&
        [1, 4, 7, 10].includes(parts.month)
    );
  }

  yearly(): this {
    return this.withMatcher((parts) => parts.second === 0 && parts.minute === 0 && parts.hour === 0 && parts.day === 1 && parts.month === 1);
  }

  yearlyOn(month: number, day: number, time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(
      (parts) =>
        parts.second === 0 && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute
    );
  }

  timezone(timezone: string): this {
    this.currentTimezone = timezone;
    return this;
  }

  weekdays(): this {
    this.onlyWeekdays = true;
    this.onlyWeekends = false;
    return this;
  }

  weekends(): this {
    this.onlyWeekends = true;
    this.onlyWeekdays = false;
    return this;
  }

  sundays(): this {
    this.dayConstraints.add(getWeekdayNumber("sunday"));
    return this;
  }

  mondays(): this {
    this.dayConstraints.add(getWeekdayNumber("monday"));
    return this;
  }

  tuesdays(): this {
    this.dayConstraints.add(getWeekdayNumber("tuesday"));
    return this;
  }

  wednesdays(): this {
    this.dayConstraints.add(getWeekdayNumber("wednesday"));
    return this;
  }

  thursdays(): this {
    this.dayConstraints.add(getWeekdayNumber("thursday"));
    return this;
  }

  fridays(): this {
    this.dayConstraints.add(getWeekdayNumber("friday"));
    return this;
  }

  saturdays(): this {
    this.dayConstraints.add(getWeekdayNumber("saturday"));
    return this;
  }

  days(days: number[]): this {
    for (const day of days) {
      this.dayConstraints.add(day);
    }
    return this;
  }

  between(startTime: string, endTime: string): this {
    this.betweenConstraint = {
      startMinutes: toMinutes(startTime),
      endMinutes: toMinutes(endTime),
    };
    return this;
  }

  unlessBetween(startTime: string, endTime: string): this {
    this.unlessBetweenConstraint = {
      startMinutes: toMinutes(startTime),
      endMinutes: toMinutes(endTime),
    };
    return this;
  }

  at(time: string): this {
    const { hour, minute } = parseHourMinute(time);
    return this.withMatcher(this.setExactTime(hour, minute));
  }
}

export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  call(task: TaskRunner, name = "anonymous-task"): ScheduledTask {
    const scheduleTask = new ScheduledTask(name, task);
    this.tasks.push(scheduleTask);
    return scheduleTask;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = new Date();
      for (const task of this.tasks) {
        void task.tryRun(now);
      }
    }, SECOND);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  getTaskCount(): number {
    return this.tasks.length;
  }
}

export const Schedule = new Scheduler();

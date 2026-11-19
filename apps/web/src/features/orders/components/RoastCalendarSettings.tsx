import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type ApiError, toApiError } from '@/shared/api/errors';
import { formatBusinessDate, isBusinessDateString, todayInSydney } from '@/shared/lib/dates';
import { describeApiError } from '@/shared/lib/form-errors';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import {
  closuresQuery,
  roastCalendarQuery,
  useCreateClosure,
  useDeleteClosure,
  useSaveRoastCalendar,
} from '../queries';
import type { RoastCalendar } from '../types';

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
] as const;

type DayField = 'roastDays' | 'deliveryDays' | 'businessDays';

const DAY_GROUPS: { field: DayField; legend: string }[] = [
  { field: 'roastDays', legend: 'Roast days' },
  { field: 'deliveryDays', legend: 'Delivery days' },
  { field: 'businessDays', legend: 'Business days (used to count the cut-off and delivery lag)' },
];

export function RoastCalendarSettings() {
  const query = useQuery(roastCalendarQuery());
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Roast calendar" />
      <p className="max-w-2xl text-sm text-muted-foreground">
        These are working defaults until the roaster confirms them. They decide the suggested roast
        and delivery dates on new orders. Existing orders keep their dates.
      </p>
      <QueryView
        query={query}
        loadingLabel="Loading roast calendar"
        notFound={<p>Roast calendar not found.</p>}
      >
        {(calendar) => <CalendarForm key={calendar.updatedAt} calendar={calendar} />}
      </QueryView>
      <Closures />
    </div>
  );
}

function CalendarForm({ calendar }: { calendar: RoastCalendar }) {
  const save = useSaveRoastCalendar();
  const [days, setDays] = useState<Record<DayField, number[]>>({
    roastDays: calendar.roastDays,
    deliveryDays: calendar.deliveryDays,
    businessDays: calendar.businessDays,
  });
  const [cutoffTime, setCutoffTime] = useState(calendar.cutoffTime);
  const [lead, setLead] = useState(String(calendar.cutoffLeadBusinessDays));
  const [lag, setLag] = useState(String(calendar.deliveryLagBusinessDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(field: DayField, day: number, on: boolean) {
    setSaved(false);
    setDays((current) => ({
      ...current,
      [field]: on ? [...current[field], day].sort() : current[field].filter((d) => d !== day),
    }));
  }

  async function onSubmit() {
    setSaved(false);
    setFormError(null);
    const found: Record<string, string> = {};
    for (const { field, legend } of DAY_GROUPS) {
      if (days[field].length === 0)
        found[field] = `Choose at least one day for ${legend.split(' (')[0].toLowerCase()}`;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime))
      found.cutoffTime = 'Enter a time such as 12:00';
    for (const [key, value] of [
      ['cutoffLeadBusinessDays', lead],
      ['deliveryLagBusinessDays', lag],
    ] as const) {
      if (!/^\d+$/.test(value) || Number(value) > 14)
        found[key] = 'Enter a whole number of days from 0 to 14';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      await save.mutateAsync({
        ...days,
        cutoffTime,
        cutoffLeadBusinessDays: Number(lead),
        deliveryLagBusinessDays: Number(lag),
      });
      setSaved(true);
    } catch (error) {
      const apiError: ApiError = toApiError(error);
      const next: Record<string, string> = {};
      for (const fieldError of apiError.fieldErrors) next[fieldError.field] = fieldError.message;
      setErrors(next);
      if (apiError.fieldErrors.length === 0) setFormError(describeApiError(apiError));
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="flex max-w-3xl flex-col gap-5"
    >
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <AlertDescription role="status">Roast calendar saved.</AlertDescription>
        </Alert>
      )}
      {DAY_GROUPS.map(({ field, legend }) => (
        <fieldset key={field} className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{legend}</legend>
          <div className="flex flex-wrap gap-x-5">
            {WEEKDAYS.map(({ value, label }) => (
              <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={days[field].includes(value)}
                  onChange={(e) => toggle(field, value, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          {errors[field] && (
            <p role="alert" className="text-sm text-destructive">
              {errors[field]}
            </p>
          )}
        </fieldset>
      ))}
      <div className="grid gap-5 md:grid-cols-3">
        <Field id="cutoffTime" label="Cut-off time (Sydney)" required error={errors.cutoffTime}>
          <Input
            className="h-10"
            type="time"
            value={cutoffTime}
            onChange={(e) => setCutoffTime(e.target.value)}
          />
        </Field>
        <Field
          id="cutoffLead"
          label="Cut-off, business days before roast"
          required
          error={errors.cutoffLeadBusinessDays}
        >
          <Input
            className="h-10"
            type="number"
            min={0}
            max={14}
            step={1}
            value={lead}
            onChange={(e) => setLead(e.target.value)}
          />
        </Field>
        <Field
          id="deliveryLag"
          label="Delivery, business days after roast"
          required
          error={errors.deliveryLagBusinessDays}
        >
          <Input
            className="h-10"
            type="number"
            min={0}
            max={14}
            step={1}
            value={lag}
            onChange={(e) => setLag(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save calendar'}
        </Button>
      </div>
    </form>
  );
}

function Closures() {
  const today = todayInSydney();
  const query = useQuery(closuresQuery(today));
  const create = useCreateClosure();
  const remove = useDeleteClosure();
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function add() {
    const found: Record<string, string> = {};
    if (!isBusinessDateString(date)) found.date = 'Enter a date';
    if (!description.trim()) found.description = 'Enter a description, such as "Christmas Day"';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      await create.mutateAsync({ date, description: description.trim() });
      setDate('');
      setDescription('');
    } catch (error) {
      const apiError = toApiError(error);
      const next: Record<string, string> = {};
      for (const fieldError of apiError.fieldErrors) next[fieldError.field] = fieldError.message;
      if (apiError.code === 'CLOSURE_EXISTS') next.date = 'That day is already a closure day';
      if (Object.keys(next).length === 0) next.date = describeApiError(apiError);
      setErrors(next);
    }
  }

  return (
    <section aria-labelledby="closures-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="closures-heading" className="font-medium">
        Closure days
      </h2>
      <p className="text-sm text-muted-foreground">
        Public holidays and shutdowns. A closure day is not a roast or delivery day, and the cut-off
        moves to the business day before it.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-wrap items-start gap-3"
      >
        <Field id="closure-date" label="Date" className="w-44" error={errors.date}>
          <Input
            className="h-10"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field
          id="closure-description"
          label="Description"
          className="min-w-56 flex-1"
          error={errors.description}
        >
          <Input
            className="h-10"
            maxLength={100}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          variant="secondary"
          className="mt-[1.375rem] h-10"
          disabled={create.isPending}
        >
          Add closure day
        </Button>
      </form>
      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Something went wrong — try again</span>
            <Button size="lg" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !query.data ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading closure days…
        </p>
      ) : query.data.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          No upcoming closure days.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {query.data.map((closure) => (
            <li
              key={closure.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <span>
                <span className="font-medium">{formatBusinessDate(closure.date)}</span> —{' '}
                {closure.description}
              </span>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="lg">
                    Remove<span className="sr-only"> {closure.description}</span>
                  </Button>
                }
                title={`Remove ${closure.description}?`}
                description={`${formatBusinessDate(closure.date)} becomes a normal day again.`}
                confirmLabel="Remove closure day"
                onConfirm={() => remove.mutateAsync(closure.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

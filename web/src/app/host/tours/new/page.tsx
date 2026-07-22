'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { api, fetcher } from '@/lib/api';
import { toast } from 'sonner';
import { TOUR_CATEGORIES } from '@/lib/tour-categories';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Check, AlertCircle, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

/* ── Types ───────────────────────────────────────────────────────────────── */
type ItineraryRow = { hour: number; title: string; description: string; location?: string };
type SplitRow = { vendorType: string; vendorId: string; percentage: number };

type FormValues = {
  // Step 1
  name: string;
  description: string;
  category: string;
  lgaId: string;
  price: number;
  durationHours: number;
  maxGroupSize: number;
  coverImageUrl: string;
  // Step 2
  attractionIds: string;
  propertyId: string;
  eventIds: string;
  transportNote: string;
  // Step 3
  itinerary: ItineraryRow[];
  // Step 4
  splits: SplitRow[];
};

/* ── Field ───────────────────────────────────────────────────────────────── */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1">
          <AlertCircle size={10} />
          {error}
        </p>
      )}
    </div>
  );
}

const INPUT_CLS =
  'w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all min-h-[44px] placeholder-white/30';

const TEXTAREA_CLS =
  'w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all placeholder-white/30 resize-none';

/* ── Step indicators ─────────────────────────────────────────────────────── */
const STEPS = ['Basics', 'Components', 'Itinerary', 'Splits', 'Review'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done
                    ? 'bg-forest border-forest text-white'
                    : active
                    ? 'bg-transparent border-gold text-gold'
                    : 'bg-transparent border-white/20 text-white/30'
                }`}
              >
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span
                className={`text-[10px] font-semibold whitespace-nowrap ${
                  active ? 'text-gold' : done ? 'text-forest-light' : 'text-white/30'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 transition-colors ${
                  done ? 'bg-forest/60' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function NewTourPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Every TourPackage must be tied to the actor's own TourGuide profile
  // (CreateTourPackageDto.tourGuideId is a required @IsUUID field).
  const { data: tourGuide, isLoading: isLoadingGuide, isError: guideError } = useQuery<{ id: string }>({
    queryKey: ['tour-guide-me'],
    queryFn: () => fetcher('/tour-guides/me'),
    enabled: !!session,
    retry: false,
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
    getValues,
    trigger,
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      category: 'HERITAGE',
      lgaId: '',
      price: 0,
      durationHours: 3,
      maxGroupSize: 20,
      coverImageUrl: '',
      attractionIds: '',
      propertyId: '',
      eventIds: '',
      transportNote: '',
      itinerary: [{ hour: 9, title: '', description: '', location: '' }],
      splits: [],
    },
  });

  const {
    fields: itineraryFields,
    append: appendItinerary,
    remove: removeItinerary,
  } = useFieldArray({ control, name: 'itinerary' });

  const {
    fields: splitFields,
    append: appendSplit,
    remove: removeSplit,
  } = useFieldArray({ control, name: 'splits' });

  const splits = watch('splits');
  const splitTotal = splits.reduce((s: number, r: SplitRow) => s + Number(r.percentage || 0), 0);
  const splitOverflow = splitTotal > 100;

  // Draft save
  const saveDraft = useMutation({
    mutationFn: (values: FormValues) => {
      const body = buildPayload(values);
      return api.post('/tour-packages', body).then((r) => r.data);
    },
    onSuccess: (data) => {
      setCreatedId(data.id);
      toast.success('Draft saved!', {
        action: { label: 'View drafts', onClick: () => router.push('/host') },
      });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Save failed.');
    },
  });

  // Submit for review
  const submitForReview = useMutation({
    mutationFn: async (values: FormValues) => {
      let id = createdId;
      if (!id) {
        const body = buildPayload(values);
        const draft = await api.post('/tour-packages', body).then((r) => r.data);
        id = draft.id;
        setCreatedId(id);
      }
      return api.post(`/tour-packages/${id}/submit`).then((r) => r.data);
    },
    onSuccess: () => {
      toast.success('Submitted for review! Our team will approve within 24h.');
      router.push('/host');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Submit failed.');
    },
  });

  function buildPayload(values: FormValues) {
    return {
      name: values.name,
      description: values.description,
      category: values.category,
      lgaId: values.lgaId || undefined,
      tourGuideId: tourGuide?.id,
      price: Number(values.price),
      durationHours: Number(values.durationHours),
      maxGroupSize: Number(values.maxGroupSize),
      coverImageUrl: values.coverImageUrl || undefined,
      attractionIds: values.attractionIds
        ? values.attractionIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      propertyId: values.propertyId || undefined,
      eventIds: values.eventIds
        ? values.eventIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      transportNote: values.transportNote || undefined,
      itineraryTemplate: values.itinerary
        .filter((r) => r.title)
        .map((r) => ({ ...r, hour: Number(r.hour) })),
      settlementSplit: values.splits
        .filter((r) => r.vendorId)
        .map((r) => ({ ...r, percentage: Number(r.percentage) })),
    };
  }

  const nextStep = async () => {
    const fieldsToValidate: (keyof FormValues)[][] = [
      ['name', 'description', 'category', 'price', 'durationHours', 'maxGroupSize'],
      ['attractionIds'],
      ['itinerary'],
      ['splits'],
    ];
    const ok = await trigger(fieldsToValidate[step] as any);
    if (!ok) return;
    setStep((s) => Math.min(s + 1, 4));
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <div className="h-8 w-48 skeleton rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-4 pt-28 text-center">
          <h2 className="text-2xl font-black mb-3">Sign in required</h2>
          <p className="text-white/50 text-sm mb-6">
            You need to be signed in to create a tour package.
          </p>
          <Link
            href="/login?returnTo=/host/tours/new"
            className="inline-flex items-center gap-2 px-6 py-3 btn-forest rounded-xl text-sm font-bold min-h-[44px]"
          >
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  if (isLoadingGuide) {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <div className="h-8 w-48 skeleton rounded-xl" />
      </div>
    );
  }

  if (guideError || !tourGuide?.id) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-4 pt-28 text-center">
          <h2 className="text-2xl font-black mb-3">Tour guide profile required</h2>
          <p className="text-white/50 text-sm mb-6">
            You need an approved tour guide profile before you can create a tour package.
          </p>
          <Link
            href="/become-a-guide"
            className="inline-flex items-center gap-2 px-6 py-3 btn-forest rounded-xl text-sm font-bold min-h-[44px]"
          >
            Become a guide <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const values = getValues();

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-3xl mx-auto px-4 pt-20 pb-20">
          {/* Back */}
          <Link
            href="/host"
            className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-6 transition-colors"
          >
            <ArrowLeft size={12} /> Back to host dashboard
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-2">
              New tour package
            </p>
            <h1 className="text-3xl font-black text-white mb-8">Create a tour</h1>

            <StepBar current={step} />

            <div className="bg-jungle-2/95 border border-white/8 rounded-2xl p-6 md:p-8">
              <AnimatePresence mode="wait">
                {/* ── Step 0: Basics ─────────────────────────── */}
                {step === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <h2 className="text-lg font-extrabold text-white mb-1">Basics</h2>

                    <Field label="Tour name" error={errors.name?.message}>
                      <input
                        {...register('name', { required: 'Name is required' })}
                        placeholder="e.g. Olumo Rock Heritage Walk"
                        className={INPUT_CLS}
                      />
                    </Field>

                    <Field label="Description" error={errors.description?.message}>
                      <textarea
                        {...register('description', {
                          required: 'Description is required',
                        })}
                        rows={4}
                        placeholder="Describe the tour experience…"
                        className={TEXTAREA_CLS}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Category">
                        <select
                          {...register('category')}
                          className={INPUT_CLS + ' cursor-pointer'}
                        >
                          {TOUR_CATEGORIES.filter((c) => c.id !== 'ALL').map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="LGA ID (optional)">
                        <input
                          {...register('lgaId')}
                          placeholder="LGA UUID"
                          className={INPUT_CLS}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Price per person (₦)" error={errors.price?.message}>
                        <input
                          type="number"
                          min={0}
                          {...register('price', { required: 'Price is required', min: 0 })}
                          className={INPUT_CLS}
                        />
                      </Field>

                      <Field label="Duration (hours)" error={errors.durationHours?.message}>
                        <input
                          type="number"
                          min={1}
                          {...register('durationHours', { required: true, min: 1 })}
                          className={INPUT_CLS}
                        />
                      </Field>

                      <Field label="Max group size" error={errors.maxGroupSize?.message}>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          {...register('maxGroupSize', { required: true, min: 1 })}
                          className={INPUT_CLS}
                        />
                      </Field>
                    </div>

                    <Field label="Cover image URL (optional)">
                      <input
                        {...register('coverImageUrl')}
                        placeholder="https://…"
                        className={INPUT_CLS}
                      />
                    </Field>
                  </motion.div>
                )}

                {/* ── Step 1: Components ─────────────────────── */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <h2 className="text-lg font-extrabold text-white mb-1">
                      Tour components
                    </h2>
                    <p className="text-white/50 text-sm">
                      Link existing platform listings that are part of this tour.
                    </p>

                    <Field
                      label="Attraction IDs (comma-separated, min 1)"
                      error={errors.attractionIds?.message}
                    >
                      <input
                        {...register('attractionIds', {
                          required: 'At least one attraction is required',
                          validate: (v) =>
                            v.split(',').filter((s) => s.trim()).length >= 1 ||
                            'At least one attraction ID is required',
                        })}
                        placeholder="uuid1, uuid2, uuid3"
                        className={INPUT_CLS}
                      />
                    </Field>

                    <Field label="Property ID (optional stay/accommodation)">
                      <input
                        {...register('propertyId')}
                        placeholder="Property UUID (optional)"
                        className={INPUT_CLS}
                      />
                    </Field>

                    <Field label="Event IDs (comma-separated, optional)">
                      <input
                        {...register('eventIds')}
                        placeholder="uuid1, uuid2"
                        className={INPUT_CLS}
                      />
                    </Field>

                    <Field label="Transport note (optional)">
                      <textarea
                        {...register('transportNote')}
                        rows={3}
                        placeholder="e.g. Bus departs from Abeokuta MCC at 8am…"
                        className={TEXTAREA_CLS}
                      />
                    </Field>
                  </motion.div>
                )}

                {/* ── Step 2: Itinerary ──────────────────────── */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-extrabold text-white">
                        Day itinerary
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          appendItinerary({ hour: 9, title: '', description: '', location: '' })
                        }
                        className="inline-flex items-center gap-1.5 text-sm text-gold/85 hover:text-gold font-semibold min-h-[44px] px-2"
                      >
                        <Plus size={13} /> Add stop
                      </button>
                    </div>

                    {itineraryFields.length === 0 && (
                      <p className="text-white/40 text-sm text-center py-6">
                        Add at least one itinerary stop.
                      </p>
                    )}

                    <div className="space-y-4">
                      {itineraryFields.map((field, i) => (
                        <div
                          key={field.id}
                          className="bg-jungle-3/60 border border-white/8 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                              Stop {i + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeItinerary(i)}
                              className="text-red-400/60 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="Remove stop"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <Field label="Hour (0-23)">
                              <input
                                type="number"
                                min={0}
                                max={23}
                                {...register(`itinerary.${i}.hour`)}
                                className={INPUT_CLS}
                              />
                            </Field>
                            <div className="col-span-2">
                              <Field label="Title">
                                <input
                                  {...register(`itinerary.${i}.title`, {
                                    required: 'Title required',
                                  })}
                                  placeholder="e.g. Olumo Rock ascent"
                                  className={INPUT_CLS}
                                />
                              </Field>
                            </div>
                          </div>

                          <Field label="Description">
                            <textarea
                              {...register(`itinerary.${i}.description`)}
                              rows={2}
                              placeholder="What happens at this stop…"
                              className={TEXTAREA_CLS}
                            />
                          </Field>

                          <Field label="Location (optional)">
                            <input
                              {...register(`itinerary.${i}.location`)}
                              placeholder="e.g. Olumo Rock, Abeokuta"
                              className={INPUT_CLS}
                            />
                          </Field>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Settlement splits ──────────────── */}
                {step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-extrabold text-white">
                          Settlement splits
                        </h2>
                        <p className="text-white/50 text-sm mt-0.5">
                          Optionally split revenue across vendors. Percentages must not exceed 100%.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          appendSplit({ vendorType: 'ATTRACTION', vendorId: '', percentage: 0 })
                        }
                        className="inline-flex items-center gap-1.5 text-sm text-gold/85 hover:text-gold font-semibold min-h-[44px] px-2"
                      >
                        <Plus size={13} /> Add split
                      </button>
                    </div>

                    {/* Live gauge */}
                    <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                          splitOverflow ? 'bg-red-500' : 'bg-forest'
                        }`}
                        style={{ width: `${Math.min(splitTotal, 100)}%` }}
                      />
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        splitOverflow ? 'text-red-400' : 'text-white/55'
                      }`}
                    >
                      {splitTotal}% allocated
                      {splitOverflow && ' — exceeds 100%, cannot proceed'}
                    </p>

                    <div className="space-y-4">
                      {splitFields.map((field, i) => (
                        <div
                          key={field.id}
                          className="bg-jungle-3/60 border border-white/8 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                              Split {i + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSplit(i)}
                              className="text-red-400/60 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="Remove split"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <Field label="Vendor type">
                              <select
                                {...register(`splits.${i}.vendorType`)}
                                className={INPUT_CLS + ' cursor-pointer'}
                              >
                                <option value="ATTRACTION">Attraction</option>
                                <option value="HOST">Host (property)</option>
                                <option value="ORGANISER">Organiser (event)</option>
                                <option value="GUIDE">Guide</option>
                              </select>
                            </Field>

                            <Field label="Vendor ID">
                              <input
                                {...register(`splits.${i}.vendorId`)}
                                placeholder="UUID"
                                className={INPUT_CLS}
                              />
                            </Field>

                            <Field label="Percentage">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                {...register(`splits.${i}.percentage`)}
                                className={INPUT_CLS}
                              />
                            </Field>
                          </div>
                        </div>
                      ))}

                      {splitFields.length === 0 && (
                        <p className="text-white/40 text-sm text-center py-4">
                          No splits configured — you keep 100% (less platform fee).
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── Step 4: Review ─────────────────────────── */}
                {step === 4 && (
                  <motion.div
                    key="step-4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <h2 className="text-lg font-extrabold text-white">Review &amp; submit</h2>

                    <div className="space-y-3">
                      <ReviewRow label="Name" value={values.name} />
                      <ReviewRow label="Category" value={values.category} />
                      <ReviewRow label="Price" value={`₦${Number(values.price).toLocaleString()} / person`} />
                      <ReviewRow label="Duration" value={`${values.durationHours}h`} />
                      <ReviewRow label="Max group size" value={String(values.maxGroupSize)} />
                      <ReviewRow
                        label="Attractions"
                        value={
                          values.attractionIds
                            ? values.attractionIds.split(',').filter((s) => s.trim()).length + ' linked'
                            : '0 linked'
                        }
                      />
                      <ReviewRow
                        label="Itinerary stops"
                        value={`${values.itinerary.filter((r) => r.title).length} stops`}
                      />
                      <ReviewRow
                        label="Settlement splits"
                        value={
                          values.splits.length
                            ? `${values.splits.length} vendors · ${splitTotal}% allocated`
                            : 'None'
                        }
                      />
                    </div>

                    <div className="pt-5 border-t border-white/8">
                      <p className="text-white/55 text-sm leading-relaxed mb-6">
                        Save as a draft to continue editing later, or submit for review to
                        go live. Our team reviews within 24 hours.
                      </p>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleSubmit((v) => saveDraft.mutate(v))}
                          disabled={saveDraft.isPending || submitForReview.isPending}
                          className="flex-1 min-h-[44px] py-3 bg-jungle-3 border border-white/10 text-white font-bold rounded-xl text-sm hover:bg-jungle-2 transition-colors disabled:opacity-50"
                        >
                          {saveDraft.isPending ? 'Saving…' : 'Save draft'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmit((v) => submitForReview.mutate(v))}
                          disabled={
                            saveDraft.isPending ||
                            submitForReview.isPending ||
                            splitOverflow
                          }
                          className="flex-1 min-h-[44px] py-3 btn-gold text-jungle font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {submitForReview.isPending ? (
                            'Submitting…'
                          ) : (
                            <>
                              Submit for review <ChevronRight size={14} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Nav buttons ─────────────────────────────── */}
              {step < 4 && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/8">
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(s - 1, 0))}
                    disabled={step === 0}
                    className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white font-semibold disabled:opacity-30 min-h-[44px] px-2 transition-colors"
                  >
                    <ArrowLeft size={13} /> Back
                  </button>

                  <button
                    type="button"
                    onClick={nextStep}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 btn-gold rounded-2xl text-sm font-bold min-h-[44px]"
                  >
                    Next <ArrowRight size={13} />
                  </button>
                </div>
              )}

              {step === 4 && (
                <div className="flex justify-start mt-6">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white font-semibold min-h-[44px] px-2 transition-colors"
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </main>
      </PageTransition>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm py-2.5 border-b border-white/6">
      <span className="text-white/45 shrink-0">{label}</span>
      <span className="text-white font-semibold text-right">{value || '—'}</span>
    </div>
  );
}
